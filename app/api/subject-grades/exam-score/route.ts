// app/api/subject-grades/exam-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/subject-grades/exam-score
// บันทึก/แก้ไขคะแนนกลางภาค หรือ ปลายภาค ของนักเรียน 1 คนใน subject_section นี้
// ใช้ upsert เพราะครูอาจกดแก้คะแนนซ้ำได้ (unique key: subject_section_id + student_id + exam_type)
// ★ ถ้า score เป็น null = คำสั่ง "รีเซทคะแนน" (กลับเป็นยังไม่ได้กรอก) -> ลบแถวทิ้งแทนการ upsert
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, student_id, exam_type, score, raw_score, raw_max_score, graded_by } = body;

    // ★ validate ให้ครบตามที่ตาราง subject_exam_scores บังคับไว้ (CHECK constraint บน exam_type)
    if (!subject_section_id || !student_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id และ student_id" }, { status: 400 });
    }
    if (exam_type !== "midterm" && exam_type !== "final") {
      return NextResponse.json({ error: "exam_type ต้องเป็น 'midterm' หรือ 'final' เท่านั้น" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ★ เคสรีเซทคะแนน: client ส่ง score เป็น null มาตรงๆ (ไม่ใช่ 0 หรือ undefined)
    // -> ลบแถวคะแนนสอบของนักเรียน/วิชา/ประเภทนี้ทิ้ง แทนที่จะพยายาม upsert ค่า null
    // ลงคอลัมน์ score ซึ่งน่าจะเป็น NOT NULL ในฐานข้อมูล (เหมือนที่ endpoint คะแนนงานทำ)
    if (score === null) {
      const { error: deleteError } = await admin
        .from("subject_exam_scores")
        .delete()
        .eq("subject_section_id", subject_section_id)
        .eq("student_id", student_id)
        .eq("exam_type", exam_type);

      if (deleteError) throw deleteError;

      return NextResponse.json({ deleted: true });
    }

    // ★ score ต้องเป็นตัวเลข ไม่ใช่ string/undefined/NaN (กันข้อมูลเพี้ยนจากฝั่ง client)
    const numericScore = Number(score);
    if (score === undefined || Number.isNaN(numericScore) || numericScore < 0) {
      return NextResponse.json({ error: "คะแนนไม่ถูกต้อง" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("subject_exam_scores")
      .upsert(
        {
          subject_section_id,
          student_id,
          exam_type,
          score: numericScore,
          // ★ เพิ่ม: เก็บคะแนนดิบ + เต็มดิบไว้ด้วย ไม่งั้นตอนโหลดกลับมาจะไม่รู้ค่าดิบที่ครูกรอกจริง
          raw_score: raw_score !== undefined && raw_score !== null ? Number(raw_score) : null,
          raw_max_score: raw_max_score !== undefined && raw_max_score !== null ? Number(raw_max_score) : null,
          graded_by: graded_by ?? null,
          graded_at: new Date().toISOString(),
        },
        { onConflict: "subject_section_id,student_id,exam_type" }
      )
      .select()
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ score: data });
  } catch (err: any) {
    console.error("[POST /api/subject-grades/exam-score] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกคะแนนไม่สำเร็จ" }, { status: 500 });
  }
}