import { supabase } from './supabase';

// Save instructor profiles and plane listings to the live database.
// Photos go to public storage buckets under the user's own folder.

const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(String(id || ''));
const isRemote = (uri) => /^https?:\/\//.test(String(uri || ''));

async function upload(bucket, path, uri) {
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'image/jpeg';
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: type, upsert: true });
  if (error) throw error;
  return path;
}
const ext = (uri) => ((String(uri).match(/\.(jpe?g|png|heic|webp)(\?|$)/i) || [])[1] || 'jpg').toLowerCase();

async function addRole(uid, role) {
  const { data } = await supabase.from('profiles').select('roles').eq('id', uid).single();
  const roles = data?.roles || ['student'];
  if (!roles.includes(role)) await supabase.from('profiles').update({ roles: [...roles, role] }).eq('id', uid);
}

// cfi: the app's CFI shape (from CfiForm). Returns nothing; refetch listings after.
export async function saveCfiProfile(uid, cfi, { publish }) {
  const profilePatch = { full_name: cfi.name };
  if (cfi.photo && !isRemote(cfi.photo)) {
    const path = await upload('avatars', `${uid}/avatar-${Date.now()}.${ext(cfi.photo)}`, cfi.photo);
    profilePatch.avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }
  const { error: pErr } = await supabase.from('profiles').update(profilePatch).eq('id', uid);
  if (pErr) throw pErr;

  const row = {
    certs: cfi.certs, flight_rate: cfi.flightRate, ground_rate: cfi.groundRate || 0,
    discovery_price: cfi.discoveryFlight || null, specialties: cfi.specialties, availability: cfi.availability,
    published: !!publish,
    details: {
      homeAirport: cfi.homeAirport, alsoTeachesAt: cfi.alsoTeachesAt, trainingTypes: cfi.trainingTypes,
      totalHours: cfi.totalHours, dualGiven: cfi.dualGiven, yearsInstructing: cfi.yearsInstructing, passRate: cfi.passRate,
      checkridesSent: cfi.checkridesSent, studentsSoloed: cfi.studentsSoloed, timeOfDay: cfi.timeOfDay,
      bio: cfi.bio, teachingStyle: cfi.teachingStyle, background: cfi.background, languages: cfi.languages,
      teachesInYourPlane: cfi.teachesInYourPlane, insured: cfi.insured, packages: cfi.packages,
    },
  };
  // Insert the first time, update after (the id column can't be updated by the app).
  const { data: existing } = await supabase.from('cfis').select('id').eq('id', uid).maybeSingle();
  const { error } = existing
    ? await supabase.from('cfis').update(row).eq('id', uid)
    : await supabase.from('cfis').insert({ id: uid, ...row });
  if (error) throw error;

  // Planes they teach in (live listings only).
  const want = (cfi.aircraftIds || []).filter(isUuid);
  await supabase.from('cfi_planes').delete().eq('cfi_id', uid);
  if (want.length) {
    const { error: lErr } = await supabase.from('cfi_planes').insert(want.map((plane_id) => ({ cfi_id: uid, plane_id })));
    if (lErr) throw lErr;
  }
  await addRole(uid, 'cfi');
}

// A verified review of a completed live booking (the database checks it's yours and completed).
export async function postReview(uid, { bookingId, subject, rating, tags, text }) {
  const { error } = await supabase.from('reviews').insert({ booking_id: bookingId, author_id: uid, subject, rating, tags, body: text });
  if (error) {
    if (error.code === '23505') throw new Error('You already reviewed this.');
    throw error;
  }
}

// plane: the app's plane shape (from PlaneForm). Returns the new plane id.
export async function savePlaneListing(uid, plane, { publish, addToMyCfiProfile }) {
  const row = {
    owner_id: uid, tail: plane.tail, make: plane.make, model: plane.model, year: plane.year || null,
    category: plane.category, owner_type: plane.ownerType, home_airport: plane.homeAirport,
    wet_rate: plane.wetRate, dry_rate: plane.dryRate || null, published: !!publish,
    details: {
      art: plane.art, blockRate: plane.blockRate, avionics: plane.avionics, ifr: plane.ifr, seats: plane.seats,
      usefulLoad: plane.usefulLoad, fuelBurn: plane.fuelBurn, cruise: plane.cruise, engineSMOH: plane.engineSMOH,
      tbo: plane.tbo, last100hr: plane.last100hr, ownerName: plane.ownerName, insuranceMinHours: plane.insuranceMinHours,
      checkoutRequired: plane.checkoutRequired, soloRental: plane.soloRental, checkoutBy: plane.checkoutBy || 'cfi', notes: plane.notes,
    },
  };
  const { data, error } = await supabase.from('planes').insert(row).select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error(`${plane.tail} is already listed on RightSeat. If it’s your plane, contact support.`);
    throw error;
  }
  const id = data.id;
  const photos = (plane.photos || []).filter(Boolean);
  for (let i = 0; i < photos.length; i++) {
    const path = await upload('plane-photos', `${uid}/${id}/${i}-${Date.now()}.${ext(photos[i])}`, photos[i]);
    await supabase.from('plane_photos').insert({ plane_id: id, path, position: i });
  }
  if (addToMyCfiProfile) {
    const { data: me } = await supabase.from('cfis').select('id').eq('id', uid).maybeSingle();
    if (me) await supabase.from('cfi_planes').insert({ cfi_id: uid, plane_id: id });
  }
  await addRole(uid, 'owner');
  return id;
}
