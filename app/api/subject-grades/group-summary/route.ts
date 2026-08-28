import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-grades/group-summary?subject_section_id=xxx
//
// ★ DEBUG BUILD: เวอร์ชันนี้ใส่ console.time/timeEnd คั่นทุกขั้นตอน เพื่อหาว่า
// ขั้นตอนไหนกินเวลาไปกี่วินาทีจริงๆ (เพราะเช็ค index แล้วครบทุกจุด ตัดเรื่อง missing index ทิ้งได้)
// ดู log ได้ที่ Vercel → Deployments → เลือก deployment ล่าสุด → Logs (runtime logs, ไม่ใช่ build logs)
// หรือรัน `vercel dev` / `next dev` แล้วดู terminal ตรงๆ ถ้าทดสอบ local
//
// เมื่อหาสาเหตุที่แท้จริงได้แล้ว ให้เอา console.time ออก แล้วใช้เวอร์ชัน production ตัวก่อนหน้าแทน
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }

    console.log(`[group-summary] start subject_section_id=${subject_section_id}`);

    const tClient0 = Date.now();
    const admin = createAdminClient();
    console.log(`[group-summary] createAdminClient: ${Date.now() - tClient0}ms`);

    const tSection0 = Date.now();
    const { data: currentSection, error: secErr } = await admin
      .from("subject_sections")
      .select("id, subject_id, classroom_id, subject:subjects ( id, subject_code, score_group_code )")
      .eq("id", subject_section_id)
      .maybeSingle();
    console.log(`[group-summary] query currentSection: ${Date.now() - tSection0}ms`);
    if (secErr) throw secErr;
    if (!currentSection) {
      return NextResponse.json({ error: "ไม่พบ subject_section" }, { status: 404 });
    }

    const currentSubject = (currentSection as any).subject;
    if (!currentSubject) {
      return NextResponse.json({ grouped: false });
    }

    const explicitGroupCode: string | null = currentSubject.score_group_code ?? null;
    const guessedGroupCode: string | null = currentSubject.subject_code ? currentSubject.subject_code.slice(0, 6) : null;

    let groupCode: string | null = null;
    let candidateSubjects: any[] = [];
    let isGuessed = false;

    const tCandidates0 = Date.now();
    if (explicitGroupCode) {
      groupCode = explicitGroupCode;
      const { data, error } = await admin
        .from("subjects")
        .select("id, subject_code, name_th, score_group_code, score_group_weight_percent")
        .eq("score_group_code", explicitGroupCode);
      if (error) throw error;
      candidateSubjects = data ?? [];
    } else if (guessedGroupCode) {
      const { data, error } = await admin
        .from("subjects")
        .select("id, subject_code, name_th, score_group_code, score_group_weight_percent")
        .ilike("subject_code", `${guessedGroupCode}%`);
      if (error) throw error;
      candidateSubjects = (data ?? []).filter((s: any) => !s.score_group_code);
      groupCode = guessedGroupCode;
      isGuessed = true;
    }
    console.log(`[group-summary] query candidateSubjects (${candidateSubjects.length} rows, explicit=${!!explicitGroupCode}): ${Date.now() - tCandidates0}ms`);

    if (!groupCode || candidateSubjects.length <= 1) {
      return NextResponse.json({ grouped: false });
    }

    const groupSubjectIds = candidateSubjects.map((s: any) => s.id);

    const tGroupSections0 = Date.now();
    const [{ data: groupSections, error: gsecErr }, { data: groupMeta }] = await Promise.all([
      admin
        .from("subject_sections")
        .select("id, subject_id")
        .in("subject_id", groupSubjectIds)
        .eq("classroom_id", currentSection.classroom_id),
      admin
        .from("subject_score_groups")
        .select("group_code, display_name")
        .eq("group_code", groupCode)
        .maybeSingle(),
    ]);
    console.log(`[group-summary] query groupSections+groupMeta (${groupSections?.length ?? 0} sections): ${Date.now() - tGroupSections0}ms`);
    if (gsecErr) throw gsecErr;

    if (!groupSections || groupSections.length <= 1) {
      return NextResponse.json({ grouped: false });
    }

    const sectionBySubjectId: Record<string, string> = {};
    groupSections.forEach((s: any) => { sectionBySubjectId[s.subject_id] = s.id; });
    const sectionIds = groupSections.map((s: any) => s.id);

    const tAssignments0 = Date.now();
    const { data: allAssignments, error: aErr } = await admin
      .from("assignments")
      .select("id, subject_section_id, max_score")
      .in("subject_section_id", sectionIds);
    console.log(`[group-summary] query allAssignments (${allAssignments?.length ?? 0} rows): ${Date.now() - tAssignments0}ms`);
    if (aErr) throw aErr;

    const assignmentIds = (allAssignments ?? []).map((a: any) => a.id);

    const tSubEvents0 = Date.now();
    const [{ data: allSubmissions, error: sErr }, { data: allScoreEvents, error: eErr }] = await Promise.all([
      assignmentIds.length > 0
        ? admin.from("assignment_submissions").select("assignment_id, student_id, score").in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("score_events").select("subject_section_id, student_id, points").in("subject_section_id", sectionIds),
    ]);
    console.log(`[group-summary] query submissions(${allSubmissions?.length ?? 0})+scoreEvents(${allScoreEvents?.length ?? 0}): ${Date.now() - tSubEvents0}ms`);
    if (sErr) throw sErr;
    if (eErr) throw eErr;

    const assignmentMeta: Record<string, { subject_section_id: string; max_score: number }> = {};
    (allAssignments ?? []).forEach((a: any) => {
      assignmentMeta[a.id] = { subject_section_id: a.subject_section_id, max_score: a.max_score ?? 0 };
    });

    const perSectionMax: Record<string, number> = {};
    sectionIds.forEach((id: string) => { perSectionMax[id] = 0; });
    (allAssignments ?? []).forEach((a: any) => {
      perSectionMax[a.subject_section_id] = (perSectionMax[a.subject_section_id] ?? 0) + (a.max_score ?? 0);
    });

    const perSectionStudentTotals: Record<string, Record<string, number>> = {};
    sectionIds.forEach((id: string) => { perSectionStudentTotals[id] = {}; });

    (allSubmissions ?? []).forEach((sub: any) => {
      if (sub.score === null || sub.score === undefined) return;
      const meta = assignmentMeta[sub.assignment_id];
      if (!meta) return;
      const bucket = perSectionStudentTotals[meta.subject_section_id];
      bucket[sub.student_id] = (bucket[sub.student_id] ?? 0) + sub.score;
    });
    (allScoreEvents ?? []).forEach((ev: any) => {
      const bucket = perSectionStudentTotals[ev.subject_section_id];
      if (!bucket) return;
      bucket[ev.student_id] = (bucket[ev.student_id] ?? 0) + ev.points;
    });

    const withSection = candidateSubjects
      .map((s: any) => ({ ...s, section_id: sectionBySubjectId[s.id] ?? null }))
      .filter((s: any) => s.section_id);

    const unweightedCount = withSection.filter(
      (s: any) => s.score_group_weight_percent === null || s.score_group_weight_percent === undefined
    ).length;
    const assignedWeightSum = withSection.reduce((sum: number, s: any) => sum + (s.score_group_weight_percent ?? 0), 0);
    const remainingWeight = Math.max(0, 100 - assignedWeightSum);
    const fallbackWeightEach = unweightedCount > 0 ? remainingWeight / unweightedCount : 0;

    const subjectsOut = withSection.map((s: any) => ({
      id: s.id,
      subject_code: s.subject_code,
      name_th: s.name_th,
      weight_percent: s.score_group_weight_percent ?? Number(fallbackWeightEach.toFixed(2)),
      section_id: s.section_id,
      total_max_score: perSectionMax[s.section_id] ?? 0,
    }));

    const studentIds = new Set<string>();
    Object.values(perSectionStudentTotals).forEach(bucket => Object.keys(bucket).forEach(id => studentIds.add(id)));

    const combinedPercentByStudent: Record<string, number> = {};
    studentIds.forEach(studentId => {
      let combined = 0;
      subjectsOut.forEach(s => {
        const raw = perSectionStudentTotals[s.section_id]?.[studentId] ?? 0;
        const pct = s.total_max_score > 0 ? (raw / s.total_max_score) * 100 : 0;
        combined += pct * (s.weight_percent / 100);
      });
      combinedPercentByStudent[studentId] = combined;
    });

    console.log(`[group-summary] TOTAL: ${Date.now() - t0}ms`);

    return NextResponse.json({
      grouped: true,
      groupCode,
      displayName: groupMeta?.display_name ?? null,
      isGuessed,
      subjects: subjectsOut,
      combinedPercentByStudent,
    });
  } catch (err: any) {
    console.error(`[group-summary] error after ${Date.now() - t0}ms:`, err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนรวมกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}