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

  const { data: student, error: studentErr } = await supabase
    .from("students")
    .select("id, classroom_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentErr) {
    console.error("[timetable] student query error:", studentErr);
    return NextResponse.json({ error: "ดึงข้อมูลนักเรียนไม่สำเร็จ" }, { status: 500 });
  }
  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  // ทุกวิชา (section) ของห้องนี้ + ตารางสอนที่ผูกกับแต่ละวิชา
  const { data: sections, error } = await supabase
    .from("subject_sections")
    .select(`
      id, student_portal_enabled,
      subject:subjects ( id, subject_code, name_th ),
      timetable_entries ( id, day_of_week, slot_number, start_time, end_time )
    `)
    .eq("classroom_id", student.classroom_id)
    .eq("student_portal_enabled", true);

  if (error) {
    console.error("[timetable] sections query error:", error);
    return NextResponse.json({ error: "ดึงตารางเรียนไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ sections: sections ?? [] });
}