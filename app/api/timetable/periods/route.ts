import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/timetable/periods?subject_section_id=xxx&attendance_date=yyyy-mm-dd
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

    // 2) คำนวณ day_of_week จากวันที่
    const dow = new Date(`${attendance_date}T12:00:00Z`).getDay();

    // 3) หา timetable_entries ปกติที่ตรงกับห้อง+วิชา+ครู+วันในสัปดาห์นั้น
    const { data: normalEntries, error: ttErr } = await admin
      .from("timetable_entries")
      .select("id, time_slot_id, day_of_week, teacher_id, teacher_id_2")
      .eq("classroom_id", section.classroom_id)
      .eq("subject_id", section.subject_id)
      .eq("day_of_week", dow)
      .or(`teacher_id.eq.${section.teacher_id},teacher_id_2.eq.${section.teacher_id}`);
    if (ttErr) throw ttErr;

    let rows = normalEntries ?? [];

    // 4) ★ กรองคาบที่ถูกสลับ "ออกไป" วันอื่นแล้ว ไม่ให้ขึ้นซ้ำในวันเดิม
    const { data: movedAway } = await admin
      .from("class_reschedules")
      .select("timetable_entry_id")
      .eq("original_date", attendance_date);
    const movedAwayIds = new Set((movedAway ?? []).map(r => r.timetable_entry_id));
    rows = rows.filter(r => !movedAwayIds.has(r.id));

    // 5) ★ เพิ่มคาบที่ถูกสลับ "เข้ามา" ในวันนี้ (จากวันอื่น) — ไม่สนใจ day_of_week เดิมของมันแล้ว
    const { data: movedIn } = await admin
      .from("class_reschedules")
      .select("timetable_entry_id")
      .eq("new_date", attendance_date);
    const movedInIds = (movedIn ?? []).map(r => r.timetable_entry_id);

    if (movedInIds.length > 0) {
      const { data: movedEntries } = await admin
        .from("timetable_entries")
        .select("id, time_slot_id, day_of_week, teacher_id, teacher_id_2")
        .in("id", movedInIds)
        .eq("classroom_id", section.classroom_id)
        .eq("subject_id", section.subject_id);
      // กันซ้ำ เผื่อ id ตรงกับที่มีอยู่แล้วใน rows
      const existingIds = new Set(rows.map(r => r.id));
      (movedEntries ?? []).forEach(e => {
        if (!existingIds.has(e.id)) rows.push(e);
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ periods: [] });
    }

    // 6) แนบข้อมูลคาบ (เวลา/label) จาก time_slots
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