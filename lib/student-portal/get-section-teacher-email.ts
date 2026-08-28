import { createAdminClient } from "@/lib/supabase/admin";

// ★ ดึง email ครูผู้สอนของ subject_section เพื่อใช้เป็น account ตอนอัปโหลดไฟล์ขึ้น OneDrive
// (ไฟล์ที่ นร. ส่งจะถูกเก็บไว้ใน OneDrive ของครูประจำวิชานั้น เหมือนที่ครูแนบไฟล์ตอนมอบหมายงาน)
export async function getSectionTeacherEmail(sectionId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: section } = await supabase
    .from("subject_sections")
    .select("teacher_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section?.teacher_id) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", section.teacher_id)
    .maybeSingle();
  return profile?.email ?? null;
}