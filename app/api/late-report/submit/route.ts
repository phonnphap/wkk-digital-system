import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ★ server client (cookie-based) ของโปรเจกต์
import { admin, personName } from "@/lib/late-report/server";
import { buildReportRows, bangkokToday } from "@/lib/late-report/rows";

const LATE_DUTY_POINT_ID = "c93c2d7b-0084-4606-93f5-6433d26e7246";
const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return err("ยังไม่ได้เข้าสู่ระบบ", 401);

  const db = admin();
  const { data: me } = await db.from("users").select("*").eq("auth_id", user.id).maybeSingle();
  if (!me) return err("ไม่พบข้อมูลผู้ใช้", 403);

  const today = bangkokToday();

  // ต้องเป็นครูเวรจุด "ดูแลนักเรียนมาสาย" ของวันนี้ (admin ข้ามได้)
  if (me.role !== "admin") {
    const { data: duty } = await db.from("duty_assignments")
      .select("morning_teachers, afternoon_teachers")
      .eq("duty_date", today).eq("duty_point_id", LATE_DUTY_POINT_ID).maybeSingle();
    const ids: string[] = [...(duty?.morning_teachers ?? []), ...(duty?.afternoon_teachers ?? [])];
    if (!ids.includes(me.id)) return err("เฉพาะครูเวรจับสายของวันนี้เท่านั้นที่สร้างรายงานได้", 403);
  }
  if (!me.signature_path) return err("ยังไม่มีลายเซนของคุณในระบบ กรุณาอัปโหลดลายเซนก่อน", 400);

  const { data: existing } = await db.from("late_reports").select("id,status").eq("report_date", today).maybeSingle();
  if (existing && existing.status !== "rejected") return err("วันนี้มีรายงานที่ส่งแล้ว", 409);
  if (existing) await db.from("late_reports").delete().eq("id", existing.id); // ถูกตีกลับ → สร้างใหม่

  // นับยอดฝั่ง server (กันแก้ตัวเลขจาก client)
  const [{ data: rooms }, { data: lateRaw }] = await Promise.all([
    db.from("classrooms").select("room_name, grade_group"),
    db.from("attendance_records")
      .select("student:students(classroom:classrooms(room_name, grade_group))")
      .eq("attendance_date", today).eq("status", "late"),
  ]);
  const late = (lateRaw ?? []).map((r: any) => r.student?.classroom).filter(Boolean);
  const { rows, total } = buildReportRows(rooms ?? [], late);

  const { data: approvers } = await db.from("late_report_approvers").select("*").order("step");
  if (!approvers?.length) return err("ยังไม่ได้ตั้งค่าผู้อนุมัติ (late_report_approvers)", 500);
  const { data: users } = await db.from("users").select("*").in("id", approvers.map((a: any) => a.approver_id));

  // ขั้นที่รออนุมัติจริง = ขั้นแรกที่ไม่ใช่ auto_follow (เช่น รองผู้อำนวยการ) — ขั้นอื่นที่ auto_follow จะถูกอนุมัติตามเมื่อขั้นนี้อนุมัติ
  const firstManual = approvers.findIndex((a: any) => !a.auto_follow);
  const pendingIdx = firstManual === -1 ? 0 : firstManual;

  const { data: report, error } = await db.from("late_reports").insert({
    report_date: today, reporter_id: me.id, reporter_name: personName(me),
    reporter_signature_path: me.signature_path, rows, total,
  }).select().single();
  if (error || !report) return err("สร้างรายงานไม่สำเร็จ: " + error?.message, 500);

  const { error: e2 } = await db.from("late_report_steps").insert(
    approvers.map((a: any, i: number) => ({
      report_id: report.id, step: a.step, step_label: a.step_label,
      approver_id: a.approver_id, approver_position: a.position_title,
      approver_name: personName(users?.find((u: any) => u.id === a.approver_id) ?? {}),
      status: i === pendingIdx ? "pending" : "waiting",
      auto_follow: !!a.auto_follow,
    }))
  );
  if (e2) { await db.from("late_reports").delete().eq("id", report.id); return err("สร้างขั้นอนุมัติไม่สำเร็จ: " + e2.message, 500); }

  // TODO: ส่งแจ้งเตือนถึง approvers[0].approver_id ที่นี่ (ถ้ามีระบบ notifications อยู่แล้ว)
  return NextResponse.json({ id: report.id, total });
}