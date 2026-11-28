import type { SupabaseClient } from "@supabase/supabase-js";

// TODO: ตารางที่เก็บชื่อครู (id ต้องตรงกับ classrooms.homeroom_teacher_id)
const TEACHER_TABLE = "profiles";
const NAME_COL = "full_name";
const PHONE_COL = "phone"; // ถ้าไม่มีคอลัมน์นี้ ระบบจะข้ามเบอร์โทรให้เอง

export type HRTeacher = { name: string; phone: string | null };
export type HRClassroom = { id: string; name: string; grade: string; teachers: HRTeacher[] };

export async function loadClassrooms(sb: SupabaseClient, opts: { id?: string } = {}): Promise<HRClassroom[]> {
  const cols = "id, room_name, room_number, grade_group, homeroom_teacher_id, homeroom_teacher_2_id, academic_year_id, created_at";

  let rows: any[];
  if (opts.id) {
    const { data, error } = await sb.from("classrooms").select(cols).eq("id", opts.id);
    if (error) throw error;
    rows = data ?? [];
  } else {
    const { data, error } = await sb.from("classrooms").select(cols).order("created_at", { ascending: false });
    if (error) throw error;
    rows = data ?? [];
    // เอาเฉพาะปีการศึกษาล่าสุด (ดูจากห้องที่สร้างล่าสุด)
    const latest = rows[0]?.academic_year_id;
    if (latest) rows = rows.filter(r => r.academic_year_id === latest);
  }

  const ids = [...new Set(rows.flatMap(r => [r.homeroom_teacher_id, r.homeroom_teacher_2_id]).filter(Boolean))] as string[];

  const tmap = new Map<string, HRTeacher>();
  if (ids.length) {
    let res: any = await sb.from(TEACHER_TABLE).select(`id, ${NAME_COL}, ${PHONE_COL}`).in("id", ids);
    if (res.error) res = await sb.from(TEACHER_TABLE).select(`id, ${NAME_COL}`).in("id", ids); // ไม่มีคอลัมน์เบอร์
    if (res.error) throw res.error;
    for (const t of res.data ?? []) tmap.set(t.id, { name: t[NAME_COL], phone: t[PHONE_COL] ?? null });
  }

  return rows
    .map(r => {
      const name: string = r.room_name ?? `ห้อง ${r.room_number}`;
      const grade = name.includes("/") ? name.split("/")[0].trim() : (r.grade_group ?? name);
      const teachers = [r.homeroom_teacher_id, r.homeroom_teacher_2_id]
        .map((id: string | null) => (id ? tmap.get(id) : undefined))
        .filter(Boolean) as HRTeacher[];
      return { id: r.id, name, grade, teachers };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "th", { numeric: true }));
}