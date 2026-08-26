// app/api/subject-grades/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

          const [
      { data: assignments, error: aErr },
      { data: presets, error: pErr },
      { data: criteria, error: cErr },
      // ★ เพิ่ม: ดึงค่าตั้งค่าโครงสร้างคะแนน (เก็บ/กลางภาค/ปลายภาค) ของ section นี้พร้อมกันเลย
      { data: sectionGradingConfig, error: gErr },
      // ★ เพิ่ม: ดึง "คะแนนเต็มดิบ" ของข้อสอบกลางภาค/ปลายภาค (ตั้งค่าจากหน้าตารางคะแนนรวม)
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
      // ★ เพิ่ม: คะแนนกลางภาค/ปลายภาค (คนละตารางจาก assignments เพราะไม่มี rubric ย่อย)
      { data: examScoreRows, error: exErr },
    ] = await Promise.all([
      assignmentIds.length > 0
        ? admin
            .from("assignment_submissions")
            // เพิ่ม submitted_at: ใช้เทียบกับ assignments.due_date เพื่อตัดสิน "ตรงเวลา/ส่งช้า"
            // ⚠️ ต้องมีคอลัมน์ submitted_at ในตาราง assignment_submissions จริงก่อน
            .select("id, assignment_id, student_id, status, score, teacher_comment, graded_at, submitted_at, is_late")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      // score_events ผูกกับ subject_section_id ตรง ๆ อยู่แล้ว ไม่ต้องกรองด้วย preset_id ก็ได้
      // แต่กรองไว้เพื่อความชัดเจนว่านับเฉพาะพรีเซ็ตที่ยังอยู่ในหมวดนี้
      admin
        .from("score_events")
        .select("id, student_id, preset_id, points")
        .eq("subject_section_id", subject_section_id),
      // ★ เพิ่ม: ดึงคะแนนกลางภาค/ปลายภาคของทุกคนใน section นี้ในครั้งเดียว
      admin
        .from("subject_exam_scores")
        .select("id, student_id, exam_type, score")
        .eq("subject_section_id", subject_section_id),
    ]);
        if (sErr) throw sErr;
    if (eErr) throw eErr;
    if (exErr) throw exErr;

    // ★ แปลง examConfigRows (array ของ {exam_type, raw_max_score}) เป็นค่าแยกฟิลด์
    // ให้ตรงกับที่ frontend อ่าน: json.rawMidtermMaxScore / json.rawFinalMaxScore
    const midtermConfig = (examConfigRows ?? []).find((r: any) => r.exam_type === "midterm");
    const finalConfig = (examConfigRows ?? []).find((r: any) => r.exam_type === "final");

    return NextResponse.json({
      assignments,
      presets,
      criteria,
      submissions,
      scoreEvents,
      // ★ เพิ่ม: คะแนนสอบ + ค่าตั้งค่าโครงสร้างคะแนน ส่งกลับพร้อมกันในก้อนเดียว
      examScores: examScoreRows ?? [],
      gradingConfig: sectionGradingConfig ?? {
        grading_structure: "formative_final",
        formative_max_score: 70,
        midterm_max_score: 0,
        final_max_score: 30,
      },
      // ★ เพิ่ม: คะแนนเต็มดิบของกลางภาค/ปลายภาค (null ถ้ายังไม่เคยตั้งค่า)
      rawMidtermMaxScore: midtermConfig?.raw_max_score ?? null,
      rawFinalMaxScore: finalConfig?.raw_max_score ?? null,
    });
  } catch (err: any) {
    console.error("[GET /api/subject-grades/summary] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนรวมไม่สำเร็จ" }, { status: 500 });
  }
}