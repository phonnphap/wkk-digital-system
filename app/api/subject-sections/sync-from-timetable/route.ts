import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateJoinCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const created_by = body?.created_by;
    if (!created_by) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้งานที่สั่งซิงค์ กรุณาล็อกอินใหม่" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: entries, error: ttErr } = await admin
      .from("timetable_entries")
      .select("classroom_id, subject_id, teacher_id, teacher_id_2, academic_year_id");
    if (ttErr) throw ttErr;

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

    const { data: existing, error: exErr } = await admin
      .from("subject_sections")
      .select("subject_id, classroom_id, academic_year_id");
    if (exErr) throw exErr;
    const existingKeys = new Set(
      (existing ?? []).map(s => `${s.academic_year_id}::${s.classroom_id}::${s.subject_id}`)
    );

    const rows: any[] = [];
    for (const [key, g] of groups) {
      if (existingKeys.has(key)) continue;
      const sortedTeachers = [...g.teacherCounts.entries()].sort((a, b) => b[1] - a[1]);
      const teacher_id = sortedTeachers[0]?.[0];
      const co_teacher_id = sortedTeachers[1]?.[0] ?? null;
      if (!teacher_id) continue;
      rows.push({
        academic_year_id: g.academic_year_id, classroom_id: g.classroom_id, subject_id: g.subject_id,
        teacher_id, co_teacher_id, join_code: generateJoinCode(), is_active: true,
        created_by,   // ★ เพิ่มบรรทัดนี้ — แก้ปัญหา NOT NULL constraint
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ created: 0, skipped: existingKeys.size, message: "ไม่มีวิชาใหม่ที่ต้องสร้าง (ซิงค์ล่าสุดแล้ว)" });
    }

    const { data: inserted, error: insErr } = await admin
      .from("subject_sections")
      .insert(rows)
      .select("id");

    if (insErr) {
      if (insErr.code === "23505") {
        const retryRows = rows.map(r => ({ ...r, join_code: generateJoinCode() }));
        const { data: retryInserted, error: retryErr } = await admin
          .from("subject_sections").insert(retryRows).select("id");
        if (retryErr) throw retryErr;
        return NextResponse.json({ created: retryInserted?.length ?? 0, skipped: existingKeys.size });
      }
      throw insErr;
    }

    return NextResponse.json({ created: inserted?.length ?? 0, skipped: existingKeys.size });
  } catch (err: any) {
    console.error("[POST /api/subject-sections/sync-from-timetable] error:", err);
    return NextResponse.json({ error: err?.message ?? "ซิงค์รายวิชาไม่สำเร็จ" }, { status: 500 });
  }
}