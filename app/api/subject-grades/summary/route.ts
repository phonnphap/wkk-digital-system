// app/api/subject-grades/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-grades/summary?subject_section_id=xxx
// รวมข้อมูลที่ต้องใช้วาดตาราง "คะแนนรวม" ในหน้าเดียว เพื่อลดจำนวน round-trip
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    const [
      { data: assignments, error: aErr },
      { data: presets, error: pErr },
      { data: criteria, error: cErr },
    ] = await Promise.all([
      admin
        .from("assignments")
        .select("id, title, max_score, weight_percent, allow_weight, status")
        .eq("subject_section_id", subject_section_id)
        .order("assigned_at", { ascending: true }),
      admin
        .from("score_presets")
        .select("id, label, points, emoji, sort_order")
        .eq("subject_section_id", subject_section_id)
        .order("sort_order", { ascending: true }),
      admin
        .from("grade_criteria")
        .select("id, max_percent, min_percent, grade, sort_order")
        .eq("subject_section_id", subject_section_id)
        .order("sort_order", { ascending: true }),
    ]);
    if (aErr) throw aErr;
    if (pErr) throw pErr;
    if (cErr) throw cErr;

    const assignmentIds = (assignments ?? []).map((a: any) => a.id);
    const presetIds = (presets ?? []).map((p: any) => p.id);

    const [{ data: submissions, error: sErr }, { data: scoreEvents, error: eErr }] = await Promise.all([
      assignmentIds.length > 0
        ? admin
            .from("assignment_submissions")
            .select("id, assignment_id, student_id, status, score, teacher_comment, graded_at")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      // score_events ผูกกับ subject_section_id ตรง ๆ อยู่แล้ว ไม่ต้องกรองด้วย preset_id ก็ได้
      // แต่กรองไว้เพื่อความชัดเจนว่านับเฉพาะพรีเซ็ตที่ยังอยู่ในหมวดนี้
      admin
        .from("score_events")
        .select("id, student_id, preset_id, points")
        .eq("subject_section_id", subject_section_id),
    ]);
    if (sErr) throw sErr;
    if (eErr) throw eErr;

    return NextResponse.json({
      assignments: assignments ?? [],
      presets: presets ?? [],
      criteria: criteria ?? [],
      submissions: submissions ?? [],
      scoreEvents: scoreEvents ?? [],
    });
  } catch (err: any) {
    console.error("[GET /api/subject-grades/summary] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนรวมไม่สำเร็จ" }, { status: 500 });
  }
}