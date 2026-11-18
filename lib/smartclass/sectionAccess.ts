// lib/smartclass/sectionAccess.ts
// ห้องเทอม 2 ของ ป.4-6 / ม.1-6 ถูกสร้างแยกจากเทอม 1 และไม่มีรายชื่อ นร. ของตัวเอง
// นร. จึงยังสังกัดห้องเทอม 1 (students.classroom_id) แต่ section เทอม 2 อยู่ในห้องเทอม 2
// ใช้ admin client เสมอ (subject_sections ติด RLS สำหรับ role anon)

export type SectionLite = {
  id: string;
  classroom_id: string;
  previous_section_id?: string | null;
};

/** ห้องของ นร. + ห้องอื่นที่ชื่อห้องเดียวกัน (= ห้องเทอมอื่นของห้องเดียวกัน) */
export async function getRelatedClassroomIds(admin: any, classroomId: string): Promise<string[]> {
  const { data: me } = await admin
    .from("classrooms")
    .select("room_name")
    .eq("id", classroomId)
    .maybeSingle();
  const name = (me?.room_name ?? "").trim();
  if (!name) return [classroomId];
  const { data: sibs } = await admin.from("classrooms").select("id").eq("room_name", name);
  const ids = new Set<string>([classroomId, ...((sibs ?? []) as { id: string }[]).map((r) => r.id)]);
  return [...ids];
}

/** section นี้เป็นของ นร. หรือไม่ (ห้องเดียวกัน / สืบมาจาก section ของห้อง นร. / ห้องเทอมอื่นชื่อเดียวกัน) */
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
    if (!data) break;
    if (data.classroom_id === studentClassroomId) return true;
    prev = data.previous_section_id ?? null;
  }

  const related = await getRelatedClassroomIds(admin, studentClassroomId);
  return related.includes(section.classroom_id);
}