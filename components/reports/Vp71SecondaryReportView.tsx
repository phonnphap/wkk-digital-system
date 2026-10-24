"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   วผ.7.1 ระดับมัธยม — หน้ารายงานคะแนน (พิมพ์ได้)
   - วิชาพื้นฐาน    : ตัวชี้วัดปลายทาง (มีคะแนน รวม/สรุป ต่อหน่วย) + ตัวชี้วัดระหว่างทาง (สรุป ผ/มผ)
   - วิชาเพิ่มเติม  : ผลการเรียนรู้ (ปลายทางอย่างเดียว) รวม/สรุป ต่อหน่วย

   การแยก "ระหว่างทาง" / "ปลายทาง" ของวิชาพื้นฐาน (ดู indicatorKind ด้านล่าง):
   1) ถ้าบรรทัดขึ้นต้นด้วย [ระหว่างทาง] หรือ [ปลายทาง] → ใช้ตามที่ระบุ
   2) รหัสช่วงชั้น เช่น ม.1-3/1, ม.4-6/2        → ปลายทาง
   3) รหัสชั้นปี เช่น ม.1/1, ม.2/3               → ระหว่างทาง
   4) นอกนั้น                                      → ปลายทาง
   ========================================================================= */

type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number };
type PlanUnit = {
  unit_no: number;
  unit_name: string;
  indicators: string;
  learning_hours: number | null;
  score_points: number | null;
};
type ReportAssignment = {
  id: string;
  title: string;
  max_score: number;
  teaching_unit_no: number | null;
  selected_indicator_lines: string[] | null;
};
type ReportSubmission = { assignment_id: string; student_id: string; score: number | null; status: string };

type IndKind = "mid" | "end";
type Ind = { raw: string; kind: IndKind; standard: string; short: string; desc: string };
type UnitLayout = {
  unit: PlanUnit;
  end: Ind[];
  mid: Ind[];
  share: number; // คะแนนต่อ 1 ตัวชี้วัดปลายทาง
  groups: { standard: string; count: number }[]; // จัดกลุ่ม มฐ. (วิชาพื้นฐาน)
};
type CellState = "none" | "pending" | "pass" | "fail";

/* ---------- helpers ---------- */

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function gradeLevel(percent: number): string {
  if (percent >= 80) return "4";
  if (percent >= 75) return "3.5";
  if (percent >= 70) return "3";
  if (percent >= 65) return "2.5";
  if (percent >= 60) return "2";
  if (percent >= 55) return "1.5";
  if (percent >= 50) return "1";
  return "0";
}

function linesOf(text: string): string[] {
  return (text ?? "").split("\n").map(s => s.trim()).filter(Boolean);
}

function stripTag(line: string): string {
  return line.replace(/^\[(ปลายทาง|ระหว่างทาง)\]\s*/, "");
}

function indicatorKind(line: string): IndKind {
  const t = line.trim();
  if (t.startsWith("[ระหว่างทาง]")) return "mid";
  if (t.startsWith("[ปลายทาง]")) return "end";
  const clean = stripTag(t);
  if (/ม\.?\s*\d+\s*[-–]\s*\d+\s*\/\s*\d+/.test(clean)) return "end"; // ม.1-3/1
  if (/ม\.?\s*\d+\s*\/\s*\d+/.test(clean)) return "mid";              // ม.1/1
  return "end";
}

function parseIndicator(raw: string, isBasic: boolean): Ind {
  const kind: IndKind = isBasic ? indicatorKind(raw) : "end";
  const clean = stripTag(raw);
  if (isBasic) {
    const m = clean.match(/^(.*?)\s*(ม\.?\s*\d+(?:\s*[-–]\s*\d+)?\s*\/\s*\d+)\s*(.*)$/);
    if (m) {
      return { raw, kind, standard: m[1].trim(), short: m[2].replace(/\s+/g, ""), desc: m[3].trim() };
    }
  }
  const n = clean.match(/^(\d+)\s*(.*)$/);
  if (n) return { raw, kind, standard: "", short: n[1], desc: n[2] };
  return { raw, kind, standard: "", short: "-", desc: clean };
}

const SIGNATURES = [
  { role: "ครูประจำวิชา", name: "" },
  { role: "หัวหน้ากลุ่มสาระฯ", name: "" },
  { role: "หัวหน้ากลุ่มบริหารวิชาการ", name: "นางวนิดา  หวังวิวัฒนา" },
  { role: "รองผู้อำนวยการกลุ่มบริหารวิชาการ", name: "นายเศรษฐพล  บัวงาม" },
];

/* ---------- component ---------- */

export default function Vp71SecondaryReportView({
  subjectCode, subjectTitle, sectionId, students, units, isBasicSubject,
  midtermMaxScore, finalMaxScore, formativeMaxScore, classroomLabel, semester,
}: {
  subjectCode: string;
  subjectTitle: string;
  sectionId?: string;
  students?: Student[];
  units: PlanUnit[];
  isBasicSubject: boolean;
  midtermMaxScore: number;
  finalMaxScore: number;
  formativeMaxScore: number;
  classroomLabel?: string;
  semester?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [examScores, setExamScores] = useState<Record<string, { midterm: number | null; final: number | null }>>({});

  const midtermMax = midtermMaxScore;
  const finalMax = finalMaxScore;

  /* ----- โหลดข้อมูล ----- */
  useEffect(() => {
    if (!sectionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/subject-grades/summary?subject_section_id=${sectionId}`);
        const json = await res.json();
        const map: Record<string, { midterm: number | null; final: number | null }> = {};
        (json.examScores ?? []).forEach((e: { student_id: string; exam_type: "midterm" | "final"; score: number | null }) => {
          if (!map[e.student_id]) map[e.student_id] = { midterm: null, final: null };
          map[e.student_id][e.exam_type] = e.score;
        });
        setExamScores(map);
      } catch {
        setExamScores({});
      }
    })();
  }, [sectionId]);

  useEffect(() => {
    if (!sectionId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const { data: aRows } = await supabase
          .from("assignments")
          .select("id, title, max_score, teaching_unit_no, selected_indicator_lines")
          .eq("subject_section_id", sectionId)
          .not("teaching_unit_no", "is", null);
        const rows = (aRows ?? []) as ReportAssignment[];
        setAssignments(rows);
        const ids = rows.map(a => a.id);
        if (ids.length > 0) {
          const { data: subRows } = await supabase
            .from("assignment_submissions")
            .select("assignment_id, student_id, score, status")
            .in("assignment_id", ids);
          setSubmissions((subRows ?? []) as ReportSubmission[]);
        } else {
          setSubmissions([]);
        }
      } catch {
        setAssignments([]);
        setSubmissions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId]);

  const subMap = useMemo(() => {
    const m = new Map<string, number | null>();
    submissions.forEach(s => m.set(`${s.assignment_id}|${s.student_id}`, s.score));
    return m;
  }, [submissions]);

  /* ----- โครงตาราง ----- */
  const layouts: UnitLayout[] = useMemo(() => {
    return units
      .filter(u => u.unit_no && u.score_points)
      .sort((a, b) => a.unit_no - b.unit_no)
      .map(u => {
        const all = linesOf(u.indicators).map(raw => parseIndicator(raw, isBasicSubject));
        let end = all.filter(l => l.kind === "end");
        let mid = all.filter(l => l.kind === "mid");
        if (end.length === 0) { end = all; mid = []; } // กันหน่วยที่มีแต่ระหว่างทาง ไม่ให้คะแนนหาย
        const share = end.length > 0 ? (Number(u.score_points) || 0) / end.length : 0;
        const groups: { standard: string; count: number }[] = [];
        if (isBasicSubject) {
          end.forEach(l => {
            const last = groups[groups.length - 1];
            if (last && last.standard === l.standard) last.count += 1;
            else groups.push({ standard: l.standard, count: 1 });
          });
        }
        return { unit: u, end, mid, share, groups };
      });
  }, [units, isBasicSubject]);

  const sumUnitScorePoints = layouts.reduce((s, l) => s + (Number(l.unit.score_points) || 0), 0);
  const totalPossible = formativeMaxScore + midtermMax + finalMax;
  const totalHours = units.reduce((s, u) => s + (Number(u.learning_hours) || 0), 0);
  const midColCount = isBasicSubject ? 1 : 0;
  const endColCount = layouts.reduce((s, l) => s + l.end.length + 2, 0);
  const betweenSpan = endColCount + midColCount;
  const HEADER_ROWS = isBasicSubject ? 5 : 4;

  const gradeYear = (classroomLabel ?? "").match(/ม\.?\s*(\d)/)?.[1] ?? "";

  /* ----- คำนวณคะแนน ----- */
  function endCell(layout: UnitLayout, ind: Ind, studentId: string): { achieved: number; state: CellState } {
    const related = assignments.filter(
      a => a.teaching_unit_no === layout.unit.unit_no && (a.selected_indicator_lines ?? []).includes(ind.raw)
    );
    if (related.length === 0) return { achieved: 0, state: "none" };
    const totalMax = related.reduce((s, a) => s + (a.max_score || 0), 0);
    let achieved = 0, anyGraded = false;
    related.forEach(a => {
      const sc = subMap.get(`${a.id}|${studentId}`);
      if (sc != null) {
        anyGraded = true;
        if (totalMax > 0) achieved += (sc / totalMax) * layout.share;
      }
    });
    if (!anyGraded) return { achieved: 0, state: "pending" };
    const pass = layout.share > 0 && achieved / layout.share >= 0.5;
    return { achieved, state: pass ? "pass" : "fail" };
  }

  function midState(layout: UnitLayout, ind: Ind, studentId: string): CellState {
    const related = assignments.filter(
      a => a.teaching_unit_no === layout.unit.unit_no && (a.selected_indicator_lines ?? []).includes(ind.raw)
    );
    if (related.length === 0) return "none";
    let sumScore = 0, sumMax = 0, anyGraded = false;
    related.forEach(a => {
      sumMax += a.max_score || 0;
      const sc = subMap.get(`${a.id}|${studentId}`);
      if (sc != null) { sumScore += sc; anyGraded = true; }
    });
    if (!anyGraded) return "pending";
    return sumMax > 0 && sumScore / sumMax >= 0.5 ? "pass" : "fail";
  }

  function computeStudent(studentId: string) {
    let sumUnits = 0;
    const midStates: CellState[] = [];
    const unitCells = layouts.map(l => {
      const cells = l.end.map(ind => endCell(l, ind, studentId));
      const achieved = cells.reduce((s, c) => s + c.achieved, 0);
      const anyGraded = cells.some(c => c.state === "pass" || c.state === "fail");
      const points = Number(l.unit.score_points) || 0;
      const verdict = !anyGraded ? "-" : points > 0 && achieved / points >= 0.5 ? "ผ" : "มผ";
      sumUnits += achieved;
      l.mid.forEach(ind => midStates.push(midState(l, ind, studentId)));
      return { cells, achieved, verdict };
    });
    const graded = midStates.filter(s => s === "pass" || s === "fail");
    const midVerdict = graded.length === 0 ? "-" : graded.some(s => s === "fail") ? "มผ" : "ผ";
    return { unitCells, sumUnits, midVerdict };
  }

  /* ----- guards ----- */
  if (!sectionId || !students) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">📊</p>
        <p className="font-bold text-base">
          หน้านี้ต้องเปิดจากภายในห้องเรียนที่ต้องการดูรายงาน (ต้องส่ง <code>sectionId</code> และ <code>students</code> เข้ามา)
        </p>
      </div>
    );
  }
  if (loading) {
    return <div className="text-center py-16 text-slate-300 font-bold text-base">กำลังโหลดรายงาน...</div>;
  }
  if (layouts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 font-bold">
        ยังไม่มีหน่วยการเรียนรู้ที่ตั้งคะแนนเก็บ — กรอกที่แท็บ "แก้ไขแผน" ก่อน
      </div>
    );
  }

  const sortedStudents = [...students].sort((a, b) => a.seat_number - b.seat_number);
  const th = "border border-slate-300 px-1.5 py-1 font-black text-center";
  const td = "border border-slate-300 text-center px-1 py-1 font-black";
  const dots = (s: string | number | undefined, w = "min-w-[70px]") => (
    <span className={`inline-block border-b border-dotted border-black px-1 ${w}`}>{s || "\u00A0"}</span>
  );

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-3 print:hidden">
        <span className="text-[17px] text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
          น้ำหนักคะแนนเก็บ : คะแนนสอบ = {sumUnitScorePoints} : {midtermMax + finalMax}
          (กลางภาค {midtermMax} + ปลายภาค {finalMax}) · คะแนนเต็มรวม = {totalPossible} คะแนน
          {isBasicSubject && (
            <span className="ml-1 text-slate-300">
              — ตัวชี้วัดระหว่างทางสรุปเป็น ผ/มผ ไม่นับคะแนน (ระบุประเภทด้วย [ระหว่างทาง] / [ปลายทาง] หน้าบรรทัดได้)
            </span>
          )}
        </span>
      </div>

      <div className="vp71s-print-area">
        {/* ===== หัวกระดาษ ===== */}
        <div className="text-center mb-2 leading-snug">
          <p className="font-black text-[18px]">
            แบบบันทึกคะแนนการวัดและประเมินผลรายวิชา{isBasicSubject ? "พื้นฐาน" : "เพิ่มเติม"}
          </p>
          <p className="text-[17px] font-bold">
            รหัสวิชา {dots(subjectCode)} &nbsp; รายวิชา {dots(subjectTitle, "min-w-[160px]")} &nbsp;
            ภาคเรียนที่ {dots(semester, "min-w-[40px]")} &nbsp; ชั้นมัธยมศึกษาปีที่ {dots(gradeYear, "min-w-[40px]")}
          </p>
          <p className="text-[17px] font-bold">
            กลุ่มสาระการเรียนรู้ {dots("", "min-w-[200px]")} &nbsp; จำนวน {dots("", "min-w-[50px]")} ชั่วโมง/
            {dots("", "min-w-[50px]")} หน่วยกิต (รวม {totalHours || "-"} ชม.) &nbsp;
            สัดส่วนคะแนน {dots(sumUnitScorePoints, "min-w-[40px]")} : {dots(midtermMax + finalMax, "min-w-[40px]")}
          </p>
        </div>

        {/* ===== ตารางคะแนน ===== */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-auto print:border-0 print:rounded-none">
          <table className="w-full border-collapse text-[17px] vp71s-table">
            <thead>
              {/* R1 */}
              <tr className="bg-slate-50">
                <th rowSpan={HEADER_ROWS} className={`${th} whitespace-nowrap`}>ที่</th>
                <th rowSpan={HEADER_ROWS} className={`${th} min-w-[170px] whitespace-nowrap`}>ชื่อ-สกุล</th>
                <th colSpan={betweenSpan} className={`${th} bg-amber-300`}>คะแนนระหว่างเรียน</th>
                <th rowSpan={HEADER_ROWS} className={th}>
                  รวมคะแนน<br />{isBasicSubject ? "ตัวชี้วัด" : "ผลการเรียนรู้"}
                </th>
                <th rowSpan={HEADER_ROWS} className={th}>กลางภาค<br />({midtermMax})</th>
                <th rowSpan={HEADER_ROWS} className={th}>รวมคะแนน<br />ระหว่างเรียน</th>
                <th rowSpan={HEADER_ROWS} className={th}>ปลายภาค<br />({finalMax})</th>
                <th rowSpan={HEADER_ROWS} className={th}>รวม<br />({totalPossible})</th>
                <th rowSpan={HEADER_ROWS} className={th}>ระดับ<br />ผลการเรียน</th>
              </tr>
              {/* R2 */}
              <tr>
                <th colSpan={endColCount} className={`${th} bg-pink-200`}>
                  {isBasicSubject ? "ตัวชี้วัดปลายทาง" : "ตัวชี้วัดปลายทาง (ผลการเรียนรู้)"}
                </th>
                {isBasicSubject && <th className={`${th} bg-emerald-300`}>ตัวชี้วัดระหว่างทาง</th>}
              </tr>
              {/* R3 : หน่วย */}
              <tr className="bg-yellow-100">
                {layouts.map(l => (
                  <th key={l.unit.unit_no} colSpan={l.end.length + 2} className={th} title={l.unit.unit_name}>
                    หน่วยที่ {l.unit.unit_no}{l.unit.unit_name ? ` · ${l.unit.unit_name}` : ""}
                  </th>
                ))}
                {isBasicSubject && <th rowSpan={3} className={`${th} bg-emerald-100`}>สรุป</th>}
              </tr>
              {/* R4 : มฐ. (พื้นฐาน) หรือ รหัส ผลการเรียนรู้ (เพิ่มเติม) */}
              <tr className="bg-yellow-100">
                {layouts.map(l => (
                  <Fragment key={l.unit.unit_no}>
                    {isBasicSubject
                      ? l.groups.map((g, gi) => (
                          <th key={`g${gi}`} colSpan={g.count} className={`${th} whitespace-nowrap`}>
                            {g.standard ? `มฐ. ${g.standard}` : "มฐ."}
                          </th>
                        ))
                      : l.end.map((ind, i) => (
                          <th key={`i${i}`} className={th} title={ind.desc}>{ind.short}</th>
                        ))}
                    <th rowSpan={isBasicSubject ? 2 : 1} className={th}>รวม</th>
                    <th rowSpan={isBasicSubject ? 2 : 1} className={th}>สรุป</th>
                  </Fragment>
                ))}
              </tr>
              {/* R5 : ตัวชี้วัด (พื้นฐานเท่านั้น) */}
              {isBasicSubject && (
                <tr className="bg-yellow-100">
                  {layouts.map(l => (
                    <Fragment key={l.unit.unit_no}>
                      {l.end.map((ind, i) => (
                        <th key={`i${i}`} className={`${th} whitespace-nowrap`} title={ind.desc}>{ind.short}</th>
                      ))}
                    </Fragment>
                  ))}
                </tr>
              )}
            </thead>

            <tbody>
              {/* แถวคะแนนเต็ม */}
              <tr className="bg-yellow-50 font-black">
                <td className={td}></td>
                <td className={`${td} text-right pr-2`}>คะแนนเต็ม</td>
                {layouts.map(l => (
                  <Fragment key={l.unit.unit_no}>
                    {l.end.map((_, i) => <td key={i} className={td}>{fmtScore(l.share)}</td>)}
                    <td className={td}>{fmtScore(Number(l.unit.score_points) || 0)}</td>
                    <td className={td}>ผ/มผ</td>
                  </Fragment>
                ))}
                {isBasicSubject && <td className={td}>ผ/มผ</td>}
                <td className={td}>{fmtScore(sumUnitScorePoints)}</td>
                <td className={td}>{midtermMax}</td>
                <td className={td}>{fmtScore(sumUnitScorePoints + midtermMax)}</td>
                <td className={td}>{finalMax}</td>
                <td className={td}>{totalPossible}</td>
                <td className={td}></td>
              </tr>

              {sortedStudents.map(s => {
                const exam = examScores[s.id] ?? { midterm: null, final: null };
                const { unitCells, sumUnits, midVerdict } = computeStudent(s.id);
                const midterm = exam.midterm ?? 0;
                const total = sumUnits + midterm + (exam.final ?? 0);
                const percent = totalPossible > 0 ? (total / totalPossible) * 100 : 0;
                const verdictCls = (v: string) =>
                  v === "ผ" ? "text-emerald-600" : v === "มผ" ? "text-rose-500" : "text-slate-300";
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className={`${td} font-bold whitespace-nowrap`}>{s.seat_number}</td>
                    <td className="border border-slate-300 px-2 py-1 font-bold whitespace-nowrap">
                      {s.prefix ?? ""}{s.first_name} {s.last_name}
                    </td>
                    {layouts.map((l, li) => (
                      <Fragment key={l.unit.unit_no}>
                        {unitCells[li].cells.map((c, i) => (
                          <td
                            key={i}
                            className={`${td} ${c.state === "pass" ? "text-emerald-600" : c.state === "fail" ? "text-rose-500" : "text-slate-300"}`}
                          >
                            {c.state === "none" || c.state === "pending" ? "–" : fmtScore(c.achieved)}
                          </td>
                        ))}
                        <td className={`${td} bg-fuchsia-50/40 print:bg-white`}>{fmtScore(unitCells[li].achieved)}</td>
                        <td className={`${td} ${verdictCls(unitCells[li].verdict)}`}>{unitCells[li].verdict}</td>
                      </Fragment>
                    ))}
                    {isBasicSubject && <td className={`${td} ${verdictCls(midVerdict)}`}>{midVerdict}</td>}
                    <td className={td}>{sumUnitScorePoints ? fmtScore(sumUnits) : "-"}</td>
                    <td className={td}>{exam.midterm ?? "-"}</td>
                    <td className={td}>{fmtScore(sumUnits + midterm)}</td>
                    <td className={td}>{exam.final ?? "-"}</td>
                    <td className={td}>{fmtScore(total)}</td>
                    <td className={td}>{gradeLevel(percent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ===== คำอธิบายตัวชี้วัด ===== */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-4 space-y-3 text-[17px] print:mt-2 print:border-0 print:p-0 vp71s-avoid">
          <p className="font-black text-slate-600">
            คำอธิบาย{isBasicSubject ? "ตัวชี้วัด" : "ผลการเรียนรู้"}
          </p>
          {layouts.map(l => {
            const renderList = (list: Ind[]) => (
              <ul className="pl-4 list-disc space-y-0.5">
                {list.map((ind, i) => (
                  <li key={i} className="font-bold text-slate-500">
                    <span className="text-slate-400">
                      {isBasicSubject ? `${ind.standard} ${ind.short}`.trim() : `ผลการเรียนรู้ข้อที่ ${ind.short}`}:
                    </span>{" "}
                    {ind.desc}
                  </li>
                ))}
              </ul>
            );
            return (
              <div key={l.unit.unit_no}>
                <p className="font-black text-slate-500">หน่วยที่ {l.unit.unit_no} {l.unit.unit_name}</p>
                {isBasicSubject ? (
                  <>
                    {l.end.length > 0 && (
                      <>
                        <p className="font-black text-pink-500 text-[15px]">ตัวชี้วัดปลายทาง</p>
                        {renderList(l.end)}
                      </>
                    )}
                    {l.mid.length > 0 && (
                      <>
                        <p className="font-black text-emerald-600 text-[15px] mt-1">ตัวชี้วัดระหว่างทาง</p>
                        {renderList(l.mid)}
                      </>
                    )}
                  </>
                ) : (
                  renderList(l.end)
                )}
              </div>
            );
          })}
        </div>

        {/* ===== ลายเซ็น ===== */}
        <div className="mt-6 vp71s-avoid" style={{ marginLeft: "38%" }}>
          {SIGNATURES.map(sg => (
            <div key={sg.role} className="mb-4 text-[18px] font-bold leading-snug">
              <p>ลงชื่อ{dots("", "min-w-[220px]")}{sg.role}</p>
              <p className="pl-8">({sg.name ? sg.name : dots("", "min-w-[200px]")})</p>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden; }
          .vp71s-print-area, .vp71s-print-area * { visibility: visible; }
          .vp71s-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .vp71s-table { font-size: 10px; }
          .vp71s-table th, .vp71s-table td {
            border: 1px solid #000 !important;
            color: #000 !important;
            background: #fff !important;
            padding: 2px 3px !important;
          }
          .vp71s-table thead { display: table-header-group; }
          .vp71s-table tr { break-inside: avoid; }
          .vp71s-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}