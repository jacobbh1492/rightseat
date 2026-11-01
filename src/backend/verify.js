import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase, callFn } from './supabase';

// Verification (see supabase/functions/verify).
export const verifyStatus = () => callFn('verify', { action: 'status' });

// Stripe Identity: ID photo + selfie in Stripe's own secure screen, then check the result.
export async function verifyIdentity() {
  const { url } = await callFn('verify', { action: 'identity' });
  if (Platform.OS === 'web') window.open(url, '_blank');
  else await WebBrowser.openAuthSessionAsync(url, 'rightseat://payouts');
  return callFn('verify', { action: 'identity_check' });
}
export const checkIdentity = () => callFn('verify', { action: 'identity_check' });

// Upload a plane's insurance policy (photo or PDF page) privately and send it for review.
export async function submitInsurance(uid, planeId, uri) {
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'image/jpeg';
  const ext = type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : 'jpg';
  const path = `${uid}/insurance-${planeId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('documents').upload(path, body, { contentType: type });
  if (error) throw error;
  return callFn('verify', { action: 'insurance', planeId, path });
}

// Staff
export const reviewQueue = () => callFn('verify', { action: 'queue' });
export const decide = (id, decision, note) => callFn('verify', { action: 'decide', id, decision, note });
