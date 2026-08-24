"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
function indicatorNumberOf(line: string): string {
  const match = line.match(/^(\d+)/);
  return match ? match[1] : "-";
}
function indicatorTextOnly(line: string): string {
  return line.replace(/^\d+\s*/, "");
}
export default function Vp71Tool({
  subjectId, academicYearId, subjectTitle, subjectCode, currentUserId, readOnly, onBack,
  sectionId, students,           // ★ NEW: ต้องส่งเข้ามาจาก parent เพื่อให้ดูรายงานได้ (เหมือน AssignmentsTool)
  subjectType = "basic",         // ★ NEW: มาจากตั้งค่ารายวิชา — "basic" = วิชาพื้นฐาน (ใช้คำว่า "ตัวชี้วัด"), "additional" = วิชาเพิ่มเติม (ใช้คำว่า "ผลการเรียนรู้")
  midtermMaxScore = 0,           // ★ NEW: คะแนนเต็มกลางภาค — ดึงมาจากตั้งค่ารายวิชา ไม่ให้กรอกซ้ำที่นี่อีก
  finalMaxScore = 0,             // ★ NEW: คะแนนเต็มปลายภาค — ดึงมาจากตั้งค่ารายวิชา ไม่ให้กรอกซ้ำที่นี่อีก
  formativeMaxScore = 0,
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
  subjectType?: "basic" | "additional";  // ★ NEW
  midtermMaxScore?: number;              // ★ NEW
  finalMaxScore?: number;                // ★ NEW
  formativeMaxScore?: number;
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

  // ★ เพิ่มตรงนี้ — ยังขาดอยู่ ทำให้ indicatorLabel/indicatorAbbr/indicatorItemLabel ไม่มีนิยาม
  const [resolvedSubjectType, setResolvedSubjectType] = useState<"basic" | "additional">(subjectType);
  useEffect(() => { setResolvedSubjectType(subjectType); }, [subjectType]);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("subjects").select("subject_type").eq("id", subjectId).maybeSingle();
      if (active && data?.subject_type) setResolvedSubjectType(data.subject_type);
    })();
    return () => { active = false; };
  }, [subjectId]);

  const indicatorLabel = resolvedSubjectType === "additional" ? "ผลการเรียนรู้" : "ตัวชี้วัด";
  const indicatorAbbr = resolvedSubjectType === "additional" ? "ผช." : "ตช.";
  const indicatorItemLabel = resolvedSubjectType === "additional" ? "ผลการเรียนรู้" : "ตัวชี้วัด";

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
  async function handleUnlinkAssignment(assignmentId: string) {
  if (readOnly) return;
  if (!confirm("เอาชิ้นงานนี้ออกจากหน่วยการเรียนรู้นี้? (ชิ้นงานจะยังอยู่ในห้องเรียนเดิม แค่ไม่ถูกนับคะแนนในหน่วยนี้อีก)")) return;
  try {
    const { error } = await supabase
      .from("assignments")
      .update({ teaching_unit_no: null, selected_indicator_lines: null })
      .eq("id", assignmentId);
    if (error) throw error;
    loadUnitScores();
  } catch (e: any) {
    alert("เอาออกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
  }
}

async function handleDeleteLinkedAssignment(assignmentId: string, title: string) {
  if (readOnly) return;
  if (!confirm(`ลบชิ้นงาน "${title}" ถาวร?\nข้อมูลการส่งงาน/คะแนนของนักเรียนที่ผูกกับชิ้นนี้ทั้งหมดจะถูกลบไปด้วย และย้อนกลับไม่ได้`)) return;
  try {
    await supabase.from("assignment_submissions").delete().eq("assignment_id", assignmentId);
    await supabase.from("assignment_students").delete().eq("assignment_id", assignmentId);
    await supabase.from("assignment_attachments").delete().eq("assignment_id", assignmentId);
    await supabase.from("assignment_cross_sections").delete().eq("source_assignment_id", assignmentId);
    await supabase.from("assignments").delete().eq("id", assignmentId);
    loadUnitScores();
  } catch (e: any) {
    alert("ลบไม่สำเร็จ: " + (e?.message ?? "unknown error"));
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
          indicatorLabel={indicatorLabel}
          indicatorItemLabel={indicatorItemLabel}
  onUnlinkAssignment={handleUnlinkAssignment}        // ★ เพิ่ม
  onDeleteAssignment={handleDeleteLinkedAssignment}
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
          indicatorLabel={indicatorLabel}
          indicatorAbbr={indicatorAbbr}
          indicatorItemLabel={indicatorItemLabel} 
          midtermMaxScore={midtermMaxScore}
          finalMaxScore={finalMaxScore}
          formativeMaxScore={formativeMaxScore}
          
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
  readOnly, updateUnit, removeUnit, addUnit, totalHours, totalScore, indicatorLabel, indicatorItemLabel,
  onUnlinkAssignment, onDeleteAssignment,
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
  indicatorLabel: string;   
  indicatorItemLabel: string;
  onUnlinkAssignment: (assignmentId: string) => void;         
  onDeleteAssignment: (assignmentId: string, title: string) => void; 
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
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[280px]">
  {indicatorItemLabel} (พิมพ์ 1 บรรทัดต่อ 1 ข้อ)
</th>
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
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-slate-400 font-bold">
                เต็ม {fmtScore(a.max_score)} → <span className="text-emerald-600 font-black">{fmtScore(a.computed_weight)} คะแนนจริง</span>
              </span>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => onUnlinkAssignment(a.id)}
                    title="เอาออกจากหน่วยนี้ (ชิ้นงานยังอยู่ในห้องเรียนเดิม)"
                    className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 font-black text-[10px]"
                  >
                    🔗 เอาออก
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAssignment(a.id, a.title)}
                    title="ลบชิ้นงานนี้ถาวร"
                    className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[10px]"
                  >
                    🗑️ ลบถาวร
                  </button>
                </>
              )}
            </div>
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
   จัดกลุ่มคอลัมน์ตามหน่วยการเรียนรู้ → คอลัมน์ย่อยตามตัวชี้วัด/ผลการเรียนรู้ + คอลัมน์ "สรุป" ของหน่วย
   ตามด้วย รวมคะแนนเก็บ / กลางภาค / ปลายภาค / รวม / ระดับผลการเรียน
   ★ คะแนนเต็มกลางภาค/ปลายภาค ไม่ให้กรอกเองในหน้านี้อีกต่อไป — ดึงมาจาก "ตั้งค่ารายวิชา" โดยตรง
   เพื่อให้ตรงกับหน้า "คะแนนรวม" (GradeOverviewTool) เสมอ
   ========================================================================= */

function ReportView({
  subjectId, subjectCode, subjectTitle, academicYearId, currentUserId,
  sectionId, students, units, readOnly, indicatorLabel, indicatorAbbr, indicatorItemLabel,
  midtermMaxScore, finalMaxScore, formativeMaxScore,
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
  indicatorLabel: string;
  indicatorAbbr: string;
  indicatorItemLabel: string;   // ★ เพิ่ม — แก้ error "Cannot find name 'indicatorItemLabel'"
  midtermMaxScore: number;
  finalMaxScore: number;
  formativeMaxScore: number;
}) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [examScores, setExamScores] = useState<Record<string, { midterm: number | null; final: number | null }>>({});
  // ★ ลบ: resolvedSubjectType/setResolvedSubjectType ของ ReportView เอง — ย้ายไปอยู่ที่ Vp71Tool
  // (ตัวหลัก) แล้วส่ง indicatorLabel/indicatorAbbr/indicatorItemLabel ที่คำนวณเสร็จแล้วลงมาเป็น prop แทน
  const midtermMax = midtermMaxScore;
  const finalMax = finalMaxScore;

  const unitsWithScore = useMemo(() => units.filter(u => u.unit_no && u.score_points), [units]);

  // ★ แหล่งข้อมูลคะแนนสอบเดียว — ใช้ /api/subject-grades/summary (schema: student_id, exam_type, score)
  // ให้ตรงกับที่ GradeOverviewTool ใช้จริง (ก่อนหน้านี้มี query ตรงจาก subject_exam_scores
  // ด้วย schema คนละแบบ (midterm, final เป็นคอลัมน์) ซึ่งขัดกันเองและทำให้ตัวเลขผิดแบบเงียบๆ — ลบทิ้งแล้ว)
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
        // ★ ลบ query subject_exam_scores(student_id, midterm, final) ที่นี่ออกทั้งหมด
        // (schema ผิด + แย่งเขียนทับ examScores ที่ useEffect ด้านบนดึงมาถูกต้องแล้ว)
      } catch {
        setAssignments([]);
        setSubmissions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId]);

  // ★ น้ำหนักคะแนนต่อชิ้นงาน: score_points ของหน่วย × (max_score ของชิ้นงานนี้ / รวม max_score ทุกชิ้นในหน่วย)
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

  // ★ ผ่าน/ไม่ผ่านตัวชี้วัด/ผลการเรียนรู้: ผ่านถ้ามีชิ้นงานที่ผูกข้อนี้ ที่ นร. ได้คะแนน ≥ 50%
  function indicatorLineScore(
  unit: Unit,
  line: string,
  studentId: string,
  assignments: ReportAssignment[],
  submissions: ReportSubmission[]
): { achieved: number; lineShare: number; state: "none" | "pending" | "pass" | "fail" } {
  const totalLines = indicatorLinesOf(unit).length;
  const lineShare = totalLines > 0 ? (Number(unit.score_points) || 0) / totalLines : 0;

  const related = assignments.filter(
    a => a.teaching_unit_no === unit.unit_no && (a.selected_indicator_lines ?? []).includes(line)
  );
  if (related.length === 0) return { achieved: 0, lineShare, state: "none" };

  const totalMax = related.reduce((s, a) => s + (a.max_score || 0), 0);

  let sumScore = 0, sumMax = 0, anyGraded = false, achieved = 0;
  related.forEach(a => {
    sumMax += a.max_score || 0;
    const sub = submissions.find(s => s.assignment_id === a.id && s.student_id === studentId);
    const score = sub?.score ?? null;
    if (score != null) {
      sumScore += score;
      anyGraded = true;
      const weightOfThisAssignment = totalMax > 0 ? (a.max_score / totalMax) * lineShare : 0;
      achieved += a.max_score > 0 ? (score / a.max_score) * weightOfThisAssignment : 0;
    }
  });

  if (!anyGraded) return { achieved: 0, lineShare, state: "pending" };
  const passed = sumMax > 0 && sumScore / sumMax >= 0.5;
  return { achieved, lineShare, state: passed ? "pass" : "fail" };
}

  const sumUnitScorePoints = unitsWithScore.reduce((s, u) => s + (Number(u.score_points) || 0), 0);
  const formativeScale = sumUnitScorePoints > 0 ? formativeMaxScore / sumUnitScorePoints : 0;
  function unitAchievedScore(unit: Unit, studentId: string): number {
  const lines = indicatorLinesOf(unit);
  if (lines.length === 0) return 0;
  return lines.reduce((sum, line) => {
    const info = indicatorLineScore(unit, line, studentId, assignments, submissions);
    return sum + info.achieved;
  }, 0);
}
  const totalPossible = formativeMaxScore + midtermMax + finalMax;

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
      <div className="flex items-center gap-3 flex-wrap mb-3 print:hidden">
        <span className="text-[11px] text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
          น้ำหนักคะแนนเก็บ : คะแนนสอบ = {sumUnitScorePoints} : {midtermMax + finalMax} (กลางภาค {midtermMax} + ปลายภาค {finalMax}) ·
          คะแนนเต็มรวมทั้งวิชา = {totalPossible} คะแนน
          <span className="ml-1 text-slate-300">— แก้ไขคะแนนกลางภาค/ปลายภาคได้ที่หน้า "คะแนนรวม" เท่านั้น เพื่อให้ตัวเลขตรงกันเสมอ</span>
        </span>
      </div>

      <div className="hidden print:block text-center mb-2 leading-tight">
        <p className="font-black text-[13px]">แบบบันทึกคะแนนการวัดและประเมินผลระหว่างเรียนและปลายภาค</p>
        <p className="text-[11px] font-bold">
          รหัสวิชา {subjectCode} &nbsp; รายวิชา {subjectTitle}
        </p>
        <p className="text-[11px] font-bold">
          คะแนนเก็บระหว่างเรียน {sumUnitScorePoints} คะแนน &nbsp; คะแนนสอบ (กลางภาค {midtermMax} + ปลายภาค {finalMax}) {midtermMax + finalMax} คะแนน &nbsp;
          น้ำหนักคะแนนรวม {sumUnitScorePoints} : {midtermMax + finalMax} = {totalPossible} คะแนน
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-auto vp-print-report">
        <table className="w-full border-collapse text-[10px] vp-report-table">
          <thead className="bg-gradient-to-r from-indigo-50 to-fuchsia-50 print:bg-white">
            <tr>
              <th rowSpan={2} className="border border-slate-300 px-1 py-2 font-black w-8">ที่</th>
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black min-w-[140px] text-left">ชื่อ-นามสกุล</th>
              {unitsWithScore.map(u => (
                <th key={u.unit_no} colSpan={indicatorLinesOf(u).length + 1} className="border border-slate-300 px-1 py-1 font-black">
                  หน่วยที่ {u.unit_no}{u.unit_name ? ` · ${u.unit_name}` : ""}
                  <br />
                  <span className="font-bold text-slate-500">({fmtScore(u.score_points ?? 0)} คะแนน)</span>
                </th>
              ))}
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black w-16">รวมคะแนนเก็บ<br />({sumUnitScorePoints})</th>
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black w-14">กลางภาค<br />({midtermMax})</th>
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black w-14">ปลายภาค<br />({finalMax})</th>
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black w-16">รวม<br />({totalPossible})</th>
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black w-14">ระดับ<br />ผลการเรียน</th>
            </tr>
            <tr>
              {unitsWithScore.map(u => (
                <Fragment key={u.unit_no}>
                  {indicatorLinesOf(u).map((line, idx) => (
  <th key={`${u.unit_no}-i${idx}`} className="border border-slate-300 px-1 py-1 font-bold w-7" title={line}>
    {indicatorNumberOf(line)}
  </th>
))}
                  <th className="border border-slate-300 px-1 py-1 font-black w-12 bg-fuchsia-50 print:bg-slate-100">สรุป</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map(s => {
              const exam = examScores[s.id] ?? { midterm: null, final: null };
              const unitTotals = unitsWithScore.map(u => unitAchievedScore(u, s.id));
              const sumUnits = unitTotals.reduce((a, b) => a + b, 0);
              const total = sumUnits + (exam.midterm ?? 0) + (exam.final ?? 0);
              const percent = totalPossible > 0 ? (total / totalPossible) * 100 : 0;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="border border-slate-300 text-center px-1 py-1 font-bold">{s.seat_number}</td>
                  <td className="border border-slate-300 px-2 py-1 font-bold whitespace-nowrap">
                    {s.prefix ?? ""}{s.first_name} {s.last_name}
                  </td>
                  {unitsWithScore.map((u, ui) => (
                    <Fragment key={u.unit_no}>
                      {indicatorLinesOf(u).map((line, idx) => {
  const info = indicatorLineScore(u, line, s.id, assignments, submissions);
  return (
    <td
      key={`${u.unit_no}-${s.id}-i${idx}`}
      className={`border border-slate-300 text-center px-1 py-1 font-black ${
        info.state === "pass" ? "text-emerald-600" : info.state === "fail" ? "text-rose-500" : "text-slate-300"
      }`}
    >
      {info.state === "none" ? "–" : info.state === "pending" ? "–" : fmtScore(info.achieved)}
    </td>
  );
})}
                      <td className="border border-slate-300 text-center px-1 py-1 font-black bg-fuchsia-50/40 print:bg-white">
                        {fmtScore(unitTotals[ui])}
                      </td>
                    </Fragment>
                  ))}
                  <td className="border border-slate-300 text-center px-1 py-1 font-black">{sumUnitScorePoints ? fmtScore(sumUnits) : "-"}</td>
                  {/* ★ เดิมมี 3 <td> ตรงนี้ (midterm, final, แล้วซ้ำ input กรอก final อีกรอบ) ทำให้จำนวนคอลัมน์
                      ไม่ตรงกับ header ที่มีแค่ 2 ช่อง (กลางภาค/ปลายภาค) — ลบ input ออก เหลือแค่ 2 ช่องแสดงผลอย่างเดียว
                      ตรงตาม comment ด้านบนที่บอกว่าห้ามแก้ไขคะแนนสอบจากหน้านี้ */}
                  <td className="border border-slate-300 text-center px-1 py-1 font-black">{exam.midterm ?? "-"}</td>
                  <td className="border border-slate-300 text-center px-1 py-1 font-black">{exam.final ?? "-"}</td>
                  <td className="border border-slate-300 text-center px-1 py-1 font-black">{fmtScore(total)}</td>
                  <td className="border border-slate-300 text-center px-1 py-1 font-black">{gradeLevel(percent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-4 space-y-3 text-xs print:mt-2 print:border-0 print:p-0 vp-print-legend">
        <p className="font-black text-slate-600">คำอธิบาย{indicatorLabel}</p>
        {unitsWithScore.map(u => (
          <div key={u.unit_no}>
            <p className="font-black text-slate-500">หน่วยที่ {u.unit_no} {u.unit_name}</p>
            <ul className="pl-4 list-disc space-y-0.5">
  {indicatorLinesOf(u).map((line, idx) => (
    <li key={idx} className="font-bold text-slate-500">
      <span className="text-slate-400">{indicatorLabel} ข้อที่ {indicatorNumberOf(line)}:</span> {indicatorTextOnly(line)}
    </li>
  ))}
</ul>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden; }
          .vp-print-report, .vp-print-report *,
          .vp-print-legend, .vp-print-legend * { visibility: visible; }
          .vp-print-report {
            position: absolute; left: 0; top: 0; width: 100%;
            border: none; border-radius: 0; overflow: visible;
          }
          .vp-print-legend { position: relative; }
          .vp-report-table { font-size: 9px; }
          .vp-report-table th, .vp-report-table td {
            border: 1px solid #000 !important;
            color: #000 !important;
            background: #fff !important;
            padding: 2px 3px !important;
          }
          .vp-report-table thead { display: table-header-group; }
          .vp-report-table tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}