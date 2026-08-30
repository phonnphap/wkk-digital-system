import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// อีเมลผู้อนุมัติ — ใช้อ้างอิงเดียวกับระบบ PLC
const TRAINING_DEPUTY_EMAIL = 'titima@khienkhet.ac.th';
const TRAINING_DIRECTOR_EMAIL = 'thananut@khienkhet.ac.th';

export interface TrainingAccess {
  user: { id: string; role: string; full_name: string; signature_url?: string } | null;
  canViewAll: boolean;
  isAdmin: boolean;
  isManagement: boolean; // ผู้บริหาร/ผู้ดูแลโครงการ — ใช้ตัดสินสิทธิ์ "แก้ไขแทนคนอื่น" เท่านั้น (ไม่ใช่สิทธิ์ดู)
}

export interface Approver {
  name: string;
  signature_url?: string;
}

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

export async function getTrainingAccess(): Promise<TrainingAccess> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { user: null, canViewAll: false, isAdmin: false, isManagement: false };

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, title, first_name, last_name, full_name, signature_url')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (!profile) return { user: null, canViewAll: false, isAdmin: false, isManagement: false };

  const isAdmin = profile.role === 'admin';
  const isManagementRole = ['admin', 'director', 'deputy_director'].includes(profile.role);

  const { data: supervisorRow } = await supabase
    .from('training_project_supervisors')
    .select('id')
    .eq('user_id', profile.id)
    .maybeSingle();

  const isManagement = isManagementRole || !!supervisorRow;

  return {
    user: {
      id: profile.id,
      role: profile.role,
      full_name: fullName(profile),
      signature_url: profile.signature_url ?? undefined,
    },
    canViewAll: true, // ✅ ทุกคนเห็นรายงานของทุกคนได้เสมอ
    isAdmin,
    isManagement, // ✅ ใช้แยกสิทธิ์ "แก้ไข/บันทึกแทนผู้อื่น" เท่านั้น ไม่เกี่ยวกับการดู
  };
}

export async function getAllTeachers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, title, first_name, last_name, full_name, position, role, signature_url')
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

// ✅ ดึงชื่อ-นามสกุล และลายเซ็นของ "รองฝ่ายบุคคล" และ "ผอ." อัตโนมัติจากตาราง users ตามอีเมลที่ fix ไว้
// (เหมือนระบบ PLC แต่ดึงชื่อสดจากฐานข้อมูลแทนการ hardcode ชื่อ เผื่อมีการเปลี่ยนตัวคน)
export async function getTrainingApprovers(): Promise<{ deputy: Approver | null; director: Approver | null }> {
  const { data, error } = await supabase
    .from('users')
    .select('email, title, first_name, last_name, full_name, signature_url')
    .in('email', [TRAINING_DEPUTY_EMAIL, TRAINING_DIRECTOR_EMAIL]);
  if (error) throw error;

  const deputyRow = (data ?? []).find((u: any) => u.email === TRAINING_DEPUTY_EMAIL);
  const directorRow = (data ?? []).find((u: any) => u.email === TRAINING_DIRECTOR_EMAIL);

  return {
    deputy: deputyRow ? { name: fullName(deputyRow), signature_url: deputyRow.signature_url ?? undefined } : null,
    director: directorRow ? { name: fullName(directorRow), signature_url: directorRow.signature_url ?? undefined } : null,
  };
}