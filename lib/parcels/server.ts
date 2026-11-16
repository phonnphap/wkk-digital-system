// path: lib/parcels/server.ts
import { createClient as createSb, SupabaseClient } from "@supabase/supabase-js";

export const adminDb = () =>
  createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export const personName = (u: any) =>
  (u?.full_name ?? `${u?.prefix ?? ""}${u?.first_name ?? ""} ${u?.last_name ?? ""}`).trim();

export type Teacher = { name: string; email: string };

/**
 * ★★ ต้องปรับให้ตรงกับตาราง "ครูประจำชั้น" ของคุณ ★★
 * ตอนนี้สมมติว่ามีตาราง classroom_teachers(classroom_id, user_id) และ users.email เป็นอีเมล Microsoft/Teams ของครู
 * (ดูได้จากฟังก์ชัน get_my_classrooms ว่าอ่านจากตารางไหน แล้วใช้ตารางเดียวกัน)
 */
export async function getHomeroomTeachers(db: SupabaseClient, classroomId: string): Promise<Teacher[]> {
  const { data } = await db
    .from("classroom_teachers")
    .select("user:users(email, full_name, prefix, first_name, last_name)")
    .eq("classroom_id", classroomId);
  return (data ?? [])
    .map((r: any) => ({ name: personName(r.user), email: r.user?.email as string }))
    .filter((t) => !!t.email);
}

/** ส่งเข้า Power Automate (HTTP trigger) → flow โพสต์แชท Teams ถึงครูตามอีเมล */
export async function notifyTeams(payload: Record<string, unknown>) {
  const url = process.env.TEAMS_PARCEL_WEBHOOK_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า TEAMS_PARCEL_WEBHOOK_URL");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Teams webhook ${res.status}`);
}