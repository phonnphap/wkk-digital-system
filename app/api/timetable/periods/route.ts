import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/timetable/periods?subject_section_id=xxx&attendance_date=yyyy-mm-dd
// หาว่าวิชา (subject_section) นี้ มีคาบเรียนตามตารางสอนในวันที่ระบุกี่คาบ คาบไหนบ้าง
// ใช้ day_of_week ที่คำนวณจาก attendance_date (จันทร์=1 ... ศุกร์=5 ตรงกับ JS Date.getDay())
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    const attendance_date = searchParams.get("attendance_date");
    if (!subject_section_id || !attendance_date) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id และ attendance_date" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1) ดึง subject_section เพื่อรู้ classroom_id, subject_id, teacher_id
    const { data: section, error: secErr } = await admin
      .from("subject_sections")
      .select("id, classroom_id, subject_id, teacher_id, co_teacher_id")
      .eq("id", subject_section_id)
      .maybeSingle();
    if (secErr) throw secErr;
    if (!section) return NextResponse.json({ error: "ไม่พบวิชานี้" }, { status: 404 });

    // 2) คำนวณ day_of_week จากวันที่ (ใช้ UTC noon กัน timezone เพี้ยนวันข้ามคืน)
    const dow = new Date(`${attendance_date}T12:00:00Z`).getDay(); // 0=อา,1=จ,...6=ส

    // 3) หา timetable_entries ที่ตรงกับห้อง+วิชา+ครู(หลักหรือรอง)+วันในสัปดาห์นั้น
    const { data: entries, error: ttErr } = await admin
      .from("timetable_entries")
      .select("id, time_slot_id, day_of_week, teacher_id, teacher_id_2")
      .eq("classroom_id", section.classroom_id)
      .eq("subject_id", section.subject_id)
      .eq("day_of_week", dow)
      .or(`teacher_id.eq.${section.teacher_id},teacher_id_2.eq.${section.teacher_id}`);
    if (ttErr) throw ttErr;

    const rows = entries ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ periods: [] });
    }

    // 4) แนบข้อมูลคาบ (เวลา/label) จาก time_slots
    const slotIds = [...new Set(rows.map(r => r.time_slot_id))];
    const { data: slots } = await admin
      .from("time_slots")
      .select("id, slot_number, start_time, end_time, slot_label")
      .in("id", slotIds);
    const slotMap = new Map((slots ?? []).map(s => [s.id, s]));

    const periods = rows
      .map(r => ({ timetable_entry_id: r.id, ...slotMap.get(r.time_slot_id) }))
      .sort((a: any, b: any) => (a.slot_number ?? 0) - (b.slot_number ?? 0));

    return NextResponse.json({ periods });
  } catch (err: any) {
    console.error("[GET /api/timetable/periods] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคาบเรียนไม่สำเร็จ" }, { status: 500 });
  }
}