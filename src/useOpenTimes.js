import { useEffect, useState } from 'react';
import { normalizeSchedule, openSlots, PLANE_SCHEDULE } from './schedule';
import { fetchSchedule, fetchBusy } from './backend/schedule';
import { demoBusy } from './logic';

// Open start times for booking: the instructor's working hours and rules (or the
// plane's rental hours for solo rentals), minus busy times from the server (lessons
// and time off for the instructor, bookings for the plane) and the student's own requests.
const isLive = (id) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
const ACTIVE = ['Pending', 'Confirmed'];

export function useOpenTimes({ cfi, plane, durationMin, requests }) {
  const [state, set] = useState({ loading: true, schedule: null, busy: [], error: '' });
  useEffect(() => {
    let alive = true;
    (async () => {
      set((s) => ({ ...s, loading: true, error: '' }));
      let schedule = cfi ? normalizeSchedule(null, cfi.availability) : plane ? PLANE_SCHEDULE : null;
      try {
        if (cfi && isLive(cfi.id)) schedule = (await fetchSchedule(cfi.id, cfi.availability)).schedule;
        if (!schedule) { if (alive) set({ loading: false, schedule: null, busy: [], error: '' }); return; }
        const now = new Date();
        const to = new Date(now.getTime() + (schedule.maxDaysAhead + 2) * 86400e3);
        let busy = demoBusy({ cfi, plane, from: now, days: schedule.maxDaysAhead + 2 });
        const liveCfi = cfi && isLive(cfi.id), livePlane = plane && isLive(plane.id);
        if (liveCfi || livePlane) busy = busy.concat(await fetchBusy({ cfiId: liveCfi ? cfi.id : null, planeId: livePlane ? plane.id : null, from: now, to }));
        if (alive) set({ loading: false, schedule, busy, error: '' });
      } catch (e) {
        if (alive) set({ loading: false, schedule, busy: [], error: 'Couldn’t load the latest calendar. Pull to refresh, or pick a time and we’ll check it when you send.' });
      }
    })();
    return () => { alive = false; };
  }, [cfi?.id, plane?.id]);

  // The student's own pending/confirmed lessons with this instructor or plane.
  const own = (requests || [])
    .filter((r) => ACTIVE.includes(r.status) && r.when && ((cfi && r.cfiId === cfi.id) || (plane && r.planeId === plane.id)))
    .map((r) => ({ start: new Date(r.when), end: new Date(new Date(r.when).getTime() + ((r.flightHours || 1) + (r.groundHours || 0)) * 3600e3 + 30 * 60e3) }));
  const busy = [...state.busy, ...own];
  const slotsFor = (date) => (state.schedule ? openSlots({ schedule: state.schedule, date, durationMin, busy }) : []);
  return { ...state, busy, slotsFor };
}
