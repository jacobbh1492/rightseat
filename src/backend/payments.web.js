// Web preview: card entry isn't wired up yet (the iPhone/Android apps use Stripe's
// native card sheet). Bookings on web stay in demo mode.
export const CARD_PAYMENTS_SUPPORTED = false;
export const PaymentsProvider = ({ children }) => children;
export const useBookingPayment = () => async () => { throw new Error('Book from the RightSeat iPhone or Android app.'); };
export const useSplitDeposit = () => async () => { throw new Error('Pay your deposit from the RightSeat iPhone or Android app.'); };
export const useAcceptProposal = () => async () => { throw new Error('Accept lessons from the RightSeat iPhone or Android app.'); };
