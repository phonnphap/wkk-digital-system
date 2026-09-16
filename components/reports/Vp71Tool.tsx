"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   Types
   ========================================================================= */

type Unit = {
  _key: string;               // ★★★ NEW — id ฝั่ง client เท่านั้น ใช้ผูก state/DOM ไม่ส่งขึ้น backend
  unit_no: number;
  unit_name: string;
  indicators: string;
  learning_hours: number | null;
  score_points: number | null;
  note: string | null;
};

// ★★★ NEW — หน่วยที่ merge มาแสดงรวมกันในตาราง (อาจมาจากวิชาตัวเอง หรือวิชาอื่นในกลุ่มคะแนน)
type CombinedUnit = Unit & {
  source_subject_id: string;
  source_subject_code: string;
  source_subject_name: string;
  editable: boolean; // true = วิชาตัวเอง แก้ไขได้ / false = วิชาอื่นในกลุ่ม แสดงอย่างเดียว
};

// ★★★ NEW — รายการตัวชี้วัด/ผลการเรียนรู้ในคลังหลักสูตรของวิชา (ต้องเช็คชื่อคอลัมน์จริงกับ schema)
type IndicatorBankItem = { id: string; code: string; description: string; unit_id: string };

// ★ ข้อมูลชิ้นงานที่ผูกหน่วยนี้ + น้ำหนักคะแนนที่คำนวณอัตโนมัติ
type UnitLinkedAssignment = {
  id: string;
  title: string;
  max_score: number;
  computed_weight: number;
  instance_ids: string[];
  section_count: number;
};
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

function makeKey(): string {
  // ★★★ NEW — เผื่อ browser เก่าที่ไม่มี crypto.randomUUID
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyUnit(no: number): Unit {
  return { _key: makeKey(), unit_no: no, unit_name: "", indicators: "", learning_hours: null, score_points: null, note: "" };
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

function indicatorLinesOf(u: { indicators: string }): string[] {
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
  sectionId, students,
  subjectType = "basic",
  midtermMaxScore = 0,
  finalMaxScore = 0,
  formativeMaxScore = 0,
}: {
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  currentUserId?: string;
  readOnly?: boolean;
  onBack: () => void;
  sectionId?: string;
  students?: Student[];
  subjectType?: "basic" | "additional";
  midtermMaxScore?: number;
  finalMaxScore?: number;
  formativeMaxScore?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);

  const [unitScores, setUnitScores] = useState<Record<number, UnitScoreInfo>>({});
  const [loadingUnitScores, setLoadingUnitScores] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);

  const [view, setView] = useState<"edit" | "report">("edit");

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

  // ★★★ NEW — คลังตัวชี้วัดของวิชานี้ (สำหรับปุ่ม "เลือกจากคลัง")
  // หมายเหตุ: ชื่อคอลัมน์ code/description เป็นการสมมติ — เช็ค schema จริงของ learning_indicators ก่อนใช้งาน
  const [indicatorBank, setIndicatorBank] = useState<IndicatorBankItem[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
  .from("learning_indicators")
  .select("id, indicator_code, indicator_text, unit_id")
  .eq("subject_id", subjectId)
  .order("order_index");
if (active) setIndicatorBank(
  (data ?? []).map((d: any) => ({ id: d.id, code: d.indicator_code ?? "", description: d.indicator_text, unit_id: d.unit_id }))
);
      } catch {
        if (active) setIndicatorBank([]);
      }
    })();
    return () => { active = false; };
  }, [subjectId]);

  // ★★★ NEW — วิชาอื่นที่รวมกลุ่มคะแนนเดียวกัน + หน่วยการเรียนรู้ของวิชาเหล่านั้น (อ่านอย่างเดียว)
  const [groupMembers, setGroupMembers] = useState<{ id: string; subject_code: string; name_th: string }[]>([]);
  const [otherGroupUnits, setOtherGroupUnits] = useState<CombinedUnit[]>([]);
  const [loadingGroupUnits, setLoadingGroupUnits] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingGroupUnits(true);
      try {
        const { data: self } = await supabase
          .from("subjects").select("score_group_code").eq("id", subjectId).maybeSingle();
        const code = self?.score_group_code;
        if (!code) {
          if (active) { setGroupMembers([]); setOtherGroupUnits([]); }
          return;
        }
        const { data: members } = await supabase
          .from("subjects").select("id, subject_code, name_th")
          .eq("score_group_code", code).neq("id", subjectId);
        if (!active) return;
        setGroupMembers(members ?? []);
        if (!members || members.length === 0) { setOtherGroupUnits([]); return; }

        const results = await Promise.all(members.map(async (m) => {
          const qs = new URLSearchParams({ subject_id: m.id, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
          const res = await fetch(`/api/subject-teaching-units?${qs.toString()}`);
          const json = await res.json();
          return ((json.units ?? []) as any[]).map((u): CombinedUnit => ({
            _key: `other-${m.id}-${u.unit_no}`,
            unit_no: u.unit_no,
            unit_name: u.unit_name,
            indicators: u.indicators,
            learning_hours: u.learning_hours,
            score_points: u.score_points,
            note: u.note,
            source_subject_id: m.id,
            source_subject_code: m.subject_code,
            source_subject_name: m.name_th,
            editable: false,
          }));
        }));
        if (active) setOtherGroupUnits(results.flat());
      } catch {
        if (active) { setGroupMembers([]); setOtherGroupUnits([]); }
      } finally {
        if (active) setLoadingGroupUnits(false);
      }
    })();
    return () => { active = false; };
  }, [subjectId, academicYearId]);

  // ★★★ NEW — รวมหน่วยของตัวเอง + วิชาอื่นในกลุ่ม เรียงตามเลขที่หน่วยจากน้อยไปมาก
  const combinedUnits: CombinedUnit[] = useMemo(() => {
    const own: CombinedUnit[] = units.map(u => ({
      ...u,
      source_subject_id: subjectId,
      source_subject_code: subjectCode,
      source_subject_name: subjectTitle,
      editable: true,
    }));
    return [...own, ...otherGroupUnits].sort(
      (a, b) => a.unit_no - b.unit_no || a.source_subject_code.localeCompare(b.source_subject_code)
    );
  }, [units, otherGroupUnits, subjectId, subjectCode, subjectTitle]);

  // ★★★ NEW — เช็คเลขหน่วยซ้ำ (ภายในวิชาตัวเอง / ข้ามวิชาในกลุ่ม)
  const ownDuplicateNos = useMemo(() => {
    const counts: Record<number, number> = {};
    units.forEach(u => { counts[u.unit_no] = (counts[u.unit_no] || 0) + 1; });
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => Number(k)));
  }, [units]);

  const crossGroupDuplicateNos = useMemo(() => {
    const counts: Record<number, number> = {};
    combinedUnits.forEach(u => { counts[u.unit_no] = (counts[u.unit_no] || 0) + 1; });
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => Number(k)));
  }, [combinedUnits]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ subject_id: subjectId, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
        const res = await fetch(`/api/subject-teaching-units?${qs.toString()}`);
        const json = await res.json();
        const rows: Unit[] = (json.units ?? []).map((u: any) => ({
          _key: makeKey(),
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

  async function loadUnitScores() {
    setLoadingUnitScores(true);
    try {
      const qs = new URLSearchParams({ subject_id: subjectId, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
      const res = await fetch(`/api/subject-teaching-units/unit-scores?${qs.toString()}`);
      const json = await res.json();
      if (res.ok) setUnitScores(json.unitScores ?? {});
    } catch {
      // ไม่ critical
    } finally {
      setLoadingUnitScores(false);
    }
  }

  async function handleUnlinkAssignment(assignmentIds: string[]) {
    if (readOnly) return;
    const label = assignmentIds.length > 1 ? `${assignmentIds.length} ห้อง` : "ห้องนี้";
    if (!confirm(`เอาชิ้นงานนี้ออกจากหน่วยการเรียนรู้นี้ (${label})? (ชิ้นงานจะยังอยู่ในห้องเรียนเดิม แค่ไม่ถูกนับคะแนนในหน่วยนี้อีก)`)) return;
    try {
      const { error } = await supabase
        .from("assignments")
        .update({ teaching_unit_no: null, selected_indicator_lines: null })
        .in("id", assignmentIds);
      if (error) throw error;
      loadUnitScores();
    } catch (e: any) {
      alert("เอาออกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  async function handleDeleteLinkedAssignment(assignmentIds: string[], title: string) {
    if (readOnly) return;
    const label = assignmentIds.length > 1 ? ` (ทั้งหมด ${assignmentIds.length} ห้องที่ใช้ชื่อนี้)` : "";
    if (!confirm(`ลบชิ้นงาน "${title}" ถาวร${label}?\nข้อมูลการส่งงาน/คะแนนของนักเรียนที่ผูกกับชิ้นนี้ทั้งหมดจะถูกลบไปด้วย และย้อนกลับไม่ได้`)) return;
    try {
      await supabase.from("assignment_submissions").delete().in("assignment_id", assignmentIds);
      await supabase.from("assignment_students").delete().in("assignment_id", assignmentIds);
      await supabase.from("assignment_attachments").delete().in("assignment_id", assignmentIds);
      await supabase.from("assignment_cross_sections").delete().in("source_assignment_id", assignmentIds);
      await supabase.from("assignments").delete().in("id", assignmentIds);
      loadUnitScores();
    } catch (e: any) {
      alert("ลบไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  useEffect(() => {
    if (!subjectId) return;
    if (view !== "edit") return;
    loadUnitScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, academicYearId, view]);

  // ★★★ CHANGED — updateUnit/removeUnit ทำงานผ่าน _key แทน index ของแถว (เพราะตอนนี้เรียงตามเลขหน่วย ไม่ใช่ลำดับ array)
  function updateUnit(key: string, field: keyof Unit, value: any) {
    setUnits(prev => prev.map(u => (u._key === key ? { ...u, [field]: value } : u)));
  }
  function addUnit() {
    setUnits(prev => {
      const nextNo = prev.length > 0 ? Math.max(...prev.map(u => u.unit_no)) + 1 : 1;
      return [...prev, emptyUnit(Math.min(20, nextNo))];
    });
  }
  function removeUnit(key: string) {
    // ★★★ CHANGED — ไม่ renumber หน่วยที่เหลืออัตโนมัติอีกต่อไป เพราะเลขหน่วยตอนนี้ครูเลือกเองมีความหมาย
    setUnits(prev => prev.filter(u => u._key !== key));
  }

  const totalHours = units.reduce((s, u) => s + (Number(u.learning_hours) || 0), 0);
  const totalScore = units.reduce((s, u) => s + (Number(u.score_points) || 0), 0);

  async function handleSave() {
    if (readOnly) return;
    if (ownDuplicateNos.size > 0) {
      alert("มีเลขที่หน่วยซ้ำกันในวิชานี้ กรุณาแก้ให้แต่ละหน่วยมีเลขไม่ซ้ำกันก่อนบันทึก");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/subject-teaching-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId,
          academic_year_id: academicYearId ?? null,
          rows: units.map(({ _key, ...rest }) => rest), // ★★★ CHANGED — ตัด _key (client-only) ก่อนส่งขึ้น backend
          updated_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setSavedAt(Date.now());
      loadUnitScores();
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  }

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
          <button onClick={onBack} className="text-m font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          <h2 className="font-black text-slate-800 text-xl">วผ.7.1 แผนการวัดและประเมินผล</h2>
          <p className="text-slate-400 text-m font-bold">
            {subjectCode} · {subjectTitle} · ข้อมูลนี้ใช้ร่วมกันทุกห้อง/ทุกครูที่สอนวิชานี้
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
            <button
              onClick={() => setView("edit")}
              className={`px-3 py-2 rounded-lg text-m font-black transition-colors ${view === "edit" ? "bg-fuchsia-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              📝 แก้ไขแผน
            </button>
            <button
              onClick={() => setView("report")}
              className={`px-3 py-2 rounded-lg text-m font-black transition-colors ${view === "report" ? "bg-fuchsia-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              📊 รายงานคะแนน นร.
            </button>
          </div>
          {view === "edit" && (
            <button
              onClick={loadUnitScores}
              disabled={loadingUnitScores}
              title="ดึงข้อมูลชิ้นงานที่ผูกล่าสุด"
              className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-base disabled:opacity-50"
            >
              {loadingUnitScores ? "⏳" : "🔄"} รีเฟรช
            </button>
          )}
          <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-base">
            🖨️ พิมพ์
          </button>
          {!readOnly && view === "edit" && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-base">
              {saving ? "กำลังบันทึก..." : "💾 บันทึกทั้งหมด"}
            </button>
          )}
        </div>
      </div>
      {savedAt && !saving && view === "edit" && (
        <p className="text-m font-black text-emerald-500 print:hidden">✅ บันทึกแล้ว</p>
      )}

      {view === "edit" ? (
        <EditPlanView
          loading={loading}
          combinedUnits={combinedUnits}
          groupMembers={groupMembers}
          loadingGroupUnits={loadingGroupUnits}
          indicatorBank={indicatorBank}
          ownDuplicateNos={ownDuplicateNos}
          crossGroupDuplicateNos={crossGroupDuplicateNos}
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
          indicatorItemLabel={indicatorItemLabel}
          onUnlinkAssignment={handleUnlinkAssignment}
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
   ★★★ NEW — ป๊อปอัพเลือกตัวชี้วัด/ผลการเรียนรู้จากคลังหลักสูตร
   ========================================================================= */

function IndicatorPickerModal({
  bank, currentText, onClose, onApply,
}: {
  bank: IndicatorBankItem[];
  currentText: string;
  onClose: () => void;
  onApply: (newText: string) => void;
}) {
  const existingLines = useMemo(
    () => currentText.split("\n").map(s => s.trim()).filter(Boolean),
    [currentText]
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(bank.filter(b => existingLines.some(l => l.startsWith(b.code))).map(b => b.id))
  );
  const [q, setQ] = useState("");
  const filtered = bank.filter(b => (b.code + " " + b.description).toLowerCase().includes(q.toLowerCase()));

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function apply() {
    const chosen = bank.filter(b => selected.has(b.id));
    const text = chosen.map(b => `${b.code} ${b.description}`).join("\n");
    onApply(text);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-black text-slate-800 text-base mb-2">📚 เลือกตัวชี้วัด/ผลการเรียนรู้จากคลังหลักสูตร</h3>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหา..."
            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-m font-bold"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {bank.length === 0 && (
            <p className="text-center text-slate-300 font-bold py-8">ยังไม่มีตัวชี้วัดในคลังของวิชานี้</p>
          )}
          {filtered.map(b => (
            <label
              key={b.id}
              className={`flex items-start gap-2 rounded-lg border-2 px-3 py-2 cursor-pointer ${
                selected.has(b.id) ? "border-fuchsia-300 bg-fuchsia-50/50" : "border-slate-100"
              }`}
            >
              <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="mt-1 accent-fuchsia-500" />
              <span className="text-m font-bold text-slate-600"><b>{b.code}</b> {b.description}</span>
            </label>
          ))}
        </div>
        <div className="p-3 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border-2 border-slate-200 text-slate-500 font-black">ยกเลิก</button>
          <button onClick={apply} className="flex-1 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-black">
            ใช้ตัวชี้วัดที่เลือก ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   หน้าแก้ไขแผน — ★★★ CHANGED ทั้งหมด: รองรับเลือกเลขหน่วยเอง + คลังตัวชี้วัด + รวมกลุ่มวิชา
   ========================================================================= */
function EditPlanView({
  loading, combinedUnits, groupMembers, loadingGroupUnits, indicatorBank,
  ownDuplicateNos, crossGroupDuplicateNos,
  unitScores, loadingUnitScores, expandedUnit, setExpandedUnit,
  readOnly, updateUnit, removeUnit, addUnit, totalHours, totalScore, indicatorItemLabel,
  onUnlinkAssignment, onDeleteAssignment,
}: {
  loading: boolean;
  combinedUnits: CombinedUnit[];
  groupMembers: { id: string; subject_code: string; name_th: string }[];
  loadingGroupUnits: boolean;
  indicatorBank: IndicatorBankItem[];
  ownDuplicateNos: Set<number>;
  crossGroupDuplicateNos: Set<number>;
  unitScores: Record<number, UnitScoreInfo>;
  loadingUnitScores: boolean;
  expandedUnit: number | null;
  setExpandedUnit: (n: number | null) => void;
  readOnly?: boolean;
  updateUnit: (key: string, field: keyof Unit, value: any) => void;
  removeUnit: (key: string) => void;
  addUnit: () => void;
  totalHours: number;
  totalScore: number;
  indicatorItemLabel: string;
  onUnlinkAssignment: (assignmentIds: string[]) => void;
  onDeleteAssignment: (assignmentIds: string[], title: string) => void;
}) {
  const [pickerForKey, setPickerForKey] = useState<string | null>(null);
  const pickerUnit = combinedUnits.find(u => u._key === pickerForKey) ?? null;

  if (loading) {
    return <div className="text-center py-16 text-slate-300 font-bold text-base">กำลังโหลด...</div>;
  }

  return (
    <>
      {/* ★★★ NEW — แบนเนอร์บอกว่าวิชานี้รวมกลุ่มคะแนนกับใคร */}
      {groupMembers.length > 0 && (
        <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-m font-bold text-indigo-700">
          🔗 วิชานี้รวมกลุ่มคะแนนกับ: {groupMembers.map(m => `${m.subject_code} ${m.name_th}`).join(", ")}
          {loadingGroupUnits && " (กำลังโหลดหน่วยของวิชาอื่น...)"}
          <br />
          ตารางด้านล่างรวมหน่วยการเรียนรู้จากทุกวิชาในกลุ่ม เรียงตามเลขที่หน่วยจากน้อยไปมาก
          แถวสีเทาคือหน่วยของวิชาอื่น (แก้ไขได้ที่หน้าวิชานั้นเท่านั้น)
          {crossGroupDuplicateNos.size > 0 && (
            <span className="block mt-1 text-amber-600">
              ⚠️ พบเลขที่หน่วยซ้ำกันข้ามวิชาในกลุ่ม (หน่วย {[...crossGroupDuplicateNos].sort((a, b) => a - b).join(", ")})
              — แนะนำให้ครูทั้งสองวิชาตกลงกันไม่ให้เลขชนกัน
            </span>
          )}
        </div>
      )}

      {ownDuplicateNos.size > 0 && (
        <p className="text-m font-black text-rose-500 bg-rose-50 rounded-lg px-3 py-2">
          ⚠️ มีเลขที่หน่วยซ้ำกันในวิชานี้ (หน่วย {[...ownDuplicateNos].sort((a, b) => a - b).join(", ")}) กรุณาแก้ก่อนบันทึก
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-auto">
        <table className="w-full min-w-[1000px] border-collapse text-m">
          <thead className="bg-gradient-to-r from-indigo-50 to-fuchsia-50">
            <tr>
              <th className="px-2 py-3 font-black text-slate-600 w-16">หน่วยที่</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[180px]">ชื่อหน่วยการเรียนรู้</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[280px]">
                {indicatorItemLabel} (พิมพ์ 1 บรรทัดต่อ 1 ข้อ หรือเลือกจากคลัง)
              </th>
              <th className="px-2 py-3 font-black text-slate-600 w-24">จำนวนชั่วโมง</th>
              <th className="px-2 py-3 font-black text-slate-600 w-24">คะแนนเก็บ</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[140px]">หมายเหตุ</th>
              <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[200px]">ชิ้นงานที่ผูกหน่วยนี้</th>
              <th className="px-2 py-3 w-8 print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {combinedUnits.map((u) => {
              const info = u.editable ? unitScores[u.unit_no] : undefined;
              const linkedCount = info?.assignments.length ?? 0;
              const isExpanded = expandedUnit === u.unit_no && u.editable;
              return (
                <Fragment key={u._key}>
                  <tr className={`border-t border-slate-100 align-top ${!u.editable ? "bg-slate-50/70" : ""}`}>
                    <td className="text-center px-2 py-2">
                      {u.editable ? (
                        <select
                          value={u.unit_no}
                          disabled={readOnly}
                          onChange={e => updateUnit(u._key, "unit_no", Number(e.target.value))}
                          className={`w-16 text-center border-2 rounded-lg px-1 py-1.5 font-black disabled:bg-slate-50 ${
                            ownDuplicateNos.has(u.unit_no) ? "border-rose-400 bg-rose-50 text-rose-600" : "border-slate-200"
                          }`}
                        >
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-black text-slate-400">{u.unit_no}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {u.editable ? (
                        <input
                          value={u.unit_name} disabled={readOnly}
                          onChange={e => updateUnit(u._key, "unit_name", e.target.value)}
                          placeholder="เช่น หน่วยที่ 1 ระบบคอมพิวเตอร์"
                          className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                        />
                      ) : (
                        <div>
                          <p className="font-bold text-slate-500">{u.unit_name || "-"}</p>
                          <p className="text-[12px] font-black text-indigo-500 mt-0.5">
                            🔗 {u.source_subject_code} {u.source_subject_name}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {u.editable ? (
                        <>
                          <textarea
                            value={u.indicators} disabled={readOnly} rows={3}
                            onChange={e => updateUnit(u._key, "indicators", e.target.value)}
                            placeholder={"ว 4.2 ป.1/1 ...\nว 4.2 ป.1/2 ..."}
                            className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold resize-y disabled:bg-slate-50"
                          />
                          {!readOnly && indicatorBank.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPickerForKey(u._key)}
                              className="mt-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-[12px]"
                            >
                              📚 เลือกจากคลังตัวชี้วัด
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-[13px] font-bold text-slate-400 whitespace-pre-line">{u.indicators || "-"}</p>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {u.editable ? (
                        <input
                          type="number" min={0} value={u.learning_hours ?? ""} disabled={readOnly}
                          onChange={e => updateUnit(u._key, "learning_hours", e.target.value === "" ? null : Number(e.target.value))}
                          className="w-full text-center border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                        />
                      ) : (
                        <span className="font-bold text-slate-400">{u.learning_hours ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {u.editable ? (
                        <input
                          type="number" min={0} value={u.score_points ?? ""} disabled={readOnly}
                          onChange={e => updateUnit(u._key, "score_points", e.target.value === "" ? null : Number(e.target.value))}
                          className="w-full text-center border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                        />
                      ) : (
                        <span className="font-bold text-slate-400">{u.score_points ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {u.editable ? (
                        <input
                          value={u.note ?? ""} disabled={readOnly}
                          onChange={e => updateUnit(u._key, "note", e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                        />
                      ) : (
                        <span className="font-bold text-slate-400">{u.note || "-"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {!u.editable ? (
                        <span className="text-[12px] text-slate-300 font-bold">ดูที่หน้าวิชานั้น</span>
                      ) : loadingUnitScores ? (
                        <span className="text-[12px] text-slate-300 font-bold">กำลังโหลด...</span>
                      ) : !u.score_points ? (
                        <span className="text-[12px] text-slate-300 font-bold">— ยังไม่ตั้งคะแนนเก็บ —</span>
                      ) : linkedCount === 0 ? (
                        <span className="inline-block px-2 py-1 rounded-full text-[12px] font-black bg-amber-50 text-amber-600">
                          ⚠️ ยังไม่มีชิ้นงานผูก
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedUnit(isExpanded ? null : u.unit_no)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-black bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        >
                          ✅ ผูกแล้ว {linkedCount} ชิ้น (รวม {fmtScore(info!.totalMaxScore)} คะแนนดิบ) {isExpanded ? "▲" : "▼"}
                        </button>
                      )}
                    </td>
                    <td className="text-center px-1 py-2 print:hidden">
                      {u.editable && !readOnly && combinedUnits.filter(x => x.editable).length > 1 && (
                        <button onClick={() => removeUnit(u._key)} className="text-red-400 hover:text-red-600 font-black">✕</button>
                      )}
                    </td>
                  </tr>

                  {isExpanded && info && (
                    <tr className="bg-emerald-50/40">
                      <td></td>
                      <td colSpan={7} className="px-4 py-3">
                        <p className="text-[18px] font-black text-emerald-700 mb-2">
                          ระบบคำนวณน้ำหนักคะแนนของแต่ละชิ้นงานอัตโนมัติ ให้รวมกันเท่ากับคะแนนเก็บที่ตั้งไว้ ({fmtScore(u.score_points ?? 0)} คะแนน) เสมอ
                        </p>
                        <div className="space-y-1">
                          {info.assignments.map((a) => (
                            <div key={a.id} className="flex items-center justify-between bg-white rounded-lg border border-emerald-100 px-3 py-1.5">
                              <span className="font-bold text-slate-600 truncate pr-2">
                                {a.title}
                                {a.section_count > 1 && (
                                  <span className="ml-1.5 text-[12px] font-black text-indigo-500">
                                    · ใช้ร่วม {a.section_count} ห้อง
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-400 font-bold">
                                  เต็ม {fmtScore(a.max_score)} → <span className="text-emerald-600 font-black">{fmtScore(a.computed_weight)} คะแนนจริง</span>
                                </span>
                                {!readOnly && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => onUnlinkAssignment(a.instance_ids)}
                                      title="เอาออกจากหน่วยนี้ (ชิ้นงานยังอยู่ในห้องเรียนเดิม)"
                                      className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 font-black text-[12px]"
                                    >
                                      🔗 เอาออก{a.section_count > 1 ? `ทุกห้อง (${a.section_count})` : ""}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteAssignment(a.instance_ids, a.title)}
                                      title="ลบชิ้นงานนี้ถาวร"
                                      className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[12px]"
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
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-black">
              <td colSpan={3} className="px-3 py-2 text-right">รวม (เฉพาะวิชานี้)</td>
              <td className="text-center px-2 py-2">{totalHours || "-"}</td>
              <td className="text-center px-2 py-2">{totalScore || "-"}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!readOnly && (
        <button onClick={addUnit} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-500 font-black text-m print:hidden">
          + เพิ่มหน่วยการเรียนรู้
        </button>
      )}

      {pickerUnit && (
        <IndicatorPickerModal
          bank={indicatorBank}
          currentText={pickerUnit.indicators}
          onClose={() => setPickerForKey(null)}
          onApply={(text) => updateUnit(pickerUnit._key, "indicators", text)}
        />
      )}
    </>
  );
}

/* =========================================================================
   ★★ NEW — หน้ารายงานคะแนน นร.ทั้งหมด (ไม่แก้ไขจากงานนี้ ยังอิงวิชาตัวเองเหมือนเดิม)
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
  indicatorItemLabel: string;
  midtermMaxScore: number;
  finalMaxScore: number;
  formativeMaxScore: number;
}) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [examScores, setExamScores] = useState<Record<string, { midterm: number | null; final: number | null }>>({});
  const midtermMax = midtermMaxScore;
  const finalMax = finalMaxScore;

  const unitsWithScore = useMemo(() => units.filter(u => u.unit_no && u.score_points), [units]);

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

  function studentScoreForAssignment(assignmentId: string, studentId: string): number | null {
    const sub = submissions.find(s => s.assignment_id === assignmentId && s.student_id === studentId);
    return sub?.score ?? null;
  }

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
        <p className="font-bold text-base">
          หน้านี้ต้องเปิดจากภายในห้องเรียนที่ต้องการดูรายงาน (ต้องส่ง <code>sectionId</code> และ <code>students</code> เข้ามาให้คอมโพเนนต์นี้)
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-16 text-slate-300 font-bold text-base">กำลังโหลดรายงาน...</div>;
  }

  const sortedStudents = [...students].sort((a, b) => a.seat_number - b.seat_number);

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-3 print:hidden">
        <span className="text-[17px] text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
          น้ำหนักคะแนนเก็บ : คะแนนสอบ = {sumUnitScorePoints} : {midtermMax + finalMax} (กลางภาค {midtermMax} + ปลายภาค {finalMax}) ·
          คะแนนเต็มรวมทั้งวิชา = {totalPossible} คะแนน
          <span className="ml-1 text-slate-300">— แก้ไขคะแนนกลางภาค/ปลายภาคได้ที่หน้า "คะแนนรวม" เท่านั้น เพื่อให้ตัวเลขตรงกันเสมอ</span>
        </span>
      </div>

      <div className="hidden print:block text-center mb-2 leading-tight">
        <p className="font-black text-[13px]">แบบบันทึกคะแนนการวัดและประเมินผลระหว่างเรียนและปลายภาค</p>
        <p className="text-[14px] font-bold">
          รหัสวิชา {subjectCode} &nbsp; รายวิชา {subjectTitle}
        </p>
        <p className="text-[14px] font-bold">
          คะแนนเก็บระหว่างเรียน {sumUnitScorePoints} คะแนน &nbsp; คะแนนสอบ (กลางภาค {midtermMax} + ปลายภาค {finalMax}) {midtermMax + finalMax} คะแนน &nbsp;
          น้ำหนักคะแนนรวม {sumUnitScorePoints} : {midtermMax + finalMax} = {totalPossible} คะแนน
        </p>
      </div>
      <div className="vp-print-area">
      <div className="bg-white rounded-2xl border border-slate-100 overflow-auto ">
        <table className="w-full border-collapse text-[18px] vp-report-table">
          <thead className="bg-gradient-to-r from-indigo-50 to-fuchsia-50 print:bg-white">
            <tr>
              <th rowSpan={2} className="border border-slate-300 px-2 py-2 font-black whitespace-nowrap">ที่</th>
<th rowSpan={2} className="border border-slate-300 px-3 py-2 font-black text-left whitespace-nowrap">ชื่อ-นามสกุล</th>
              {unitsWithScore.map(u => (
                <th key={u.unit_no} colSpan={indicatorLinesOf(u).length + 1} className="border border-slate-300 px-1 py-1 font-black">
                  หน่วยที่ {u.unit_no}{u.unit_name ? ` · ${u.unit_name}` : ""}
                  <br />
                  <span className="font-bold text-slate-500">({fmtScore(u.score_points ?? 0)} คะแนน)</span>
                </th>
              ))}
              <th rowSpan={2} className="border border-slate-300 px-3 py-2 font-black whitespace-nowrap">รวมคะแนนเก็บ<br />({sumUnitScorePoints})</th>
<th rowSpan={2} className="border border-slate-300 px-3 py-2 font-black whitespace-nowrap">กลางภาค<br />({midtermMax})</th>
<th rowSpan={2} className="border border-slate-300 px-3 py-2 font-black whitespace-nowrap">ปลายภาค<br />({finalMax})</th>
<th rowSpan={2} className="border border-slate-300 px-3 py-2 font-black whitespace-nowrap">รวม<br />({totalPossible})</th>
<th rowSpan={2} className="border border-slate-300 px-3 py-2 font-black whitespace-nowrap">ระดับ<br />ผลการเรียน</th>          </tr>
            <tr>
              {unitsWithScore.map(u => (
                <Fragment key={u.unit_no}>
                  {indicatorLinesOf(u).map((line, idx) => (
  <th key={`${u.unit_no}-i${idx}`} className="border border-slate-300 px-2 py-1 font-bold whitespace-nowrap" title={line}>
  {indicatorNumberOf(line)}
</th>
))}
                  <th className="border border-slate-300 px-2 py-1 font-black whitespace-nowrap bg-fuchsia-50 print:bg-slate-100">สรุป</th>                </Fragment>
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
                  <td className="border border-slate-300 text-center px-2 py-1.5 font-bold whitespace-nowrap">{s.seat_number}</td>
<td className="border border-slate-300 px-3 py-1.5 font-bold whitespace-nowrap">
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

      <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-4 space-y-3 text-m print:mt-2 print:border-0 print:p-0">
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
      </div>


            <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden; }
          .vp-print-area, .vp-print-area * { visibility: visible; }
          .vp-print-area {
            position: absolute; left: 0; top: 0; width: 100%;
          }
          .vp-report-table { font-size: 11px; }
.vp-report-table th, .vp-report-table td {
  border: 1px solid #000 !important;
  color: #000 !important;
  background: #fff !important;
  padding: 3px 5px !important;
}
          .vp-report-table thead { display: table-header-group; }
          .vp-report-table tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}