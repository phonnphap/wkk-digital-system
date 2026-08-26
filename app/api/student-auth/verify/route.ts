import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { issueStudentSession } from "@/lib/studentAuth";

type ResolvedEntity = {
  type: "subject" | "classroom";
  classroomId: string;
  accessMode: string;
  sectionId: string | null; // non-null only when type === "subject"
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { join_code, mode, student_id, student_code, birth_date } = body;

    if (!join_code || !mode) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบถ้วน" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1) ลองหาเป็น "โค้ดรายวิชา" ก่อน
    const { data: section, error: sectionError } = await supabase
      .from("subject_sections")
      .select("id, classroom_id, student_portal_enabled, student_access_mode")
      .eq("join_code", join_code)
      .maybeSingle();

    if (sectionError) {
      console.error("[verify] section query error:", sectionError);
      return NextResponse.json({ error: "เกิดข้อผิดพลาดในการค้นหาข้อมูล" }, { status: 500 });
    }

    let entity: ResolvedEntity | null = null;

    if (section && section.student_portal_enabled) {
      entity = {
        type: "subject",
        classroomId: section.classroom_id,
        accessMode: section.student_access_mode,
        sectionId: section.id,
      };
    } else {
      // 2) ไม่เจอ (หรือยังไม่เปิด) → ลองหาเป็น "โค้ดห้องเรียน"
      const { data: cls, error: classroomError } = await supabase
        .from("classrooms")
        .select("id, student_portal_enabled, student_access_mode")
        .eq("join_code", join_code)
        .maybeSingle();

      if (classroomError) {
        console.error("[verify] classroom query error:", classroomError);
        return NextResponse.json({ error: "เกิดข้อผิดพลาดในการค้นหาข้อมูล" }, { status: 500 });
      }

      if (cls && cls.student_portal_enabled) {
        entity = {
          type: "classroom",
          classroomId: cls.id,
          accessMode: cls.student_access_mode,
          sectionId: null,
        };
      }
    }

    if (!entity) {
      return NextResponse.json({ error: "ไม่พบโค้ดนี้ หรือยังไม่เปิดให้เข้าใช้งาน" }, { status: 404 });
    }

    if (entity.accessMode !== mode) {
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
        .eq("classroom_id", entity.classroomId)
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
        .eq("classroom_id", entity.classroomId)
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
        .eq("classroom_id", entity.classroomId)
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

    return NextResponse.json({
      student_id: matchedId,
      redirect_section_id: entity.type === "subject" ? entity.sectionId : null,
    });
  } catch (err: any) {
    console.error("[verify] unhandled error:", err);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}