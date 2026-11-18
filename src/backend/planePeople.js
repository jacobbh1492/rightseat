// Plane people: co-owners, managers and view-only members of a plane
// (migration 20261118000000_plane_people.sql). Payouts always stay with the owner.
import { supabase } from './supabase';

export const ROLES = {
  co_owner: {
    label: 'Co-owner',
    short: 'Everything except payouts',
    can: ['Approve bookings & checkouts', 'Edit rates & rules', 'Close squawks', 'See earnings', 'Add & remove people'],
    cant: ['Change where payouts go'],
  },
  manager: {
    label: 'Manager',
    short: 'Bookings, checkouts, rates & squawks',
    can: ['Approve bookings & checkouts', 'Edit rates & rules', 'Close squawks'],
    cant: ['See earnings', 'Add or remove people'],
  },
  viewer: {
    label: 'View only',
    short: 'Sees the calendar and status',
    can: ['See the calendar and plane status'],
    cant: ['Change anything'],
  },
};

// What each role can do, for the permissions table on the People screen.
export const PERMISSIONS = [
  { label: 'Bookings & checkouts', owner: true, co_owner: true, manager: true, viewer: false },
  { label: 'Rates & rules', owner: true, co_owner: true, manager: true, viewer: false },
  { label: 'Squawks', owner: true, co_owner: true, manager: true, viewer: false },
  { label: 'Earnings', owner: true, co_owner: true, manager: false, viewer: false },
  { label: 'Add people', owner: true, co_owner: true, manager: false, viewer: false },
  { label: 'Payouts', owner: true, co_owner: false, manager: false, viewer: false },
];

export const canManage = (role) => ['owner', 'co_owner', 'manager'].includes(role);
export const canSeeEarnings = (role) => ['owner', 'co_owner'].includes(role);
export const canAddPeople = (role) => ['owner', 'co_owner'].includes(role);

const fromRow = (m, names = {}) => ({
  id: m.id, planeId: m.plane_id, email: m.email, userId: m.user_id, role: m.role, status: m.status,
  name: names[m.user_id] || m.name || m.email, invitedBy: m.invited_by, invitedByName: names[m.invited_by] || null,
  note: m.note || '', expiresAt: m.expires_at, expired: m.status === 'invited' && new Date(m.expires_at) < new Date(),
});

// Everyone on one plane: the owner first, then active people, then pending invites.
export async function fetchPlanePeople(planeId) {
  const [{ data: plane, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    supabase.from('planes').select('id, tail, make, model, owner_id').eq('id', planeId).maybeSingle(),
    supabase.from('plane_members').select('*').eq('plane_id', planeId).in('status', ['invited', 'active']).order('created_at'),
  ]);
  if (e1 || e2) throw e1 || e2;
  const ids = [...new Set([plane?.owner_id, ...(rows || []).flatMap((m) => [m.user_id, m.invited_by])].filter(Boolean))];
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const names = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || '']));
  const people = (rows || []).map((m) => fromRow(m, names));
  return {
    plane: plane && { id: plane.id, tail: plane.tail, make: plane.make, model: plane.model, ownerId: plane.owner_id },
    owner: plane ? { userId: plane.owner_id, name: names[plane.owner_id] || 'Owner', role: 'owner' } : null,
    active: people.filter((p) => p.status === 'active'),
    pending: people.filter((p) => p.status === 'invited'),
  };
}

// Is this email already on Positive Rate? Returns { fullName } or null.
export async function findPilot(planeId, email) {
  const { data, error } = await supabase.rpc('find_pilot_for_plane', { p_plane: planeId, p_email: email });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { fullName: row.full_name || '', avatarUrl: row.avatar_url || null } : null;
}

// Existing users are added right away; anyone else gets a 7-day invite.
export async function addPlanePerson(planeId, { email, role, name = '', note = '' }) {
  const { data, error } = await supabase.rpc('add_plane_member', { p_plane: planeId, p_email: email, p_role: role, p_name: name, p_note: note });
  if (error) throw error;
  return fromRow(data);
}

export async function setPlanePersonRole(id, role) {
  const { error } = await supabase.rpc('set_plane_member_role', { p_id: id, p_role: role });
  if (error) throw error;
}

export async function removePlanePerson(id) {
  const { error } = await supabase.rpc('remove_plane_member', { p_id: id });
  if (error) throw error;
}

export async function respondPlaneInvite(id, accept) {
  const { data, error } = await supabase.rpc('respond_plane_invite', { p_id: id, p_accept: accept });
  if (error) throw error;
  return data;
}

// The signed-in user's memberships: invites waiting for them and planes they help run.
export async function fetchMyPlaneAccess() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const email = (user.email || '').toLowerCase();
  const { data, error } = await supabase.from('plane_members').select('*').in('status', ['invited', 'active'])
    .or(`user_id.eq.${user.id},email.eq.${email}`);
  if (error) throw error;
  const rows = data || [];
  const planeIds = [...new Set(rows.filter((m) => m.status === 'active').map((m) => m.plane_id))];
  const inviters = [...new Set(rows.map((m) => m.invited_by).filter(Boolean))];
  const [{ data: planes }, { data: names }] = await Promise.all([
    planeIds.length ? supabase.from('planes').select('id, tail, make, model, home_airport, owner_id').in('id', planeIds) : { data: [] },
    inviters.length ? supabase.from('profiles').select('id, full_name').in('id', inviters) : { data: [] },
  ]);
  const planeBy = Object.fromEntries((planes || []).map((p) => [p.id, p]));
  const nameBy = Object.fromEntries((names || []).map((p) => [p.id, p.full_name || '']));
  return rows.map((m) => ({ ...fromRow(m, nameBy), from: nameBy[m.invited_by] || 'A plane owner', plane: planeBy[m.plane_id] || null }));
}

// Active roles by plane id, for the store: { [planeId]: 'co_owner' | 'manager' | 'viewer' }.
export async function fetchMyPlaneRoles(uid) {
  if (!uid) return {};
  const { data } = await supabase.from('plane_members').select('plane_id, role').eq('user_id', uid).eq('status', 'active');
  return Object.fromEntries((data || []).map((m) => [m.plane_id, m.role]));
}

// The message an owner shares (text or email) with someone who isn't on the app yet.
export const inviteMessage = ({ fromName, tail, role, email }) =>
  `${fromName || 'I'} added you as ${role === 'co_owner' ? 'a co-owner' : role === 'manager' ? 'a manager' : 'a viewer'} of ${tail} on Positive Rate. `
  + `Download the app and sign up with ${email} to accept: https://positiverate.app`;
