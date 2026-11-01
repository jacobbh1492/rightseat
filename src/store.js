import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { fetchMyBookings } from './backend/bookings';
import { fetchLiveListings } from './backend/listings';
import { useAuth } from './backend/auth';
import { CFIS, PLANES, SCHOOLS, SAMPLE_REQUESTS, PILOT, TRAINING, WALLET, THREADS, SYLLABUS, AFFILIATIONS } from './data';
import { quote, scanMessage, hoursUntil, FEES, r2 } from './logic';
import { extract, runChecks, decide, expiryOf, fmt, addMonths, DOC_TYPES } from './verification';
import { allHours, nextLessons, emptyPrior } from './progress';
import { SEED_DEBRIEFS, withLabels, isEmptyDebrief, lockInfo } from './debrief';

const Ctx = createContext(null);
const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function seedRequests() {
  return SAMPLE_REQUESTS.map((r) => {
    const cfi = CFIS.find((c) => c.id === r.cfiId);
    const plane = PLANES.find((p) => p.id === r.planeId);
    const aff = AFFILIATIONS.find((a) => a.cfiId === r.cfiId && a.status === 'active');
    const q = quote({ cfi, plane, flightHours: r.flightHours, groundHours: r.groundHours, repeat: r.repeat, prepaid: r.prepaid, cfiPro: cfi?.pro, method: r.method, affiliation: aff });
    const out = { ...r, total: q.total };
    if (r.seedReceipt) {
      out.receipt = { ...q, hobbsOut: plane.hobbsTotal - 1.5, hobbsIn: plane.hobbsTotal, paidWith: 'Wallet', at: r.date };
      out.reviewedCfi = false;
    }
    return out;
  });
}

function makeDoc(type, ctx, scenario = 'clean', extra = {}) {
  const { fields, confidence } = extract(type, scenario, ctx);
  const checks = runChecks(type, fields, ctx, confidence);
  return { status: 'approved', by: 'auto', fields, checks, confidence, expires: expiryOf(type, fields), submitted: fmt(addMonths(-1)), files: [], ...extra };
}

function seedDocs() {
  const me = { name: PILOT.name, certificate: PILOT.certificate, totalHours: TRAINING.hours.total, dual: TRAINING.hours.dual };
  const p2 = PLANES.find((p) => p.id === 'p2');
  const pc = { name: p2.ownerName, plane: p2 };
  return {
    me: {
      id: makeDoc('id', me),
      pilotCert: makeDoc('pilotCert', me),
      medical: makeDoc('medical', me),
      logbook: makeDoc('logbook', me, 'clean', { selfReported: true }),
    },
    cfi: {},
    p2: {
      registration: makeDoc('registration', pc),
      airworthiness: makeDoc('airworthiness', pc),
      ownerIns: makeDoc('ownerIns', pc),
      annual: makeDoc('annual', pc, 'review', { status: 'review', by: null }),
      hundredHr: makeDoc('hundredHr', pc),
    },
  };
}

function queueItem(id, who, role, type, ctx, scenario, overrides, submitted, target) {
  const ex = extract(type, scenario, ctx);
  const fields = { ...ex.fields, ...(overrides.fields || {}) };
  const confidence = overrides.confidence ?? ex.confidence;
  const checks = runChecks(type, fields, ctx, confidence);
  const d = decide(checks, confidence, false);
  return { id, who, role, type, fields, checks, confidence, reasons: d.reasons, submitted, target, state: 'pending' };
}

function seedQueue() {
  const p2 = PLANES.find((p) => p.id === 'p2');
  const p5 = PLANES.find((p) => p.id === 'p5');
  return [
    queueItem('v1', 'Tom Okafor', 'Instructor', 'cfiIns', { name: 'Tom Okafor' }, 'clean', { fields: { insured: 'Thomas A. Okafor' }, confidence: 0.84 }, '18 min ago', null),
    queueItem('v2', 'Bay Area Flyers Club', 'Aircraft · N7340P', 'annual', { name: 'Bay Area Flyers Club', plane: p2 }, 'review', {}, '2 hrs ago', { key: 'p2', type: 'annual' }),
    queueItem('v3', 'Dana Whitlock', 'New instructor', 'cfiCert', { name: 'Dana Whitlock' }, 'review', {}, '3 hrs ago', null),
    queueItem('v4', 'Kevin Shah', 'Renter', 'medical', { name: 'Kevin Shah' }, 'clean', { confidence: 0.61 }, '5 hrs ago', null),
    queueItem('v5', 'Skyline Aviation', 'Aircraft · N815SR', 'registration', { name: 'Skyline Aviation', plane: p5 }, 'review', {}, 'Yesterday', null),
  ];
}

export function StoreProvider({ children }) {
  const [cfis, setCfis] = useState(CFIS);
  const [planes, setPlanes] = useState(PLANES);
  const [schools, setSchools] = useState(SCHOOLS);
  const [requests, setRequests] = useState(seedRequests);
  const [myCfiId, setMyCfiId] = useState(null);
  const [myPlaneIds, setMyPlaneIds] = useState([]);
  const [mySchoolId, setMySchoolId] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [pilot] = useState(PILOT);
  const [training, setTraining] = useState(() => ({ ...TRAINING, appDone: SYLLABUS.flatMap((x) => x.lessons).slice(0, TRAINING.completed), prior: null, debriefs: SEED_DEBRIEFS.map(withLabels), sharing: { cfiIds: ['c1'], includeDebriefs: true } }));
  const [wallet, setWallet] = useState(WALLET);
  const [threads, setThreads] = useState(THREADS);
  const [plans, setPlans] = useState({ school: null });
  const [payouts, setPayouts] = useState({});
  const timers = useRef([]);
  const [profile, setProfile] = useState({ onboarded: false, roles: [], stage: null, airport: 'KPIE' });
  const [docs, setDocs] = useState(seedDocs);
  const [affiliations, setAffiliations] = useState(AFFILIATIONS);
  const [queue, setQueue] = useState(seedQueue);
  const [automation, setAutomation] = useState({ autoApproved: 412, reviewed: 97, rejected: 14 });

  // Live listings from the database go first; the sample listings stay for browsing.
  const auth = useAuth();
  const refreshListings = async () => {
    const uid = auth?.session?.user?.id || null;
    const { cfis: lc, planes: lp } = await fetchLiveListings(uid);
    setCfis((prev) => [...lc, ...prev.filter((c) => !c.live)]);
    setPlanes((prev) => [...lp, ...prev.filter((p) => !p.live)]);
    // The signed-in user's own live listings become "mine" (edit, dashboards).
    if (uid) {
      if (lc.some((c) => c.id === uid)) setMyCfiId(uid);
      const own = lp.filter((p) => p.ownerId === uid).map((p) => p.id);
      if (own.length) setMyPlaneIds((prev) => [...new Set([...own, ...prev])]);
    }
  };
  useEffect(() => { refreshListings().catch(() => {}); }, [auth?.session?.user?.id]);

  // Live bookings: the student's go into `requests` (Lessons tab), the instructor's
  // and owner's into `teaching` (Lesson requests screen).
  const [teaching, setTeaching] = useState([]);
  const refreshLive = async () => {
    const uid = auth?.session?.user?.id;
    if (!uid) { setTeaching([]); setRequests((prev) => prev.filter((r) => !r.live)); return; }
    const rows = await fetchMyBookings(uid);
    setRequests((prev) => [...rows.filter((r) => r.role === 'student'), ...prev.filter((r) => !r.live)]);
    setTeaching(rows.filter((r) => r.role !== 'student'));
  };
  useEffect(() => { refreshLive().catch(() => {}); }, [auth?.session?.user?.id]);

  const getCfi = (id) => cfis.find((c) => c.id === id);
  const getPlane = (id) => planes.find((p) => p.id === id);
  const getSchool = (id) => schools.find((x) => x.id === id);
  const affiliationFor = (cfiId) => affiliations.find((a) => a.cfiId === cfiId && a.status === 'active');
  const held = requests.filter((r) => r.method === 'wallet' && ['Pending', 'Confirmed'].includes(r.status)).reduce((a, r) => a + (r.total || 0), 0);
  const hasBookingWith = (key) => requests.some((r) => (r.cfiId === key || (!r.cfiId && r.planeId === key)) && ['Confirmed', 'Completed'].includes(r.status));

  const withReview = (item, review) => ({
    ...item,
    reviews: [review, ...(item.reviews || [])],
    rating: +(((item.rating || 0) * (item.reviewCount || 0) + review.rating) / ((item.reviewCount || 0) + 1)).toFixed(2),
    reviewCount: (item.reviewCount || 0) + 1,
  });
  const patchReq = (id, patch) => setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addTx = (label, amount) =>
    setWallet((w) => ({ balance: r2(w.balance + amount), transactions: [{ id: 't' + Date.now() + Math.random(), label, amount, date: today() }, ...w.transactions] }));
  const bumpCfiEarnings = (id, amt) => setCfis((prev) => prev.map((c) => (c.id === id ? { ...c, monthEarnings: r2((c.monthEarnings || 0) + amt) } : c)));

  const value = {
    teaching, refreshLive, refreshListings,
    cfis, planes, schools, requests, myCfiId, myPlaneIds, mySchoolId, favorites, pilot: { ...pilot, totalHours: allHours(training).total },
    training, wallet, held, available: r2(wallet.balance - held), threads, plans, payouts,
    getCfi, getPlane, getSchool, hasBookingWith,
    affiliations,
    affiliationFor,
    // ---- flight school affiliations
    requestAffiliation: ({ cfiId, schoolId, initiatedBy, model, schoolPct, message }) => {
      const school = schools.find((x) => x.id === schoolId);
      setAffiliations((prev) => [
        { id: 'a' + Date.now(), cfiId, schoolId, status: 'pending', initiatedBy, model: model || school.terms.model, schoolPct: schoolPct ?? school.terms.schoolPct, message: message || '', sent: 'Just now' },
        ...prev.filter((a) => !(a.cfiId === cfiId && a.schoolId === schoolId && a.status === 'pending')),
      ]);
    },
    respondAffiliation: (id, accept, terms = {}) => {
      const a = affiliations.find((x) => x.id === id);
      setAffiliations((prev) => prev.map((x) => {
        if (x.id === id) return { ...x, ...terms, status: accept ? 'active' : 'declined', since: accept ? new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : x.since };
        if (accept && x.cfiId === a.cfiId && x.status === 'active') return { ...x, status: 'ended', ended: 'Today' };
        return x;
      }));
      if (accept) setCfis((prev) => prev.map((c) => (c.id === a.cfiId ? { ...c, schoolId: a.schoolId } : c)));
    },
    updateAffiliation: (id, patch) => setAffiliations((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch, changed: 'Today' } : x))),
    endAffiliation: (id) => {
      const a = affiliations.find((x) => x.id === id);
      setAffiliations((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'ended', ended: 'Today' } : x)));
      setCfis((prev) => prev.map((c) => (c.id === a.cfiId && c.schoolId === a.schoolId ? { ...c, schoolId: null } : c)));
    },
    setCfiRate: (cfiId, flightRate) => setCfis((prev) => prev.map((c) => (c.id === cfiId ? { ...c, flightRate } : c))),
    updateSchoolTerms: (schoolId, patch) => setSchools((prev) => prev.map((x) => (x.id === schoolId ? { ...x, terms: { ...x.terms, ...patch } } : x))),
    getRequest: (id) => requests.find((r) => r.id === id),
    cfisForPlane: (planeId) => cfis.filter((c) => c.aircraftIds.includes(planeId)),
    cfisForSchool: (id) => cfis.filter((c) => c.schoolId === id),
    planesForSchool: (id) => planes.filter((p) => p.schoolId === id),

    saveCfi: (cfi) => {
      setCfis((prev) => (prev.some((c) => c.id === cfi.id) ? prev.map((c) => (c.id === cfi.id ? cfi : c)) : [cfi, ...prev]));
      setMyCfiId(cfi.id);
    },
    addPlane: (plane) => {
      const full = { hobbsTotal: 0, next100At: 100, squawks: [], monthEarnings: 0, userListed: true, ...plane };
      setPlanes((prev) => (prev.some((p) => p.id === full.id) ? prev.map((p) => (p.id === full.id ? full : p)) : [full, ...prev]));
      setMyPlaneIds((prev) => (prev.includes(full.id) ? prev : [full.id, ...prev]));
    },
    saveSchool: (school, cfiIds, planeIds) => {
      const full = { terms: { model: 'split', schoolPct: 0.25, minRate: 60, noticeDays: 14 }, monthEarnings: 0, ...schools.find((x) => x.id === school.id), ...school };
      setSchools((prev) => (prev.some((x) => x.id === full.id) ? prev.map((x) => (x.id === full.id ? full : x)) : [full, ...prev]));
      // Instructors aren't linked directly: each one gets an invite they must accept.
      const linked = new Set(affiliations.filter((a) => a.schoolId === full.id && ['active', 'pending'].includes(a.status)).map((a) => a.cfiId));
      setAffiliations((prev) => [
        ...cfiIds.filter((id) => !linked.has(id)).map((cfiId, i) => ({ id: 'a' + Date.now() + i, cfiId, schoolId: full.id, status: 'pending', initiatedBy: 'school', model: full.terms.model, schoolPct: full.terms.schoolPct, message: '', sent: 'Just now' })),
        ...prev,
      ]);
      setPlanes((prev) => prev.map((p) => (planeIds.includes(p.id) ? { ...p, schoolId: school.id, ownerType: 'Flight school', ownerName: school.name } : p.schoolId === school.id ? { ...p, schoolId: null } : p)));
      setMySchoolId(school.id);
    },
    toggleFavorite: (id) => setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),

    // ---- bookings
    addRequest: (r) => setRequests((prev) => [r, ...prev]),
    updateRequest: patchReq,
    cancelRequest: (id, reason) => {
      const r = requests.find((x) => x.id === id);
      const cfi = getCfi(r.cfiId);
      const late = hoursUntil(r.when) < 24;
      const free = reason !== 'Personal / schedule change' || !late;
      const fee = free || !cfi ? 0 : r2(cfi.flightRate * r.flightHours * FEES.lateCancel);
      patchReq(id, { status: 'Cancelled', cancel: { reason, fee, late } });
      if (fee > 0) {
        if (r.method === 'wallet') addTx(`Late-cancel fee · ${cfi.name}`, -fee);
        bumpCfiEarnings(cfi.id, r2(fee * (1 - FEES.cfiNew)));
      }
      return fee;
    },
    closeOut: (id, d) => {
      const r = requests.find((x) => x.id === id);
      const cfi = getCfi(r.cfiId);
      const plane = getPlane(r.planeId);
      const fh = r2(Math.max(0.1, d.hobbsIn - d.hobbsOut));
      const otherHeld = held - (r.method === 'wallet' ? r.total : 0);
      const canWallet = r.method === 'wallet';
      const aff = cfi ? affiliationFor(cfi.id) : null;
      const q = quote({ cfi, plane, flightHours: fh, groundHours: d.groundHours, repeat: r.repeat, prepaid: r.prepaid && canWallet, cfiPro: cfi?.pro, method: canWallet ? 'wallet' : 'card', affiliation: aff });
      const useWallet = canWallet && wallet.balance - otherHeld >= q.total;
      const receipt = { ...q, hobbsOut: d.hobbsOut, hobbsIn: d.hobbsIn, flightHours: fh, paidWith: useWallet ? 'Wallet' : 'Visa •• 4242', at: today(), depositReleased: q.deposit };
      patchReq(id, { status: 'Completed', receipt, flightHours: fh, groundHours: d.groundHours, total: q.total });
      if (useWallet) addTx(`Lesson · ${cfi ? cfi.name.split(' ')[0] : 'Solo'}${plane ? ' + ' + plane.tail : ''}`, -q.total);
      if (plane) {
        setPlanes((prev) => prev.map((p) => (p.id !== plane.id ? p : {
          ...p,
          hobbsTotal: r2(d.hobbsIn),
          monthEarnings: r2((p.monthEarnings || 0) + q.split.owner),
          squawks: d.squawk ? [{ id: 'q' + Date.now(), text: d.squawk, grounding: !!d.grounding, status: 'open', date: today() }, ...p.squawks] : p.squawks,
        })));
      }
      if (cfi) bumpCfiEarnings(cfi.id, q.split.cfi);
      if (aff && q.split.school) setSchools((prev) => prev.map((x) => (x.id === aff.schoolId ? { ...x, monthEarnings: r2((x.monthEarnings || 0) + q.split.school) } : x)));
      if (plane?.schoolId) setSchools((prev) => prev.map((x) => (x.id === plane.schoolId ? { ...x, monthEarnings: r2((x.monthEarnings || 0) + q.split.owner) } : x)));
      // training record
      setTraining((t) => {
        const h = { ...t.hours };
        h.total = r2(h.total + fh);
        if (cfi) h.dual = r2(h.dual + fh); else h.solo = r2(h.solo + fh);
        if (d.night) h.night = r2(h.night + fh);
        if (d.xc) cfi ? (h.dualXC = r2(h.dualXC + fh)) : (h.soloXC = r2(h.soloXC + fh));
        if (d.instrument) h.instrument = r2(h.instrument + (d.instrumentHrs || Math.min(fh, 0.5)));
        return {
          ...t,
          hours: h,
          spent: r2(t.spent + q.total),
          appDone: [...t.appDone, ...(d.lessonNames || nextLessons(t, d.lessonsDone || 0))],
          prior: t.prior && d.lessonNames ? { ...t.prior, cfiNotes: Object.fromEntries(Object.entries(t.prior.cfiNotes || {}).filter(([k]) => !d.lessonNames.includes(k))), lessons: Object.fromEntries(Object.entries(t.prior.lessons).filter(([k]) => !d.lessonNames.includes(k))) } : t.prior,
          endorsements: d.endorsement
            ? [{ name: d.endorsement.name, ref: d.endorsement.ref, date: today(), by: cfi?.name || '' }, ...t.endorsements]
            : t.endorsements,
          upcomingEndorsements: d.endorsement ? t.upcomingEndorsements.filter((e) => e.name !== d.endorsement.name) : t.upcomingEndorsements,
          debriefs: [
            withLabels({
              id: 'db' + Date.now(), requestId: id, cfiId: r.cfiId, planeId: r.planeId, when: r.when, goal: r.goal, flightHours: fh, groundHours: d.groundHours,
              conditions: { night: d.night, xc: d.xc, instrument: d.instrument },
              grades: d.debrief?.grades || [], wentWell: d.debrief?.wentWell || '', needsWork: d.debrief?.needsWork || '', nextPlan: d.debrief?.nextPlan || '',
              homework: (d.debrief?.homework || []).map((x) => ({ text: x, done: false })),
              pending: isEmptyDebrief(d.debrief), acknowledged: false, studentNote: '', solo: !r.cfiId,
            }),
            ...t.debriefs,
          ],
        };
      });
      return receipt;
    },
    dispute: (id, reason) => patchReq(id, { dispute: { reason, status: 'Under review', opened: today() } }),

    // ---- personalization
    profile,
    setProfile: (patch) => setProfile((p) => ({ ...p, ...patch })),

    // ---- verification
    docs,
    queue,
    automation,
    submitDoc: (key, type, r, subject) => {
      const status = r.decision === 'approved' ? 'approved' : r.decision;
      const doc = { status, by: r.decision === 'approved' ? 'auto' : null, fields: r.fields, checks: r.checks, confidence: r.confidence, expires: expiryOf(type, r.fields), submitted: fmt(new Date()), files: r.files || [], selfReported: type === 'logbook', reasons: r.reasons };
      setDocs((d) => ({ ...d, [key]: { ...(d[key] || {}), [type]: doc } }));
      setAutomation((a) => ({ ...a, autoApproved: a.autoApproved + (r.decision === 'approved' ? 1 : 0), rejected: a.rejected + (r.decision === 'rejected' ? 1 : 0) }));
      if (r.decision === 'review') {
        setQueue((q) => [{ id: 'v' + Date.now(), who: subject.who, role: subject.role, type, fields: r.fields, checks: r.checks, confidence: r.confidence, reasons: r.reasons, submitted: 'Just now', target: { key, type }, files: r.files || [], state: 'pending' }, ...q]);
      }
      if (r.decision === 'approved' && type === 'hundredHr') {
        const h = Number(String(r.fields.hobbs).replace(/[^0-9.]/g, ''));
        if (h) setPlanes((prev) => prev.map((p) => (p.id === key ? { ...p, next100At: r2(h + 100) } : p)));
      }
    },
    reviewDoc: (qid, action, note) => {
      const item = queue.find((x) => x.id === qid);
      setQueue((q) => q.map((x) => (x.id === qid ? { ...x, state: action, note } : x)));
      setAutomation((a) => ({ ...a, reviewed: a.reviewed + 1 }));
      if (item?.target) {
        const { key, type } = item.target;
        setDocs((d) => ({
          ...d,
          [key]: { ...(d[key] || {}), [type]: { ...(d[key]?.[type] || {}), status: action === 'approved' ? 'approved' : 'rejected', by: action === 'approved' ? 'reviewer' : null, note } },
        }));
      }
    },

    // ---- debriefs
    getDebrief: (id) => training.debriefs.find((x) => x.id === id),
    debriefForRequest: (rid) => training.debriefs.find((x) => x.requestId === rid),
    // CFI edits to content: only while unlocked (enforced again on the server in production).
    editDebrief: (id, patch) => {
      const db = training.debriefs.find((x) => x.id === id);
      if (lockInfo(db).locked) return false;
      setTraining((t) => ({ ...t, debriefs: t.debriefs.map((x) => (x.id === id ? { ...x, ...patch, pending: isEmptyDebrief({ ...x, ...patch }), editedAt: x.pending ? null : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } : x)) }));
      return true;
    },
    addAmendment: (id, a) =>
      setTraining((t) => ({ ...t, debriefs: t.debriefs.map((x) => (x.id === id ? { ...x, amendments: [...(x.amendments || []), { id: 'am' + Date.now(), at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), read: false, ...a }] } : x)) })),
    // Student actions: review (locks the debrief), personal note, mark amendments read.
    reviewDebrief: (id, note) =>
      setTraining((t) => ({ ...t, debriefs: t.debriefs.map((x) => (x.id === id ? { ...x, acknowledged: true, studentNote: note, lockedAt: x.lockedAt || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), amendments: (x.amendments || []).map((a) => ({ ...a, read: true })) } : x)) })),
    toggleHomework: (id, i) => setTraining((t) => ({ ...t, debriefs: t.debriefs.map((x) => (x.id === id ? { ...x, homework: x.homework.map((h, j) => (j === i ? { ...h, done: !h.done } : h)) } : x)) })),
    setSharing: (patch) => setTraining((t) => ({ ...t, sharing: { ...t.sharing, ...patch } })),

    // ---- previous experience
    savePrior: (prior) => setTraining((t) => ({ ...t, prior: { ...prior, status: 'self', confirmedBy: null, updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } })),
    markLessonPrior: (name, state) =>
      setTraining((t) => {
        const base = t.prior || { ...emptyPrior(), sharedWith: [t.cfiId] };
        const lessons = { ...base.lessons };
        if (state) lessons[name] = state; else delete lessons[name];
        const cfiNotes = { ...(base.cfiNotes || {}) };
        delete cfiNotes[name];
        return { ...t, prior: { ...base, lessons, cfiNotes, status: 'self', confirmedBy: null } };
      }),
    confirmPrior: (cfiId, notes) =>
      setTraining((t) => ({ ...t, prior: { ...t.prior, status: 'confirmed', confirmedBy: cfiId, cfiNotes: notes, confirmedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } })),

    // ---- reviews
    addReview: (kind, id, review) => {
      if (kind === 'cfi') setCfis((prev) => prev.map((c) => (c.id === id ? withReview(c, review) : c)));
      if (kind === 'plane') setPlanes((prev) => prev.map((p) => (p.id === id ? withReview(p, review) : p)));
      if (kind === 'school') setSchools((prev) => prev.map((x) => (x.id === id ? withReview(x, review) : x)));
    },

    // ---- wallet
    topUp: (pack) => {
      addTx('Added funds', pack.amount);
      if (pack.bonus) addTx(`Bonus credit (prepaid ${'$' + pack.amount.toLocaleString()})`, pack.bonus);
    },

    // ---- messaging
    sendMessage: (key, text) => {
      const scan = scanMessage(text, hasBookingWith(key));
      setThreads((prev) => {
        const exists = prev.some((t) => t.key === key);
        const msg = { from: 'me', text: scan.text, at: 'Now', masked: scan.masked, flagged: scan.flagged };
        return exists ? prev.map((t) => (t.key === key ? { ...t, messages: [...t.messages, msg] } : t)) : [{ key, messages: [msg] }, ...prev];
      });
      const reply = scan.offApp || scan.masked
        ? 'Let’s keep it in RightSeat — that way my pay is guaranteed and your lesson goes on your training record. Just book here and I’ll confirm.'
        : 'Sounds good! Grab a time on my calendar and I’ll confirm.';
      timers.current.push(setTimeout(() => setThreads((prev) => prev.map((t) => (t.key === key ? { ...t, messages: [...t.messages, { from: 'them', text: reply, at: 'Now' }] } : t))), 1200));
      return scan;
    },

    // ---- CFI / owner tools
    payout: (cfiId, instant) => {
      const c = getCfi(cfiId);
      const avail = r2((c.monthEarnings || 0) - (payouts[cfiId] || 0));
      const fee = instant && !c.pro ? r2(avail * FEES.instantPayout) : 0;
      setPayouts((p) => ({ ...p, [cfiId]: r2((p[cfiId] || 0) + avail) }));
      return { amount: r2(avail - fee), fee };
    },
    setCfiPro: (cfiId, on) => setCfis((prev) => prev.map((c) => (c.id === cfiId ? { ...c, pro: on } : c))),
    setSchoolPlan: (id) => setPlans((p) => ({ ...p, school: id })),
    addSquawk: (planeId, text, grounding) =>
      setPlanes((prev) => prev.map((p) => (p.id === planeId ? { ...p, squawks: [{ id: 'q' + Date.now(), text, grounding, status: 'open', date: today() }, ...p.squawks] } : p))),
    resolveSquawk: (planeId, qid) =>
      setPlanes((prev) => prev.map((p) => (p.id === planeId ? { ...p, squawks: p.squawks.map((q) => (q.id === qid ? { ...q, status: 'resolved' } : q)) } : p))),
    complete100hr: (planeId) => setPlanes((prev) => prev.map((p) => (p.id === planeId ? { ...p, next100At: r2(p.hobbsTotal + 100) } : p))),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function lessonEstimate({ cfi, plane, flightHours, groundHours }) {
  const instruction = cfi ? cfi.flightRate * flightHours : 0;
  const ground = cfi ? cfi.groundRate * groundHours : 0;
  const aircraft = plane ? plane.wetRate * flightHours : 0;
  return { instruction, ground, aircraft, total: instruction + ground + aircraft };
}
