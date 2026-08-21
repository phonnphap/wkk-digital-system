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

  // จุดสำคัญ: ห้ามให้ student คนหนึ่งเปลี่ยน student_id ใน query แล้วดูของคนอื่นได้
  if (!studentId || studentId !== session.student_id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  const supabase = await createClient();

  // หา classroom_id ของนักเรียนคนนี้ (กันกรณี session ไม่มี section_id ผูกมา)
  const { data: student } = await supabase
    .from("students")
    .select("id, classroom_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  const { data: section } = await supabase
  .from("subject_sections")
  .select("id")
  .eq("classroom_id", student.classroom_id)
  .maybeSingle();

  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  // ดึงงานที่มอบหมาย (ไม่เอา draft) พร้อม join submission ของ student คนนี้เท่านั้น
  const { data: assignments, error } = await supabase
  .from("assignments")
  .select(
    `
    id, title, description, due_date, max_score, weight_percent, status, created_at,
    submissions:submissions ( id, file_url, file_name, submitted_at, score, feedback, status )
  `
  )
  .eq("subject_section_id", section.id)  // เปลี่ยนตรงนี้
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

  // ยืนยันว่า assignment นี้เปิดรับส่งงานจริง และไม่ใช่ draft
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, status, section_id")
    .eq("id", assignmentId)
    .neq("status", "draft")
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "ไม่พบงานนี้ หรืองานยังไม่เปิดให้ส่ง" }, { status: 404 });
  }

  // อัปโหลดไฟล์ขึ้น storage bucket (ตั้งชื่อ bucket ตามจริง เช่น "submissions")
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

  // upsert submission (ส่งซ้ำ = เขียนทับของเดิม)
  const { data: submission, error: submitError } = await supabase
    .from("submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: studentId,
        file_url: publicUrl,
        file_name: file.name,
        submitted_at: new Date().toISOString(),
        status: "submitted",
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