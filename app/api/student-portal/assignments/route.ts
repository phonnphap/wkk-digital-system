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

  const { data: student } = await supabase
    .from("students")
    .select("id, classroom_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  const sectionId = searchParams.get("subject_section_id");
  if (!sectionId) {
    return NextResponse.json({ error: "ไม่ระบุวิชา" }, { status: 400 });
  }

  const { data: section } = await supabase
    .from("subject_sections")
    .select("id")
    .eq("id", sectionId)
    .eq("classroom_id", student.classroom_id)
    .maybeSingle();

  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  // ★ แก้: ดึงจากตาราง assignment_submissions (ตัวที่ครูใช้ให้คะแนนจริง) แทน submissions ที่ไม่มีใครเขียนลงเลย
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select(
      `
      id, title, description, due_date, max_score, weight_percent, status, created_at,
      submissions:assignment_submissions (
        id, status, content, submitted_at, score, teacher_comment, is_late
      )
    `
    )
    .eq("subject_section_id", section.id)
    .neq("status", "draft")
    .eq("submissions.student_id", studentId)
    .order("due_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "ดึงข้อมูลงานไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ assignments });
}

export async function POST(req: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  const formData = await req.formData();
  const studentId = formData.get("student_id") as string | null;
  const assignmentId = formData.get("assignment_id") as string | null;
  const file = formData.get("file") as File | null;

  if (!studentId || studentId !== session.student_id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (!assignmentId || !file) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, status, subject_section_id")
    .eq("id", assignmentId)
    .neq("status", "draft")
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "ไม่พบงานนี้ หรืองานยังไม่เปิดให้ส่ง" }, { status: 404 });
  }

  const filePath = `${assignmentId}/${studentId}-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("submissions")
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "อัปโหลดไฟล์ไม่สำเร็จ" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("submissions").getPublicUrl(filePath);

  // ★ แก้: เขียนลง assignment_submissions ให้ตรงกับที่ครูใช้อ่าน/แก้คะแนน
  // ★ ตาราง assignment_submissions ไม่มีคอลัมน์ file_url/file_name โดยตรง — เก็บลิงก์ไฟล์ไว้ใน content แทนไปก่อน
  //   (ถ้าต้องการเก็บชื่อไฟล์แยกต่างหาก ต้องเพิ่มคอลัมน์ในตาราง หรือคุยเรื่องออกแบบ schema เพิ่มเติม)
  const contentText = `[ไฟล์แนบ] ${file.name}\n${publicUrl}`;

  const { data: submission, error: submitError } = await supabase
    .from("assignment_submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: studentId,
        content: contentText,
        submitted_at: new Date().toISOString(),
        status: "pending_review",
      },
      { onConflict: "assignment_id,student_id" }
    )
    .select()
    .single();

  if (submitError) {
    return NextResponse.json({ error: "บันทึกการส่งงานไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ submission });
}