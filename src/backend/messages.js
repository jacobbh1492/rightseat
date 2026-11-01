import { supabase } from './supabase';

// Live messaging between two RightSeat users. A thread is one pair of people
// (stored with the smaller id first). Contact info is masked by the database
// until the two have a confirmed booking together.

const pair = (x, y) => (x < y ? [x, y] : [y, x]);
const timeAgo = (iso) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export { timeAgo };

export async function fetchThreads(uid) {
  const { data: threads, error } = await supabase.from('threads').select('*').or(`a.eq.${uid},b.eq.${uid}`)
    .not('last_message_at', 'is', null).order('last_message_at', { ascending: false }).limit(100);
  if (error) throw error;
  if (!threads.length) return [];
  const others = threads.map((t) => (t.a === uid ? t.b : t.a));
  const [{ data: people }, lasts] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url').in('id', others),
    Promise.all(threads.map((t) => supabase.from('messages').select('body, sender_id, created_at').eq('thread_id', t.id).order('created_at', { ascending: false }).limit(1).maybeSingle())),
  ]);
  return threads.map((t, i) => {
    const other = others[i];
    const p = (people || []).find((x) => x.id === other) || {};
    const last = lasts[i].data;
    const myRead = t.a === uid ? t.a_read_at : t.b_read_at;
    return {
      id: t.id, other, name: p.full_name || 'RightSeat member', photo: p.avatar_url || null,
      last: last ? { text: last.body, mine: last.sender_id === uid, at: timeAgo(last.created_at) } : null,
      unread: !!(last && last.sender_id !== uid && (!myRead || new Date(myRead) < new Date(last.created_at))),
    };
  });
}

export async function threadWith(uid, other) {
  const [a, b] = pair(uid, other);
  const found = await supabase.from('threads').select('*').eq('a', a).eq('b', b).maybeSingle();
  if (found.data) return found.data;
  const made = await supabase.from('threads').insert({ a, b }).select().single();
  if (made.error?.code === '23505') return (await supabase.from('threads').select('*').eq('a', a).eq('b', b).single()).data;
  if (made.error) throw made.error;
  return made.data;
}

export async function fetchMessages(threadId) {
  const { data, error } = await supabase.from('messages').select('id, sender_id, body, flagged, created_at').eq('thread_id', threadId).order('created_at').limit(500);
  if (error) throw error;
  return data;
}

export async function sendMessage(threadId, uid, body) {
  const { data, error } = await supabase.from('messages').insert({ thread_id: threadId, sender_id: uid, body }).select('id, sender_id, body, flagged, created_at').single();
  if (error) throw error;
  return data;
}

export async function markRead(thread, uid) {
  const col = thread.a === uid ? 'a_read_at' : 'b_read_at';
  await supabase.from('threads').update({ [col]: new Date().toISOString() }).eq('id', thread.id);
}

// New messages as they arrive (falls back to the caller's polling if realtime isn't available).
export function subscribe(threadId, onMessage) {
  const ch = supabase.channel('thread-' + threadId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, (p) => onMessage(p.new))
    .subscribe();
  return () => supabase.removeChannel(ch);
}
