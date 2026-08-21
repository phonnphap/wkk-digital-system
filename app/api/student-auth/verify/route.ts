import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ปรับ path ตามโปรเจกต์จริง
import { issueStudentSession } from "@/lib/studentAuth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { join_code, mode, student_id, first_name, last_name, student_code, birth_date } = body;

  const supabase = await createClient(); // <-- เพิ่ม await ตรงนี้

  const { data: section } = await supabase
    .from("subject_sections")
    .select("id, classroom_id, student_portal_enabled, student_access_mode")
    .eq("join_code", join_code)
    .maybeSingle();

  if (!section) return NextResponse.json({ error: "ไม่พบวิชานี้" }, { status: 404 });
  if (!section.student_portal_enabled) return NextResponse.json({ error: "วิชานี้ยังไม่เปิดให้นักเรียนเข้าดู" }, { status: 403 });
  if (section.student_access_mode !== mode) return NextResponse.json({ error: "รูปแบบการเข้าใช้งานไม่ถูกต้อง" }, { status: 400 });

  let matchedId: string | null = null;

  if (mode === "name_only") {
    const { data: s } = await supabase
      .from("students")
      .select("id")
      .eq("id", student_id)
      .eq("classroom_id", section.classroom_id)
      .maybeSingle();
    matchedId = s?.id ?? null;
  }

  if (mode === "name_and_id") {
    const { data: s } = await supabase
      .from("students")
      .select("id")
      .eq("id", student_id)
      .eq("classroom_id", section.classroom_id)
      .eq("student_code", student_code)
      .maybeSingle();
    matchedId = s?.id ?? null;
  }

  if (mode === "id_and_dob") {
    const { data: s } = await supabase
      .from("students")
      .select("id")
      .eq("classroom_id", section.classroom_id)
      .eq("student_code", student_code)
      .eq("birth_date", birth_date) // format: YYYY-MM-DD
      .maybeSingle();
    matchedId = s?.id ?? null;
  }

  if (!matchedId) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" }, { status: 401 });
  }

  await issueStudentSession(matchedId);
  return NextResponse.json({ student_id: matchedId });
}