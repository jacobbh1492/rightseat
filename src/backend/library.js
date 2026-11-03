import { supabase } from './supabase';

// Learning Library on the server: which lessons a student has studied, and the
// pre-flight reviews instructors assign for an upcoming lesson. Lesson content ships
// in the app (src/library); the database stores lesson ids only. Row-level security
// decides who sees what (see supabase/migrations/20261102000000_learning_library.sql).

// ---- studied lessons
export async function fetchStudied(studentId) {
  const { data, error } = await supabase.from('lesson_progress').select('lesson_id, studied_at').eq('student_id', studentId);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.lesson_id, r.studied_at]));
}

// Marking a lesson studied again refreshes its date (that's what counts toward a review).
export async function setStudied(studentId, lessonId, on) {
  if (on) {
    const { error } = await supabase.from('lesson_progress')
      .upsert({ student_id: studentId, lesson_id: lessonId, studied_at: new Date().toISOString() }, { onConflict: 'student_id,lesson_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('lesson_progress').delete().eq('student_id', studentId).eq('lesson_id', lessonId);
    if (error) throw error;
  }
}

// ---- pre-flight reviews
const COLS = 'id, booking_id, student_id, cfi_id, lesson_ids, note, assigned_at, completed_at';
const shape = (r) => ({
  id: r.id, bookingId: r.booking_id, studentId: r.student_id, cfiId: r.cfi_id,
  lessonIds: r.lesson_ids || [], note: r.note || '', assignedAt: r.assigned_at, completedAt: r.completed_at,
});

// Every review the signed-in user is part of (as the student or the instructor).
export async function fetchReviews() {
  const { data, error } = await supabase.from('preflight_reviews').select(COLS)
    .order('assigned_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map(shape);
}

// The instructor assigns (or changes) the review for one of their upcoming lessons.
// The database fills in the student and instructor from the booking.
export async function saveReview({ bookingId, lessonIds, note }) {
  const patch = { lesson_ids: lessonIds, note: (note || '').trim() };
  // Update if one exists (only lessons and note are writable), otherwise create it.
  const { data: updated, error: e1 } = await supabase.from('preflight_reviews').update(patch).eq('booking_id', bookingId).select(COLS);
  if (e1) throw e1;
  if (updated?.length) return shape(updated[0]);
  const { data, error } = await supabase.from('preflight_reviews').insert({ booking_id: bookingId, ...patch }).select(COLS).single();
  if (error) throw error;
  return shape(data);
}

export async function removeReview(bookingId) {
  const { error } = await supabase.from('preflight_reviews').delete().eq('booking_id', bookingId);
  if (error) throw error;
}

// For the instructor: what one of their students has studied (allowed once they share a booking).
export const fetchStudentStudied = (studentId) => fetchStudied(studentId);

// Lessons in a review the student has studied since it was assigned.
export function reviewProgress(review, studied) {
  const since = review?.assignedAt ? new Date(review.assignedAt).getTime() : 0;
  const done = (review?.lessonIds || []).filter((id) => studied[id] && new Date(studied[id]).getTime() >= since - 1000);
  return { done: done.length, total: (review?.lessonIds || []).length, doneIds: done };
}
