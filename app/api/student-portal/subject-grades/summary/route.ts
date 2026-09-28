import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentSession } from "@/lib/studentAuth";

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

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, classroom_id")
    .eq("id", studentId)
    .is("moved_out_at", null)
    .maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  // ★ ตารางเหล่านี้ติด RLS เหมือนกับ endpoint อื่นๆ ของ student-portal
  // custom student session ไม่ใช่ Supabase Auth เลยต้อง bypass ด้วย service-role client
  const supabaseAdmin = createAdminClient();

  const { data: section } = await supabaseAdmin
    .from("subject_sections")
    .select("id, midterm_max_score, final_max_score, show_assignment_scores")
    .eq("id", sectionId)
    .eq("classroom_id", student.classroom_id)
    .maybeSingle();
  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  const [
    { data: assignments },
    { data: presets },
    { data: criteria },
    { data: submissions },
    { data: scoreEvents },
    { data: examScores },
  ] = await Promise.all([
    supabaseAdmin
      .from("assignments")
      .select("id, title, max_score, allow_weight, weight_percent, status, due_date, teaching_unit_no, unit_name, sort_order")
      .eq("subject_section_id", sectionId)
      .neq("status", "draft")
      .order("sort_order", { ascending: true }),   // ★ ล็อกลำดับให้ตรงกับฝั่งครู
    supabaseAdmin
      .from("score_presets")
      .select("id, label, points, emoji, sort_order")
      .eq("subject_section_id", sectionId)
      .order("sort_order"),
    supabaseAdmin
      .from("grade_criteria")
      .select("id, max_percent, min_percent, grade, sort_order")
      .eq("subject_section_id", sectionId),
    supabaseAdmin
      .from("assignment_submissions")
      .select("id, assignment_id, student_id, status, score, teacher_comment, graded_at, submitted_at, is_late")
      .eq("student_id", studentId),
    supabaseAdmin
      .from("score_events")
      .select("id, student_id, preset_id, points")
      .eq("subject_section_id", sectionId)
      .eq("student_id", studentId),
    supabaseAdmin
      .from("subject_exam_scores")
      .select("student_id, exam_type, score, raw_score, raw_max_score")
      .eq("subject_section_id", sectionId)
      .eq("student_id", studentId),
  ]);

  return NextResponse.json({
    assignments: assignments ?? [],
    presets: presets ?? [],
    criteria: criteria ?? [],
    submissions: (submissions ?? []).filter((s: any) => s.student_id === studentId),
    scoreEvents: scoreEvents ?? [],
    examScores: examScores ?? [],
    rawMidtermMaxScore: (examScores ?? []).find((e: any) => e.exam_type === "midterm")?.raw_max_score ?? null,
    rawFinalMaxScore: (examScores ?? []).find((e: any) => e.exam_type === "final")?.raw_max_score ?? null,
    show_assignment_scores: section.show_assignment_scores ?? true,
  });
}