import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin"; // ★ เพิ่ม: bypass RLS เฉพาะตารางที่ต้องใช้ Supabase Auth
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

    // ★ แก้ไข: เพิ่ม student_submit_enabled เข้า select ด้วย (เดิม select แค่ allow_late_submission)
  // เพื่อให้ฝั่งนักเรียนรู้ว่าครูปิดการส่งงานทั้งวิชาไว้หรือไม่ (คนละสวิตช์กับ "ส่งย้อนหลัง")
      const { data: section } = await supabase
    .from("subject_sections")
    .select("id, allow_late_submission, student_submit_enabled")
    .eq("id", sectionId)
    .eq("classroom_id", student.classroom_id)
    .maybeSingle();

  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  // ★ FIX: ตาราง assignments (และ assignment_submissions ที่ join ข้างใน) มี RLS policy
  // ที่อนุญาตเฉพาะ role "authenticated" (Supabase Auth session) เท่านั้น เหมือนกับ timetable_entries
  // ที่เจอปัญหาไปก่อนหน้านี้ — หน้า student-portal ใช้ custom session (getStudentSession) ไม่ได้
  // login ผ่าน Supabase Auth ทำให้ request วิ่งด้วย role "anon" เสมอ ไม่ผ่าน policy ใดๆ เลย
  // ผลคือ query สำเร็จแต่ได้ [] เงียบๆ โดยไม่มี error ทำให้หน้าเว็บมองว่า "ไม่มีงานที่มอบหมาย"
  // สิทธิ์ของนักเรียนถูกเช็คไปแล้วด้านบน (studentId === session.student_id + section ต้องอยู่ห้องเดียวกัน)
  // จึงปลอดภัยที่จะ bypass RLS เฉพาะจุดนี้ด้วย service-role client
  const supabaseAdmin = createAdminClient();

  // ★ แก้: ดึงจากตาราง assignment_submissions (ตัวที่ครูใช้ให้คะแนนจริง) แทน submissions ที่ไม่มีใครเขียนลงเลย
  const { data: assignments, error } = await supabaseAdmin
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
    console.error("[student-portal/assignments] query error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลงานไม่สำเร็จ" }, { status: 500 });
  }

  // ★ แก้ไข: ส่ง allow_late_submission และ student_submit_enabled ของวิชานี้กลับไปด้วย
  // ให้ฝั่งหน้าเว็บใช้ปิดฟอร์มส่งงาน (default true เผื่อ field เป็น null)
  return NextResponse.json({
    assignments,
    allow_late_submission: section.allow_late_submission ?? true,
    student_submit_enabled: section.student_submit_enabled ?? true,
  });
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
  // ★ FIX: ใช้ admin client เดียวกับด้านบน กันเคสเดียวกัน — ถ้า assignments/assignment_submissions
  // โดน RLS บล็อกตอนอ่าน ก็มีโอกาสสูงที่จะบล็อกตอนเขียน (insert/upsert) ด้วยเช่นกัน
  const supabaseAdmin = createAdminClient();

  // ★ แก้ไข: ดึง due_date + allow_late_submission (ผ่าน join ตาราง subject_sections) มาเช็คด้วย
  // เพื่อกันไม่ให้แนบไฟล์เข้ามาได้ทาง API ตรงๆ (เช่น เรียก endpoint ตรงข้ามหน้าฟอร์ม)
  // ทั้งที่ครูปิดรับส่งงานย้อนหลังไปแล้ว — เดิม backend ไม่เช็คเงื่อนไขนี้เลย พึ่งแต่ frontend ซ่อนฟอร์ม
  const { data: assignment } = await supabaseAdmin
    .from("assignments")
    .select("id, status, subject_section_id, due_date, subject_sections!inner(allow_late_submission)")
    .eq("id", assignmentId)
    .neq("status", "draft")
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "ไม่พบงานนี้ หรืองานยังไม่เปิดให้ส่ง" }, { status: 404 });
  }

  const allowLate = (assignment as any).subject_sections?.allow_late_submission ?? true;
  const isOverdue = assignment.due_date ? new Date(assignment.due_date).getTime() < Date.now() : false;
  if (isOverdue && !allowLate) {
    return NextResponse.json({ error: "เลยกำหนดส่งแล้ว และครูปิดการส่งงานย้อนหลังไว้" }, { status: 403 });
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

  const { data: submission, error: submitError } = await supabaseAdmin
    .from("assignment_submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: studentId,
        content: contentText,
        submitted_at: new Date().toISOString(),
        status: "pending_review",
        is_late: isOverdue, // ★ เพิ่ม: บันทึกไว้ด้วยว่างานนี้ส่งช้าหรือไม่ ตอนที่ยังอนุญาตอยู่
      },
      { onConflict: "assignment_id,student_id" }
    )
    .select()
    .single();

  if (submitError) {
    console.error("[student-portal/assignments] submit error:", submitError);
    return NextResponse.json({ error: "บันทึกการส่งงานไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ submission });
}