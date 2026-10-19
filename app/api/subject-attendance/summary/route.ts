import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaller } from "@/lib/auth/getCaller";

export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) {
      return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: section, error: sectionErr } = await admin
      .from("subject_sections")
      .select("id, classroom_id, subject_id")
      .eq("id", subject_section_id)
      .maybeSingle();
    if (sectionErr) throw sectionErr;
    if (!section) {
      return NextResponse.json({ error: "ไม่พบข้อมูล subject_section" }, { status: 404 });
    }
    if (caller.kind === "student" && section.classroom_id !== caller.classroomId) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
    }

    const { data: entries, error: entriesErr } = await admin
      .from("timetable_entries")
      .select("id")
      .eq("classroom_id", section.classroom_id)
      .eq("subject_id", section.subject_id);
    if (entriesErr) throw entriesErr;

    const entryIds = (entries ?? []).map((e: any) => e.id);
    if (entryIds.length === 0) return NextResponse.json({ dates: [], records: [] });

    const { data: rows, error } = await admin
      .from("subject_attendance")
      .select("student_id, attendance_date, status")
      .in("timetable_entry_id", entryIds)
      .order("attendance_date", { ascending: true });
    if (error) throw error;

    // คำนวณ dates จากทุกแถวก่อน แล้วค่อยกรอง records (ไม่งั้นจำนวนวันทั้งหมดของ นร. จะเพี้ยน)
    const dates = Array.from(new Set((rows ?? []).map((r: any) => r.attendance_date))).sort();
    const records = caller.kind === "student"
      ? (rows ?? []).filter((r: any) => r.student_id === caller.studentId)
      : rows ?? [];

    return NextResponse.json({ dates, records });
  } catch (err: any) {
    console.error("[GET /api/subject-attendance/summary] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลสรุปเช็กชื่อไม่สำเร็จ" }, { status: 500 });
  }
}