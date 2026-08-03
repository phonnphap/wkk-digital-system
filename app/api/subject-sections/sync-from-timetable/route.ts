import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateJoinCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// POST /api/subject-sections/sync-from-timetable
// สร้าง subject_sections อัตโนมัติจาก timetable_entries ที่มีอยู่
// group ตาม (academic_year_id, classroom_id, subject_id) — วิชาเดียวกันในห้องเดียวกัน
// ต่อให้มีหลายคาบ/สัปดาห์ ก็สร้าง section แค่ 1 แถว
export async function POST() {
  try {
    const admin = createAdminClient();

    const { data: entries, error: ttErr } = await admin
      .from("timetable_entries")
      .select("classroom_id, subject_id, teacher_id, teacher_id_2, academic_year_id");
    if (ttErr) throw ttErr;

    // group + นับความถี่ครู เพื่อเลือกครูหลัก/ครูรองที่เจอบ่อยสุด
    type GroupKey = string;
    const groups = new Map<GroupKey, {
      academic_year_id: string; classroom_id: string; subject_id: string;
      teacherCounts: Map<string, number>;
    }>();

    for (const e of entries ?? []) {
      if (!e.classroom_id || !e.subject_id || !e.academic_year_id || !e.teacher_id) continue;
      const key = `${e.academic_year_id}::${e.classroom_id}::${e.subject_id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          academic_year_id: e.academic_year_id, classroom_id: e.classroom_id, subject_id: e.subject_id,
          teacherCounts: new Map(),
        });
      }
      const g = groups.get(key)!;
      g.teacherCounts.set(e.teacher_id, (g.teacherCounts.get(e.teacher_id) ?? 0) + 1);
      if (e.teacher_id_2) g.teacherCounts.set(e.teacher_id_2, (g.teacherCounts.get(e.teacher_id_2) ?? 0) + 1);
    }

    // ดึง subject_sections ที่มีอยู่แล้วทั้งหมด กันสร้างซ้ำ
    const { data: existing, error: exErr } = await admin
      .from("subject_sections")
      .select("subject_id, classroom_id, academic_year_id");
    if (exErr) throw exErr;
    const existingKeys = new Set(
      (existing ?? []).map(s => `${s.academic_year_id}::${s.classroom_id}::${s.subject_id}`)
    );

    const toCreate: any[] = [];
    for (const [key, g] of groups) {
      if (existingKeys.has(key)) continue; // มีอยู่แล้ว ข้าม ไม่ทับของเดิม
      const sortedTeachers = [...g.teacherCounts.entries()].sort((a, b) => b[1] - a[1]);
      const teacher_id = sortedTeachers[0]?.[0];
      const co_teacher_id = sortedTeachers[1]?.[0] ?? null;
      if (!teacher_id) continue;
      toCreate.push({
        academic_year_id: g.academic_year_id, classroom_id: g.classroom_id, subject_id: g.subject_id,
        teacher_id, co_teacher_id, join_code: generateJoinCode(), is_active: true,
      });
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ created: 0, message: "ไม่มีวิชาใหม่ที่ต้องสร้าง (ซิงค์ล่าสุดแล้ว)" });
    }

    // insert ทีละแถว เพื่อ retry join_code ชนกันได้ (เหมือน logic เดิมของ POST /api/subject-sections)
    let created = 0;
    const failed: any[] = [];
    for (const row of toCreate) {
      let ok = false;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        const { error } = await admin.from("subject_sections").insert([{ ...row, join_code: generateJoinCode() }]);
        if (!error) { ok = true; created++; }
        else if (error.code !== "23505") { failed.push({ row, error: error.message }); break; }
      }
    }

    return NextResponse.json({ created, skipped: existingKeys.size, failed });
  } catch (err: any) {
    console.error("[POST /api/subject-sections/sync-from-timetable] error:", err);
    return NextResponse.json({ error: err?.message ?? "ซิงค์รายวิชาไม่สำเร็จ" }, { status: 500 });
  }
}