// path: lib/late-report/duty.ts (ฝั่ง server) — หาครูเวรจับสายของวันที่ระบุ
import type { SupabaseClient } from "@supabase/supabase-js";

export const LATE_DUTY_POINT_ID = "c93c2d7b-0084-4606-93f5-6433d26e7246";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// คอลัมน์ที่ไม่ใช่ "ครูเวร" — กันนับคนสร้างตารางเวรเป็นครูเวรโดยไม่ตั้งใจ
const SKIP = /^(id|duty_point_id|created_by|updated_by|assigned_by|academic_year_id)$/;

function collectIds(v: any, out: string[], key = "") {
  if (SKIP.test(key)) return;
  if (typeof v === "string") { if (UUID.test(v) && !out.includes(v)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => collectIds(x, out, key));
  else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => collectIds(x, out, k));
}

/**
 * คืน users.id ของครูเวรจุด "ดูแลนักเรียนมาสาย" ของวันนั้น (เรียง เช้า → บ่าย → ช่องอื่น ๆ)
 * - ไม่ยึดแถวเดียวแบบ maybeSingle (ถ้ามีหลายแถวต่อวันจะไม่พัง)
 * - นอกจากรหัสจุดที่กำหนด ยังจับจุดที่ชื่อมีคำว่า "มาสาย" จากตาราง duty_points ด้วย
 */
export async function lateDutyTeacherIds(db: SupabaseClient, date: string): Promise<string[]> {
  const pointIds = new Set<string>([LATE_DUTY_POINT_ID]);
  try {
    const { data: pts } = await db.from("duty_points").select("*");
    (pts ?? []).forEach((p: any) => {
      if (Object.values(p).some((v) => typeof v === "string" && v.includes("มาสาย"))) pointIds.add(p.id);
    });
  } catch { /* ไม่มีตาราง duty_points ก็ใช้รหัสคงที่ */ }

  const { data: rows } = await db.from("duty_assignments").select("*").eq("duty_date", date);
  const ids: string[] = [];
  (rows ?? []).filter((r: any) => pointIds.has(r.duty_point_id)).forEach((r: any) => {
    collectIds(r.morning_teachers, ids, "morning_teachers");
    collectIds(r.afternoon_teachers, ids, "afternoon_teachers");
    Object.entries(r).forEach(([k, v]) => {
      if (k !== "morning_teachers" && k !== "afternoon_teachers") collectIds(v, ids, k);
    });
  });
  return ids;
}