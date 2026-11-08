import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ExamRow = {
  subject_section_id: string;
  student_id: string;
  exam_type: "midterm" | "final";
  score: number | null;
  raw_score: number | null;
  raw_max_score: number | null;
  graded_by: string | null;
  graded_at: string | null;
};

// ดึงทีละหน้า เพราะ Supabase จำกัด 1,000 แถวต่อ query
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += n) res.push(arr.slice(i, i + n));
  return res;
}

// POST /api/admin/backfill-group-exam-scores
// header: x-backfill-secret: <BACKFILL_SECRET>
// body: { dry_run?: boolean (default true), group_code?: string, source_subject_id?: string, overwrite?: boolean }
export async function POST(req: NextRequest) {
  if (!process.env.BACKFILL_SECRET || req.headers.get("x-backfill-secret") !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run !== false; // ค่าเริ่มต้น = dry run เพื่อความปลอดภัย
    const onlyGroup: string | undefined = body.group_code;
    const preferredSubjectId: string | undefined = body.source_subject_id;
    const overwrite: boolean = body.overwrite === true;

    const admin = createAdminClient();

    // 1) วิชาที่อยู่ในกลุ่ม (ไม่เอาที่เก็บเข้าคลัง)
    let sq = admin.from("subjects").select("id, score_group_code, is_archived").not("score_group_code", "is", null);
    if (onlyGroup) sq = sq.eq("score_group_code", onlyGroup);
    const { data: subjects, error: sErr } = await sq;
    if (sErr) throw sErr;
    const activeSubjects = (subjects ?? []).filter(s => !s.is_archived);
    const codeOfSubject = new Map(activeSubjects.map(s => [s.id, s.score_group_code as string]));
    if (codeOfSubject.size === 0) return NextResponse.json({ message: "ไม่พบวิชาที่รวมกลุ่ม" });

    // 2) sections ของวิชาเหล่านั้น
    const sections: any[] = [];
    for (const ids of chunk([...codeOfSubject.keys()], 100)) {
      const rows = await fetchAll<any>((from, to) =>
        admin.from("subject_sections")
          .select("id, subject_id, classroom_id, academic_year_id, midterm_max_score, final_max_score")
          .in("subject_id", ids).range(from, to)
      );
      sections.push(...rows);
    }

    // 3) จัดกลุ่มเป็น bucket: รหัสกลุ่ม + ห้อง + ปีการศึกษา
    const buckets = new Map<string, any[]>();
    for (const sec of sections) {
      const key = `${codeOfSubject.get(sec.subject_id)}|${sec.classroom_id}|${sec.academic_year_id ?? ""}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(sec);
    }
    const multi = [...buckets.entries()].filter(([, v]) => v.length >= 2);
    if (multi.length === 0) return NextResponse.json({ message: "ไม่มีห้องที่มีหลายวิชาในกลุ่มเดียวกัน" });

    // 4) คะแนนสอบทั้งหมดของ sections ใน bucket
    const sectionIds = multi.flatMap(([, v]) => v.map(s => s.id));
    const scores: ExamRow[] = [];
    for (const ids of chunk(sectionIds, 100)) {
      const rows = await fetchAll<ExamRow>((from, to) =>
        admin.from("subject_exam_scores")
          .select("subject_section_id, student_id, exam_type, score, raw_score, raw_max_score, graded_by, graded_at")
          .in("subject_section_id", ids).range(from, to)
      );
      scores.push(...rows);
    }
    const byKey = new Map<string, ExamRow>(); // sectionId|student|exam
    scores.forEach(r => byKey.set(`${r.subject_section_id}|${r.student_id}|${r.exam_type}`, r));

    // 5) วางแผน
    const toWrite: any[] = [];
    const conflicts: any[] = [];
    let alreadyOk = 0;

    for (const [key, secs] of multi) {
      const students = new Set<string>();
      scores.forEach(r => { if (secs.some(s => s.id === r.subject_section_id)) students.add(r.student_id); });

      for (const studentId of students) {
        for (const examType of ["midterm", "final"] as const) {
          const maxOf = (s: any) => Number(examType === "midterm" ? s.midterm_max_score : s.final_max_score) || 0;
          const have = secs
            .map(s => ({ sec: s, row: byKey.get(`${s.id}|${studentId}|${examType}`) }))
            .filter(x => x.row && x.row.score !== null) as { sec: any; row: ExamRow }[];
          if (have.length === 0) continue;

          const preferred = preferredSubjectId ? have.find(x => x.sec.subject_id === preferredSubjectId) : undefined;
          const source = preferred ?? [...have].sort(
            (a, b) => new Date(b.row.graded_at ?? 0).getTime() - new Date(a.row.graded_at ?? 0).getTime()
          )[0];

          const srcMax = maxOf(source.sec);
          const rawScore = source.row.raw_score ?? source.row.score!;
          const rawMax = source.row.raw_max_score && source.row.raw_max_score > 0 ? source.row.raw_max_score : srcMax;

          for (const sib of secs) {
            if (sib.id === source.sec.id) continue;
            const sibMax = maxOf(sib);
            const weighted = rawMax > 0 ? (rawScore / rawMax) * sibMax : rawScore;
            const existing = byKey.get(`${sib.id}|${studentId}|${examType}`);

            if (existing && existing.score !== null) {
              if (Math.abs(existing.score - weighted) < 0.001) { alreadyOk++; continue; }
              if (!overwrite) {
                conflicts.push({
                  bucket: key, student_id: studentId, exam_type: examType,
                  source_section: source.sec.id, source_raw: rawScore,
                  target_section: sib.id, target_existing_score: existing.score, would_be: weighted,
                });
                continue;
              }
            }
            toWrite.push({
              subject_section_id: sib.id, student_id: studentId, exam_type: examType,
              score: weighted, raw_score: rawScore, raw_max_score: rawMax,
              graded_by: source.row.graded_by, graded_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // 6) เขียนจริง (ถ้าไม่ใช่ dry run)
    let written = 0;
    if (!dryRun) {
      for (const part of chunk(toWrite, 500)) {
        const { error } = await admin.from("subject_exam_scores")
          .upsert(part, { onConflict: "subject_section_id,student_id,exam_type" });
        if (error) throw error;
        written += part.length;
      }
    }

    return NextResponse.json({
      dry_run: dryRun,
      buckets_scanned: multi.length,
      rows_to_write: toWrite.length,
      rows_written: written,
      already_in_sync: alreadyOk,
      conflicts_count: conflicts.length,
      conflicts: conflicts.slice(0, 50),
      sample: toWrite.slice(0, 10),
    });
  } catch (e: any) {
    console.error("[backfill-group-exam-scores]", e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}