import { NextResponse } from "next/server";
import { getMe } from "@/lib/visitors/admin-auth"; // รับทั้ง Bearer token และ cookie
import { admin, personName } from "@/lib/late-report/server";
import { lateDutyTeacherIds } from "@/lib/late-report/duty";
import { buildReportRows, bangkokToday } from "@/lib/late-report/rows";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const who = await getMe(req);
  if (!who) return err("ยังไม่ได้เข้าสู่ระบบ", 401);

  const db = admin();
  const { data: me } = await db.from("users").select("*").eq("id", who.id).maybeSingle();
  if (!me) return err("ไม่พบข้อมูลผู้ใช้", 403);

  const body = await req.json().catch(() => ({}));
  const today = bangkokToday();
  const isAdmin = me.role === "admin";

  // แอดมินเลือกวันที่ (รวมย้อนหลัง) ได้ — ครูทั่วไปสร้างได้เฉพาะวันนี้
  let date = today;
  if (isAdmin && typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    if (body.date > today) return err("เลือกวันที่ในอนาคตไม่ได้", 400);
    date = body.date;
  }

  const dutyIds = await lateDutyTeacherIds(db, date);

  // ผู้รายงาน: ครูทั่วไป = ตัวเอง (ต้องเป็นเวรวันนี้) / แอดมิน = ครูเวรจับสายของวันนั้น (ใช้ชื่อ+ลายเซนของครูเวร)
  let reporter: any;
  if (isAdmin) {
    if (!dutyIds.length) return err(`ไม่พบครูเวรจับสายของวันที่ ${date} ในตารางเวร`, 400);
    const { data: ts } = await db.from("users").select("*").in("id", dutyIds);
    const ordered = dutyIds.map((id) => (ts ?? []).find((t: any) => t.id === id)).filter(Boolean) as any[];
    reporter = (body?.reporter_id && ordered.find((t) => t.id === body.reporter_id)) || ordered[0];
    if (!reporter) return err("ไม่พบข้อมูลครูเวรจับสาย", 400);
  } else {
    if (!dutyIds.includes(me.id)) return err("เฉพาะครูเวรจับสายของวันนี้เท่านั้นที่สร้างรายงานได้", 403);
    reporter = me;
  }
  if (!reporter.signature_url)
    return err(`${personName(reporter)} ยังไม่มีลายเซนในระบบ กรุณาให้ครูท่านนี้เซ็นลายเซนก่อน (ใช้ลายเซนเดียวกับระบบลา)`, 400);

  const { data: existing } = await db.from("late_reports").select("id,status").eq("report_date", date).maybeSingle();
  if (existing && existing.status !== "rejected") return err("วันที่นี้มีรายงานที่ส่งแล้ว", 409);
  if (existing) await db.from("late_reports").delete().eq("id", existing.id); // ถูกตีกลับ → สร้างใหม่

  // นับยอดฝั่ง server (กันแก้ตัวเลขจาก client)
  const [{ data: rooms }, { data: lateRaw }] = await Promise.all([
    db.from("classrooms").select("room_name, grade_group"),
    db.from("attendance_records")
      .select("student:students(classroom:classrooms(room_name, grade_group))")
      .eq("attendance_date", date).eq("status", "late"),
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
    report_date: date, reporter_id: reporter.id, reporter_name: personName(reporter),
    reporter_signature_path: reporter.signature_url, rows, total,
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

  // TODO: ส่งแจ้งเตือนถึง approvers[pendingIdx].approver_id ที่นี่ (ถ้ามีระบบ notifications อยู่แล้ว)
  return NextResponse.json({ id: report.id, total, date, reporter: personName(reporter) });
}