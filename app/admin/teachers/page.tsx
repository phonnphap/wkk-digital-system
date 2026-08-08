"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  User,
  CalendarDays,
  CalendarRange,
  Calendar,
  Landmark,
  Loader2,
  LogIn,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────
   ชนิดข้อมูล
   ────────────────────────────────────────────────────────────── */

type Period = "daily" | "monthly" | "term" | "fiscal";

type TeacherBase = {
  id: string;
  first_name: string;
  last_name: string;
  subject_group: string | null;
  grade_level_id: string | null;
  grade_level_name: string | null;
  avatar_url: string | null;
};

type DailyRow = TeacherBase & {
  on_leave: boolean;
  check_in_time: string | null; // "07:43:00"
  check_out_time: string | null; // "16:30:00"
  is_late: boolean;
  is_early_leave: boolean;
};

type SummaryRow = TeacherBase & {
  present_count: number;
  late_count: number;
  early_leave_count: number;
  leave_count: number;
};

/* ──────────────────────────────────────────────────────────────
   ตัวช่วยเรื่องวันที่ / เวลา
   ────────────────────────────────────────────────────────────── */

// แปลง "07:43:00" -> "07.43" (ตัดวินาทีและใช้จุดแทนโคลอนตามที่ใช้ในโรงเรียน)
function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  if (!h || !m) return null;
  return `${h}.${m}`;
}

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getMonthRange(monthStr: string) {
  // monthStr: "YYYY-MM"
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

// ปีงบประมาณไทย: 1 ต.ค. (ปีก่อนหน้า) - 30 ก.ย. (ปีที่เลือก), อ้างอิงปี พ.ศ./ค.ศ. ตามที่ใช้ในระบบผู้ใช้
function getFiscalYearRange(fiscalYearEnd: number) {
  const start = new Date(fiscalYearEnd - 1, 9, 1); // 1 ต.ค.
  const end = new Date(fiscalYearEnd, 8, 30); // 30 ก.ย.
  return { start: toISODate(start), end: toISODate(end) };
}

function addDays(dateStr: string, delta: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

// รายการวันที่ทั้งหมดในเดือนที่เลือก (ไว้กดดูเวลาของแต่ละวันโดยตรง)
function getDaysInMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const daysCount = new Date(y, m, 0).getDate();
  return Array.from({ length: daysCount }, (_, i) => toISODate(new Date(y, m - 1, i + 1)));
}

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// รายการเดือนทั้งหมดในช่วงวันที่ที่กำหนด (ไว้กดเจาะไปดูรายเดือน แล้วเจาะต่อไปรายวัน)
function getMonthsInRange(start: string, end: string) {
  const months: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  const cursor = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cursor <= e) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

// ── ช่วงวันของแต่ละภาคเรียน เป็นค่าเริ่มต้นโดยประมาณ ปรับวันที่จริงของโรงเรียนได้จากตัวเลือกวันที่ด้านล่าง ──
function getDefaultTermRange(termYear: number, term: 1 | 2) {
  if (term === 1) {
    return { start: toISODate(new Date(termYear, 4, 1)), end: toISODate(new Date(termYear, 9, 15)) }; // พ.ค. - กลาง ต.ค.
  }
  return { start: toISODate(new Date(termYear, 10, 1)), end: toISODate(new Date(termYear + 1, 2, 31)) }; // พ.ย. - มี.ค.
}

/* ──────────────────────────────────────────────────────────────
   คอมโพเนนต์หลัก
   ────────────────────────────────────────────────────────────── */

export default function AdminAttendanceOverviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherBase[]>([]);

  const [period, setPeriod] = useState<Period>("daily");

  // ตัวเลือกช่วงเวลาของแต่ละแท็บ
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const now = new Date();
  const [termYear, setTermYear] = useState(now.getFullYear());
  const [term, setTerm] = useState<1 | 2>(now.getMonth() >= 4 && now.getMonth() <= 9 ? 1 : 2);
  const [termStart, setTermStart] = useState(() => getDefaultTermRange(termYear, term).start);
  const [termEnd, setTermEnd] = useState(() => getDefaultTermRange(termYear, term).end);
  const [fiscalYear, setFiscalYear] = useState(now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear());

  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);

  const [q, setQ] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  // เมื่อเปลี่ยนปี/เทอม ให้รีเซ็ตช่วงวันที่เริ่มต้นของเทอมนั้นให้อัตโนมัติ (ยังแก้เองได้ด้านล่าง)
  useEffect(() => {
    const r = getDefaultTermRange(termYear, term);
    setTermStart(r.start);
    setTermEnd(r.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termYear, term]);

  useEffect(() => {
    loadTeachers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (teachers.length === 0) return;
    if (period === "daily") {
      loadDaily(selectedDate);
    } else {
      const range = getRangeForPeriod();
      loadSummary(range.start, range.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers, period, selectedDate, selectedMonth, termStart, termEnd, fiscalYear]);

  function goToDay(date: string) {
    setSelectedDate(date);
    setPeriod("daily");
  }

  function goToMonth(monthStr: string) {
    setSelectedMonth(monthStr);
    setPeriod("monthly");
  }

  function getRangeForPeriod() {
    if (period === "monthly") return getMonthRange(selectedMonth);
    if (period === "term") return { start: termStart, end: termEnd };
    if (period === "fiscal") return getFiscalYearRange(fiscalYear);
    return { start: selectedDate, end: selectedDate };
  }

  /* ── โหลดรายชื่อครู + สายชั้น (แปลงเป็นชื่อ ไม่ใช่ id) ── */
  async function loadTeachers() {
    const { data: teacherRows } = await supabase
      .from("users")
      .select("id, first_name, last_name, subject_group, grade_level, avatar_url")
      .neq("role", "admin")
      .order("first_name");

    // ── ตารางสายชั้น: ปรับชื่อตาราง/คอลัมน์ให้ตรงกับระบบจริง (คาดว่าเป็น grade_levels: id, name) ──
    let gradeLevelMap = new Map<string, string>();
    try {
      const { data: gradeLevels } = await supabase.from("grade_levels").select("id, name");
      gradeLevelMap = new Map((gradeLevels || []).map((g: any) => [g.id, g.name]));
    } catch {
      // ตาราง grade_levels ยังไม่มี — จะแสดง id เดิมไปก่อนจนกว่าจะเชื่อมตารางจริง
    }

    const mapped: TeacherBase[] = (teacherRows || []).map((t: any) => ({
      id: t.id,
      first_name: t.first_name,
      last_name: t.last_name,
      subject_group: t.subject_group,
      grade_level_id: t.grade_level,
      grade_level_name: t.grade_level ? gradeLevelMap.get(t.grade_level) || t.grade_level : null,
      avatar_url: t.avatar_url,
    }));

    setTeachers(mapped);
  }

  /* ── รายวัน: แสดงเวลามา/สาย/กลับก่อน/กลับ ── */
  async function loadDaily(date: string) {
    setLoading(true);

    const { data: leaveToday } = await supabase
      .from("leave_requests")
      .select("user_id")
      .eq("status", "approved")
      .lte("start_date", date)
      .gte("end_date", date);
    const onLeaveIds = new Set((leaveToday || []).map((r: any) => r.user_id));

    // ── ตารางลงเวลา: ปรับชื่อตาราง/คอลัมน์ (check_in_time, check_out_time, is_late, is_early_leave) ให้ตรงกับระบบจริง ──
    let attendanceMap = new Map<string, any>();
    try {
      const { data: attendanceToday } = await supabase
        .from("teacher_attendance_records")
        .select("user_id, check_in_time, check_out_time, is_late, is_early_leave")
        .eq("attendance_date", date);
      attendanceMap = new Map((attendanceToday || []).map((r: any) => [r.user_id, r]));
    } catch {
      // ตาราง teacher_attendance_records ยังไม่มี — ข้ามไปก่อน
    }

    const rows: DailyRow[] = teachers.map((t) => {
      const att = attendanceMap.get(t.id);
      return {
        ...t,
        on_leave: onLeaveIds.has(t.id),
        check_in_time: att?.check_in_time || null,
        check_out_time: att?.check_out_time || null,
        is_late: !!att?.is_late,
        is_early_leave: !!att?.is_early_leave,
      };
    });

    setDailyRows(rows);
    setLoading(false);
  }

  /* ── รายเดือน / รายเทอม / ปีงบประมาณ: สรุปจำนวนครั้งในช่วงที่เลือก ── */
  async function loadSummary(start: string, end: string) {
    setLoading(true);

    const { data: leaveInRange } = await supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start);

    let attendanceInRange: any[] = [];
    try {
      const { data } = await supabase
        .from("teacher_attendance_records")
        .select("user_id, is_late, is_early_leave")
        .gte("attendance_date", start)
        .lte("attendance_date", end);
      attendanceInRange = data || [];
    } catch {
      // ตาราง teacher_attendance_records ยังไม่มี
    }

    const rows: SummaryRow[] = teachers.map((t) => {
      const attRows = attendanceInRange.filter((a) => a.user_id === t.id);
      const leaveCount = (leaveInRange || []).filter((l: any) => l.user_id === t.id).length;
      return {
        ...t,
        present_count: attRows.length,
        late_count: attRows.filter((a) => a.is_late).length,
        early_leave_count: attRows.filter((a) => a.is_early_leave).length,
        leave_count: leaveCount,
      };
    });

    setSummaryRows(rows);
    setLoading(false);
  }

  const subjectGroups = useMemo(
    () => Array.from(new Set(teachers.map((t) => t.subject_group).filter(Boolean))) as string[],
    [teachers]
  );
  const gradeLevels = useMemo(
    () =>
      Array.from(
        new Map(
          teachers
            .filter((t) => t.grade_level_id)
            .map((t) => [t.grade_level_id as string, t.grade_level_name || (t.grade_level_id as string)])
        ).entries()
      ),
    [teachers]
  );

  function matchesFilters(t: TeacherBase) {
    const name = `${t.first_name} ${t.last_name}`.toLowerCase();
    if (q && !name.includes(q.toLowerCase())) return false;
    if (subjectFilter !== "all" && t.subject_group !== subjectFilter) return false;
    if (gradeFilter !== "all" && t.grade_level_id !== gradeFilter) return false;
    return true;
  }

  const filteredDaily = dailyRows.filter(matchesFilters);
  const filteredSummary = summaryRows.filter(matchesFilters);

  const notCheckedInCount = filteredDaily.filter((r) => !r.check_in_time && !r.on_leave).length;
  const onLeaveCount = filteredDaily.filter((r) => r.on_leave).length;

  const totalLate = filteredSummary.reduce((sum, r) => sum + r.late_count, 0);
  const totalEarlyLeave = filteredSummary.reduce((sum, r) => sum + r.early_leave_count, 0);
  const totalLeave = filteredSummary.reduce((sum, r) => sum + r.leave_count, 0);

  const periodTabs: { key: Period; label: string; icon: any }[] = [
    { key: "daily", label: "รายวัน", icon: CalendarDays },
    { key: "monthly", label: "รายเดือน", icon: Calendar },
    { key: "term", label: "รายเทอม", icon: CalendarRange },
    { key: "fiscal", label: "ปีงบประมาณ", icon: Landmark },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <main className="w-full p-4 md:p-8 lg:p-10 space-y-6 max-w-6xl mx-auto">
        <div className="text-sm text-slate-500 font-bold flex items-center gap-2">
          <span>ผู้ดูแลระบบ</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-extrabold">การลงเวลาปฏิบัติงาน</span>
        </div>

        {/* แถบเมนูช่วงเวลา: รายวัน / รายเดือน / รายเทอม / ปีงบประมาณ */}
        <div className="flex gap-2 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-full sm:w-fit overflow-x-auto">
          {periodTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
                period === key ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ตัวเลือกช่วงวันที่ของแต่ละแท็บ */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
          {period === "daily" && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedDate((d) => addDays(d, -1))}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="วันก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
              />
              <button
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="วันถัดไป"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {period === "monthly" && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
            />
          )}
          {period === "term" && (
            <>
              <select
                value={termYear}
                onChange={(e) => setTermYear(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
              >
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>
                    ปีการศึกษา {y}
                  </option>
                ))}
              </select>
              <select
                value={term}
                onChange={(e) => setTerm(Number(e.target.value) as 1 | 2)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
              >
                <option value={1}>ภาคเรียนที่ 1</option>
                <option value={2}>ภาคเรียนที่ 2</option>
              </select>
              <span className="text-xs text-slate-400 font-bold">ช่วงวันที่ (ปรับได้):</span>
              <input
                type="date"
                value={termStart}
                onChange={(e) => setTermStart(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
              />
              <span className="text-slate-300">–</span>
              <input
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
              />
            </>
          )}
          {period === "fiscal" && (
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold"
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>
                  ปีงบประมาณ {y} (1 ต.ค. {y - 1} – 30 ก.ย. {y})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* กดเลือกวัน/เดือน เพื่อดูเวลาลงเวลาของวันนั้นโดยตรง */}
        {period === "monthly" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-400 mb-3">กดวันที่เพื่อดูเวลาลงเวลาของวันนั้น</p>
            <div className="flex flex-wrap gap-2">
              {getDaysInMonth(selectedMonth).map((d) => (
                <button
                  key={d}
                  onClick={() => goToDay(d)}
                  className="w-9 h-9 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  {Number(d.split("-")[2])}
                </button>
              ))}
            </div>
          </div>
        )}
        {(period === "term" || period === "fiscal") && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-400 mb-3">กดเดือนเพื่อดูรายวัน แล้วกดวันเพื่อดูเวลาลงเวลา</p>
            <div className="flex flex-wrap gap-2">
              {getMonthsInRange(getRangeForPeriod().start, getRangeForPeriod().end).map((m) => {
                const [y, mm] = m.split("-").map(Number);
                return (
                  <button
                    key={m}
                    onClick={() => goToMonth(m)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    {THAI_MONTHS[mm - 1]} {y}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* สรุปตัวเลข */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {period === "daily" ? (
            <>
              <StatCard label="ครูทั้งหมด" value={filteredDaily.length} color="text-slate-700" bg="bg-slate-100" />
              <StatCard label="ยังไม่ลงเวลาวันนี้" value={notCheckedInCount} color="text-rose-600" bg="bg-rose-100" />
              <StatCard label="ลาวันนี้" value={onLeaveCount} color="text-amber-600" bg="bg-amber-100" />
            </>
          ) : (
            <>
              <StatCard label="มาสาย (ครั้ง)" value={totalLate} color="text-orange-600" bg="bg-orange-100" />
              <StatCard label="กลับก่อนเวลา (ครั้ง)" value={totalEarlyLeave} color="text-rose-600" bg="bg-rose-100" />
              <StatCard label="ลา (ครั้ง)" value={totalLeave} color="text-amber-600" bg="bg-amber-100" />
            </>
          )}
        </div>

        {/* ตัวกรอง */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อครู..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
            />
          </div>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600"
          >
            <option value="all">ทุกกลุ่มสาระฯ</option>
            {subjectGroups.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600"
          >
            <option value="all">ทุกสายชั้น</option>
            {gradeLevels.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* ตารางรายชื่อ */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : period === "daily" ? (
            filteredDaily.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">ไม่พบข้อมูลครูตามเงื่อนไขที่เลือก</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredDaily.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => router.push(`/admin/teachers/${t.id}`)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center overflow-hidden shrink-0">
                        {t.avatar_url ? (
                          <img src={t.avatar_url} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {t.first_name} {t.last_name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {t.subject_group || "—"}
                          {t.grade_level_name ? ` · ${t.grade_level_name}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0 items-center">
                      {t.on_leave ? (
                        <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          <CalendarDays className="w-3 h-3" /> ลาวันนี้
                        </span>
                      ) : !t.check_in_time ? (
                        <span className="text-[10px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                          ยังไม่ลงเวลา
                        </span>
                      ) : (
                        <>
                          <span
                            className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${
                              t.is_late
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-emerald-100 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            <LogIn className="w-3 h-3" />
                            {t.is_late ? "สาย" : "มา"} {formatTime(t.check_in_time)}
                          </span>
                          {t.check_out_time && (
                            <span
                              className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${
                                t.is_early_leave
                                  ? "bg-rose-100 text-rose-700 border-rose-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              <LogOut className="w-3 h-3" />
                              {t.is_early_leave ? "กลับก่อน" : "กลับ"} {formatTime(t.check_out_time)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : filteredSummary.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">ไม่พบข้อมูลครูตามเงื่อนไขที่เลือก</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredSummary.map((t) => (
                <button
                  key={t.id}
                  onClick={() => router.push(`/admin/teachers/${t.id}`)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center overflow-hidden shrink-0">
                      {t.avatar_url ? (
                        <img src={t.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {t.first_name} {t.last_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {t.subject_group || "—"}
                        {t.grade_level_name ? ` · ${t.grade_level_name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 shrink-0 text-center">
                    <SummaryPill label="มา" value={t.present_count} color="text-emerald-600" />
                    <SummaryPill label="สาย" value={t.late_count} color="text-orange-600" />
                    <SummaryPill label="กลับก่อน" value={t.early_leave_count} color="text-rose-600" />
                    <SummaryPill label="ลา" value={t.leave_count} color="text-amber-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color}`}>
        <span className={`inline-block w-2 h-2 rounded-full ${bg} mr-2`} />
        {value}
      </p>
    </div>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="min-w-[52px]">
      <p className={`text-sm font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 font-bold">{label}</p>
    </div>
  );
}