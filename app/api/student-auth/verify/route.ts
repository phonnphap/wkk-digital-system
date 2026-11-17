import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { issueStudentSession } from "@/lib/studentAuth";

type ResolvedEntity = {
  type: "subject" | "classroom";
  classroomId: string;
  accessMode: string;
  sectionId: string | null; // non-null only when type === "subject"
};

// ★ แก้บั๊ก: ห้องเทอม 2 (ป.4-6, ม.1-6) ไม่มีรายชื่อ นร. ของตัวเอง (รายชื่ออยู่ห้องเทอม 1)
//   ใช้ตรรกะเดียวกับหน้า join: ถ้าห้องนี้ไม่มี นร. ให้หาห้องต้นทางจาก previous_section_id
//   (ไล่ได้สูงสุด 5 ชั้น) แล้วสำรองด้วยห้องชื่อเดียวกันที่มี นร. คืนค่าเป็นรายการ classroom id ที่ยอมรับได้
async function resolveAllowedClassroomIds(
  supabase: any,
  classroomId: string,
  sectionId: string | null
): Promise<string[]> {
  const hasStudents = async (cid: string) => {
    const { count } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("classroom_id", cid)
      .is("moved_out_at", null);
    return (count ?? 0) > 0;
  };

  if (await hasStudents(classroomId)) return [classroomId];

  // 1) ไล่ตาม section เทอมก่อนหน้า
  if (sectionId) {
    const { data: start } = await supabase
      .from("subject_sections").select("previous_section_id").eq("id", sectionId).maybeSingle();
    let prev: string | null = start?.previous_section_id ?? null;
    for (let hop = 0; prev && hop < 5; hop++) {
      const { data: ps } = await supabase
        .from("subject_sections").select("classroom_id, previous_section_id").eq("id", prev).maybeSingle();
      if (!ps) break;
      if (ps.classroom_id && ps.classroom_id !== classroomId && (await hasStudents(ps.classroom_id))) {
        return [classroomId, ps.classroom_id];
      }
      prev = ps.previous_section_id ?? null;
    }
  }

  // 2) สำรอง: ห้องชื่อเดียวกันที่มีรายชื่อ
  const { data: me } = await supabase
    .from("classrooms").select("room_name").eq("id", classroomId).maybeSingle();
  if (me?.room_name) {
    const { data: sibs } = await supabase
      .from("classrooms").select("id").eq("room_name", me.room_name).neq("id", classroomId);
    for (const sb of (sibs ?? []) as { id: string }[]) {
      if (await hasStudents(sb.id)) return [classroomId, sb.id];
    }
  }
  return [classroomId];
}

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

    const allowedClassroomIds = await resolveAllowedClassroomIds(supabase, entity.classroomId, entity.sectionId);

    let matchedId: string | null = null;

    if (mode === "name_only") {
      if (!student_id) {
        return NextResponse.json({ error: "กรุณาเลือกชื่อนักเรียน" }, { status: 400 });
      }
      const { data: s, error } = await supabase
        .from("students")
        .select("id")
        .eq("id", student_id)
        .in("classroom_id", allowedClassroomIds)
        .is("moved_out_at", null)
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
        .in("classroom_id", allowedClassroomIds)
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
        .in("classroom_id", allowedClassroomIds)
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