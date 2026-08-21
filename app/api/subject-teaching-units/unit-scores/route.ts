// app/api/subject-teaching-units/unit-scores/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-teaching-units/unit-scores?subject_id=xxx&academic_year_id=yyy
//
// ═══════════════════════════════════════════════════════════════════════
// รวมคะแนนชิ้นงานที่ "ผูกหน่วยการเรียนรู้" (assignments.teaching_unit_no)
// จากทุก section/ห้อง/ครูที่สอนวิชานี้ (วผ.7.1 ใช้ร่วมกันทั้งวิชา ไม่ใช่แค่ห้องเดียว)
//
// น้ำหนักคะแนนจริงของแต่ละชิ้นงาน = (max_score ของชิ้นงาน ÷ ผลรวม max_score
// ของทุกชิ้นงานที่ผูกหน่วยเดียวกัน) × score_points ของหน่วยนั้น
// -> รวมกันแล้วเท่ากับ score_points ที่ตั้งไว้ในหน่วยเสมอ (ถ้ามีชิ้นงานผูกอยู่)
//
// นับเฉพาะชิ้นงานที่ status = "published" เท่านั้น (แบบร่างยังไม่นับ)
// ═══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_id = searchParams.get("subject_id");
    const academic_year_id = searchParams.get("academic_year_id");
    if (!subject_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1) หน่วยการเรียนรู้ของวิชานี้ (+ปีการศึกษาถ้าระบุ)
    let unitsQuery = admin
      .from("subject_teaching_units")
      .select("unit_no, score_points")
      .eq("subject_id", subject_id);
    if (academic_year_id) unitsQuery = unitsQuery.eq("academic_year_id", academic_year_id);
    const { data: units, error: uErr } = await unitsQuery;
    if (uErr) throw uErr;

    // 2) ทุก section ของวิชานี้ (ทุกห้อง/ทุกครูที่สอนวิชานี้)
    let secQuery = admin.from("subject_sections").select("id").eq("subject_id", subject_id);
    if (academic_year_id) secQuery = secQuery.eq("academic_year_id", academic_year_id);
    const { data: sections, error: secErr } = await secQuery;
    if (secErr) throw secErr;
    const sectionIds = (sections ?? []).map((s: any) => s.id);

    // 3) ชิ้นงานที่เผยแพร่แล้วและผูกหน่วยไว้ จากทุก section ข้างต้น
    const { data: assignments, error: aErr } = sectionIds.length
      ? await admin
          .from("assignments")
          .select("id, title, max_score, teaching_unit_no, subject_section_id")
          .in("subject_section_id", sectionIds)
          .not("teaching_unit_no", "is", null)
          .eq("status", "published")
      : { data: [] as any[], error: null };
    if (aErr) throw aErr;

    // 4) จัดกลุ่มตามหน่วย แล้วคำนวณน้ำหนักอัตโนมัติให้รวมเท่า score_points
    const byUnit: Record<number, { id: string; title: string; max_score: number }[]> = {};
    (assignments ?? []).forEach((a: any) => {
      const no = a.teaching_unit_no;
      if (no === null || no === undefined) return;
      if (!byUnit[no]) byUnit[no] = [];
      byUnit[no].push({ id: a.id, title: a.title, max_score: a.max_score ?? 0 });
    });

    const unitScores: Record<
      number,
      { totalMaxScore: number; scorePoints: number; assignments: { id: string; title: string; max_score: number; computed_weight: number }[] }
    > = {};
    (units ?? []).forEach((u: any) => {
      const list = byUnit[u.unit_no] ?? [];
      const totalMaxScore = list.reduce((s, x) => s + (x.max_score || 0), 0);
      const scorePoints = u.score_points ?? 0;
      unitScores[u.unit_no] = {
        totalMaxScore,
        scorePoints,
        assignments: list.map(x => ({
          ...x,
          computed_weight: totalMaxScore > 0 ? (x.max_score / totalMaxScore) * scorePoints : 0,
        })),
      };
    });

    return NextResponse.json({ unitScores });
  } catch (err: any) {
    console.error("[GET /api/subject-teaching-units/unit-scores] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนต่อหน่วยไม่สำเร็จ" }, { status: 500 });
  }
}