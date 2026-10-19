"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchSingleHoliday, HolidayInfo } from "@/lib/holidays";

const supabase = createClient();

type Status = "present" | "absent" | "late" | "leave" | "excused";

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string; nick_name?: string;
  seat_number: number; avatar_url?: string;
};

type SwapReason = "makeup" | "emergency" | "other";

type ClassReschedule = {
  id: string;
  timetable_entry_id: string;
  original_date: string;
  new_date: string;
  reason: SwapReason;
  reason_note?: string | null;
};

type Period = { timetable_entry_id: string; slot_number?: number; start_time?: string; end_time?: string };

type Col = {
  key: string;            // `${date}|${entryId}` หรือ `${date}|none`
  date: string;
  entryId: string | null;
  slot?: number;
  start?: string;
  end?: string;
  locked: boolean;        // ไม่มีคาบ
};

const STATUS_CONFIG: Record<Status, { label: string; emoji: string; dot: string; ring: string; chipBg: string; chipText: string }> = {
  present: { label: "มา", emoji: "✅", dot: "bg-emerald-500", ring: "ring-emerald-300", chipBg: "bg-emerald-50", chipText: "text-emerald-700" },
  late: { label: "สาย", emoji: "⏰", dot: "bg-amber-500", ring: "ring-amber-300", chipBg: "bg-amber-50", chipText: "text-amber-700" },
  leave: { label: "ลา", emoji: "📄", dot: "bg-violet-500", ring: "ring-violet-300", chipBg: "bg-violet-50", chipText: "text-violet-700" },
  excused: { label: "ไปกิจกรรม", emoji: "🏃", dot: "bg-sky-500", ring: "ring-sky-300", chipBg: "bg-sky-50", chipText: "text-sky-700" },
  absent: { label: "ขาด", emoji: "❌", dot: "bg-red-500", ring: "ring-red-300", chipBg: "bg-red-50", chipText: "text-red-700" },
};
const STATUS_ORDER: Status[] = ["present", "late", "excused", "leave", "absent"]; // มา-สาย-ไปกิจกรรม-ลา-ขาด

const REASON_CONFIG: Record<SwapReason, { label: string; emoji: string }> = {
  makeup: { label: "เรียนชดเชย", emoji: "📚" },
  emergency: { label: "สลับคาบฉุกเฉิน", emoji: "🚨" },
  other: { label: "อื่นๆ", emoji: "📌" },
};

const AVATAR_GRADIENTS = [
  "from-teal-400 to-emerald-400",
  "from-sky-400 to-blue-400",
  "from-violet-400 to-purple-400",
  "from-amber-400 to-orange-400",
  "from-pink-400 to-rose-400",
];

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function formatThaiDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
function weekdayOf(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return WEEKDAY_TH[new Date(y, m - 1, dd).getDay()];
}
function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function cellKey(colKey: string, studentId: string) {
  return `${colKey}#${studentId}`;
}

type MenuState =
  | { type: "cell"; x: number; y: number; colKey: string; studentId: string }
  | { type: "ctx"; x: number; y: number; colKey: string; studentId: string }
  | { type: "head"; x: number; y: number; colKey: string }
  | null;

export default function AttendanceTool({
  sectionId, classroomId, date, students, currentUserId,
  referenceLabel = "โฮมรูม",
  readOnly = false,  
  onDateSwapped,
}: {
  sectionId: string;
  classroomId?: string;
  date: string; // ใช้กำหนดเดือนเริ่มต้นที่แสดง
  students: Student[];
  currentUserId?: string;
  referenceLabel?: string;
  readOnly?: boolean;
  onDateSwapped?: (fromDate: string, toDate: string) => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  const [periodsByDate, setPeriodsByDate] = useState<Record<string, Period[]>>({});
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo | null>>({});
  const [reschedules, setReschedules] = useState<ClassReschedule[]>([]);
  const [homeroom, setHomeroom] = useState<Record<string, Record<string, Status>>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [menu, setMenu] = useState<MenuState>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showNoReferenceWarning, setShowNoReferenceWarning] = useState(false);

  // --- สลับคาบวันเรียน ---
  const [swapCol, setSwapCol] = useState<Col | null>(null);
  const [swapToDate, setSwapToDate] = useState("");
  const [swapReason, setSwapReason] = useState<SwapReason>("makeup");
  const [swapNote, setSwapNote] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState("");

  const reqRef = useRef(0);

  /* ---------------- โหลดข้อมูลทั้งเดือน ---------------- */
  const loadMonth = useCallback(async () => {
    if (!sectionId) return;
    const token = ++reqRef.current;
    setLoading(true);
    setSaved(false);
    setError("");

    const dates = monthDates(month);
    const pByDate: Record<string, Period[]> = {};
    const sMap: Record<string, Status> = {};
    const nMap: Record<string, string> = {};
    const hol: Record<string, HolidayInfo | null> = {};
    const resMap = new Map<string, ClassReschedule>();

    async function loadAttendance(d: string, p: Period) {
      const colKey = `${d}|${p.timetable_entry_id}`;
      try {
        const res = await fetch(`/api/subject-attendance?timetable_entry_id=${p.timetable_entry_id}&attendance_date=${d}`);
        const json = await res.json();
        (json.records ?? []).forEach((r: any) => {
          const k = cellKey(colKey, r.student_id);
          sMap[k] = r.status;
          if (r.notes) nMap[k] = r.notes;
        });
      } catch { /* ปล่อยว่าง */ }
    }
    const holidayJob = Promise.all(
  dates.map(async d => {
    try { hol[d] = await fetchSingleHoliday(d); } catch { hol[d] = null; }
  })
);

    // เฟส 1: คาบของแต่ละวัน + เช็กชื่อเดิม + การสลับคาบ + วันหยุด
    await Promise.all(dates.map(async d => {
      try {
        const res = await fetch(`/api/timetable/periods?subject_section_id=${sectionId}&attendance_date=${d}`);
        const json = await res.json();
        const list: Period[] = json.periods ?? [];
        pByDate[d] = list;
        if (list.length === 0) return;
        await Promise.all([
          ...list.map(async p => {
            await Promise.all([
              loadAttendance(d, p),
              (async () => {
                try {
                  const rr = await fetch(`/api/subject-attendance/swap-date?timetable_entry_id=${p.timetable_entry_id}&date=${d}`);
                  const rj = await rr.json();
                  (rj.reschedules ?? []).forEach((x: ClassReschedule) => resMap.set(x.id, x));
                } catch { /* ข้าม */ }
              })(),
            ]);
          }),
        ]);
      } catch {
        pByDate[d] = [];
      }
    }));

    // เฟส 2: วันใหม่ที่ถูกสลับคาบเข้ามา (เผื่อ API คาบไม่ได้ส่งมาให้)
    const extra: { d: string; p: Period }[] = [];
    resMap.forEach(r => {
      if (!r.new_date.startsWith(month)) return;
      const list = pByDate[r.new_date] ?? (pByDate[r.new_date] = []);
      if (list.some(p => p.timetable_entry_id === r.timetable_entry_id)) return;
      const src = (pByDate[r.original_date] ?? []).find(p => p.timetable_entry_id === r.timetable_entry_id);
      const np: Period = { ...(src ?? { timetable_entry_id: r.timetable_entry_id }) };
      list.push(np);
      extra.push({ d: r.new_date, p: np });
    });
    await Promise.all(extra.map(async ({ d, p }) => {
      await loadAttendance(d, p);
    }));
    await holidayJob;
    Object.values(pByDate).forEach(l => l.sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0)));

    // โฮมรูมทั้งเดือน (สำหรับปุ่มดึงจากโฮมรูม)
    const hr: Record<string, Record<string, Status>> = {};
    if (classroomId) {
      try {
        const { data } = await supabase
          .from("attendance_records")
          .select("student_id, status, attendance_date")
          .eq("classroom_id", classroomId)
          .gte("attendance_date", dates[0])
          .lte("attendance_date", dates[dates.length - 1]);
        (data ?? []).forEach((r: any) => {
          (hr[r.attendance_date] ??= {})[r.student_id] = r.status;
        });
      } catch { /* ข้าม */ }
    }

    if (token !== reqRef.current) return; // มีการโหลดใหม่ทับแล้ว
    setPeriodsByDate(pByDate);
    setStatusMap(sMap);
    setNoteMap(nMap);
    setHolidays(hol);
    setReschedules(Array.from(resMap.values()));
    setHomeroom(hr);
    setDirty(new Set());
    setLoading(false);
  }, [sectionId, classroomId, month]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  /* ---------------- คอลัมน์ ---------------- */
  const cols: Col[] = useMemo(() => {
    return monthDates(month).flatMap(d => {
      const list = periodsByDate[d] ?? [];
      if (list.length === 0) {
        return [{ key: `${d}|none`, date: d, entryId: null, locked: true } as Col];
      }
      return list.map(p => ({
        key: `${d}|${p.timetable_entry_id}`,
        date: d,
        entryId: p.timetable_entry_id,
        slot: p.slot_number,
        start: p.start_time,
        end: p.end_time,
        locked: false,
      } as Col));
    });
  }, [month, periodsByDate]);

  const movedAwayOf = useCallback(
    (c: Col) => (c.entryId ? reschedules.find(r => r.original_date === c.date && r.timetable_entry_id === c.entryId) : undefined),
    [reschedules]
  );
  const movedInOf = useCallback(
    (c: Col) => (c.entryId ? reschedules.find(r => r.new_date === c.date && r.timetable_entry_id === c.entryId) : undefined),
    [reschedules]
  );
  const isHolidayCol = useCallback(
  (c: Col) => !!holidays[c.date] && !movedInOf(c), // มีเรียนชดเชยเข้ามา = ไม่ล็อก
  [holidays, movedInOf]
);
const isLocked = useCallback(
  (c: Col) => c.locked || !!movedAwayOf(c) || isHolidayCol(c),
  [movedAwayOf, isHolidayCol]
);

  const colByKey = useMemo(() => new Map(cols.map(c => [c.key, c])), [cols]);

  /* ---------------- แก้ไขช่อง ---------------- */
  function markDirty(colKey: string) {
    setDirty(prev => { const n = new Set(prev); n.add(colKey); return n; });
    setSaved(false);
  }
  function setCell(colKey: string, studentId: string, status: Status | undefined) {
    const k = cellKey(colKey, studentId);
    setStatusMap(prev => {
      const next = { ...prev };
      if (status) next[k] = status; else delete next[k];
      return next;
    });
    markDirty(colKey);
  }
  function setCellNote(colKey: string, studentId: string, text: string) {
    const k = cellKey(colKey, studentId);
    setNoteMap(prev => {
      const next = { ...prev };
      if (text.trim()) next[k] = text.trim(); else delete next[k];
      return next;
    });
    markDirty(colKey);
  }
  function markColumn(colKey: string, status: Status) {
    setStatusMap(prev => {
      const next = { ...prev };
      students.forEach(s => { next[cellKey(colKey, s.id)] = status; });
      return next;
    });
    markDirty(colKey);
  }
  function clearColumn(colKey: string) {
    setStatusMap(prev => {
      const next = { ...prev };
      students.forEach(s => { delete next[cellKey(colKey, s.id)]; });
      return next;
    });
    markDirty(colKey);
  }
  function pullFromReference(col: Col) {
    const ref = homeroom[col.date];
    const hasAny = !!ref && students.some(s => ref[s.id]);
    if (!hasAny) { setShowNoReferenceWarning(true); return; }
    setStatusMap(prev => {
      const next = { ...prev };
      students.forEach(s => {
        const r = ref[s.id];
        const k = cellKey(col.key, s.id);
        if (r && !next[k]) next[k] = r === "late" ? "present" : r; // โฮมรูมสาย = มา
      });
      return next;
    });
    markDirty(col.key);
  }

  /* ---------------- บันทึก ---------------- */
  async function handleSave() {
    if (readOnly) return; 
    setError("");
    const targets = cols.filter(c => dirty.has(c.key) && !isLocked(c) && c.entryId);
    if (targets.length === 0) return;

    for (const c of targets) {
      const missing = students.filter(s => !statusMap[cellKey(c.key, s.id)]);
      if (missing.length > 0) {
        setError(`วันที่ ${formatThaiDate(c.date)}${c.slot ? ` คาบ ${c.slot}` : ""}: ยังไม่ได้เช็กชื่อ ${missing.length} คน กรุณาเลือกสถานะให้ครบทุกคน`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const c of targets) {
        const records = students.map(s => ({
          student_id: s.id,
          status: statusMap[cellKey(c.key, s.id)],
          note: noteMap[cellKey(c.key, s.id)] || undefined,
        }));
        const res = await fetch("/api/subject-attendance", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timetable_entry_id: c.entryId, attendance_date: c.date, records, created_by: currentUserId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      }
      setDirty(new Set());
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- สลับคาบ ---------------- */
  function openSwap(col: Col) {
    setSwapCol(col);
    setSwapToDate("");
    setSwapNote("");
    setSwapReason("makeup");
    setSwapError("");
  }
  function closeSwap() {
    setSwapCol(null);
    setSwapToDate("");
    setSwapNote("");
    setSwapError("");
  }

  async function handleSwapDate() {
    if (readOnly) return;  
    if (!swapCol?.entryId) return;
    setSwapError("");
    if (!swapToDate) { setSwapError("กรุณาเลือกวันที่ใหม่"); return; }
    if (swapToDate === swapCol.date) { setSwapError("วันที่ใหม่ต้องไม่ตรงกับวันเดิม"); return; }
    setSwapping(true);
    try {
      const res = await fetch("/api/subject-attendance/swap-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timetable_entry_id: swapCol.entryId,
          from_date: swapCol.date,
          to_date: swapToDate,
          reason: swapReason,
          reason_note: swapNote || undefined,
          created_by: currentUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "สลับวันไม่สำเร็จ");
      const from = swapCol.date;
      // ถ้าวันใหม่อยู่คนละเดือน ให้ข้ามไปดูเดือนนั้น
      if (swapToDate.slice(0, 7) !== month) setMonth(swapToDate.slice(0, 7));
      else await loadMonth();
      onDateSwapped?.(from, swapToDate);
      closeSwap();
    } catch (err: any) {
      setSwapError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
    } finally {
      setSwapping(false);
    }
  }

  async function handleCancelReschedule(id: string) {
    if (readOnly) return; 
    try {
      await fetch(`/api/subject-attendance/swap-date?id=${id}`, { method: "DELETE" });
      await loadMonth();
    } catch { /* ผู้ใช้กดใหม่ได้ */ }
  }

  function changeMonth(delta: number) {
    if (dirty.size > 0 && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการเปลี่ยนเดือนและทิ้งการแก้ไขหรือไม่?")) return;
    setMonth(m => shiftMonth(m, delta));
  }

  /* ---------------- เมนู popover ---------------- */
  function openMenu(e: React.MouseEvent, m: Omit<NonNullable<MenuState>, "x" | "y">) {
    e.preventDefault(); 
    if (readOnly) return; 
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    if (m.type === "ctx") setNoteDraft(noteMap[cellKey(m.colKey, (m as any).studentId)] ?? "");
    setMenu({ ...(m as any), x, y });
  }

  const summaryByCol = useMemo(() => {
    const out: Record<string, number> = {};
    cols.forEach(c => {
      if (c.locked) return;
      out[c.key] = students.filter(s => statusMap[cellKey(c.key, s.id)] === "present").length;
    });
    return out;
  }, [cols, students, statusMap]);

  const monthReschedules = reschedules.filter(r => r.original_date.startsWith(month) || r.new_date.startsWith(month));
  const activeCols = cols.filter(c => !c.locked);
  const todayStr = new Date().toISOString().slice(0, 10);

  if (students.length === 0) {
    return (
      <div className="p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">📭</p>
        <p className="font-bold text-m">ยังไม่มีนักเรียนเข้าร่วมวิชานี้ ไม่สามารถเช็กชื่อได้</p>
      </div>
    );
  }

  const menuCol = menu ? colByKey.get(menu.colKey) : undefined;
  const menuStudent = menu && menu.type !== "head" ? students.find(s => s.id === menu.studentId) : undefined;

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* หัวการ์ด + เลือกเดือน */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-xl shrink-0">✨</div>
          <div>
            <h2 className="font-black text-slate-800 text-xl leading-none">เช็คชื่อ</h2>
            <p className="text-slate-400 text-m italic mt-1">
              คลิกช่อง = เลือกสถานะ · คลิกขวา = รีเซ็ต/โน้ต · คลิกหัววัน = ตั้งทั้งคอลัมน์
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-black text-slate-600">‹</button>
          <span className="min-w-[150px] text-center font-black text-slate-800 text-base">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-black text-slate-600">›</button>
          <button
            onClick={() => {
  const cur = todayStr.slice(0, 7);
  if (cur === month) return;
  if (dirty.size > 0 && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่?")) return;
  setMonth(cur);
}}
            className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 font-black text-m"
          >
            เดือนนี้
          </button>
        </div>
      </div>

      {/* คำอธิบายสี */}
      <div className="flex items-center gap-2 flex-wrap px-5 mt-3">
        {STATUS_ORDER.map(st => (
          <span key={st} className={`px-2.5 py-1 rounded-full text-m font-black ${STATUS_CONFIG[st].chipBg} ${STATUS_CONFIG[st].chipText}`}>
            {STATUS_CONFIG[st].emoji} {STATUS_CONFIG[st].label}
          </span>
        ))}
        <span className="px-2.5 py-1 rounded-full text-m font-black bg-slate-200 text-slate-500">⬜ ไม่มีคาบ (ล็อก)</span>
        <span className="px-2.5 py-1 rounded-full text-m font-black bg-indigo-50 text-indigo-600">🔄 สลับคาบ</span>
      </div>

      {/* แผงสลับคาบวันเรียน */}
      {swapCol && (
        <div className="mx-5 mt-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-m font-black text-indigo-700 mb-2">🔄 สลับคาบวันเรียน (เรียนชดเชย / สลับคาบฉุกเฉิน)</p>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-m font-bold text-slate-500">จาก</span>
              <span className="px-2.5 py-1 rounded-lg bg-white border-2 border-slate-200 text-m font-black text-slate-700">
                {formatThaiDate(swapCol.date)}{swapCol.slot ? ` · คาบ ${swapCol.slot}` : ""}
              </span>
            </div>
            <span className="text-slate-400 font-black">→</span>
            <div className="flex items-center gap-1.5">
              <span className="text-m font-bold text-slate-500">เป็น</span>
              <input
                type="date" value={swapToDate} onChange={e => setSwapToDate(e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-m font-bold focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="mb-3">
            <p className="text-m font-bold text-slate-500 mb-1.5">เหตุผล</p>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(REASON_CONFIG) as SwapReason[]).map(r => (
                <button
                  key={r} type="button" onClick={() => setSwapReason(r)}
                  className={`px-3 py-1.5 rounded-xl text-m font-black border-2 transition-colors ${
                    swapReason === r ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300"
                  }`}
                >
                  {REASON_CONFIG[r].emoji} {REASON_CONFIG[r].label}
                </button>
              ))}
            </div>
          </div>
          <input
            value={swapNote} onChange={e => setSwapNote(e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี) เช่น เหตุผลของการสลับคาบ"
            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-m font-bold focus:border-indigo-400 focus:outline-none mb-3"
          />
          <div className="flex gap-2">
            <button onClick={handleSwapDate} disabled={swapping}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-m disabled:opacity-50">
              {swapping ? "⏳ กำลังสลับ..." : "✅ ยืนยันสลับวัน"}
            </button>
            <button onClick={closeSwap} className="px-3 py-1.5 rounded-xl border-2 border-slate-200 text-slate-500 font-black text-m">
              ยกเลิก
            </button>
          </div>
          {swapError && <p className="text-red-600 text-m font-bold mt-2">❌ {swapError}</p>}
        </div>
      )}

      {/* รายการสลับคาบของเดือนนี้ */}
      {monthReschedules.length > 0 && (
        <div className="mx-5 mt-3 space-y-1.5">
          {monthReschedules.map(r => (
            <div key={r.id} className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-2 text-m font-bold text-indigo-600 flex items-center justify-between gap-2 flex-wrap">
              <span>
                {REASON_CONFIG[r.reason].emoji} {REASON_CONFIG[r.reason].label}: {formatThaiDate(r.original_date)} → {formatThaiDate(r.new_date)}
                {r.reason_note ? ` (${r.reason_note})` : ""}
              </span>
              {!readOnly && (
              <button onClick={() => handleCancelReschedule(r.id)}
                className="px-2.5 py-1 rounded-lg border-2 border-indigo-200 text-indigo-500 font-black text-m shrink-0">
                ยกเลิกการสลับ
              </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ตารางรายเดือน */}
      {loading ? (
        <div className="p-10 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดข้อมูลเช็กชื่อทั้งเดือน...</div>
      ) : (
        <>
          {activeCols.length === 0 && (
            <p className="mx-5 mt-4 rounded-xl bg-slate-50 border-2 border-slate-100 px-4 py-3 text-m font-bold text-slate-500 text-center">
              🗓️ เดือนนี้ไม่มีคาบเรียนวิชานี้ตามตารางสอน — ถ้ามีเรียนชดเชย ให้ไปเดือนที่มีคาบเดิมแล้วกดหัววัน → "🔄 สลับคาบ"
            </p>
          )}

          <div className="mt-4 overflow-auto max-h-[70vh] border-t border-slate-100">
            <table className="border-separate border-spacing-0 w-max min-w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 text-left text-m font-black text-slate-500 px-4 py-2 min-w-[220px] border-b border-r border-slate-200">
                    นักเรียน
                  </th>
                  {cols.map(c => {
  const away = movedAwayOf(c);
  const into = movedInOf(c);
  const hol = holidays[c.date];
  const holCol = isHolidayCol(c);
  const isToday = c.date === todayStr;
  const weekend = ["อา", "ส"].includes(weekdayOf(c.date));
  return (
    <th
      key={c.key}
      className={`sticky top-0 z-20 border-b border-r border-slate-200 p-0 ${
        holCol ? "bg-rose-100" : c.locked ? "bg-slate-200" : away ? "bg-indigo-100" : "bg-slate-50"
      }`}
    >
      {holCol || c.locked ? (
        <div className={`px-1 py-2 min-w-[40px] text-center ${holCol ? "text-rose-600" : weekend ? "text-slate-400" : "text-slate-500"}`}>
          <p className="text-m font-black leading-none">{Number(c.date.slice(8))}</p>
          <p className="text-[12px] font-bold leading-none mt-1">{weekdayOf(c.date)}</p>
          {holCol && <p className="text-[11px] leading-none mt-1">📅</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={e => !away && openMenu(e, { type: "head", colKey: c.key } as any)}
          onContextMenu={e => !away && openMenu(e, { type: "head", colKey: c.key } as any)}
          title={hol ? `วันหยุด: ${hol.name} (มีเรียนชดเชย)` : away ? "คาบนี้ถูกย้ายไปวันอื่น" : "คลิกเพื่อตั้งสถานะทั้งคอลัมน์"}
          className={`w-full min-w-[48px] px-1 py-2 text-center transition-colors ${
            away ? "cursor-default" : "hover:bg-sky-100"
          } ${isToday ? "bg-sky-100" : ""}`}
        >
          <p className="text-m font-black text-slate-800 leading-none">{Number(c.date.slice(8))}</p>
          <p className="text-[12px] font-bold text-slate-500 leading-none mt-1">
            {weekdayOf(c.date)}{c.slot ? ` · ค.${c.slot}` : ""}
          </p>
          <p className="text-[11px] leading-none mt-1">
            {away ? "🔄➡" : into ? "🔄⬅" : dirty.has(c.key) ? "●" : "▾"}
          </p>
        </button>
      )}
    </th>
  );
})}
                </tr>
              </thead>

              <tbody>
                {students.map((s, i) => {
                  const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-100 px-4 py-2">
                        <div className="flex items-center gap-2 w-max">
                          {s.avatar_url ? (
                            <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} text-white text-m font-black flex items-center justify-center shrink-0`}>
                              {s.first_name[0]}
                            </div>
                          )}
                          <div>
                            <p className="text-m font-black text-slate-700 whitespace-nowrap leading-tight">
                              {s.prefix}{s.first_name} {s.last_name}{s.nick_name ? ` (${s.nick_name})` : ""}
                            </p>
                            <p className="text-[12px] text-slate-400 font-bold leading-tight">เลขที่ {s.seat_number}</p>
                          </div>
                        </div>
                      </td>

                      {cols.map(c => {
                        if (isHolidayCol(c)) {
  if (i > 0) return null; // รวมช่องทั้งคอลัมน์ไว้ที่แถวแรกแถวเดียว
  const h = holidays[c.date]!;
  return (
    <td
      key={c.key}
      rowSpan={students.length}
      className="border-b border-r border-rose-200 bg-rose-100 p-0 align-top"
    >
      <div
  className="sticky top-16 mx-auto py-3 text-rose-600 font-black text-m whitespace-nowrap text-center"
  style={{ writingMode: "vertical-rl", textOrientation: "sideways" }}
>
  📅 วันหยุด {h.name}
</div>
    </td>
  );
}
                        const locked = isLocked(c);
                        if (locked) {
                          return (
                            <td
                              key={c.key}
                              className={`border-b border-r border-slate-100 ${c.locked ? "bg-slate-200/80" : "bg-indigo-100/60"} cursor-not-allowed`}
                              title={c.locked ? "ไม่มีคาบเรียน" : "คาบนี้ถูกย้ายไปวันอื่น"}
                            />
                          );
                        }
                        const k = cellKey(c.key, s.id);
                        const st = statusMap[k];
                        const note = noteMap[k];
                        const cfg = st ? STATUS_CONFIG[st] : null;
                        const menuOpenHere = menu && menu.type !== "head" && menu.colKey === c.key && menu.studentId === s.id;
                        return (
                          <td key={c.key} className="border-b border-r border-slate-100 p-0.5 text-center">
                            <button
                              type="button"
                              onClick={e => openMenu(e, { type: "cell", colKey: c.key, studentId: s.id } as any)}
                              onContextMenu={e => openMenu(e, { type: "ctx", colKey: c.key, studentId: s.id } as any)}
                              title={note ? `โน้ต: ${note}` : cfg?.label ?? "ยังไม่ได้เช็ก"}
                              className={`relative w-10 h-9 rounded-lg text-base flex items-center justify-center mx-auto transition-all ${
                                cfg ? `${cfg.chipBg}` : "bg-white border border-dashed border-slate-200 hover:border-sky-300"
                              } ${menuOpenHere ? "ring-2 ring-sky-400" : ""}`}
                            >
                              {cfg ? cfg.emoji : ""}
                              {note && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200 px-4 py-2 text-m font-black text-slate-500">
                    มาเรียน (คน)
                  </td>
                  {cols.map(c => (
  <td
    key={c.key}
    className={`border-r border-slate-100 text-center text-m font-black ${
      isHolidayCol(c) ? "bg-rose-100" : isLocked(c) ? "bg-slate-200/80" : "bg-slate-50 text-emerald-600"
    }`}
  >
    {isLocked(c) ? "" : summaryByCol[c.key] ?? 0}
  </td>
))}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {error && <p className="text-red-600 text-m font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-2 mx-5 mt-3">❌ {error}</p>}

            {/* ปุ่มบันทึก */}
      <div className="px-5 py-4 mt-3 border-t border-slate-100">
        {readOnly ? (
          <p className="text-center text-slate-500 font-black text-m">
            🔒 วิชานี้เก็บเข้าคลังแล้ว ดูข้อมูลได้อย่างเดียว
          </p>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving || loading || (dirty.size === 0 && !saved)}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-m disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? "⏳ กำลังบันทึก..."
              : dirty.size > 0
                ? `✏️ บันทึก (${dirty.size} คาบที่แก้ไข)`
                : saved
                  ? "✅ บันทึกแล้ว"
                  : "ยังไม่มีการแก้ไข"}
          </button>
        )}
      </div>

      {/* ---------------- เมนูลอย (คลิกซ้าย / คลิกขวา / หัวคอลัมน์) ---------------- */}
      {menu && menuCol && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setMenu(null)}
            onContextMenu={e => { e.preventDefault(); setMenu(null); }}
          />
          <div
            className="fixed z-[100] w-56 bg-white rounded-2xl border border-slate-200 shadow-2xl p-2"
            style={{ left: menu.x, top: menu.y }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
          >
            {/* คลิกซ้ายที่ช่อง: เลือกสถานะ */}
            {menu.type === "cell" && menuStudent && (
              <>
                <p className="px-2 pb-1 text-[13px] font-black text-slate-500 truncate">
                  {menuStudent.first_name} · {formatThaiDate(menuCol.date)}
                </p>
                <div className="space-y-1">
                  {STATUS_ORDER.map(st => {
                    const active = statusMap[cellKey(menu.colKey, menu.studentId)] === st;
                    return (
                      <button
                        key={st}
                        onClick={() => { setCell(menu.colKey, menu.studentId, st); setMenu(null); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-m font-black ${STATUS_CONFIG[st].chipBg} ${STATUS_CONFIG[st].chipText} ${active ? "ring-2 ring-current" : "hover:brightness-95"}`}
                      >
                        <span>{STATUS_CONFIG[st].emoji}</span>{STATUS_CONFIG[st].label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* คลิกขวาที่ช่อง: รีเซ็ต / โน้ต */}
            {menu.type === "ctx" && menuStudent && (
              <>
                <p className="px-2 pb-1 text-[13px] font-black text-slate-500 truncate">
                  {menuStudent.first_name} · {formatThaiDate(menuCol.date)}
                </p>
                <div className="px-1 pb-2">
                  <textarea
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    rows={2}
                    placeholder="พิมพ์โน้ตข้อความ..."
                    className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 text-m font-bold focus:border-amber-400 focus:outline-none resize-none"
                  />
                  <button
                    onClick={() => { setCellNote(menu.colKey, menu.studentId, noteDraft); setMenu(null); }}
                    className="w-full mt-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-m"
                  >
                    📝 บันทึกโน้ต
                  </button>
                </div>
                <div className="space-y-1 border-t border-slate-100 pt-2">
                  <button
                    onClick={() => { setCellNote(menu.colKey, menu.studentId, ""); setMenu(null); }}
                    disabled={!noteMap[cellKey(menu.colKey, menu.studentId)]}
                    className="w-full text-left px-3 py-2 rounded-xl text-m font-black text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    🗑 ลบโน้ต
                  </button>
                  <button
                    onClick={() => { setCell(menu.colKey, menu.studentId, undefined); setMenu(null); }}
                    disabled={!statusMap[cellKey(menu.colKey, menu.studentId)]}
                    className="w-full text-left px-3 py-2 rounded-xl text-m font-black text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  >
                    ↺ ล้างสถานะ (รีเซ็ตช่องนี้)
                  </button>
                </div>
              </>
            )}

            {/* คลิกหัววัน: ตั้งทั้งคอลัมน์ */}
            {menu.type === "head" && (
              <>
                <p className="px-2 pb-1 text-[13px] font-black text-slate-500">
                  ทุกคน · {formatThaiDate(menuCol.date)}{menuCol.slot ? ` · คาบ ${menuCol.slot}` : ""}
                </p>
                {holidays[menuCol.date] && (
                  <p className="mx-1 mb-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-[13px] font-bold">
                    📅 วันหยุด: {holidays[menuCol.date]!.name}
                  </p>
                )}
                <div className="space-y-1">
                  {STATUS_ORDER.map(st => (
                    <button
                      key={st}
                      onClick={() => { markColumn(menu.colKey, st); setMenu(null); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-m font-black ${STATUS_CONFIG[st].chipBg} ${STATUS_CONFIG[st].chipText} hover:brightness-95`}
                    >
                      <span>{STATUS_CONFIG[st].emoji}</span>ทุกคน: {STATUS_CONFIG[st].label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1 border-t border-slate-100 mt-2 pt-2">
                  {classroomId && (
                    <button
                      onClick={() => { pullFromReference(menuCol); setMenu(null); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-m font-black text-blue-700 bg-blue-50 hover:bg-blue-100"
                    >
                      📥 ดึงจาก{referenceLabel}
                    </button>
                  )}
                  <button
                    onClick={() => { openSwap(menuCol); setMenu(null); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-m font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  >
                    🔄 สลับคาบวันเรียน
                  </button>
                  <button
                    onClick={() => { clearColumn(menu.colKey); setMenu(null); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-m font-black text-rose-600 hover:bg-rose-50"
                  >
                    ↺ ล้างทั้งคอลัมน์
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showNoReferenceWarning && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <p className="text-3xl mb-2">⚠️</p>
            <p className="font-black text-slate-800 text-lg mb-1">ยังไม่มีข้อมูลจากโฮมรูม</p>
            <p className="text-slate-500 text-m font-bold mb-5">
              ครูประจำชั้นยังไม่ได้เช็กชื่อคาบโฮมรูมของวันนี้ กรุณาเช็กชื่อคาบนี้ด้วยตนเอง หรือรอครูประจำชั้นเช็กชื่อก่อน
            </p>
            <button
              onClick={() => setShowNoReferenceWarning(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-m"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}