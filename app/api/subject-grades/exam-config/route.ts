// app/api/subject-grades/exam-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/subject-grades/exam-config
// บันทึก/แก้ไข "คะแนนเต็มดิบ" ของข้อสอบกลางภาค/ปลายภาค ระดับ subject_section
// (ไม่ผูกกับนักเรียนรายคน ต่างจาก exam-score) — ใช้ upsert เพราะครูอาจแก้ค่าซ้ำได้
// unique key: subject_section_id + exam_type
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, exam_type, raw_max_score } = body;

    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }
    if (exam_type !== "midterm" && exam_type !== "final") {
      return NextResponse.json({ error: "exam_type ต้องเป็น 'midterm' หรือ 'final' เท่านั้น" }, { status: 400 });
    }

    // ★ raw_max_score เป็น null ได้ (แปลว่า "ยังไม่ตั้งค่าเต็มดิบ" ใช้ค่า default แทน)
    let numericRawMax: number | null = null;
    if (raw_max_score !== null && raw_max_score !== undefined && raw_max_score !== "") {
      const parsed = Number(raw_max_score);
      if (Number.isNaN(parsed) || parsed < 0) {
        return NextResponse.json({ error: "คะแนนเต็มดิบไม่ถูกต้อง" }, { status: 400 });
      }
      numericRawMax = parsed;
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("subject_exam_config")
      .upsert(
        {
          subject_section_id,
          exam_type,
          raw_max_score: numericRawMax,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "subject_section_id,exam_type" }
      )
      .select()
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ config: data });
  } catch (err: any) {
    console.error("[POST /api/subject-grades/exam-config] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}