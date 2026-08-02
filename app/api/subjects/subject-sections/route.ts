import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/subject-sections — เปิดวิชาใหม่ (subject_section) + gen join_code แบบ unique
// ทำที่ server เพราะต้อง retry เรื่อง join_code ชนกันได้อย่างปลอดภัย (race condition ถ้าทำฝั่ง client)
function generateJoinCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_id, classroom_id, academic_year_id, teacher_id, co_teacher_id, created_by } = body;

    if (!subject_id || !classroom_id || !academic_year_id || !teacher_id || !created_by) {
      return NextResponse.json(
        { error: "กรุณาเลือกวิชา, ห้องเรียน, ปีการศึกษา และครูประจำวิชาให้ครบ" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // เช็คก่อนว่าวิชานี้เปิดในห้อง+ปีนี้ไปแล้วหรือยัง (unique constraint ในตาราง)
    const { data: dup } = await admin
      .from("subject_sections")
      .select("id")
      .eq("subject_id", subject_id)
      .eq("classroom_id", classroom_id)
      .eq("academic_year_id", academic_year_id)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: "วิชานี้ถูกเปิดสอนในห้องนี้ของปีการศึกษานี้ไปแล้ว" }, { status: 409 });
    }

    // gen join_code แบบ unique — ลองสูงสุด 5 ครั้งเผื่อชนกัน (โอกาสชนต่ำมากอยู่แล้วที่ 36^6 ความเป็นไปได้)
    let section: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 5 && !section; attempt++) {
      const join_code = generateJoinCode();
      const { data, error } = await admin
        .from("subject_sections")
        .insert([{
          subject_id, classroom_id, academic_year_id,
          teacher_id, co_teacher_id: co_teacher_id || null,
          join_code, created_by,
        }])
        .select("*")
        .single();
      if (!error) { section = data; break; }
      lastErr = error;
      if (error.code !== "23505") break; // error อื่นที่ไม่ใช่ unique conflict ไม่ต้อง retry
    }

    if (!section) throw lastErr ?? new Error("สร้าง join code ไม่สำเร็จ กรุณาลองใหม่");

    return NextResponse.json({ section });
  } catch (err: any) {
    console.error("[POST /api/subject-sections] error:", err);
    return NextResponse.json({ error: err?.message ?? "เปิดวิชาไม่สำเร็จ" }, { status: 500 });
  }
}