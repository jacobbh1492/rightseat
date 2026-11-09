import React from 'react';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from './config';
import { callFn } from './supabase';

export const CARD_PAYMENTS_SUPPORTED = true;

export function PaymentsProvider({ children }) {
  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.com.rightseat.app"
      urlScheme={Constants.appOwnership === 'expo' ? Linking.createURL('/--/') : Linking.createURL('')}
    >
      {children}
    </StripeProvider>
  );
}

// Request a booking on the server, then show Stripe's card sheet to save the
// student's card. Nothing is charged now; the card is charged for the actual
// Hobbs time when the instructor closes out the lesson.
export function useBookingPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async (request) => {
    const res = await callFn('book', request);
    const { error: initErr } = await initPaymentSheet({
      merchantDisplayName: 'Positive Rate',
      customerId: res.payment.customer,
      customerEphemeralKeySecret: res.payment.ephemeralKey,
      setupIntentClientSecret: res.payment.setupIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: Linking.createURL('stripe-redirect'),
      primaryButtonLabel: 'Save card & send request',
    });
    if (initErr) throw new Error(initErr.message);
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code === 'Canceled') return { cancelled: true, bookingId: res.booking.id };
      throw new Error(error.message);
    }
    // Don't trust the sheet alone — confirm with the server that Stripe saved the card.
    let check = { cardReady: false };
    for (let i = 0; i < 3 && !check.cardReady; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      check = await callFn('booking-action', { bookingId: res.booking.id, action: 'card' });
    }
    if (!check.cardReady) throw new Error('Stripe didn’t save your card, so the request wasn’t sent. Tap Send request to try again.');
    return { booking: res.booking, quote: res.quote, split: res.split || null };
  };
}

// Shared flight: the invited pilot pays their deposit (their share of the estimate).
// Their card is saved too, for any difference once the flight's actual time is known.
export function useSplitDeposit() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async (bookingId) => {
    const res = await callFn('split', { bookingId, action: 'accept', attest: true });
    if (res.status === 'accepted') return { status: 'accepted' };
    const { error: initErr } = await initPaymentSheet({
      merchantDisplayName: 'Positive Rate',
      customerId: res.payment.customer,
      customerEphemeralKeySecret: res.payment.ephemeralKey,
      paymentIntentClientSecret: res.payment.paymentIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: Linking.createURL('stripe-redirect'),
      primaryButtonLabel: `Pay $${Number(res.deposit).toFixed(2)} deposit & join`,
    });
    if (initErr) throw new Error(initErr.message);
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code === 'Canceled') return { cancelled: true };
      throw new Error(error.message);
    }
    // Confirm with the server (it checks with Stripe) before showing the flight as joined.
    let check = { status: 'invited' };
    for (let i = 0; i < 3 && check.status !== 'accepted'; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      check = await callFn('split', { bookingId, action: 'paid' });
    }
    if (check.status !== 'accepted') throw new Error('Your deposit is still processing. Check back in a minute.');
    return { status: 'accepted', deposit: res.deposit };
  };
}

// A lesson the instructor booked: the student saves a card for it, which confirms it.
export function useAcceptProposal() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async (bookingId) => {
    const res = await callFn('booking-action', { bookingId, action: 'accept' });
    if (res.status === 'confirmed') return { status: 'confirmed' };
    const { error: initErr } = await initPaymentSheet({
      merchantDisplayName: 'Positive Rate',
      customerId: res.payment.customer,
      customerEphemeralKeySecret: res.payment.ephemeralKey,
      setupIntentClientSecret: res.payment.setupIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: Linking.createURL('stripe-redirect'),
      primaryButtonLabel: 'Save card & accept lesson',
    });
    if (initErr) throw new Error(initErr.message);
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code === 'Canceled') return { cancelled: true };
      throw new Error(error.message);
    }
    let check = { bookingStatus: 'proposed' };
    for (let i = 0; i < 3 && check.bookingStatus !== 'confirmed'; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      check = await callFn('booking-action', { bookingId, action: 'card' });
    }
    if (check.bookingStatus !== 'confirmed') throw new Error('Your card is still being saved. Check back in a minute.');
    return { status: 'confirmed' };
  };
}

// Buy a gift flight: pay in Stripe's sheet, then the server confirms with Stripe and
// returns the code to pass on.
export function useGiftPurchase() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async (gift) => {
    const res = await callFn('gift', { action: 'create', ...gift });
    const { error: initErr } = await initPaymentSheet({
      merchantDisplayName: 'Positive Rate',
      customerId: res.payment.customer,
      customerEphemeralKeySecret: res.payment.ephemeralKey,
      paymentIntentClientSecret: res.payment.paymentIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: Linking.createURL('stripe-redirect'),
      primaryButtonLabel: `Pay $${Number(res.gift.amount).toFixed(2)}`,
    });
    if (initErr) throw new Error(initErr.message);
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code === 'Canceled') return { cancelled: true };
      throw new Error(error.message);
    }
    let check = { gift: res.gift };
    for (let i = 0; i < 4 && !check.gift?.code; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      check = await callFn('gift', { action: 'paid', giftId: res.gift.id });
    }
    if (!check.gift?.code) throw new Error('Your payment is still processing. Your gift code will show under Account → Gifts in a minute.');
    return { gift: check.gift };
  };
}

// Account → Payment methods: save a new card with Stripe's sheet (nothing is charged).
export function useAddCard() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async () => {
    const res = await callFn('payment-methods', { action: 'setup' });
    const { error: initErr } = await initPaymentSheet({
      merchantDisplayName: 'Positive Rate',
      customerId: res.payment.customer,
      customerEphemeralKeySecret: res.payment.ephemeralKey,
      setupIntentClientSecret: res.payment.setupIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: Linking.createURL('stripe-redirect'),
      primaryButtonLabel: 'Save card',
    });
    if (initErr) throw new Error(initErr.message);
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code === 'Canceled') return { cancelled: true };
      throw new Error(error.message);
    }
    return await callFn('payment-methods', { action: 'added' });
  };
}
