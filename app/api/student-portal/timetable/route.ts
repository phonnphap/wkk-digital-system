import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStudentSession } from "@/lib/studentAuth";
import { createAdminClient } from "@/lib/supabase/admin";

// ★ เพิ่มใหม่: คำนวณคำนำหน้าจากอายุจริง (วันเกิด+เพศ) แทนค่า prefix ที่บันทึกไว้ในตาราง
// ชาย อายุ >= 15 = "นาย" / น้อยกว่า = "เด็กชาย" ・ หญิง อายุ >= 15 = "นางสาว" / น้อยกว่า = "เด็กหญิง"
// ถ้าไม่มีวันเกิดหรือเพศในระบบ จะ fallback กลับไปใช้ค่า prefix ที่บันทึกไว้เดิม (เผื่อข้อมูลไม่ครบ)
function getAutoPrefix(gender: string | null, birthDateStr: string | null, fallback: string | null): string {
  if (!gender || !birthDateStr) return fallback ?? "";
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return fallback ?? "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;
  if (gender === "male") return age >= 15 ? "นาย" : "เด็กชาย";
  if (gender === "female") return age >= 15 ? "นางสาว" : "เด็กหญิง";
  return fallback ?? "";
}

export async function GET(req: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");
  if (!studentId || studentId !== session.student_id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  const supabase = await createClient();
  // ★ FIX: subject_sections / timetable_entries / time_slots มี RLS ที่รับเฉพาะ role
  // "authenticated" (Supabase Auth) แต่หน้า student-portal ใช้ custom session ทำให้วิ่งด้วย
  // role "anon" เสมอ ไม่ผ่าน policy → ได้ [] เงียบๆ โดยไม่มี error (ปัญหาเดียวกับที่เจอใน
  // /api/student-portal/assignments) สิทธิ์นักเรียนเช็คไปแล้วด้านบน จึง bypass RLS ได้ปลอดภัย
  const supabaseAdmin = createAdminClient();

  // 1) ข้อมูลนักเรียน + ห้องเรียน
  const { data: student, error: studentErr } = await supabase
    .from("students")
    .select("id, prefix, first_name, last_name, seat_number, classroom_id, gender, birth_date")
    .eq("id", studentId)
    .maybeSingle();

  if (studentErr) {
    console.error("[timetable] student query error:", studentErr);
    return NextResponse.json({ error: "ดึงข้อมูลนักเรียนไม่สำเร็จ" }, { status: 500 });
  }
  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  const { data: classroom, error: classroomErr } = await supabaseAdmin
    .from("classrooms")
    .select("id, room_name, grade_group, homeroom_teacher_id, homeroom_teacher_2_id")
    .eq("id", student.classroom_id)
    .maybeSingle();

  if (classroomErr) {
    console.error("[timetable] classroom query error:", classroomErr);
    return NextResponse.json({ error: "ดึงข้อมูลห้องเรียนไม่สำเร็จ" }, { status: 500 });
  }

  const teacherIds = [classroom?.homeroom_teacher_id, classroom?.homeroom_teacher_2_id].filter(Boolean) as string[];
  let homeroomTeachers: { id: string; title?: string; first_name?: string; last_name?: string; full_name?: string }[] = [];
  if (teacherIds.length > 0) {
    const { data: teachers, error: teacherErr } = await supabaseAdmin
      .from("users")
      .select("id, title, first_name, last_name, full_name")
      .in("id", teacherIds);
    if (teacherErr) {
      console.error("[timetable] homeroom teachers query error:", teacherErr);
    } else {
      homeroomTeachers = teacherIds
        .map((id) => (teachers ?? []).find((t) => t.id === id))
        .filter(Boolean) as any[];
    }
  }

  const { data: sections, error: sectionsErr } = await supabaseAdmin
    .from("subject_sections")
    .select(`
      id, subject_id, classroom_id, student_portal_enabled,
      subject:subjects ( id, subject_code, name_th )
    `)
    .eq("classroom_id", student.classroom_id)
    .eq("student_portal_enabled", true);

  if (sectionsErr) {
    console.error("[timetable] sections query error:", sectionsErr);
    return NextResponse.json({ error: "ดึงตารางเรียนไม่สำเร็จ" }, { status: 500 });
  }

  const sectionList = sections ?? [];
  const commonInfo = {
    student: {
      id: student.id,
      prefix: getAutoPrefix(student.gender, student.birth_date, student.prefix),
      first_name: student.first_name,
      last_name: student.last_name,
      seat_number: student.seat_number,
    },
    classroom: classroom ? { room_name: classroom.room_name, grade_group: classroom.grade_group } : null,
    homeroom_teachers: homeroomTeachers.map((t) => ({
      title: t.title ?? "",
      first_name: t.first_name ?? "",
      last_name: t.last_name ?? "",
      full_name: t.full_name ?? "",
    })),
  };

  if (sectionList.length === 0) {
    return NextResponse.json({ sections: [], ...commonInfo });
  }

  const { data: entries, error: entriesErr } = await supabaseAdmin
    .from("timetable_entries")
    .select("id, classroom_id, subject_id, day_of_week, time_slot_id")
    .eq("classroom_id", student.classroom_id);

  if (entriesErr) {
    console.error("[timetable] entries query error:", entriesErr);
    return NextResponse.json({ error: "ดึงตารางเรียนไม่สำเร็จ" }, { status: 500 });
  }

  const entryList = entries ?? [];

  const slotIds = [...new Set(entryList.map((e) => e.time_slot_id).filter(Boolean))];
  let slotMap = new Map<string, { slot_number: number; start_time: string; end_time: string }>();

  if (slotIds.length > 0) {
    const { data: slots, error: slotsErr } = await supabaseAdmin
      .from("time_slots")
      .select("id, slot_number, start_time, end_time")
      .in("id", slotIds);

    if (slotsErr) {
      console.error("[timetable] time_slots query error:", slotsErr);
      return NextResponse.json({ error: "ดึงข้อมูลคาบเวลาไม่สำเร็จ" }, { status: 500 });
    }
    slotMap = new Map((slots ?? []).map((s) => [s.id, s]));
  }

  const result = sectionList.map((sec: any) => ({
    id: sec.id,
    subject: sec.subject ?? null,
    timetable_entries: entryList
      .filter((e) => e.subject_id === sec.subject_id)
      .map((e) => {
        const slot = slotMap.get(e.time_slot_id);
        return {
          id: e.id,
          day_of_week: e.day_of_week,
          slot_number: slot?.slot_number ?? 0,
          start_time: slot?.start_time ?? "",
          end_time: slot?.end_time ?? "",
        };
      }),
  }));

  return NextResponse.json({ sections: result, ...commonInfo });
}