// path: lib/late-report/duty.ts (ฝั่ง server) — หาครูเวรจับสายของวันที่ระบุ
import type { SupabaseClient } from "@supabase/supabase-js";

export const LATE_DUTY_POINT_ID = "c93c2d7b-0084-4606-93f5-6433d26e7246";   // duty_points: "ดูแลนักเรียนมาสาย" (จุดที่ 2)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// คอลัมน์ที่ไม่ใช่ "ครูเวร" — กันนับคนสร้างตารางเวรเป็นครูเวรโดยไม่ตั้งใจ
const SKIP = /^(id|duty_point_id|created_by|updated_by|assigned_by|academic_year_id)$/;

function collectIds(v: any, out: string[], key = "") {
  if (SKIP.test(key)) return;
  if (typeof v === "string") { if (UUID.test(v) && !out.includes(v)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => collectIds(x, out, key));
  else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => collectIds(x, out, k));
}

export type DutyLookup = { ids: string[]; debug: any };

/**
 * โครงสร้างเวรของระบบ:
 *   duty_assignments (วัน + จุดเวร)  →  duty_time_slots (ช่วงเวลา เช่น 08:00–09:00)  →  duty_slot_assignments (time_slot_id, teacher_id, sort_order)
 * คืน users.id ของครูเวรจุด "ดูแลนักเรียนมาสาย" เรียงตามช่วงเวลา แล้ว sort_order  + ข้อมูลวินิจฉัย
 * (ยังรองรับคอลัมน์รายชื่อแบบเก่า morning_teachers / afternoon_teachers ถ้ามี)
 */
export async function lateDutyLookup(db: SupabaseClient, date: string): Promise<DutyLookup> {
  const debug: any = { date };
  const ids: string[] = [];
  const pushId = (v: any) => { if (typeof v === "string" && UUID.test(v) && !ids.includes(v)) ids.push(v); };

  // 1) จุดเวร: รหัสคงที่ + จุดที่ชื่อมีคำว่า "มาสาย"
  const pointIds = new Set<string>([LATE_DUTY_POINT_ID]);
  try {
    const { data: pts, error } = await db.from("duty_points").select("*");
    debug.pointsError = error?.message ?? null;
    (pts ?? []).forEach((p: any) => {
      if (Object.values(p).some((v) => typeof v === "string" && v.includes("มาสาย"))) pointIds.add(p.id);
    });
  } catch (e: any) { debug.pointsError = String(e?.message ?? e); }
  debug.pointIds = [...pointIds];

  // 2) duty_assignments ของวันนั้น (เฉพาะจุดมาสาย)
  const { data: aRows, error: aErr } = await db.from("duty_assignments").select("*").eq("duty_date", date);
  debug.assignmentsError = aErr?.message ?? null;
  debug.assignmentRowsForDate = aRows?.length ?? 0;
  debug.assignmentColumns = aRows?.[0] ? Object.keys(aRows[0]) : null;
  const matchedA = (aRows ?? []).filter((r: any) => pointIds.has(r.duty_point_id));
  debug.assignmentsMatched = matchedA.length;
  const aIds = matchedA.map((r: any) => r.id).filter(Boolean);

  // แบบเก่า: รายชื่อเก็บเป็นอาร์เรย์ในแถวเลย
  matchedA.forEach((r: any) => {
    collectIds(r.morning_teachers, ids, "morning_teachers");
    collectIds(r.afternoon_teachers, ids, "afternoon_teachers");
  });

  // 3) duty_time_slots ของแถวเหล่านั้น — ลองชื่อคอลัมน์อ้างอิงที่เป็นไปได้ แล้วค่อยลอง วัน+จุด
  try {
    const { data: probe } = await db.from("duty_time_slots").select("*").limit(1);
    debug.timeSlotColumns = probe?.[0] ? Object.keys(probe[0]) : null;
  } catch { /* ignore */ }

  let slots: any[] = [];
  const attempts: any[] = [];
  const tryQuery = async (label: string, q: any) => {
    const { data, error } = await q;
    attempts.push({ label, error: error?.message ?? null, rows: data?.length ?? 0 });
    if (!error && data?.length) { slots = data; return true; }
    return false;
  };
  if (aIds.length) {
    for (const col of ["duty_assignment_id", "assignment_id", "duty_id"]) {
      if (await tryQuery(col, db.from("duty_time_slots").select("*").in(col, aIds))) break;
    }
  }
  if (!slots.length) {
    await tryQuery("duty_date+duty_point_id", db.from("duty_time_slots").select("*").eq("duty_date", date).in("duty_point_id", [...pointIds]));
  }
  debug.timeSlotAttempts = attempts;
  debug.timeSlotsFound = slots.length;

  // 4) ครูในแต่ละช่วงเวลา
  if (slots.length) {
    slots.sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")));
    const { data: sa, error: saErr } = await db.from("duty_slot_assignments").select("*").in("time_slot_id", slots.map((s) => s.id));
    debug.slotAssignmentsError = saErr?.message ?? null;
    debug.slotAssignmentsFound = sa?.length ?? 0;
    slots.forEach((s) => {
      (sa ?? []).filter((x: any) => x.time_slot_id === s.id)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((x: any) => pushId(x.teacher_id));
    });
  }

  debug.teacherIdsFound = ids.length;
  return { ids, debug };
}

export async function lateDutyTeacherIds(db: SupabaseClient, date: string): Promise<string[]> {
  return (await lateDutyLookup(db, date)).ids;
}