"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, User, Phone, MessageCircle, GraduationCap, CalendarDays,
  Trophy, FolderOpen, Loader2, ClipboardList, Clock, AlertCircle, FileText,
} from "lucide-react";
import { fetchHolidayMap, isHoliday, HolidayMap } from "@/lib/holidays";

function currentFiscalYear() {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  return now.getMonth() >= 9 ? beYear + 1 : beYear;
}

type Profile = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  line_id: string | null;
  avatar_url: string | null;
  education_level: string | null;
  education_major: string | null;
  education_school: string | null;
  subject_group: string | null;
  position: string | null;
  department_id: string | null;
  department?: { name: string } | null;
  homeroom?: { room_name: string }[] | null;
  homeroom_teacher_2?: { room_name: string }[] | null;
};

type LeaveSummaryRow = { leave_type: string; total_days: number; used_days: number; remaining_days: number };
type Training = { id: string; title: string; organizer: string | null; hours: number | null; training_date: string | null; certificate_url: string | null };
type Award = { id: string; title: string; award_level: string | null; date_received: string | null };
type Material = { id: string; title: string; subject_group: string | null; created_at: string };
type SupportRequest = { id: string; subject: string; message: string; status: string; created_at: string };

// ── แถวข้อมูลการลงเวลาที่ "รวมแล้ว" จาก 2 แหล่ง:
//    1) v_attendance_enriched  -> status, late/early minutes, note, leave
//    2) teacher_attendance_records -> check_in_time, check_out_time จริง
type AttendanceRow = {
  work_date: string;
  status: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  eval_round: number;
  check_in_time: string | null;
  check_out_time: string | null;
  note: string | null;
  hasEnrichedRow: boolean; // ★ ใช้แยก "ยังไม่มีข้อมูลเข้ามาในระบบ (รอข้อมูล)" ออกจาก "มีข้อมูลแล้วและขาดจริง"
};

const LEAVE_LABEL: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจ", maternity: "ลาคลอด" };

// ═══════════════════════════════════════════════════════════════════════
// คำในหมายเหตุ (note) และเงื่อนไขพิเศษต่าง ๆ — พอร์ตมาจากหน้า portfolio
// เพื่อให้การแสดงผลการลงเวลาตรงกันทั้งสองหน้า
// ═══════════════════════════════════════════════════════════════════════

// ── คำในหมายเหตุที่ "ไม่ถือว่าลา/ขาดงาน" (เช่น กิจกรรมของหน่วยงานภายนอก) ──
const EXCUSED_NOTE_KEYWORDS = ["ฉีดพ่นหมอกควัน", "เทศบาล"];
function isExcusedNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return EXCUSED_NOTE_KEYWORDS.some((kw) => note.includes(kw));
}

// ── คำในหมายเหตุที่บ่งชี้ว่า "มาทำงานจริงแต่ไม่ได้สแกนนิ้ว" (ลงชื่อในสมุด ฯลฯ) ──
const NO_SCAN_NOTE_KEYWORDS = ["ลงชื่อ", "ลงลายมือชื่อ", "ไม่สแกน", "ไม่ได้สแกน", "เครื่องสแกนเสีย", "เครื่องขัดข้อง"];
function isNoScanNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return NO_SCAN_NOTE_KEYWORDS.some((kw) => note.includes(kw));
}

// ── คำในหมายเหตุที่บ่งชี้ว่าออกไปราชการ/ประชุม แล้วนับเป็น "กลับตรงเวลา" แม้ไม่ได้สแกนขาออก ──
const MEETING_EXCUSE_KEYWORDS = ["ประชุมครู", "ประชุม", "ราชการ"];
function isMeetingExcuseNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return MEETING_EXCUSE_KEYWORDS.some((kw) => note.includes(kw));
}

// ── คำในหมายเหตุที่ "ไม่ต้องแสดงสถานะไม่แสกนนิ้ว" ทั้งฝั่งเข้า-ออก
//    เพราะเป็นภารกิจนอกโรงเรียน/มีเหตุสุดวิสัยที่ได้รับอนุญาตแล้ว (รวมผู้ยื่นขอไปและผู้ร่วมเดินทาง) ──
const NO_SCAN_EXEMPT_KEYWORDS = [
  "ประชุมครู",
  "ประชุม",
  "ราชการ",
  "ทัศนศึกษา",
  "เข้าค่าย",
  "ลากิจ",
  "ลาป่วย",
  "ไฟดับ",
  "เทศบาล",
  "ฉีดพ่นหมอกควัน",
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

// ── ขออนุญาต(เช้า): แสกนนิ้วช้ากว่า 07.45 น. แต่ไม่เกิน 08.45 น. ไม่ถือว่า "มาสาย" ──
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

// ── ลาครึ่งวัน: ใช้ร่วมกับ ไปราชการ/ลากิจ/ลาป่วย — ลาครึ่งเช้าต้องแสกน "กลับ" ตามปกติ (ไม่นับแสกนมา)
//    ลาครึ่งบ่ายต้องแสกน "เข้า" ตามปกติ (ไม่นับแสกนกลับ) ──
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

// ── ไปประกอบพิธีทางศาสนา: ต้องมีใบลากิจอนุมัติแล้วตรงวันที่ + ไม่มีเวลาเข้า-ออก ถึงจะนับเป็นสถานะนี้ ──
const RELIGIOUS_CEREMONY_KEYWORDS = ["ไปประกอบพิธีทางศาสนา", "ลาไปประกอบพิธี"];
function isReligiousCeremonyNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return RELIGIOUS_CEREMONY_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ยกเว้นเฉพาะฝั่งเข้า (เช้า) เท่านั้น — ฝั่งออก/บ่ายยังต้องแสกนออกตามปกติ (ไม่ยกเว้น)
//    ต้องเช็คคำเฉพาะเจาะจงเหล่านี้ "ก่อน" คำกว้างอย่าง "ราชการ"/"ประชุม" เสมอ ──
const MORNING_ONLY_EXEMPT_KEYWORDS = ["ไปราชการ (เช้า)", "ไปราชการ(เช้า)", "ขออนุญาตเช้า(ฉุกเฉิน)", "ขออนุญาตเช้า (ฉุกเฉิน)"];
function isMorningOnlyExemptNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return MORNING_ONLY_EXEMPT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── ยกเว้นเฉพาะฝั่งออก (เย็น) เท่านั้น — ฝั่งเข้า/เช้ายังต้องแสกนเข้าตามปกติ (ไม่ยกเว้น) ──
const EVENING_ONLY_EXEMPT_KEYWORDS = ["ขออนุญาตเย็น(ฉุกเฉิน)", "ขออนุญาตเย็น (ฉุกเฉิน)"];
function isEveningOnlyExemptNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return EVENING_ONLY_EXEMPT_KEYWORDS.some((kw) => note.includes(kw));
}

// ── แปลงเวลา "HH:mm[:ss]" เป็นจำนวนนาที เพื่อใช้เทียบช่วงเวลาที่ได้รับอนุญาตพิเศษ ──
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
const EARLY_LEAVE_PERMIT_START_MINUTES = STANDARD_END_MINUTES - 3 * 60; // 13.30 น. (ก่อน 16.30 ไม่เกิน 3 ชม.)

// ── เช็คว่าเวลาเข้าอยู่ในช่วงที่ "ขออนุญาต(เช้า)" คุ้มครอง (ช้ากว่า 07.45 แต่ไม่เกิน 08.45) ──
function withinMorningLatePermitWindow(checkInTime: string | null | undefined): boolean {
  const mins = timeToMinutes(checkInTime);
  if (mins === null) return false;
  return mins > MORNING_LATE_PERMIT_START_MINUTES && mins <= MORNING_LATE_PERMIT_END_MINUTES;
}

// ── เช็คว่าเวลาออกอยู่ในช่วงที่ "ขออนุญาตออกก่อน" คุ้มครอง (13.30 - 16.30 น.) ──
function withinEarlyLeavePermitWindow(checkOutTime: string | null | undefined): boolean {
  const mins = timeToMinutes(checkOutTime);
  if (mins === null) return false;
  return mins >= EARLY_LEAVE_PERMIT_START_MINUTES && mins <= STANDARD_END_MINUTES;
}

// ── เช็คว่าเวลาออกอยู่ก่อนเวลาเลิกงานมาตรฐาน (16.30 น.) — ใช้กับกรณี "เยี่ยมบ้าน" ──
function isBeforeStandardEndTime(checkOutTime: string | null | undefined): boolean {
  const mins = timeToMinutes(checkOutTime);
  if (mins === null) return false;
  return mins <= STANDARD_END_MINUTES;
}

// ── รวมเป็นฟังก์ชันเดียว: เวลาออกนี้ควรนับเป็น "กลับตรงเวลา" (ไม่ใช่กลับก่อน) หรือไม่ ตามเงื่อนไขที่ขออนุญาตไว้ ──
function isEarlyLeaveExempted(note: string | null | undefined, checkOutTime: string | null | undefined): boolean {
  if (isEarlyLeavePermitNote(note) && withinEarlyLeavePermitWindow(checkOutTime)) return true;
  if (isHomeVisitNote(note) && isBeforeStandardEndTime(checkOutTime)) return true;
  return false;
}

// ── รวมเป็นฟังก์ชันเดียว: เวลาเข้านี้ควรนับว่า "มาปฏิบัติงาน" (ไม่ใช่มาสาย) หรือไม่ ตามเงื่อนไขที่ขออนุญาตไว้ ──
function isMorningLateExempted(note: string | null | undefined, checkInTime: string | null | undefined): boolean {
  return isMorningLatePermitNote(note) && withinMorningLatePermitWindow(checkInTime);
}

// ── ไม่แสดง "ไม่แสกนมา" ฝั่งเข้า เมื่อหมายเหตุเข้าเงื่อนไขยกเว้น
//    ยกเว้น: ลาครึ่งบ่าย (ช่วงเช้ายังต้องแสกนเข้าปกติ) และ "ยกเว้นเฉพาะเย็น" (ฝั่งเช้ายังต้องแสกนเข้าปกติ) ──
function isNoScanInExempted(note: string | null | undefined): boolean {
  if (!note) return false;
  if (isHalfDayAfternoonLeave(note)) return false;
  if (isEveningOnlyExemptNote(note)) return false;
  return isNoScanExemptNote(note) || isMorningOnlyExemptNote(note);
}

// ── ไม่แสดง "ไม่แสกนกลับ" ฝั่งออก เมื่อหมายเหตุเข้าเงื่อนไขยกเว้น
//    ยกเว้น: ลาครึ่งเช้า (ช่วงบ่ายยังต้องแสกนออกปกติ) และ "ยกเว้นเฉพาะเช้า" (ฝั่งบ่ายยังต้องแสกนออกปกติ) ──
function isNoScanOutExempted(note: string | null | undefined): boolean {
  if (!note) return false;
  if (isHalfDayMorningLeave(note)) return false;
  if (isMorningOnlyExemptNote(note)) return false;
  return isNoScanExemptNote(note) || isEveningOnlyExemptNote(note);
}

// ── ตัดสินว่า "ไม่แสกนมา" (checkIn ขาดหาย) — เข้าเงื่อนไขนี้เมื่อไม่มีเวลาเข้า, ไม่ได้ลา,
//    ไม่เข้าเงื่อนไขยกเว้น และไม่มีหมายเหตุเลย หรือมีหมายเหตุที่บ่งชี้ว่ามาทำงานจริงแต่ไม่ได้สแกน ──
function isNoScanIn(row: { check_in_time: string | null; note: string | null; status: string | null }, onLeave: boolean): boolean {
  if (row.check_in_time) return false;
  if (onLeave || row.status === "leave") return false;
  if (isNoScanInExempted(row.note)) return false;
  if (!row.note) return true;
  return isNoScanNote(row.note);
}

// ── ตัดสินว่า "ไม่แสกนกลับ" (checkOut ขาดหาย) — เงื่อนไขเดียวกันฝั่งขาออก (ยกเว้นกรณีหมายเหตุประชุม/ราชการ ฯลฯ) ──
function isNoScanOut(row: { check_out_time: string | null; note: string | null; status: string | null }, onLeave: boolean): boolean {
  if (row.check_out_time) return false;
  if (onLeave || row.status === "leave") return false;
  if (isMeetingExcuseNote(row.note) && !isHalfDayMorningLeave(row.note) && !isMorningOnlyExemptNote(row.note)) return false; // นับเป็นกลับตรงเวลาแทน ไม่ใช่ไม่แสกน
  if (isNoScanOutExempted(row.note)) return false;
  if (!row.note) return true;
  return isNoScanNote(row.note);
}

// ── ตัดสินว่าวันนี้เป็น "ไปประกอบพิธีทางศาสนา" หรือไม่ — ต้องไม่มีเวลาเข้า-ออกทั้งคู่, ไม่ได้ลาในระบบทั่วไป (จะถูก override เป็นสถานะนี้แทน),
//    note ตรงคำที่กำหนด และวันนั้นต้องมีใบลากิจ (personal) ที่อนุมัติแล้วครอบคลุมวันที่นี้ ──
function isReligiousCeremonyDay(
  row: { check_in_time: string | null; check_out_time: string | null; note: string | null },
  hasApprovedPersonalLeave: boolean
): boolean {
  if (row.check_in_time || row.check_out_time) return false;
  if (!isReligiousCeremonyNote(row.note)) return false;
  return hasApprovedPersonalLeave;
}

const MONTH_LABEL: Record<number, string> = {
  1: "ม.ค.", 2: "ก.พ.", 3: "มี.ค.", 4: "เม.ย.", 5: "พ.ค.", 6: "มิ.ย.",
  7: "ก.ค.", 8: "ส.ค.", 9: "ก.ย.", 10: "ต.ค.", 11: "พ.ย.", 12: "ธ.ค.",
};
const FY_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// คำนวณปี ค.ศ. ของ "เดือนปีงบ" (10-12 อยู่ปีก่อนหน้าของ Jan-Sep) โดยอิงจากปีงบปัจจุบัน
function calendarYearForFiscalMonth(month: number) {
  const fy = currentFiscalYear();
  const baseYear = fy - 543;
  return month >= 10 ? baseYear - 1 : baseYear;
}

// ช่วงวันที่ (ค.ศ.) ของปีงบ ต.ค. ปีก่อนหน้า -> ก.ย. ปีปัจจุบัน — ใช้ query ตารางที่ไม่มีคอลัมน์ fiscal_year
function fiscalYearDateRange(fy: number) {
  const baseYear = fy - 543;
  const start = `${baseYear - 1}-10-01`;
  const end = `${baseYear}-09-30`;
  return { start, end };
}

function formatTimeHHmm(t?: string | null): string | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return t;
  return `${parts[0].padStart(2, "0")}.${parts[1].padStart(2, "0")}`;
}

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// สีตามสถานะ: เขียว = ปกติ, ส้ม = สาย/กลับก่อน, แดง = ไม่ได้ลงเวลา/ขาด, เทา = เป็นกลาง/รอข้อมูล, ม่วง = ไม่แสกน, ฟ้า = ลา
type Tone = "green" | "orange" | "red" | "slate" | "purple" | "blue";
const TONE_CLASSES: Record<Tone, { bg: string; text: string; iconBg: string }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100 text-emerald-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600", iconBg: "bg-orange-100 text-orange-600" },
  red: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100 text-rose-600" },
  slate: { bg: "bg-slate-50", text: "text-slate-500", iconBg: "bg-slate-100 text-slate-500" },
  purple: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100 text-violet-600" },
  blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100 text-blue-600" },
};

// ── ดึง "สถานะ" รายวันจาก view (status, late/early minutes, note, leave) ──
async function fetchEnrichedAttendance(supabase: any, userId: string, fy: number): Promise<Map<string, any>> {
  const { data, error } = await supabase
    .from("v_attendance_enriched")
    .select("work_date,status,late_minutes,early_leave_minutes,eval_round,note,leave_type,leave_reason")
    .eq("user_id", userId)
    .eq("fiscal_year", fy);
  const map = new Map<string, any>();
  if (error || !data) return map;
  data.forEach((r: any) => map.set(String(r.work_date).slice(0, 10), r));
  return map;
}

// ── ดึงเวลาเข้า-ออกจริงจาก teacher_attendance_records ──
async function fetchAttendanceTimes(supabase: any, userId: string, fy: number): Promise<Map<string, any>> {
  const { start, end } = fiscalYearDateRange(fy);
  const { data, error } = await supabase
    .from("teacher_attendance_records")
    .select("work_date,check_in_time,check_out_time,note,device_code")
    .eq("user_id", userId)
    .gte("work_date", start)
    .lte("work_date", end);
  const map = new Map<string, any>();
  if (error || !data) return map;
  data.forEach((r: any) => map.set(String(r.work_date).slice(0, 10), r));
  return map;
}

// ── เทียบข้อความหมายเหตุแบบ "ตัดช่องว่างหัวท้าย + ไม่สนตัวพิมพ์เล็กใหญ่" เพื่อใช้ตัดข้อความซ้ำ ──
function normalizeNoteText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── รวมชิ้นส่วนหมายเหตุจากหลายแหล่ง (leave_reason, note ของ enriched, note ของเครื่องสแกน)
//    โดยตัดข้อความที่ซ้ำกัน (คำเดียวกันเป๊ะ หรือชิ้นหนึ่งเป็นส่วนหนึ่งของอีกชิ้น) ออก ไม่ให้ขึ้นซ้ำ ──
function dedupeNoteParts(parts: (string | null | undefined)[]): string[] {
  const cleaned = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  const result: string[] = [];
  const seen: string[] = []; // เก็บ normalized text ของสิ่งที่เก็บไว้แล้ว
  for (const part of cleaned) {
    const norm = normalizeNoteText(part);
    const isDuplicate = seen.some((s) => s === norm || s.includes(norm) || norm.includes(s));
    if (isDuplicate) continue;
    result.push(part);
    seen.push(norm);
  }
  return result;
}

// ── รวม 2 แหล่งข้อมูลเป็น AttendanceRow เดียว โดยยึด union ของวันที่ทั้งสองฝั่ง ──
function mergeAttendance(enrichedMap: Map<string, any>, timesMap: Map<string, any>): AttendanceRow[] {
  const allDates = new Set<string>([...enrichedMap.keys(), ...timesMap.keys()]);
  return Array.from(allDates).map((date) => {
    const e = enrichedMap.get(date);
    const t = timesMap.get(date);
    // ★ ตัดหมายเหตุที่ซ้ำกันออก ป้องกันข้อความ "ขึ้น 2 รอบ" เมื่อ leave_reason/note/note เครื่องสแกน มีข้อความเดียวกัน
    const noteParts = dedupeNoteParts([e?.leave_reason, e?.note, t?.note]);
    return {
      work_date: date,
      status: e?.status ?? null,
      late_minutes: e?.late_minutes ?? 0,
      early_leave_minutes: e?.early_leave_minutes ?? 0,
      eval_round: e?.eval_round ?? 0,
      check_in_time: t?.check_in_time ?? null,
      check_out_time: t?.check_out_time ?? null,
      note: noteParts.length ? noteParts.join(" · ") : null,
      hasEnrichedRow: !!e,
    };
  });
}

// ── ดึงวันที่ที่มีใบลาอนุมัติแล้ว เพื่อใช้ตัดสินว่าวันที่ไม่ลงเวลาเป็น "ลาในระบบแล้ว" ไม่ใช่ "ขาดงาน" ──
async function fetchApprovedLeaveDates(supabase: any, userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("leave_requests")
      .select("start_date,end_date,status")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (error || !data) return new Set();
    const set = new Set<string>();
    data.forEach((r: any) => {
      if (!r.start_date || !r.end_date) return;
      const cursor = new Date(r.start_date);
      const end = new Date(r.end_date);
      while (cursor <= end) {
        set.add(toDateInputValue(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return set;
  } catch {
    return new Set();
  }
}

// ── ดึงวันที่ที่มี "ใบลากิจ" (personal) อนุมัติแล้วโดยเฉพาะ — ใช้เช็คเงื่อนไข "ไปประกอบพิธีทางศาสนา" ──
async function fetchApprovedPersonalLeaveDates(supabase: any, userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("leave_requests")
      .select("start_date,end_date,status,leave_type")
      .eq("user_id", userId)
      .eq("status", "approved")
      .eq("leave_type", "personal");
    if (error || !data) return new Set();
    const set = new Set<string>();
    data.forEach((r: any) => {
      if (!r.start_date || !r.end_date) return;
      const cursor = new Date(r.start_date);
      const end = new Date(r.end_date);
      while (cursor <= end) {
        set.add(toDateInputValue(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return set;
  } catch {
    return new Set();
  }
}

// ── รวมข้อความหมายเหตุ + สถานะการลาในระบบ (ตัดข้อความซ้ำอีกชั้น กันกรณี note มีคำว่า "ลาในระบบแล้ว" ติดมาแล้ว) ──
function buildRemark(note: string | null | undefined, onLeave: boolean): string | null {
  const parts = dedupeNoteParts([note, onLeave ? "ลาในระบบแล้ว" : null]);
  return parts.length ? parts.join(" · ") : null;
}

// ── สถานะกล่อง "มา" มุมมองรายวัน ──
function dayCheckInInfo(row: AttendanceRow | null | undefined, onLeave: boolean, isReligiousCeremony: boolean) {
  if (!row?.check_in_time) {
    // ลำดับความสำคัญ: ไปประกอบพิธีทางศาสนา > ลา > ยกเว้นเฉพาะเช้า > ยกเว้นตามภารกิจ (เต็มวัน) > ไม่แสกน > ไม่ได้ลงเวลา
    if (isReligiousCeremony) {
      return { time: null as string | null, label: "ไปประกอบพิธีทางศาสนา", tone: "blue" as Tone };
    }
    if (onLeave || row?.status === "leave") {
      return { time: null as string | null, label: "ลา", tone: "blue" as Tone };
    }
    if (isMorningOnlyExemptNote(row?.note)) {
      return { time: null as string | null, label: "ปฏิบัติงานตามภารกิจ", tone: "green" as Tone };
    }
    if (isNoScanInExempted(row?.note)) {
      return { time: null as string | null, label: "ปฏิบัติงานตามภารกิจ", tone: "green" as Tone };
    }
    if (isNoScanIn({ check_in_time: row?.check_in_time ?? null, note: row?.note ?? null, status: row?.status ?? null }, onLeave)) {
      return { time: null as string | null, label: "ไม่แสกนมา", tone: "purple" as Tone };
    }
    return { time: null as string | null, label: "ไม่ได้ลงเวลาเข้า", tone: "red" as Tone };
  }
  const isLateRaw = row.status === "late" || row.status === "late_and_left_early";
  const isLate = isLateRaw && !isMorningLateExempted(row.note, row.check_in_time);
  return {
    time: formatTimeHHmm(row.check_in_time),
    label: isLate ? `มาปฏิบัติงานสาย${row.late_minutes ? ` (${row.late_minutes} นาที)` : ""}` : "มาปฏิบัติงาน",
    tone: (isLate ? "orange" : "green") as Tone,
  };
}

// ── สถานะกล่อง "กลับ" มุมมองรายวัน ──
function dayCheckOutInfo(row: AttendanceRow | null | undefined, onLeave: boolean, isReligiousCeremony: boolean) {
  if (!row?.check_out_time) {
    // ลำดับความสำคัญ: ไปประกอบพิธีทางศาสนา > ลา > ประชุม/ราชการ (กลับตรงเวลา) > ยกเว้นเฉพาะเย็น > ยกเว้นตามภารกิจ (เต็มวัน) > ไม่แสกน > ไม่ได้ลงเวลา
    if (isReligiousCeremony) {
      return { time: null as string | null, label: "ไปประกอบพิธีทางศาสนา", tone: "blue" as Tone };
    }
    if (onLeave || row?.status === "leave") {
      return { time: null as string | null, label: "ลา", tone: "blue" as Tone };
    }
    if (isMeetingExcuseNote(row?.note) && !isHalfDayMorningLeave(row?.note) && !isMorningOnlyExemptNote(row?.note)) {
      return { time: null as string | null, label: "กลับตรงเวลา", tone: "green" as Tone };
    }
    if (isEveningOnlyExemptNote(row?.note)) {
      return { time: null as string | null, label: "ปฏิบัติงานตามภารกิจ", tone: "green" as Tone };
    }
    if (isNoScanOutExempted(row?.note)) {
      return { time: null as string | null, label: "ปฏิบัติงานตามภารกิจ", tone: "green" as Tone };
    }
    if (isNoScanOut({ check_out_time: row?.check_out_time ?? null, note: row?.note ?? null, status: row?.status ?? null }, onLeave)) {
      return { time: null as string | null, label: "ไม่แสกนกลับ", tone: "purple" as Tone };
    }
    return { time: null as string | null, label: "ไม่ได้ลงเวลากลับ", tone: "red" as Tone };
  }
  const isEarlyRaw = row.status === "left_early" || row.status === "late_and_left_early";
  const isEarly = isEarlyRaw && !isEarlyLeaveExempted(row.note, row.check_out_time);
  return {
    time: formatTimeHHmm(row.check_out_time),
    label: isEarly ? `กลับก่อนเวลา${row.early_leave_minutes ? ` (${row.early_leave_minutes} นาที)` : ""}` : "กลับตรงเวลา",
    tone: (isEarly ? "orange" : "green") as Tone,
  };
}

// ── สถานะ "เวลาเข้า" มุมมองรายเดือน ──
function monthlyCheckInStatus(
  row: { check_in_time: string | null; status: string | null; late_minutes: number; note: string | null },
  onLeave: boolean,
  isReligiousCeremony: boolean
) {
  if (!row.check_in_time) {
    if (isReligiousCeremony) return { text: "ไปประกอบพิธี", tone: "blue" as Tone };
    if (onLeave || row.status === "leave") return { text: "ลา", tone: "blue" as Tone };
    if (isMorningOnlyExemptNote(row.note)) return { text: "ตามภารกิจ", tone: "green" as Tone };
    if (isNoScanInExempted(row.note)) return { text: "ตามภารกิจ", tone: "green" as Tone };
    if (isNoScanIn(row, onLeave)) return { text: "ไม่แสกนมา", tone: "purple" as Tone };
    return { text: "ไม่ลงเวลา", tone: "red" as Tone };
  }
  const isLateRaw = row.status === "late" || row.status === "late_and_left_early";
  const isLate = isLateRaw && !isMorningLateExempted(row.note, row.check_in_time);
  if (isLate) return { text: `สาย${row.late_minutes ? ` ${row.late_minutes} นาที` : ""}`, tone: "orange" as Tone };
  return { text: "มาปฏิบัติงาน", tone: "green" as Tone };
}

// ── สถานะ "เวลาออก" มุมมองรายเดือน ──
function monthlyCheckOutStatus(
  row: { check_out_time: string | null; status: string | null; note: string | null },
  onLeave: boolean,
  isReligiousCeremony: boolean
) {
  if (!row.check_out_time) {
    if (isReligiousCeremony) return { text: "ไปประกอบพิธี", tone: "blue" as Tone };
    if (onLeave || row.status === "leave") return { text: "ลา", tone: "blue" as Tone };
    if (isMeetingExcuseNote(row.note) && !isHalfDayMorningLeave(row.note) && !isMorningOnlyExemptNote(row.note)) return { text: "กลับตรงเวลา", tone: "green" as Tone };
    if (isEveningOnlyExemptNote(row.note)) return { text: "ตามภารกิจ", tone: "green" as Tone };
    if (isNoScanOutExempted(row.note)) return { text: "ตามภารกิจ", tone: "green" as Tone };
    if (isNoScanOut(row, onLeave)) return { text: "ไม่แสกนกลับ", tone: "purple" as Tone };
    return { text: "ยังไม่ออกงาน", tone: "slate" as Tone };
  }
  const isEarlyRaw = row.status === "left_early" || row.status === "late_and_left_early";
  const isEarly = isEarlyRaw && !isEarlyLeaveExempted(row.note, row.check_out_time);
  if (isEarly) return { text: "กลับก่อนเวลา", tone: "orange" as Tone };
  return { text: "ออกงานแล้ว", tone: "green" as Tone };
}

export default function AdminTeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [period, setPeriod] = useState<"day" | "month" | "term" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<string>(() => toDateInputValue(new Date()));

  const [leaveSummary, setLeaveSummary] = useState<LeaveSummaryRow[]>([]);
  const [leaveCount, setLeaveCount] = useState<{ used_count: number; remaining_count: number } | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [onLeaveDates, setOnLeaveDates] = useState<Set<string>>(new Set());
  const [approvedPersonalLeaveDates, setApprovedPersonalLeaveDates] = useState<Set<string>>(new Set());
  const [holidayMap, setHolidayMap] = useState<HolidayMap>(new Map());

  const todayStr = useMemo(() => toDateInputValue(new Date()), []);

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const fy = currentFiscalYear();
    const { start, end } = fiscalYearDateRange(fy);
    const [
      { data: p },
      { data: ls },
      { data: cnt },
      { data: tr },
      { data: aw },
      { data: mat },
      { data: sr },
      enrichedMap,
      timesMap,
      onLeaveSet,
      approvedPersonalLeaveSet,
      holidays,
    ] = await Promise.all([
      supabase
        .from("users")
        .select(`
          id, title, first_name, last_name, role, phone, line_id, avatar_url,
          education_level, education_major, education_school, subject_group, position, department_id,
          department:departments(name),
          homeroom:classrooms!classrooms_homeroom_teacher_id_fkey(room_name), homeroom_teacher_2:classrooms!classrooms_homeroom_teacher_2_id_fkey(room_name)
        `)
        .eq("id", id)
        .maybeSingle(),
      supabase.from("v_leave_summary").select("leave_type,total_days,used_days,remaining_days").eq("user_id", id).eq("fiscal_year", fy),
      supabase.from("v_leave_count_summary").select("used_count,remaining_count").eq("user_id", id).eq("fiscal_year", fy).maybeSingle(),
      supabase.from("trainings").select("id,title,organizer,hours,training_date,certificate_url").eq("user_id", id).order("training_date", { ascending: false }),
      supabase
        .from("award_recipients")
        .select("award:awards(id,title,award_level,date_received)")
        .eq("recipient_user_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("teaching_materials").select("id,title,subject_group,created_at").eq("uploaded_by", id).order("created_at", { ascending: false }),
      supabase.from("support_requests").select("id,subject,message,status,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(5),
      fetchEnrichedAttendance(supabase, id, fy),
      fetchAttendanceTimes(supabase, id, fy),
      fetchApprovedLeaveDates(supabase, id),
      fetchApprovedPersonalLeaveDates(supabase, id),
      fetchHolidayMap(start, end),
    ]);

    setProfile((p as unknown as Profile) || null);
    setLeaveSummary(ls || []);
    setLeaveCount(cnt || null);
    setTrainings(tr || []);
    const awardRows = (aw || []).map((r: any) => r.award).filter(Boolean) as Award[];
    setAwards(awardRows);
    setMaterials(mat || []);
    setSupportRequests(sr || []);
    setAttendance(mergeAttendance(enrichedMap, timesMap));
    setOnLeaveDates(onLeaveSet || new Set());
    setApprovedPersonalLeaveDates(approvedPersonalLeaveSet || new Set());
    setHolidayMap(holidays || new Map());
    setLoading(false);
  }

  // ── แถวข้อมูลของ "วันที่เลือก" สำหรับมุมมองรายวัน ──
  const selectedDayRow = useMemo(() => attendance.find((r) => r.work_date === selectedDay) ?? null, [attendance, selectedDay]);
  const selectedOnLeave = onLeaveDates.has(selectedDay);
  const selectedHasIn = !!selectedDayRow?.check_in_time;
  const selectedHasOut = !!selectedDayRow?.check_out_time;
  const selectedHasEnrichedRow = selectedDayRow?.hasEnrichedRow ?? false;
  const selectedHasApprovedPersonalLeave = approvedPersonalLeaveDates.has(selectedDay);
  const selectedIsReligiousCeremony = isReligiousCeremonyDay(
    { check_in_time: selectedDayRow?.check_in_time ?? null, check_out_time: selectedDayRow?.check_out_time ?? null, note: selectedDayRow?.note ?? null },
    selectedHasApprovedPersonalLeave
  );
  const selectedNoScanIn = isNoScanIn(
    { check_in_time: selectedDayRow?.check_in_time ?? null, note: selectedDayRow?.note ?? null, status: selectedDayRow?.status ?? null },
    selectedOnLeave
  );
  const selectedNoScanOut = isNoScanOut(
    { check_out_time: selectedDayRow?.check_out_time ?? null, note: selectedDayRow?.note ?? null, status: selectedDayRow?.status ?? null },
    selectedOnLeave
  );
  const selectedMeetingExcuse =
    isMeetingExcuseNote(selectedDayRow?.note) && !isHalfDayMorningLeave(selectedDayRow?.note) && !isMorningOnlyExemptNote(selectedDayRow?.note);
  const selectedNoScanExemptIn = isNoScanInExempted(selectedDayRow?.note);
  const selectedNoScanExemptOut = isNoScanOutExempted(selectedDayRow?.note);
  const selectedIsHoliday = !!isHoliday(selectedDay, holidayMap);
  // ★ "ขาดงาน" เฉพาะกรณีที่ระบบประมวลผลวันนั้นแล้ว ไม่มีเวลาเข้า-ออก ไม่ได้ลา ไม่ใช่ไปประกอบพิธีทางศาสนา
  //    และ "มีหมายเหตุที่ไม่ใช่กรณีไม่แสกน/ประชุม/ยกเว้นตามภารกิจ"
  const selectedDayIsAbsent =
    !selectedIsHoliday &&
    selectedHasEnrichedRow &&
    !selectedHasIn &&
    !selectedHasOut &&
    !selectedOnLeave &&
    !selectedIsReligiousCeremony &&
    !!selectedDayRow?.note &&
    !selectedNoScanIn &&
    !selectedNoScanOut &&
    !selectedMeetingExcuse &&
    !selectedNoScanExemptIn &&
    !selectedNoScanExemptOut;

      const selectedIsUnfiledLeave =
   !selectedIsHoliday &&
   selectedHasEnrichedRow &&
   !selectedHasIn &&
   !selectedHasOut &&
   !selectedOnLeave &&
   !selectedIsReligiousCeremony &&
     selectedDayRow?.status === "leave";
  // ★ "รอข้อมูล" คือยังไม่มี enriched row เข้ามาเลยสำหรับวันนั้น (ระบบยังไม่ประมวลผล/ยังไม่ sync)
  const selectedDayIsPending = !selectedIsHoliday && !selectedHasEnrichedRow && !selectedOnLeave && selectedDay <= todayStr;
  const selectedRemark = buildRemark(selectedDayRow?.note, selectedOnLeave);

  const monthlyAttendance = useMemo(() => {
    const now = new Date();
    let months: number[];
    if (period === "month") months = [now.getMonth() + 1];
    else if (period === "term") {
      const round = now.getMonth() >= 9 || now.getMonth() <= 2 ? 1 : 2;
      months = round === 1 ? [10, 11, 12, 1, 2, 3] : [4, 5, 6, 7, 8, 9];
    } else {
      months = FY_MONTHS;
    }
    return months.map((m) => {
      const rows = attendance.filter((r) => new Date(r.work_date).getMonth() + 1 === m);
      const cnt = (s: string) => rows.filter((r) => r.status === s).length;
      // ★ ไม่นับหมายเหตุที่เข้าข่าย "ยกเว้น" (เช่น เทศบาลฉีดพ่นหมอกควัน) เป็นวันที่ถูกลา/มีปัญหา
      const noteCount = rows.filter((r) => (r.note && !isExcusedNote(r.note)) || onLeaveDates.has(r.work_date)).length;
      const pendingCount = rows.filter((r) => !r.hasEnrichedRow).length;
      // ★ นับ "ไม่แสกนมา" / "ไม่แสกนกลับ" แยกฝั่งเข้า-ออก จากทุกแถวที่ประมวลผลแล้ว (ไม่ผูกกับ status field)
      const noScanInCount = rows.filter((r) => r.hasEnrichedRow && isNoScanIn(r, onLeaveDates.has(r.work_date))).length;
      const noScanOutCount = rows.filter((r) => r.hasEnrichedRow && isNoScanOut(r, onLeaveDates.has(r.work_date))).length;
      // ★ นับ "ไปประกอบพิธีทางศาสนา" แยกต่างหาก
      const religiousCeremonyCount = rows.filter((r) =>
        isReligiousCeremonyDay(
          { check_in_time: r.check_in_time, check_out_time: r.check_out_time, note: r.note },
          approvedPersonalLeaveDates.has(r.work_date)
        )
      ).length;
      // ★ ขาดงานจริง = ไม่มีเวลาเข้า-ออกเลย ไม่ได้ลา ไม่ใช่ไปประกอบพิธี และมีหมายเหตุที่ไม่ใช่กรณีไม่แสกน/ประชุม/ยกเว้นตามภารกิจ
      const absentCount = rows.filter((r) => {
        const onLeave = onLeaveDates.has(r.work_date);
        const isReligious = isReligiousCeremonyDay(
          { check_in_time: r.check_in_time, check_out_time: r.check_out_time, note: r.note },
          approvedPersonalLeaveDates.has(r.work_date)
        );
        if (!r.hasEnrichedRow || onLeave || r.status === "leave" || isReligious) 
        if (r.check_in_time || r.check_out_time) return false;
        if (!r.note) return false;
        if (isMeetingExcuseNote(r.note) && !isHalfDayMorningLeave(r.note) && !isMorningOnlyExemptNote(r.note)) return false;
        if (isNoScanInExempted(r.note) || isNoScanOutExempted(r.note)) return false;
        return !isNoScanNote(r.note);
      }).length;

      let presentCount = 0, lateCount = 0, onTimeReturnCount = 0, leftEarlyCount = 0;
     rows.forEach((r) => {
       if (!r.hasEnrichedRow) return;
       if (r.check_in_time) {
         const isLateRaw = r.status === "late" || r.status === "late_and_left_early";
         const isLate = isLateRaw && !isMorningLateExempted(r.note, r.check_in_time);
         if (isLate) lateCount++; else presentCount++;
       }
       if (r.check_out_time) {
         const isEarlyRaw = r.status === "left_early" || r.status === "late_and_left_early";
         const isEarly = isEarlyRaw && !isEarlyLeaveExempted(r.note, r.check_out_time);
         if (isEarly) leftEarlyCount++; else onTimeReturnCount++;
       } else if (isMeetingExcuseNote(r.note) && !isHalfDayMorningLeave(r.note) && !isMorningOnlyExemptNote(r.note)) {
         onTimeReturnCount++;
       }
     });

      // ★ นับจำนวนวันลาในเดือนนี้ — อิงจากช่วงวันจริงของเดือนปีงบ ไม่ใช่แค่วันที่มีแถว attendance
      const year = calendarYearForFiscalMonth(m);
      const daysInMonth = new Date(year, m, 0).getDate();
      let leaveCountForMonth = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = toDateInputValue(new Date(year, m - 1, day));
        if (onLeaveDates.has(dateStr)) leaveCountForMonth++;
      }

      return {
        month: m,
        label: MONTH_LABEL[m],
        present: presentCount,
       late: lateCount,
       onTimeReturn: onTimeReturnCount,
       leftEarly: leftEarlyCount,
        absent: absentCount,
        noScanIn: noScanInCount,
        noScanOut: noScanOutCount,
        religiousCeremony: religiousCeremonyCount,
        leaveCount: leaveCountForMonth,
        noteCount,
        pendingCount,
      };
    });
  }, [attendance, period, onLeaveDates, approvedPersonalLeaveDates]);

  // ── ตารางรายวันของเดือนที่เลือก (ใช้ตอน period === "month") ──
  const dailyAttendance = useMemo(() => {
    const year = calendarYearForFiscalMonth(selectedMonth);
    const daysInMonth = new Date(year, selectedMonth, 0).getDate();
    const rowsByDay = new Map<number, AttendanceRow>();
    attendance.forEach((r) => {
      const d = new Date(r.work_date);
      if (d.getFullYear() === year && d.getMonth() + 1 === selectedMonth) rowsByDay.set(d.getDate(), r);
    });
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const row = rowsByDay.get(day);
      return {
        day,
        date: new Date(year, selectedMonth - 1, day),
        hasEnrichedRow: row?.hasEnrichedRow ?? false,
        status: row?.status ?? null,
        late_minutes: row?.late_minutes ?? 0,
        early_leave_minutes: row?.early_leave_minutes ?? 0,
        check_in_time: row?.check_in_time ?? null,
        check_out_time: row?.check_out_time ?? null,
        note: row?.note ?? null,
      };
    });
  }, [attendance, selectedMonth]);

  const WEEKDAY_LABEL = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">ไม่พบข้อมูลครูคนนี้</div>;

  const checkInInfo = dayCheckInInfo(selectedDayRow, selectedOnLeave, selectedIsReligiousCeremony);
  const checkOutInfo = dayCheckOutInfo(selectedDayRow, selectedOnLeave, selectedIsReligiousCeremony);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 font-sans antialiased">
      <main className="w-full px-4 py-6 md:px-8 md:py-8 lg:px-12 lg:py-10 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg"
          >
            🏠
          </button>
          <button
            onClick={() => router.push("/admin/teachers")}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> กลับไปหน้ารวมข้อมูลครู
          </button>
        </div>

        {/* Profile card */}
        <div className="relative bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500" />
          <div className="px-6 pb-6 -mt-10 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-blue-600 text-white flex items-center justify-center overflow-hidden shrink-0 ring-4 ring-white shadow-md">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-8 h-8" />}
              </div>
              <div className="pt-9">
                <h1 className="text-xl font-black text-slate-900">
                  {profile.title}{profile.first_name} {profile.last_name}
                </h1>
                <p className="text-sm text-slate-400 font-bold">{profile.position || "ยังไม่ระบุตำแหน่ง"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ReadField icon={<Phone className="w-4 h-4" />} label="เบอร์โทร" value={profile.phone ?? "—"} />
              <ReadField icon={<MessageCircle className="w-4 h-4" />} label="ไลน์ไอดี" value={profile.line_id ?? "—"} />
              <ReadField icon={<GraduationCap className="w-4 h-4" />} label="วุฒิการศึกษา" value={profile.education_level ?? "—"} />
              <ReadField
                icon={<GraduationCap className="w-4 h-4" />}
                label="สาขา / สถาบัน"
                value={[profile.education_major, profile.education_school].filter(Boolean).join(" · ") || "—"}
              />
              <ReadField
                icon={<GraduationCap className="w-4 h-4" />}
                label="กลุ่มสาระการเรียนรู้"
                value={profile.department?.name ?? profile.subject_group ?? "—"}
              />
              <ReadField
                icon={<CalendarDays className="w-4 h-4" />}
                label="ประจำชั้น"
                value={[...(profile.homeroom ?? []), ...(profile.homeroom_teacher_2 ?? [])].map((h) => h.room_name).join(", ") || "—"}
              />
            </div>
          </div>
        </div>

        {/* Performance period + attendance */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-extrabold text-slate-800">📊 สรุปผลการปฏิบัติงาน (ปีงบประมาณ {currentFiscalYear()})</h3>
            <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
              {(
                [
                  ["day", "รายวัน"],
                  ["month", "รายเดือน"],
                  ["term", "รายเทอม"],
                  ["year", "ปีงบประมาณ"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === key ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* สรุปสิทธิ์การลา */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {["sick", "personal", "maternity"].map((type) => {
              const row = leaveSummary.find((r) => r.leave_type === type);
              return (
                <div key={type} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {LEAVE_LABEL[type]}</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{row ? row.used_days : 0}<span className="text-xs font-bold text-slate-400"> / {row ? row.total_days : 0} วัน</span></p>
                  <p className="text-xs font-bold text-emerald-600 mt-0.5">เหลือ {row ? row.remaining_days : 0} วัน</p>
                </div>
              );
            })}
          </div>
          {leaveCount && (
            <div className={`rounded-xl p-4 border flex items-center justify-between ${
              leaveCount.remaining_count <= 1 ? "bg-rose-50 border-rose-200" : "bg-blue-50 border-blue-100"
            }`}>
              <div>
                <p className="text-xs font-bold text-slate-500">สิทธิ์การลารวมทุกประเภท (ปีงบประมาณ)</p>
                <p className="text-sm font-black text-slate-800 mt-0.5">ใช้ไปแล้ว {leaveCount.used_count} / 6 ครั้ง</p>
              </div>
              <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
                leaveCount.remaining_count <= 1 ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
              }`}>เหลือ {leaveCount.remaining_count} ครั้ง</span>
            </div>
          )}

          {/* การลงเวลาปฏิบัติงาน */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> การลงเวลาปฏิบัติงาน
              </p>
              {period === "month" && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {FY_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {MONTH_LABEL[m]} {calendarYearForFiscalMonth(m) + 543}
                    </option>
                  ))}
                </select>
              )}
              {period === "day" && (
                <input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              )}
            </div>

            {period === "day" ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 font-bold">
                  {new Date(selectedDay + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>

                {selectedIsHoliday ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                      <CalendarDays className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-500">วันหยุด</p>
                      <p className="text-xs text-slate-400 font-bold mt-0.5">{isHoliday(selectedDay, holidayMap)?.name}</p>
                    </div>
                  </div>
                ) : selectedDayIsPending ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-500">รอข้อมูล</p>
                      <p className="text-xs text-slate-400 font-bold mt-0.5">ยังไม่มีข้อมูลการลงเวลาสำหรับวันนี้เข้าสู่ระบบ</p>
                    </div>
                  </div>
                ) : selectedDayIsAbsent ? (
                  <div className="rounded-2xl bg-rose-50 border border-rose-100 p-5 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-rose-600">{selectedIsUnfiledLeave ? "ขาดงาน (รอการส่งใบลาในระบบ)" : "ขาดงาน"}</p>
                        <p className="text-xs text-rose-400 font-bold mt-0.5">{selectedIsUnfiledLeave ? "มีหมายเหตุระบุว่าลา แต่ยังไม่พบใบลาที่ยื่นในระบบ" : "ไม่มีการลงเวลาเข้า-ออกในวันนี้"}
</p>
                      </div>
                    </div>
                    {selectedRemark && (
                      <div className="text-xs font-bold text-rose-600 bg-white rounded-lg px-3 py-2 border border-rose-100">หมายเหตุ: {selectedRemark}</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={`rounded-2xl p-4 flex items-center gap-3 ${TONE_CLASSES[checkInInfo.tone].bg}`}>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASSES[checkInInfo.tone].iconBg}`}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <p className={`text-2xl font-black ${TONE_CLASSES[checkInInfo.tone].text}`}>{checkInInfo.time ?? "-"}</p>
                          <p className={`text-xs font-bold ${TONE_CLASSES[checkInInfo.tone].text}`}>{checkInInfo.label}</p>
                        </div>
                      </div>
                      <div className={`rounded-2xl p-4 flex items-center gap-3 ${TONE_CLASSES[checkOutInfo.tone].bg}`}>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASSES[checkOutInfo.tone].iconBg}`}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <p className={`text-2xl font-black ${TONE_CLASSES[checkOutInfo.tone].text}`}>{checkOutInfo.time ?? "-"}</p>
                          <p className={`text-xs font-bold ${TONE_CLASSES[checkOutInfo.tone].text}`}>{checkOutInfo.label}</p>
                        </div>
                      </div>
                    </div>
                    {selectedRemark && <div className="text-xs font-bold text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">หมายเหตุ: {selectedRemark}</div>}
                  </div>
                )}
              </div>
            ) : period === "month" ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-100 max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-3 py-2 font-bold text-slate-500 text-xs">วันที่</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 text-xs">เวลาเข้า</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 text-xs">เวลาออก</th>
                      <th className="text-left px-3 py-2 font-bold text-slate-500 text-xs">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dailyAttendance.map((d) => {
                      const dow = d.date.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const dateStr = toDateInputValue(d.date);
                      const isFuture = dateStr > todayStr;
                      const onLeave = onLeaveDates.has(dateStr);
                      const hasIn = !!d.check_in_time;
                      const hasOut = !!d.check_out_time;
                      const remark = buildRemark(d.note, onLeave);
                      const dayHoliday = isHoliday(dateStr, holidayMap);
                      const noScanInRow = isNoScanIn(d, onLeave);
                      const noScanOutRow = isNoScanOut(d, onLeave);
                      const meetingExcuseRow = isMeetingExcuseNote(d.note) && !isHalfDayMorningLeave(d.note) && !isMorningOnlyExemptNote(d.note);
                      const noScanExemptInRow = isNoScanInExempted(d.note);
                      const noScanExemptOutRow = isNoScanOutExempted(d.note);
                      const isReligiousRow = isReligiousCeremonyDay(
                        { check_in_time: d.check_in_time, check_out_time: d.check_out_time, note: d.note },
                        approvedPersonalLeaveDates.has(dateStr)
                      );
                      // ★ แยก "รอข้อมูล" / "ขาดงานจริง (มีหมายเหตุ ไม่ใช่กรณีไม่แสกน/ประชุม/ยกเว้นตามภารกิจ/ไปประกอบพิธี)" ออกจากการแสดงเวลาแบบปกติ
                      const isPendingRow = !isWeekend && !isFuture && !dayHoliday && !d.hasEnrichedRow && !onLeave;
                      const isAbsentRow =
                        !isWeekend &&
                        !isFuture &&
                        !dayHoliday &&
                        d.hasEnrichedRow &&
                        !hasIn &&
                        !hasOut &&
                        !onLeave &&
                        !isReligiousRow &&
                        !!d.note &&
                        !noScanInRow &&
                        !noScanOutRow &&
                        !meetingExcuseRow &&
                        !noScanExemptInRow &&
                        !noScanExemptOutRow;

                      const isUnfiledLeaveRow = !isWeekend && !isFuture && !dayHoliday && d.hasEnrichedRow && !hasIn && !hasOut && !onLeave && !isReligiousRow && d.status === "leave";
                        const inStatus = monthlyCheckInStatus(d, onLeave, isReligiousRow);
                      const outStatus = monthlyCheckOutStatus(d, onLeave, isReligiousRow);

                      return (
                        <tr key={d.day} className={isWeekend ? "bg-slate-50/60" : "hover:bg-slate-50/60"}>
                          <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                            {d.day} {WEEKDAY_LABEL[dow]}
                          </td>
                          {isWeekend || isFuture || dayHoliday ? (
                            <td colSpan={2} className="px-3 py-2 text-center text-xs text-slate-300 font-bold">
                              {dayHoliday ? `หยุด: ${dayHoliday.name}` : isWeekend ? "วันหยุด" : "—"}
                            </td>
                          ) : isPendingRow ? (
                            <td colSpan={2} className="px-3 py-2 text-center">
                              <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold text-slate-400 bg-slate-100">รอข้อมูล</span>
                            </td>
                          ) : isAbsentRow ? (
                            <td colSpan={2} className="px-3 py-2 text-center">
                              <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold text-rose-600 bg-rose-50">{isUnfiledLeaveRow ? "รอใบลา" : "ขาดงาน"}</span>
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-black text-slate-700">{formatTimeHHmm(d.check_in_time) ?? "-"}</span>
                                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${TONE_CLASSES[inStatus.tone].bg} ${TONE_CLASSES[inStatus.tone].text}`}>
                                    {inStatus.text}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-black text-slate-700">{formatTimeHHmm(d.check_out_time) ?? "-"}</span>
                                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${TONE_CLASSES[outStatus.tone].bg} ${TONE_CLASSES[outStatus.tone].text}`}>
                                    {outStatus.text}
                                  </span>
                                </div>
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 text-xs text-slate-500 font-bold">{remark || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-3 py-2 font-bold text-slate-500 text-xs">เดือน</th>
                      <th className="text-center px-3 py-2 font-bold text-emerald-600 text-xs">มาปฏิบัติงาน</th>
                      <th className="text-center px-3 py-2 font-bold text-amber-600 text-xs">มาสาย</th>
                      <th className="text-center px-3 py-2 font-bold text-emerald-600 text-xs">กลับตรงเวลา</th>
                      <th className="text-center px-3 py-2 font-bold text-orange-600 text-xs">กลับก่อน</th>
                      <th className="text-center px-3 py-2 font-bold text-rose-600 text-xs">ขาด</th>
                      <th className="text-center px-3 py-2 font-bold text-blue-600 text-xs">ลา</th>
                      <th className="text-center px-3 py-2 font-bold text-blue-600 text-xs">ไปประกอบพิธี</th>
                      <th className="text-center px-3 py-2 font-bold text-violet-600 text-xs">ไม่แสกนมา</th>
                      <th className="text-center px-3 py-2 font-bold text-violet-600 text-xs">ไม่แสกนกลับ</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-400 text-xs">รอข้อมูล</th>
                      <th className="text-left px-3 py-2 font-bold text-slate-500 text-xs">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {monthlyAttendance.map((m) => (
                      <tr key={m.month} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-bold text-slate-700">{m.label}</td>
                        <td className="px-3 py-2 text-center font-black text-emerald-600">{m.present || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-amber-600">{m.late || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-emerald-600">{m.onTimeReturn || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-orange-600">{m.leftEarly || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-rose-600">{m.absent || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-blue-600">{m.leaveCount || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-blue-600">{m.religiousCeremony || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-violet-600">{m.noScanIn || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-violet-600">{m.noScanOut || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-slate-400">{m.pendingCount || "-"}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 font-bold">{m.noteCount > 0 ? `${m.noteCount} วัน` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            มุมมองที่เลือก: {{ day: "รายวัน", month: `รายเดือน (${MONTH_LABEL[selectedMonth]})`, term: "รายเทอม", year: "ปีงบประมาณ" }[period]} — ปีงบประมาณ{" "}
            {currentFiscalYear()}
          </p>
        </div>

        {/* Trainings */}
        <SectionList
          title="🎓 ประวัติการอบรม"
          emptyText="ยังไม่มีประวัติการอบรม"
          items={trainings}
          renderItem={(t: Training) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-slate-800">{t.title}</p>
                <p className="text-xs text-slate-400">{t.organizer || "—"}{t.hours ? ` · ${t.hours} ชม.` : ""}</p>
              </div>
              {t.certificate_url && (
                <a href={t.certificate_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline shrink-0">
                  ดูเกียรติบัตร →
                </a>
              )}
            </div>
          )}
        />

        {/* Awards */}
        <SectionList
          title="🏆 รางวัลและความภาคภูมิใจ"
          emptyText="ยังไม่มีรางวัลที่บันทึกไว้"
          items={awards}
          renderItem={(a: Award) => (
            <div key={a.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{a.title}</p>
                <p className="text-xs text-slate-400">{a.award_level || "—"}</p>
              </div>
            </div>
          )}
        />

        {/* Teaching materials */}
        <SectionList
          title="📁 สื่อการสอนที่นำส่ง"
          emptyText="ยังไม่มีสื่อการสอนที่นำส่ง"
          items={materials}
          renderItem={(m: Material) => (
            <div key={m.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{m.title}</p>
                <p className="text-xs text-slate-400">{m.subject_group || "—"}</p>
              </div>
            </div>
          )}
        />

        {/* Support requests to admin */}
        {supportRequests.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-800 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> คำร้องล่าสุดถึงแอดมิน
            </h3>
            {supportRequests.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-bold text-slate-800">{s.subject}</p>
                  <p className="text-xs text-slate-400">{s.message}</p>
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${
                  s.status === "resolved" ? "bg-emerald-100 text-emerald-700" :
                  s.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                }`}>{s.status === "resolved" ? "แก้ไขแล้ว" : s.status === "in_progress" ? "กำลังดำเนินการ" : "รอดำเนินการ"}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ReadField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mb-1">
        {icon} {label}
      </p>
      <p className="text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
}

function SectionList<T>({
  title,
  emptyText,
  items,
  renderItem,
}: {
  title: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-800 mb-2">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">{emptyText}</p> : <div>{items.map(renderItem)}</div>}
    </div>
  );
}