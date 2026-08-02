import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-attendance?timetable_entry_id=xxx&attendance_date=yyyy-mm-dd
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timetable_entry_id = searchParams.get("timetable_entry_id");
    const attendance_date = searchParams.get("attendance_date");
    if (!timetable_entry_id || !attendance_date) {
      return NextResponse.json({ error: "ต้องระบุ timetable_entry_id และ attendance_date" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subject_attendance")
      .select("*")
      .eq("timetable_entry_id", timetable_entry_id)
      .eq("attendance_date", attendance_date);
    if (error) throw error;
    return NextResponse.json({ records: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/subject-attendance] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลเช็กชื่อไม่สำเร็จ" }, { status: 500 });
  }
}

// POST /api/subject-attendance — bulk upsert รายคาบ
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { timetable_entry_id, attendance_date, records, created_by } = body as {
      timetable_entry_id: string;
      attendance_date: string;
      records: { student_id: string; status: "present" | "absent" | "late" | "leave" | "excused"; note?: string }[];
      created_by?: string;
    };
    if (!timetable_entry_id || !attendance_date || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ กรุณาระบุคาบเรียน วันที่ และรายชื่อนักเรียน" }, { status: 400 });
    }
    const admin = createAdminClient();
    const rows = records.map(r => ({
      timetable_entry_id, attendance_date, student_id: r.student_id, status: r.status,
      notes: r.note || null, checked_by: created_by || null, check_time: new Date().toISOString(),
    }));
    // ⚠️ ต้องมี unique constraint (timetable_entry_id, student_id, attendance_date) ในตาราง
    // ถ้ายังไม่มี ให้รัน: alter table subject_attendance add constraint subject_attendance_unique
    //   unique (timetable_entry_id, student_id, attendance_date);
    const { data, error } = await admin
      .from("subject_attendance")
      .upsert(rows, { onConflict: "timetable_entry_id,student_id,attendance_date" })
      .select("*");
    if (error) throw error;
    return NextResponse.json({ records: data });
  } catch (err: any) {
    console.error("[POST /api/subject-attendance] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกเช็กชื่อไม่สำเร็จ" }, { status: 500 });
  }
}