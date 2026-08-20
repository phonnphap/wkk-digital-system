"use client";

import { useEffect, useMemo, useState } from "react";

type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number };
type Item = { key: string; label: string };
type AssessmentType = "read_think_write" | "characteristics";

function levelFromPercent(pct: number): { level: number; label: string } {
  if (pct >= 86) return { level: 3, label: "ดีเยี่ยม" };
  if (pct >= 70) return { level: 2, label: "ดี" };
  if (pct >= 50) return { level: 1, label: "ผ่าน" };
  return { level: 0, label: "ไม่ผ่าน" };
}

export default function ScoreSheetAssessmentTool({
  sectionId, assessmentType, title, classroomLabel, subjectTitle, items, maxPerItem,
  students, currentUserId, readOnly, onBack,
}: {
  sectionId: string;
  assessmentType: AssessmentType;
  title: string;
  classroomLabel?: string;
  subjectTitle: string;
  items: Item[];
  maxPerItem: number;
  students: Student[];
  currentUserId?: string;
  readOnly?: boolean;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});

  const maxTotal = items.length * maxPerItem;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/student-assessments?subject_section_id=${sectionId}&assessment_type=${assessmentType}`);
        const json = await res.json();
        const map: Record<string, Record<string, number>> = {};
        (json.rows ?? []).forEach((r: any) => { map[r.student_id] = r.item_scores ?? {}; });
        setScores(map);
      } catch {
        // เริ่มจากค่าว่างถ้าโหลดไม่สำเร็จ
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId, assessmentType]);

  function setScore(studentId: string, itemKey: string, value: number) {
    if (readOnly) return;
    const clamped = Math.max(0, Math.min(maxPerItem, Number.isNaN(value) ? 0 : value));
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? {}), [itemKey]: clamped } }));
  }

  async function saveRow(studentId: string) {
    if (readOnly) return;
    setSaving(true);
    try {
      await fetch("/api/student-assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_section_id: sectionId,
          student_id: studentId,
          assessment_type: assessmentType,
          item_scores: scores[studentId] ?? {},
          updated_by: currentUserId || null,
        }),
      });
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  }

  const rows = useMemo(() => {
    return students.map(s => {
      const rowScores = scores[s.id] ?? {};
      const total = items.reduce((sum, it) => sum + (rowScores[it.key] ?? 0), 0);
      const percent = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
      const { level, label } = levelFromPercent(percent);
      return { student: s, rowScores, total, percent, level, label };
    });
  }, [students, scores, items, maxTotal]);

  async function handleExportExcel() {
    const XLSX = await import("xlsx");
    const sheetRows = rows.map((r, i) => {
      const row: Record<string, string | number> = {
        "เลขที่": i + 1,
        "ชื่อ-สกุล": `${r.student.prefix ?? ""}${r.student.first_name} ${r.student.last_name}`.trim(),
      };
      items.forEach(it => { row[it.label] = r.rowScores[it.key] ?? 0; });
      row["คะแนน"] = r.total;
      row["ร้อยละ"] = Number(r.percent.toFixed(2));
      row["ระดับ"] = r.level;
      row["ผลการประเมิน"] = r.percent >= 50 ? "ผ่าน" : "ไม่ผ่าน";
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "ประเมิน");
    XLSX.writeFile(wb, `${title}_${classroomLabel ?? ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <button onClick={onBack} className="text-xs font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          <h2 className="font-black text-slate-800 text-lg">{title}</h2>
          <p className="text-slate-400 text-xs font-bold">
            {subjectTitle} · {classroomLabel} · {readOnly ? "ดูอย่างเดียว" : "คลิกที่ช่องคะแนนเพื่อแก้ไข"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm">
            🖨️ พิมพ์
          </button>
          <button onClick={handleExportExcel} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm">
            📊 Export
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-auto max-h-[75vh]">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-indigo-50 to-fuchsia-50">
              <tr>
                <th className="px-3 py-3 text-left font-black text-slate-600 sticky left-0 bg-indigo-50">เลขที่ / ชื่อ-สกุล</th>
                {items.map(it => (
                  <th key={it.key} className="px-3 py-3 text-center font-black text-slate-600 min-w-[80px]">
                    {it.label}<p className="text-[9px] text-slate-400 font-bold">เต็ม {maxPerItem}</p>
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-black text-emerald-700 min-w-[70px]">คะแนน<p className="text-[9px] text-emerald-400 font-bold">เต็ม {maxTotal}</p></th>
                <th className="px-3 py-3 text-center font-black text-slate-600 min-w-[60px]">ร้อยละ</th>
                <th className="px-3 py-3 text-center font-black text-fuchsia-700 min-w-[90px]">ผลการประเมิน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.student.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <span className="font-black text-slate-500 mr-1">{i + 1}.</span>
                    <span className="font-bold text-slate-700">{r.student.prefix}{r.student.first_name} {r.student.last_name}</span>
                  </td>
                  {items.map(it => (
                    <td key={it.key} className="text-center px-2 py-2">
                      {readOnly ? (
                        <span className="font-black">{r.rowScores[it.key] ?? 0}</span>
                      ) : (
                        <input
                          type="number" min={0} max={maxPerItem}
                          value={r.rowScores[it.key] ?? 0}
                          onChange={e => setScore(r.student.id, it.key, Number(e.target.value))}
                          onBlur={() => saveRow(r.student.id)}
                          className="w-14 text-center border-2 border-slate-200 rounded-lg py-1 text-xs font-black focus:outline-none focus:border-fuchsia-300"
                        />
                      )}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2 font-black text-emerald-600">{r.total}</td>
                  <td className="text-center px-3 py-2 font-bold text-slate-500">{r.percent.toFixed(1)}%</td>
                  <td className="text-center px-3 py-2">
                    <span className={`inline-block px-2.5 py-1 rounded-full font-black ${
                      r.percent >= 50 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                    }`}>
                      {r.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {saving && <p className="text-[11px] text-slate-400 font-bold print:hidden">กำลังบันทึก...</p>}
    </div>
  );
}