import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export interface TrainingAccess {
  user: { id: string; role: string; full_name: string } | null;
  canViewAll: boolean;
  isAdmin: boolean;
}

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

export async function getTrainingAccess(): Promise<TrainingAccess> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { user: null, canViewAll: false, isAdmin: false };

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, title, first_name, last_name, full_name')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (!profile) return { user: null, canViewAll: false, isAdmin: false };

  const isAdmin = profile.role === 'admin';
  const isManagement = ['admin', 'director', 'deputy_director'].includes(profile.role);

  const { data: supervisorRow } = await supabase
    .from('training_project_supervisors')
    .select('id')
    .eq('user_id', profile.id)
    .maybeSingle();

  return {
    user: { id: profile.id, role: profile.role, full_name: fullName(profile) },
    canViewAll: isManagement || !!supervisorRow,
    isAdmin,
  };
}

export async function getAllTeachers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, title, first_name, last_name, full_name, position, role')
    .order('first_name');
  if (error) throw error;
  return data ?? [];
}

export async function listTrainingSupervisors() {
  const { data, error } = await supabase
    .from('training_project_supervisors')
    .select('id, user_id, users:user_id (id, title, first_name, last_name, full_name, position)');
  if (error) throw error;
  return data ?? [];
}

export async function addTrainingSupervisor(userId: string) {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_id', authUser?.id).maybeSingle();
  const { error } = await supabase
    .from('training_project_supervisors')
    .insert({ user_id: userId, added_by: me?.id });
  if (error) throw error;
}

export async function removeTrainingSupervisor(rowId: string) {
  const { error } = await supabase.from('training_project_supervisors').delete().eq('id', rowId);
  if (error) throw error;
}

export async function getTargetHoursPerYear(): Promise<number> {
  const { data, error } = await supabase.from('training_settings').select('target_hours_per_year').eq('id', 1).maybeSingle();
  if (error) throw error;
  return Number(data?.target_hours_per_year ?? 20);
}

export async function setTargetHoursPerYear(hours: number) {
  const { error } = await supabase.from('training_settings').update({ target_hours_per_year: hours }).eq('id', 1);
  if (error) throw error;
}