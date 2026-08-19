import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-grades/group-summary?subject_section_id=xxx
// ใช้ต่อจาก /api/subject-grades/summary — เช็กว่าวิชานี้ตั้ง score_group_code ไว้ไหม
// ถ้าตั้งไว้และมีวิชาอื่นในกลุ่มเดียวกัน + ห้องเดียวกัน จะรวมคะแนนของนักเรียนแต่ละคนข้ามวิชาในกลุ่มให้
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1) section ปัจจุบัน -> subject_id, classroom_id
    const { data: currentSection, error: secErr } = await admin
      .from("subject_sections")
      .select("id, subject_id, classroom_id")
      .eq("id", subject_section_id)
      .maybeSingle();
    if (secErr) throw secErr;
    if (!currentSection) {
      return NextResponse.json({ error: "ไม่พบ subject_section" }, { status: 404 });
    }

    // 2) score_group_code ของวิชานี้
    const { data: currentSubject, error: subjErr } = await admin
      .from("subjects")
      .select("id, score_group_code")
      .eq("id", currentSection.subject_id)
      .maybeSingle();
    if (subjErr) throw subjErr;

    const groupCode = currentSubject?.score_group_code ?? null;
    if (!groupCode) {
      return NextResponse.json({ grouped: false });
    }

    // 3) วิชาทั้งหมดที่ตั้งรหัสกลุ่มเดียวกัน
    const { data: groupSubjects, error: gsErr } = await admin
      .from("subjects")
      .select("id, subject_code, name_th")
      .eq("score_group_code", groupCode);
    if (gsErr) throw gsErr;

    const groupSubjectIds = (groupSubjects ?? []).map((s: any) => s.id);
    if (groupSubjectIds.length <= 1) {
      // ตั้งรหัสไว้แต่ยังไม่มีวิชาอื่นมาร่วมกลุ่ม -> ยังไม่ต้องรวม
      return NextResponse.json({ grouped: false });
    }

    // 4) section ของวิชากลุ่มนี้ เฉพาะห้องเดียวกับ section ปัจจุบัน (นักเรียนชุดเดียวกัน)
    const { data: groupSections, error: gsecErr } = await admin
      .from("subject_sections")
      .select("id, subject_id")
      .in("subject_id", groupSubjectIds)
      .eq("classroom_id", currentSection.classroom_id);
    if (gsecErr) throw gsecErr;

    if (!groupSections || groupSections.length <= 1) {
      return NextResponse.json({ grouped: false });
    }

    const sectionIds = groupSections.map((s: any) => s.id);

    // 5) รวม assignments + submissions + score_events ของทุก section ในกลุ่ม
    const { data: allAssignments, error: aErr } = await admin
      .from("assignments")
      .select("id, subject_section_id, max_score")
      .in("subject_section_id", sectionIds);
    if (aErr) throw aErr;

    const assignmentIds = (allAssignments ?? []).map((a: any) => a.id);

    const [{ data: allSubmissions, error: sErr }, { data: allScoreEvents, error: eErr }] = await Promise.all([
      assignmentIds.length > 0
        ? admin
            .from("assignment_submissions")
            .select("assignment_id, student_id, score")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("score_events")
        .select("subject_section_id, student_id, points")
        .in("subject_section_id", sectionIds),
    ]);
    if (sErr) throw sErr;
    if (eErr) throw eErr;

    const totalMaxScore = (allAssignments ?? []).reduce((sum: number, a: any) => sum + (a.max_score ?? 0), 0);

    const totalsByStudent: Record<string, number> = {};
    (allSubmissions ?? []).forEach((sub: any) => {
      if (sub.score === null || sub.score === undefined) return;
      totalsByStudent[sub.student_id] = (totalsByStudent[sub.student_id] ?? 0) + sub.score;
    });
    (allScoreEvents ?? []).forEach((ev: any) => {
      totalsByStudent[ev.student_id] = (totalsByStudent[ev.student_id] ?? 0) + ev.points;
    });

    return NextResponse.json({
      grouped: true,
      groupCode,
      subjects: groupSubjects,
      totalMaxScore,
      totalsByStudent, // { [student_id]: คะแนนรวมทุกวิชาในกลุ่ม }
    });
  } catch (err: any) {
    console.error("[GET /api/subject-grades/group-summary] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดข้อมูลคะแนนรวมกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}