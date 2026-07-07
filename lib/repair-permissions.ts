import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export type RepairScope =
  | { kind: 'all' }
  | { kind: 'buildings'; buildingIds: string[] };

export interface RepairAccess {
  user: { id: string; role: string; full_name: string } | null;
  isSupervisor: boolean;
  isManagement: boolean;
  scope: RepairScope;
}

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

export async function getRepairAccess(): Promise<RepairAccess> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return { user: null, isSupervisor: false, isManagement: false, scope: { kind: 'buildings', buildingIds: [] } };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, title, first_name, last_name, full_name')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (!profile) {
    return { user: null, isSupervisor: false, isManagement: false, scope: { kind: 'buildings', buildingIds: [] } };
  }

  const isManagement = ['admin', 'director', 'deputy_director'].includes(profile.role);

  const { data: supervisorRow } = await supabase
    .from('repair_project_supervisors')
    .select('id')
    .eq('user_id', profile.id)
    .maybeSingle();
  const isSupervisor = !!supervisorRow;

  let scope: RepairScope;
  if (isManagement || isSupervisor) {
    scope = { kind: 'all' };
  } else {
    const { data: buildings } = await supabase.from('buildings').select('id, repair_user_ids');
    const myBuildings = (buildings ?? [])
      .filter((b: any) => Array.isArray(b.repair_user_ids) && b.repair_user_ids.includes(profile.id))
      .map((b: any) => b.id);
    scope = { kind: 'buildings', buildingIds: myBuildings };
  }

  return {
    user: { id: profile.id, role: profile.role, full_name: fullName(profile) },
    isSupervisor,
    isManagement,
    scope,
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

export async function listProjectSupervisors() {
  const { data, error } = await supabase
    .from('repair_project_supervisors')
    .select('user_id, users:user_id (id, title, first_name, last_name, full_name, position)');
  if (error) throw error;
  return data ?? [];
}

export async function addProjectSupervisor(userId: string) {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_id', authUser?.id).maybeSingle();
  const { error } = await supabase
    .from('repair_project_supervisors')
    .insert({ user_id: userId, added_by: me?.id });
  if (error) throw error;
}

export async function removeProjectSupervisor(userId: string) {
  const { error } = await supabase.from('repair_project_supervisors').delete().eq('user_id', userId);
  if (error) throw error;
}