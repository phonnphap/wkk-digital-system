// app/api/assignment-submissions/grade/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// app/api/assignment-submissions/grade/route.ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, assignment_id, student_id, score, graded_by } = body ?? {};

    if (!subject_section_id || !assignment_id || !student_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id, assignment_id และ student_id" }, { status: 400 });
    }

    // ★ score === null คือ "รีเซทคะแนน" อย่างตั้งใจ แยกจากกรอกผิดพลาด (undefined/NaN)
    const isReset = score === null;
    if (!isReset && (score === undefined || Number.isNaN(Number(score)))) {
      return NextResponse.json({ error: "คะแนนไม่ถูกต้อง" }, { status: 400 });
    }
    const numericScore = isReset ? null : Number(score);

    const admin = createAdminClient();

    const { data: assignment, error: aErr } = await admin
      .from("assignments")
      .select("id, subject_section_id, max_score")
      .eq("id", assignment_id)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assignment) return NextResponse.json({ error: "ไม่พบงานที่มอบหมายนี้" }, { status: 404 });
    if (assignment.subject_section_id !== subject_section_id) {
      return NextResponse.json({ error: "งานนี้ไม่ได้อยู่ในวิชา/ห้องที่ระบุ" }, { status: 400 });
    }
    if (!isReset && (numericScore! < 0 || numericScore! > (assignment.max_score ?? 0))) {
      return NextResponse.json({ error: `คะแนนต้องอยู่ระหว่าง 0 - ${assignment.max_score} คะแนน` }, { status: 400 });
    }

    const { data: existing, error: findErr } = await admin
      .from("assignment_submissions")
      .select("id, submitted_at")
      .eq("assignment_id", assignment_id)
      .eq("student_id", student_id)
      .maybeSingle();
    if (findErr) throw findErr;

    // ★ รีเซท + ไม่เคยมีการส่งงานจริง -> ลบแถวทิ้งเลย กลับเป็น "ไม่ส่งงาน" เป๊ะๆ
    if (isReset && existing && !existing.submitted_at) {
      const { error: delErr } = await admin.from("assignment_submissions").delete().eq("id", existing.id);
      if (delErr) throw delErr;
      return NextResponse.json({ submission: null, deleted: true });
    }

    const nowIso = new Date().toISOString();
    let submission;

    if (existing) {
      const { data: updated, error: updErr } = await admin
        .from("assignment_submissions")
        .update({
          score: numericScore,
          status: isReset ? "pending_review" : "reviewed", // ★ รีเซทแล้วกลายเป็น "รอตรวจ"
          graded_at: isReset ? null : nowIso,
          graded_by: isReset ? null : (graded_by || null),
        })
        .eq("id", existing.id)
        .select("id, assignment_id, student_id, status, score, submitted_at, graded_at, teacher_comment")
        .maybeSingle();
      if (updErr) throw updErr;
      submission = updated;
    } else {
      if (isReset) return NextResponse.json({ submission: null }); // ไม่มีอะไรให้รีเซท
      const { data: inserted, error: insErr } = await admin
        .from("assignment_submissions")
        .insert({
          assignment_id, student_id, status: "reviewed", score: numericScore,
          graded_at: nowIso, graded_by: graded_by || null, submitted_at: null,
        })
        .select("id, assignment_id, student_id, status, score, submitted_at, graded_at, teacher_comment")
        .maybeSingle();
      if (insErr) throw insErr;
      submission = inserted;
    }

    return NextResponse.json({ submission });
  } catch (err: any) {
    console.error("[POST /api/assignment-submissions/grade] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกคะแนนไม่สำเร็จ" }, { status: 500 });
  }
}