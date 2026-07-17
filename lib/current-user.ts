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

    // ★ เจอ user จาก email แต่ auth_id ยังไม่ถูกผูกไว้ -> ผูกให้เลยตอนนี้ (self-heal)
    // ป้องกันปัญหาฝั่ง backend (เช่นฟังก์ชัน upsert_award ที่ query จาก auth_id ตรงๆ)
    // ที่จะหา user ไม่เจอเพราะ auth_id เป็น null แล้วได้ created_by ผิด/ว่างไปเรื่อยๆ
    if (profile) {
      const { error: linkErr } = await supabase
        .from('users')
        .update({ auth_id: authUser.id })
        .eq('id', profile.id);
      if (linkErr) {
        console.error('[getCurrentUserProfile] ผูก auth_id ไม่สำเร็จ:', linkErr.message, linkErr);
      }
    }
  }

  if (!profile) return null;

  return {
    ...profile,
    full_name: profile.full_name || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
  };
}

// ★ สมมติฐาน: role ที่นับเป็น "แอดมิน" ในระบบนี้ — ถ้ามี role อื่นที่ควรนับด้วย แจ้งเพิ่มได้
export const ADMIN_ROLES = ['admin', 'director', 'deputy_director'];