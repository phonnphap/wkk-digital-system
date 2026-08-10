import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-attendance/summary?subject_section_id=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // หา timetable_entry ทั้งหมดที่ผูกกับ section นี้
    const { data: entries, error: entriesErr } = await admin
      .from("timetable_entries")
      .select("id")
      .eq("subject_section_id", subject_section_id);
    if (entriesErr) throw entriesErr;

    const entryIds = (entries ?? []).map((e: any) => e.id);
    if (entryIds.length === 0) {
      return NextResponse.json({ dates: [], records: [] });
    }

    const { data: rows, error } = await admin
      .from("subject_attendance")
      .select("student_id, attendance_date, status")
      .in("timetable_entry_id", entryIds)
      .order("attendance_date", { ascending: true });
    if (error) throw error;

    const dates = Array.from(new Set((rows ?? []).map((r: any) => r.attendance_date))).sort();

    return NextResponse.json({ dates, records: rows ?? [] });
  } catch (err: any) {
    console.error("[GET /api/subject-attendance/summary] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลสรุปเช็กชื่อไม่สำเร็จ" }, { status: 500 });
  }
}