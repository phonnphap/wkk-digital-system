"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchHolidayMap, isHoliday, HolidayMap } from "@/lib/holidays";
import {
  User, Search, GraduationCap, ArrowLeft, Loader2, Users, CheckCircle2, XCircle,
  Clock, LogOut, LogIn, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, List,
} from "lucide-react";

const ADMIN_ROLES = ["director", "deputy_director", "admin"];
const ADMIN_EMAILS = ["sumalin@khienkhet.ac.th"];
function isAdminViewer(role: string | null | undefined, email: string | null | undefined): boolean {
  if (role && ADMIN_ROLES.includes(role)) return true;
  if (email && ADMIN_EMAILS.includes(email.trim().toLowerCase())) return true;
  return false;
}

// ── ครูที่ role หรืออีเมลมีคำว่า "admin" ให้ตัดออกจากรายชื่อครูทั้งหมด ──
function isAdminAccount(t: { role: string | null; email: string | null }): boolean {
  if (t.role && ADMIN_ROLES.includes(t.role)) return true;
  if (t.email && t.email.trim().toLowerCase().includes("admin")) return true;
  return false;
}

// ตารางลงเวลาเข้า-ออกจริง อ้างอิงจากหน้า portfolio (teacher_attendance_records: work_date, check_in_time, check_out_time)
const ATTENDANCE_TABLE = "teacher_attendance_records";
const ATTENDANCE_DATE_COL = "work_date";
const ATTENDANCE_CHECKIN_COL = "check_in_time";
const ATTENDANCE_CHECKOUT_COL = "check_out_time";
// วิว "สถานะที่ประมวลผลแล้ว" อ้างอิงจากหน้า portfolio (v_attendance_enriched: status, late_minutes, early_leave_minutes, note, leave_reason)
const ENRICHED_VIEW = "v_attendance_enriched";

const TZ = "Asia/Bangkok";

// วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD) — ไม่ใช้ toISOString() เพราะเป็น UTC ทำให้วันที่เพี้ยนช่วงก่อน 07:00 น.
function bangkokDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function isWeekday(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

async function fetchAllRows(build: (from: number, to: number) => PromiseLike<any>): Promise<any[]> {
  const PAGE = 1000; // Supabase จำกัด 1,000 แถวต่อคำสั่ง จึงดึงเป็นหน้า ๆ
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk: any[] = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

// ═══════════════════════════════════════════════════════════════════════
// ★ เงื่อนไขการตัดสินสถานะรายวัน — คัดลอกมาจากตรรกะเดียวกับหน้า portfolio (ประวัติส่วนตัว/สถิติของครูรายคน)
//   เพื่อให้ตัวเลขสถิติของผู้บริหารตรงกับสิ่งที่ครูแต่ละคนเห็นในหน้าของตัวเองเสมอ
// ═══════════════════════════════════════════════════════════════════════

// ── คำในหมายเหตุที่บ่งชี้ว่า "มาทำงานจริงแต่ไม่ได้สแกนนิ้ว" (ลงชื่อในสมุด ฯลฯ) ──
const NO_SCAN_NOTE_KEYWORDS = ["ลงชื่อ", "ลงลายมือชื่อ", "ไม่สแกน", "ไม่ได้สแกน", "เครื่องสแกนเสีย", "เครื่องขัดข้อง"];
function isNoScanNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return NO_SCAN_NOTE_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ★ ภารกิจนอกสถานที่ (ไปราชการ, ประชุมครู, เยี่ยมบ้านนักเรียน, ทัศนศึกษา, เข้าค่าย) ──
const OFFSITE_MISSION_KEYWORDS = ["ประชุมครู", "ประชุม", "ราชการ", "ทัศนศึกษา", "เข้าค่าย", "เยี่ยมบ้าน"];
function isOffsiteMissionNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return OFFSITE_MISSION_KEYWORDS.some((kw) => note.includes(kw));
}

// ── คำในหมายเหตุที่ "ไม่ต้องแสดงสถานะไม่สแกนนิ้ว" ทั้งฝั่งเข้า-ออก
//    เพราะเป็นภารกิจนอกโรงเรียน/มีเหตุสุดวิสัยที่ได้รับอนุญาตแล้ว ──
const NO_SCAN_EXEMPT_KEYWORDS = [
  "ประชุมครู", "ประชุม", "ราชการ", "ทัศนศึกษา", "เข้าค่าย", "ลากิจ", "ลาป่วย", "ไฟดับ", "เทศบาล", "ฉีดพ่นหมอกควัน",
];
function isNoScanExemptNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return NO_SCAN_EXEMPT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ขออนุญาตออกก่อนเวลา ไม่เกิน 3 ชม. ก่อน 16.30 น. (คือตั้งแต่ 13.30 น. เป็นต้นไป) ไม่ถือว่า "กลับก่อน" ──
const EARLY_LEAVE_PERMIT_KEYWORDS = ["ขออนุญาตออกก่อน", "ขออนุญาต ออกก่อน", "ออกก่อนเวลา"];
function isEarlyLeavePermitNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return EARLY_LEAVE_PERMIT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ขออนุญาต(เช้า): สแกนนิ้วช้ากว่า 07.45 น. แต่ไม่เกิน 08.45 น. ไม่ถือว่า "มาสาย" ──
const MORNING_LATE_PERMIT_KEYWORDS = ["ขออนุญาต(เช้า)", "ขออนุญาต (เช้า)", "ขออนุญาตเช้า"];
function isMorningLatePermitNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return MORNING_LATE_PERMIT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── เยี่ยมบ้าน: กลับก่อนเวลา 16.30 น. ไม่ถือว่า "กลับก่อนเวลา" ──
const HOME_VISIT_KEYWORDS = ["เยี่ยมบ้าน"];
function isHomeVisitNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return HOME_VISIT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ลาครึ่งวัน: ลาครึ่งเช้าต้องสแกน "กลับ" ตามปกติ (ไม่นับสแกนมา) / ลาครึ่งบ่ายต้องสแกน "เข้า" ตามปกติ (ไม่นับสแกนกลับ) ──
const HALF_DAY_MORNING_KEYWORDS = ["ครึ่งเช้า", "ครึ่งวันเช้า"];
const HALF_DAY_AFTERNOON_KEYWORDS = ["ครึ่งบ่าย", "ครึ่งวันบ่าย"];
function isHalfDayMorningLeave(note: string | null | undefined): boolean {
  if (!note) return false;
  return HALF_DAY_MORNING_KEYWORDS.some((kw) => note.includes(kw));
}
function isHalfDayAfternoonLeave(note: string | null | undefined): boolean {
  if (!note) return false;
  return HALF_DAY_AFTERNOON_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ยกเว้นเฉพาะฝั่งเข้า (เช้า) เท่านั้น — ฝั่งออก/บ่ายยังต้องสแกนออกตามปกติ (ไม่ยกเว้น) ──
const MORNING_ONLY_EXEMPT_KEYWORDS = ["ไปราชการ (เช้า)", "ไปราชการ(เช้า)", "ขออนุญาตเช้า(ฉุกเฉิน)", "ขออนุญาตเช้า (ฉุกเฉิน)"];
function isMorningOnlyExemptNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return MORNING_ONLY_EXEMPT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ยกเว้นเฉพาะฝั่งออก (เย็น) เท่านั้น — ฝั่งเข้า/เช้ายังต้องสแกนเข้าตามปกติ (ไม่ยกเว้น) ──
const EVENING_ONLY_EXEMPT_KEYWORDS = ["ขออนุญาตเย็น(ฉุกเฉิน)", "ขออนุญาตเย็น (ฉุกเฉิน)"];
function isEveningOnlyExemptNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return EVENING_ONLY_EXEMPT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ★ "ปฏิบัติงานตามภารกิจ" แยกฝั่งตามหมายเหตุ ──
function isMissionInSide(note: string | null | undefined): boolean {
  if (!isOffsiteMissionNote(note)) return false;
  if (isHalfDayAfternoonLeave(note)) return false;
  if (isEveningOnlyExemptNote(note)) return false;
  return true;
}
function isMissionOutSide(note: string | null | undefined): boolean {
  if (!isOffsiteMissionNote(note)) return false;
  if (isHalfDayMorningLeave(note)) return false;
  if (isMorningOnlyExemptNote(note)) return false;
  return true;
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

const STANDARD_END_MINUTES = 16 * 60 + 30; // 16.30 น.
const MORNING_LATE_PERMIT_START_MINUTES = 7 * 60 + 45; // 07.45 น.
const MORNING_LATE_PERMIT_END_MINUTES = 8 * 60 + 45; // 08.45 น.
const EARLY_LEAVE_PERMIT_START_MINUTES = STANDARD_END_MINUTES - 3 * 60; // 13.30 น.

function withinMorningLatePermitWindow(checkInTime: string | null | undefined): boolean {
  const mins = timeToMinutes(checkInTime);
  if (mins === null) return false;
  return mins > MORNING_LATE_PERMIT_START_MINUTES && mins <= MORNING_LATE_PERMIT_END_MINUTES;
}
function withinEarlyLeavePermitWindow(checkOutTime: string | null | undefined): boolean {
  const mins = timeToMinutes(checkOutTime);
  if (mins === null) return false;
  return mins >= EARLY_LEAVE_PERMIT_START_MINUTES && mins <= STANDARD_END_MINUTES;
}
function isBeforeStandardEndTime(checkOutTime: string | null | undefined): boolean {
  const mins = timeToMinutes(checkOutTime);
  if (mins === null) return false;
  return mins <= STANDARD_END_MINUTES;
}

// ── เวลาออกนี้ควรนับเป็น "กลับตรงเวลา" (ไม่ใช่กลับก่อน) หรือไม่ ──
function isEarlyLeaveExempted(note: string | null | undefined, checkOutTime: string | null | undefined): boolean {
  if (isMissionOutSide(note)) return true;
  if (isEarlyLeavePermitNote(note) && withinEarlyLeavePermitWindow(checkOutTime)) return true;
  if (isHomeVisitNote(note) && isBeforeStandardEndTime(checkOutTime)) return true;
  return false;
}
// ── เวลาเข้านี้ควรนับว่า "มาปฏิบัติงาน" (ไม่ใช่มาสาย) หรือไม่ ──
function isMorningLateExempted(note: string | null | undefined, checkInTime: string | null | undefined): boolean {
  if (isMissionInSide(note)) return true;
  return isMorningLatePermitNote(note) && withinMorningLatePermitWindow(checkInTime);
}

// ── ไม่แสดง "ไม่สแกนมา" ฝั่งเข้า เมื่อหมายเหตุเข้าเงื่อนไขยกเว้น ──
function isNoScanInExempted(note: string | null | undefined): boolean {
  if (!note) return false;
  if (isHalfDayAfternoonLeave(note)) return false;
  if (isEveningOnlyExemptNote(note)) return false;
  return isNoScanExemptNote(note) || isMorningOnlyExemptNote(note);
}
// ── ไม่แสดง "ไม่สแกนกลับ" ฝั่งออก เมื่อหมายเหตุเข้าเงื่อนไขยกเว้น ──
function isNoScanOutExempted(note: string | null | undefined): boolean {
  if (!note) return false;
  if (isHalfDayMorningLeave(note)) return false;
  if (isMorningOnlyExemptNote(note)) return false;
  return isNoScanExemptNote(note) || isEveningOnlyExemptNote(note);
}

// ── ตัดสินว่า "ไม่สแกนมา" (checkIn ขาดหาย) ──
function isNoScanIn(row: { check_in_time: string | null; note: string | null; status: string | null }, onLeave: boolean): boolean {
  if (row.check_in_time) return false;
  if (onLeave || row.status === "leave") return false;
  if (isMissionInSide(row.note)) return false;
  if (isNoScanInExempted(row.note)) return false;
  if (!row.note) return true;
  return isNoScanNote(row.note);
}
// ── ตัดสินว่า "ไม่สแกนกลับ" (checkOut ขาดหาย) ──
function isNoScanOut(row: { check_out_time: string | null; note: string | null; status: string | null }, onLeave: boolean): boolean {
  if (row.check_out_time) return false;
  if (onLeave || row.status === "leave") return false;
  if (isMissionOutSide(row.note)) return false;
  if (isNoScanOutExempted(row.note)) return false;
  if (!row.note) return true;
  return isNoScanNote(row.note);
}

// ── สถานะ "ที่มีผลจริง" หลังหักข้อยกเว้นจากหมายเหตุแล้ว — ใช้นับสถิติ มาสาย/กลับก่อน ──
function effectiveStatus(r: { status: string | null; note: string | null; check_in_time: string | null; check_out_time: string | null }): string | null {
  const s = r.status;
  if (s !== "present" && s !== "late" && s !== "left_early" && s !== "late_and_left_early") return s;
  const late = (s === "late" || s === "late_and_left_early") && !isMorningLateExempted(r.note, r.check_in_time);
  const early = (s === "left_early" || s === "late_and_left_early") && !isEarlyLeaveExempted(r.note, r.check_out_time);
  if (late && early) return "late_and_left_early";
  if (late) return "late";
  if (early) return "left_early";
  return "present";
}

// ── ตัดข้อความหมายเหตุที่ซ้ำกันออก (เอามาจากหน้า portfolio) ──
function normalizeNoteText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function dedupeNoteParts(parts: (string | null | undefined)[]): string[] {
  const cleaned = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  const result: string[] = [];
  const seen: string[] = [];
  for (const part of cleaned) {
    const norm = normalizeNoteText(part);
    const isDuplicate = seen.some((s) => s === norm || s.includes(norm) || norm.includes(s));
    if (isDuplicate) continue;
    result.push(part);
    seen.push(norm);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// ครึ่งปีงบประมาณ: ครึ่งแรก = ต.ค.(ปีก่อน)–มี.ค. / ครึ่งหลัง = เม.ย.–ก.ย.
// fy = ปีงบประมาณ (ค.ศ. ของช่วง ม.ค.–ก.ย. ของปีงบนั้น)
// ═══════════════════════════════════════════════════════════════════════
type Half = 1 | 2;
type Period = { fy: number; half: Half };

function periodRange(p: Period): { start: string; end: string } {
  if (p.half === 1) return { start: `${p.fy - 1}-10-01`, end: `${p.fy}-03-31` };
  return { start: `${p.fy}-04-01`, end: `${p.fy}-09-30` };
}
function currentPeriod(todayStr: string): Period {
  const y = Number(todayStr.slice(0, 4));
  const m = Number(todayStr.slice(5, 7));
  if (m >= 10) return { fy: y + 1, half: 1 };
  if (m <= 3) return { fy: y, half: 1 };
  return { fy: y, half: 2 };
}
function periodLabel(p: Period): string {
  const be = p.fy + 543;
  if (p.half === 1) return `ปีงบ ${be} · ครึ่งปีแรก (ต.ค. ${be - 1} – มี.ค. ${be})`;
  return `ปีงบ ${be} · ครึ่งปีหลัง (เม.ย. – ก.ย. ${be})`;
}
const periodKey = (p: Period) => `${p.fy}-${p.half}`;

type TeacherRow = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  role: string | null;
  email: string | null;
  position: string | null;
  avatar_url: string | null;
  subject_group: string | null;
  department: { name: string } | null;
  // TODO: ยืนยันชื่อความสัมพันธ์/คอลัมน์กับตาราง grade_levels จริง ยังไม่พบใน schema ที่ให้มา
  grade_level: { name: string } | null;
};

type AttendanceInfo = {
  check_in_time: string | null;
  check_out_time: string | null;
};

type EnrichedRow = {
  user_id: string;
  work_date: string;
  status: string | null;
  note: string | null;
  leave_reason: string | null;
};
type TimesRow = {
  user_id: string;
  work_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  note: string | null;
};
type LeaveRow = { user_id: string; start_date: string; end_date: string };

type StatsRaw = {
  enriched: EnrichedRow[];
  times: TimesRow[];
  onLeaveRows: LeaveRow[];
  holidayMap: HolidayMap;
};

type TeacherStat = {
  teacher: TeacherRow;
  late: number;
  early: number;
  noIn: number;
  noOut: number;
  total: number;
};

type SortKey = "late" | "early" | "noIn" | "noOut" | "total" | "name";
type SortDir = "asc" | "desc";

const SORT_LABEL: Record<SortKey, string> = {
  late: "มาสาย",
  early: "กลับก่อน",
  noIn: "ไม่สแกนมา",
  noOut: "ไม่สแกนกลับ",
  total: "รวมทั้งหมด",
  name: "ชื่อ",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  director: "ผู้อำนวยการ",
  deputy_director: "รองผู้อำนวยการ",
  staff: "เจ้าหน้าที่",
  homeroom_teacher: "ครูประจำชั้น",
  subject_teacher: "ครูผู้สอน",
  dept_head: "หัวหน้ากลุ่มสาระ",
  grade_head: "หัวหน้าสายชั้น",
};

// ตรวจว่าเป็นอักษรไทยหรือไม่ เพื่อใช้เรียง ก-ฮ ก่อน แล้วตามด้วย a-z
function isThaiName(name: string): boolean {
  return /[\u0E00-\u0E7F]/.test(name);
}

function compareTeacherNames(a: TeacherRow, b: TeacherRow): number {
  const aName = a.first_name || "";
  const bName = b.first_name || "";
  const aThai = isThaiName(aName);
  const bThai = isThaiName(bName);
  if (aThai && !bThai) return -1;
  if (!aThai && bThai) return 1;
  if (aThai && bThai) return aName.localeCompare(bName, "th");
  return aName.localeCompare(bName, "en", { sensitivity: "base" });
}

export default function AdminTeachersListPage() {
  const router = useRouter();
  const supabase = createClient();

  const todayStr = useMemo(() => bangkokDateStr(), []);

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [onLeaveToday, setOnLeaveToday] = useState<Set<string>>(new Set());
  const [attendanceToday, setAttendanceToday] = useState<Map<string, AttendanceInfo>>(new Map());

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");

  // ── สถิติการลงเวลา ──
  const [activeTab, setActiveTab] = useState<"list" | "stats">("list");
  const [period, setPeriod] = useState<Period>(() => currentPeriod(bangkokDateStr()));
  const [statsData, setStatsData] = useState<StatsRaw | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("late");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const statsReq = useRef(0);

  useEffect(() => {
    checkAccessAndLoad();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkAccessAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: myRow } = await supabase.from("users").select("role").eq("auth_id", user.id).maybeSingle();
    const ok = isAdminViewer(myRow?.role, user.email);
    setAllowed(ok);
    setChecking(false);
    if (!ok) return;

    setLoading(true);
    const today = todayStr;

    const [{ data: teacherRows }, { data: leaves }, { data: attendanceRows }] = await Promise.all([
      supabase
        .from("users")
        .select(
  "id, title, first_name, last_name, role, email, position, avatar_url, subject_group, department:departments!users_department_id_fkey(name), grade_level:grade_levels!users_grade_level_fkey(name)"
)
        .order("first_name", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("user_id")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),
      supabase
        .from(ATTENDANCE_TABLE)
        .select(`user_id, ${ATTENDANCE_CHECKIN_COL}, ${ATTENDANCE_CHECKOUT_COL}`)
        .eq(ATTENDANCE_DATE_COL, today),
    ]);

    // เอาโรลที่เป็นแอดมิน/ผู้บริหาร และบัญชีที่อีเมลมีคำว่า "admin" ออกจากรายชื่อครูทั้งหมด
    const teacherOnly = ((teacherRows as unknown as TeacherRow[]) || []).filter(
      (t) => !isAdminAccount({ role: t.role, email: t.email })
    );

    setTeachers(teacherOnly);
    setOnLeaveToday(new Set((leaves || []).map((r: any) => r.user_id)));

    const attMap = new Map<string, AttendanceInfo>();
    (attendanceRows || []).forEach((r: any) => {
      attMap.set(r.user_id, {
        check_in_time: r[ATTENDANCE_CHECKIN_COL] ?? null,
        check_out_time: r[ATTENDANCE_CHECKOUT_COL] ?? null,
      });
    });
    setAttendanceToday(attMap);

    setLoading(false);
  }

  // โหลดข้อมูลสถิติเมื่อเปิดแท็บสถิติ หรือเปลี่ยนช่วงครึ่งปี
  useEffect(() => {
    if (!allowed || activeTab !== "stats") return;
    loadStats(period);
  }, [allowed, activeTab, period.fy, period.half]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStats(p: Period) {
    const reqId = ++statsReq.current;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const { start, end } = periodRange(p);
      const to = end < todayStr ? end : todayStr;

      // ★ ดึง "สถานะที่ประมวลผลแล้ว" (v_attendance_enriched) + เวลาเข้า-ออกจริง + ใบลาที่อนุมัติแล้ว + วันหยุด
      //    ทั้งหมดในช่วงเวลาเดียว (ไม่กรองทีละคน) แล้วค่อยแยกคำนวณรายคนภายหลัง เพื่อลดจำนวนคำขอ
      const [enriched, times, onLeaveRows, holidayMap] = await Promise.all([
        fetchAllRows((from, toIdx) =>
          supabase
            .from(ENRICHED_VIEW)
            .select("user_id,work_date,status,note,leave_reason")
            .gte("work_date", start)
            .lte("work_date", to)
            .range(from, toIdx)
        ),
        fetchAllRows((from, toIdx) =>
          supabase
            .from(ATTENDANCE_TABLE)
            .select(`user_id, ${ATTENDANCE_DATE_COL}, ${ATTENDANCE_CHECKIN_COL}, ${ATTENDANCE_CHECKOUT_COL}, note`)
            .gte(ATTENDANCE_DATE_COL, start)
            .lte(ATTENDANCE_DATE_COL, to)
            .range(from, toIdx)
        ),
        fetchAllRows((from, toIdx) =>
          supabase
            .from("leave_requests")
            .select("user_id,start_date,end_date")
            .eq("status", "approved")
            .lte("start_date", to)
            .gte("end_date", start)
            .range(from, toIdx)
        ),
        fetchHolidayMap(start, to),
      ]);

      if (reqId !== statsReq.current) return; // มีคำขอใหม่กว่าแล้ว
      setStatsData({
        enriched: enriched as EnrichedRow[],
        times: times as TimesRow[],
        onLeaveRows: onLeaveRows as LeaveRow[],
        holidayMap: (holidayMap as HolidayMap) || new Map(),
      });
    } catch (e: any) {
      if (reqId !== statsReq.current) return;
      setStatsData(null);
      setStatsError(e?.message ?? "โหลดข้อมูลสถิติไม่สำเร็จ");
    } finally {
      if (reqId === statsReq.current) setStatsLoading(false);
    }
  }

  // ── คำนวณสถิติรายคน โดยใช้เงื่อนไขเดียวกับหน้า portfolio ทุกประการ (มติ/ภารกิจ/ขออนุญาต/ลาครึ่งวัน ฯลฯ) ──
  const statsComputed = useMemo(() => {
    if (!statsData) return null;
    const { start, end } = periodRange(period);
    const last = end < todayStr ? end : todayStr;
    if (start > last) return { workingDays: 0, stats: [] as TeacherStat[] };

    const teacherIds = new Set(teachers.map((t) => t.id));

    const enrichedByUser = new Map<string, Map<string, EnrichedRow>>();
    for (const r of statsData.enriched) {
      if (!teacherIds.has(r.user_id)) continue;
      const date = String(r.work_date).slice(0, 10);
      let m = enrichedByUser.get(r.user_id);
      if (!m) { m = new Map(); enrichedByUser.set(r.user_id, m); }
      m.set(date, r);
    }
    const timesByUser = new Map<string, Map<string, TimesRow>>();
    for (const r of statsData.times) {
      if (!teacherIds.has(r.user_id)) continue;
      const date = String(r.work_date).slice(0, 10);
      let m = timesByUser.get(r.user_id);
      if (!m) { m = new Map(); timesByUser.set(r.user_id, m); }
      m.set(date, r);
    }

    // ใบลาที่อนุมัติแล้ว → กระจายเป็นชุดวันที่ต่อคน
    const onLeaveByUser = new Map<string, Set<string>>();
    for (const l of statsData.onLeaveRows) {
      const ls = String(l.start_date).slice(0, 10);
      const le = String(l.end_date).slice(0, 10);
      const from = ls > start ? ls : start;
      const to = le < last ? le : last;
      if (from > to) continue;
      let set = onLeaveByUser.get(l.user_id);
      if (!set) { set = new Set(); onLeaveByUser.set(l.user_id, set); }
      for (const d of eachDate(from, to)) set.add(d);
    }

    // วันทำการ = จันทร์–ศุกร์ ที่ไม่ใช่วันหยุดตามปฏิทินวันหยุดของโรงเรียน
    const workingDays = eachDate(start, last).filter((d) => isWeekday(d) && !isHoliday(d, statsData.holidayMap));

    const stats: TeacherStat[] = teachers.map((t) => {
      let late = 0, early = 0, noIn = 0, noOut = 0;
      const eByDate = enrichedByUser.get(t.id);
      const tByDate = timesByUser.get(t.id);
      const leaveSet = onLeaveByUser.get(t.id);
      for (const d of workingDays) {
        const e = eByDate?.get(d);
        // ★ วันที่ยังไม่มีข้อมูลเข้าสู่ระบบ (ยังไม่ sync/ประมวลผล) ถือเป็น "รอข้อมูล" ไม่นำมานับสถิติ — เหมือนหน้า portfolio
        if (!e) continue;
        const tm = tByDate?.get(d);
        const onLeave = leaveSet?.has(d) ?? false;
        const note = dedupeNoteParts([e.leave_reason, e.note, tm?.note]).join(" · ") || null;
        const check_in_time = tm?.check_in_time ?? null;
        const check_out_time = tm?.check_out_time ?? null;
        const status = e.status ?? null;

        const eff = effectiveStatus({ status, note, check_in_time, check_out_time });
        if (eff === "late" || eff === "late_and_left_early") late++;
        if (eff === "left_early" || eff === "late_and_left_early") early++;
        if (isNoScanIn({ check_in_time, note, status }, onLeave)) noIn++;
        if (isNoScanOut({ check_out_time, note, status }, onLeave)) noOut++;
      }
      return { teacher: t, late, early, noIn, noOut, total: late + early + noIn + noOut };
    });

    return { workingDays: workingDays.length, stats };
  }, [statsData, teachers, period, todayStr]);

  const gradeLevels = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => t.grade_level?.name && set.add(t.grade_level.name));
    return Array.from(set).sort();
  }, [teachers]);

  function matchesFilters(t: TeacherRow): boolean {
    const q = search.trim().toLowerCase();
    const matchesGrade = gradeFilter === "all" || t.grade_level?.name === gradeFilter;
    const fullName = `${t.first_name} ${t.last_name}`.toLowerCase();
    const matchesSearch = !q || fullName.includes(q) || (t.position ?? "").toLowerCase().includes(q);
    return matchesGrade && matchesSearch;
  }

  const filteredTeachers = useMemo(() => {
    return teachers.filter(matchesFilters).sort(compareTeacherNames);
  }, [teachers, search, gradeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStats = useMemo(() => {
    if (!statsComputed) return [];
    const list = statsComputed.stats.filter((s) => matchesFilters(s.teacher));
    const dir = sortDir === "desc" ? -1 : 1;
    return list.sort((a, b) => {
      if (sortKey === "name") {
        // asc = ก→ฮ, desc = ฮ→ก
        return (sortDir === "asc" ? 1 : -1) * compareTeacherNames(a.teacher, b.teacher);
      }
      const diff = (a[sortKey] - b[sortKey]) * dir;
      if (diff !== 0) return diff;
      // เท่ากัน: เรียงตามจำนวนรวมมาก→น้อย แล้วตามชื่อ ก-ฮ
      if (a.total !== b.total) return b.total - a.total;
      return compareTeacherNames(a.teacher, b.teacher);
    });
  }, [statsComputed, search, gradeFilter, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const statsTotals = useMemo(() => {
    return sortedStats.reduce(
      (acc, s) => ({
        late: acc.late + s.late,
        early: acc.early + s.early,
        noIn: acc.noIn + s.noIn,
        noOut: acc.noOut + s.noOut,
      }),
      { late: 0, early: 0, noIn: 0, noOut: 0 }
    );
  }, [sortedStats]);

  const stats = useMemo(() => {
    const total = teachers.length;
    const leaveCount = teachers.filter((t) => onLeaveToday.has(t.id)).length;
    return { total, presentCount: total - leaveCount };
  }, [teachers, onLeaveToday]);

  // ตัวเลือกช่วงครึ่งปี: ปีงบปัจจุบัน + ย้อนหลัง 3 ปี (ไม่รวมช่วงที่ยังไม่เริ่ม)
  const periodOptions = useMemo(() => {
    const cur = currentPeriod(todayStr);
    const out: Period[] = [];
    for (let fy = cur.fy; fy >= cur.fy - 3; fy--) {
      for (const half of [2, 1] as Half[]) {
        const p = { fy, half };
        if (periodRange(p).start <= todayStr) out.push(p);
      }
    }
    return out;
  }, [todayStr]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso; // เผื่อคอลัมน์เป็น time string เช่น "08:15:00" อยู่แล้ว
      return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  function renderStatus(t: TeacherRow) {
    if (onLeaveToday.has(t.id)) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-600">
          🔵 ลาวันนี้
        </span>
      );
    }
    const att = attendanceToday.get(t.id);
    if (att?.check_in_time) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          ลงเวลาแล้ว {formatTime(att.check_in_time)}
          {att.check_out_time ? ` – ${formatTime(att.check_out_time)}` : ""}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
        <XCircle className="w-3.5 h-3.5" />
        ยังไม่ลงเวลา
      </span>
    );
  }

  // ปุ่มหัวคอลัมน์ที่กดเรียงลำดับได้
  function renderSortHeader(label: string, key: SortKey, icon: React.ReactNode, align: "left" | "center" = "center") {
    const active = sortKey === key;
    return (
      <th className={`px-3 py-3 font-black text-xs ${align === "center" ? "text-center" : "text-left"}`}>
        <button
          onClick={() => handleSort(key)}
          className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-800 ${active ? "text-blue-600" : "text-slate-500"}`}
        >
          {icon}
          {label}
          {active ? (
            sortDir === "desc" ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-40" />
          )}
        </button>
      </th>
    );
  }

  function renderCount(n: number, tone: "amber" | "orange" | "red" | "rose", highlight: boolean) {
    if (n === 0) return <span className="text-slate-300 font-bold">0</span>;
    const tones = {
      amber: "bg-amber-50 text-amber-700",
      orange: "bg-orange-50 text-orange-700",
      red: "bg-red-50 text-red-700",
      rose: "bg-rose-50 text-rose-700",
    } as const;
    return (
      <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded-lg text-sm font-black ${tones[tone]} ${highlight ? "ring-2 ring-offset-1 ring-blue-300" : ""}`}>
        {n}
      </span>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-3">
        <p className="font-bold">🔒 ขออภัย หน้านี้จำกัดสิทธิ์เฉพาะผู้บริหาร/ผู้ดูแลระบบเท่านั้น</p>
        <button onClick={() => router.push("/dashboard")} className="text-sm font-bold text-blue-600 hover:underline">
          กลับไปหน้าแดชบอร์ด
        </button>
      </div>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const showMedals = sortKey !== "name" && sortDir === "desc";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 font-sans antialiased">
      <main className="w-full px-4 py-6 md:px-8 md:py-8 lg:px-12 lg:py-10 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg shadow-sm"
          >
            🏠
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> แดชบอร์ด
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-800 font-extrabold">ข้อมูลครูทั้งหมด</span>
        </div>

        {/* แท็บ */}
        <div className="inline-flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("list")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              activeTab === "list" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <List className="w-4 h-4" /> รายชื่อครู
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              activeTab === "stats" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart3 className="w-4 h-4" /> สถิติการลงเวลา
          </button>
        </div>

        {/* สรุปภาพรวม (แท็บรายชื่อ) */}
        {activeTab === "list" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400">ครูทั้งหมด</p>
                <p className="text-2xl font-black text-slate-800">{stats.total} คน</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400">อยู่ปฏิบัติงานวันนี้</p>
                <p className="text-2xl font-black text-emerald-600">{stats.presentCount} คน</p>
              </div>
            </div>
          </div>
        )}

        {/* ตัวกรอง (ใช้ร่วมกันทั้งสองแท็บ) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / ตำแหน่ง..."
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">ทุกสายชั้น</option>
            {gradeLevels.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* ───────────── แท็บ: รายชื่อครู ───────────── */}
        {activeTab === "list" && (
          loading ? (
            <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filteredTeachers.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm">ไม่พบครูที่ตรงกับเงื่อนไข</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-black text-slate-500 text-xs">ชื่อ</th>
                      <th className="text-left px-4 py-3 font-black text-slate-500 text-xs hidden sm:table-cell">สายชั้น</th>
                      <th className="text-left px-4 py-3 font-black text-slate-500 text-xs">สถานะการลงเวลาวันนี้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => router.push(`/admin/teachers/${t.id}`)}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center overflow-hidden shrink-0">
                              {t.avatar_url ? <img src={t.avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-slate-800 truncate">
                                {t.title}{t.first_name} {t.last_name}
                              </p>
                              <p className="text-xs text-slate-400 truncate">{t.position || ROLE_LABEL[t.role ?? ""] || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {t.grade_level?.name ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                              <GraduationCap className="w-3 h-3" /> {t.grade_level.name}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{renderStatus(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* ───────────── แท็บ: สถิติการลงเวลา ───────────── */}
        {activeTab === "stats" && (
          <div className="space-y-4">
            {/* เลือกช่วงเวลา + การเรียงลำดับ */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <label className="text-xs font-black text-slate-400 shrink-0">ช่วงเวลา</label>
                <select
                  value={periodKey(period)}
                  onChange={(e) => {
                    const [fy, half] = e.target.value.split("-").map(Number);
                    setPeriod({ fy, half: half as Half });
                  }}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-full sm:w-auto"
                >
                  {periodOptions.map((p) => (
                    <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-black text-slate-400 shrink-0">เรียงตาม</label>
                <select
                  value={sortKey}
                  onChange={(e) => {
                    const k = e.target.value as SortKey;
                    setSortKey(k);
                    setSortDir(k === "name" ? "asc" : "desc");
                  }}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABEL[k]}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                  className="inline-flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 bg-white hover:bg-slate-50"
                >
                  {sortDir === "desc" ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                  {sortKey === "name" ? (sortDir === "asc" ? "ก → ฮ" : "ฮ → ก") : sortDir === "desc" ? "มาก → น้อย" : "น้อย → มาก"}
                </button>
              </div>
            </div>

            {statsLoading ? (
              <div className="flex flex-col items-center gap-2 py-20 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs font-bold">กำลังคำนวณสถิติ...</span>
              </div>
            ) : statsError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5 text-sm font-bold">
                <p>โหลดข้อมูลสถิติไม่สำเร็จ: {statsError}</p>
                <button onClick={() => loadStats(period)} className="mt-2 text-blue-600 hover:underline">ลองอีกครั้ง</button>
              </div>
            ) : !statsComputed ? null : (
              <>
                {/* การ์ดสรุปรวม */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "มาสาย", value: statsTotals.late, cls: "bg-amber-100 text-amber-700", Icon: Clock },
                    { label: "กลับก่อน", value: statsTotals.early, cls: "bg-orange-100 text-orange-700", Icon: LogOut },
                    { label: "ไม่สแกนมา", value: statsTotals.noIn, cls: "bg-red-100 text-red-700", Icon: LogIn },
                    { label: "ไม่สแกนกลับ", value: statsTotals.noOut, cls: "bg-rose-100 text-rose-700", Icon: AlertTriangle },
                  ].map(({ label, value, cls, Icon }) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400">{label} (รวมทุกคน)</p>
                        <p className="text-xl font-black text-slate-800">{value.toLocaleString("th-TH")} <span className="text-xs font-bold text-slate-400">ครั้ง</span></p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs font-bold text-slate-500">
                  {periodLabel(period)} · วันทำการทั้งหมด {statsComputed.workingDays} วัน (นับเฉพาะวันที่มีข้อมูลเข้าระบบแล้วต่อคน) · แสดง {sortedStats.length} คน
                </p>

                {sortedStats.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 text-sm">ไม่พบครูที่ตรงกับเงื่อนไข</div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-center px-3 py-3 font-black text-slate-500 text-xs w-12">#</th>
                            {renderSortHeader("ชื่อ", "name", null, "left")}
                            <th className="text-left px-3 py-3 font-black text-slate-500 text-xs hidden md:table-cell">สายชั้น</th>
                            {renderSortHeader("มาสาย", "late", <Clock className="w-3.5 h-3.5" />)}
                            {renderSortHeader("กลับก่อน", "early", <LogOut className="w-3.5 h-3.5" />)}
                            {renderSortHeader("ไม่สแกนมา", "noIn", <LogIn className="w-3.5 h-3.5" />)}
                            {renderSortHeader("ไม่สแกนกลับ", "noOut", <AlertTriangle className="w-3.5 h-3.5" />)}
                            {renderSortHeader("รวม", "total", null)}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedStats.map((s, idx) => {
                            const t = s.teacher;
                            const topRow = showMedals && idx < 3 && s[sortKey as Exclude<SortKey, "name">] > 0;
                            return (
                              <tr
                                key={t.id}
                                onClick={() => router.push(`/admin/teachers/${t.id}`)}
                                className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors ${topRow ? "bg-amber-50/40" : ""}`}
                              >
                                <td className="px-3 py-3 text-center text-xs font-black text-slate-400">
                                  {topRow ? <span className="text-base">{medals[idx]}</span> : idx + 1}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center overflow-hidden shrink-0">
                                      {t.avatar_url ? <img src={t.avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4" />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-extrabold text-slate-800 truncate">{t.title}{t.first_name} {t.last_name}</p>
                                      <p className="text-xs text-slate-400 truncate">{t.position || ROLE_LABEL[t.role ?? ""] || "—"}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 hidden md:table-cell">
                                  {t.grade_level?.name ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                      <GraduationCap className="w-3 h-3" /> {t.grade_level.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center">{renderCount(s.late, "amber", sortKey === "late")}</td>
                                <td className="px-3 py-3 text-center">{renderCount(s.early, "orange", sortKey === "early")}</td>
                                <td className="px-3 py-3 text-center">{renderCount(s.noIn, "red", sortKey === "noIn")}</td>
                                <td className="px-3 py-3 text-center">{renderCount(s.noOut, "rose", sortKey === "noOut")}</td>
                                <td className="px-3 py-3 text-center font-black text-slate-700">{s.total}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* เกณฑ์การนับ */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 leading-relaxed space-y-1">
                  <p className="font-black text-slate-600">เกณฑ์การนับ (ใช้กฎเดียวกับหน้าประวัติส่วนตัวของครูแต่ละคนทุกประการ)</p>
                  <p>มาสาย / กลับก่อน อ้างอิงจากสถานะที่ระบบประมวลผลแล้ว (v_attendance_enriched) หลังหักข้อยกเว้นจากหมายเหตุ เช่น ปฏิบัติงานตามภารกิจ (ราชการ/ประชุม/ทัศนศึกษา/เข้าค่าย/เยี่ยมบ้าน) ขออนุญาตเช้า/ออกก่อน ลาครึ่งวัน</p>
                  <p>ไม่สแกนมา / ไม่สแกนกลับ = วันทำการที่ไม่มีเวลาเข้า / เวลาออก และไม่เข้าเงื่อนไขยกเว้นข้างต้น</p>
                  <p>ไม่นับวันเสาร์–อาทิตย์ วันหยุดตามปฏิทินโรงเรียน วันที่มีใบลาอนุมัติแล้ว และวันที่ยังไม่มีข้อมูลเข้าระบบ (รอข้อมูล/ยังไม่ sync)</p>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}