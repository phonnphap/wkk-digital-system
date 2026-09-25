// path จริง: แก้ตามตำแหน่งไฟล์เดิมของคุณ
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
    .is("moved_out_at", null)
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
    .select("id, grading_mode, midterm_max_score, final_max_score")
    .eq("id", sectionId)
    .eq("classroom_id", student.classroom_id)
    .maybeSingle();

  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  // ★ ดึงชิ้นงานทั้งหมดของวิชา (ไม่กรอง draft ออกจาก assignments, ใช้ status filter แยก)
  const { data: allAssignments } = await supabase
    .from("assignments")
    .select("id, title, max_score, allow_weight, weight_percent, status, due_date")
    .eq("subject_section_id", section.id)
    .neq("status", "draft");

  // ★ ดึงคะแนนที่นักเรียนคนนี้ได้ในแต่ละชิ้นงาน (ไม่กรอง score is not null แล้ว เพื่อให้รู้ว่าชิ้นไหนยังไม่มีคะแนน)
  const { data: rows, error } = await supabase
    .from("assignment_submissions")
    .select(
      `
      score, status, submitted_at, is_late,
      assignment:assignments!inner (
        id, title, max_score, allow_weight, weight_percent, status, subject_section_id, due_date
      )
    `
    )
    .eq("student_id", studentId)
    .eq("assignment.subject_section_id", section.id)
    .neq("assignment.status", "draft");

  if (error) {
    return NextResponse.json({ error: "ดึงข้อมูลคะแนนไม่สำเร็จ" }, { status: 500 });
  }

  const submissionByAssignmentId: Record<string, any> = {};
  (rows ?? []).forEach((r: any) => {
    submissionByAssignmentId[r.assignment.id] = r;
  });

  // ---- สูตรเดียวกับ GradeOverviewTool เวอร์ชันล่าสุด: บวกตรงๆ ไม่ยืด/หด ----
  function isWeighted(a: any): boolean {
    return !!(a.allow_weight && a.weight_percent !== null && a.weight_percent !== undefined && (a.max_score ?? 0) > 0);
  }
  function getAssignmentWeightedScore(a: any, rawScore: number | null | undefined): number {
    if (rawScore === null || rawScore === undefined) return 0;
    if (isWeighted(a)) return (rawScore / (a.max_score || 1)) * (a.weight_percent as number);
    return rawScore;
  }
  function getAssignmentMaxContribution(a: any): number {
    return isWeighted(a) ? (a.weight_percent ?? 0) : (a.max_score ?? 0);
  }

  // ★ "เก็บ" = ผลรวมคะแนนชิ้นงานทุกชิ้นบวกกันตรงๆ (ไม่ยืด/หด) + กลางภาค
  const assignmentTotal = (allAssignments ?? []).reduce(
    (sum: number, a: any) => sum + getAssignmentWeightedScore(a, submissionByAssignmentId[a.id]?.score),
    0
  );
  const totalMaxScore = (allAssignments ?? []).reduce(
    (sum: number, a: any) => sum + getAssignmentMaxContribution(a),
    0
  );

  const midtermMaxScore = section.midterm_max_score ?? 0;
  const finalMaxScore = section.final_max_score ?? 30;
  const useMidterm = true; // โครงสร้างคะแนนเหลือแบบเดียว (เก็บ+กลางภาค+ปลายภาค) เหมือนฝั่ง GradeOverviewTool

  // ★ คะแนนพิเศษ (score_events)
  const { data: scoreEventRows } = await supabase
    .from("score_events")
    .select("points")
    .eq("subject_section_id", section.id)
    .eq("student_id", studentId);
  const specialTotal = (scoreEventRows ?? []).reduce((sum: number, e: any) => sum + (e.points ?? 0), 0);

  // ★ คะแนนกลางภาค/ปลายภาค
  const { data: examScoreRows } = await supabase
    .from("subject_exam_scores")
    .select("exam_type, score, raw_score, raw_max_score")
    .eq("subject_section_id", section.id)
    .eq("student_id", studentId);

  function getExamWeightedScore(
    rawScore: number | null | undefined,
    rawMax: number | null | undefined,
    maxScore: number
  ): number {
    if (rawScore === null || rawScore === undefined) return 0;
    if (rawMax && rawMax > 0) return (rawScore / rawMax) * maxScore;
    return rawScore;
  }

  const midtermRow = (examScoreRows ?? []).find((e: any) => e.exam_type === "midterm");
  const finalRow = (examScoreRows ?? []).find((e: any) => e.exam_type === "final");
  const midtermScore = getExamWeightedScore(
    midtermRow?.raw_score ?? midtermRow?.score ?? null,
    midtermRow?.raw_max_score,
    midtermMaxScore
  );
  const finalScore = getExamWeightedScore(
    finalRow?.raw_score ?? finalRow?.score ?? null,
    finalRow?.raw_max_score,
    finalMaxScore
  );

  // ★ "เก็บ" รวมกลางภาคแล้ว: earned/max ไม่ยืด/หด ใช้ตัวเลขจริงเสมอ
  const formativeEarned = assignmentTotal + (useMidterm ? midtermScore : 0);
  const formativeMax = totalMaxScore + (useMidterm ? midtermMaxScore : 0);

  // ★ "รวม" = เก็บ + คะแนนพิเศษ + ปลายภาค (คะแนนพิเศษไม่มี "เต็ม" จึงไม่บวกเข้าตัวหาร)
  const displayTotal = formativeEarned + specialTotal + finalScore;
  const displayMax = formativeMax + finalMaxScore;
  const percentage = displayMax > 0 ? (displayTotal / displayMax) * 100 : 0;

  // ★ รายละเอียดรายชิ้นงาน (คงไว้เพื่อ backward-compat กับหน้าที่อาจ render รายชิ้นอยู่)
  const grades = (allAssignments ?? []).map((a: any) => {
    const sub = submissionByAssignmentId[a.id];
    const pct = a.max_score > 0 && sub?.score != null ? (sub.score / a.max_score) * 100 : 0;
    const isLate =
      sub?.is_late !== null && sub?.is_late !== undefined
        ? sub.is_late
        : !!(a.due_date && sub?.submitted_at && new Date(sub.submitted_at) > new Date(a.due_date));

    return {
      assignment_id: a.id,
      title: a.title,
      score: sub?.score ?? null,
      max_score: a.max_score,
      weight_percent: a.weight_percent,
      percentage: Math.round(pct * 100) / 100,
      is_late: sub ? isLate : null,
    };
  });

  const { data: criteria } = await supabase
    .from("grade_criteria")
    .select("max_percent, min_percent, grade")
    .eq("subject_section_id", section.id)
    .order("min_percent", { ascending: false });

  const roundedPercentage = Math.round(percentage * 100) / 100;
  let grade: string | null = null;
  for (const c of criteria ?? []) {
    if (roundedPercentage >= c.min_percent && roundedPercentage <= c.max_percent) {
      grade = c.grade;
      break;
    }
  }

  return NextResponse.json({
    grades,
    summary: {
      weighted_score: roundedPercentage, // เก็บชื่อ field เดิมไว้เพื่อ backward-compat แต่ค่าตรงกับตัวหลักแล้ว
      weight_graded: Math.round(displayMax * 100) / 100,
      display_total: Math.round(displayTotal * 100) / 100,
      display_max: Math.round(displayMax * 100) / 100,
      grade,
    },
  });
}