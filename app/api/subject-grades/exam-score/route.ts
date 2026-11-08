// app/api/subject-grades/exam-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGroupExamScore } from "@/lib/smartclass/syncGroupExamScore";

// POST /api/subject-grades/exam-score
// บันทึก/แก้ไขคะแนนกลางภาค หรือ ปลายภาค ของนักเรียน 1 คนใน subject_section นี้
// ใช้ upsert เพราะครูอาจกดแก้คะแนนซ้ำได้ (unique key: subject_section_id + student_id + exam_type)
// ★ ถ้า score เป็น null = คำสั่ง "รีเซทคะแนน" (กลับเป็นยังไม่ได้กรอก) -> ลบแถวทิ้งแทนการ upsert
// ★ ถ้าวิชานี้อยู่ในกลุ่มรวมคะแนน (score_group_code) จะซิงก์คะแนนสอบไปยังวิชาอื่นในกลุ่มของห้องเดียวกันให้อัตโนมัติ
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, student_id, exam_type, score, raw_score, raw_max_score, graded_by } = body;

    if (!subject_section_id || !student_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id และ student_id" }, { status: 400 });
    }
    if (exam_type !== "midterm" && exam_type !== "final") {
      return NextResponse.json({ error: "exam_type ต้องเป็น 'midterm' หรือ 'final' เท่านั้น" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ซิงก์ไปวิชาอื่นในกลุ่ม: พลาดแล้วไม่ควรทำให้การบันทึกหลักล้ม
    async function trySync(rawScore: number | null, rawMax: number | null): Promise<number> {
      try {
        return await syncGroupExamScore(admin, {
          sectionId: subject_section_id,
          studentId: student_id,
          examType: exam_type,
          rawScore,
          rawMaxScore: rawMax,
          gradedBy: graded_by ?? null,
        });
      } catch (e) {
        console.error("[exam-score] sync group failed:", e);
        return 0;
      }
    }

    // ★ เคสรีเซทคะแนน
    if (score === null) {
      const { error: deleteError } = await admin
        .from("subject_exam_scores")
        .delete()
        .eq("subject_section_id", subject_section_id)
        .eq("student_id", student_id)
        .eq("exam_type", exam_type);

      if (deleteError) throw deleteError;

      const syncedSections = await trySync(null, null);
      return NextResponse.json({ deleted: true, syncedSections });
    }

    const numericScore = Number(score);
    if (score === undefined || Number.isNaN(numericScore) || numericScore < 0) {
      return NextResponse.json({ error: "คะแนนไม่ถูกต้อง" }, { status: 400 });
    }

    const numericRaw = raw_score !== undefined && raw_score !== null ? Number(raw_score) : null;
    const numericRawMax = raw_max_score !== undefined && raw_max_score !== null ? Number(raw_max_score) : null;

    const { data, error } = await admin
      .from("subject_exam_scores")
      .upsert(
        {
          subject_section_id,
          student_id,
          exam_type,
          score: numericScore,
          raw_score: numericRaw,
          raw_max_score: numericRawMax,
          graded_by: graded_by ?? null,
          graded_at: new Date().toISOString(),
        },
        { onConflict: "subject_section_id,student_id,exam_type" }
      )
      .select()
      .maybeSingle();

    if (error) throw error;

    // ถ้า client ไม่ส่ง raw_score มา ให้ใช้ score ที่ส่งมาแทน (กรณีไม่ได้ตั้งเต็มดิบ score = raw)
    const syncedSections = await trySync(numericRaw ?? numericScore, numericRawMax);

    return NextResponse.json({ score: data, syncedSections });
  } catch (err: any) {
    console.error("[POST /api/subject-grades/exam-score] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกคะแนนไม่สำเร็จ" }, { status: 500 });
  }
}