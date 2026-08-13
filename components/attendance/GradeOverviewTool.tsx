"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================================================================
   Types
   ========================================================================= */

type Student = {
  id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  seat_number: number;
  avatar_url?: string;
};

type Assignment = {
  id: string;
  title: string;
  max_score: number;
  weight_percent?: number;
  allow_weight?: boolean;
  status?: string;
};

type Preset = { id: string; label: string; points: number; emoji: string; sort_order: number };

type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string; // e.g. "submitted" | "graded" | "missing"
  score: number | null;
  teacher_comment?: string | null;
  graded_at?: string | null;
};

type ScoreEvent = { id: string; student_id: string; preset_id: string; points: number };

type Criterion = { id?: string; max_percent: number; min_percent: number; grade: string; sort_order?: number };

type ViewTab = "table" | "podium";

/* =========================================================================
   Component
   ========================================================================= */

export default function GradeOverviewTool({
  sectionId,
  subjectTitle,
  subjectCode,
  academicYearLabel,
  classroomLabel,
  homeroomTeacherName,
  subjectTeacherName,
  students,
  currentUserId,
}: {
  sectionId: string;
  subjectTitle: string;
  subjectCode: string;
  academicYearLabel?: string;
  classroomLabel?: string;
  homeroomTeacherName?: string;
  subjectTeacherName?: string;
  students: Student[];
  currentUserId?: string;
}) {
  const [tab, setTab] = useState<ViewTab>("table");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);
  // สรุปเช็คชื่อ: studentId -> { present, total }
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { present: number; total: number }>>({});

  const [showGradeSetting, setShowGradeSetting] = useState(false);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);
  const [hideScores, setHideScores] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [gradeRes, attRes] = await Promise.all([
        fetch(`/api/subject-grades/summary?subject_section_id=${sectionId}`),
        fetch(`/api/subject-attendance/summary?subject_section_id=${sectionId}`),
      ]);
      const json = await gradeRes.json();
      if (!gradeRes.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setAssignments(json.assignments ?? []);
      setPresets(json.presets ?? []);
      setCriteria(json.criteria ?? []);
      setSubmissions(json.submissions ?? []);
      setScoreEvents(json.scoreEvents ?? []);

      // การเช็คชื่อไม่ใช่ข้อมูลหลักของหน้านี้ ถ้าโหลดไม่สำเร็จ ไม่ต้อง block ทั้งหน้า แค่ปล่อยว่างไว้
      try {
        const attJson = await attRes.json();
        if (attRes.ok) {
          const totalDates: string[] = attJson.dates ?? [];
          const map: Record<string, { present: number; total: number }> = {};
          students.forEach(s => { map[s.id] = { present: 0, total: totalDates.length }; });
          (attJson.records ?? []).forEach((r: any) => {
            if (!map[r.student_id]) map[r.student_id] = { present: 0, total: totalDates.length };
            if (r.status === "present" || r.status === "late") map[r.student_id].present += 1;
          });
          setAttendanceMap(map);
        }
      } catch {
        // เงียบไว้ ไม่ critical
      }
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลคะแนนรวมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  /* ---------------- คำนวณคะแนนต่อคน ---------------- */

  const totalMaxScore = useMemo(
    () => assignments.reduce((sum, a) => sum + (a.max_score ?? 0), 0),
    [assignments]
  );

  const rows = useMemo(() => {
    return students.map(s => {
      const subMap: Record<string, Submission> = {};
      submissions.filter(sub => sub.student_id === s.id).forEach(sub => { subMap[sub.assignment_id] = sub; });

      const assignmentTotal = assignments.reduce((sum, a) => {
        const sub = subMap[a.id];
        return sum + (sub?.score ?? 0);
      }, 0);

      const submittedCount = assignments.filter(a => {
        const sub = subMap[a.id];
        return sub && (sub.status === "submitted" || sub.status === "graded");
      }).length;

      const presetTotals: Record<string, number> = {};
      presets.forEach(p => { presetTotals[p.id] = 0; });
      // สำคัญ: ถ้าครูลบการ์ดคะแนนพิเศษ (preset) ไปแล้ว score_events เก่าที่อ้างถึง preset_id นั้น
      // ต้องไม่ถูกนับรวมอีก ไม่งั้นคะแนนรวมจะไม่ตรงกับที่แสดงในตาราง (คอลัมน์หายแต่ยอดรวมยังบวกอยู่)
      scoreEvents
        .filter(ev => ev.student_id === s.id && presetTotals[ev.preset_id] !== undefined)
        .forEach(ev => { presetTotals[ev.preset_id] += ev.points; });
      const specialTotal = Object.values(presetTotals).reduce((a, b) => a + b, 0);

      const percentage = totalMaxScore > 0 ? (assignmentTotal / totalMaxScore) * 100 : 0;

      let grade = "-";
      const sortedCriteria = [...criteria].sort((a, b) => b.min_percent - a.min_percent);
      for (const c of sortedCriteria) {
        if (percentage >= c.min_percent && percentage <= c.max_percent) { grade = c.grade; break; }
      }

      const grandTotal = assignmentTotal + specialTotal;

      return {
        student: s,
        subMap,
        presetTotals,
        assignmentTotal,
        submittedCount,
        specialTotal,
        percentage,
        grade,
        grandTotal,
      };
    });
  }, [students, submissions, assignments, presets, scoreEvents, criteria, totalMaxScore]);

  const podiumTop5 = useMemo(() => {
    return [...rows].sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 5);
  }, [rows]);

  /* ---------------- แก้ไขคะแนนพิเศษแบบ inline ในตาราง ---------------- */

  async function handleAdjustPreset(studentId: string, presetId: string, currentValue: number, newValue: number) {
    const delta = newValue - currentValue;
    if (delta === 0) return;
    try {
      const res = await fetch("/api/score-events/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_section_id: sectionId,
          student_id: studentId,
          preset_id: presetId,
          delta,
          created_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แก้ไขคะแนนไม่สำเร็จ");
      // อัปเดตแบบ optimistic โดยเติม event ใหม่ในหน่วยความจำ ไม่ต้องรอโหลดใหม่ทั้งหน้า
      setScoreEvents(prev => [...prev, { id: json.event?.id ?? `local-${Date.now()}`, student_id: studentId, preset_id: presetId, points: delta }]);
    } catch (e: any) {
      alert("แก้ไขคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  /* ---------------- ตั้งค่าเกณฑ์เกรด ---------------- */

  async function saveCriteria(newRows: Criterion[]) {
    try {
      const res = await fetch("/api/grade-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_section_id: sectionId, rows: newRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setCriteria(json.criteria ?? []);
      setShowGradeSetting(false);
    } catch (e: any) {
      alert("บันทึกเกณฑ์เกรดไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  /* ---------------- Export Excel ---------------- */

  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const sheetRows = rows.map(r => {
        const row: Record<string, string | number> = {
          "เลขที่": r.student.seat_number,
          "ชื่อ-นามสกุล": `${r.student.prefix ?? ""}${r.student.first_name} ${r.student.last_name}`.trim(),
        };
        assignments.forEach(a => {
          const sub = r.subMap[a.id];
          row[a.title] = sub?.score ?? (sub ? "ส่งแล้ว-ยังไม่ให้คะแนน" : "ไม่ส่งงาน");
        });
        presets.forEach(p => {
          row[p.label] = r.presetTotals[p.id] ?? 0;
        });
        row["คะแนนงานรวม"] = r.assignmentTotal;
        row["คะแนนพิเศษรวม"] = r.specialTotal;
        row["คะแนนรวมทั้งหมด"] = r.grandTotal;
        row["เปอร์เซ็นต์"] = Number(r.percentage.toFixed(2));
        row["เกรด"] = r.grade;
        return row;
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "คะแนนรวม");

      const fileName = `คะแนนรวม_${subjectCode || subjectTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e: any) {
      alert("ดาวน์โหลดไฟล์ไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {reportStudent && (
        <StudentReportModal
          row={rows.find(r => r.student.id === reportStudent.id)!}
          assignments={assignments}
          sectionId={sectionId}
          currentUserId={currentUserId}
          attendance={attendanceMap[reportStudent.id] ?? { present: 0, total: 0 }}
          subjectTitle={subjectTitle}
          subjectCode={subjectCode}
          academicYearLabel={academicYearLabel}
          classroomLabel={classroomLabel}
          homeroomTeacherName={homeroomTeacherName}
          subjectTeacherName={subjectTeacherName}
          onClose={() => setReportStudent(null)}
        />
      )}

      {showGradeSetting && (
        <GradeSettingModal
          initialCriteria={criteria}
          onCancel={() => setShowGradeSetting(false)}
          onSave={saveCriteria}
        />
      )}

      {/* หัวข้อ + ปุ่มควบคุม */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-black text-slate-800 text-lg">คะแนนรวม</h2>
          <p className="text-slate-400 text-xs font-bold">คุณสามารถดูคะแนนรวมของงานที่มอบหมาย และคะแนนพิเศษได้ที่นี่</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTab(tab === "table" ? "podium" : "table")}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
          >
            {tab === "table" ? "🏆 อันดับคะแนน" : "🔢 ตาราง"}
          </button>
          <button
            onClick={() => setShowGradeSetting(true)}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
          >
            ⚙️ ตั้งค่าคำนวณเกรด
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            📊 {exporting ? "กำลังดาวน์โหลด..." : "Export"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลดข้อมูลคะแนน...</div>
      ) : error ? (
        <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-3">❌ {error}</p>
      ) : tab === "table" ? (
        <GradeTable
          rows={rows}
          assignments={assignments}
          presets={presets}
          totalMaxScore={totalMaxScore}
          onOpenReport={s => setReportStudent(s)}
          onAdjustPreset={handleAdjustPreset}
        />
      ) : (
        <PodiumView top5={podiumTop5} hideScores={hideScores} onToggleHide={() => setHideScores(v => !v)} />
      )}
    </div>
  );
}

/* =========================================================================
   ตารางคะแนนรวม
   ========================================================================= */

function GradeTable({
  rows,
  assignments,
  presets,
  totalMaxScore,
  onOpenReport,
  onAdjustPreset,
}: {
  rows: ReturnType<typeof buildRowsType>;
  assignments: Assignment[];
  presets: Preset[];
  totalMaxScore: number;
  onOpenReport: (s: Student) => void;
  onAdjustPreset: (studentId: string, presetId: string, currentValue: number, newValue: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="font-bold text-sm">ไม่มีนักเรียนในวิชานี้</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left text-[11px] font-black text-slate-500 px-5 py-3 sticky left-0 bg-slate-50 z-10">Name</th>
            <th className="px-3 py-3 text-center text-[11px] font-black text-slate-400">Report</th>
            {assignments.map(a => (
              <th key={a.id} className="px-3 py-3 text-center min-w-[110px]">
                <p className="text-[11px] font-black text-slate-700 truncate max-w-[110px] mx-auto" title={a.title}>{a.title}</p>
                <p className="text-[9px] text-slate-300 font-bold">{a.max_score} คะแนนเต็ม</p>
              </th>
            ))}
            {presets.map(p => (
              <th key={p.id} className="px-3 py-3 text-center min-w-[100px]">
                <p className="text-[11px] font-black text-sky-600">{p.emoji} {p.label}</p>
                <p className="text-[9px] text-slate-300 font-bold">คะแนนพิเศษ</p>
              </th>
            ))}
            <th className="px-3 py-3 text-center min-w-[90px]">
              <p className="text-[11px] font-black text-slate-700">Total Score</p>
              <p className="text-[9px] text-slate-300 font-bold">({totalMaxScore} คะแนนเต็ม)</p>
            </th>
            <th className="px-3 py-3 text-center min-w-[70px]">
              <p className="text-[11px] font-black text-slate-700">Grade</p>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const s = r.student;
            return (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-5 py-3 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 text-xs font-black flex items-center justify-center">
                        {s.first_name[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name} ({s.nickname})</p>
                      <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <button
                    onClick={() => onOpenReport(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black whitespace-nowrap"
                  >
                    📄 Report
                  </button>
                </td>
                {assignments.map(a => {
                  const sub = r.subMap[a.id];
                  return (
                    <td key={a.id} className="text-center px-3 py-3">
                      {!sub ? (
                        <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600">ไม่ส่งงาน</span>
                      ) : sub.score === null ? (
                        <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-600">รอตรวจ</span>
                      ) : (
                        <span className="text-sm font-black text-slate-700">{sub.score}</span>
                      )}
                    </td>
                  );
                })}
                {presets.map(p => (
                  <td key={p.id} className="text-center px-3 py-3">
                    <EditablePresetCell
                      value={r.presetTotals[p.id] ?? 0}
                      onSave={newValue => onAdjustPreset(s.id, p.id, r.presetTotals[p.id] ?? 0, newValue)}
                    />
                  </td>
                ))}
                <td className="text-center px-3 py-3">
                  <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1.5 rounded-xl font-black text-sm bg-slate-100 text-slate-700">
                    {r.grandTotal}
                  </span>
                </td>
                <td className="text-center px-3 py-3">
                  <span className="inline-flex items-center justify-center min-w-[36px] px-2.5 py-1.5 rounded-xl font-black text-sm bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white">
                    {r.grade}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditablePresetCell({ value, onSave }: { value: number; onSave: (newValue: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => { setDraft(String(value)); }, [value]);

  function commit() {
    const parsed = Number(draft);
    setEditing(false);
    if (Number.isNaN(parsed)) { setDraft(String(value)); return; }
    if (parsed !== value) onSave(parsed);
  }

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
        className="w-16 text-center border-2 border-sky-300 rounded-lg py-1 text-sm font-black focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="คลิกเพื่อแก้ไขคะแนน"
      className={`text-sm font-black px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors ${
        value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-slate-300"
      }`}
    >
      {value}
    </button>
  );
}

// เอาไว้ให้ TS อนุมาน type ของ rows แบบสั้น ๆ โดยไม่ต้อง export type ซ้อนหลายชั้น
function buildRowsType() {
  return [] as {
    student: Student;
    subMap: Record<string, Submission>;
    presetTotals: Record<string, number>;
    assignmentTotal: number;
    submittedCount: number;
    specialTotal: number;
    percentage: number;
    grade: string;
    grandTotal: number;
  }[];
}

/* =========================================================================
   Podium — อันดับคะแนน Top 5
   ========================================================================= */

function PodiumView({
  top5,
  hideScores,
  onToggleHide,
}: {
  top5: ReturnType<typeof buildRowsType>;
  hideScores: boolean;
  onToggleHide: () => void;
}) {
  if (top5.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="font-bold text-sm">ยังไม่มีข้อมูลคะแนน</p>
      </div>
    );
  }

  // จัดลำดับการวางแท่น: 3-1-2-4-5 (อันดับ 1 อยู่กลางและสูงสุด)
  const order = [2, 0, 1, 3, 4].filter(i => i < top5.length);
  const heights: Record<number, string> = { 0: "h-40", 1: "h-28", 2: "h-20", 3: "h-14", 4: "h-14" };
  const medalEmoji: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉", 3: "🏅", 4: "🏅" };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-10">
      <div className="flex justify-end mb-6">
        <button onClick={onToggleHide} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs">
          {hideScores ? "👁️ แสดงคะแนน" : "🙈 ซ่อนคะแนน"}
        </button>
      </div>
      <div className="flex items-end justify-center gap-3 sm:gap-6 flex-wrap">
        {order.map(rank => {
          const r = top5[rank];
          if (!r) return null;
          const s = r.student;
          return (
            <div key={s.id} className="flex flex-col items-center">
              <p className="text-3xl mb-1">{medalEmoji[rank]}</p>
              {s.avatar_url ? (
                <img src={s.avatar_url} className="w-16 h-16 rounded-full object-cover border-4 border-amber-200 shadow" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-400 text-white text-xl font-black flex items-center justify-center border-4 border-amber-200 shadow">
                  {s.first_name[0]}
                </div>
              )}
              <p className="mt-2 text-sm font-black text-slate-700 text-center max-w-[110px] truncate">{s.first_name} {s.last_name}</p>
              <p className="text-[11px] font-black text-fuchsia-500 mb-2">{hideScores ? "•••" : `${r.grandTotal} คะแนน`}</p>
              <div className={`w-20 sm:w-28 ${heights[rank]} rounded-t-xl bg-gradient-to-b from-amber-300 to-amber-400 flex items-start justify-center pt-2`}>
                <span className="text-white font-black text-lg">{rank + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   ป๊อปอัพ ตั้งค่าเกณฑ์เกรด (Max / Min / Grade)
   ========================================================================= */

function GradeSettingModal({
  initialCriteria,
  onCancel,
  onSave,
}: {
  initialCriteria: Criterion[];
  onCancel: () => void;
  onSave: (rows: Criterion[]) => void;
}) {
  const [rows, setRows] = useState<Criterion[]>(
    initialCriteria.length > 0
      ? initialCriteria
      : [
          { max_percent: 100, min_percent: 80, grade: "4" },
          { max_percent: 79, min_percent: 75, grade: "3.5" },
          { max_percent: 74, min_percent: 70, grade: "3" },
          { max_percent: 69, min_percent: 65, grade: "2.5" },
          { max_percent: 64, min_percent: 60, grade: "2" },
          { max_percent: 59, min_percent: 55, grade: "1.5" },
          { max_percent: 54, min_percent: 50, grade: "1" },
          { max_percent: 49, min_percent: 0, grade: "0" },
        ]
  );

  function updateRow(i: number, field: keyof Criterion, value: string) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [field]: field === "grade" ? value : Number(value) } : r)));
  }
  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows(prev => [...prev, { max_percent: 0, min_percent: 0, grade: "" }]);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800 text-lg">Grade Setting</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 mb-2 text-[11px] font-black text-slate-400 px-1">
          <span>Max</span><span>Min</span><span>Grade</span><span></span>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 items-center">
              <input type="number" value={r.max_percent} onChange={e => updateRow(i, "max_percent", e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center" />
              <input type="number" value={r.min_percent} onChange={e => updateRow(i, "min_percent", e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center" />
              <input value={r.grade} onChange={e => updateRow(i, "grade", e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center" />
              <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 font-black">✕</button>
            </div>
          ))}
        </div>

        <button onClick={addRow} className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-500 font-black text-xs">
          + เพิ่มแถว
        </button>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">Cancel</button>
          <button onClick={() => onSave(rows)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white font-black text-sm">+ Update</button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Modal Report รายบุคคล
   ========================================================================= */

function StudentReportModal({
  row,
  assignments,
  sectionId,
  currentUserId,
  attendance,
  subjectTitle,
  subjectCode,
  academicYearLabel,
  classroomLabel,
  homeroomTeacherName,
  subjectTeacherName,
  onClose,
}: {
  row: ReturnType<typeof buildRowsType>[number];
  assignments: Assignment[];
  sectionId: string;
  currentUserId?: string;
  attendance: { present: number; total: number };
  subjectTitle: string;
  subjectCode: string;
  academicYearLabel?: string;
  classroomLabel?: string;
  homeroomTeacherName?: string;
  subjectTeacherName?: string;
  onClose: () => void;
}) {
  const s = row.student;

  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentSaved, setCommentSaved] = useState(false);
  const [loadingComment, setLoadingComment] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingComment(true);
    fetch(`/api/student-subject-comments?subject_section_id=${sectionId}&student_id=${s.id}`)
      .then(res => res.json())
      .then(json => { if (active) setComment(json.comment ?? ""); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingComment(false); });
    return () => { active = false; };
  }, [sectionId, s.id]);

  async function saveComment() {
    setSavingComment(true);
    setCommentSaved(false);
    try {
      const res = await fetch("/api/student-subject-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_section_id: sectionId,
          student_id: s.id,
          comment,
          updated_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกคอมเมนต์ไม่สำเร็จ");
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 2000);
    } catch (e: any) {
      alert("บันทึกคอมเมนต์ไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSavingComment(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 print:bg-white" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 print:shadow-none print:max-h-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h3 className="font-black text-slate-800 text-lg">รายงานผลรายบุคคล</h3>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs">
              🖨️ พิมพ์ / บันทึก PDF
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* หัวการ์ด */}
        <div className="text-center mb-5">
          {s.avatar_url ? (
            <img src={s.avatar_url} className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-fuchsia-100" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-400 text-white text-3xl font-black flex items-center justify-center mx-auto">
              {s.first_name[0]}
            </div>
          )}
          <p className="mt-3 font-black text-slate-800 text-lg">{s.prefix}{s.first_name} {s.last_name} ({s.nickname})</p>
          <p className="text-slate-400 text-xs font-bold">เลขที่ {s.seat_number} · {classroomLabel ?? "-"}</p>
        </div>

        {/* ข้อมูลวิชา */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <InfoBox label="ปีการศึกษา" value={academicYearLabel ?? "-"} />
          <InfoBox label="รายวิชา" value={`${subjectTitle} (${subjectCode})`} />
          <InfoBox label="ครูประจำชั้น" value={homeroomTeacherName ?? "-"} />
          <InfoBox label="ครูประจำวิชา" value={subjectTeacherName ?? "-"} />
        </div>

        {/* สรุปเกรด */}
        <div className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white p-4 flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] font-bold opacity-90">คะแนนรวมทั้งหมด</p>
            <p className="text-2xl font-black">{row.grandTotal} คะแนน</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold opacity-90">เกรด</p>
            <p className="text-2xl font-black">{row.grade}</p>
          </div>
        </div>

        {/* การเข้าเรียน */}
        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">🗓️ การเข้าเรียน</p>
          <InfoBox
            label="จำนวนวันที่มาเรียน"
            value={attendance.total > 0 ? `${attendance.present} / ${attendance.total} วัน` : "ยังไม่มีข้อมูลการเช็คชื่อ"}
          />
        </div>

        {/* รายการชิ้นงาน */}
        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">📚 รายการชิ้นงาน</p>
          {assignments.length === 0 ? (
            <p className="text-slate-300 text-xs font-bold italic">ยังไม่มีงานที่มอบหมาย</p>
          ) : (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              {assignments.map((a, i) => {
                const sub = row.subMap[a.id];
                return (
                  <div key={a.id} className={`flex items-center justify-between px-3 py-2 text-xs ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                    <span className="font-bold text-slate-600 truncate pr-2">{a.title}</span>
                    <span className="font-black text-slate-700 whitespace-nowrap">
                      {sub?.score ?? (sub ? "รอตรวจ" : "ไม่ส่งงาน")} / {a.max_score}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-2 text-right text-[11px] font-black text-slate-500">
            ส่งงานแล้ว {row.submittedCount} / {assignments.length} ชิ้น · รวม {row.assignmentTotal} / {assignments.reduce((a, b) => a + (b.max_score ?? 0), 0)} คะแนน
          </div>
        </div>

        {/* คะแนนพิเศษ (แสดงเป็นค่ารวม ไม่แยกชื่อการ์ด) */}
        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">⭐ คะแนนพิเศษรวม</p>
          <InfoBox label="คะแนนพิเศษที่ได้ (บวก/ลบ)" value={`${row.specialTotal > 0 ? "+" : ""}${row.specialTotal} คะแนน`} />
        </div>

        {/* คอมเมนต์ครู — แก้ไข/บันทึกได้ */}
        <div>
          <p className="text-xs font-black text-slate-600 mb-2 flex items-center justify-between print:hidden">
            <span>💬 คอมเมนต์ครูประจำวิชา</span>
            {commentSaved && <span className="text-emerald-500 text-[10px] font-black">✓ บันทึกแล้ว</span>}
          </p>
          <p className="text-xs font-black text-slate-600 mb-2 hidden print:block">💬 คอมเมนต์ครูประจำวิชา</p>
          {loadingComment ? (
            <p className="text-slate-300 text-xs font-bold">กำลังโหลด...</p>
          ) : (
            <>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="พิมพ์คอมเมนต์ถึงนักเรียน (ไม่บังคับ)..."
                rows={3}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold resize-none focus:border-fuchsia-300 focus:outline-none print:border-none print:p-0"
              />
              <button
                onClick={saveComment}
                disabled={savingComment}
                className="mt-2 w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-black text-xs disabled:opacity-50 print:hidden"
              >
                {savingComment ? "กำลังบันทึก..." : "💾 บันทึกคอมเมนต์"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-700 mt-0.5 truncate">{value}</p>
    </div>
  );
}