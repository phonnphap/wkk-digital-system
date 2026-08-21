import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStudentSession } from "@/lib/studentAuth";

export async function GET(req: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");

  if (!studentId || studentId !== session.student_id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: records, error } = await supabase
    .from("attendance_records")
    .select("id, attendance_date, status")
    .eq("student_id", studentId)
    .order("attendance_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "ดึงข้อมูลการเช็คชื่อไม่สำเร็จ" }, { status: 500 });
  }

  const summary = {
  present: records?.filter((r) => r.status === "present").length ?? 0,
  absent: records?.filter((r) => r.status === "absent").length ?? 0,
  late: records?.filter((r) => r.status === "late").length ?? 0,
  leave: records?.filter((r) => r.status === "leave").length ?? 0, // เปลี่ยนจาก excused
};

  return NextResponse.json({ records, summary });
}