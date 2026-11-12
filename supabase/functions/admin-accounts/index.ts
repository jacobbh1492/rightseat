// POST /admin-accounts — admin console: create and edit CFI, flight school and plane-owner accounts.
//
// Staff only: the caller signs in to the console with their Positive Rate account, and that
// profile must have is_staff = true, or the email must be in ADMIN_STAFF_EMAILS (comma-separated
// secret; defaults to admin@positiverateflying.com). Every change needs a reason and is written to audit_log.
//
// Actions (body.action):
//   list                              → { accounts: [...] } every CFI, flight school and plane owner
//   create { kind, reason, ... }      → { account } new account (or adds the role to an existing sign-in)
//   update { kind, id, reason, ... }  → { account } edit profile / CFI / school / aircraft details
//
// New accounts are created already confirmed. The person signs in to the app with that email
// (the app uses email codes, so there's no password to send).
import { serve, json, admin, requireUser } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';

type Kind = 'cfi' | 'school' | 'owner';
const KINDS: Kind[] = ['cfi', 'school', 'owner'];
const ROLE: Record<Kind, string> = { cfi: 'cfi', school: 'school_admin', owner: 'owner' };
const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };

// ---------------------------------------------------------------- validation
const text = (v: unknown, label: string, max = 120, required = false) => {
  const s = String(v ?? '').trim();
  if (required && !s) throw new HttpError(400, `${label} is required.`);
  if (s.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters).`);
  return s;
};
const email = (v: unknown) => {
  const s = text(v, 'Email', 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Enter a valid email address.');
  return s;
};
const airport = (v: unknown, required = false) => {
  const s = text(v, 'Home airport', 4, required).toUpperCase();
  if (s && !/^[A-Z0-9]{3,4}$/.test(s)) throw new HttpError(400, 'Home airport should be an airport code like KPIE.');
  return s;
};
const usd = (v: unknown, label: string, { min = 0, max = 2000, required = false } = {}) => {
  if (v === '' || v === null || v === undefined) {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be between $${min} and $${max}.`);
  return Math.round(n * 100) / 100;
};
const list = (v: unknown, label: string) => {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  const out = [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
  if (out.length > 30 || out.some((x) => x.length > 60)) throw new HttpError(400, `${label}: too many or too long.`);
  return out;
};
const has = (o: any, k: string) => o && Object.prototype.hasOwnProperty.call(o, k);

// ---------------------------------------------------------------- helpers
async function requireStaff(req: Request) {
  const user = await requireUser(req);
  const { data } = await admin.from('profiles').select('is_staff, full_name').eq('id', user.id).single();
  const listed = (Deno.env.get('ADMIN_STAFF_EMAILS') || 'admin@positiverateflying.com').toLowerCase().split(',').map((x) => x.trim());
  if (!data?.is_staff && !(user.email && listed.includes(user.email.toLowerCase()))) throw new HttpError(403, 'This account isn’t on the Positive Rate admin team.');
  return { id: user.id, name: data?.full_name || user.email || 'Staff' };
}

async function allAuthUsers() {
  const out: any[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}
async function findUserByEmail(addr: string) {
  return (await allAuthUsers()).find((u) => (u.email || '').toLowerCase() === addr) || null;
}

// Find the sign-in for this email, or create it (confirmed, so the app's email-code sign-in works).
async function userFor(addr: string, name: string) {
  const existing = await findUserByEmail(addr);
  if (existing) return { id: existing.id as string, existed: true };
  const { data, error } = await admin.auth.admin.createUser({ email: addr, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new HttpError(400, `Couldn’t create the sign-in: ${error.message}`);
  return { id: data.user.id, existed: false };
}

async function addRole(uid: string, role: string, profile: Record<string, unknown>) {
  const { data: p } = await admin.from('profiles').select('roles, full_name, home_airport, phone').eq('id', uid).maybeSingle();
  const roles = [...new Set([...(p?.roles || ['student']), role])];
  const row: Record<string, unknown> = { id: uid, roles, onboarded: true };
  // Don't overwrite what an existing user already filled in.
  for (const [k, v] of Object.entries(profile)) if (v && !(p as any)?.[k]) row[k] = v;
  ok(await admin.from('profiles').upsert(row));
}

async function log(actor: string, action: string, target: string, reason: string, detail: unknown) {
  await admin.from('audit_log').insert({ actor_id: actor, action, target, reason, detail });
}

// ---------------------------------------------------------------- read
async function loadAccounts(only?: { kind: Kind; id: string }) {
  const [users, profiles, cfis, schools, schoolAdmins, planes] = await Promise.all([
    allAuthUsers(),
    admin.from('profiles').select('id, full_name, phone, home_airport, roles, created_at, payouts_ready').overlaps('roles', ['cfi', 'owner', 'school_admin']).then(ok),
    admin.from('cfis').select('*').then(ok),
    admin.from('schools').select('*').then(ok),
    admin.from('school_admins').select('school_id, user_id').then(ok),
    admin.from('planes').select('id, owner_id, school_id, tail, make, model, year, home_airport, owner_type, wet_rate, dry_rate, published, airworthy_verified, insured').then(ok),
  ]);
  const emailOf = Object.fromEntries(users.map((u: any) => [u.id, u.email || '']));
  const bannedOf = Object.fromEntries(users.map((u: any) => [u.id, !!u.banned_until && new Date(u.banned_until) > new Date()]));
  const prof = Object.fromEntries((profiles as any[]).map((p) => [p.id, p]));
  const person = (id: string) => {
    const p = prof[id] || {};
    return { id, name: p.full_name || '', email: emailOf[id] || '', phone: p.phone || '', airport: p.home_airport || '', joined: p.created_at, payoutsReady: !!p.payouts_ready, suspended: !!bannedOf[id] };
  };
  const planeRow = (p: any) => ({ id: p.id, tail: p.tail, make: p.make, model: p.model, year: p.year, airport: p.home_airport, ownerType: p.owner_type, wetRate: Number(p.wet_rate), dryRate: p.dry_rate == null ? null : Number(p.dry_rate), published: p.published, verified: p.airworthy_verified && p.insured });

  const out: any[] = [];
  for (const c of cfis as any[]) {
    out.push({
      ...person(c.id), kind: 'cfi', published: c.published, verified: c.verified, pro: c.pro,
      cfi: { certs: c.certs, flightRate: Number(c.flight_rate), groundRate: Number(c.ground_rate), discoveryPrice: c.discovery_price == null ? null : Number(c.discovery_price), specialties: c.specialties, bio: c.details?.bio || '' },
    });
  }
  for (const s of schools as any[]) {
    const contacts = (schoolAdmins as any[]).filter((a) => a.school_id === s.id).map((a) => person(a.user_id));
    out.push({
      id: s.id, kind: 'school', name: s.name, email: contacts[0]?.email || '', phone: s.details?.phone || '', airport: s.home_airport, joined: s.created_at,
      published: s.published, verified: true, contacts,
      school: { website: s.details?.website || '', about: s.details?.about || '', trainingTypes: s.details?.trainingTypes || [], plan: s.plan, termsModel: s.terms_model, schoolPct: Number(s.terms_school_pct) },
      planes: (planes as any[]).filter((p) => p.school_id === s.id).map(planeRow),
    });
  }
  for (const p of profiles as any[]) {
    if (!p.roles?.includes('owner')) continue;
    const mine = (planes as any[]).filter((x) => x.owner_id === p.id).map(planeRow);
    out.push({ ...person(p.id), kind: 'owner', published: mine.some((x) => x.published), verified: mine.length > 0 && mine.every((x) => x.verified), planes: mine });
  }
  return only ? out.find((a) => a.kind === only.kind && a.id === only.id) : out;
}

// ---------------------------------------------------------------- create
async function create(staff: { id: string }, body: any, reason: string) {
  const kind = body.kind as Kind;
  const contactName = text(body.name, kind === 'school' ? 'Contact name' : 'Full name', 80, true);
  const addr = email(body.email);
  const phone = text(body.phone, 'Phone', 30);
  const home = airport(body.airport, true);

  if (kind === 'cfi') {
    const flight = usd(body.flightRate, 'Flight rate', { min: 1, max: 1000, required: true });
    const ground = usd(body.groundRate, 'Ground rate', { max: 1000 }) ?? 0;
    const discovery = usd(body.discoveryPrice, 'Discovery flight price', { max: 2000 });
    const certs = list(body.certs, 'Certificates');
    const u = await userFor(addr, contactName);
    const { data: already } = await admin.from('cfis').select('id').eq('id', u.id).maybeSingle();
    if (already) throw new HttpError(409, `${addr} already has an instructor profile. Open it and edit instead.`);
    await addRole(u.id, ROLE.cfi, { full_name: contactName, phone, home_airport: home });
    ok(await admin.from('cfis').insert({
      id: u.id, certs: certs.length ? certs : ['CFI'], flight_rate: flight, ground_rate: ground, discovery_price: discovery,
      specialties: list(body.specialties, 'Specialties'), published: false,
      details: { homeAirport: home, bio: text(body.bio, 'Bio', 2000) },
    }));
    await log(staff.id, 'Created CFI account', `${contactName} <${addr}>`, reason, { user_id: u.id, existing_sign_in: u.existed });
    return { kind, id: u.id };
  }

  if (kind === 'school') {
    const schoolName = text(body.schoolName, 'School name', 120, true);
    const pct = body.schoolPct === '' || body.schoolPct == null ? 0.25 : Number(body.schoolPct);
    if (!(pct >= 0 && pct <= 0.8)) throw new HttpError(400, 'School share must be between 0% and 80%.');
    const model = body.termsModel === 'employee' ? 'employee' : 'split';
    const plan = body.plan === 'pro' ? 'pro' : 'starter';
    const u = await userFor(addr, contactName);
    await addRole(u.id, ROLE.school, { full_name: contactName, phone, home_airport: home });
    const school = ok(await admin.from('schools').insert({
      name: schoolName, home_airport: home, plan, terms_model: model, terms_school_pct: pct, published: false,
      details: { phone, website: text(body.website, 'Website', 200), about: text(body.about, 'About', 2000), trainingTypes: list(body.trainingTypes, 'Training types') },
    }).select('id').single()) as any;
    ok(await admin.from('school_admins').insert({ school_id: school.id, user_id: u.id }));
    await log(staff.id, 'Created flight school account', `${schoolName} (contact ${addr})`, reason, { school_id: school.id, user_id: u.id, existing_sign_in: u.existed });
    return { kind, id: school.id };
  }

  // owner
  const u = await userFor(addr, contactName);
  const { data: p } = await admin.from('profiles').select('roles').eq('id', u.id).maybeSingle();
  if (p?.roles?.includes('owner')) throw new HttpError(409, `${addr} is already a plane owner. Open it and edit instead.`);
  await addRole(u.id, ROLE.owner, { full_name: contactName, phone, home_airport: home });
  await log(staff.id, 'Created plane owner account', `${contactName} <${addr}>`, reason, { user_id: u.id, existing_sign_in: u.existed });
  return { kind, id: u.id };
}

// ---------------------------------------------------------------- update
async function updatePerson(uid: string, b: any, changes: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  if (has(b, 'name')) row.full_name = text(b.name, 'Full name', 80, true);
  if (has(b, 'phone')) row.phone = text(b.phone, 'Phone', 30);
  if (has(b, 'airport')) row.home_airport = airport(b.airport, true);
  if (Object.keys(row).length) { ok(await admin.from('profiles').update(row).eq('id', uid)); Object.assign(changes, row); }
  if (has(b, 'email')) {
    const addr = email(b.email);
    const { data: cur } = await admin.auth.admin.getUserById(uid);
    if ((cur?.user?.email || '').toLowerCase() !== addr) {
      if (await findUserByEmail(addr)) throw new HttpError(409, `${addr} is already used by another account.`);
      const { error } = await admin.auth.admin.updateUserById(uid, { email: addr, email_confirm: true });
      if (error) throw new HttpError(400, `Couldn’t change the email: ${error.message}`);
      changes.email = addr;
    }
  }
}

async function updatePlanes(planes: unknown, scope: { owner_id?: string; school_id?: string }, changes: Record<string, unknown>) {
  if (!Array.isArray(planes)) return;
  for (const p of planes.slice(0, 50) as any[]) {
    let q = admin.from('planes').select('id, tail').eq('id', String(p.id));
    q = scope.owner_id ? q.eq('owner_id', scope.owner_id) : q.eq('school_id', scope.school_id!);
    const { data: cur } = await q.maybeSingle();
    if (!cur) throw new HttpError(404, 'That aircraft doesn’t belong to this account.');
    const row: Record<string, unknown> = {};
    if (has(p, 'wetRate')) row.wet_rate = usd(p.wetRate, `${cur.tail} wet rate`, { min: 1, max: 3000, required: true });
    if (has(p, 'dryRate')) row.dry_rate = usd(p.dryRate, `${cur.tail} dry rate`, { max: 3000 });
    if (has(p, 'airport')) row.home_airport = airport(p.airport, true);
    if (has(p, 'ownerType')) row.owner_type = text(p.ownerType, 'Owner type', 40, true);
    if (Object.keys(row).length) { ok(await admin.from('planes').update(row).eq('id', cur.id)); changes[cur.tail] = row; }
  }
}

async function update(staff: { id: string }, body: any, reason: string) {
  const kind = body.kind as Kind;
  const id = text(body.id, 'Account id', 64, true);
  const changes: Record<string, unknown> = {};

  if (kind === 'cfi') {
    const { data: cur } = await admin.from('cfis').select('details').eq('id', id).maybeSingle();
    if (!cur) throw new HttpError(404, 'Instructor not found.');
    await updatePerson(id, body, changes);
    const c = body.cfi || {};
    const row: Record<string, unknown> = {};
    if (has(c, 'flightRate')) row.flight_rate = usd(c.flightRate, 'Flight rate', { min: 1, max: 1000, required: true });
    if (has(c, 'groundRate')) row.ground_rate = usd(c.groundRate, 'Ground rate', { max: 1000 }) ?? 0;
    if (has(c, 'discoveryPrice')) row.discovery_price = usd(c.discoveryPrice, 'Discovery flight price', { max: 2000 });
    if (has(c, 'certs')) { const certs = list(c.certs, 'Certificates'); row.certs = certs.length ? certs : ['CFI']; }
    if (has(c, 'specialties')) row.specialties = list(c.specialties, 'Specialties');
    const details = { ...(cur.details || {}) };
    if (has(c, 'bio')) details.bio = text(c.bio, 'Bio', 2000);
    if (has(body, 'airport')) details.homeAirport = airport(body.airport, true);
    row.details = details;
    ok(await admin.from('cfis').update(row).eq('id', id));
    Object.assign(changes, row); delete changes.details;
    if (has(c, 'bio')) changes.bio = 'updated';
    await log(staff.id, 'Edited CFI account', id, reason, changes);
    return { kind, id };
  }

  if (kind === 'school') {
    const { data: cur } = await admin.from('schools').select('name, details').eq('id', id).maybeSingle();
    if (!cur) throw new HttpError(404, 'Flight school not found.');
    const s = body.school || {};
    const row: Record<string, unknown> = {};
    if (has(body, 'name')) row.name = text(body.name, 'School name', 120, true);
    if (has(body, 'airport')) row.home_airport = airport(body.airport, true);
    if (has(s, 'plan')) row.plan = s.plan === 'pro' ? 'pro' : 'starter';
    if (has(s, 'termsModel')) row.terms_model = s.termsModel === 'employee' ? 'employee' : 'split';
    if (has(s, 'schoolPct')) {
      const pct = Number(s.schoolPct);
      if (!(pct >= 0 && pct <= 0.8)) throw new HttpError(400, 'School share must be between 0% and 80%.');
      row.terms_school_pct = pct;
    }
    const details = { ...(cur.details || {}) };
    if (has(body, 'phone')) details.phone = text(body.phone, 'Phone', 30);
    if (has(s, 'website')) details.website = text(s.website, 'Website', 200);
    if (has(s, 'about')) details.about = text(s.about, 'About', 2000);
    if (has(s, 'trainingTypes')) details.trainingTypes = list(s.trainingTypes, 'Training types');
    row.details = details;
    ok(await admin.from('schools').update(row).eq('id', id));
    Object.assign(changes, row); delete changes.details;
    for (const k of ['phone', 'website', 'about', 'trainingTypes']) if (has(k === 'phone' ? body : s, k)) changes[k] = (details as any)[k];
    // Contact person (the school's admin sign-in).
    if (body.contact?.id) {
      const { data: link } = await admin.from('school_admins').select('user_id').eq('school_id', id).eq('user_id', body.contact.id).maybeSingle();
      if (!link) throw new HttpError(404, 'That contact isn’t an admin of this school.');
      const contactChanges: Record<string, unknown> = {};
      await updatePerson(body.contact.id, body.contact, contactChanges);
      if (Object.keys(contactChanges).length) changes.contact = contactChanges;
    }
    await updatePlanes(body.planes, { school_id: id }, changes);
    await log(staff.id, 'Edited flight school account', `${row.name || cur.name}`, reason, changes);
    return { kind, id };
  }

  // owner
  const { data: p } = await admin.from('profiles').select('roles').eq('id', id).maybeSingle();
  if (!p?.roles?.includes('owner')) throw new HttpError(404, 'Plane owner not found.');
  await updatePerson(id, body, changes);
  await updatePlanes(body.planes, { owner_id: id }, changes);
  await log(staff.id, 'Edited plane owner account', id, reason, changes);
  return { kind, id };
}

// ---------------------------------------------------------------- entry
serve(async (req, body) => {
  const staff = await requireStaff(req);
  const action = String(body.action || '');
  if (action === 'list') return json({ accounts: await loadAccounts() });

  if (!KINDS.includes(body.kind)) throw new HttpError(400, 'Account type must be cfi, school or owner.');
  const reason = text(body.reason, 'Reason', 500);
  if (reason.length < 3) throw new HttpError(400, 'Add a reason (it goes in the audit log).');

  if (action === 'create') {
    const r = await create(staff, body, reason);
    return json({ account: await loadAccounts(r) });
  }
  if (action === 'update') {
    const r = await update(staff, body, reason);
    return json({ account: await loadAccounts(r) });
  }
  throw new HttpError(400, 'Unknown action.');
});
