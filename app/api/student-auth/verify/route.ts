import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { issueStudentSession } from "@/lib/studentAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { join_code, mode, student_id, student_code, birth_date } = body;

    if (!join_code || !mode) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบถ้วน" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: section, error: sectionError } = await supabase
      .from("subject_sections")
      .select("id, classroom_id, student_portal_enabled, student_access_mode")
      .eq("join_code", join_code)
      .maybeSingle();

    if (sectionError) {
      console.error("[verify] section query error:", sectionError);
      return NextResponse.json({ error: "เกิดข้อผิดพลาดในการค้นหาวิชา" }, { status: 500 });
    }
    if (!section) {
      return NextResponse.json({ error: "ไม่พบวิชานี้" }, { status: 404 });
    }
    if (!section.student_portal_enabled) {
      return NextResponse.json({ error: "วิชานี้ยังไม่เปิดให้นักเรียนเข้าดู" }, { status: 403 });
    }
    if (section.student_access_mode !== mode) {
      return NextResponse.json({ error: "รูปแบบการเข้าใช้งานไม่ถูกต้อง" }, { status: 400 });
    }

    let matchedId: string | null = null;

    if (mode === "name_only") {
      if (!student_id) {
        return NextResponse.json({ error: "กรุณาเลือกชื่อนักเรียน" }, { status: 400 });
      }
      const { data: s, error } = await supabase
        .from("students")
        .select("id")
        .eq("id", student_id)
        .eq("classroom_id", section.classroom_id)
        .maybeSingle();
      if (error) console.error("[verify] name_only error:", error);
      matchedId = s?.id ?? null;
    }

    if (mode === "name_and_id") {
      if (!student_id || !student_code) {
        return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
      }
      const { data: s, error } = await supabase
        .from("students")
        .select("id")
        .eq("id", student_id)
        .eq("classroom_id", section.classroom_id)
        .eq("student_code", student_code)
        .maybeSingle();
      if (error) console.error("[verify] name_and_id error:", error);
      matchedId = s?.id ?? null;
    }

    if (mode === "id_and_dob") {
      if (!student_code || !birth_date) {
        return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
      }
      const { data: s, error } = await supabase
        .from("students")
        .select("id")
        .eq("classroom_id", section.classroom_id)
        .eq("student_code", student_code)
        .eq("birth_date", birth_date)
        .maybeSingle();
      if (error) console.error("[verify] id_and_dob error:", error);
      matchedId = s?.id ?? null;
    }

    if (!matchedId) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" }, { status: 401 });
    }

    await issueStudentSession(matchedId);
    return NextResponse.json({ student_id: matchedId });
  } catch (err: any) {
    console.error("[verify] unhandled error:", err);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}