import type { SupabaseClient } from "@supabase/supabase-js";

type Params = {
  sectionId: string;
  studentId: string;
  examType: "midterm" | "final";
  rawScore: number | null;      // null = รีเซท
  rawMaxScore: number | null;   // เต็มดิบของข้อสอบ (ถ้าไม่ได้ตั้ง = null)
  gradedBy: string | null;
};

/**
 * ซิงก์คะแนนสอบกลางภาค/ปลายภาคไปยังวิชาอื่นในกลุ่มรวมคะแนนเดียวกัน
 * (ห้องเดียวกัน + ปีการศึกษา/ภาคเรียนเดียวกัน) คืนค่าจำนวน section ที่ซิงก์สำเร็จ
 * ต้องใช้ service-role client เพราะเขียนข้าม section ของครูคนอื่น
 */
export async function syncGroupExamScore(admin: SupabaseClient, p: Params): Promise<number> {
  const { data: src } = await admin
    .from("subject_sections")
    .select("id, subject_id, classroom_id, academic_year_id, midterm_max_score, final_max_score")
    .eq("id", p.sectionId)
    .maybeSingle();
  if (!src) return 0;

  const { data: subj } = await admin
    .from("subjects")
    .select("score_group_code")
    .eq("id", src.subject_id)
    .maybeSingle();
  const code = subj?.score_group_code;
  if (!code) return 0; // ไม่ได้รวมกลุ่ม -> ทำงานแบบเดิม

  const { data: groupSubjects } = await admin
    .from("subjects")
    .select("id, is_archived")
    .eq("score_group_code", code)
    .neq("id", src.subject_id);
  const targetSubjectIds = (groupSubjects ?? []).filter(s => !s.is_archived).map(s => s.id);
  if (targetSubjectIds.length === 0) return 0;

  let q = admin
    .from("subject_sections")
    .select("id, midterm_max_score, final_max_score")
    .in("subject_id", targetSubjectIds)
    .eq("classroom_id", src.classroom_id)
    .neq("id", src.id);
  if (src.academic_year_id) q = q.eq("academic_year_id", src.academic_year_id);

  const { data: siblings } = await q;
  if (!siblings || siblings.length === 0) return 0;

  const srcMax = Number(p.examType === "midterm" ? src.midterm_max_score : src.final_max_score) || 0;
  // ถ้าไม่ได้ตั้งเต็มดิบ ถือว่าคะแนนที่กรอกอยู่บนสเกลเต็มของ section ต้นทาง
  const effectiveRawMax = p.rawMaxScore && p.rawMaxScore > 0 ? p.rawMaxScore : srcMax;

  let synced = 0;
  for (const sib of siblings) {
    if (p.rawScore === null) {
      const { error } = await admin
        .from("subject_exam_scores")
        .delete()
        .eq("subject_section_id", sib.id)
        .eq("student_id", p.studentId)
        .eq("exam_type", p.examType);
      if (!error) synced++;
      continue;
    }

    const sibMax = Number(p.examType === "midterm" ? sib.midterm_max_score : sib.final_max_score) || 0;
    const weighted = effectiveRawMax > 0 ? (p.rawScore / effectiveRawMax) * sibMax : p.rawScore;

    const { error } = await admin.from("subject_exam_scores").upsert(
      {
        subject_section_id: sib.id,
        student_id: p.studentId,
        exam_type: p.examType,
        score: weighted,
        raw_score: p.rawScore,
        raw_max_score: effectiveRawMax,
        graded_by: p.gradedBy,
        graded_at: new Date().toISOString(),
      },
      { onConflict: "subject_section_id,student_id,exam_type" }
    );
    if (!error) synced++;
    else console.error("[syncGroupExamScore] upsert failed for section", sib.id, error);
  }
  return synced;
}