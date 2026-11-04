// GENERATED from src/promos.js by scripts/sync-shared.js — do not edit here.
// Launch promo codes. Shared by the app (what a code does) and the server (redeem function).
// Keep this file dependency-free; scripts/sync-shared.js copies it to supabase/functions/_shared/.
// The promo_codes table is the switch: a code only works while its row is active.

export const PROMOS = {
  runup: { label: 'Runup', kind: 'cfi_pro', months: 12, title: 'CFI Pro free for 1 year', who: 'instructors' },
  holdshort: { label: 'Hold Short', kind: 'school_pro', months: 12, title: 'School Pro free for 1 year', who: 'flight schools' },
  shortfinal: { label: 'Short Final', kind: 'fee_free', months: 3, title: 'No booking fees for 3 months', who: 'students and renters' },
};

// "Hold Short", "hold-short", " HOLDSHORT " → "holdshort"
export const normalizePromo = (code) => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const promoFor = (code) => PROMOS[normalizePromo(code)] || null;

// End of the free window: `months` after `from`, or after an existing window that runs later.
export function promoEnds(months, from = new Date(), existingUntil = null) {
  const base = existingUntil && new Date(existingUntil) > from ? new Date(existingUntil) : new Date(from);
  const end = new Date(base);
  end.setUTCMonth(end.getUTCMonth() + months);
  return end;
}

export const isActive = (until, now = new Date()) => !!until && new Date(until).getTime() > now.getTime();
