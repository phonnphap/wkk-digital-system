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

  // ★ แก้: ดึงจาก assignment_submissions (ตารางที่ครูให้คะแนนจริง) แทน submissions ที่ว่างเปล่า 100%
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
    .neq("assignment.status", "draft")
    .not("score", "is", null);

  if (error) {
    return NextResponse.json({ error: "ดึงข้อมูลคะแนนไม่สำเร็จ" }, { status: 500 });
  }

  let weightedTotal = 0;
  let weightCounted = 0;

  const grades = (rows ?? []).map((r: any) => {
    const a = r.assignment;
    const pct = a.max_score > 0 ? (r.score / a.max_score) * 100 : 0;
    const contribution = a.allow_weight ? (pct / 100) * (a.weight_percent ?? 0) : 0;

    weightedTotal += contribution;
    weightCounted += a.weight_percent ?? 0;

    // ★ ใช้ is_late จากตารางจริงถ้าครูตั้งไว้ ไม่งั้น derive จาก due_date/submitted_at
    const isLate =
      r.is_late !== null && r.is_late !== undefined
        ? r.is_late
        : !!(a.due_date && r.submitted_at && new Date(r.submitted_at) > new Date(a.due_date));

    return {
      assignment_id: a.id,
      title: a.title,
      score: r.score,
      max_score: a.max_score,
      weight_percent: a.weight_percent,
      percentage: Math.round(pct * 100) / 100,
      is_late: isLate,
    };
  });

  // ★ เพิ่ม: ดึงเกณฑ์เกรดของวิชานี้มาคำนวณเกรดให้ นร. เห็นด้วย (ข้อมูลเกณฑ์ไม่ผูกกับตัวบุคคล จึงอ่านได้ปกติ)
  const { data: criteria } = await supabase
    .from("grade_criteria")
    .select("max_percent, min_percent, grade")
    .eq("subject_section_id", section.id)
    .order("min_percent", { ascending: false });

  const roundedWeighted = Math.round(weightedTotal * 100) / 100;
  let grade: string | null = null;
  for (const c of criteria ?? []) {
    if (roundedWeighted >= c.min_percent && roundedWeighted <= c.max_percent) {
      grade = c.grade;
      break;
    }
  }

  return NextResponse.json({
    grades,
    summary: {
      weighted_score: roundedWeighted,
      weight_graded: Math.round(weightCounted * 100) / 100,
      grade,
    },
  });
}