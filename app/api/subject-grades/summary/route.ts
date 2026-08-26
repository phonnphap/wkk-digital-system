// app/api/subject-grades/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentSession } from "@/lib/studentAuth";

// GET /api/subject-grades/summary?subject_section_id=xxx
// รวมข้อมูลที่ต้องใช้วาดตาราง "คะแนนรวม" ในหน้าเดียว เพื่อลดจำนวน round-trip
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ★ เช็คสิทธิ์ก่อนอ่านข้อมูลใดๆ ทั้งสิ้น
    // ทางที่ 1: ครู/แอดมิน — เช็คผ่าน Supabase Auth session (cookie)
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    let isStaff = false;
    let isStudentCaller = false;
    let callerStudentId: string | null = null;

    if (authUser) {
      const { data: profile } = await admin
        .from("users")
        .select("id, role")
        .eq("auth_id", authUser.id)
        .maybeSingle();
      // ปรับรายชื่อ role ตามที่ระบบใช้จริง (เช่น "teacher", "admin", "executive")
      if (profile) {
        isStaff = true;
      }
    }

    // ทางที่ 2: ถ้าไม่ใช่ staff ให้ลองเช็ค student session
    if (!isStaff) {
      const studentSession = await getStudentSession();
      if (studentSession) {
        const { data: student } = await admin
          .from("students")
          .select("id, classroom_id")
          .eq("id", studentSession.student_id)
          .maybeSingle();

        const { data: section } = student
          ? await admin
              .from("subject_sections")
              .select("id")
              .eq("id", subject_section_id)
              .eq("classroom_id", student.classroom_id)
              .maybeSingle()
          : { data: null };

        if (!section) {
          return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
        }
        isStudentCaller = true;
        callerStudentId = studentSession.student_id;
      } else {
        return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
      }
    }

    const [
      { data: assignments, error: aErr },
      { data: presets, error: pErr },
      { data: criteria, error: cErr },
      // ★ ดึงค่าตั้งค่าโครงสร้างคะแนน (เก็บ/กลางภาค/ปลายภาค) ของ section นี้พร้อมกันเลย
      { data: sectionGradingConfig, error: gErr },
      // ★ ดึง "คะแนนเต็มดิบ" ของข้อสอบกลางภาค/ปลายภาค (ตั้งค่าจากหน้าตารางคะแนนรวม)
      { data: examConfigRows, error: ecErr },
    ] = await Promise.all([
      admin
        .from("assignments")
        .select("id, title, max_score, weight_percent, allow_weight, status, due_date")
        .eq("subject_section_id", subject_section_id)
        .order("assigned_at", { ascending: true }),
      admin
        .from("score_presets")
        .select("id, label, points, emoji, sort_order")
        .eq("subject_section_id", subject_section_id)
        .order("sort_order", { ascending: true }),
      admin
        .from("grade_criteria")
        .select("id, max_percent, min_percent, grade, sort_order")
        .eq("subject_section_id", subject_section_id)
        .order("sort_order", { ascending: true }),
      admin
        .from("subject_sections")
        .select("grading_structure, formative_max_score, midterm_max_score, final_max_score")
        .eq("id", subject_section_id)
        .maybeSingle(),
      admin
        .from("subject_exam_config")
        .select("exam_type, raw_max_score")
        .eq("subject_section_id", subject_section_id),
    ]);
    if (aErr) throw aErr;
    if (pErr) throw pErr;
    if (cErr) throw cErr;
    if (gErr) throw gErr;
    if (ecErr) throw ecErr;

    const assignmentIds = (assignments ?? []).map((a: any) => a.id);

    const [
      { data: submissions, error: sErr },
      { data: scoreEvents, error: eErr },
      // ★ คะแนนกลางภาค/ปลายภาค (คนละตารางจาก assignments เพราะไม่มี rubric ย่อย)
      { data: examScoreRows, error: exErr },
    ] = await Promise.all([
      assignmentIds.length > 0
        ? admin
            .from("assignment_submissions")
            .select("id, assignment_id, student_id, status, score, teacher_comment, graded_at, submitted_at, is_late")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("score_events")
        .select("id, student_id, preset_id, points")
        .eq("subject_section_id", subject_section_id),
      admin
        .from("subject_exam_scores")
        .select("id, student_id, exam_type, score, raw_score, raw_max_score")
        .eq("subject_section_id", subject_section_id),
    ]);
    if (sErr) throw sErr;
    if (eErr) throw eErr;
    if (exErr) throw exErr;

    // ★ แปลง examConfigRows (array ของ {exam_type, raw_max_score}) เป็นค่าแยกฟิลด์
    const midtermConfig = (examConfigRows ?? []).find((r: any) => r.exam_type === "midterm");
    const finalConfig = (examConfigRows ?? []).find((r: any) => r.exam_type === "final");

    // ★ ถ้าคนเรียกเป็นนักเรียน ให้กรองเหลือแค่ข้อมูลของตัวเองก่อนส่งกลับ
    // อย่าไว้ใจการกรองฝั่ง frontend อย่างเดียว เพราะ response ตรงนี้คือสิ่งที่หลุดออกไปจริง (เห็นได้ใน DevTools)
    const finalSubmissions = isStudentCaller
      ? (submissions ?? []).filter((s: any) => s.student_id === callerStudentId)
      : submissions;
    const finalScoreEvents = isStudentCaller
      ? (scoreEvents ?? []).filter((e: any) => e.student_id === callerStudentId)
      : scoreEvents;
    const finalExamScores = isStudentCaller
      ? (examScoreRows ?? []).filter((e: any) => e.student_id === callerStudentId)
      : examScoreRows ?? [];

    return NextResponse.json({
      assignments,
      presets,
      criteria,
      submissions: finalSubmissions,
      scoreEvents: finalScoreEvents,
      examScores: finalExamScores,
      gradingConfig: sectionGradingConfig ?? {
        grading_structure: "formative_final",
        formative_max_score: 70,
        midterm_max_score: 0,
        final_max_score: 30,
      },
      rawMidtermMaxScore: midtermConfig?.raw_max_score ?? null,
      rawFinalMaxScore: finalConfig?.raw_max_score ?? null,
    });
  } catch (err: any) {
    console.error("[GET /api/subject-grades/summary] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนรวมไม่สำเร็จ" }, { status: 500 });
  }
}