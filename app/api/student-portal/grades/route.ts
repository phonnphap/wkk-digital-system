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
    .select("id, grading_mode, midterm_max_score, final_max_score, show_assignment_scores, grading_structure, formative_max_score")
    .eq("id", sectionId)
    .eq("classroom_id", student.classroom_id)
    .maybeSingle();

  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  const showScores = section.show_assignment_scores ?? true;

  // ★ FIX: ตรวจสิทธิ์ผ่านแล้ว (student_id ตรง session + วิชาอยู่ห้องเดียวกัน)
  // ใช้ service-role เพราะตารางด้านล่างมี RLS เฉพาะ role "authenticated" ซึ่ง นร. ไม่มี
  const db = createAdminClient();

  const { data: allAssignments } = await db
    .from("assignments")
    .select("id, title, max_score, allow_weight, weight_percent, status, due_date, sort_order, created_at")
    .eq("subject_section_id", section.id)
    .neq("status", "draft")
    .order("sort_order", { ascending: true }); // ลำดับคอลัมน์ตรงกับตารางครู

  // ★ ลำดับตามหน้า "งานของฉัน" (due_date asc เหมือน /assignments) ไว้ให้ frontend เรียงงานที่ยังไม่ส่ง
  const myOrderMap: Record<string, number> = {};
  [...(allAssignments ?? [])]
    .sort((a: any, b: any) => {
  const at = a.created_at ? new Date(a.created_at).getTime() : Infinity;
  const bt = b.created_at ? new Date(b.created_at).getTime() : Infinity;
  return at - bt;
})
    .forEach((a: any, i: number) => {
      myOrderMap[a.id] = i;
    });

  const { data: rows, error } = await db
    .from("assignment_submissions")
    .select(
      `
      score, status, content, submitted_at, is_late,
      assignment:assignments!inner (
        id, title, max_score, allow_weight, weight_percent, status, subject_section_id, due_date
      )
    `
    )
    .eq("student_id", studentId)
    .eq("assignment.subject_section_id", section.id)
    .neq("assignment.status", "draft");

  if (error) {
    console.error("[student-portal/grades] query error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลคะแนนไม่สำเร็จ" }, { status: 500 });
  }

  const submissionByAssignmentId: Record<string, any> = {};
  (rows ?? []).forEach((r: any) => {
    submissionByAssignmentId[r.assignment.id] = r;
  });

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

  const { data: scoreEventRows } = await db
    .from("score_events")
    .select("points")
    .eq("subject_section_id", section.id)
    .eq("student_id", studentId);
  const specialTotal = (scoreEventRows ?? []).reduce((sum: number, e: any) => sum + (e.points ?? 0), 0);

  const { data: examScoreRows } = await db
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

  const formativeEarned = assignmentTotal + midtermScore;
  const formativeMax = totalMaxScore + midtermMaxScore;

  // "รวม" = เก็บ(รวมกลางภาค) + คะแนนพิเศษ + ปลายภาค — ตรงกับช่อง "รวม" ของครู
  const displayTotal = formativeEarned + specialTotal + finalScore;
  const displayMax = formativeMax + finalMaxScore;
  const percentage = displayMax > 0 ? (displayTotal / displayMax) * 100 : 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // ★ ทุกชิ้นงานขึ้นเป็นคอลัมน์ (ตามลำดับครู) แม้ยังไม่ส่ง
  const grades = (allAssignments ?? []).map((a: any) => {
    const sub = submissionByAssignmentId[a.id];
    const isGraded = sub?.score !== null && sub?.score !== undefined;
    const isSubmitted = !!sub && (!!sub.submitted_at || !!sub.content || sub.status !== "pending_review" || isGraded);
    const pct = a.max_score > 0 && isGraded ? (sub.score / a.max_score) * 100 : 0;
    const isLate =
      sub?.is_late !== null && sub?.is_late !== undefined
        ? sub.is_late
        : !!(a.due_date && sub?.submitted_at && new Date(sub.submitted_at) > new Date(a.due_date));

    return {
      assignment_id: a.id,
      title: a.title,
      sort_order: a.sort_order,
      my_assignments_order: myOrderMap[a.id] ?? 0, // ★ ใช้เรียงงานที่ยังไม่ส่ง/ยังไม่มีคะแนน
      due_date: a.due_date,
      is_submitted: isSubmitted,
      is_graded: isGraded,
      // showScores=true → ส่งคะแนนจริง / false → ส่งแค่สถานะ (frontend โชว์ ✓ หรือ ✗)
      score: showScores ? (sub?.score ?? null) : null,
      max_score: a.max_score,
      weight_percent: a.weight_percent,
      percentage: showScores ? r2(pct) : null,
      is_late: sub ? isLate : null,
    };
  });

  const { data: criteria } = await db
    .from("grade_criteria")
    .select("max_percent, min_percent, grade")
    .eq("subject_section_id", section.id)
    .order("min_percent", { ascending: false });

  const roundedPercentage = r2(percentage);
  let grade: string | null = null;
  for (const c of criteria ?? []) {
    if (roundedPercentage >= c.min_percent && roundedPercentage <= c.max_percent) {
      grade = c.grade;
      break;
    }
  }

  return NextResponse.json({
    grades,
    show_assignment_scores: showScores,
    summary: {
      weighted_score: roundedPercentage,
      weight_graded: r2(displayMax),
      // ★ ค่าหัวตารางตรงกับครู
      formative_earned: r2(formativeEarned),   // เก็บ (รวมกลางภาค)
      formative_max: r2(formativeMax),
      midterm_score: r2(midtermScore),
      midterm_max: r2(midtermMaxScore),
      final_score: r2(finalScore),
      final_max: r2(finalMaxScore),
      special_total: r2(specialTotal),
      display_total: r2(displayTotal),         // รวม
      display_max: r2(displayMax),
      grade,
    },
  });
}