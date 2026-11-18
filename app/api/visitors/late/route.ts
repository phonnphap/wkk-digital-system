// path: app/api/visitors/late/route.ts
// รปภ. บันทึกนักเรียนมาสาย (เขียนอย่างเดียว ไม่มีลบ/แก้ — ครูเวรแก้ได้จากหน้าจับสายเดิม)
import { NextResponse } from "next/server";
import { adminClient, requireGuard } from "@/lib/visitor-server";

export const maxDuration = 30;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

// ช่วงเวลาเดียวกับหน้าจับสายเดิม
const MARK_START = "07:45:00";
const MARK_END = "15:30:00";

export async function POST(req: Request) {
  if (!(await requireGuard(req))) return bad("unauthorized", 401);

  const form = await req.formData();
  const student_id = String(form.get("student_id") ?? "");
  const photo = form.get("photo") as File | null;
  if (!student_id) return bad("กรุณาเลือกนักเรียน");
  if (!photo) return bad("กรุณาถ่ายรูปนักเรียน");
  if (photo.size > 4 * 1024 * 1024) return bad("รูปใหญ่เกินไป");

  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });          // YYYY-MM-DD ตามเวลาไทย
  const time = now.toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Bangkok" });
  if (time < MARK_START || time > MARK_END)
    return bad(`บันทึกมาสายได้เฉพาะ ${MARK_START.slice(0, 5)}–${MARK_END.slice(0, 5)} น.`);

  const db = adminClient();

  const { data: st } = await db.from("students")
    .select("id, classroom_id, first_name, last_name").eq("id", student_id).is("moved_out_at", null).maybeSingle();
  if (!st) return bad("ไม่พบนักเรียน");

  // มีบันทึกของวันนี้อยู่แล้วหรือไม่
  const { data: ex } = await db.from("attendance_records")
    .select("id, status").eq("student_id", student_id).eq("attendance_date", date).maybeSingle();
  if (ex?.status === "late") return NextResponse.json({ ok: true, already: true });
  if (ex) return bad("นักเรียนคนนี้มีบันทึกสถานะอื่นของวันนี้แล้ว กรุณาแจ้งครูเวร");

  const path = `late/${date}/${student_id}_${Date.now()}.jpg`;
  const { error: upErr } = await db.storage.from("visitor-photos")
    .upload(path, Buffer.from(await photo.arrayBuffer()), { contentType: "image/jpeg" });
  if (upErr) return bad("อัปโหลดรูปไม่สำเร็จ: " + upErr.message, 500);

  const { error } = await db.from("attendance_records").insert({
    student_id, classroom_id: st.classroom_id, attendance_date: date,
    status: "late", recorded_source: "gate_scan", recorded_by: null,
    recorded_at: now.toISOString(), late_photo_path: path,
  });
  if (error) return bad("บันทึกไม่สำเร็จ: " + error.message, 500);

  return NextResponse.json({ ok: true });
}