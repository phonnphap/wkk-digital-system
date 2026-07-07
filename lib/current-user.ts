import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export interface CurrentUserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email: string;
  role: string;
}

// ★ สมมติฐาน: ตาราง users มีคอลัมน์ auth_id, first_name, last_name, full_name, email, role
// (ใช้ pattern เดียวกับระบบตารางสอน/ปฏิทินกิจกรรมในโปรเจกต์นี้ — ถ้าโครงสร้างไม่ตรง แจ้งได้)
export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const meta = authUser.user_metadata ?? {};
  const email = authUser.email || meta.email || meta.preferred_username || meta.upn || '';

  let profile: any = null;
  const { data: byAuthId } = await supabase
    .from('users')
    .select('id,first_name,last_name,full_name,email,role')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  profile = byAuthId;

  if (!profile && email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id,first_name,last_name,full_name,email,role')
      .eq('email', email)
      .maybeSingle();
    profile = byEmail;
  }

  if (!profile) return null;

  return {
    ...profile,
    full_name: profile.full_name || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
  };
}

// ★ สมมติฐาน: role ที่นับเป็น "แอดมิน" ในระบบนี้ — ถ้ามี role อื่นที่ควรนับด้วย (เช่น deputy_director) แจ้งเพิ่มได้
export const ADMIN_ROLES = ['admin', 'director', 'deputy_director'];