import { supabase } from './supabase';

// Map database rows to the shapes the app's screens use. Fields the database
// doesn't track yet get neutral defaults, so a new listing renders cleanly.
const COLORS = ['#1F6FEB', '#0891B2', '#7C3AED', '#059669', '#DB2777', '#EA580C'];
const colorFor = (id) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

export function cfiFromRow(row, names, planeIds, avatars = {}) {
  const d = row.details || {};
  const name = names[row.id] || 'Instructor';
  return {
    id: row.id, live: true, name, photo: avatars[row.id] || null, published: !!row.published,
    initials: name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    color: colorFor(row.id), homeAirport: d.homeAirport || 'KPIE', alsoTeachesAt: d.alsoTeachesAt || [],
    certs: row.certs || ['CFI'], flightRate: Number(row.flight_rate), groundRate: Number(row.ground_rate),
    discoveryFlight: Number(row.discovery_price || 0), totalHours: d.totalHours || 0, dualGiven: d.dualGiven || 0,
    yearsInstructing: d.yearsInstructing || 0, passRate: d.passRate || 0, checkridesSent: d.checkridesSent || 0, studentsSoloed: d.studentsSoloed || 0,
    specialties: row.specialties || [], trainingTypes: d.trainingTypes || ['Part 61'], availability: row.availability || [],
    timeOfDay: d.timeOfDay || ['Daytime'], teachingStyle: d.teachingStyle || '', background: d.background || '', bio: d.bio || '',
    languages: d.languages || ['English'], responseTime: 'New on RightSeat', teachesInYourPlane: !!d.teachesInYourPlane,
    insured: !!d.insured, verified: !!row.verified, pro: !!row.pro, rating: 0, reviewCount: 0, reviews: [],
    aircraftIds: planeIds, packages: d.packages || [], platformHours: 0, monthEarnings: 0,
  };
}

export function planeFromRow(row, photos = []) {
  const d = row.details || {};
  return {
    id: row.id, live: true, ownerId: row.owner_id, published: !!row.published,
    insured: !!row.insured, airworthyVerified: !!row.airworthy_verified, tail: row.tail, year: row.year, make: row.make, model: row.model, category: row.category,
    homeAirport: row.home_airport, color: colorFor(row.id), art: d.art || 'highwing', photos,
    wetRate: Number(row.wet_rate), dryRate: Number(row.dry_rate || 0), blockRate: Number(d.blockRate || row.wet_rate),
    avionics: d.avionics || [], ifr: !!d.ifr, seats: d.seats || 4, usefulLoad: d.usefulLoad || 0, fuelBurn: d.fuelBurn || 0, cruise: d.cruise || 0,
    engineSMOH: d.engineSMOH || 0, tbo: d.tbo || 2000, last100hr: d.last100hr || '',
    hobbsTotal: Number(row.hobbs_total || 0), next100At: Number(row.next_100_at || 0), squawks: [],
    ownerName: d.ownerName || 'Private owner', ownerType: row.owner_type, insuranceMinHours: d.insuranceMinHours || 0,
    checkoutRequired: d.checkoutRequired || 'Checkout with a listed CFI', soloRental: d.soloRental !== false,
    rating: 0, reviewCount: 0, reviews: [], notes: d.notes || '', monthEarnings: 0, schoolId: row.school_id || null,
  };
}

// Verified reviews, in the shape the app's ReviewCard shows.
const reviewFromRow = (subject) => (r) => ({
  name: r.author_name || 'RightSeat pilot', verified: true, role: subject === 'cfi' ? 'Student' : 'Renter', lesson: r.lesson || '',
  date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  tags: r.tags || [], rating: r.rating, text: r.body || '', reply: r.reply || null,
});

// Published instructors and planes from the live database, plus the signed-in
// user's own listings even while they're unpublished drafts.
export async function fetchLiveListings(uid) {
  const mine = (col) => (uid ? `published.eq.true,${col}.eq.${uid}` : 'published.eq.true');
  const [cfisRes, planesRes, linksRes] = await Promise.all([
    supabase.from('cfis').select('*').or(mine('id')),
    supabase.from('planes').select('*').or(mine('owner_id')),
    supabase.from('cfi_planes').select('*'),
  ]);
  if (cfisRes.error || planesRes.error) throw cfisRes.error || planesRes.error;
  const ids = cfisRes.data.map((c) => c.id);
  const planeIds = planesRes.data.map((p) => p.id);
  // Names live on profiles, which only signed-in users can read; fall back gracefully.
  const [{ data: people }, { data: photoRows }] = await Promise.all([
    ids.length ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids) : { data: [] },
    planeIds.length ? supabase.from('plane_photos').select('plane_id, path, position').in('plane_id', planeIds).order('position') : { data: [] },
  ]);
  const names = Object.fromEntries((people || []).map((p) => [p.id, p.full_name]));
  const avatars = Object.fromEntries((people || []).filter((p) => p.avatar_url).map((p) => [p.id, p.avatar_url]));
  const photoUrl = (path) => supabase.storage.from('plane-photos').getPublicUrl(path).data.publicUrl;
  const photosFor = (id) => (photoRows || []).filter((r) => r.plane_id === id).map((r) => photoUrl(r.path));
  const links = linksRes.data || [];
  const { data: reviewRows } = await supabase.from('reviews').select('subject, subject_id, rating, tags, body, reply, author_name, lesson, created_at')
    .in('subject_id', [...ids, ...planeIds].length ? [...ids, ...planeIds] : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false });
  const withReviews = (item, subject) => {
    const rs = (reviewRows || []).filter((r) => r.subject === subject && r.subject_id === item.id).map(reviewFromRow(subject));
    if (!rs.length) return item;
    return { ...item, reviews: rs, reviewCount: rs.length, rating: Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 100) / 100 };
  };
  return {
    cfis: cfisRes.data.map((r) => withReviews(cfiFromRow(r, names, links.filter((l) => l.cfi_id === r.id).map((l) => l.plane_id), avatars), 'cfi')),
    planes: planesRes.data.map((r) => withReviews(planeFromRow(r, photosFor(r.id)), 'plane')),
  };
}
