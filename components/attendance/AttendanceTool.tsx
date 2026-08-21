"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchSingleHoliday, HolidayInfo } from "@/lib/holidays";

const supabase = createClient();

type Status = "present" | "absent" | "late" | "leave" | "excused";

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string; nickname?: string;
  seat_number: number; avatar_url?: string;
};

type ReferenceInfo = { status: Status };

const STATUS_CONFIG: Record<Status, { label: string; emoji: string; dot: string; ring: string; chipBg: string; chipText: string }> = {
  present: { label: "มา", emoji: "✅", dot: "bg-emerald-500", ring: "ring-emerald-300", chipBg: "bg-emerald-50", chipText: "text-emerald-700" },
  late: { label: "สาย", emoji: "⏰", dot: "bg-amber-500", ring: "ring-amber-300", chipBg: "bg-amber-50", chipText: "text-amber-700" },
  leave: { label: "ลา", emoji: "📄", dot: "bg-violet-500", ring: "ring-violet-300", chipBg: "bg-violet-50", chipText: "text-violet-700" },
  excused: { label: "ไปกิจกรรม", emoji: "🏃", dot: "bg-sky-500", ring: "ring-sky-300", chipBg: "bg-sky-50", chipText: "text-sky-700" },
  absent: { label: "ขาด", emoji: "❌", dot: "bg-red-500", ring: "ring-red-300", chipBg: "bg-red-50", chipText: "text-red-700" },
};
const STATUS_ORDER: Status[] = ["present", "late", "excused", "leave", "absent"]; // มา-สาย-ไปกิจกรรม-ลา-ขาด

const AVATAR_GRADIENTS = [
  "from-teal-400 to-emerald-400",
  "from-sky-400 to-blue-400",
  "from-violet-400 to-purple-400",
  "from-amber-400 to-orange-400",
  "from-pink-400 to-rose-400",
];

export default function AttendanceTool({
  timetableEntryId, date, students, currentUserId,
  referenceMap, referenceLabel = "โฮมรูม",
}: {
  timetableEntryId: string;
  date: string;
  students: Student[];
  currentUserId?: string;
  referenceMap?: Record<string, ReferenceInfo>;
  referenceLabel?: string;
}) {
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [showNoteCol, setShowNoteCol] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [holidayInfo, setHolidayInfo] = useState<HolidayInfo | null>(null);

  useEffect(() => {
  if (!date) return;
  fetchSingleHoliday(date).then(setHolidayInfo);
}, [date]);

  const loadAttendance = useCallback(async () => {
    if (!timetableEntryId || !date) return;
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/subject-attendance?timetable_entry_id=${timetableEntryId}&attendance_date=${date}`);
      const json = await res.json();
      const map: Record<string, Status> = {};
      const notes: Record<string, string> = {};
      (json.records ?? []).forEach((r: any) => {
        map[r.student_id] = r.status;
        if (r.notes) notes[r.student_id] = r.notes;
      });
      setStatusMap(map);
      setNoteMap(notes);
    } catch {
      // โหลดไม่ได้ ปล่อยว่างให้ครูเช็กใหม่
    } finally {
      setLoading(false);
    }
  }, [timetableEntryId, date]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  function setStatus(studentId: string, status: Status) {
    setStatusMap(prev => ({ ...prev, [studentId]: prev[studentId] === status ? (undefined as any) : status }));
    setSaved(false);
  }
  function setNote(studentId: string, value: string) {
    setNoteMap(prev => ({ ...prev, [studentId]: value }));
  }

  function markAll(status: Status) {
    const map: Record<string, Status> = {};
    students.forEach(s => { map[s.id] = status; });
    setStatusMap(map);
    setSaved(false);
  }

  function pullFromReference() {
    if (!referenceMap) return;
    setStatusMap(prev => {
      const next = { ...prev };
      students.forEach(s => {
        const ref = referenceMap[s.id];
        if (ref && !next[s.id]) next[s.id] = ref.status; // ไม่ทับคนที่เช็กไปแล้ว
      });
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setError("");
    const missing = students.filter(s => !statusMap[s.id]);
    if (missing.length > 0) {
      setError(`ยังไม่ได้เช็กชื่อ ${missing.length} คน กรุณาเลือกสถานะให้ครบทุกคน`);
      return;
    }
    setSaving(true);
    try {
      const records = students.map(s => ({ student_id: s.id, status: statusMap[s.id], note: noteMap[s.id] || undefined }));
      const res = await fetch("/api/subject-attendance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timetable_entry_id: timetableEntryId, attendance_date: date, records, created_by: currentUserId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
    } finally {
      setSaving(false);
    }
  }

  const markedCount = useMemo(() => students.filter(s => statusMap[s.id]).length, [students, statusMap]);
  const summary = students.reduce((acc, s) => {
    const st = statusMap[s.id];
    if (st) acc[st] = (acc[st] ?? 0) + 1;
    return acc;
  }, {} as Record<Status, number>);

  if (loading) {
    return <div className="p-10 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดข้อมูลเช็กชื่อ...</div>;
  }
  if (students.length === 0) {
    return (
      <div className="p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">📭</p>
        <p className="font-bold text-sm">ยังไม่มีนักเรียนเข้าร่วมวิชานี้ ไม่สามารถเช็กชื่อได้</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* หัวการ์ด */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-lg shrink-0">✨</div>
          <div>
            <h2 className="font-black text-slate-800 text-lg leading-none">เช็คชื่อ</h2>
            <p className="text-slate-400 text-xs italic mt-1">ตารางเช็คชื่อสำหรับคาบเรียนนี้</p>
          </div>
        </div>
        <button
          onClick={() => setShowNoteCol(v => !v)}
          className="shrink-0 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-600 font-black text-xs flex items-center gap-1.5 transition-colors"
        >
          📝 {showNoteCol ? "ซ่อนโน้ต" : "เพิ่มโน้ต"}
        </button>
      </div>

      <div className="px-5 mt-4">
        <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500 text-white text-xs font-black">Default</span>
      </div>

      {/* ช่วงเวลา (แสดงผลอย่างเดียว ยังไม่ส่งเข้า API) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-5 mt-4">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1.5">📅 เลือกเวลาเริ่ม</p>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-sky-400 focus:outline-none" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1.5">🕐 เลือกเวลาจบ</p>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-sky-400 focus:outline-none" />
        </div>
      </div>

      {/* ตัวนับ + สรุปยอด + ปุ่มลัด */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-5 mt-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-sky-600 bg-sky-50 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-sky-500" /> {markedCount} / {students.length} marked
          </span>
          {STATUS_ORDER.map(st => (
            <span key={st} className={`px-2.5 py-1 rounded-full text-[11px] font-black ${STATUS_CONFIG[st].chipBg} ${STATUS_CONFIG[st].chipText}`}>
              {STATUS_CONFIG[st].emoji} {STATUS_CONFIG[st].label} {summary[st] ?? 0}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {referenceMap && (
            <button onClick={pullFromReference}
              className="px-3 py-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-black text-xs">
              📥 ดึงจาก{referenceLabel}
            </button>
          )}
          {holidayInfo && (
  <div className="mx-5 mt-3 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600">
    📅 วันนี้เป็นวันหยุด: {holidayInfo.name} — ถ้าไม่มีเรียนชดเชย ไม่ต้องเช็คชื่อ
  </div>
)}
        </div>
      </div>

      {/* ตาราง */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left text-[11px] font-black text-slate-500 tracking-wide px-5 py-3 sticky left-0 bg-slate-50">STUDENT</th>
              {STATUS_ORDER.map(st => (
                <th key={st} className="px-2 py-3">
                  <button
                    type="button"
                    onClick={() => markAll(st)}
                    title={`ตั้งค่าทุกคนเป็น "${STATUS_CONFIG[st].label}"`}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-black ${STATUS_CONFIG[st].chipText} ${STATUS_CONFIG[st].chipBg} px-2.5 py-1 rounded-full hover:brightness-95 active:scale-95 transition-all cursor-pointer`}
                  >
                    <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[st].dot}`} /> {STATUS_CONFIG[st].label}
                  </button>
                </th>
              ))}
              {showNoteCol && <th className="text-left text-[11px] font-black text-slate-500 tracking-wide px-5 py-3">NOTE</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
              const ref = referenceMap?.[s.id];
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-5 py-3 sticky left-0 bg-white align-top">
                    <div className="flex flex-col gap-1 w-max">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} text-white text-sm font-black flex items-center justify-center shrink-0`}>
                          {s.first_name[0]}
                        </div>
                      )}
                      <p className="text-sm font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name} ({s.nickname})</p>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <p className="text-[11px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                        {ref && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${STATUS_CONFIG[ref.status].chipBg} ${STATUS_CONFIG[ref.status].chipText}`}>
                            {referenceLabel}: {STATUS_CONFIG[ref.status].label}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {STATUS_ORDER.map(st => {
                    const active = statusMap[s.id] === st;
                    const cfg = STATUS_CONFIG[st];
                    return (
                      <td key={st} className="text-center px-2 py-3">
                        <button
                          onClick={() => setStatus(s.id, st)}
                          title={cfg.label}
                          className={`w-6 h-6 rounded-full border-2 mx-auto flex items-center justify-center transition-all ${
                            active ? `${cfg.dot} border-transparent ring-4 ${cfg.ring}` : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          {active && <span className="w-2 h-2 rounded-full bg-white" />}
                        </button>
                      </td>
                    );
                  })}

                  {showNoteCol && (
                    <td className="px-5 py-3">
                      <input
                        value={noteMap[s.id] ?? ""}
                        onChange={e => setNote(s.id, e.target.value)}
                        placeholder="เพิ่มโน้ต..."
                        className="w-full min-w-[140px] border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:border-sky-400 focus:outline-none"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-2 mx-5 mt-3">❌ {error}</p>}

      {/* ปุ่มบันทึก */}
      <div className="px-5 py-4 mt-3 border-t border-slate-100">
        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? "⏳ กำลังบันทึก..." : saved ? "✅ บันทึกแล้ว — กดซ้ำเพื่ออัปเดต" : "✏️ บันทึก"}
        </button>
      </div>
    </div>
  );
}