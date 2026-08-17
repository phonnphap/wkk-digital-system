"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  due_date?: string | null;
};

type Preset = { id: string; label: string; points: number; emoji: string; sort_order: number };

type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string;
  score: number | null;
  teacher_comment?: string | null;
  graded_at?: string | null;
  submitted_at?: string | null;
};

type ScoreEvent = { id: string; student_id: string; preset_id: string; points: number };

type Criterion = { id?: string; max_percent: number; min_percent: number; grade: string; sort_order?: number };

type ViewTab = "table" | "podium";

/* =========================================================================
   Component
   readOnly: สำหรับแอดมิน/ผู้บริหาร — ดู/export/print ได้ แต่แก้ไขคะแนนพิเศษ,
   คะแนนงาน, ตั้งค่าเกณฑ์เกรด, และคอมเมนต์ครู ไม่ได้
   ครูประจำวิชา (readOnly=false): แก้ไขคะแนนงานที่มอบหมายได้โดยตรงจากตารางนี้
   (คลิกที่คะแนน/ป้าย "รอตรวจ"/"ไม่ส่งงาน" เพื่อกรอกคะแนนได้ทันที)
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
  readOnly = false,
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
  readOnly?: boolean;
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
        // ไม่ critical
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

  const totalMaxScore = useMemo(
    () => assignments.reduce((sum, a) => sum + (a.max_score ?? 0), 0),
    [assignments]
  );

  function isOnTime(assignment: Assignment, sub?: Submission): boolean | null {
    if (!sub || !(sub.status === "submitted" || sub.status === "graded")) return null;
    if (!assignment.due_date || !sub.submitted_at) return null;
    return new Date(sub.submitted_at).getTime() <= new Date(assignment.due_date).getTime();
  }

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

      let onTimeCount = 0;
      let lateCount = 0;
      let knownOnTimeCount = 0;
      assignments.forEach(a => {
        const result = isOnTime(a, subMap[a.id]);
        if (result === null) return;
        knownOnTimeCount++;
        if (result) onTimeCount++; else lateCount++;
      });
      const onTimeRate = knownOnTimeCount > 0 ? (onTimeCount / knownOnTimeCount) * 100 : null;

      const presetTotals: Record<string, number> = {};
      presets.forEach(p => { presetTotals[p.id] = 0; });
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
        student: s, subMap, presetTotals, assignmentTotal, submittedCount,
        onTimeCount, lateCount, onTimeRate, specialTotal, percentage, grade, grandTotal,
      };
    });
  }, [students, submissions, assignments, presets, scoreEvents, criteria, totalMaxScore]);

  const podiumTop5 = useMemo(() => {
    return [...rows].sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 5);
  }, [rows]);

  async function handleAdjustPreset(studentId: string, presetId: string, currentValue: number, newValue: number) {
    if (readOnly) return;
    const delta = newValue - currentValue;
    if (delta === 0) return;
    try {
      const res = await fetch("/api/score-events/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_section_id: sectionId, student_id: studentId, preset_id: presetId,
          delta, created_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แก้ไขคะแนนไม่สำเร็จ");
      setScoreEvents(prev => [...prev, { id: json.event?.id ?? `local-${Date.now()}`, student_id: studentId, preset_id: presetId, points: delta }]);
    } catch (e: any) {
      alert("แก้ไขคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  // ให้คะแนนงานที่มอบหมายแบบ inline จากตารางคะแนนรวมนี้โดยตรง (เฉพาะครูประจำวิชา ไม่ใช่ readOnly)
  // NOTE: endpoint /api/assignment-submissions/grade ต้อง upsert สถานะเป็น "reviewed"
  // (ไม่ใช่ "graded") ให้ตรงกับ CHECK constraint ของตาราง assignment_submissions
  async function handleUpdateScore(studentId: string, assignmentId: string, newScore: number) {
    if (readOnly) return;
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    if (Number.isNaN(newScore) || newScore < 0 || newScore > (assignment.max_score ?? 0)) {
      alert(`คะแนนต้องอยู่ระหว่าง 0 - ${assignment.max_score} คะแนน`);
      return;
    }
    try {
      const res = await fetch("/api/assignment-submissions/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_section_id: sectionId,
          assignment_id: assignmentId,
          student_id: studentId,
          score: newScore,
          graded_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกคะแนนไม่สำเร็จ");

      const updated: Submission = json.submission ?? {
        id: `local-${Date.now()}`,
        assignment_id: assignmentId,
        student_id: studentId,
        status: "reviewed",
        score: newScore,
        graded_at: new Date().toISOString(),
      };

      setSubmissions(prev => {
        const exists = prev.some(s => s.assignment_id === assignmentId && s.student_id === studentId);
        if (exists) {
          return prev.map(s => (s.assignment_id === assignmentId && s.student_id === studentId ? { ...s, ...updated } : s));
        }
        return [...prev, updated];
      });
    } catch (e: any) {
      alert("บันทึกคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  async function saveCriteria(newRows: Criterion[]) {
    if (readOnly) return;
    try {
      const res = await fetch("/api/grade-criteria", {
        method: "POST", headers: { "Content-Type": "application/json" },
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
          const result = isOnTime(a, sub);
          const onTimeTag = result === null ? "" : result ? " (ตรงเวลา)" : " (ส่งช้า)";
          row[a.title] = sub?.score !== null && sub?.score !== undefined
            ? `${sub.score}${onTimeTag}`
            : (sub ? "ส่งแล้ว-ยังไม่ให้คะแนน" + onTimeTag : "ไม่ส่งงาน");
        });
        presets.forEach(p => { row[p.label] = r.presetTotals[p.id] ?? 0; });
        row["คะแนนงานรวม"] = r.assignmentTotal;
        row["คะแนนพิเศษรวม"] = r.specialTotal;
        row["คะแนนรวมทั้งหมด"] = r.grandTotal;
        row["เปอร์เซ็นต์"] = Number(r.percentage.toFixed(2));
        row["เกรด"] = r.grade;
        row["ส่งตรงเวลา (ชิ้น)"] = r.onTimeCount;
        row["ส่งช้า (ชิ้น)"] = r.lateCount;
        row["อัตราส่งตรงเวลา (%)"] = r.onTimeRate === null ? "ไม่มีข้อมูล" : Number(r.onTimeRate.toFixed(2));
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

  function handlePrint() {
    window.print();
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
          readOnly={readOnly}
          onClose={() => setReportStudent(null)}
        />
      )}

      {showGradeSetting && !readOnly && (
        <GradeSettingModal
          initialCriteria={criteria}
          onCancel={() => setShowGradeSetting(false)}
          onSave={saveCriteria}
        />
      )}

      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="font-black text-slate-800 text-lg">คะแนนรวม</h2>
          <p className="text-slate-400 text-xs font-bold">
            {readOnly ? "มุมมองดูอย่างเดียว — ดูและดาวน์โหลด/พิมพ์ได้ แก้ไขไม่ได้" : "คลิกที่คะแนนงาน หรือคะแนนพิเศษ เพื่อแก้ไข/ให้คะแนนได้ทันที · กด Enter เพื่อบันทึกและไปนักเรียนคนถัดไป"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTab(tab === "table" ? "podium" : "table")}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
          >
            {tab === "table" ? "🏆 อันดับคะแนน" : "🔢 ตาราง"}
          </button>
          {!readOnly && (
            <button
              onClick={() => setShowGradeSetting(true)}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
            >
              ⚙️ ตั้งค่าคำนวณเกรด
            </button>
          )}
          {readOnly && (
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
            >
              🖨️ พิมพ์
            </button>
          )}
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
          onUpdateScore={handleUpdateScore}
          isOnTime={isOnTime}
          readOnly={readOnly}
        />
      ) : (
        <PodiumView top5={podiumTop5} hideScores={hideScores} onToggleHide={() => setHideScores(v => !v)} />
      )}
    </div>
  );
}

// ★ คีย์บอกว่า "ช่องไหน" กำลังถูกแก้ไขอยู่ (ใช้คู่ assignment_id + student_id เพราะ 1 คอลัมน์มีได้หลายแถว)
type ActiveCell = { assignmentId: string; studentId: string } | null;

function GradeTable({
  rows, assignments, presets, totalMaxScore, onOpenReport, onAdjustPreset, onUpdateScore, isOnTime, readOnly,
}: {
  rows: ReturnType<typeof buildRowsType>;
  assignments: Assignment[];
  presets: Preset[];
  totalMaxScore: number;
  onOpenReport: (s: Student) => void;
  onAdjustPreset: (studentId: string, presetId: string, currentValue: number, newValue: number) => void;
  onUpdateScore: (studentId: string, assignmentId: string, newScore: number) => void;
  isOnTime: (assignment: Assignment, sub?: Submission) => boolean | null;
  readOnly: boolean;
}) {
  // ★ ช่องที่กำลังกรอกคะแนนอยู่ตอนนี้ (คุมจากที่นี่ เพื่อให้กด Enter แล้วสั่งเปิดช่องถัดไปในคอลัมน์เดียวกันได้)
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);

  function moveToNextRow(assignmentId: string, studentId: string) {
    const idx = rows.findIndex(r => r.student.id === studentId);
    if (idx >= 0 && idx < rows.length - 1) {
      setActiveCell({ assignmentId, studentId: rows[idx + 1].student.id });
    } else {
      setActiveCell(null); // แถวสุดท้ายแล้ว ไม่มีคนถัดไป ปิดโหมดแก้ไข
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="font-bold text-sm">ไม่มีนักเรียนในวิชานี้</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
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
            <th className="px-3 py-3 text-center min-w-[90px]">
              <p className="text-[11px] font-black text-slate-700">ส่งตรงเวลา</p>
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
                  const onTimeResult = isOnTime(a, sub);
                  return (
                    <td key={a.id} className="text-center px-3 py-3">
                      {readOnly ? (
                        !sub ? (
                          <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600">ไม่ส่งงาน</span>
                        ) : sub.score === null ? (
                          <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-600">รอตรวจ</span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm font-black text-slate-700">{sub.score}</span>
                            {onTimeResult === false && (
                              <span className="text-[9px] font-black text-red-500">⏰ ส่งช้า</span>
                            )}
                          </div>
                        )
                      ) : (
                        <EditableScoreCell
                          submission={sub}
                          maxScore={a.max_score}
                          onTimeResult={onTimeResult}
                          isEditing={activeCell?.assignmentId === a.id && activeCell?.studentId === s.id}
                          onRequestEdit={() => setActiveCell({ assignmentId: a.id, studentId: s.id })}
                          onCommit={newScore => onUpdateScore(s.id, a.id, newScore)}
                          onEnterNext={() => moveToNextRow(a.id, s.id)}
                          onCancelEdit={() => setActiveCell(null)}
                        />
                      )}
                    </td>
                  );
                })}
                {presets.map(p => (
                  <td key={p.id} className="text-center px-3 py-3">
                    {readOnly ? (
                      <span className={`text-sm font-black ${(r.presetTotals[p.id] ?? 0) > 0 ? "text-emerald-600" : (r.presetTotals[p.id] ?? 0) < 0 ? "text-red-500" : "text-slate-300"}`}>
                        {r.presetTotals[p.id] ?? 0}
                      </span>
                    ) : (
                      <EditablePresetCell value={r.presetTotals[p.id] ?? 0} onSave={newValue => onAdjustPreset(s.id, p.id, r.presetTotals[p.id] ?? 0, newValue)} />
                    )}
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
                <td className="text-center px-3 py-3">
                  {r.onTimeRate === null ? (
                    <span className="text-[10px] text-slate-300 font-bold">ไม่มีข้อมูล</span>
                  ) : (
                    <span className={`inline-flex items-center justify-center min-w-[50px] px-2 py-1.5 rounded-xl font-black text-xs ${
                      r.onTimeRate >= 80 ? "bg-emerald-50 text-emerald-600" : r.onTimeRate >= 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                    }`}>
                      {r.onTimeRate.toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ป้าย/ช่องกรอกคะแนนงานที่มอบหมาย แบบคลิกแก้ไขได้ทันที (สำหรับครูประจำวิชาเท่านั้น)
   - ยังไม่มีการส่งงานเลย ("ไม่ส่งงาน") -> คลิกเพื่อกรอกคะแนนได้เลย (ให้คะแนนย้อนหลัง/กรณีส่งงานกระดาษ)
   - ส่งงานแล้วแต่ยังไม่ตรวจ ("รอตรวจ") -> คลิกเพื่อกรอกคะแนน
   - มีคะแนนแล้ว -> คลิกที่ตัวเลขเพื่อแก้ไข
   ★ "isEditing" ถูกควบคุมจาก GradeTable (แทนที่จะเป็น state ภายในตัวเอง) เพื่อให้กด Enter
   แล้วสั่งเปิดโหมดแก้ไขของ "แถวถัดไป คอลัมน์เดียวกัน" ต่อได้ทันที เหมือนกรอกคะแนนใน Excel */
function EditableScoreCell({
  submission,
  maxScore,
  onTimeResult,
  isEditing,
  onRequestEdit,
  onCommit,
  onEnterNext,
  onCancelEdit,
}: {
  submission?: Submission;
  maxScore: number;
  onTimeResult: boolean | null;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCommit: (newScore: number) => void;
  onEnterNext: () => void;
  onCancelEdit: () => void;
}) {
  const currentValueText = submission?.score !== null && submission?.score !== undefined ? String(submission.score) : "";
  const [draft, setDraft] = useState(currentValueText);
  // ป้องกันไม่ให้ onBlur ทำงานซ้ำ หลังจากที่ Enter/Escape จัดการไปแล้ว
  // (ตอน Enter เปลี่ยน activeCell ไปแถวถัดไป ช่องนี้จะถูกถอดออกจาก DOM ซึ่งอาจไป trigger blur ซ้ำ)
  const justActedRef = useRef(false);

  useEffect(() => {
    setDraft(currentValueText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.score, isEditing]);

  function commitIfChanged() {
    const parsed = Number(draft);
    if (draft.trim() === "" || Number.isNaN(parsed)) return;
    if (submission?.score !== null && submission?.score !== undefined && parsed === submission.score) return;
    onCommit(parsed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      justActedRef.current = true;
      commitIfChanged();
      onEnterNext(); // ★ บันทึกแล้วกระโดดไปช่องกรอกของนักเรียนคนถัดไปในคอลัมน์เดียวกัน
    } else if (e.key === "Escape") {
      e.preventDefault();
      justActedRef.current = true;
      setDraft(currentValueText);
      onCancelEdit();
    }
  }

  function handleBlur() {
    if (justActedRef.current) {
      justActedRef.current = false;
      return;
    }
    commitIfChanged();
    onCancelEdit();
  }

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={0}
        max={maxScore}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-16 mx-auto block text-center border-2 border-sky-300 rounded-lg py-1 text-sm font-black focus:outline-none"
      />
    );
  }

  if (!submission) {
    return (
      <button
        onClick={onRequestEdit}
        title="คลิกเพื่อให้คะแนน"
        className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
      >
        ไม่ส่งงาน · ให้คะแนน
      </button>
    );
  }

  if (submission.score === null) {
    return (
      <button
        onClick={onRequestEdit}
        title="คลิกเพื่อให้คะแนน"
        className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
      >
        รอตรวจ · ให้คะแนน
      </button>
    );
  }

  return (
    <button onClick={onRequestEdit} title="คลิกเพื่อแก้ไขคะแนน" className="flex flex-col items-center gap-0.5 mx-auto">
      <span className="text-sm font-black text-slate-700 hover:bg-slate-100 rounded-lg px-2 py-0.5 transition-colors">{submission.score}</span>
      {onTimeResult === false && <span className="text-[9px] font-black text-red-500">⏰ ส่งช้า</span>}
    </button>
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

function buildRowsType() {
  return [] as {
    student: Student;
    subMap: Record<string, Submission>;
    presetTotals: Record<string, number>;
    assignmentTotal: number;
    submittedCount: number;
    onTimeCount: number;
    lateCount: number;
    onTimeRate: number | null;
    specialTotal: number;
    percentage: number;
    grade: string;
    grandTotal: number;
  }[];
}

function PodiumView({
  top5, hideScores, onToggleHide,
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

  const order = [2, 0, 1, 3, 4].filter(i => i < top5.length);
  const heights: Record<number, string> = { 0: "h-40", 1: "h-28", 2: "h-20", 3: "h-14", 4: "h-14" };
  const medalEmoji: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉", 3: "🏅", 4: "🏅" };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-10">
      <div className="flex justify-end mb-6 print:hidden">
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

function GradeSettingModal({
  initialCriteria, onCancel, onSave,
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

function StudentReportModal({
  row, assignments, sectionId, currentUserId, attendance, subjectTitle, subjectCode,
  academicYearLabel, classroomLabel, homeroomTeacherName, subjectTeacherName, readOnly, onClose,
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
  readOnly?: boolean;
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
    if (readOnly) return;
    setSavingComment(true);
    setCommentSaved(false);
    try {
      const res = await fetch("/api/student-subject-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_section_id: sectionId, student_id: s.id, comment, updated_by: currentUserId || null }),
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

        <div className="grid grid-cols-2 gap-2 mb-5">
          <InfoBox label="ปีการศึกษา" value={academicYearLabel ?? "-"} />
          <InfoBox label="รายวิชา" value={`${subjectTitle} (${subjectCode})`} />
          <InfoBox label="ครูประจำชั้น" value={homeroomTeacherName ?? "-"} />
          <InfoBox label="ครูประจำวิชา" value={subjectTeacherName ?? "-"} />
        </div>

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

        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">🗓️ การเข้าเรียน</p>
          <InfoBox
            label="จำนวนวันที่มาเรียน"
            value={attendance.total > 0 ? `${attendance.present} / ${attendance.total} วัน` : "ยังไม่มีข้อมูลการเช็คชื่อ"}
          />
        </div>

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
          <div className="mt-2 flex items-center justify-between text-[11px] font-black text-slate-500">
            <span>ส่งงานแล้ว {row.submittedCount} / {assignments.length} ชิ้น · รวม {row.assignmentTotal} / {assignments.reduce((a, b) => a + (b.max_score ?? 0), 0)} คะแนน</span>
            <span>
              {row.onTimeRate === null ? "ไม่มีข้อมูลส่งตรงเวลา" : `⏱️ ตรงเวลา ${row.onTimeCount} / ส่งช้า ${row.lateCount} (${row.onTimeRate.toFixed(0)}%)`}
            </span>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">⭐ คะแนนพิเศษรวม</p>
          <InfoBox label="คะแนนพิเศษที่ได้ (บวก/ลบ)" value={`${row.specialTotal > 0 ? "+" : ""}${row.specialTotal} คะแนน`} />
        </div>

        <div>
          <p className="text-xs font-black text-slate-600 mb-2 flex items-center justify-between print:hidden">
            <span>💬 คอมเมนต์ครูประจำวิชา</span>
            {commentSaved && <span className="text-emerald-500 text-[10px] font-black">✓ บันทึกแล้ว</span>}
          </p>
          <p className="text-xs font-black text-slate-600 mb-2 hidden print:block">💬 คอมเมนต์ครูประจำวิชา</p>
          {loadingComment ? (
            <p className="text-slate-300 text-xs font-bold">กำลังโหลด...</p>
          ) : readOnly ? (
            <p className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 min-h-[3rem] print:border-none print:p-0 print:bg-transparent">
              {comment || "— ไม่มีคอมเมนต์ —"}
            </p>
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