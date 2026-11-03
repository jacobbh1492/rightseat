import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../backend/auth';
import { fetchStudied, setStudied, fetchReviews } from '../backend/library';

// Shared Learning Library state: lessons studied and pre-flight reviews.
// Signed in: stored on the server (so instructors see progress). Guests: on this phone.
const KEY = 'rightseat.library.studied';
let state = { uid: undefined, studied: {}, reviews: [], loading: false, error: '' };
const subs = new Set();
const emit = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };

async function load(uid) {
  emit({ uid, loading: true, error: '' });
  try {
    if (uid) {
      const [studied, reviews] = await Promise.all([fetchStudied(uid), fetchReviews()]);
      emit({ studied, reviews, loading: false });
    } else {
      const raw = await AsyncStorage.getItem(KEY);
      emit({ studied: raw ? JSON.parse(raw) : {}, reviews: [], loading: false });
    }
  } catch (e) {
    emit({ loading: false, error: e.message });
  }
}

export function useLibrary() {
  const auth = useAuth();
  const uid = auth?.session?.user?.id || null;
  const [s, set] = useState(state);
  useEffect(() => { subs.add(set); set(state); return () => { subs.delete(set); }; }, []);
  useEffect(() => { if (state.uid !== uid) load(uid); }, [uid]);

  const toggleStudied = async (id, on) => {
    const prev = state.studied;
    const next = { ...prev };
    if (on) next[id] = new Date().toISOString(); else delete next[id];
    emit({ studied: next, error: '' });
    try {
      if (uid) await setStudied(uid, id, on);
      else await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      emit({ studied: prev, error: e.message });
    }
  };
  const putReview = (r) => emit({ reviews: [r, ...state.reviews.filter((x) => x.bookingId !== r.bookingId)] });
  const dropReview = (bookingId) => emit({ reviews: state.reviews.filter((x) => x.bookingId !== bookingId) });

  return { ...s, uid, toggleStudied, refresh: () => load(uid), putReview, dropReview };
}
