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
      merchantDisplayName: 'RightSeat',
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
    return { booking: res.booking, quote: res.quote };
  };
}
