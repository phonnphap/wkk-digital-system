"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   Types
   ========================================================================= */

type Unit = {
  unit_no: number;
  unit_name: string;
  indicators: string;
  learning_hours: number | null;
  score_points: number | null;
  note: string | null;
};

// ★ ข้อมูลชิ้นงานที่ผูกหน่วยนี้ + น้ำหนักคะแนนที่คำนวณอัตโนมัติ
type UnitLinkedAssignment = { id: string; title: string; max_score: number; computed_weight: number };
type UnitScoreInfo = { totalMaxScore: number; scorePoints: number; assignments: UnitLinkedAssignment[] };

// ★★ NEW — สำหรับหน้ารายงานคะแนน นร.ทั้งหมด
type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number };
type ReportAssignment = {
  id: string;
  title: string;
  max_score: number;
  teaching_unit_no: number | null;
  selected_indicator_lines: string[] | null;
};
type ReportSubmission = { assignment_id: string; student_id: string; score: number | null; status: string };
type ExamScoreRow = { student_id: string; midterm: number | null; final: number | null };

function emptyUnit(no: number): Unit {
  return { unit_no: no, unit_name: "", indicators: "", learning_hours: null, score_points: null, note: "" };
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ★ เกณฑ์ระดับผลการเรียน 0–4 มาตรฐาน (ปรับได้ตามโรงเรียน)
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

function indicatorLinesOf(u: Unit): string[] {
  return (u.indicators ?? "").split("\n").map(s => s.trim()).filter(Boolean);
}

export default function Vp71Tool({
  subjectId, academicYearId, subjectTitle, subjectCode, currentUserId, readOnly, onBack,
  sectionId, students,           // ★ NEW: ต้องส่งเข้ามาจาก parent เพื่อให้ดูรายงานได้ (เหมือน AssignmentsTool)
}: {
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  currentUserId?: string;
  readOnly?: boolean;
  onBack: () => void;
  sectionId?: string;            // ★ NEW
  students?: Student[];          // ★ NEW
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);

  // ★ สรุปคะแนนชิ้นงานที่ผูกแต่ละหน่วย (คีย์ = unit_no) — ใช้ในแท็บ "แก้ไขแผน"
  const [unitScores, setUnitScores] = useState<Record<number, UnitScoreInfo>>({});
  const [loadingUnitScores, setLoadingUnitScores] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);

  // ★★ NEW — สลับมุมมอง: แก้ไขแผน / รายงานคะแนน นร.ทั้งหมด
  const [view, setView] = useState<"edit" | "report">("edit");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ subject_id: subjectId, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
        const res = await fetch(`/api/subject-teaching-units?${qs.toString()}`);
        const json = await res.json();
        const rows: Unit[] = (json.units ?? []).map((u: any) => ({
          unit_no: u.unit_no, unit_name: u.unit_name, indicators: u.indicators,
          learning_hours: u.learning_hours, score_points: u.score_points, note: u.note,
        }));
        setUnits(rows.length > 0 ? rows : [emptyUnit(1)]);
      } catch {
        setUnits([emptyUnit(1)]);
      } finally {
        setLoading(false);
      }
    })();
  }, [subjectId, academicYearId]);

  // ★ โหลดสรุปคะแนนชิ้นงานที่ผูกแต่ละหน่วย (รวมทุกห้อง/ทุกครูที่สอนวิชานี้)
  async function loadUnitScores() {
    setLoadingUnitScores(true);
    try {
      const qs = new URLSearchParams({ subject_id: subjectId, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
      const res = await fetch(`/api/subject-teaching-units/unit-scores?${qs.toString()}`);
      const json = await res.json();
      if (res.ok) setUnitScores(json.unitScores ?? {});
    } catch {
      // ไม่ critical — แค่ไม่แสดงสรุป ตารางหลักยังใช้งานได้ปกติ
    } finally {
      setLoadingUnitScores(false);
    }
  }

  useEffect(() => {
    if (!subjectId) return;
    loadUnitScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, academicYearId]);

  function updateUnit(i: number, field: keyof Unit, value: any) {
    setUnits(prev => prev.map((u, idx) => (idx === i ? { ...u, [field]: value } : u)));
  }
  function addUnit() {
    setUnits(prev => [...prev, emptyUnit(prev.length + 1)]);
  }
  function removeUnit(i: number) {
    setUnits(prev => prev.filter((_, idx) => idx !== i).map((u, idx) => ({ ...u, unit_no: idx + 1 })));
  }

  const totalHours = units.reduce((s, u) => s + (Number(u.learning_hours) || 0), 0);
  const totalScore = units.reduce((s, u) => s + (Number(u.score_points) || 0), 0);

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    try {
      const res = await fetch("/api/subject-teaching-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId,
          academic_year_id: academicYearId ?? null,
          rows: units,
          updated_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setSavedAt(Date.now());
      loadUnitScores(); // ★ คะแนนเก็บอาจเปลี่ยน ให้รีเฟรชสรุปน้ำหนักด้วย
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  }

  // ★★ NEW — ปุ่มพิมพ์: สลับไปหน้า "รายงานคะแนน" ก่อนเสมอ แล้วค่อยสั่งพิมพ์
  function handlePrint() {
    if (view !== "report") {
      setView("report");
      setTimeout(() => window.print(), 400);
    } else {
      window.print();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <button onClick={onBack} className="text-xs font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          <h2 className="font-black text-slate-800 text-lg">วผ.7.1 แผนการวัดและประเมินผล</h2>
          <p className="text-slate-400 text-xs font-bold">
            {subjectCode} · {subjectTitle} · ข้อมูลนี้ใช้ร่วมกันทุกห้อง/ทุกครูที่สอนวิชานี้
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* ★★ NEW: ปุ่มสลับแท็บ แก้ไขแผน / รายงานคะแนน */}
          <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
            <button
              onClick={() => setView("edit")}
              className={`px-3 py-2 rounded-lg text-xs font-black transition-colors ${view === "edit" ? "bg-fuchsia-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              📝 แก้ไขแผน
            </button>
            <button
              onClick={() => setView("report")}
              className={`px-3 py-2 rounded-lg text-xs font-black transition-colors ${view === "report" ? "bg-fuchsia-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              📊 รายงานคะแนน นร.
            </button>
          </div>
          <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm">
            🖨️ พิมพ์
          </button>
          {!readOnly && view === "edit" && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-sm">
              {saving ? "กำลังบันทึก..." : "💾 บันทึกทั้งหมด"}
            </button>
          )}
        </div>
      </div>
      {savedAt && !saving && view === "edit" && (
        <p className="text-xs font-black text-emerald-500 print:hidden">✅ บันทึกแล้ว</p>
      )}

      {view === "edit" ? (
        <EditPlanView
          loading={loading}
          units={units}
          unitScores={unitScores}
          loadingUnitScores={loadingUnitScores}
          expandedUnit={expandedUnit}
          setExpandedUnit={setExpandedUnit}
          readOnly={readOnly}
          updateUnit={updateUnit}
          removeUnit={removeUnit}
          addUnit={addUnit}
          totalHours={totalHours}
          totalScore={totalScore}
        />
      ) : (
        <ReportView
          subjectId={subjectId}
          subjectCode={subjectCode}
          subjectTitle={subjectTitle}
          academicYearId={academicYearId}
          currentUserId={currentUserId}
          sectionId={sectionId}
          students={students}
          units={units}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

/* =========================================================================
   หน้าแก้ไขแผน (โค้ดเดิม แยกออกมาเป็นคอมโพเนนต์ย่อยเพื่อความอ่านง่าย)
   ========================================================================= */

function EditPlanView({
  loading, units, unitScores, loadingUnitScores, expandedUnit, setExpandedUnit,
  readOnly, updateUnit, removeUnit, addUnit, totalHours, totalScore,
}: {
  loading: boolean;
  units: Unit[];
  unitScores: Record<number, UnitScoreInfo>;
  loadingUnitScores: boolean;
  expandedUnit: number | null;
  setExpandedUnit: (n: number | null) => void;
  readOnly?: boolean;
  updateUnit: (i: number, field: keyof Unit, value: any) => void;
  removeUnit: (i: number) => void;
  addUnit: () => void;
  totalHours: number;
  totalScore: number;
}) {
  if (loading) {
    return <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลด...</div>;
  }
  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-auto">
        <table className="w-full min-w-[960px] border-collapse text-xs">
          <thead className="bg-gradient-to-r from-indigo-50 to-fuchsia-50">
            <tr>
              <th className="px-2 py-3 font-black text-slate-600 w-10">หน่วยที่</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[180px]">ชื่อหน่วยการเรียนรู้</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[280px]">ตัวชี้วัด (พิมพ์ 1 บรรทัดต่อ 1 ข้อ)</th>
              <th className="px-2 py-3 font-black text-slate-600 w-24">จำนวนชั่วโมง</th>
              <th className="px-2 py-3 font-black text-slate-600 w-24">คะแนนเก็บ</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[140px]">หมายเหตุ</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[200px]">ชิ้นงานที่ผูกหน่วยนี้</th>
              <th className="px-2 py-3 w-8 print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {units.map((u, i) => {
              const info = unitScores[u.unit_no];
              const linkedCount = info?.assignments.length ?? 0;
              const isExpanded = expandedUnit === u.unit_no;
              return (
              <>
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="text-center px-2 py-2 font-black text-slate-500">{u.unit_no}</td>
                <td className="px-2 py-2">
                  <input
                    value={u.unit_name} disabled={readOnly}
                    onChange={e => updateUnit(i, "unit_name", e.target.value)}
                    placeholder="เช่น หน่วยที่ 1 ระบบคอมพิวเตอร์"
                    className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                  />
                </td>
                <td className="px-2 py-2">
                  <textarea
                    value={u.indicators} disabled={readOnly} rows={3}
                    onChange={e => updateUnit(i, "indicators", e.target.value)}
                    placeholder={"ว 4.2 ป.1/1 ...\nว 4.2 ป.1/2 ..."}
                    className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold resize-y disabled:bg-slate-50"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number" min={0} value={u.learning_hours ?? ""} disabled={readOnly}
                    onChange={e => updateUnit(i, "learning_hours", e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full text-center border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number" min={0} value={u.score_points ?? ""} disabled={readOnly}
                    onChange={e => updateUnit(i, "score_points", e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full text-center border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={u.note ?? ""} disabled={readOnly}
                    onChange={e => updateUnit(i, "note", e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                  />
                </td>
                <td className="px-2 py-2">
                  {loadingUnitScores ? (
                    <span className="text-[10px] text-slate-300 font-bold">กำลังโหลด...</span>
                  ) : !u.score_points ? (
                    <span className="text-[10px] text-slate-300 font-bold">— ยังไม่ตั้งคะแนนเก็บ —</span>
                  ) : linkedCount === 0 ? (
                    <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-600">
                      ⚠️ ยังไม่มีชิ้นงานผูก
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedUnit(isExpanded ? null : u.unit_no)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                    >
                      ✅ ผูกแล้ว {linkedCount} ชิ้น (รวม {fmtScore(info!.totalMaxScore)} คะแนนดิบ) {isExpanded ? "▲" : "▼"}
                    </button>
                  )}
                </td>
                <td className="text-center px-1 py-2 print:hidden">
                  {!readOnly && units.length > 1 && (
                    <button onClick={() => removeUnit(i)} className="text-red-400 hover:text-red-600 font-black">✕</button>
                  )}
                </td>
              </tr>
              {isExpanded && info && (
                <tr className="bg-emerald-50/40">
                  <td></td>
                  <td colSpan={7} className="px-4 py-3">
                    <p className="text-[11px] font-black text-emerald-700 mb-2">
                      ระบบคำนวณน้ำหนักคะแนนของแต่ละชิ้นงานอัตโนมัติ ให้รวมกันเท่ากับคะแนนเก็บที่ตั้งไว้ ({fmtScore(u.score_points ?? 0)} คะแนน) เสมอ
                    </p>
                    <div className="space-y-1">
                      {info.assignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between bg-white rounded-lg border border-emerald-100 px-3 py-1.5">
                          <span className="font-bold text-slate-600 truncate pr-2">{a.title}</span>
                          <span className="text-slate-400 font-bold shrink-0">
                            เต็ม {fmtScore(a.max_score)} → <span className="text-emerald-600 font-black">{fmtScore(a.computed_weight)} คะแนนจริง</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-black">
              <td colSpan={3} className="px-3 py-2 text-right">รวม</td>
              <td className="text-center px-2 py-2">{totalHours || "-"}</td>
              <td className="text-center px-2 py-2">{totalScore || "-"}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!readOnly && (
        <button onClick={addUnit} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-500 font-black text-xs print:hidden">
          + เพิ่มหน่วยการเรียนรู้
        </button>
      )}
    </>
  );
}

/* =========================================================================
   ★★ NEW — หน้ารายงานคะแนน นร.ทั้งหมด (แบบบันทึกคะแนนการวัดและประเมินผลรายวิชา)
   จัดกลุ่มคอลัมน์ตามหน่วยการเรียนรู้ → คอลัมน์ย่อยตามตัวชี้วัด + คอลัมน์สรุปของหน่วย
   ตามด้วย กลางภาค / ปลายภาค / รวม / ระดับผลการเรียน
   ========================================================================= */

function ReportView({
  subjectId, subjectCode, subjectTitle, academicYearId, currentUserId,
  sectionId, students, units, readOnly,
}: {
  subjectId: string;
  subjectCode: string;
  subjectTitle: string;
  academicYearId?: string | null;
  currentUserId?: string;
  sectionId?: string;
  students?: Student[];
  units: Unit[];
  readOnly?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [examScores, setExamScores] = useState<Record<string, ExamScoreRow>>({});
  const [midtermMax, setMidtermMax] = useState(20);
  const [finalMax, setFinalMax] = useState(20);
  const [savingExamFor, setSavingExamFor] = useState<string | null>(null);

  const unitsWithScore = useMemo(() => units.filter(u => u.unit_no && u.score_points), [units]);

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

        // ★ ตารางใหม่ subject_exam_scores — ดูหมายเหตุ SQL ท้ายไฟล์แชท
        const { data: examRows } = await supabase
          .from("subject_exam_scores")
          .select("student_id, midterm, final")
          .eq("subject_section_id", sectionId);
        const map: Record<string, ExamScoreRow> = {};
        (examRows ?? []).forEach((r: any) => { map[r.student_id] = r; });
        setExamScores(map);
      } catch {
        setAssignments([]);
        setSubmissions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId]);

  // ★ น้ำหนักคะแนนต่อชิ้นงาน (เท่ากับที่ระบบใช้ในแท็บแก้ไขแผน): score_points ของหน่วย × (max_score ของชิ้นงานนี้ / รวม max_score ทุกชิ้นในหน่วย)
  const computedWeightByAssignment = useMemo(() => {
    const map: Record<string, number> = {};
    unitsWithScore.forEach(u => {
      const inUnit = assignments.filter(a => a.teaching_unit_no === u.unit_no);
      const totalMax = inUnit.reduce((s, a) => s + (a.max_score || 0), 0);
      inUnit.forEach(a => {
        map[a.id] = totalMax > 0 ? (Number(u.score_points) || 0) * (a.max_score / totalMax) : 0;
      });
    });
    return map;
  }, [assignments, unitsWithScore]);

  function studentScoreForAssignment(assignmentId: string, studentId: string): number | null {
    const sub = submissions.find(s => s.assignment_id === assignmentId && s.student_id === studentId);
    return sub?.score ?? null;
  }

  // ★ คะแนนรวมที่ นร. ได้ในหน่วยนั้น (เทียบกับคะแนนเก็บของหน่วย)
  function unitAchievedScore(unit: Unit, studentId: string): number {
    const inUnit = assignments.filter(a => a.teaching_unit_no === unit.unit_no);
    return inUnit.reduce((sum, a) => {
      const score = studentScoreForAssignment(a.id, studentId);
      if (score == null || !a.max_score) return sum;
      const weight = computedWeightByAssignment[a.id] ?? 0;
      return sum + (score / a.max_score) * weight;
    }, 0);
  }

  // ★ ผ่าน/ไม่ผ่านตัวชี้วัด: ผ่านถ้ามีชิ้นงานที่ผูกตัวชี้วัดนี้ ที่ นร. ได้คะแนน ≥ 50%
  function passedIndicator(unit: Unit, line: string, studentId: string): boolean {
    const related = assignments.filter(
      a => a.teaching_unit_no === unit.unit_no && (a.selected_indicator_lines ?? []).includes(line)
    );
    return related.some(a => {
      const score = studentScoreForAssignment(a.id, studentId);
      return score != null && a.max_score > 0 && score / a.max_score >= 0.5;
    });
  }

  async function saveExamScore(studentId: string, field: "midterm" | "final", value: number | null) {
    if (!sectionId || readOnly) return;
    setSavingExamFor(studentId);
    const current = examScores[studentId] ?? { student_id: studentId, midterm: null, final: null };
    const next = { ...current, [field]: value };
    setExamScores(prev => ({ ...prev, [studentId]: next }));
    try {
      await supabase.from("subject_exam_scores").upsert(
        { subject_section_id: sectionId, student_id: studentId, midterm: next.midterm, final: next.final, updated_by: currentUserId || null },
        { onConflict: "subject_section_id,student_id" }
      );
    } catch (e: any) {
      alert("บันทึกคะแนนสอบไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setSavingExamFor(null);
  }

  const totalPossible = unitsWithScore.reduce((s, u) => s + (Number(u.score_points) || 0), 0) + midtermMax + finalMax;

  if (!sectionId || !students) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">📊</p>
        <p className="font-bold text-sm">
          หน้านี้ต้องเปิดจากภายในห้องเรียนที่ต้องการดูรายงาน (ต้องส่ง <code>sectionId</code> และ <code>students</code> เข้ามาให้คอมโพเนนต์นี้)
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลดรายงาน...</div>;
  }

  const sortedStudents = [...students].sort((a, b) => a.seat_number - b.seat_number);

  return (
    <div>
      {/* ตั้งคะแนนเต็ม กลางภาค/ปลายภาค */}
      <div className="flex items-center gap-3 flex-wrap mb-3 print:hidden">
        <label className="text-xs font-black text-slate-500 flex items-center gap-1.5">
          คะแนนเต็มกลางภาค
          <input type="number" value={midtermMax} onChange={e => setMidtermMax(Number(e.target.value) || 0)}
            className="w-16 border-2 border-slate-200 rounded-lg px-2 py-1 text-center font-bold" />
        </label>
        <label className="text-xs font-black text-slate-500 flex items-center gap-1.5">
          คะแนนเต็มปลายภาค
          <input type="number" value={finalMax} onChange={e => setFinalMax(Number(e.target.value) || 0)}
            className="w-16 border-2 border-slate-200 rounded-lg px-2 py-1 text-center font-bold" />
        </label>
        <span className="text-[11px] text-slate-400 font-bold">คะแนนเต็มรวมทั้งวิชา = {totalPossible}</span>
      </div>

      {/* หัวกระดาษสำหรับพิมพ์เท่านั้น */}
      <div className="hidden print:block text-center mb-3">
        <p className="font-black text-base">แบบบันทึกคะแนนการวัดและประเมินผลรายวิชา</p>
        <p className="text-sm font-bold">{subjectCode} · {subjectTitle}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-auto vp-print-report">
        <table className="w-full border-collapse text-[10px]">
          <thead className="bg-gradient-to-r from-indigo-50 to-fuchsia-50 print:bg-white">
            <tr>
              <th rowSpan={2} className="border border-slate-200 px-1 py-2 font-black w-8">เลขที่</th>
              <th rowSpan={2} className="border border-slate-200 px-2 py-2 font-black min-w-[140px] text-left">ชื่อ-สกุล</th>
              {unitsWithScore.map(u => (
                <th key={u.unit_no} colSpan={indicatorLinesOf(u).length + 1} className="border border-slate-200 px-1 py-2 font-black">
                  หน่วยที่ {u.unit_no} {u.unit_name ? `· ${u.unit_name}` : ""} ({fmtScore(u.score_points ?? 0)} คะแนน)
                </th>
              ))}
              <th rowSpan={2} className="border border-slate-200 px-2 py-2 font-black w-16">กลางภาค<br />({midtermMax})</th>
              <th rowSpan={2} className="border border-slate-200 px-2 py-2 font-black w-16">ปลายภาค<br />({finalMax})</th>
              <th rowSpan={2} className="border border-slate-200 px-2 py-2 font-black w-16">รวม<br />({totalPossible})</th>
              <th rowSpan={2} className="border border-slate-200 px-2 py-2 font-black w-14">ระดับ<br />ผลการเรียน</th>
            </tr>
            <tr>
              {unitsWithScore.map(u => (
                <>
                  {indicatorLinesOf(u).map((_, idx) => (
                    <th key={`${u.unit_no}-i${idx}`} className="border border-slate-200 px-1 py-1 font-bold w-7" title={indicatorLinesOf(u)[idx]}>
                      ตช.{idx + 1}
                    </th>
                  ))}
                  <th className="border border-slate-200 px-1 py-1 font-black w-12 bg-fuchsia-50 print:bg-white">รวม</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map(s => {
              const exam = examScores[s.id] ?? { student_id: s.id, midterm: null, final: null };
              const unitTotals = unitsWithScore.map(u => unitAchievedScore(u, s.id));
              const sumUnits = unitTotals.reduce((a, b) => a + b, 0);
              const total = sumUnits + (exam.midterm ?? 0) + (exam.final ?? 0);
              const percent = totalPossible > 0 ? (total / totalPossible) * 100 : 0;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="border border-slate-200 text-center px-1 py-1 font-bold">{s.seat_number}</td>
                  <td className="border border-slate-200 px-2 py-1 font-bold whitespace-nowrap">
                    {s.prefix ?? ""}{s.first_name} {s.last_name}
                  </td>
                  {unitsWithScore.map((u, ui) => (
                    <>
                      {indicatorLinesOf(u).map((line, idx) => (
                        <td key={`${u.unit_no}-${s.id}-i${idx}`} className="border border-slate-200 text-center px-1 py-1">
                          {passedIndicator(u, line, s.id) ? "✓" : "–"}
                        </td>
                      ))}
                      <td className="border border-slate-200 text-center px-1 py-1 font-black bg-fuchsia-50/40 print:bg-white">
                        {fmtScore(unitTotals[ui])}
                      </td>
                    </>
                  ))}
                  <td className="border border-slate-200 text-center px-1 py-1">
                    <input
                      type="number" disabled={readOnly}
                      value={exam.midterm ?? ""}
                      onChange={e => saveExamScore(s.id, "midterm", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-12 text-center border border-slate-200 rounded px-1 py-0.5 font-bold print:border-0"
                    />
                  </td>
                  <td className="border border-slate-200 text-center px-1 py-1">
                    <input
                      type="number" disabled={readOnly}
                      value={exam.final ?? ""}
                      onChange={e => saveExamScore(s.id, "final", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-12 text-center border border-slate-200 rounded px-1 py-0.5 font-bold print:border-0"
                    />
                  </td>
                  <td className="border border-slate-200 text-center px-1 py-1 font-black">{fmtScore(total)}</td>
                  <td className="border border-slate-200 text-center px-1 py-1 font-black">{gradeLevel(percent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* คำอธิบายตัวชี้วัดแต่ละข้อ (ตช.1, ตช.2, ...) */}
      <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-4 space-y-3 text-xs print:mt-2">
        <p className="font-black text-slate-600">คำอธิบายตัวชี้วัด</p>
        {unitsWithScore.map(u => (
          <div key={u.unit_no}>
            <p className="font-black text-slate-500">หน่วยที่ {u.unit_no} {u.unit_name}</p>
            <ul className="pl-4 list-disc space-y-0.5">
              {indicatorLinesOf(u).map((line, idx) => (
                <li key={idx} className="font-bold text-slate-500"><span className="text-slate-400">ตช.{idx + 1}:</span> {line}</li>
              ))}
            </ul>
          </div>
        ))}
        {savingExamFor && <p className="text-slate-300 font-bold print:hidden">กำลังบันทึก...</p>}
      </div>

      {/* ★ CSS สำหรับพิมพ์: บังคับแนวนอน + ซ่อนส่วนที่ไม่เกี่ยวกับรายงาน */}
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden; }
          .vp-print-report, .vp-print-report * { visibility: visible; }
          .vp-print-report { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}