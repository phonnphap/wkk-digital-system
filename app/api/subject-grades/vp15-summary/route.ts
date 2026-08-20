import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GRADE_LEVELS = ["4", "3.5", "3", "2.5", "2", "1.5", "1", "0"];

function isWeighted(a: any) {
  return !!(a.allow_weight && a.weight_percent != null && (a.max_score ?? 0) > 0);
}
function getMaxContribution(a: any) {
  return isWeighted(a) ? a.weight_percent : (a.max_score ?? 0);
}
function getWeightedScore(a: any, raw: number | null | undefined) {
  if (raw === null || raw === undefined) return 0;
  if (isWeighted(a)) return (raw / (a.max_score || 1)) * a.weight_percent;
  return raw;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subject_id = searchParams.get("subject_id");
  const academic_year_id = searchParams.get("academic_year_id");
  if (!subject_id) return NextResponse.json({ error: "missing subject_id" }, { status: 400 });

  const supabase = await createClient(); 

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, subject_code, name_th")
    .eq("id", subject_id).maybeSingle();
  if (!subject) return NextResponse.json({ error: "ไม่พบวิชา" }, { status: 404 });

  let secQuery = supabase
    .from("subject_sections")
    .select("id, classroom_id, teacher_id, grading_structure, formative_max_score, midterm_max_score, final_max_score")
    .eq("subject_id", subject_id);
  if (academic_year_id) secQuery = secQuery.eq("academic_year_id", academic_year_id);
  const { data: sections } = await secQuery;

  if (!sections || sections.length === 0) {
    return NextResponse.json({ subject, rows: [], grandTotal: null });
  }

  const rows: any[] = [];

  for (const sec of sections) {
    const [{ data: classroom }, { data: students }, { data: assignments }, { data: submissions }, { data: examScores }, { data: criteria }] =
      await Promise.all([
        supabase.from("classrooms").select("id, room_name, grade_group").eq("id", sec.classroom_id).maybeSingle(),
        supabase.from("students").select("id").eq("classroom_id", sec.classroom_id),
        supabase.from("assignments").select("id, max_score, weight_percent, allow_weight, status").eq("subject_section_id", sec.id).neq("status", "draft"),
        supabase.from("assignment_submissions").select("assignment_id, student_id, score").eq("subject_section_id", sec.id),
        supabase.from("subject_exam_scores").select("student_id, exam_type, score").eq("subject_section_id", sec.id),
        supabase.from("grade_criteria").select("min_percent, max_percent, grade").eq("subject_section_id", sec.id),
      ]);

    const useMidterm = sec.grading_structure === "formative_midterm_final";
    const formativeMax = sec.formative_max_score ?? 70;
    const midtermMax = sec.midterm_max_score ?? 0;
    const finalMax = sec.final_max_score ?? 30;

    const totalMaxScore = (assignments ?? []).reduce((s: number, a: any) => s + getMaxContribution(a), 0);

    const sortedCriteria = [...(criteria ?? [])].sort((a: any, b: any) => b.min_percent - a.min_percent);
    const defaultCriteria = [
      { max_percent: 100, min_percent: 80, grade: "4" }, { max_percent: 79, min_percent: 75, grade: "3.5" },
      { max_percent: 74, min_percent: 70, grade: "3" }, { max_percent: 69, min_percent: 65, grade: "2.5" },
      { max_percent: 64, min_percent: 60, grade: "2" }, { max_percent: 59, min_percent: 55, grade: "1.5" },
      { max_percent: 54, min_percent: 50, grade: "1" }, { max_percent: 49, min_percent: 0, grade: "0" },
    ];
    const useCriteria = sortedCriteria.length > 0 ? sortedCriteria : defaultCriteria;

    const counts: Record<string, number> = Object.fromEntries(GRADE_LEVELS.map(g => [g, 0]));
    let scoreSum = 0;
    let gradeSum = 0;
    let gradedCount = 0;

    for (const s of students ?? []) {
      const subMap: Record<string, any> = {};
      (submissions ?? []).filter((sub: any) => sub.student_id === s.id).forEach((sub: any) => { subMap[sub.assignment_id] = sub; });
      const assignmentTotal = (assignments ?? []).reduce((sum: number, a: any) => sum + getWeightedScore(a, subMap[a.id]?.score), 0);
      const scaledFormative = totalMaxScore > 0 ? (assignmentTotal / totalMaxScore) * formativeMax : 0;
      const midterm = (examScores ?? []).find((e: any) => e.student_id === s.id && e.exam_type === "midterm")?.score ?? 0;
      const finalScore = (examScores ?? []).find((e: any) => e.student_id === s.id && e.exam_type === "final")?.score ?? 0;
      const percentage = scaledFormative + (useMidterm ? midterm : 0) + finalScore;

      let grade = "-";
      for (const c of useCriteria) {
        if (percentage >= c.min_percent && percentage <= c.max_percent) { grade = c.grade; break; }
      }
      if (counts[grade] !== undefined) {
        counts[grade] += 1;
        gradeSum += Number(grade) || 0;
        gradedCount += 1;
      }
      scoreSum += percentage;
    }

    const totalStudents = (students ?? []).length;
    rows.push({
      section_id: sec.id,
      room_label: `${classroom?.grade_group ?? ""} ${classroom?.room_name ?? ""}`.trim(),
      total_students: totalStudents,
      counts,
      avg_grade: gradedCount > 0 ? gradeSum / gradedCount : 0,
      score_sum: Math.round(scoreSum * 100) / 100,
    });
  }

  // แถวรวมทุกห้อง
  const grandCounts: Record<string, number> = Object.fromEntries(GRADE_LEVELS.map(g => [g, 0]));
  let grandStudents = 0, grandScoreSum = 0, grandGradeSum = 0, grandGradedCount = 0;
  rows.forEach(r => {
    GRADE_LEVELS.forEach(g => { grandCounts[g] += r.counts[g]; });
    grandStudents += r.total_students;
    grandScoreSum += r.score_sum;
    grandGradeSum += r.avg_grade * Object.values(r.counts).reduce((a: number, b: any) => a + b, 0);
    grandGradedCount += Object.values(r.counts).reduce((a: number, b: any) => a + b, 0);
  });

  const grandTotal = {
    total_students: grandStudents,
    counts: grandCounts,
    avg_grade: grandGradedCount > 0 ? grandGradeSum / grandGradedCount : 0,
    score_sum: Math.round(grandScoreSum * 100) / 100,
  };

  return NextResponse.json({ subject, rows, grandTotal });
}