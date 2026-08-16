// app/api/assignment-submissions/grade/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/assignment-submissions/grade
// ให้/แก้ไขคะแนนงานที่มอบหมายแบบรายชิ้นโดยตรง (ใช้จากตาราง "คะแนนรวม" ของครูประจำวิชา)
// body: { subject_section_id, assignment_id, student_id, score, graded_by }
//
// พฤติกรรม:
// - ถ้านักเรียนคนนี้ยังไม่มีแถว assignment_submissions สำหรับงานชิ้นนี้ -> สร้างใหม่
//   status = "graded", score = ตามที่ส่งมา, graded_at = now(), submitted_at = null
//   (submitted_at ปล่อยว่างเพราะเป็นการให้คะแนนโดยครู ไม่ใช่นักเรียนส่งเอง
//    ถ้าใส่เวลาไปมั่ว ๆ จะกระทบการคำนวณ "ส่งตรงเวลา/ส่งช้า" ที่ฝั่ง client ให้ผิดพลาด)
// - ถ้ามีแถวอยู่แล้ว -> อัปเดตแค่ score/status/graded_at เท่านั้น ไม่แตะ submitted_at เดิม
//   (กรณีนักเรียนส่งงานเข้ามาเองแล้วครูตรวจให้คะแนน ต้องคงเวลาที่นักเรียนส่งจริงไว้)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, assignment_id, student_id, score, graded_by } = body ?? {};

    if (!subject_section_id || !assignment_id || !student_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id, assignment_id และ student_id" }, { status: 400 });
    }
    if (score === undefined || score === null || Number.isNaN(Number(score))) {
      return NextResponse.json({ error: "คะแนนไม่ถูกต้อง" }, { status: 400 });
    }
    const numericScore = Number(score);

    const admin = createAdminClient();

    // ตรวจว่า assignment นี้อยู่ใน subject_section ที่อ้างถึงจริง + เอา max_score มาเช็กขอบเขตคะแนนอีกชั้นฝั่ง server
    const { data: assignment, error: aErr } = await admin
      .from("assignments")
      .select("id, subject_section_id, max_score")
      .eq("id", assignment_id)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assignment) {
      return NextResponse.json({ error: "ไม่พบงานที่มอบหมายนี้" }, { status: 404 });
    }
    if (assignment.subject_section_id !== subject_section_id) {
      return NextResponse.json({ error: "งานนี้ไม่ได้อยู่ในวิชา/ห้องที่ระบุ" }, { status: 400 });
    }
    if (numericScore < 0 || numericScore > (assignment.max_score ?? 0)) {
      return NextResponse.json({ error: `คะแนนต้องอยู่ระหว่าง 0 - ${assignment.max_score} คะแนน` }, { status: 400 });
    }

    // หาแถวเดิม (ถ้ามี) ด้วยคู่ assignment_id + student_id
    const { data: existing, error: findErr } = await admin
      .from("assignment_submissions")
      .select("id, submitted_at")
      .eq("assignment_id", assignment_id)
      .eq("student_id", student_id)
      .maybeSingle();
    if (findErr) throw findErr;

    const nowIso = new Date().toISOString();
    let submission;

    if (existing) {
      const { data: updated, error: updErr } = await admin
        .from("assignment_submissions")
        .update({
          score: numericScore,
          status: "graded",
          graded_at: nowIso,
          graded_by: graded_by || null,
        })
        .eq("id", existing.id)
        .select("id, assignment_id, student_id, status, score, submitted_at, graded_at, teacher_comment")
        .maybeSingle();
      if (updErr) throw updErr;
      submission = updated;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("assignment_submissions")
        .insert({
          assignment_id,
          student_id,
          status: "graded",
          score: numericScore,
          graded_at: nowIso,
          graded_by: graded_by || null,
          submitted_at: null,
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