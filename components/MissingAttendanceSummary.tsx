// components/MissingAttendanceSummary.tsx
//
// สรุปห้องเรียนที่ยังไม่เช็คชื่อ
//   1) รายวัน  : ห้องไหนยังไม่เช็คชื่อ / เช็คไม่ครบ ในวันที่เลือก
//   2) รายเดือน: (ก) แยกตามวันที่ — วันไหนมีห้องไหนไม่ได้เช็คบ้าง
//                (ข) แยกตามห้อง  — ห้องไหนไม่ได้เช็ควันที่เท่าไหร่บ้าง
//
// หลักการนับ "วันเรียน" ของรายเดือน:
//   - ตัดเสาร์-อาทิตย์ และวันหยุด (จาก fetchHolidayMap) ออก
//   - ไม่นับวันนี้และอนาคต (วันนี้ครูอาจยังเช็คไม่เสร็จ)
//   - วันที่ "ทั้งโรงเรียนไม่มีการเช็คชื่อเลย" ถือว่าน่าจะเป็นวันหยุดที่ยังไม่ได้ตั้งค่า
//     จึงแยกแสดงต่างหากและไม่นับเป็นความผิดของห้อง (มีสวิตช์ให้เลือกนับได้)
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchHolidayMap, isHoliday } from "@/lib/holidays";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

const supabase = createClient();

type Classroom = { classroom_id: string; room_name: string };
type Student = { id: string; classroom_id: string };

type Props = {
  /** ห้องเรียนทั้งหมด — เรียงลำดับมาจากหน้าหลักแล้ว (อนุบาล -> ประถม -> มัธยม) */
  classrooms: Classroom[];
  students: Student[];
  /** วันที่ที่เลือกในหน้าหลัก (YYYY-MM-DD) ใช้กับสรุปรายวัน */
  date: string;
};

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function todayISO() {
  const n = new Date();
  return toISO(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

// วนดึงทีละ 1,000 แถว (ข้อจำกัดของ PostgREST) — เรียงให้คงที่เพื่อไม่ให้แถวซ้ำ/หายระหว่างหน้า
async function fetchAllPages<T>(select: string, apply: (q: any) => any): Promise<{ data: T[] | null; error: any }> {
  const size = 1000;
  let from = 0;
  let all: T[] = [];
  while (true) {
    const q = apply(supabase.from("attendance_records").select(select))
      .order("attendance_date")
      .order("student_id")
      .range(from, from + size - 1);
    const { data, error } = await q;
    if (error) return { data: null, error };
    all = all.concat((data ?? []) as T[]);
    if (!data || data.length < size) break;
    from += size;
  }
  return { data: all, error: null };
}

function Chip({ children, tone = "rose" }: { children: React.ReactNode; tone?: "rose" | "amber" | "slate" }) {
  const cls = {
    rose: "bg-rose-50 text-rose-600 ring-rose-200",
    amber: "bg-amber-50 text-amber-600 ring-amber-200",
    slate: "bg-slate-50 text-slate-500 ring-slate-200",
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>{children}</span>;
}

export default function MissingAttendanceSummary({ classrooms, students, date }: Props) {
  /* ---------------------------- สรุปรายวัน ---------------------------- */
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState("");
  const [recordedByRoom, setRecordedByRoom] = useState<Map<string, number>>(new Map());
  const [dayNote, setDayNote] = useState("");

  const studentCount = useMemo(() => {
    const m = new Map<string, number>();
    students.forEach((s) => m.set(s.classroom_id, (m.get(s.classroom_id) ?? 0) + 1));
    return m;
  }, [students]);

  useEffect(() => {
    let cancelled = false;
    setDayLoading(true);
    setDayError("");
    (async () => {
      const [res, holidays] = await Promise.all([
        fetchAllPages<{ student_id: string; classroom_id: string }>("student_id, classroom_id", (q) =>
          q.eq("attendance_date", date)
        ),
        fetchHolidayMap(date, date),
      ]);
      if (cancelled) return;
      if (res.error) {
        console.error(res.error);
        setDayError("โหลดข้อมูลสรุปห้องที่ยังไม่เช็คชื่อไม่สำเร็จ");
        setDayLoading(false);
        return;
      }
      // นับจำนวน นร. ที่ถูกเช็คแล้วต่อห้อง (กันซ้ำด้วย student_id)
      const seen = new Set<string>();
      const m = new Map<string, number>();
      (res.data ?? []).forEach((r) => {
        if (seen.has(r.student_id)) return;
        seen.add(r.student_id);
        m.set(r.classroom_id, (m.get(r.classroom_id) ?? 0) + 1);
      });
      setRecordedByRoom(m);

      const dow = new Date(date + "T00:00:00").getDay();
      const h = isHoliday(date, holidays);
      setDayNote(h ? `วันหยุด: ${h.name}` : dow === 0 || dow === 6 ? "วันเสาร์-อาทิตย์" : "");
      setDayLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date]);

  const dayRows = useMemo(() => {
    const rooms = classrooms.filter((c) => (studentCount.get(c.classroom_id) ?? 0) > 0);
    const none: { room: Classroom; total: number }[] = [];
    const partial: { room: Classroom; total: number; done: number }[] = [];
    rooms.forEach((room) => {
      const total = studentCount.get(room.classroom_id) ?? 0;
      const done = recordedByRoom.get(room.classroom_id) ?? 0;
      if (done === 0) none.push({ room, total });
      else if (done < total) partial.push({ room, total, done });
    });
    return { none, partial, roomCount: rooms.length };
  }, [classrooms, studentCount, recordedByRoom]);

  /* ---------------------------- สรุปรายเดือน ---------------------------- */
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthView, setMonthView] = useState<"date" | "room">("date");
  const [countSchoolWide, setCountSchoolWide] = useState(false);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState("");
  const [checked, setChecked] = useState<Map<string, Set<string>>>(new Map()); // date -> ห้องที่เช็คแล้ว
  const [schoolDays, setSchoolDays] = useState<string[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMonthLoading(true);
    setMonthError("");
    setOpenKey(null);
    (async () => {
      const last = new Date(year, month, 0).getDate();
      const start = toISO(year, month, 1);
      const end = toISO(year, month, last);
      const [res, holidays] = await Promise.all([
        fetchAllPages<{ classroom_id: string; attendance_date: string }>("classroom_id, attendance_date", (q) =>
          q.gte("attendance_date", start).lte("attendance_date", end)
        ),
        fetchHolidayMap(start, end),
      ]);
      if (cancelled) return;
      if (res.error) {
        console.error(res.error);
        setMonthError("โหลดข้อมูลสรุปรายเดือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setMonthLoading(false);
        return;
      }

      const map = new Map<string, Set<string>>();
      (res.data ?? []).forEach((r) => {
        const s = map.get(r.attendance_date) ?? new Set<string>();
        s.add(r.classroom_id);
        map.set(r.attendance_date, s);
      });

      const today = todayISO();
      const days: string[] = [];
      for (let d = 1; d <= last; d++) {
        const iso = toISO(year, month, d);
        if (iso >= today) break; // ไม่นับวันนี้และอนาคต
        const dow = new Date(year, month - 1, d).getDay();
        if (dow === 0 || dow === 6) continue;
        if (isHoliday(iso, holidays)) continue;
        days.push(iso);
      }
      setChecked(map);
      setSchoolDays(days);
      setMonthLoading(false);
    })();
    return () => { cancelled = true; };
  }, [month, year]);

  const activeRooms = useMemo(
    () => classrooms.filter((c) => (studentCount.get(c.classroom_id) ?? 0) > 0),
    [classrooms, studentCount]
  );

  const monthly = useMemo(() => {
    const schoolWideEmpty: string[] = [];
    const byDate: { date: string; rooms: Classroom[] }[] = [];
    const byRoom = new Map<string, string[]>(); // classroom_id -> dates
    activeRooms.forEach((r) => byRoom.set(r.classroom_id, []));

    schoolDays.forEach((d) => {
      const done = checked.get(d);
      if (!done || done.size === 0) {
        schoolWideEmpty.push(d);
        if (!countSchoolWide) return;
      }
      const missing = activeRooms.filter((r) => !done?.has(r.classroom_id));
      if (missing.length > 0) {
        byDate.push({ date: d, rooms: missing });
        missing.forEach((r) => byRoom.get(r.classroom_id)?.push(d));
      }
    });

    const roomRows = activeRooms
      .map((r) => ({ room: r, dates: byRoom.get(r.classroom_id) ?? [] }))
      .filter((x) => x.dates.length > 0);
    return { schoolWideEmpty, byDate, roomRows };
  }, [schoolDays, checked, activeRooms, countSchoolWide]);

  const dayNum = (iso: string) => String(Number(iso.slice(8, 10)));
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);
  const selectCls = "rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600";

  return (
    <div className="mt-8 space-y-6">
      {/* ------------------------- รายวัน ------------------------- */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-base font-black text-slate-800">ห้องที่ยังไม่เช็คชื่อ (วันที่เลือก)</h2>
        {dayNote && (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
            {dayNote} — ไม่ต้องเช็คชื่อ
          </p>
        )}

        {dayLoading ? (
          <p className="mt-4 flex items-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังโหลด...
          </p>
        ) : dayNote ? null /* วันหยุด/เสาร์-อาทิตย์: ไม่แสดงจำนวนห้องที่ไม่ได้เช็ค */ : dayError ? (
          <p className="mt-4 text-sm font-semibold text-rose-600">⚠️ {dayError}</p>
        ) : dayRows.none.length === 0 && dayRows.partial.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> ทุกห้อง ({dayRows.roomCount} ห้อง) เช็คชื่อครบแล้ว
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-slate-500">
              ยังไม่เช็คเลย <b className="text-rose-600">{dayRows.none.length}</b> ห้อง · เช็คไม่ครบ{" "}
              <b className="text-amber-600">{dayRows.partial.length}</b> ห้อง · จากทั้งหมด {dayRows.roomCount} ห้อง
            </p>
            {dayRows.none.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold text-rose-600">ยังไม่เช็คชื่อ</p>
                <div className="flex flex-wrap gap-2">
                  {dayRows.none.map(({ room, total }) => (
                    <Chip key={room.classroom_id}>{room.room_name} ({total} คน)</Chip>
                  ))}
                </div>
              </div>
            )}
            {dayRows.partial.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold text-amber-600">เช็คไม่ครบทุกคน</p>
                <div className="flex flex-wrap gap-2">
                  {dayRows.partial.map(({ room, total, done }) => (
                    <Chip key={room.classroom_id} tone="amber">{room.room_name} ({done}/{total})</Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ------------------------- รายเดือน ------------------------- */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-800">สรุปการไม่เช็คชื่อรายเดือน</h2>
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
              {THAI_MONTHS_FULL.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
              {years.map((y) => (
                <option key={y} value={y}>พ.ศ. {y + 543}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
            {([["date", "ตามวันที่"], ["room", "ตามห้อง"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setMonthView(v); setOpenKey(null); }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  monthView === v ? "bg-purple-600 text-white shadow" : "text-slate-500 hover:text-purple-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={countSchoolWide} onChange={(e) => setCountSchoolWide(e.target.checked)} />
            นับวันที่ทั้งโรงเรียนไม่มีการเช็คชื่อด้วย
          </label>
        </div>

        {monthLoading ? (
          <p className="mt-5 flex items-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังโหลด...
          </p>
        ) : monthError ? (
          <p className="mt-5 text-sm font-semibold text-rose-600">⚠️ {monthError}</p>
        ) : (
          <>
            <p className="mt-4 text-xs text-slate-500">
              วันเรียนที่นับ {schoolDays.length} วัน (ไม่รวมเสาร์-อาทิตย์ วันหยุด และวันนี้)
            </p>

            {monthly.schoolWideEmpty.length > 0 && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                <p className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  ทั้งโรงเรียนไม่มีการเช็คชื่อเลย {monthly.schoolWideEmpty.length} วัน
                  {countSchoolWide ? "" : " (ไม่นับรวมด้านล่าง — อาจเป็นวันหยุดที่ยังไม่ได้ตั้งค่า)"}
                </p>
                <p className="mt-1">วันที่ {monthly.schoolWideEmpty.map(dayNum).join(", ")}</p>
              </div>
            )}

            {monthly.byDate.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> ทุกห้องเช็คชื่อครบทุกวันเรียนในเดือนนี้
              </p>
            ) : monthView === "date" ? (
              <ul className="mt-4 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
                {monthly.byDate.map(({ date: d, rooms }) => {
                  const key = `d-${d}`;
                  const open = openKey === key;
                  return (
                    <li key={d}>
                      <button
                        onClick={() => setOpenKey(open ? null : key)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-semibold text-slate-700">วันที่ {dayNum(d)} {THAI_MONTHS_FULL[month - 1]}</span>
                        <span className="flex items-center gap-2 text-xs font-bold text-rose-600">
                          ไม่เช็ค {rooms.length}/{activeRooms.length} ห้อง
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                      {open && (
                        <div className="flex flex-wrap gap-2 bg-slate-50/60 px-4 py-3">
                          {rooms.map((r) => <Chip key={r.classroom_id}>{r.room_name}</Chip>)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
                {monthly.roomRows.map(({ room, dates }) => {
                  const key = `r-${room.classroom_id}`;
                  const open = openKey === key;
                  return (
                    <li key={room.classroom_id}>
                      <button
                        onClick={() => setOpenKey(open ? null : key)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-semibold text-slate-700">ห้อง {room.room_name}</span>
                        <span className="flex items-center gap-2 text-xs font-bold text-rose-600">
                          ไม่ได้เช็ค {dates.length} วัน
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                      {open && (
                        <div className="bg-slate-50/60 px-4 py-3">
                          <p className="mb-2 text-xs text-slate-500">{THAI_MONTHS_FULL[month - 1]} วันที่</p>
                          <div className="flex flex-wrap gap-2">
                            {dates.map((d) => <Chip key={d}>{dayNum(d)}</Chip>)}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
                <li className="px-4 py-2.5 text-xs text-slate-400">
                  ห้องที่ไม่อยู่ในรายการ = เช็คชื่อครบทุกวันเรียน ({activeRooms.length - monthly.roomRows.length} ห้อง)
                </li>
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}