import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentSession } from "@/lib/studentAuth";
import { studentOwnsSection } from "@/lib/smartclass/sectionAccess";

export async function GET(req: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");
  const sectionId = searchParams.get("subject_section_id");
  if (!studentId || studentId !== session.student_id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }
  if (!sectionId) {
    return NextResponse.json({ error: "ไม่ระบุวิชา" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("classroom_id")
    .eq("id", studentId)
    .is("moved_out_at", null)
    .maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  // ★ แก้: section เทอม 2 อยู่คนละห้องกับ นร. (ห้องเทอม 1) → ตรวจผ่าน previous_section_id
  const { data: section } = await admin
    .from("subject_sections")
    .select("id, classroom_id, previous_section_id, teacher_id, co_teacher_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section || !(await studentOwnsSection(admin, student.classroom_id, section))) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  const { data: classroom } = await admin
    .from("classrooms")
    .select("homeroom_teacher_id, homeroom_teacher_2_id")
    .eq("id", student.classroom_id)
    .maybeSingle();

  const homeroomIds = [classroom?.homeroom_teacher_id, classroom?.homeroom_teacher_2_id]
    .filter((v): v is string => !!v);
  const subjectIds = [section.teacher_id, section.co_teacher_id]
    .filter((v): v is string => !!v);

  const allIds = Array.from(new Set([...homeroomIds, ...subjectIds]));

  const { data: users } = allIds.length
    ? await admin.from("users").select("id, title, first_name, last_name").in("id", allIds)
    : { data: [] as any[] };

  const nameOf = (id: string) => {
    const u = (users ?? []).find((x: any) => x.id === id);
    return u ? `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : null;
  };

  return NextResponse.json({
    homeroom_teachers: homeroomIds.map(nameOf).filter(Boolean),
    subject_teachers: subjectIds.map(nameOf).filter(Boolean),
  });
}