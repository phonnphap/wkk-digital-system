// app/attendance/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save, Home, ArrowLeft, Calendar, TrendingUp, Users } from "lucide-react";

const supabase = createClient();

// ★ แก้ path เหล่านี้ให้ตรงกับระบบจริง
const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

type Classroom = {
  classroom_id: string;
  room_name: string;
};

type Student = {
  id: string;
  seat_number: number | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  gender: string | null; // "male" | "female" | null
};

type AttendanceStatus = "present" | "absent" | "leave" | "late";
// ตัวกรองรายชื่อด้านล่างชิปสรุป: สถานะเดี่ยว หรือ "attended" (มา+สาย รวมกัน)
type SummaryFilter = AttendanceStatus | "attended";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeCls: string; barColor: string; textColor: string }[] = [
  { value: "present", label: "มา",   activeCls: "bg-emerald-600 text-white", barColor: "bg-emerald-500", textColor: "text-emerald-600" },
  { value: "late",    label: "สาย",  activeCls: "bg-amber-500 text-white",   barColor: "bg-amber-400",   textColor: "text-amber-600" },
  { value: "leave",   label: "ลา",   activeCls: "bg-sky-500 text-white",     barColor: "bg-sky-400",     textColor: "text-sky-600" },
  { value: "absent",  label: "ขาด",  activeCls: "bg-rose-500 text-white",    barColor: "bg-rose-500",    textColor: "text-rose-600" },
];

/* ------------------------------------------------------------------ */
/* Thai date helpers                                                   */
/* ------------------------------------------------------------------ */

const THAI_WEEKDAYS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// สร้าง Date จาก ISO string แบบ local time (กันปัญหา timezone เลื่อนวัน)
function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toBuddhistYear(gregorianYear: number) {
  return gregorianYear + 543;
}

// "วันศุกร์ที่ 7 สิงหาคม 2569"
function formatThaiDateFull(iso: string) {
  const dt = parseISODateLocal(iso);
  const weekday = THAI_WEEKDAYS_FULL[dt.getDay()];
  const day = dt.getDate();
  const month = THAI_MONTHS_FULL[dt.getMonth()];
  const year = toBuddhistYear(dt.getFullYear());
  return `วัน${weekday}ที่ ${day} ${month} ${year}`;
}

// "จันทร์ ที่ 8 ส.ค.69" — ใช้ในตารางสถิติรายเดือน
function formatThaiDateRow(iso: string) {
  const dt = parseISODateLocal(iso);
  const weekday = THAI_WEEKDAYS_FULL[dt.getDay()];
  const day = dt.getDate();
  const monthShort = THAI_MONTHS_SHORT[dt.getMonth()];
  const yearShort = String(toBuddhistYear(dt.getFullYear())).slice(-2);
  return `วัน${weekday} ที่ ${day} ${monthShort}${yearShort}`;
}

// วันนี้แบบ local time (ไม่ใช้ toISOString ที่อิง UTC เพราะจะเลื่อนวันได้ในบางช่วงเวลา)
function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthStartISO(dateISO: string) {
  return dateISO.slice(0, 7) + "-01";
}

function getNextMonthStartISO(dateISO: string) {
  const [y, m] = dateISO.slice(0, 7).split("-").map(Number);
  const next = new Date(y, m, 1); // m คือเดือนถัดไปแบบ 0-index อยู่แล้ว เพราะ m จาก slice เป็น 1-based
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}-01`;
}

// รายการวันที่ทั้งหมดในเดือนของ dateISO เช่น 2026-08-01 ... 2026-08-31
function getDaysInMonth(dateISO: string) {
  const [y, m] = dateISO.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // Date(y, m, 0) = วันสุดท้ายของเดือน m (1-based)
  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

/* ------------------------------------------------------------------ */

type DayStat = {
  date: string;
  presentMale: number;
  presentFemale: number;
  presentTotal: number;
};

// กราฟแท่งสรุปมา/ขาด/ลา/สาย แยกชาย-หญิง + รวมทั้งหมด (ของวันที่กำลังเลือก)
function GenderAttendanceChart({ students, statusMap }: { students: Student[]; statusMap: Record<string, AttendanceStatus> }) {
  const groups: { key: "male" | "female"; label: string; icon: string }[] = [
    { key: "male", label: "ชาย", icon: "👦" },
    { key: "female", label: "หญิง", icon: "👧" },
  ];

  const counts = useMemo(() => {
    const base: Record<string, Record<AttendanceStatus, number>> = {
      male: { present: 0, late: 0, leave: 0, absent: 0 },
      female: { present: 0, late: 0, leave: 0, absent: 0 },
      unknown: { present: 0, late: 0, leave: 0, absent: 0 },
    };
    students.forEach((s) => {
      const g = s.gender === "male" || s.gender === "female" ? s.gender : "unknown";
      const st = statusMap[s.id] ?? "present";
      base[g][st] += 1;
    });
    return base;
  }, [students, statusMap]);

  const totalByStatus: Record<AttendanceStatus, number> = {
    present: counts.male.present + counts.female.present + counts.unknown.present,
    late: counts.male.late + counts.female.late + counts.unknown.late,
    leave: counts.male.leave + counts.female.leave + counts.unknown.leave,
    absent: counts.male.absent + counts.female.absent + counts.unknown.absent,
  };
  const grandTotal = students.length;
  const maxForBars = Math.max(1, students.length);

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const groupTotal = Object.values(counts[g.key]).reduce((a, b) => a + b, 0);
        return (
          <div key={g.key}>
            <p className="text-xs font-black text-slate-600 mb-1.5">
              {g.icon} {g.label} <span className="text-slate-400 font-normal">({groupTotal} คน)</span>
            </p>
            <div className="flex h-5 w-full overflow-hidden rounded-lg bg-slate-100">
              {STATUS_OPTIONS.map((opt) => {
                const c = counts[g.key][opt.value];
                const widthPct = maxForBars > 0 ? (c / maxForBars) * 100 : 0;
                return c > 0 ? (
                  <div
                    key={opt.value}
                    className={`${opt.barColor} h-full flex items-center justify-center transition-all`}
                    style={{ width: `${widthPct}%` }}
                    title={`${opt.label}: ${c}`}
                  >
                    {widthPct > 8 && <span className="text-[10px] font-bold text-white">{c}</span>}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        );
      })}

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-black text-slate-700 mb-2">📊 รวมทั้งหมด ({grandTotal} คน)</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2 bg-slate-50 rounded-xl px-2.5 py-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${opt.barColor}`} />
              <span className={`text-xs font-bold ${opt.textColor}`}>{opt.label}</span>
              <span className="ml-auto text-xs font-black text-slate-700">{totalByStatus[opt.value]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ตารางสถิติมาเรียนรายวันทั้งเดือน — คลิกแถวเพื่อเปลี่ยนวันที่ที่กำลังเช็คชื่อได้เลย
function MonthlyStatsTable({
  dayStats,
  enrolledCounts,
  selectedDate,
  onSelectDate,
}: {
  dayStats: DayStat[];
  enrolledCounts: { male: number; female: number; total: number };
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}) {
  if (dayStats.length === 0) {
    return <p className="text-xs text-slate-400 py-8 text-center">ยังไม่มีข้อมูลสำหรับเดือนนี้</p>;
  }

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-2xl ring-1 ring-slate-100">
      {/* table-fixed + colgroup กันไม่ให้คอลัมน์ "วันที่" กินพื้นที่ว่างเกินจำเป็น */}
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="text-slate-500">
            <th rowSpan={2} className="px-2.5 py-2 text-left font-semibold border-b border-slate-200 align-bottom">
              วันที่
            </th>
            <th colSpan={3} className="px-2 py-1.5 text-center font-semibold border-b border-l border-slate-200">
              นักเรียนเต็ม
            </th>
            <th colSpan={3} className="px-2 py-1.5 text-center font-semibold border-b border-l border-slate-200">
              มาเรียนวันนี้
            </th>
          </tr>
          <tr className="text-slate-400">
            <th className="px-1.5 py-1 text-center font-medium border-l border-slate-200">ชาย</th>
            <th className="px-1.5 py-1 text-center font-medium">หญิง</th>
            <th className="px-1.5 py-1 text-center font-medium">รวม</th>
            <th className="px-1.5 py-1 text-center font-medium border-l border-slate-200">ชาย</th>
            <th className="px-1.5 py-1 text-center font-medium">หญิง</th>
            <th className="px-1.5 py-1 text-center font-medium">รวม</th>
          </tr>
        </thead>
        <tbody>
          {dayStats.map((d) => {
            const dt = parseISODateLocal(d.date);
            const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
            const isSelected = d.date === selectedDate;
            return (
              <tr
                key={d.date}
                onClick={() => onSelectDate(d.date)}
                title="คลิกเพื่อดูข้อมูลวันนี้"
                className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${
                  isWeekend ? "bg-slate-200/70" : ""
                } ${isSelected ? "bg-indigo-50/80" : "hover:bg-indigo-50/40"}`}
              >
                <td className={`px-2.5 py-1.5 whitespace-nowrap ${isSelected ? "font-bold text-indigo-700" : "text-slate-600"}`}>
                  {formatThaiDateRow(d.date)}
                </td>
                <td className="px-1.5 py-1.5 text-center text-slate-500 border-l border-slate-50">{enrolledCounts.male}</td>
                <td className="px-1.5 py-1.5 text-center text-slate-500">{enrolledCounts.female}</td>
                <td className="px-1.5 py-1.5 text-center text-slate-600 font-semibold">{enrolledCounts.total}</td>
                <td className="px-1.5 py-1.5 text-center text-emerald-600 border-l border-slate-50">{d.presentMale}</td>
                <td className="px-1.5 py-1.5 text-center text-emerald-600">{d.presentFemale}</td>
                <td className="px-1.5 py-1.5 text-center text-emerald-700 font-bold">{d.presentTotal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AttendancePage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(getTodayISO());
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [dayStats, setDayStats] = useState<DayStat[]>([]);
  // ตัวกรองรายชื่อใต้ชิปสรุป (คลิกชิปเพื่อดูรายชื่อ เลขที่ + ชื่อ)
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter | null>(null);

  const dateInputRef = useRef<HTMLInputElement>(null);

  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    // showPicker() เปิด native date picker ได้ตรง ๆ แม่นยำกว่า overlay input แบบเดิมที่กดยาก
    if (typeof (el as unknown as { showPicker?: () => void }).showPicker === "function") {
      (el as unknown as { showPicker: () => void }).showPicker();
    } else {
      el.focus();
      el.click();
    }
  }

  // โหลดห้องที่ครูดูแล
  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data }: { data: Classroom[] | null }) => {
      setClassrooms(data ?? []);
      if (data?.length) setSelectedClass(data[0]);
    });
  }, []);

  // โหลดนักเรียน + สถานะเช็คชื่อของวันที่เลือก
  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    setSummaryFilter(null); // เปลี่ยนวัน/ห้อง แล้วรีเซ็ตตัวกรองรายชื่อที่เปิดค้างไว้
    const cid = selectedClass.classroom_id;

    Promise.all([
      supabase
        .from("students")
        .select("id, seat_number, prefix, first_name, last_name, nick_name, gender")
        .eq("classroom_id", cid)
        .order("seat_number"),
      supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("classroom_id", cid)
        .eq("attendance_date", date),
    ]).then(([studentsRes, attendanceRes]) => {
      const studentList: Student[] = studentsRes.data ?? [];
      setStudents(studentList);

      const map: Record<string, AttendanceStatus> = {};
      // ค่าเริ่มต้น = มา สำหรับทุกคนที่ยังไม่มีบันทึก
      studentList.forEach((s) => { map[s.id] = "present"; });
      (attendanceRes.data ?? []).forEach((r: { student_id: string; status: AttendanceStatus }) => {
        map[r.student_id] = r.status;
      });
      setStatusMap(map);
      setLoading(false);
    });
  }, [selectedClass, date]);

  // โหลดสถิติการมาเรียนรายวันทั้งเดือนของห้องนี้ (แยกชาย/หญิง)
  // หมายเหตุ: ต้องมี foreign key จาก attendance_records.student_id -> students.id
  // ให้ Supabase join ตาราง students(gender) ได้ ถ้ายังไม่มีให้เพิ่ม FK ก่อน
  useEffect(() => {
    if (!selectedClass) { setDayStats([]); return; }
    const cid = selectedClass.classroom_id;
    const start = getMonthStartISO(date);
    const end = getNextMonthStartISO(date);

    supabase
      .from("attendance_records")
      .select("status, attendance_date, students(gender)")
      .eq("classroom_id", cid)
      .gte("attendance_date", start)
      .lt("attendance_date", end)
      .then(({ data, error }) => {
        if (error) {
          console.error("month stats error:", error);
          setDayStats([]);
          return;
        }
        type Row = { status: AttendanceStatus; attendance_date: string; students: { gender: string | null } | { gender: string | null }[] | null };
        const rows = (data ?? []) as unknown as Row[];

        const byDate = new Map<string, { male: number; female: number; total: number }>();
        rows.forEach((r) => {
          // "มาเรียน" นับสถานะ present + late (มาโรงเรียนจริง แค่มาสาย) — ปรับได้ตามนโยบายโรงเรียน
          const attended = r.status === "present" || r.status === "late";
          if (!attended) return;
          const genderInfo = Array.isArray(r.students) ? r.students[0] : r.students;
          const g = genderInfo?.gender;
          const cur = byDate.get(r.attendance_date) ?? { male: 0, female: 0, total: 0 };
          if (g === "male") cur.male += 1;
          else if (g === "female") cur.female += 1;
          cur.total += 1;
          byDate.set(r.attendance_date, cur);
        });

        const days: DayStat[] = getDaysInMonth(date).map((iso) => {
          const d = byDate.get(iso) ?? { male: 0, female: 0, total: 0 };
          return { date: iso, presentMale: d.male, presentFemale: d.female, presentTotal: d.total };
        });
        setDayStats(days);
      });
  }, [selectedClass, date]);

  // จำนวนนักเรียนทั้งหมดในห้อง แยกชาย/หญิง ("นักเรียนเต็ม")
  const enrolledCounts = useMemo(() => {
    let male = 0, female = 0;
    students.forEach((s) => {
      if (s.gender === "male") male += 1;
      else if (s.gender === "female") female += 1;
    });
    return { male, female, total: students.length };
  }, [students]);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStatusMap((prev) => ({ ...prev, [studentId]: status }));
  }

  function setAllStatus(status: AttendanceStatus) {
    const map: Record<string, AttendanceStatus> = {};
    students.forEach((s) => { map[s.id] = status; });
    setStatusMap(map);
  }

  async function handleSave() {
    if (!selectedClass || students.length === 0) return;
    setSaving(true);
    setSavedMsg("");

    const rows = students.map((s) => ({
      student_id: s.id,
      classroom_id: selectedClass.classroom_id,
      attendance_date: date,
      status: statusMap[s.id] ?? "present",
    }));

    // หมายเหตุ: ถ้าขึ้น error "no unique or exclusion constraint matching the ON CONFLICT specification"
    // แปลว่าตาราง attendance_records ยังไม่มี UNIQUE constraint บน (student_id, attendance_date)
    // ให้รันคำสั่ง SQL นี้ในฐานข้อมูลก่อน:
    //   ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_student_date_unique UNIQUE (student_id, attendance_date);
    const { data: savedRows, error } = await supabase
      .from("attendance_records")
      .upsert(rows, { onConflict: "student_id,attendance_date" })
      .select();

    setSaving(false);

    if (error) {
      console.error("attendance save error:", error);
      alert("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }

    if (!savedRows || savedRows.length < rows.length) {
      alert(
        `บันทึกได้เพียง ${savedRows?.length ?? 0}/${rows.length} คน — กรุณาตรวจสอบสิทธิ์ (RLS policy) ของตาราง attendance_records ว่าอนุญาตให้ครูประจำชั้นเขียนข้อมูลของนักเรียนทุกคนในห้องหรือไม่`
      );
      return;
    }

    setSavedMsg("บันทึกเรียบร้อยแล้ว");
    setTimeout(() => setSavedMsg(""), 2500);
  }

  const summary = students.reduce(
    (acc, s) => {
      const st = statusMap[s.id] ?? "present";
      acc[st] = (acc[st] ?? 0) + 1;
      return acc;
    },
    {} as Record<AttendanceStatus, number>
  );
  const attendedCount = (summary.present ?? 0) + (summary.late ?? 0);

  // รายชื่อนักเรียนตามตัวกรองที่เลือก (สำหรับแสดงใต้ชิปสรุป)
  const filteredStudents = useMemo(() => {
    if (!summaryFilter) return [];
    return students
      .filter((s) => {
        const st = statusMap[s.id] ?? "present";
        return summaryFilter === "attended" ? st === "present" || st === "late" : st === summaryFilter;
      })
      .sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));
  }, [students, statusMap, summaryFilter]);

  const summaryFilterLabel =
    summaryFilter === "attended"
      ? "มาเรียน (มา+สาย)"
      : STATUS_OPTIONS.find((o) => o.value === summaryFilter)?.label ?? "";

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <Home className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => router.push(HOMEROOM_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* หัวข้อ + วันที่ อยู่แถวเดียวกัน (วันที่ย้ายมาไว้ต่อจากหัวข้อ "บันทึกเช็คชื่อ") */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">ระบบดูแลนักเรียน</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">บันทึกเช็คชื่อ</h1>
            <p className="mt-1 text-sm text-slate-500">บันทึกการมาเรียนของนักเรียนรายวัน</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {classrooms.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">ห้องเรียน</label>
                <select
                  className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  value={selectedClass?.classroom_id ?? ""}
                  onChange={(e) => setSelectedClass(classrooms.find((c) => c.classroom_id === e.target.value) ?? null)}
                >
                  {classrooms.map((c) => (
                    <option key={c.classroom_id} value={c.classroom_id}>{c.room_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
              {/* ปุ่มจริงที่กดง่าย + เรียก showPicker() ตรง ๆ แทน overlay input แบบเดิมที่กดพลาดง่าย */}
              <button
                type="button"
                onClick={openDatePicker}
                className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md active:translate-y-0 active:scale-[0.98]"
              >
                <Calendar className="h-4 w-4 text-indigo-500" />
                {formatThaiDateFull(date)}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
            </div>

            {date !== getTodayISO() && (
              <button
                onClick={() => setDate(getTodayISO())}
                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                กลับไปวันนี้
              </button>
            )}
          </div>
        </div>

        {/* ★ จำกัดให้ฝั่งรายชื่อ+สถานะ ไม่เกินครึ่งหนึ่งของพื้นที่เว็บ (grid 2 คอลัมน์เท่ากัน) */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ฝั่งซ้าย: รายชื่อ + ปุ่มบันทึก */}
          <div className="space-y-3">
            {/* ปุ่มตั้งค่าทั้งห้องอย่างเร็ว */}
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs text-slate-400">ตั้งค่าทั้งห้อง:</span>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAllStatus(opt.value)}
                  className="rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  ทุกคน{opt.label}
                </button>
              ))}
            </div>

            {/* สรุปตัวเลขวันนี้ — คลิกชิปเพื่อดูรายชื่อ เลขที่ + ชื่อ ของกลุ่มนั้น */}
            {!loading && students.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => setSummaryFilter((prev) => (prev === "attended" ? null : "attended"))}
                    className={`rounded-full px-3 py-1 font-semibold shadow-sm transition ${
                      summaryFilter === "attended"
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                    }`}
                  >
                    มาเรียน (มา+สาย) {attendedCount} คน
                  </button>
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSummaryFilter((prev) => (prev === opt.value ? null : opt.value))}
                      className={`rounded-full px-3 py-1 font-semibold shadow-sm transition ${
                        summaryFilter === opt.value ? opt.activeCls : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {opt.label} {summary[opt.value] ?? 0} คน
                    </button>
                  ))}
                </div>

                {summaryFilter && (
                  <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <p className="mb-2 text-xs font-bold text-slate-500">
                      รายชื่อนักเรียน{summaryFilterLabel} ({filteredStudents.length} คน)
                    </p>
                    {filteredStudents.length === 0 ? (
                      <p className="text-xs text-slate-400">ไม่มีนักเรียนในกลุ่มนี้</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {filteredStudents.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                          >
                            {s.seat_number}. {s.prefix ?? ""}{s.first_name} {s.last_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* รายชื่อนักเรียน */}
            <div className="space-y-2">
              {loading ? (
                <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
              ) : students.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">ไม่พบนักเรียนในห้องนี้</p>
              ) : (
                students.map((s) => {
                  const current = statusMap[s.id] ?? "present";
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white shadow-sm">
                          {s.seat_number}
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {s.prefix ?? ""}{s.first_name} {s.last_name}
                          {s.nick_name && <span className="ml-1 font-normal text-slate-400">({s.nick_name})</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setStatus(s.id, opt.value)}
                            className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                              current === opt.value ? opt.activeCls : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ปุ่มบันทึก */}
            {!loading && students.length > 0 && (
              <div className="sticky bottom-4 flex items-center justify-end gap-3">
                {savedMsg && <span className="text-sm font-semibold text-emerald-600">{savedMsg}</span>}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "กำลังบันทึก..." : "บันทึกการเช็คชื่อ"}
                </button>
              </div>
            )}
          </div>

          {/* ฝั่งขวา: ตารางสถิติรายเดือน + กราฟสรุป ช/ญ ของวันนี้ */}
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-black text-slate-700">
                <TrendingUp className="h-4 w-4 text-indigo-500" /> สถิติมาเรียนประจำเดือน
              </h3>
              <MonthlyStatsTable
                dayStats={dayStats}
                enrolledCounts={enrolledCounts}
                selectedDate={date}
                onSelectDate={setDate}
              />
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-black text-slate-700">
                <Users className="h-4 w-4 text-indigo-500" /> สรุปการมาเรียนวันนี้ แยกชาย/หญิง
              </h3>
              {!loading && students.length > 0 ? (
                <GenderAttendanceChart students={students} statusMap={statusMap} />
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">ไม่มีข้อมูลนักเรียน</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}