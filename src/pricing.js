// Pricing: the single source of truth for fees and splits.
// Shared by the app (estimates) and the server functions (what's actually charged).
// Keep this file dependency-free; scripts/sync-shared.js copies it to supabase/functions/_shared/.

export const FEES = {
  studentNew: 0.06, // booking fee on the FIRST booking with a new CFI (or new plane for solo rentals)
  cfiNew: 0.05, // CFI host fee on new-student bookings only (0 for CFI Pro)
  owner: 0.08, // aircraft owner host fee on rentals
  protectionPerHr: 9, // renter's rental protection, only on app bookings
  deposit: 500, // damage deposit hold on solo rentals (released at close-out)
  instantPayout: 0.015, // instant payout fee (free on CFI Pro)
  lateCancel: 0.5, // share of instruction charged for <24 hr personal cancellations
  stripePct: 0.029,
  stripeFixed: 0.3,
};

export const r2 = (n) => Math.round(n * 100) / 100;

// affiliation: { model: 'split' | 'employee', schoolPct } when the CFI teaches for a flight school.
// Both models split instruction pay by schoolPct. 'split': CFI sets their own rate. 'employee': the school sets the rate and the split.
export function quote({ cfi, plane, flightHours, groundHours, repeat, prepaid, cfiPro, method = 'card', affiliation }) {
  const instruction = cfi ? cfi.flightRate * flightHours : 0;
  const ground = cfi ? cfi.groundRate * groundHours : 0;
  const rate = plane ? (prepaid ? plane.blockRate : plane.wetRate) : 0;
  const aircraft = rate * flightHours;
  const prepaidSavings = plane && prepaid ? (plane.wetRate - plane.blockRate) * flightHours : 0;
  const protection = plane ? FEES.protectionPerHr * flightHours : 0;
  const subtotal = instruction + ground + aircraft;
  const bookingFee = repeat ? 0 : r2(subtotal * FEES.studentNew);
  const waivedFee = repeat ? r2(subtotal * FEES.studentNew) : 0;
  const total = r2(subtotal + protection + bookingFee);
  const deposit = plane && !cfi ? FEES.deposit : 0;
  const cfiFee = cfi && !repeat && !cfiPro ? r2((instruction + ground) * FEES.cfiNew) : 0;
  const ownerFee = r2(aircraft * FEES.owner);
  const processing = method === 'card' ? r2(total * FEES.stripePct + FEES.stripeFixed) : 0;
  const cfiGross = r2(instruction + ground - cfiFee);
  const school = !cfi || !affiliation ? 0 : r2(cfiGross * affiliation.schoolPct);
  return {
    instruction, ground, aircraft, rate, prepaidSavings, protection, subtotal, bookingFee, waivedFee, total, deposit,
    split: {
      cfi: r2(cfiGross - school),
      school,
      schoolModel: affiliation?.model || null,
      owner: r2(aircraft - ownerFee),
      protection,
      platform: r2(bookingFee + cfiFee + ownerFee - processing),
      cfiFee, ownerFee, processing,
    },
  };
}

