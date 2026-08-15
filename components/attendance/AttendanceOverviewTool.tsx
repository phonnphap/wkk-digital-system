"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "present" | "absent" | "late" | "leave" | "excused";

type Student = {
  id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  seat_number: number;
  avatar_url?: string;
};

type DailyRecord = { student_id: string; attendance_date: string; status: Status };

const STATUS_CONFIG: Record<Status, { label: string; short: string; chipBg: string; chipText: string }> = {
  present: { label: "มาเรียน", short: "มา", chipBg: "bg-emerald-50", chipText: "text-emerald-700" },
  late: { label: "มาสาย", short: "สาย", chipBg: "bg-amber-50", chipText: "text-amber-700" },
  leave: { label: "ลาป่วย/ลากิจ", short: "ลา", chipBg: "bg-violet-50", chipText: "text-violet-700" },
  excused: { label: "ไปกิจกรรม", short: "กิจกรรม", chipBg: "bg-sky-50", chipText: "text-sky-700" },
  absent: { label: "ขาด", short: "ขาด", chipBg: "bg-red-50", chipText: "text-red-700" },
};

const SUMMARY_ORDER: Status[] = ["absent", "leave", "late", "excused", "present"];

type ViewTab = "attendances" | "summary";

/* =========================================================================
   Component
   readOnly: สำหรับแอดมิน/ผู้บริหาร — ดู/export ได้ แต่ซ่อน "สร้างตารางใหม่"
   และปิดการคลิกวันที่เพื่อไปหน้าเช็คชื่อ (แก้ไข)
   ========================================================================= */

export default function AttendanceOverviewTool({
  sectionId,
  subjectTitle,
  subjectCode,
  academicYearLabel,
  joinCode,
  students,
  onCreateNew,
  onOpenDate,
  readOnly = false,
}: {
  sectionId: string;
  subjectTitle: string;
  subjectCode: string;
  academicYearLabel?: string;
  joinCode?: string;
  students: Student[];
  onCreateNew?: () => void;
  onOpenSettings?: () => void;
  onOpenDate?: (date: string) => void;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState<ViewTab>("attendances");
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/subject-attendance/summary?subject_section_id=${sectionId}`)
      .then(res => res.json())
      .then(json => {
        if (!active) return;
        setDates(json.dates ?? []);
        setRecords(json.records ?? []);
      })
      .catch(() => {
        if (active) setError("โหลดข้อมูลการเช็คชื่อไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [sectionId]);

  const cellMap = useMemo(() => {
    const map: Record<string, Record<string, Status>> = {};
    records.forEach(r => {
      if (!map[r.student_id]) map[r.student_id] = {};
      map[r.student_id][r.attendance_date] = r.status;
    });
    return map;
  }, [records]);

  const summaryRows = useMemo(() => {
    return students.map(s => {
      const counts: Record<Status, number> = { present: 0, absent: 0, late: 0, leave: 0, excused: 0 };
      records.filter(r => r.student_id === s.id).forEach(r => { counts[r.status]++; });
      const totalPresent = counts.present + counts.late;
      return { student: s, counts, totalPresent };
    });
  }, [students, records]);

  function formatThaiDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" });
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const dailySheetRows = students.map(s => {
        const row: Record<string, string> = {
          "เลขที่": String(s.seat_number),
          "ชื่อ-นามสกุล": `${s.prefix ?? ""}${s.first_name} ${s.last_name} (${s.nickname})`.trim(),
        };
        dates.forEach(d => {
          const st = cellMap[s.id]?.[d];
          row[formatThaiDate(d)] = st ? STATUS_CONFIG[st].label : "-";
        });
        return row;
      });

      const summarySheetRows = summaryRows.map(({ student, counts, totalPresent }) => ({
        "เลขที่": String(student.seat_number),
        "ชื่อ-นามสกุล": `${student.prefix ?? ""}${student.first_name} ${student.last_name} (${student.nickname})`.trim(),
        "ขาด": counts.absent,
        "ลาป่วย/ลากิจ": counts.leave,
        "มาสาย": counts.late,
        "ไปกิจกรรม": counts.excused,
        "มาเรียน": counts.present,
        "รวมมาเรียน": totalPresent,
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySheetRows), "รายวัน");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheetRows), "สรุปรวม");

      const fileName = `เช็คชื่อ_${subjectCode || subjectTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="font-black text-slate-800 text-lg">ข้อมูลการเช็คชื่อ</h2>
          <p className="text-slate-400 text-xs font-bold">
            {readOnly ? "มุมมองดูอย่างเดียว — ดูและดาวน์โหลด/พิมพ์ได้ แก้ไขไม่ได้" : "คุณสามารถตรวจดูข้อมูลการเช็คชื่อได้ที่นี่"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!readOnly && (
            <button
              onClick={onCreateNew}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm flex items-center gap-1.5"
            >
              🗓️ สร้างตารางใหม่
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
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            📊 {exporting ? "กำลังดาวน์โหลด..." : "ดาวน์โหลดข้อมูล"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        <button
          onClick={() => setTab("attendances")}
          className={`px-4 py-2 rounded-xl font-black text-sm flex items-center gap-1.5 ${
            tab === "attendances" ? "bg-sky-50 text-sky-600 border-2 border-sky-300" : "text-slate-400 border-2 border-transparent hover:bg-slate-50"
          }`}
        >
          📋 Attendances
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`px-4 py-2 rounded-xl font-black text-sm flex items-center gap-1.5 ${
            tab === "summary" ? "bg-sky-50 text-sky-600 border-2 border-sky-300" : "text-slate-400 border-2 border-transparent hover:bg-slate-50"
          }`}
        >
          🔢 Summary
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลดข้อมูลการเช็คชื่อ...</div>
      ) : error ? (
        <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-3">❌ {error}</p>
      ) : tab === "attendances" ? (
        <AttendancesDailyTable
          students={students}
          dates={dates}
          cellMap={cellMap}
          formatThaiDate={formatThaiDate}
          onOpenDate={readOnly ? undefined : onOpenDate}
        />
      ) : (
        <SummaryTable summaryRows={summaryRows} />
      )}
    </div>
  );
}

function AttendancesDailyTable({
  students, dates, cellMap, formatThaiDate, onOpenDate,
}: {
  students: Student[];
  dates: string[];
  cellMap: Record<string, Record<string, Status>>;
  formatThaiDate: (iso: string) => string;
  onOpenDate?: (date: string) => void;
}) {
  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">🗓️</p>
        <p className="font-bold text-sm">ยังไม่มีข้อมูลการเช็คชื่อ</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left text-[11px] font-black text-slate-500 tracking-wide px-5 py-3 sticky left-0 bg-slate-50 z-10">Name</th>
            {dates.map(d => (
              <th key={d} className="px-3 py-3">
                {onOpenDate ? (
                  <button
                    type="button"
                    onClick={() => onOpenDate(d)}
                    className="text-[11px] font-black text-slate-600 hover:text-sky-600 whitespace-nowrap"
                    title="ไปหน้าเช็คชื่อวันนี้"
                  >
                    {formatThaiDate(d)}
                  </button>
                ) : (
                  <span className="text-[11px] font-black text-slate-500 whitespace-nowrap">{formatThaiDate(d)}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map(s => (
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
              {dates.map(d => {
                const st = cellMap[s.id]?.[d];
                return (
                  <td key={d} className="text-center px-3 py-3">
                    {st ? (
                      <span className={`inline-block px-2 py-1 rounded-full text-[10px] font-black ${STATUS_CONFIG[st].chipBg} ${STATUS_CONFIG[st].chipText}`}>
                        {STATUS_CONFIG[st].short}
                      </span>
                    ) : (
                      <span className="text-slate-200 text-xs">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTable({
  summaryRows,
}: {
  summaryRows: { student: Student; counts: Record<Status, number>; totalPresent: number }[];
}) {
  if (summaryRows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="font-bold text-sm">ไม่มีนักเรียนในวิชานี้</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left text-[11px] font-black text-slate-500 px-5 py-3">Name</th>
            {SUMMARY_ORDER.map(st => (
              <th key={st} className="px-3 py-3 text-center">
                <p className={`text-[11px] font-black ${STATUS_CONFIG[st].chipText}`}>{STATUS_CONFIG[st].label}</p>
                <p className="text-[9px] text-slate-300 font-bold">Total</p>
              </th>
            ))}
            <th className="px-3 py-3 text-center">
              <p className="text-[11px] font-black text-slate-700">รวมมาเรียน</p>
              <p className="text-[9px] text-slate-300 font-bold">Number of Presents</p>
            </th>
          </tr>
        </thead>
        <tbody>
          {summaryRows.map(({ student: s, counts, totalPresent }) => (
            <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-600 text-xs font-black flex items-center justify-center">
                      {s.first_name[0]}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name} ({s.nickname})</p>
                    <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                  </div>
                </div>
              </td>
              {SUMMARY_ORDER.map(st => (
                <td key={st} className="text-center px-3 py-3">
                  <span className={`inline-flex items-center justify-center min-w-[36px] px-2.5 py-1.5 rounded-xl font-black text-sm ${STATUS_CONFIG[st].chipBg} ${STATUS_CONFIG[st].chipText}`}>
                    {counts[st]}
                  </span>
                </td>
              ))}
              <td className="text-center px-3 py-3">
                <span className="inline-flex items-center justify-center min-w-[36px] px-2.5 py-1.5 rounded-xl font-black text-sm bg-slate-100 text-slate-700">
                  {totalPresent}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}