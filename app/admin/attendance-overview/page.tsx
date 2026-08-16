// app/admin/attendance-overview/page.tsx
//
// ⚠️ สมมติฐานเรื่องฐานข้อมูล (โปรดตรวจสอบ/ปรับให้ตรงกับสคีมาจริงของคุณ):
//   - ตาราง "classrooms": classroom_id, room_name (ระดับชั้นแยกจาก room_name ด้วย "/" เช่น "ป.1/2" -> "ป.1")
//   - ตาราง "students": id, classroom_id, gender
//   - ตาราง "attendance_records": student_id, classroom_id, attendance_date, status
//   - role admin/director/deputy_director มีสิทธิ์ SELECT ทุกแถวในตารางเหล่านี้ผ่าน RLS policy
//     (ถ้ายังไม่มี ต้องเพิ่ม policy ที่อนุญาตให้ role เหล่านี้เห็นข้อมูลทุกห้อง ไม่ใช่แค่ห้องตัวเอง)
//
// ⚠️ ฟีเจอร์ "กราฟ/สถิติ" (รายวัน/รายเดือน/รายเทอม/รายปีการศึกษา) ใช้ไลบรารี recharts
//   ถ้ายังไม่ได้ติดตั้ง ให้รัน:  npm install recharts
//
//   สมมติฐานเรื่อง "เทอม" / "ปีการศึกษา" (ปรับตามปฏิทินโรงเรียนจริงได้ที่ getTermRange / getAcademicYearRange):
//     - ปีการศึกษา X  หมายถึงช่วง 1 พ.ค. ปี X  ถึง 31 มี.ค. ปี X+1 (ค.ศ.)
//     - เทอม 1: 1 พ.ค. - 15 ต.ค. ของปี X
//     - เทอม 2: 1 พ.ย. ของปี X - 31 มี.ค. ของปี X+1
//
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home, ArrowLeft, Calendar, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Users, BarChart3, Loader2, TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

const supabase = createClient();

// ★ แก้ path เหล่านี้ให้ตรงกับระบบจริง
const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

// ★ role ที่ถือว่าเป็นผู้ดูแลระบบ — ต้องตรงกับ homeroom hub
const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);

type AttendanceStatus = "present" | "absent" | "leave" | "late";

const STATUS_META: { value: AttendanceStatus; label: string; color: string; text: string; bg: string }[] = [
  { value: "present", label: "มา", color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
  { value: "late", label: "สาย", color: "bg-amber-400", text: "text-amber-600", bg: "bg-amber-50" },
  { value: "leave", label: "ลา", color: "bg-sky-400", text: "text-sky-600", bg: "bg-sky-50" },
  { value: "absent", label: "ขาด", color: "bg-rose-500", text: "text-rose-600", bg: "bg-rose-50" },
];

/* ------------------------------------------------------------------ */
/* Thai date helpers                                                    */
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

function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toBuddhistYear(gregorianYear: number) {
  return gregorianYear + 543;
}
function formatThaiDateFull(iso: string) {
  const dt = parseISODateLocal(iso);
  const weekday = THAI_WEEKDAYS_FULL[dt.getDay()];
  const day = dt.getDate();
  const month = THAI_MONTHS_FULL[dt.getMonth()];
  const year = toBuddhistYear(dt.getFullYear());
  return `วัน${weekday}ที่ ${day} ${month} ${year}`;
}
function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysISO(iso: string, delta: number) {
  const dt = parseISODateLocal(iso);
  dt.setDate(dt.getDate() + delta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ★ ช่วงวันที่ของ "เดือน" ที่เลือก (ปฏิทิน)
function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
// ★ ช่วงวันที่ของ "เทอม" ในปีการศึกษาที่เลือก (ปรับตามปฏิทินโรงเรียนจริงได้ตรงนี้)
function getTermRange(academicYear: number, term: 1 | 2) {
  if (term === 1) return { start: `${academicYear}-05-01`, end: `${academicYear}-10-15` };
  return { start: `${academicYear}-11-01`, end: `${academicYear + 1}-03-31` };
}
// ★ ช่วงวันที่ของ "ปีการศึกษา" ที่เลือก (รวมทั้ง 2 เทอม)
function getAcademicYearRange(academicYear: number) {
  return { start: `${academicYear}-05-01`, end: `${academicYear + 1}-03-31` };
}

// ★ ดึง "ระดับชั้น" จากชื่อห้อง เช่น "ป.1/2" -> "ป.1", "ม.3/4" -> "ม.3"
//    ถ้าตาราง classrooms มีคอลัมน์ grade_level แยกอยู่แล้ว ให้ลบฟังก์ชันนี้และดึงตรง ๆ จาก query แทน
function extractGradeLevel(roomName: string): string {
  const idx = roomName.indexOf("/");
  return idx === -1 ? roomName : roomName.slice(0, idx);
}

// ★ ลำดับ "ประเภทชั้น" ที่ถูกต้องตามระบบการศึกษาไทย: อนุบาล -> ประถม -> มัธยม
//    (เรียงตามตัวอักษรไทยเฉยๆ จะผิด เพราะ "อ" มาหลัง "ป" ในพยัญชนะไทย)
const GRADE_PREFIX_ORDER: Record<string, number> = { "อ": 0, "ป": 1, "ม": 2 };

function parseGrade(grade: string): { prefixRank: number; num: number } {
  const match = grade.match(/^([ก-๙]+)\.?(\d+)?/);
  const prefix = match?.[1]?.charAt(0) ?? "";
  const num = match?.[2] ? Number(match[2]) : 0;
  return { prefixRank: GRADE_PREFIX_ORDER[prefix] ?? 99, num };
}

// เรียงระดับชั้น: อนุบาล -> ประถม -> มัธยม ก่อน แล้วค่อยเรียงเลขชั้นจากน้อยไปมาก
function gradeSort(a: string, b: string) {
  const pa = parseGrade(a);
  const pb = parseGrade(b);
  if (pa.prefixRank !== pb.prefixRank) return pa.prefixRank - pb.prefixRank;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return a.localeCompare(b, "th", { numeric: true });
}

// ★ Supabase/PostgREST จำกัดผลลัพธ์ query ละ 1,000 แถวโดยดีฟอลต์ (max-rows)
//    ฟังก์ชันนี้วนดึงข้อมูลทีละหน้าจนกว่าจะครบ เพื่อไม่ให้จำนวน นร./รายการเช็คชื่อขาดหายเมื่อโรงเรียนมีมากกว่า 1,000 คน
async function fetchAllRows<T>(
  table: string,
  selectStr: string,
  applyFilters?: (q: any) => any
): Promise<{ data: T[] | null; error: any }> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];
  while (true) {
    let query: any = supabase.from(table).select(selectStr).range(from, from + pageSize - 1);
    if (applyFilters) query = applyFilters(query);
    const { data, error } = await query;
    if (error) return { data: null, error };
    all = all.concat((data ?? []) as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

/* ------------------------------------------------------------------ */

type ClassroomRow = { classroom_id: string; room_name: string };
type StudentRow = { id: string; classroom_id: string; gender: string | null };
type AttendanceRecordRow = { student_id: string; classroom_id: string; status: AttendanceStatus };
type AttendanceRecordWithDate = { student_id: string; classroom_id: string; status: AttendanceStatus; attendance_date: string };

type BaseData = { classrooms: ClassroomRow[]; students: StudentRow[] };

type ClassStat = {
  classroom_id: string;
  room_name: string;
  grade: string;
  total: number; // จำนวนเต็ม นร. ในห้อง (รวม)
  maleTotal: number; // จำนวนเต็ม ชาย
  femaleTotal: number; // จำนวนเต็ม หญิง
  present: number; // มาเรียน (รวม)
  malePresent: number; // มาเรียน ชาย
  femalePresent: number; // มาเรียน หญิง
  late: number;
  leave: number;
  absent: number;
  notRecorded: number;
};

type GradeGroup = {
  grade: string;
  classes: ClassStat[];
  totals: Omit<ClassStat, "classroom_id" | "room_name" | "grade">;
};

type ChartPoint = { label: string; [key: string]: number | string };

function emptyTotals() {
  return {
    total: 0, maleTotal: 0, femaleTotal: 0,
    present: 0, malePresent: 0, femalePresent: 0,
    late: 0, leave: 0, absent: 0, notRecorded: 0,
  };
}
function sumInto(target: ReturnType<typeof emptyTotals>, src: ReturnType<typeof emptyTotals>) {
  target.total += src.total;
  target.maleTotal += src.maleTotal;
  target.femaleTotal += src.femaleTotal;
  target.present += src.present;
  target.malePresent += src.malePresent;
  target.femalePresent += src.femalePresent;
  target.late += src.late;
  target.leave += src.leave;
  target.absent += src.absent;
  target.notRecorded += src.notRecorded;
}

// ★ สีเส้นกราฟ วนใช้ตามลำดับระดับชั้นที่เลือก ("ทั้งโรงเรียน" ใช้สีเทาเข้มเสมอ)
const LINE_COLORS = ["#7c3aed", "#059669", "#0284c7", "#d97706", "#e11d48", "#0d9488", "#9333ea", "#ca8a04"];
const SCHOOL_ENTITY = "__school__";
function colorForEntity(ent: string, idx: number) {
  return ent === SCHOOL_ENTITY ? "#1e293b" : LINE_COLORS[idx % LINE_COLORS.length];
}
function entityLabel(ent: string) {
  return ent === SCHOOL_ENTITY ? "ทั้งโรงเรียน" : `ระดับ ${ent}`;
}

export default function AttendanceOverviewPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [date, setDate] = useState(getTodayISO());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // ★ ข้อมูลห้องเรียน/นักเรียน ดึงครั้งเดียวแล้วใช้ร่วมกันทั้งมุมมองตารางและกราฟ (ไม่ผูกกับวันที่)
  const [baseData, setBaseData] = useState<BaseData | null>(null);

  const [gradeGroups, setGradeGroups] = useState<GradeGroup[]>([]);
  const [grandTotals, setGrandTotals] = useState(emptyTotals());
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const [genderTotals, setGenderTotals] = useState<Record<"male" | "female" | "unknown", Record<AttendanceStatus, number>>>({
    male: { present: 0, late: 0, leave: 0, absent: 0 },
    female: { present: 0, late: 0, leave: 0, absent: 0 },
    unknown: { present: 0, late: 0, leave: 0, absent: 0 },
  });

  // ★ สถานะของมุมมอง "กราฟ/สถิติ"
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [periodType, setPeriodType] = useState<"day" | "month" | "term" | "year">("day");
  const [chartMonth, setChartMonth] = useState<number>(new Date().getMonth() + 1);
  const [chartYear, setChartYear] = useState<number>(() => {
    const now = new Date();
    // ถ้ายังไม่ถึงพฤษภาคม ให้ถือว่ายังอยู่ในปีการศึกษาที่เริ่มเมื่อพฤษภาคมปีก่อนหน้า
    return now.getMonth() + 1 >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  });
  const [chartTerm, setChartTerm] = useState<1 | 2>(1);
  const [chartEntities, setChartEntities] = useState<Set<string>>(new Set([SCHOOL_ENTITY]));
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartErrorMsg, setChartErrorMsg] = useState("");

  const dateInputRef = useRef<HTMLInputElement>(null);

  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof (el as unknown as { showPicker?: () => void }).showPicker === "function") {
      (el as unknown as { showPicker: () => void }).showPicker();
    } else {
      el.focus();
      el.click();
    }
  }

  function toggleEntity(ent: string) {
    setChartEntities((prev) => {
      const next = new Set(prev);
      if (next.has(ent)) next.delete(ent);
      else next.add(ent);
      return next;
    });
  }

  // ตรวจสิทธิ์ผู้ดูแลระบบก่อนแสดงหน้า
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (profile?.role && ADMIN_ROLES.has(profile.role)) {
        setAllowed(true);
      } else {
        router.push(HOMEROOM_PATH);
      }
      setCheckingAuth(false);
    })();
  }, [router]);

  // ★ โหลดรายชื่อห้องเรียน/นักเรียนครั้งเดียว (ใช้ร่วมกันทั้งตารางรายวันและกราฟ)
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const [classroomsRes, studentsRes] = await Promise.all([
        // ★ ตาราง classrooms ใช้ primary key ชื่อ "id" (ไม่ใช่ "classroom_id") — จำนวนห้องมีไม่มาก ดึงครั้งเดียวพอ
        supabase.from("classrooms").select("id, room_name").order("room_name"),
        // ★ students อาจมีมากกว่า 1,000 แถว ต้องดึงแบบแบ่งหน้า ไม่งั้นข้อมูลจะขาดหาย
        fetchAllRows<{ id: string; classroom_id: string; gender: string | null }>("students", "id, classroom_id, gender"),
      ]);

      if (classroomsRes.error || studentsRes.error) {
        console.error(classroomsRes.error || studentsRes.error);
        setErrorMsg(
          "โหลดข้อมูลไม่สำเร็จ — อาจเป็นเพราะชื่อตาราง/คอลัมน์ไม่ตรงกับระบบจริง หรือ RLS policy ยังไม่อนุญาตให้ role นี้เห็นข้อมูลทุกห้อง กรุณาตรวจสอบคอมเมนต์ด้านบนของไฟล์นี้"
        );
        setLoading(false);
        return;
      }

      const classrooms = ((classroomsRes.data ?? []) as { id: string; room_name: string }[]).map((c) => ({
        classroom_id: c.id,
        room_name: c.room_name,
      })) as ClassroomRow[];
      const students = (studentsRes.data ?? []) as StudentRow[];
      setBaseData({ classrooms, students });
    })();
  }, [allowed]);

  // โหลดข้อมูลสรุปของวันที่เลือก (มุมมองตาราง)
  useEffect(() => {
    if (!allowed || !baseData) return;
    setLoading(true);
    setErrorMsg("");

    (async () => {
      // ★ attendance_records อาจมีมากกว่า 1,000 แถว ต้องดึงแบบแบ่งหน้า ไม่งั้นข้อมูลจะขาดหาย
      const attendanceRes = await fetchAllRows<AttendanceRecordRow>("attendance_records", "student_id, classroom_id, status", (q) =>
        q.eq("attendance_date", date)
      );

      if (attendanceRes.error) {
        console.error(attendanceRes.error);
        setErrorMsg(
          "โหลดข้อมูลไม่สำเร็จ — อาจเป็นเพราะชื่อตาราง/คอลัมน์ไม่ตรงกับระบบจริง หรือ RLS policy ยังไม่อนุญาตให้ role นี้เห็นข้อมูลทุกห้อง กรุณาตรวจสอบคอมเมนต์ด้านบนของไฟล์นี้"
        );
        setLoading(false);
        return;
      }

      const { classrooms, students } = baseData;
      const records = (attendanceRes.data ?? []) as AttendanceRecordRow[];

      // สถานะของนักเรียนแต่ละคนในวันที่เลือก
      const statusByStudent = new Map<string, AttendanceStatus>();
      records.forEach((r) => statusByStudent.set(r.student_id, r.status));

      // เริ่ม stat ต่อห้องจากรายชื่อห้องทั้งหมด (ห้องไหนยังไม่มีคนเช็คชื่อก็ยังอยู่ในตาราง)
      const statByClassroom = new Map<string, ClassStat>();
      classrooms.forEach((c) => {
        statByClassroom.set(c.classroom_id, {
          classroom_id: c.classroom_id,
          room_name: c.room_name,
          grade: extractGradeLevel(c.room_name),
          ...emptyTotals(),
        });
      });

      // สรุปแยกชาย/หญิง (นับเฉพาะคนที่มีบันทึกเช็คชื่อวันนี้แล้ว)
      const gTotals: Record<"male" | "female" | "unknown", Record<AttendanceStatus, number>> = {
        male: { present: 0, late: 0, leave: 0, absent: 0 },
        female: { present: 0, late: 0, leave: 0, absent: 0 },
        unknown: { present: 0, late: 0, leave: 0, absent: 0 },
      };

      students.forEach((s) => {
        const stat = statByClassroom.get(s.classroom_id);
        if (!stat) return; // นักเรียนอยู่ในห้องที่ไม่พบ (ข้อมูลไม่สอดคล้อง) — ข้าม
        stat.total += 1;
        if (s.gender === "male") stat.maleTotal += 1;
        else if (s.gender === "female") stat.femaleTotal += 1;

        const status = statusByStudent.get(s.id);
        if (!status) {
          stat.notRecorded += 1;
        } else {
          stat[status] += 1;
          if (status === "present") {
            if (s.gender === "male") stat.malePresent += 1;
            else if (s.gender === "female") stat.femalePresent += 1;
          }
          const key = s.gender === "male" || s.gender === "female" ? s.gender : "unknown";
          gTotals[key][status] += 1;
        }
      });

      // จัดกลุ่มตามระดับชั้น + คำนวณ subtotal
      const groupMap = new Map<string, GradeGroup>();
      statByClassroom.forEach((stat) => {
        let group = groupMap.get(stat.grade);
        if (!group) {
          group = { grade: stat.grade, classes: [], totals: emptyTotals() };
          groupMap.set(stat.grade, group);
        }
        group.classes.push(stat);
        sumInto(group.totals, stat);
      });

      const groups = Array.from(groupMap.values()).sort((a, b) => gradeSort(a.grade, b.grade));
      groups.forEach((g) => g.classes.sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true })));

      const grand = emptyTotals();
      groups.forEach((g) => sumInto(grand, g.totals));

      setGradeGroups(groups);
      setGrandTotals(grand);
      setGenderTotals(gTotals);
      setLoading(false);
    })();
  }, [allowed, baseData, date]);

  // รายชื่อระดับชั้นทั้งหมด (สำหรับตัวเลือก "เปรียบเทียบ" ในกราฟ)
  const availableGrades = useMemo(() => {
    if (!baseData) return [] as string[];
    const set = new Set(baseData.classrooms.map((c) => extractGradeLevel(c.room_name)));
    return Array.from(set).sort(gradeSort);
  }, [baseData]);

  // กราฟแบบ "รายวัน" ใช้ข้อมูลจากตารางที่โหลดไว้แล้ว ไม่ต้อง fetch เพิ่ม — เปรียบเทียบทุกระดับชั้น + ทั้งโรงเรียนในวันเดียวกัน
  const dayChartData = useMemo<ChartPoint[]>(() => {
    const points: ChartPoint[] = gradeGroups.map((g) => ({
      label: `ระดับ ${g.grade}`,
      "อัตรามาเรียน (%)": g.totals.total ? Math.round(((g.totals.present + g.totals.late) / g.totals.total) * 1000) / 10 : 0,
    }));
    points.push({
      label: "ทั้งโรงเรียน",
      "อัตรามาเรียน (%)": grandTotals.total ? Math.round(((grandTotals.present + grandTotals.late) / grandTotals.total) * 1000) / 10 : 0,
    });
    return points;
  }, [gradeGroups, grandTotals]);

  // ★ โหลดข้อมูลกราฟสำหรับ "รายเดือน / รายเทอม / รายปีการศึกษา" — ดึงเฉพาะช่วงวันที่ที่ต้องใช้
  useEffect(() => {
    if (!allowed || !baseData || viewMode !== "chart" || periodType === "day") return;
    setChartLoading(true);
    setChartErrorMsg("");

    (async () => {
      const range =
        periodType === "month" ? getMonthRange(chartYear, chartMonth) :
        periodType === "term" ? getTermRange(chartYear, chartTerm) :
        getAcademicYearRange(chartYear);

      const res = await fetchAllRows<AttendanceRecordWithDate>(
        "attendance_records",
        "student_id, classroom_id, status, attendance_date",
        (q) => q.gte("attendance_date", range.start).lte("attendance_date", range.end)
      );

      if (res.error) {
        console.error(res.error);
        setChartErrorMsg("โหลดข้อมูลกราฟไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setChartLoading(false);
        return;
      }

      const { classrooms, students } = baseData;
      const classroomGrade = new Map(classrooms.map((c) => [c.classroom_id, extractGradeLevel(c.room_name)]));
      const studentGrade = new Map(students.map((s) => [s.id, classroomGrade.get(s.classroom_id) ?? "-"]));

      // จำนวน นร. ทั้งหมดต่อระดับชั้น/ทั้งโรงเรียน (คงที่ ไม่ขึ้นกับวันที่)
      const totalByGrade = new Map<string, number>();
      students.forEach((s) => {
        const grade = studentGrade.get(s.id) ?? "-";
        totalByGrade.set(grade, (totalByGrade.get(grade) ?? 0) + 1);
      });
      const totalSchool = students.length;

      // จัดกลุ่ม record ตามวันที่ที่มีการเช็คชื่อจริงเท่านั้น (ข้ามวันหยุด/วันที่ยังไม่ได้เช็คชื่อโดยอัตโนมัติ)
      const byDate = new Map<string, AttendanceRecordWithDate[]>();
      (res.data ?? []).forEach((r) => {
        const arr = byDate.get(r.attendance_date) ?? [];
        arr.push(r);
        byDate.set(r.attendance_date, arr);
      });

      const entities = Array.from(chartEntities);
      const goodCountFor = (dayRecords: AttendanceRecordWithDate[], ent: string) =>
        dayRecords.filter((r) => {
          const belongs = ent === SCHOOL_ENTITY ? true : studentGrade.get(r.student_id) === ent;
          return belongs && (r.status === "present" || r.status === "late");
        }).length;

      if (periodType === "month") {
        const points: ChartPoint[] = Array.from(byDate.keys())
          .sort()
          .map((d) => {
            const dayRecords = byDate.get(d) ?? [];
            const point: ChartPoint = { label: String(parseISODateLocal(d).getDate()) };
            entities.forEach((ent) => {
              const total = ent === SCHOOL_ENTITY ? totalSchool : totalByGrade.get(ent) ?? 0;
              const good = goodCountFor(dayRecords, ent);
              point[ent] = total > 0 ? Math.round((good / total) * 1000) / 10 : 0;
            });
            return point;
          });
        setChartData(points);
      } else {
        // เทอม / ปีการศึกษา -> สรุปเป็น "ค่าเฉลี่ยอัตรามาเรียนรายเดือน" (เฉลี่ยเฉพาะวันที่มีการเช็คชื่อจริงในเดือนนั้น)
        const monthAgg = new Map<string, Map<string, { sum: number; count: number }>>();
        Array.from(byDate.keys()).sort().forEach((d) => {
          const monthKey = d.slice(0, 7); // YYYY-MM
          const dayRecords = byDate.get(d) ?? [];
          let entMap = monthAgg.get(monthKey);
          if (!entMap) { entMap = new Map(); monthAgg.set(monthKey, entMap); }
          entities.forEach((ent) => {
            const total = ent === SCHOOL_ENTITY ? totalSchool : totalByGrade.get(ent) ?? 0;
            const good = goodCountFor(dayRecords, ent);
            const rate = total > 0 ? (good / total) * 100 : 0;
            const prev = entMap!.get(ent) ?? { sum: 0, count: 0 };
            entMap!.set(ent, { sum: prev.sum + rate, count: prev.count + 1 });
          });
        });
        const points: ChartPoint[] = Array.from(monthAgg.keys())
          .sort()
          .map((mk) => {
            const m = Number(mk.split("-")[1]);
            const point: ChartPoint = { label: THAI_MONTHS_SHORT[m - 1] };
            const entMap = monthAgg.get(mk)!;
            entities.forEach((ent) => {
              const agg = entMap.get(ent);
              point[ent] = agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : 0;
            });
            return point;
          });
        setChartData(points);
      }
      setChartLoading(false);
    })();
  }, [allowed, baseData, viewMode, periodType, chartYear, chartMonth, chartTerm, chartEntities]);

  const attendedRate = useMemo(() => {
    if (grandTotals.total === 0) return 0;
    return Math.round(((grandTotals.present + grandTotals.late) / grandTotals.total) * 1000) / 10;
  }, [grandTotals]);

  function toggleGrade(grade: string) {
    setCollapsedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!allowed) return null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-50 via-white to-sky-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-purple-600 hover:shadow-md"
          >
            <Home className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => router.push(HOMEROOM_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-purple-600 hover:shadow-md"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* หัวข้อ + ตัวเลือกวันที่ */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-purple-500 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> สำหรับผู้ดูแลระบบ
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
              สถิติการมาเรียนทั้งโรงเรียน
            </h1>
            <p className="mt-1 text-sm text-slate-500">ภาพรวมการมา/สาย/ลา/ขาด แยกรายห้องและรายระดับชั้น</p>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => setDate((d) => addDaysISO(d, -1))}
              className="flex h-[42px] w-10 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-purple-300"
              title="วันก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
              <button
                type="button"
                onClick={openDatePicker}
                className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-md active:translate-y-0 active:scale-[0.98]"
              >
                <Calendar className="h-4 w-4 text-purple-500" />
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

            <button
              onClick={() => setDate((d) => addDaysISO(d, 1))}
              className="flex h-[42px] w-10 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-purple-300"
              title="วันถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {date !== getTodayISO() && (
              <button
                onClick={() => setDate(getTodayISO())}
                className="h-[42px] rounded-2xl border-2 border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                กลับไปวันนี้
              </button>
            )}
          </div>
        </div>

        {/* ★ แท็บสลับมุมมอง: ตารางรายวัน / กราฟ-สถิติ */}
        <div className="mt-5 inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <button
            onClick={() => setViewMode("table")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              viewMode === "table" ? "bg-purple-600 text-white shadow" : "text-slate-500 hover:text-purple-600"
            }`}
          >
            ตารางรายวัน
          </button>
          <button
            onClick={() => setViewMode("chart")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              viewMode === "chart" ? "bg-purple-600 text-white shadow" : "text-slate-500 hover:text-purple-600"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> กราฟ/สถิติ
            </span>
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            ⚠️ {errorMsg}
          </div>
        )}

        {!errorMsg && viewMode === "table" && (
          <>
            {/* การ์ดสรุปรวมทั้งโรงเรียน */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="นักเรียนทั้งหมด" value={grandTotals.total} icon={<Users className="h-4 w-4" />} tone="slate" />
              <SummaryCard label="มา" value={grandTotals.present} tone="emerald" />
              <SummaryCard label="สาย" value={grandTotals.late} tone="amber" />
              <SummaryCard label="ลา" value={grandTotals.leave} tone="sky" />
              <SummaryCard label="ขาด" value={grandTotals.absent} tone="rose" />
              <SummaryCard label="ยังไม่บันทึก" value={grandTotals.notRecorded} tone="gray" />
            </div>
            <div className="mt-3 rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-100">
              <p className="text-sm font-bold text-slate-600">
                อัตรามาเรียนรวม (มา+สาย) วันนี้: <span className="text-purple-600">{attendedRate}%</span>
              </p>
            </div>

            {/* สรุปแยกชาย/หญิง */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(["male", "female"] as const).map((g) => {
                const data = genderTotals[g];
                const total = Object.values(data).reduce((a, b) => a + b, 0);
                return (
                  <div key={g} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                    <p className="mb-3 text-sm font-black text-slate-700">
                      {g === "male" ? "👦 นักเรียนชาย" : "👧 นักเรียนหญิง"} <span className="font-normal text-slate-400">({total} คน ที่เช็คชื่อแล้ว)</span>
                    </p>
                    <div className="space-y-2">
                      {STATUS_META.map((m) => {
                        const pct = total > 0 ? Math.round((data[m.value] / total) * 100) : 0;
                        return (
                          <div key={m.value}>
                            <div className="mb-1 flex justify-between text-xs">
                              <span className={`font-semibold ${m.text}`}>{m.label}</span>
                              <span className="text-slate-500">{data[m.value]} คน ({pct}%)</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full ${m.color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ตารางแยกรายระดับชั้น / รายห้อง */}
            <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              {loading ? (
                <p className="py-16 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
              ) : gradeGroups.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">ไม่พบข้อมูลห้องเรียน</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-xs text-slate-500">
                        <th rowSpan={2} className="px-4 py-3 text-left font-semibold align-bottom">ระดับชั้น / ห้อง</th>
                        <th colSpan={3} className="px-2 py-2 text-center font-semibold border-l border-slate-200">จำนวนเต็ม</th>
                        <th colSpan={3} className="px-2 py-2 text-center font-semibold border-l border-slate-200">จำนวนมาเรียน</th>
                        <th rowSpan={2} className="px-3 py-3 text-center font-semibold text-amber-600 border-l border-slate-200 align-bottom">สาย</th>
                        <th rowSpan={2} className="px-3 py-3 text-center font-semibold text-sky-600 align-bottom">ลา</th>
                        <th rowSpan={2} className="px-3 py-3 text-center font-semibold text-rose-600 align-bottom">ขาด</th>
                        <th rowSpan={2} className="px-3 py-3 text-center font-semibold text-slate-400 align-bottom">ยังไม่บันทึก</th>
                        <th rowSpan={2} className="px-3 py-3 text-center font-semibold align-bottom">% มาเรียน</th>
                      </tr>
                      <tr className="text-[11px] text-slate-400">
                        <th className="px-1.5 py-1.5 text-center font-medium border-l border-slate-200">ช</th>
                        <th className="px-1.5 py-1.5 text-center font-medium">ญ</th>
                        <th className="px-1.5 py-1.5 text-center font-medium text-slate-600">รวม</th>
                        <th className="px-1.5 py-1.5 text-center font-medium border-l border-slate-200">ช</th>
                        <th className="px-1.5 py-1.5 text-center font-medium">ญ</th>
                        <th className="px-1.5 py-1.5 text-center font-medium text-emerald-600">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeGroups.map((g) => {
                        const collapsed = collapsedGrades.has(g.grade);
                        const rate = g.totals.total
                          ? Math.round(((g.totals.present + g.totals.late) / g.totals.total) * 1000) / 10
                          : 0;
                        return (
                          <>
                            {/* แถวสรุประดับชั้น — คลิกเพื่อย่อ/ขยาย */}
                            <tr
                              key={`grade-${g.grade}`}
                              onClick={() => toggleGrade(g.grade)}
                              className="cursor-pointer border-t border-slate-100 bg-purple-50/60 transition-colors hover:bg-purple-50"
                            >
                              <td className="px-4 py-2.5 font-bold text-purple-700">
                                <span className="inline-flex items-center gap-1.5">
                                  {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                                  ระดับชั้น {g.grade}
                                  <span className="font-normal text-purple-400">({g.classes.length} ห้อง)</span>
                                </span>
                              </td>
                              <TotalsCells totals={g.totals} bold />
                              <td className="px-3 py-2.5 text-center font-bold text-purple-700">{rate}%</td>
                            </tr>

                            {/* แถวรายห้องในระดับชั้นนี้ */}
                            {!collapsed &&
                              g.classes.map((c) => {
                                const classRate = c.total ? Math.round(((c.present + c.late) / c.total) * 1000) / 10 : 0;
                                return (
                                  <tr key={c.classroom_id} className="border-t border-slate-50 hover:bg-slate-50/60">
                                    <td className="px-4 py-2 pl-10 font-semibold text-slate-700">ห้อง {c.room_name}</td>
                                    <TotalsCells totals={c} />
                                    <td className="px-3 py-2 text-center text-slate-500">{classRate}%</td>
                                  </tr>
                                );
                              })}
                          </>
                        );
                      })}

                      {/* แถวรวมทั้งโรงเรียน */}
                      <tr className="border-t-2 border-slate-200 bg-slate-800 text-white">
                        <td className="px-4 py-3 font-black">รวมทั้งโรงเรียน</td>
                        <TotalsCells totals={grandTotals} dark />
                        <td className="px-3 py-3 text-center font-black">{attendedRate}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-4 text-[11px] text-slate-400">
              &quot;ยังไม่บันทึก&quot; หมายถึงนักเรียนที่ยังไม่มีการเช็คชื่อในวันนั้น (ครูประจำชั้นยังไม่ได้กดบันทึก) ไม่ได้แปลว่าขาดเรียน
            </p>
          </>
        )}

        {/* ★ มุมมอง "กราฟ/สถิติ" — เปรียบเทียบรายวัน/รายเดือน/รายเทอม/รายปีการศึกษา */}
        {!errorMsg && viewMode === "chart" && (
          <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            {/* เลือกช่วงเวลา */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: "day", label: "รายวัน" },
                { value: "month", label: "รายเดือน" },
                { value: "term", label: "รายเทอม" },
                { value: "year", label: "รายปีการศึกษา" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriodType(p.value as "day" | "month" | "term" | "year")}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    periodType === p.value
                      ? "bg-purple-100 text-purple-700 ring-1 ring-purple-300"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* ตัวเลือกช่วงเวลาย่อย */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {periodType === "day" && (
                <p className="text-xs text-slate-400">
                  ใช้วันที่ที่เลือกไว้ด้านบน: <span className="font-semibold text-slate-600">{formatThaiDateFull(date)}</span>
                </p>
              )}
              {periodType === "month" && (
                <>
                  <select
                    value={chartMonth}
                    onChange={(e) => setChartMonth(Number(e.target.value))}
                    className="rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    {THAI_MONTHS_FULL.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <YearSelect value={chartYear} onChange={setChartYear} />
                </>
              )}
              {periodType === "term" && (
                <>
                  <select
                    value={chartTerm}
                    onChange={(e) => setChartTerm(Number(e.target.value) as 1 | 2)}
                    className="rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    <option value={1}>เทอม 1 (พ.ค. - ต.ค.)</option>
                    <option value={2}>เทอม 2 (พ.ย. - มี.ค.)</option>
                  </select>
                  <YearSelect value={chartYear} onChange={setChartYear} label="ปีการศึกษา" />
                </>
              )}
              {periodType === "year" && <YearSelect value={chartYear} onChange={setChartYear} label="ปีการศึกษา" />}
            </div>

            {/* เลือกสิ่งที่จะเปรียบเทียบ (สำหรับรายเดือน/เทอม/ปี — รายวันเทียบทุกระดับชั้นให้อัตโนมัติ) */}
            {periodType !== "day" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">เปรียบเทียบ:</span>
                <EntityChip label="ทั้งโรงเรียน" active={chartEntities.has(SCHOOL_ENTITY)} onClick={() => toggleEntity(SCHOOL_ENTITY)} />
                {availableGrades.map((g) => (
                  <EntityChip key={g} label={`ระดับ ${g}`} active={chartEntities.has(g)} onClick={() => toggleEntity(g)} />
                ))}
              </div>
            )}

            {chartErrorMsg && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                ⚠️ {chartErrorMsg}
              </div>
            )}

            {/* พื้นที่กราฟ */}
            <div className="mt-5 h-80 w-full">
              {periodType === "day" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip formatter={(value) => [`${value}%`, "อัตรามาเรียน"]} />
                    <Bar dataKey="อัตรามาเรียน (%)" radius={[6, 6, 0, 0]} fill="#7c3aed" />
                  </BarChart>
                </ResponsiveContainer>
              ) : chartLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังโหลดข้อมูล...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  ไม่พบข้อมูลการเช็คชื่อในช่วงเวลาที่เลือก
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip formatter={(value, name) => [`${value}%`, entityLabel(String(name))]} />
                    <Legend formatter={(value) => entityLabel(String(value))} />
                    {Array.from(chartEntities).map((ent, idx) => (
                      <Line
                        key={ent}
                        type="monotone"
                        dataKey={ent}
                        name={ent}
                        stroke={colorForEntity(ent, idx)}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              * อัตรามาเรียน = (จำนวนมา + สาย) ÷ จำนวนนักเรียนทั้งหมดในกลุ่มนั้น × 100 — คำนวณเฉพาะวันที่มีการเช็คชื่อจริงเท่านั้น (ข้ามวันหยุด/วันที่ยังไม่ได้เช็คชื่อ)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TotalsCells({
  totals,
  bold,
  dark,
}: {
  totals: {
    total: number; maleTotal: number; femaleTotal: number;
    present: number; malePresent: number; femalePresent: number;
    late: number; leave: number; absent: number; notRecorded: number;
  };
  bold?: boolean;
  dark?: boolean;
}) {
  const base = bold ? "font-bold" : dark ? "font-black" : "font-semibold";
  const muted = dark ? "text-slate-200" : "text-slate-500";
  return (
    <>
      {/* จำนวนเต็ม: ช / ญ / รวม */}
      <td className={`px-1.5 py-2.5 text-center border-l border-slate-100/70 ${muted}`}>{totals.maleTotal || "-"}</td>
      <td className={`px-1.5 py-2.5 text-center ${muted}`}>{totals.femaleTotal || "-"}</td>
      <td className={`px-1.5 py-2.5 text-center ${dark ? "text-white" : "text-slate-700"} ${base}`}>{totals.total || "-"}</td>

      {/* จำนวนมาเรียน: ช / ญ / รวม */}
      <td className={`px-1.5 py-2.5 text-center border-l border-slate-100/70 ${muted}`}>{totals.malePresent || "-"}</td>
      <td className={`px-1.5 py-2.5 text-center ${muted}`}>{totals.femalePresent || "-"}</td>
      <td className={`px-1.5 py-2.5 text-center ${dark ? "text-emerald-300" : "text-emerald-600"} ${base}`}>{totals.present || "-"}</td>

      <td className={`px-3 py-2.5 text-center border-l border-slate-100/70 ${dark ? "text-amber-300" : "text-amber-600"} ${base}`}>{totals.late || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-sky-300" : "text-sky-600"} ${base}`}>{totals.leave || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-rose-300" : "text-rose-600"} ${base}`}>{totals.absent || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-slate-300" : "text-slate-400"} ${base}`}>{totals.notRecorded || "-"}</td>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone: "slate" | "emerald" | "amber" | "sky" | "rose" | "gray";
}) {
  const toneCls: Record<typeof tone, string> = {
    slate: "text-slate-700 bg-slate-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    sky: "text-sky-600 bg-sky-50",
    rose: "text-rose-600 bg-rose-50",
    gray: "text-slate-400 bg-slate-100",
  };
  return (
    <div className={`rounded-2xl p-4 shadow-sm ring-1 ring-slate-100 ${toneCls[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold opacity-80">
        {icon} {label}
      </div>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

// ★ ตัวเลือกปี (พ.ศ.) สำหรับกราฟรายเดือน/เทอม/ปีการศึกษา — ค่าที่เก็บเป็น ค.ศ. (Gregorian) แต่แสดงผลเป็น พ.ศ.
function YearSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 3 + i);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {label ?? "ปี"} {toBuddhistYear(y)}
        </option>
      ))}
    </select>
  );
}

// ★ ปุ่มเลือก/ยกเลิกกลุ่มที่จะเปรียบเทียบในกราฟ (ระดับชั้น / ทั้งโรงเรียน)
function EntityChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active ? "bg-purple-600 text-white shadow-sm" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}