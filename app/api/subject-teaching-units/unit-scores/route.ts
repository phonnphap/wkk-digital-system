// app/api/subject-teaching-units/unit-scores/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RawAssignment = {
  id: string;
  title: string;
  max_score: number;
  teaching_unit_no: number;
  subject_section_id: string;
};

type Group = {
  title: string;
  max_score: number;
  instance_ids: string[];
  instance_sections: string[];
};

type LinkedAssignmentOut = {
  id: string;
  title: string;
  max_score: number;
  computed_weight: number;
  instance_ids: string[];
  section_count: number;
};

type UnitScoreOut = {
  totalMaxScore: number;
  scorePoints: number;
  assignments: LinkedAssignmentOut[];
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_id = searchParams.get("subject_id");
    const academic_year_id = searchParams.get("academic_year_id");
    if (!subject_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    let unitsQuery = admin
      .from("subject_teaching_units")
      .select("unit_no, score_points")
      .eq("subject_id", subject_id);
    if (academic_year_id) unitsQuery = unitsQuery.eq("academic_year_id", academic_year_id);
    const { data: units, error: uErr } = await unitsQuery;
    if (uErr) throw uErr;

    let secQuery = admin.from("subject_sections").select("id").eq("subject_id", subject_id);
    if (academic_year_id) secQuery = secQuery.eq("academic_year_id", academic_year_id);
    const { data: sections, error: secErr } = await secQuery;
    if (secErr) throw secErr;
    const sectionIds: string[] = (sections ?? []).map((s: any) => s.id);

    const { data: assignments, error: aErr } = sectionIds.length
      ? await admin
          .from("assignments")
          .select("id, title, max_score, teaching_unit_no, subject_section_id")
          .in("subject_section_id", sectionIds)
          .not("teaching_unit_no", "is", null)
          .eq("status", "published")
      : { data: [] as RawAssignment[], error: null };
    if (aErr) throw aErr;

    // จัดกลุ่มตามหน่วย แล้วภายในหน่วยจัดกลุ่มย่อยตาม "ชื่องาน" (trim + lowercase)
    // ชิ้นงานชื่อเดียวกันข้ามห้อง (เช่น import/มอบหมายข้ามห้องมา) นับ max_score แค่ครั้งเดียว
    const byUnit = new Map<number, Map<string, Group>>();

    (assignments ?? []).forEach((a: RawAssignment) => {
      const no = a.teaching_unit_no;
      if (no === null || no === undefined) return;

      if (!byUnit.has(no)) byUnit.set(no, new Map<string, Group>());
      const groupMap = byUnit.get(no)!;

      const key = (a.title ?? "").trim().toLowerCase();
      const existing = groupMap.get(key);
      if (existing) {
        existing.instance_ids.push(a.id);
        existing.instance_sections.push(a.subject_section_id);
        existing.max_score = Math.max(existing.max_score, a.max_score ?? 0);
      } else {
        groupMap.set(key, {
          title: a.title,
          max_score: a.max_score ?? 0,
          instance_ids: [a.id],
          instance_sections: [a.subject_section_id],
        });
      }
    });

    const unitScores: Record<number, UnitScoreOut> = {};

    (units ?? []).forEach((u: any) => {
      const groupMap = byUnit.get(u.unit_no);
      const groups: Group[] = groupMap ? Array.from(groupMap.values()) : [];
      const totalMaxScore = groups.reduce((s, g) => s + (g.max_score || 0), 0);
      const scorePoints = u.score_points ?? 0;

      unitScores[u.unit_no] = {
        totalMaxScore,
        scorePoints,
        assignments: groups.map((g) => ({
          id: g.instance_ids[0],
          title: g.title,
          max_score: g.max_score,
          computed_weight: totalMaxScore > 0 ? (g.max_score / totalMaxScore) * scorePoints : 0,
          instance_ids: g.instance_ids,
          section_count: new Set(g.instance_sections).size,
        })),
      };
    });

    return NextResponse.json({ unitScores });
  } catch (err: any) {
    console.error("[GET /api/subject-teaching-units/unit-scores] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนต่อหน่วยไม่สำเร็จ" }, { status: 500 });
  }
}