// lib/smartclass/sectionAccess.ts
// ห้องเทอม 2 ของ ป.4-6 / ม.1-6 ถูกสร้างแยกจากเทอม 1 และไม่มีรายชื่อ นร. ของตัวเอง
// นร. จึงยังสังกัดห้องเทอม 1 (students.classroom_id) แต่ section เทอม 2 อยู่ในห้องเทอม 2
// ฟังก์ชันนี้ตรวจว่า section เป็นของ นร. หรือไม่ โดยไล่ตาม previous_section_id ไปหาห้องของ นร.
// ใช้ admin client เสมอ (subject_sections ติด RLS สำหรับ role anon)

export type SectionLite = {
  id: string;
  classroom_id: string;
  previous_section_id?: string | null;
};

export async function studentOwnsSection(
  admin: any,
  studentClassroomId: string,
  section: SectionLite
): Promise<boolean> {
  if (section.classroom_id === studentClassroomId) return true;
  let prev: string | null = section.previous_section_id ?? null;
  for (let hop = 0; prev && hop < 5; hop++) {
    const { data } = await admin
      .from("subject_sections")
      .select("classroom_id, previous_section_id")
      .eq("id", prev)
      .maybeSingle();
    if (!data) return false;
    if (data.classroom_id === studentClassroomId) return true;
    prev = data.previous_section_id ?? null;
  }
  return false;
}