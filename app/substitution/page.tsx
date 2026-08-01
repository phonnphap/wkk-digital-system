"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addDays } from "date-fns";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "grade_head"];

// ══════════════════════════════════════════════════════════
// ── Types ─────────────────────────────────────────────────
// ★ ปรับให้ตรงกับ schema ที่หน้าใบลา (app/leave/page.tsx) ใช้จริง
// ══════════════════════════════════════════════════════════
interface User {
  id: string; first_name: string; last_name: string;
  title?: string; role: string; position?: string; academic_level?: string;
  grade_level?: string; email?: string; extra_roles?: string[];
}
interface TimeSlot {
  id: string; slot_number: number; start_time: string; end_time: string;
  slot_label: string; is_break: boolean; schedule_type?: string;
}
interface Classroom {
  id: string; room_name: string; grade_group?: string; schedule_type?: string; homeroom_teacher_id?: string | null;
}
interface Subject {
  id: string; subject_code?: string; name_th: string;
}
interface TimetableEntry {
  id: string; classroom_id: string; subject_id: string; teacher_id: string; teacher_id_2?: string | null;
  day_of_week: number; time_slot_id: string; academic_year_id: string;
  // เติมโดย enrichEntries() — ต้องเหมือนหน้าใบลาเป๊ะ
  slot_number?: number | null; slot_label?: string | null; start_time?: string | null; end_time?: string | null;
  is_break?: boolean; room_name?: string | null; grade_group?: string | null;
  subject_name?: string | null; subject_code?: string | null; schedule_type?: string | null;
}
interface SwapRequest {
  id: string; requester_id: string; target_teacher_id: string;
  requester_entry_id: string; target_entry_id: string | null;
  swap_date: string; reason?: string; status: string;
  responded_at?: string; created_at: string;
  requester?: User; target_teacher?: User;
  requester_entry?: TimetableEntry; target_entry?: TimetableEntry;
}
interface SubRecord {
  id: string; leave_request_id?: string | null; original_teacher_id?: string | null; absent_teacher_id: string;
  substitute_teacher_id?: string; timetable_entry_id?: string;
  substitute_date: string; time_slot_id?: string; classroom_id?: string;
  subject_id?: string; hours_count: number; assigned_by?: string;
  status: string; note?: string | null; academic_year_id?: string; created_at: string;
  absent_teacher?: User; substitute_teacher?: User;
  subject_name?: string | null; room_name?: string | null; slot_label?: string | null; grade_group?: string | null;
}
interface LeaveRequest {
  id: string; user_id: string; leave_type: string; start_date: string;
  end_date: string; days_count: number; reason?: string; status: string;
  user?: User;
}
interface AcademicYear { id: string; year_name: string; is_current: boolean; }

// ── Helpers ───────────────────────────────────────────────
const TH_DAYS = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function fullName(u?: User|null) {
  if (!u) return "—";
  return `${u.title??""}${u.first_name} ${u.last_name}`.trim();
}
function thaiDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s+"T00:00:00");
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
}
function thaiTime(t?: string) { return t ? t.slice(0,5)+" น." : "—"; }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dowOf(dateStr: string): number { return new Date(dateStr + "T00:00:00").getDay(); }
function toMinutes(t?: string | null): number {
  if (!t) return NaN;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
// ★ เทียบว่าสองช่วงเวลาทับกันจริงหรือไม่ (ไม่ใช่แค่ start_time ตรงกัน)
function timeRangesOverlap(aStart?: string|null, aEnd?: string|null, bStart?: string|null, bEnd?: string|null): boolean {
  const as = toMinutes(aStart), ae = toMinutes(aEnd), bs = toMinutes(bStart), be = toMinutes(bEnd);
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}
function compactIds(ids: (string | null | undefined)[]): string[] {
  return ids.filter((id): id is string => !!id);
}
// ★ หาครูอีกคนที่ยังสอนคู่อยู่ในคาบนี้ (ถ้ามี teacher_id_2) — ใช้เช็คว่าไม่ต้องจัดสอนแทน
function coTeacherId(entry: { teacher_id: string; teacher_id_2?: string | null }, excludeId: string): string | null {
  if (entry.teacher_id && entry.teacher_id !== excludeId) return entry.teacher_id;
  if (entry.teacher_id_2 && entry.teacher_id_2 !== excludeId) return entry.teacher_id_2;
  return null;
}

// ★ กันโรล staff/admin หลุดเข้ามาในรายชื่อครู (กันไว้อีกชั้น เผื่อ query หลักไม่ครอบคลุม)
const EXCLUDED_TEACHER_ROLES = ["staff", "admin", "admin_hr", "director", "deputy_director", "admin_academic", "admin_general"];
function isSelectableTeacher(t: User): boolean {
  return !EXCLUDED_TEACHER_ROLES.includes(t.role);
}

// ★ หาครูที่ "ว่าง" ในวัน+คาบเวลาเดียวกับ entry นี้จริงๆ (เทียบ start_time ไม่เทียบ time_slot_id ดิบ)
function computeFreeTeachersForEntry(
  entry: TimetableEntry, date: string, allEntries: TimetableEntry[],
  allTeachers: User[], excludeId: string
): User[] {
  const dow = dowOf(date);
  const busyIds = new Set(
    allEntries
      .filter(e => e.day_of_week === dow && timeRangesOverlap(entry.start_time, entry.end_time, e.start_time, e.end_time))
      .flatMap(e => compactIds([e.teacher_id, e.teacher_id_2]))
  );
  return allTeachers.filter(t => t.id !== excludeId && !busyIds.has(t.id) && isSelectableTeacher(t));
}

const STATUS_SWAP: Record<string,{label:string;cls:string}> = {
  pending:  { label:"รออนุมัติ",  cls:"bg-amber-50 text-amber-700 border-amber-300" },
  accepted: { label:"ตกลงแล้ว",  cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  rejected: { label:"ปฏิเสธ",    cls:"bg-red-50 text-red-700 border-red-300" },
  cancelled:{ label:"ยกเลิก",    cls:"bg-[#FCE7F3] text-slate-500 border-slate-300" },
};
const STATUS_SUB: Record<string,{label:string;cls:string}> = {
  assigned:  { label:"จัดแล้ว",  cls:"bg-[#FCE7F3] text-[#DB2777] border-[#FBCFE8]" },
  confirmed: { label:"ยืนยัน",   cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  done:      { label:"เสร็จสิ้น",cls:"bg-[#FCE7F3] text-slate-600 border-slate-300" },
  cancelled: { label:"ยกเลิก",   cls:"bg-red-50 text-red-700 border-red-300" },
};
const SOURCE_LABEL: Record<string,{label:string;cls:string}> = {
  auto:      { label:"🤖 อัตโนมัติจากใบลา", cls:"bg-indigo-50 text-indigo-600 border-indigo-200" },
  specific:  { label:"🎯 เจาะจงจากใบลา",   cls:"bg-emerald-50 text-emerald-600 border-emerald-200" },
  admin:     { label:"🏫 แอดมินจัดเอง",     cls:"bg-[#FDF2F8] text-slate-600 border-[#FBCFE8]" },
};
function sourceOf(note?: string | null): keyof typeof SOURCE_LABEL {
  if (note?.includes("อัตโนมัติ")) return "auto";
  if (note?.includes("เจาะจง")) return "specific";
  return "admin";
}

// ── สายชั้น / ครูประจำชั้น helpers ────────────────────────
function extractGradeOnly(gradeGroup?: string | null): string {
  if (!gradeGroup) return "";
  return gradeGroup.split("/")[0].trim();
}
function isHomeroomPriorityGrade(gradeGroup?: string | null): boolean {
  const g = extractGradeOnly(gradeGroup);
  return g === "ป.1" || g === "ป.2";
}

// ★ หา id ครูที่มีสายชั้นเดียวกับ "ครูที่ลา" — อ้างอิงตรงจากคอลัมน์ users.grade_level
function sameGradeTeacherIds(absentTeacher: User | null | undefined, allTeachers: User[]): Set<string> {
  if (!absentTeacher?.grade_level) return new Set();
  return new Set(
    allTeachers
      .filter(t => t.grade_level && t.grade_level === absentTeacher.grade_level)
      .map(t => t.id)
  );
}

// ★ เรียงรายชื่อครู: สายชั้นเดียวกับครูที่ลาก่อน แล้วค่อยเรียงตามชื่อ
function sortTeachersByGrade(candidates: User[], gradeIds: Set<string>): User[] {
  return [...candidates].sort((a, b) => {
    const aIn = gradeIds.has(a.id) ? 0 : 1;
    const bIn = gradeIds.has(b.id) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return fullName(a).localeCompare(fullName(b), "th");
  });
}

// ══════════════════════════════════════════════════════════
// ── Schedule templates — ★ ต้องเหมือนกับหน้าใบลา (leave/page.tsx) เป๊ะ
// ══════════════════════════════════════════════════════════
const SCHEDULE_TEMPLATES = [
  {
    key: "kindergarten", label: "อนุบาล (อ.2–อ.3)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:30", end_time: "09:50", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "09:50", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
      { slot_number: 4, start_time: "11:00", end_time: "11:40", slot_label: "คาบ 4", is_break: false },
      { slot_number: 0, start_time: "11:40", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 0, start_time: "12:30", end_time: "14:00", slot_label: "นอนกลางวัน", is_break: true },
      { slot_number: 5, start_time: "14:00", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
      { slot_number: 0, start_time: "14:30", end_time: "15:00", slot_label: "คาบ 6", is_break: true },
    ],
  },
  {
    key: "primary", label: "ประถม (ป.1–ป.6)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:30", end_time: "10:30", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "10:30", end_time: "11:30", slot_label: "คาบ 3", is_break: false },
      { slot_number: 0, start_time: "11:30", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 4, start_time: "12:30", end_time: "13:30", slot_label: "คาบ 4", is_break: false },
      { slot_number: 5, start_time: "13:30", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
      { slot_number: 6, start_time: "14:30", end_time: "15:30", slot_label: "คาบ 6", is_break: false },
    ],
  },
  {
    key: "junior", label: "มัธยมต้น (ม.1–ม.2)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "10:10", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
      { slot_number: 0, start_time: "11:00", end_time: "12:00", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 4, start_time: "12:00", end_time: "12:50", slot_label: "คาบ 4", is_break: false },
      { slot_number: 5, start_time: "12:50", end_time: "13:40", slot_label: "คาบ 5", is_break: false },
      { slot_number: 0, start_time: "13:40", end_time: "13:50", slot_label: "พักย่อย", is_break: true },
      { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
      { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
    ],
  },
  {
    key: "senior", label: "ม.3 และ ม.ปลาย (ม.3–ม.6)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
      { slot_number: 0, start_time: "10:10", end_time: "10:20", slot_label: "พักย่อย", is_break: true },
      { slot_number: 3, start_time: "10:20", end_time: "11:10", slot_label: "คาบ 3", is_break: false },
      { slot_number: 4, start_time: "11:10", end_time: "12:00", slot_label: "คาบ 4", is_break: false },
      { slot_number: 0, start_time: "12:00", end_time: "13:00", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 5, start_time: "13:00", end_time: "13:50", slot_label: "คาบ 5", is_break: false },
      { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
      { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
    ],
  },
];

function buildRoomSlots(scheduleType: string | undefined, allDbSlots: any[]): any[] {
  const type = scheduleType ?? "primary";
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[1];
  return tmpl.slots.map((tmplSlot, idx) => {
    const dbSlot = allDbSlots.find(s => (s.start_time ?? "").slice(0, 5) === tmplSlot.start_time);
    if (dbSlot) {
      return { ...dbSlot, slot_label: tmplSlot.slot_label, is_break: tmplSlot.is_break, end_time: tmplSlot.end_time, slot_number: tmplSlot.slot_number };
    }
    return {
      id: `tmpl-${type}-${idx}-${tmplSlot.start_time.replace(":", "")}`,
      slot_number: tmplSlot.slot_number, start_time: tmplSlot.start_time, end_time: tmplSlot.end_time,
      slot_label: tmplSlot.slot_label, is_break: tmplSlot.is_break, schedule_type: type,
    };
  });
}

function enrichEntries(rawEntries: any[], classroomsMap: Record<string, any>, subjectsMap: Record<string, any>, allTimeSlots: any[]) {
  const slotsCache: Record<string, any[]> = {};
  function getRoomSlots(scheduleType?: string) {
    const key = scheduleType ?? "primary";
    if (!slotsCache[key]) slotsCache[key] = buildRoomSlots(key, allTimeSlots);
    return slotsCache[key];
  }
  return rawEntries.map(e => {
    const room = classroomsMap[e.classroom_id];
    const roomSlots = getRoomSlots(room?.schedule_type);
    const slot = roomSlots.find((s: any) => s.id === e.time_slot_id)
      ?? allTimeSlots.find((s: any) => s.id === e.time_slot_id) ?? null;
    const subject = subjectsMap[e.subject_id];
    return {
      ...e,
      slot_number: slot?.slot_number ?? null,
      slot_label: slot?.slot_label ?? null,
      start_time: slot?.start_time ?? null,
      end_time: slot?.end_time ?? null,
      is_break: slot?.is_break ?? false,
      room_name: room?.room_name ?? null,
      grade_group: room?.grade_group ?? null,
      subject_name: subject?.name_th ?? null,
      subject_code: subject?.subject_code ?? null,
      schedule_type: room?.schedule_type ?? null,
    };
  });
}

function computeSlotHours(slot: any): number {
  if (!slot?.start_time || !slot?.end_time) return 1;
  const [sh, sm] = slot.start_time.split(":").map(Number);
  const [eh, em] = slot.end_time.split(":").map(Number);
  const diffMin = (eh * 60 + em) - (sh * 60 + sm);
  return diffMin > 0 ? Math.round((diffMin / 60) * 100) / 100 : 1;
}

function computeFreePeriodsForDay(teacherId: string, dow: number, scheduleType: string | undefined, allEntries: TimetableEntry[], allTimeSlots: any[]): number {
  const templateSlots = buildRoomSlots(scheduleType, allTimeSlots).filter((s: any) => !s.is_break);
  const busyStartTimes = new Set(
    allEntries.filter(e => e.day_of_week === dow && (e.teacher_id === teacherId || e.teacher_id_2 === teacherId))
      .map(e => (e.start_time ?? "").slice(0, 5))
  );
  return templateSlots.filter((s: any) => !busyStartTimes.has(s.start_time)).length;
}

// ★ จำนวนคาบที่ครูคนนี้สอนอยู่แล้วในวันนั้น (ไม่นับคาบพัก) — ใช้เตือนถ้าครูสอนแทนจะแน่นเกินไป
const SUB_LOAD_WARN_AT = 5;
function computeTaughtPeriodsForDay(teacherId: string, dow: number, allEntries: TimetableEntry[]): number {
  return allEntries.filter(e =>
    e.day_of_week === dow && !e.is_break && (e.teacher_id === teacherId || e.teacher_id_2 === teacherId)
  ).length;
}

// ── Print helpers ─────────────────────────────────────────
function printSubOrder(records: SubRecord[], periodLabel: string) {
  const rows = records.map((r,i) => `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${thaiDate(r.substitute_date)}</td>
      <td>${r.slot_label ?? "—"}</td>
      <td>${r.room_name ?? "—"}</td>
      <td>${r.subject_name ?? "—"}</td>
      <td>${fullName(r.absent_teacher)}</td>
      <td>${fullName(r.substitute_teacher)}</td>
      <td style="text-align:center">${r.hours_count}</td>
      <td>${r.note ?? ""}</td>
    </tr>`).join("");

  const w = window.open("","_blank","width=1050,height=780");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { font-family: 'Sarabun','TH SarabunNew',sans-serif; font-size: 14pt; color: #111; }
    h2 { text-align:center; font-size:16pt; margin-bottom:2px; }
    h3 { text-align:center; font-size:14pt; margin-top:2px; margin-bottom:14px; }
    table { width:100%; border-collapse:collapse; font-size:12pt; }
    th { background:#DB2777; color:#fff; padding:6px 8px; font-size:11pt; text-align:left; }
    td { padding:5px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    tr:nth-child(even) td { background:#f8faff; }
    .sign-row { display:flex; justify-content:space-between; margin-top:40px; }
    .sign-box { text-align:center; flex:1; }
    .sign-line { margin:48px auto 6px; width:180px; }
    @media print { button { display:none; } }
  </style></head>
  <body>
    <h2>โรงเรียนวัดเขียนเขต</h2>
    <h3>ใบคำสั่งสอนแทน — ${periodLabel}</h3>
    <table>
      <thead><tr>
        <th style="width:32px">ที่</th>
        <th>วันที่</th><th>คาบ</th><th>ห้อง</th><th>วิชา</th>
        <th>ครูเจ้าของคาบ</th><th>ครูสอนแทน</th>
        <th style="width:50px;text-align:center">ชม.</th><th>หมายเหตุ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign-row">
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>ผู้รับคำสั่ง</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>(นางสาวฐิติมา กาบแก้ว)</div>
        <div>รองผู้อำนวยการกลุ่มบริหารวิชาการ</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>(นายธนณัฐ ศิระวงษ์)</div>
        <div>ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
      </div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}

function printTeacherSubStat(records: SubRecord[], users: User[]) {
  const map: Record<string,{name:string;hours:number;count:number}> = {};
  for (const r of records) {
    if (r.status === "cancelled") continue;
    if (!r.substitute_teacher_id) continue;
    if (!map[r.substitute_teacher_id]) {
      map[r.substitute_teacher_id] = { name: fullName(r.substitute_teacher), hours:0, count:0 };
    }
    map[r.substitute_teacher_id].hours += Number(r.hours_count);
    map[r.substitute_teacher_id].count += 1;
  }
  const rows = Object.values(map).sort((a,b)=>b.hours-a.hours).map((t,i)=>`
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${t.name}</td>
      <td style="text-align:center">${t.count}</td>
      <td style="text-align:center">${t.hours}</td>
    </tr>`).join("");

  const w = window.open("","_blank","width=800,height=640");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { font-family:'Sarabun','TH SarabunNew',sans-serif; font-size:14pt; }
    h2,h3 { text-align:center; }
    table { width:100%; border-collapse:collapse; font-size:12pt; margin-top:16px; }
    th { background:#DB2777; color:#fff; padding:6px 8px; }
    td { padding:5px 8px; border-bottom:1px solid #e2e8f0; }
    tr:nth-child(even)td { background:#f8faff; }
    @media print { button{display:none} }
  </style></head>
  <body>
    <h2>โรงเรียนวัดเขียนเขต</h2>
    <h3>สถิติการสอนแทน (เพื่อคิดขั้นเงินเดือน)</h3>
    <table><thead><tr>
      <th style="width:40px">ที่</th><th>ชื่อ-นามสกุล</th>
      <th>จำนวนครั้ง</th><th>รวมชั่วโมง</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════
// ── TeacherSearchSelect — เลือกครูแบบพิมพ์ค้นหาได้
// ══════════════════════════════════════════════════════════
function TeacherSearchSelect({ teachers, value, onChange, placeholder = "— เลือกครู —", loadMap, warnAt = SUB_LOAD_WARN_AT }: {
  teachers: User[]; value: string; onChange: (id: string) => void; placeholder?: string;
  // ★ loadMap: teacherId -> จำนวนคาบที่สอนอยู่แล้วในวันนั้น (ถ้าไม่ส่งมาจะไม่แสดง badge)
  loadMap?: Record<string, number>; warnAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = teachers.find(t => t.id === value);
  const filtered = teachers.filter(t => fullName(t).toLowerCase().includes(search.toLowerCase()));

  function LoadBadge({ teacherId }: { teacherId: string }) {
    if (!loadMap) return null;
    const n = loadMap[teacherId] ?? 0;
    const overloaded = n >= warnAt;
    return (
      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
        overloaded ? "bg-red-50 text-red-600 border-red-200" : "bg-[#FCE7F3] text-[#64748B] border-transparent"
      }`}>
        {overloaded ? `⚠️ สอน ${n} คาบ` : `${n} คาบ`}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full text-left border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${selected ? "font-bold text-slate-800" : "text-slate-400"}`}>
            {selected ? fullName(selected) : placeholder}
          </span>
          {selected && <LoadBadge teacherId={selected.id} />}
        </span>
        <span className="text-slate-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-[#F9A8D4] rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-[#FCE7F3]">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 พิมพ์ชื่อ..." autoFocus onClick={e => e.stopPropagation()}
              className="w-full bg-[#FDF2F8] border border-[#FBCFE8] rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                className="w-full px-4 py-2 text-left text-xs text-red-500 font-bold hover:bg-red-50">✕ ล้างค่าที่เลือก</button>
            )}
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-slate-400 text-sm text-center">ไม่พบชื่อ</div>
            ) : filtered.map(t => (
              <button key={t.id} type="button" onClick={() => { onChange(t.id); setOpen(false); setSearch(""); }}
                className={`w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-[#FDF2F8] flex items-center justify-between gap-2 ${t.id === value ? "bg-[#FDF2F8]" : ""}`}>
                <span className="min-w-0 truncate">
                  <span className="font-bold text-slate-800">{fullName(t)}</span>
                  {t.position && <span className="text-slate-400 text-xs ml-2">{t.position}</span>}
                </span>
                <LoadBadge teacherId={t.id} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── SwapRequestModal — เขียนใหม่ทั้งหมด ─────────────────────
// 1) วันที่อยู่ช่องแรกและใช้กรองคาบจริง (เดิมไม่กรอง)
// 2) คาบของฉันวันนั้นแสดงเป็นตารางกดเลือก (เทา -> น้ำเงินเมื่อเลือก)
// 3) รายชื่อครูที่ว่าง เรียงตามกฎ: ครูประจำชั้น(ป.1/ป.2) -> สายชั้นเดียวกัน
//    (คาบว่างเยอะสุดก่อน, เท่ากันดูสถิติสอนแทนน้อยสุดก่อน) -> วิชาเดียวกัน -> ที่เหลือ
// ══════════════════════════════════════════════════════════
function SwapRequestModal({ user, allEntries, allTeachers, allTimeSlots, academicYearId, initialReason, mode = "normal", fixedTargetTeacherId, onSave, onClose }: {
  user: User; allEntries: TimetableEntry[]; allTeachers: User[]; allTimeSlots: any[]; academicYearId: string;
  initialReason?: string; mode?: "normal" | "repay"; fixedTargetTeacherId?: string;
  onSave: () => void; onClose: () => void;
}) {
  const [swapDate, setSwapDate] = useState(ymd(new Date()));
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(null);
  const [pickedTeacherId, setPickedTeacherId] = useState("");
  const [reason, setReason] = useState(initialReason ?? "");
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [onLeaveIds, setOnLeaveIds] = useState<Set<string>>(new Set());
  const [subHistCounts, setSubHistCounts] = useState<Record<string, number>>({});
  const [homeroomMap, setHomeroomMap] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const dow = swapDate ? dowOf(swapDate) : null;
  // ★ โหมด repay: หา user ของครูที่เราจะแลกคาบคืนให้ (ครูที่เคยสอนแทนเรา)
const targetTeacher = useMemo(
  () => (mode === "repay" ? allTeachers.find(t => t.id === fixedTargetTeacherId) ?? null : null),
  [mode, allTeachers, fixedTargetTeacherId]
);
// ★ ตารางสอนของครูคนนั้นในวันที่เลือก (โหมด repay)
const targetDayEntries = useMemo(() =>
  (mode !== "repay" || dow === null || !fixedTargetTeacherId) ? [] : allEntries.filter(e =>
    (e.teacher_id === fixedTargetTeacherId || e.teacher_id_2 === fixedTargetTeacherId) && e.day_of_week === dow && !e.is_break
  ).sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0))
, [mode, allEntries, dow, fixedTargetTeacherId]);
// ★ คาบของเราเองในวันเดียวกัน (ใช้เช็คว่าง/ไม่ว่างจริง แบบเทียบเวลาทับกัน)
const myBusyEntriesThatDay = useMemo(() =>
  (dow === null) ? [] : allEntries.filter(e =>
    (e.teacher_id === user.id || e.teacher_id_2 === user.id) && e.day_of_week === dow && !e.is_break
  )
, [allEntries, dow, user.id]);

function amIFreeAt(entry: TimetableEntry) {
  return !myBusyEntriesThatDay.some(e => timeRangesOverlap(entry.start_time, entry.end_time, e.start_time, e.end_time));
}

  const myDayEntries = useMemo(() =>
    (dow === null ? [] : allEntries.filter(e =>
      (e.teacher_id === user.id || e.teacher_id_2 === user.id) && e.day_of_week === dow && !e.is_break
    )).sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0))
  , [allEntries, dow, user.id]);
  // ★ โหลดข้อมูลประกอบใหม่ทุกครั้งที่เปลี่ยนวันที่: ครูที่ลาวันนั้น + สถิติสอนแทนสะสม + ครูประจำชั้น
  useEffect(() => {
    setSelectedEntry(null); setPickedTeacherId("");
    if (!swapDate) return;
    setLoadingMeta(true);
    (async () => {
      const [leavesRes, subHistRes, classroomsRes] = await Promise.all([
        supabase.from("leave_requests").select("user_id,start_date,end_date,status").in("status", ["pending","approved"]),
        supabase.from("substitution_records").select("substitute_teacher_id"),
        // ★ ครูประจำชั้น: fetch แยกแบบกันพัง เผื่อคอลัมน์ homeroom_teacher_id ยังไม่มีในตาราง classrooms
        supabase.from("classrooms").select("id,homeroom_teacher_id"),
      ]);
      const ids = new Set<string>();
      (leavesRes.data || []).forEach((l: any) => { if (l.start_date <= swapDate && l.end_date >= swapDate) ids.add(l.user_id); });
      setOnLeaveIds(ids);
      const counts: Record<string, number> = {};
      (subHistRes.data || []).forEach((r: any) => { counts[r.substitute_teacher_id] = (counts[r.substitute_teacher_id] ?? 0) + 1; });
      setSubHistCounts(counts);

      if (classroomsRes.error) {
        console.error("[SwapRequestModal] ไม่พบคอลัมน์ homeroom_teacher_id ในตาราง classrooms (กฎครูประจำชั้น ป.1/ป.2 จะไม่ทำงาน):", classroomsRes.error.message);
        setHomeroomMap({});
      } else {
        const hrMap: Record<string, string> = {};
        (classroomsRes.data || []).forEach((c: any) => { if (c.homeroom_teacher_id) hrMap[c.id] = c.homeroom_teacher_id; });
        setHomeroomMap(hrMap);
      }
      setLoadingMeta(false);
    })();
  }, [swapDate]);

  // ── กลุ่มวิชาที่ให้นับเป็น "ใกล้เคียงกัน" ตอนหาครูสำรองขั้นที่ 3
// match = คำที่เจอในชื่อวิชาของคาบที่ขอลา, related = คำที่ใช้ค้นหาครูสำรอง
// useGradeBand = true → จำกัดเฉพาะครูที่สอนในช่วงชั้นเดียวกัน (ไม่ใช่ทั้งโรงเรียน)
const SUBJECT_GROUP_RULES: { match: string[]; related: string[]; useGradeBand: boolean; groupLabel: string }[] = [
  { match: ["วิทยาศาสตร์"], related: ["วิทยาศาสตร์", "เทคโนโลยี"], useGradeBand: true, groupLabel: "วิทยาศาสตร์/เทคโนโลยี" },
  { match: ["คอมพิวเตอร์"], related: ["คอมพิวเตอร์"], useGradeBand: false, groupLabel: "คอมพิวเตอร์" },
];

function gradeBand(gradeGroup?: string | null): string {
  const g = extractGradeOnly(gradeGroup);
  if (["ป.1","ป.2","ป.3"].includes(g)) return "primary_lower";
  if (["ป.4","ป.5","ป.6"].includes(g)) return "primary_upper";
  if (["ม.1","ม.2","ม.3"].includes(g)) return "secondary_lower";
  if (["ม.4","ม.5","ม.6"].includes(g)) return "secondary_upper";
  if (g.startsWith("อ.")) return "kindergarten";
  return "";
}
const GRADE_BAND_LABEL: Record<string,string> = {
  primary_lower: "ประถมต้น", primary_upper: "ประถมปลาย",
  secondary_lower: "มัธยมต้น", secondary_upper: "มัธยมปลาย", kindergarten: "อนุบาล",
};

  // ★ รายชื่อครูที่ว่าง จัดเป็นชั้นลำดับความสำคัญตามกฎ
  const tiers = useMemo(() => {
    if (!selectedEntry || dow === null) return [] as { label: string; teachers: User[] }[];
    const busyIds = new Set(
  allEntries.filter(e => e.day_of_week === dow && timeRangesOverlap(selectedEntry.start_time, selectedEntry.end_time, e.start_time, e.end_time))
    .flatMap(e => compactIds([e.teacher_id, e.teacher_id_2]))
);
    const isEligible = (t: User) => t.id !== user.id && !busyIds.has(t.id) && !onLeaveIds.has(t.id);
    const scored = (list: User[]) => list
      .filter(isEligible)
      .map(t => ({
        teacher: t,
        free: computeFreePeriodsForDay(t.id, dow, selectedEntry.schedule_type ?? undefined, allEntries, allTimeSlots),
        hist: subHistCounts[t.id] ?? 0,
      }))
      .sort((a, b) => b.free - a.free || a.hist - b.hist)
      .map(x => x.teacher);

    const result: { label: string; teachers: User[] }[] = [];
    const used = new Set<string>();

    // 1. ครูประจำชั้น — ป.1/ป.2 เท่านั้น
    if (isHomeroomPriorityGrade(selectedEntry.grade_group)) {
      const hrId = homeroomMap[selectedEntry.classroom_id];
      const hr = hrId ? allTeachers.find(t => t.id === hrId) : null;
      if (hr && isEligible(hr)) { result.push({ label: "👩‍🏫 ครูประจำชั้น (สอนแทนก่อนเสมอ)", teachers: [hr] }); used.add(hr.id); }
    }

    // 2. สายชั้นเดียวกัน (ทั้งโรงเรียน ไม่ใช่แค่ห้องเดียวกัน)
    const gradeOnly = extractGradeOnly(selectedEntry.grade_group);
    if (gradeOnly) {
      const gradeIds = new Set(
        allEntries.filter(e => extractGradeOnly(e.grade_group) === gradeOnly)
          .flatMap(e => compactIds([e.teacher_id, e.teacher_id_2]))
      );
      const list = scored(allTeachers.filter(t => gradeIds.has(t.id) && !used.has(t.id)));
      if (list.length > 0) { result.push({ label: `🏫 สายชั้น ${gradeOnly}`, teachers: list }); list.forEach(t => used.add(t.id)); }
    }

    // 3. วิชาเดียวกัน หรือ กลุ่มวิชาใกล้เคียง (ตามกฎพิเศษ)
{
  const subjectName = selectedEntry.subject_name ?? "";
  const rule = SUBJECT_GROUP_RULES.find(r => r.match.some(k => subjectName.includes(k)));
  const band = gradeBand(selectedEntry.grade_group);

  let subjIds = new Set<string>();
  let tierLabel = "📘 ครูวิชาเดียวกัน";

  if (rule) {
    subjIds = new Set(
      allEntries.filter(e =>
        rule.related.some(k => (e.subject_name ?? "").includes(k)) &&
        (!rule.useGradeBand || gradeBand(e.grade_group) === band)
      ).flatMap(e => compactIds([e.teacher_id, e.teacher_id_2]))
    );
    tierLabel = rule.useGradeBand
      ? `📘 ครู${rule.groupLabel} (${GRADE_BAND_LABEL[band] ?? ""})`
      : `📘 ครูวิชา${rule.groupLabel}`;
  } else if (selectedEntry.subject_id) {
    subjIds = new Set(
      allEntries.filter(e => e.subject_id === selectedEntry.subject_id)
        .flatMap(e => compactIds([e.teacher_id, e.teacher_id_2]))
    );
  }

  const list = scored(allTeachers.filter(t => subjIds.has(t.id) && !used.has(t.id)));
  if (list.length > 0) { result.push({ label: tierLabel, teachers: list }); list.forEach(t => used.add(t.id)); }
}
    // 4. กรณีวิกฤต — ครูที่ว่างทั้งหมดที่เหลือ
    const rest = scored(allTeachers.filter(t => !used.has(t.id)));
    if (rest.length > 0) result.push({ label: "⚠️ ครูที่ว่างทั้งหมด (นอกสายชั้น/วิชา)", teachers: rest });

    return result;
  }, [selectedEntry, dow, allEntries, allTeachers, allTimeSlots, onLeaveIds, subHistCounts, homeroomMap, user.id]);

  const validate = () => {
  const e: Record<string,boolean> = {};
  if (!swapDate) e.swapDate = true;
  if (!selectedEntry) e.selectedEntry = true;
  if (mode !== "repay" && !pickedTeacherId) e.pickedTeacherId = true;
  setErrors(e);
  return Object.keys(e).length === 0;
};

  const handleSave = async () => {
  if (!validate()) return;
  setSaving(true);
  const targetId = mode === "repay" ? fixedTargetTeacherId! : pickedTeacherId;
  const { error } = await supabase.from("class_swap_requests").insert([{
    requester_id: user.id, target_teacher_id: targetId,
    requester_entry_id: selectedEntry!.id, target_entry_id: null,
    swap_date: swapDate, reason, status: "pending", academic_year_id: academicYearId,
  }]);
  setSaving(false);
  if (error) { alert("❌ "+error.message); return; }
  onSave();
};

  const iCls = (err?: boolean) =>
    `w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors bg-white
    ${err ? "border-red-400 bg-red-50" : "border-[#F9A8D4] focus:border-[#DB2777] text-slate-800"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">
  {mode === "repay" ? `🔄 ขอแลกคาบคืนให้ ${fullName(targetTeacher)}` : "🔄 ขอแลกคาบสอน"}
</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* ★ 1) วันที่ต้องการแลก — ช่องแรก */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              วันที่ต้องการแลก <span className="text-red-400">*</span>
            </label>
            <input type="date" value={swapDate} onChange={e=>setSwapDate(e.target.value)} className={iCls(errors.swapDate)} />
          </div>

          {/* ★ 2) คาบของฉันวันนั้น — ตารางกดเลือก เทา -> น้ำเงิน */}
          {swapDate && (
  <div>
    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
      {mode === "repay"
        ? `ตารางสอนของครู ${fullName(targetTeacher)} ในวัน${TH_DAYS[dow!]} — กดเลือกคาบที่คุณจะขอสอนแทน`
        : `คาบของฉันในวัน${TH_DAYS[dow!]} — กดเลือกคาบที่ต้องการแลก`
      } <span className="text-red-400">*</span>
    </label>

    {mode === "repay" ? (
      targetDayEntries.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center bg-[#FDF2F8] rounded-xl border border-[#FBCFE8]">
          ครู{fullName(targetTeacher)}ไม่มีคาบสอนในวันนี้ ลองเปลี่ยนวันที่ดูครับ
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {targetDayEntries.map(e => {
            const free = amIFreeAt(e);
            const active = selectedEntry?.id === e.id;
            return (
              <button key={e.id} type="button" disabled={!free}
                onClick={() => { if (free) setSelectedEntry(e); }}
                className={`p-2.5 rounded-xl border-2 text-[11px] font-bold text-left transition-all ${
                  !free
                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                    : active
                      ? "bg-[#DB2777] border-[#DB2777] text-white"
                      : "bg-white border-[#F9A8D4] text-slate-700 hover:bg-[#FDF2F8]"
                }`}>
                <div className="flex justify-between"><span>{e.slot_label}</span><span className="opacity-70">{e.start_time?.slice(0,5)}</span></div>
                <div className="truncate mt-0.5">{e.subject_name ?? "ไม่ระบุวิชา"}</div>
                <div className={`truncate ${active ? "opacity-80" : "text-slate-400"}`}>{e.room_name ?? ""}</div>
                {!free && <div className="text-[10px] font-bold mt-0.5">🔒 คุณมีคาบสอนตรงนี้</div>}
              </button>
            );
          })}
        </div>
      )
    ) : (
      myDayEntries.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center bg-[#FDF2F8] rounded-xl border border-[#FBCFE8]">ไม่มีคาบสอนของคุณในวันนี้</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {myDayEntries.map(e => {
            const active = selectedEntry?.id === e.id;
            return (
              <button key={e.id} type="button"
                onClick={() => { setSelectedEntry(e); setPickedTeacherId(""); }}
                className={`p-2.5 rounded-xl border-2 text-[11px] font-bold text-left transition-all ${
                  active ? "bg-[#DB2777] border-[#DB2777] text-white" : "bg-[#FCE7F3] border-[#FBCFE8] text-slate-600 hover:bg-[#FBCFE8]"
                }`}>
                <div className="flex justify-between"><span>{e.slot_label}</span><span className="opacity-70">{e.start_time?.slice(0,5)}</span></div>
                <div className="truncate mt-0.5">{e.subject_name ?? "ไม่ระบุวิชา"}</div>
                <div className={`truncate ${active ? "opacity-80" : "text-slate-400"}`}>{e.room_name ?? ""}</div>
              </button>
            );
          })}
        </div>
      )
    )}
    {errors.selectedEntry && <p className="text-xs text-red-500 mt-1">กรุณาเลือกคาบ</p>}
  </div>
)}
          {/* ★ 3) รายชื่อครูที่ว่าง เรียงตามกฎ */}
          {selectedEntry && (
  mode === "repay" ? (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1.5">สรุปคำขอแลกคาบคืน</p>
      <p className="text-sm text-slate-700">ครูเจ้าของคาบเดิม: <span className="font-bold text-[#DB2777]">{fullName(targetTeacher)}</span></p>
      <p className="text-sm text-slate-700 mt-1">คุณจะสอนแทนคาบนี้เอง: <span className="font-bold text-emerald-700">{fullName(user)} (คุณ)</span></p>
      <p className="text-xs text-slate-400 mt-2">💡 คำขอนี้จะถูกส่งไปให้ {fullName(targetTeacher)} กดยืนยันในแท็บ "🔄 แลกคาบ" ก่อน จึงจะมีผล</p>
    </div>
  ) : (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        เลือกครูที่จะขอให้สอนแทน <span className="text-red-400">*</span>
      </label>
      {loadingMeta ? (
        <p className="text-xs text-slate-400">⏳ กำลังตรวจสอบครูที่ว่าง...</p>
      ) : tiers.length === 0 ? (
        <p className="text-xs text-red-500 font-bold">ไม่พบครูที่ว่างในคาบนี้</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {tiers.map(tier => (
            <div key={tier.label}>
              <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">{tier.label}</p>
              <div className="space-y-1.5">
                {tier.teachers.map(t => {
                  const active = pickedTeacherId === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setPickedTeacherId(t.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm font-bold flex items-center justify-between transition-all ${
                        active ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "bg-white border-[#FBCFE8] text-slate-700 hover:bg-[#FDF2F8]"
                      }`}>
                      <span>{fullName(t)}{t.position ? ` · ${t.position}` : ""}</span>
                      {active && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {errors.pickedTeacherId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกครู</p>}
    </div>
  )
)}

          {/* เหตุผล */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เหตุผล</label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
              placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)" className={iCls()+" resize-none"} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end shrink-0 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm font-medium">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังส่ง..." : "📤 ส่งคำขอ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AssignSubModal ──────────────────────────────────────────
function AssignSubModal({ leaveRequest, teachers, entries, academicYearId, currentUser, onSave, onClose }: {
  leaveRequest: LeaveRequest; teachers: User[];
  entries: TimetableEntry[]; academicYearId: string;
  currentUser: User; onSave: () => void; onClose: () => void;
}) {
  const absentId = leaveRequest.user_id;
  const absentEntries = entries.filter(e => e.teacher_id === absentId || e.teacher_id_2 === absentId);
  const absentTeacher = useMemo(
  () => teachers.find(t => t.id === absentId) ?? null,
  [teachers, absentId]
);
  const leaveDates: string[] = [];
  const start = new Date(leaveRequest.start_date+"T00:00:00");
  const end   = new Date(leaveRequest.end_date+"T00:00:00");
  for (let d=new Date(start); d<=end; d=addDays(d,1)) {
    if (d.getDay()>=1&&d.getDay()<=5) leaveDates.push(ymd(d));
  }

  const [assignments, setAssignments] = useState<Record<string, string>>(
    () => Object.fromEntries(absentEntries.flatMap(e =>
      leaveDates.map(dt => [`${e.id}_${dt}`, ""])
    ))
  );
  const [saving, setSaving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  function setAsgn(key: string, val: string) {
    setAssignments(prev => ({ ...prev, [key]: val }));
  }

  // ★ จำนวนคาบที่ครูแต่ละคนสอนอยู่แล้วในวันนั้น (นับตารางสอนจริง + คาบที่เพิ่งจัดในหน้าต่างนี้)
  function dayLoadMap(date: string, candidates: User[]): Record<string, number> {
    const dow = dowOf(date);
    const map: Record<string, number> = {};
    for (const t of candidates) {
      const base = computeTaughtPeriodsForDay(t.id, dow, entries);
      const extra = Object.entries(assignments).filter(([k, subId]) => subId === t.id && k.endsWith(`_${date}`)).length;
      map[t.id] = base + extra;
    }
    return map;
  }

  // ★ จัดอัตโนมัติ — เลือกครูว่างที่มีภาระคาบวันนั้นน้อยที่สุดให้ทุกคาบที่ยังไม่ได้จัด
  function autoAssignAll() {
    setAutoRunning(true);
    const next: Record<string, string> = { ...assignments };
    const tally: Record<string, number> = {}; // `${teacherId}_${date}`
    let total = 0, newlyFilled = 0, unfilled = 0;
    for (const date of leaveDates) {
      const dow = dowOf(date);
      const dayEntries = absentEntries.filter(e => e.day_of_week === dow && !e.is_break);
      for (const entry of dayEntries) {
  const key = `${entry.id}_${date}`;
  if (coTeacherId(entry, absentId)) continue; // ★ มีครูคู่สอนอยู่แล้ว ไม่ต้องจัด ไม่ต้องนับ
  total++;
  if (next[key]) continue;
  const candidates = computeFreeTeachersForEntry(entry, date, entries, teachers, absentId);
        if (candidates.length === 0) { unfilled++; continue; }
        const scored = candidates.map(t => {
          const tKey = `${t.id}_${date}`;
          const load = computeTaughtPeriodsForDay(t.id, dow, entries) + (tally[tKey] ?? 0);
          return { t, load };
        }).sort((a, b) => a.load - b.load || fullName(a.t).localeCompare(fullName(b.t), "th"));
        const pick = scored[0].t;
        next[key] = pick.id;
        const tKey = `${pick.id}_${date}`;
        tally[tKey] = (tally[tKey] ?? 0) + 1;
        newlyFilled++;
      }
    }
    setAssignments(next);
    setAutoRunning(false);
    if (newlyFilled === 0 && unfilled === 0) {
      alert("ทุกคาบถูกจัดครูไว้แล้ว");
    } else if (unfilled > 0) {
      alert(`⚡ จัดอัตโนมัติสำเร็จ ${newlyFilled} คาบ\n⚠️ เหลือ ${unfilled} คาบที่ไม่มีครูว่าง กรุณาเลือกเอง`);
    } else {
      alert(`⚡ จัดอัตโนมัติสำเร็จครบ ${newlyFilled} คาบ`);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    const records = Object.entries(assignments)
      .filter(([,v]) => v)
      .map(([key, subId]) => {
        const [entryId, date] = key.split("_");
        const entry = absentEntries.find(e => e.id === entryId);
        return {
          leave_request_id: leaveRequest.id,
          original_teacher_id: absentId,
          absent_teacher_id: absentId,
          substitute_teacher_id: subId,
          timetable_entry_id: entryId,
          substitute_date: date,
          time_slot_id: entry?.time_slot_id,
          classroom_id: entry?.classroom_id,
          subject_id: entry?.subject_id,
          hours_count: computeSlotHours(entry),
          assigned_by: currentUser.id,
          status: "assigned",
          academic_year_id: academicYearId,
          note: "จัดโดยแอดมิน (หน้าแลกคาบ)",
        };
      });
    if (records.length === 0) { alert("กรุณาเลือกครูสอนแทนอย่างน้อย 1 คาบ"); setSaving(false); return; }
    const { error } = await supabase.from("substitution_records").insert(records);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 text-base">📋 จัดครูสอนแทน</h3>
            <p className="text-sm text-slate-500">{fullName(leaveRequest.user)} ลา {thaiDate(leaveRequest.start_date)}
              {leaveRequest.start_date !== leaveRequest.end_date ? ` – ${thaiDate(leaveRequest.end_date)}` : ""}
              {" "}({leaveRequest.days_count} วัน)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {absentEntries.length > 0 && (
              <button onClick={autoAssignAll} disabled={autoRunning}
                className="px-3 py-2 rounded-xl bg-[#FB7185] hover:bg-[#BE185D] text-[#9D174D] text-xs font-bold disabled:opacity-50 whitespace-nowrap">
                ⚡ จัดอัตโนมัติ
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500 shrink-0">✕</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {absentEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของครูคนนี้</div>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-[#9D174D] bg-[#FDF2F8] border border-[#F9A8D4] rounded-xl px-3 py-2">
                💡 ปุ่ม "⚡ จัดอัตโนมัติ" จะเลือกครูที่ว่างและมีคาบสอนวันนั้นน้อยที่สุดให้ทุกคาบที่ยังไม่ได้จัด — ตัวเลข "X คาบ" ข้างชื่อครูคือจำนวนคาบที่ครูสอนอยู่แล้วในวันนั้น ถ้าครบ {SUB_LOAD_WARN_AT} คาบจะมี ⚠️ เตือนให้พิจารณาก่อนเลือก
              </p>
              {leaveDates.map(date => {
  const dayOfWeek = new Date(date+"T00:00:00").getDay();
  const dayEntries = absentEntries
    .filter(e => e.day_of_week === dayOfWeek && !e.is_break)
    .sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0));
  if (dayEntries.length === 0) return null;
                return (
                  <div key={date}>
                    <h4 className="font-bold text-slate-700 text-sm mb-3 pb-2 border-b border-[#FBCFE8]">
                      📅 {TH_DAYS[dayOfWeek]} {thaiDate(date)}
                    </h4>
                    <div className="space-y-2">
                      {dayEntries.map(entry => {
  const key = `${entry.id}_${date}`;
  const coId = coTeacherId(entry, absentId);
  const coTeacher = coId ? teachers.find(t => t.id === coId) : null;

  // ★ มีครูอีกคนสอนคู่อยู่ในคาบนี้แล้ว — ไม่ต้องจัดสอนแทน แค่โชว์ให้เห็น
  if (coTeacher) {
    return (
      <div key={key} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div className="shrink-0 text-center w-16">
          <div className="text-xs font-bold text-emerald-600">{entry.slot_label}</div>
          <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
          <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold text-emerald-600">👥 มีครูสอนคู่อยู่แล้ว</p>
          <p className="text-sm font-bold text-emerald-800">{fullName(coTeacher)}</p>
        </div>
      </div>
    );
  }

  return (
    <div key={key} className="flex items-center gap-3 bg-[#FDF2F8] rounded-xl px-4 py-3">
      <div className="shrink-0 text-center w-16">
        <div className="text-xs font-bold text-[#DB2777]">{entry.slot_label}</div>
        <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
        <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
      </div>
      <div className="shrink-0 w-72 sm:w-80">
        <TeacherSearchSelect
          teachers={sortTeachersByGrade(
            computeFreeTeachersForEntry(entry, date, entries, teachers, absentId),
            sameGradeTeacherIds(absentTeacher, teachers)
          )}
          value={assignments[key] || ""}
          onChange={id => setAsgn(key, id)}
          placeholder="— เลือกครูสอนแทน —"
          loadMap={dayLoadMap(date, computeFreeTeachersForEntry(entry, date, entries, teachers, absentId))}
        />
      </div>
    </div>

                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end shrink-0 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการสอนแทน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── ManualAssignModal — จัดสอนแทนทันทีไม่ต้องรอใบลา (ลาผ่าตัด/ลายาว)
// ══════════════════════════════════════════════════════════
function ManualAssignModal({ selectableTeachers, allTeachers, entries, academicYearId, currentUser, onSave, onClose }: {
  selectableTeachers: User[]; allTeachers: User[]; entries: TimetableEntry[]; academicYearId: string;
  currentUser: User; onSave: () => void; onClose: () => void;
}) {
  const [absentTeacherId, setAbsentTeacherId] = useState("");
  const [startDate, setStartDate] = useState(ymd(new Date()));
  const [endDate, setEndDate] = useState(ymd(new Date()));
  const [reason, setReason] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const absentEntries = useMemo(() =>
  absentTeacherId ? entries.filter(e => (e.teacher_id === absentTeacherId || e.teacher_id_2 === absentTeacherId) && !e.is_break) : []
, [entries, absentTeacherId]);
const absentTeacher = useMemo(
  () => allTeachers.find(t => t.id === absentTeacherId) ?? null,
  [allTeachers, absentTeacherId]
);
  const leaveDates = useMemo(() => {
    if (!absentTeacherId || !startDate || !endDate || startDate > endDate) return [] as string[];
    const dates: string[] = [];
    let d = new Date(startDate + "T00:00:00");
    const last = new Date(endDate + "T00:00:00");
    while (d <= last) {
      if (d.getDay() >= 1 && d.getDay() <= 5) dates.push(ymd(d));
      d = addDays(d, 1);
    }
    return dates;
  }, [absentTeacherId, startDate, endDate]);

  useEffect(() => { setAssignments({}); }, [absentTeacherId, startDate, endDate]);

  function setAsgn(key: string, val: string) {
    setAssignments(prev => ({ ...prev, [key]: val }));
  }

  // ★ สุ่มเลือกครูสอนแทน — จากครูสายชั้นเดียวกับครูที่ลา ที่ว่างตรงคาบ และมีคาบสอนวันนั้นน้อยที่สุด
  // ถ้าไม่มีครูสายชั้นเดียวกันว่างเลย จะสุ่มจากครูว่างทั้งหมดแทน (กันเคสไม่มีตัวเลือก)
  function randomAssignTeacher(key: string, entry: TimetableEntry, date: string) {
    const dow = dowOf(date);
    const candidates = computeFreeTeachersForEntry(entry, date, entries, allTeachers, absentTeacherId);
    if (candidates.length === 0) { alert("⚠️ ไม่มีครูว่างในคาบนี้"); return; }
    const gradeIds = sameGradeTeacherIds(absentTeacher, allTeachers);
    let pool = candidates.filter(t => gradeIds.has(t.id));
    if (pool.length === 0) pool = candidates;
    const scored = pool.map(t => ({ t, load: computeTaughtPeriodsForDay(t.id, dow, entries) }));
    const minLoad = Math.min(...scored.map(s => s.load));
    const minPool = scored.filter(s => s.load === minLoad).map(s => s.t);
    const pick = minPool[Math.floor(Math.random() * minPool.length)];
    setAsgn(key, pick.id);
  }

  const handleSave = async () => {
    if (!absentTeacherId) { alert("กรุณาเลือกครูที่ลา"); return; }
    if (leaveDates.length === 0) { alert("กรุณาเลือกช่วงวันที่ให้ถูกต้อง"); return; }
    setSaving(true);
    const records = Object.entries(assignments)
      .filter(([, v]) => v)
      .map(([key, subId]) => {
        const [entryId, date] = key.split("_");
        const entry = absentEntries.find(e => e.id === entryId);
        return {
          leave_request_id: null,
          original_teacher_id: absentTeacherId,
          absent_teacher_id: absentTeacherId,
          substitute_teacher_id: subId,
          timetable_entry_id: entryId,
          substitute_date: date,
          time_slot_id: entry?.time_slot_id,
          classroom_id: entry?.classroom_id,
          subject_id: entry?.subject_id,
          hours_count: computeSlotHours(entry),
          assigned_by: currentUser.id,
          status: "assigned",
          academic_year_id: academicYearId,
          note: `จัดโดยแอดมิน (ลาต่อเนื่อง/ไม่มีใบลาในระบบ)${reason ? " — " + reason : ""}`,
        };
      });
    if (records.length === 0) { alert("กรุณาเลือกครูสอนแทนอย่างน้อย 1 คาบ"); setSaving(false); return; }
    const { error } = await supabase.from("substitution_records").insert(records);
    setSaving(false);
    if (error) { alert("❌ " + error.message); return; }
    onSave();
  };

  return (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
    <div className="bg-white w-full max-w-[96vw] h-full max-h-[95vh] rounded-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">⚡ จัดสอนแทนทันที (ไม่ต้องรอใบลา)</h3>
            <p className="text-sm text-slate-500">สำหรับกรณีลาผ่าตัด/ลายาว — เลือกครู + ช่วงวันที่แล้วจัดสอนแทนได้เลย</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ครูที่ลา *</label>
  <TeacherSearchSelect
    teachers={selectableTeachers.filter(isSelectableTeacher)}
    value={absentTeacherId}
    onChange={setAbsentTeacherId}
    placeholder="— เลือกครู —"
  />
  {selectableTeachers.length === 0 && (
    <p className="text-xs text-amber-600 font-bold mt-1">ไม่พบครูในสิทธิ์ของคุณ</p>
  )}
</div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">วันที่เริ่มลา *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">วันที่สิ้นสุด *</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">หมายเหตุ</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ลาผ่าตัด, ลาคลอด..."
              className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
          </div>

          {absentTeacherId && leaveDates.length === 0 && (
            <p className="text-xs text-red-500 font-bold">กรุณาเลือกช่วงวันที่ให้ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)</p>
          )}

          {absentTeacherId && leaveDates.length > 0 && (
            absentEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของครูคนนี้</div>
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-[#9D174D] bg-[#FDF2F8] border border-[#F9A8D4] rounded-xl px-3 py-2">
                  💡 รายชื่อครูในช่อง "เลือกครูสอนแทน" จะเรียงครูสายชั้นเดียวกับครูที่ลาไว้ก่อน — ตัวเลข "X คาบ" ข้างชื่อครูคือจำนวนคาบที่ครูสอนอยู่แล้วในวันนั้น ถ้าครบ {SUB_LOAD_WARN_AT} คาบจะมี ⚠️ เตือน และกดปุ่ม 🎲 เพื่อสุ่มครูสายชั้นเดียวกันที่ว่างตรงคาบและมีคาบน้อยที่สุดให้อัตโนมัติ
                </p>
                {leaveDates.map(date => {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  const dayEntries = absentEntries
    .filter(e => e.day_of_week === dayOfWeek)
    .sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0));
  if (dayEntries.length === 0) return null;
                  return (
                    <div key={date}>
                      <h4 className="font-bold text-slate-700 text-sm mb-3 pb-2 border-b border-[#FBCFE8]">
                        📅 {TH_DAYS[dayOfWeek]} {thaiDate(date)}
                      </h4>
                      <div className="space-y-2">
                        {dayEntries.map(entry => {
  const key = `${entry.id}_${date}`;
  const coId = coTeacherId(entry, absentTeacherId);
  const coTeacher = coId ? allTeachers.find(t => t.id === coId) : null;

  // ★ มีครูอีกคนสอนคู่อยู่ในคาบนี้แล้ว — ไม่ต้องจัดสอนแทน แค่โชว์ให้เห็น
  if (coTeacher) {
    return (
      <div key={key} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div className="shrink-0 text-center w-16">
          <div className="text-xs font-bold text-emerald-600">{entry.slot_label}</div>
          <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
          <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold text-emerald-600">👥 มีครูสอนคู่อยู่แล้ว</p>
          <p className="text-sm font-bold text-emerald-800">{fullName(coTeacher)}</p>
        </div>
      </div>
    );
  }

  const dow = dowOf(date);
  const candidates = computeFreeTeachersForEntry(entry, date, entries, allTeachers, absentTeacherId);
  const gradeIds = sameGradeTeacherIds(absentTeacher, allTeachers);
  const sortedCandidates = sortTeachersByGrade(candidates, gradeIds);
  const loadMap = Object.fromEntries(sortedCandidates.map(t => [t.id, computeTaughtPeriodsForDay(t.id, dow, entries)]));
  const pickedId = assignments[key] || "";
  const pickedLoad = pickedId ? computeTaughtPeriodsForDay(pickedId, dow, entries) : null;
  return (
    <div key={key} className="flex items-center gap-3 bg-[#FDF2F8] rounded-xl px-4 py-3">
                              <div className="shrink-0 text-center w-16">
                                <div className="text-xs font-bold text-[#DB2777]">{entry.slot_label}</div>
                                <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
                                <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
                                {pickedId && pickedLoad !== null && pickedLoad >= SUB_LOAD_WARN_AT && (
                                  <div className="text-[11px] font-bold text-red-500 mt-0.5">⚠️ ครูคนนี้สอนวันนี้แล้ว {pickedLoad} คาบ — ควรพิจารณาก่อนยืนยัน</div>
                                )}
                              </div>
                              <div className="shrink-0 w-72 sm:w-80 flex items-center gap-1.5">
  <div className="flex-1 min-w-0">
    <TeacherSearchSelect
      teachers={sortedCandidates}
      value={assignments[key] || ""}
      onChange={id => setAsgn(key, id)}
      placeholder="— เลือกครูสอนแทน —"
      loadMap={loadMap}
    />
  </div>
  <button type="button" onClick={() => randomAssignTeacher(key, entry, date)}
    title="สุ่มครูสายชั้นเดียวกันที่ว่างและมีคาบน้อยที่สุด"
    className="shrink-0 w-9 h-9 rounded-xl bg-[#FDF2F8] hover:bg-[#F9A8D4] border-2 border-[#F9A8D4] flex items-center justify-center text-base">
    🎲
  </button>
</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end shrink-0 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการสอนแทน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function SubstitutionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"swap"|"substitute"|"stat">("swap");
  const [academicYear, setAcademicYear] = useState<AcademicYear|null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [allEntries, setAllEntries] = useState<TimetableEntry[]>([]);
  const [allTimeSlots, setAllTimeSlots] = useState<any[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [subRecords, setSubRecords] = useState<SubRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [assignLeave, setAssignLeave] = useState<LeaveRequest|null>(null);
  const [showManualAssign, setShowManualAssign] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [swapInitialReason, setSwapInitialReason] = useState<string | undefined>(undefined);
  const [swapMode, setSwapMode] = useState<"normal"|"repay">("normal");
  const [swapFixedTargetTeacherId, setSwapFixedTargetTeacherId] = useState<string | undefined>(undefined);
  const [editingSub, setEditingSub] = useState<SubRecord|null>(null);

  const isAdmin = useMemo(() => ADMIN_ROLES.includes(user?.role ?? ""), [user]);
  // ★ ขยายสิทธิ์ "จัดสอนแทน" ให้หัวหน้าสายชั้น/หัวหน้าหมวด ไม่ใช่แค่แอดมิน
  //   ต้องมีคอลัมน์ users.extra_roles (text[]) เก็บค่าเช่น 'grade_head', 'dept_head'
  const canAssignSub = useMemo(() => {
    if (!user) return false;
    if (isAdmin) return true;
    const roles = user.extra_roles ?? [];
    return roles.includes("grade_head") || roles.includes("dept_head");
  }, [user, isAdmin]);
  // ★ รายชื่อครูที่เลือกได้ในโหมด "จัดอัตโนมัติ" — admin เลือกได้ทุกคน, หัวหน้าสายเลือกได้แค่สายชั้นตัวเอง
const manualAssignTeachers = useMemo(() => {
  if (!user) return [];
  const base = teachers.filter(isSelectableTeacher);
  if (isAdmin) return base;
  const roles = user.extra_roles ?? [];
  if (roles.includes("grade_head") && user.grade_level) {
    return base.filter(t => t.grade_level === user.grade_level);
  }
  return [];
}, [teachers, user, isAdmin]);

const canManualAssign = isAdmin || (user?.extra_roles ?? []).includes("grade_head");

  // ── Load user ────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) { setLoading(false); return; }
      let { data } = await supabase.from("users")
        .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email,extra_roles")
        .eq("auth_id", au.id).maybeSingle();
      if (!data && au.email) {
        const r = await supabase.from("users")
          .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email,extra_roles")
          .eq("email", au.email).maybeSingle();
        data = r.data;
        if (data) await supabase.from("users").update({ auth_id: au.id }).eq("id", (data as any).id);
      }
      if (data) setUser(data as User);
      setLoading(false);
    };
    init();
  }, []);

  // ── Load data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;

    // Academic year
    const { data: years } = await supabase.from("academic_years")
      .select("id,year_name,is_current").order("year_name", { ascending: false });
    const ay = (years ?? []).find((y: any) => y.is_current) ?? years?.[0];
    setAcademicYear(ay ?? null);
    const ayId = ay?.id;

    // Teachers
const { data: tch, error: tchErr } = await supabase.from("users")
  .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email,extra_roles")
  .in("role", ["homeroom_teacher","subject_teacher"])
  .order("first_name");

if (tchErr) {
  console.error("[SubstitutionPage] โหลด teachers ไม่สำเร็จ:", tchErr.code, tchErr.message, tchErr.details);
  // fallback: ลองใหม่แบบไม่มี extra_roles เผื่อคอลัมน์นี้ยังไม่มีในตาราง users
  const { data: tchFallback, error: tchErr2 } = await supabase.from("users")
    .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email")
    .in("role", ["teacher","homeroom_teacher","subject_teacher"])
    .order("first_name");
  if (tchErr2) {
    console.error("[SubstitutionPage] fallback ก็ยังพัง:", tchErr2.message);
  }
  setTeachers((tchFallback ?? []) as User[]);
} else {
  setTeachers((tch ?? []) as User[]);
}

    // ★ ตารางสอน — ใช้วิธี resolve เดียวกับหน้าใบลาเป๊ะ (schedule template + virtual slot id)
    let entriesQuery = supabase.from("timetable_entries")
      .select("id,classroom_id,subject_id,teacher_id,teacher_id_2,day_of_week,time_slot_id,academic_year_id");
    if (ayId) entriesQuery = entriesQuery.eq("academic_year_id", ayId);

    const [entriesRes, slotsRes, classroomsRes, subjectsRes] = await Promise.all([
      entriesQuery,
      supabase.from("time_slots")
        .select("id,slot_number,start_time,end_time,slot_label,is_break,schedule_type")
        .order("slot_number", { ascending: true }),
      supabase.from("classrooms").select("id,room_name,grade_group,schedule_type"),
      supabase.from("subjects").select("id,subject_code,name_th"),
    ]);

    const timeSlots = slotsRes.data || [];
    setAllTimeSlots(timeSlots);
    const classroomsMap = Object.fromEntries((classroomsRes.data || []).map((c: any) => [c.id, c]));
    const subjectsMap = Object.fromEntries((subjectsRes.data || []).map((s: any) => [s.id, s]));

    const allE = enrichEntries(entriesRes.data || [], classroomsMap, subjectsMap, timeSlots) as TimetableEntry[];
    setAllEntries(allE);

    // Swap requests (แลกคาบระหว่างครู — เป็นคนละฟีเจอร์กับสอนแทนจากใบลา)
    const swapQ = supabase.from("class_swap_requests")
      .select(`*,
        requester:users!requester_id(id,first_name,last_name,title),
        target_teacher:users!target_teacher_id(id,first_name,last_name,title)`)
      .order("created_at", { ascending: false }).limit(100);
    const { data: swaps } = await swapQ;
    setSwapRequests((swaps ?? []) as SwapRequest[]);

    // ★ Substitution records — ตารางเดียวกับที่หน้าใบลาเขียนลง
    const { data: subs, error: subsErr } = await supabase.from("substitution_records")
      .select(`*,
        absent_teacher:users!absent_teacher_id(id,first_name,last_name,title),
        substitute_teacher:users!substitute_teacher_id(id,first_name,last_name,title)`)
      .order("substitute_date", { ascending: false }).limit(300);
    if (subsErr) {
      console.error("[SubstitutionPage] โหลด substitution_records ไม่สำเร็จ:", subsErr.message, subsErr);
    }
    const entryMap = Object.fromEntries(allE.map(e => [e.id, e]));
    const enrichedSubs: SubRecord[] = (subs ?? []).map((r: any) => {
      const entry = r.timetable_entry_id ? entryMap[r.timetable_entry_id] : null;
      if (entry) {
        return { ...r, subject_name: entry.subject_name, room_name: entry.room_name, grade_group: entry.grade_group, slot_label: entry.slot_label };
      }
      const subj = subjectsMap[r.subject_id];
      const room = classroomsMap[r.classroom_id];
      const roomSlots = buildRoomSlots(room?.schedule_type, timeSlots);
      const slot = roomSlots.find((s: any) => s.id === r.time_slot_id) ?? timeSlots.find((s: any) => s.id === r.time_slot_id);
      return { ...r, subject_name: subj?.name_th ?? null, room_name: room?.room_name ?? null, grade_group: room?.grade_group ?? null, slot_label: slot?.slot_label ?? null };
    });
    setSubRecords(enrichedSubs);

    // Leave requests (approved, within next 30 days)
    const from = ymd(new Date());
    const to   = ymd(addDays(new Date(), 30));
    const { data: leaves } = await supabase.from("leave_requests")
      .select(`*,user:users!user_id(id,first_name,last_name,title,role)`)
      .eq("status", "approved")
      .gte("end_date", from).lte("start_date", to)
      .order("start_date");
    setLeaveRequests((leaves ?? []) as LeaveRequest[]);
  }, [user]);

  useEffect(() => { if (!loading && user) loadData(); }, [loading, user, loadData]);

  // ── Swap actions ─────────────────────────────────────────
  const handleSwapRespond = async (id: string, accept: boolean) => {
    const status = accept ? "accepted" : "rejected";
    await supabase.from("class_swap_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", id);
    await loadData();
  };

  const handleSwapCancel = async (id: string) => {
    if (!confirm("ยืนยันการยกเลิกคำขอ?")) return;
    await supabase.from("class_swap_requests").update({ status: "cancelled" }).eq("id", id);
    await loadData();
  };

  // ★ ยกเลิกรายการสอนแทน — รายการที่ยกเลิกจะถูกตัดออกจากสถิติทั้งหมดโดยอัตโนมัติ
  const handleSubCancel = async (id: string) => {
    if (!confirm("ยืนยันการยกเลิกรายการสอนแทนนี้? รายการนี้จะถูกตัดออกจากสถิติ")) return;
    await supabase.from("substitution_records").update({ status: "cancelled" }).eq("id", id);
    await loadData();
  };
  function EditSubModal({ record, allEntries, teachers, currentUser, onSave, onClose }: {
  record: SubRecord; allEntries: TimetableEntry[]; teachers: User[]; currentUser: User;
  onSave: () => void; onClose: () => void;
}) {
  const entry = allEntries.find(e => e.id === record.timetable_entry_id) ?? null;
  const [newTeacherId, setNewTeacherId] = useState(record.substitute_teacher_id ?? "");
  const [saving, setSaving] = useState(false);

  // ★ ครูที่ลา (เจ้าของคาบเดิม) — ใช้หาสายชั้นเดียวกันจาก grade_level
  const absentTeacher = useMemo(
    () => teachers.find(t => t.id === record.absent_teacher_id) ?? null,
    [teachers, record.absent_teacher_id]
  );

  const rawCandidates = useMemo(() => {
    if (!entry) return teachers.filter(isSelectableTeacher);
    const free = computeFreeTeachersForEntry(entry, record.substitute_date, allEntries, teachers, record.absent_teacher_id);
    // เผื่อครูคนเดิมไม่โผล่ในลิสต์ว่าง (เช่นถูกจัดสอนแทนที่อื่นซ้อนพอดี) ให้ใส่กลับเข้าไปด้วยเสมอ
    if (record.substitute_teacher_id && !free.some(t => t.id === record.substitute_teacher_id)) {
      const old = teachers.find(t => t.id === record.substitute_teacher_id);
      if (old) return [old, ...free];
    }
    return free;
  }, [entry, allEntries, teachers, record]);

  // ★ เรียงครูสายชั้นเดียวกับ "ครูที่ลา" ขึ้นก่อน
  const candidates = useMemo(
    () => sortTeachersByGrade(rawCandidates, sameGradeTeacherIds(absentTeacher, teachers)),
    [rawCandidates, absentTeacher, teachers]
  );

  // ★ จำนวนคาบที่แต่ละคนสอนอยู่แล้วในวันนั้น — โชว์เป็น badge ข้างชื่อ
  const loadMap = useMemo(() => {
    const dow = dowOf(record.substitute_date);
    return Object.fromEntries(candidates.map(t => [t.id, computeTaughtPeriodsForDay(t.id, dow, allEntries)]));
  }, [candidates, allEntries, record.substitute_date]);

  const handleSave = async () => {
    if (!newTeacherId) { alert("กรุณาเลือกครูสอนแทนคนใหม่"); return; }
    setSaving(true);
    const { error } = await supabase.from("substitution_records").update({
      substitute_teacher_id: newTeacherId,
      assigned_by: currentUser.id,
      note: `${record.note ?? ""}${record.note ? " " : ""}(แก้ไขครูสอนแทนโดยแอดมิน)`,
    }).eq("id", record.id);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-base">✏️ แก้ไขครูสอนแทน</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-[#FDF2F8] rounded-xl px-4 py-3 text-sm">
            <p><span className="text-slate-400">วันที่:</span> {thaiDate(record.substitute_date)} · {record.slot_label ?? "-"}</p>
            <p><span className="text-slate-400">วิชา:</span> {record.subject_name ?? "-"} · {record.room_name ?? "-"}</p>
            <p><span className="text-slate-400">ครูที่ลา:</span> {fullName(record.absent_teacher)}</p>
            <p><span className="text-slate-400">ครูสอนแทนเดิม:</span> <span className="font-bold text-[#DB2777]">{fullName(record.substitute_teacher)}</span></p>
          </div>
          <div>
  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เปลี่ยนเป็นครู *</label>
  <TeacherSearchSelect
    teachers={candidates}
    value={newTeacherId}
    onChange={setNewTeacherId}
    placeholder="— เลือกครูสอนแทนคนใหม่ —"
    loadMap={loadMap}
  />
  {candidates.length === 0 && <p className="text-xs text-red-500 font-bold mt-1">ไม่พบครูว่างในคาบนี้</p>}
</div>
        </div>
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || newTeacherId === record.substitute_teacher_id}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>
  );
}

  // ── Filtered data ────────────────────────────────────────
  const mySwaps = useMemo(() =>
    swapRequests.filter(r => r.requester_id === user?.id || r.target_teacher_id === user?.id)
  , [swapRequests, user]);

  const incomingSwaps = useMemo(() =>
    swapRequests.filter(r => r.target_teacher_id === user?.id && r.status === "pending")
  , [swapRequests, user]);

  const filteredSubs = useMemo(() => {
    let list = subRecords;
    if (filterDate) list = list.filter(r => r.substitute_date === filterDate);
    if (filterTeacher) list = list.filter(r =>
      r.absent_teacher_id === filterTeacher || r.substitute_teacher_id === filterTeacher);
    if (!canAssignSub) list = list.filter(r =>
      r.absent_teacher_id === user?.id || r.substitute_teacher_id === user?.id);
    return list;
  }, [subRecords, filterDate, filterTeacher, canAssignSub, user]);

  // ── Stat ─────────────────────────────────────────────────
  const statMap = useMemo(() => {
    const m: Record<string, { name: string; asAbsent: number; asSub: number; hours: number }> = {};
    for (const r of subRecords) {
      if (r.status === "cancelled") continue;
      if (r.absent_teacher_id) {
        if (!m[r.absent_teacher_id]) m[r.absent_teacher_id] = { name: fullName(r.absent_teacher), asAbsent: 0, asSub: 0, hours: 0 };
        m[r.absent_teacher_id].asAbsent++;
      }
      if (r.substitute_teacher_id) {
        if (!m[r.substitute_teacher_id]) m[r.substitute_teacher_id] = { name: fullName(r.substitute_teacher), asAbsent: 0, asSub: 0, hours: 0 };
        m[r.substitute_teacher_id].asSub++;
        m[r.substitute_teacher_id].hours += Number(r.hours_count);
      }
    }
    return Object.entries(m).sort((a,b) => b[1].hours - a[1].hours);
  }, [subRecords]);

  const combinedHistory = useMemo(() => {
    type HistItem = { key: string; date: string; kind: "swap" | "sub"; data: SwapRequest | SubRecord };
    const swapItems: HistItem[] = swapRequests
      .filter(r => r.status === "accepted")
      .map(r => ({ key: `swap-${r.id}`, date: r.swap_date, kind: "swap" as const, data: r }));
    const subItems: HistItem[] = subRecords
      .map(r => ({ key: `sub-${r.id}`, date: r.substitute_date, kind: "sub" as const, data: r }));
    return [...swapItems, ...subItems]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 40);
  }, [swapRequests, subRecords]);

  // ── Render ───────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#FDF2F8]">
      <div className="w-10 h-10 rounded-full border-[3px] border-[#F9A8D4] border-t-[#FB7185] animate-spin" />
      <p className="text-[#64748B] text-sm font-medium tracking-wide">กำลังโหลด...</p>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF2F8]">
      <div className="bg-white border border-[#FBCFE8] rounded-2xl px-8 py-7 shadow-sm text-center">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-[#1E293B] text-base font-bold">กรุณาเข้าสู่ระบบ</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDF2F8] flex flex-col" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#9D174D] via-[#DB2777] to-[#EC4899] border-b-[3px] border-[#FB7185] px-5 py-4 flex items-center gap-3 shadow-lg shrink-0 relative">
        <button onClick={() => router.push("/dashboard")}
  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold text-lg shrink-0 border border-white/10">
  🏠
</button>
        {/* Signature seal — a small emblem echoing the school stamp on printed orders */}
        <div className="w-11 h-11 rounded-full bg-[#FB7185]/15 border-2 border-[#FB7185] flex items-center justify-center shrink-0">
          <span className="text-lg leading-none">🔄</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-extrabold text-lg leading-tight tracking-tight">แลกคาบ &amp; สอนแทน</h1>
          <p className="text-[#FBCFE8] text-xs sm:text-sm font-medium">{fullName(user)} · ปีการศึกษา {academicYear?.year_name}</p>
        </div>
        <button onClick={() => { setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); setShowSwapModal(true); }}
          className="px-4 py-2 bg-[#FB7185] hover:bg-[#BE185D] text-[#9D174D] text-sm font-bold rounded-xl shadow-sm transition-colors shrink-0">
          + ขอแลกคาบ
        </button>
      </div>

      {/* Incoming swap badge */}
      {incomingSwaps.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-3">
          <span className="text-amber-700 font-bold text-sm">⏳ มีคำขอแลกคาบรอการตอบรับ {incomingSwaps.length} รายการ</span>
          <button onClick={() => setTab("swap")} className="text-xs text-amber-800 underline font-bold">ดู</button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-[#FBCFE8] flex overflow-x-auto shrink-0">
        {([
          ["swap",       "🔄 แลกคาบ"],
          ["substitute", "📋 สอนแทน"],
          ["stat",       "📊 สถิติ/ประวัติ"],
        ] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-3.5 text-sm font-bold border-b-[3px] whitespace-nowrap transition-all
              ${tab===k ? "border-[#FB7185] text-[#9D174D]" : "border-transparent text-[#94A3B8] hover:text-[#1E293B]"}`}>
            {l}
            {k==="swap" && incomingSwaps.length > 0 && (
              <span className="ml-1.5 bg-[#FB7185] text-[#9D174D] text-[10px] font-black px-1.5 py-0.5 rounded-full">{incomingSwaps.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Tab: แลกคาบ ── */}
        {tab === "swap" && (
          <div className="w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">คำขอแลกคาบของฉัน</h2>
              <button onClick={() => { setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); setShowSwapModal(true); }}
                className="px-4 py-2 bg-[#FB7185] hover:bg-[#BE185D] text-white text-sm font-bold rounded-xl">
                + ขอแลกคาบใหม่
              </button>
            </div>

            {/* Incoming */}
            {incomingSwaps.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">⏳ รอตอบรับ ({incomingSwaps.length})</h3>
                <div className="space-y-3">
                  {incomingSwaps.map(r => (
                    <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-bold text-slate-800">{fullName(r.requester)} <span className="text-slate-400 font-normal">ขอแลกคาบ</span></p>
                          <p className="text-sm text-slate-500">📅 {thaiDate(r.swap_date)}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${STATUS_SWAP[r.status]?.cls}`}>
                          {STATUS_SWAP[r.status]?.label}
                        </span>
                      </div>
                      {r.reason && <p className="text-sm text-slate-600 mb-3 bg-white rounded-xl px-3 py-2">{r.reason}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => handleSwapRespond(r.id, true)}
                          className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold">
                          ✅ ตกลง
                        </button>
                        <button onClick={() => handleSwapRespond(r.id, false)}
                          className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold">
                          ❌ ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My requests */}
            <div className="w-full max-w-none">
  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">คำขอทั้งหมดของฉัน</h3>
  
  {mySwaps.length === 0 ? (
    <div className="w-full text-center py-16 bg-white rounded-2xl border border-[#FBCFE8] text-slate-400 shadow-sm">
      <p className="text-5xl mb-3">🔄</p>
      <p className="text-base font-medium">ยังไม่มีคำขอแลกคาบ</p>
    </div>
  ) : (
    <div className="w-full grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      {mySwaps.map(r => (
        <div key={r.id} className="w-full bg-white rounded-2xl border border-[#FBCFE8] p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-800 text-base leading-snug">
                {r.requester_id === user?.id
                  ? <span>ขอแลกกับ <span className="text-[#DB2777]">{fullName(r.target_teacher)}</span></span>
                  : <span><span className="text-[#DB2777]">{fullName(r.requester)}</span> ขอแลกกับคุณ</span>
                }
              </p>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">📅 {thaiDate(r.swap_date)}</p>
            </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border shrink-0 ${STATUS_SWAP[r.status]?.cls}`}>
                          {STATUS_SWAP[r.status]?.label}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-slate-500 mb-2">{r.reason}</p>}
                      {r.requester_id === user?.id && r.status === "pending" && (
                        <button onClick={() => handleSwapCancel(r.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-bold underline">ยกเลิกคำขอ</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: สอนแทน ── */}
        {tab === "substitute" && (
          <div className="w-full p-5 space-y-5">
            {/* แอดมิน/หัวหน้าสายชั้น/หัวหน้าหมวด: จัดสอนแทนจากใบลา */}
            {canAssignSub && leaveRequests.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  📋 ครูที่ลา (รอจัดสอนแทน) — {leaveRequests.length} คน
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {leaveRequests.map(lr => {
                    const alreadyAssigned = subRecords.some(r => r.leave_request_id === lr.id);
                    return (
                      <div key={lr.id} className={`rounded-2xl border p-4 ${alreadyAssigned ? "bg-emerald-50 border-emerald-200" : "bg-white border-[#FBCFE8]"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{fullName(lr.user)}</p>
                            <p className="text-xs text-slate-400">{thaiDate(lr.start_date)} – {thaiDate(lr.end_date)} ({lr.days_count} วัน)</p>
                            <p className="text-xs text-slate-400 mt-0.5">{{sick:"ลาป่วย",personal:"ลากิจ",official:"ลาราชการ",maternity:"ลาคลอด",ordination:"ลาอุปสมบท"}[lr.leave_type]??lr.leave_type}</p>
                          </div>
                          {alreadyAssigned ? (
                            <span className="text-xs font-bold px-2 py-1 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300 shrink-0">จัดแล้ว ✓</span>
                          ) : (
                            <button onClick={() => setAssignLeave(lr)}
                              className="px-3 py-1.5 bg-[#DB2777] hover:bg-[#9D174D] text-white text-xs font-bold rounded-xl shrink-0">
                              จัดสอนแทน
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  💡 ครูที่ยื่นใบลาแล้วจัดสอนแทนไว้ในฟอร์มลาเองแล้ว (🤖/🎯) จะขึ้น "จัดแล้ว ✓" ให้อัตโนมัติ ไม่ต้องจัดซ้ำ
                </p>
              </div>
            )}

            {canManualAssign && (
  <div className="bg-[#FDF2F8] border-2 border-[#F9A8D4] rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
    <div>
      <p className="font-bold text-[#9D174D] text-sm">⚡ จัดอัตโนมัติ (ไม่ต้องรอใบลา)</p>
      <p className="text-xs text-[#BE185D] mt-0.5">
        {isAdmin ? "เลือกครูคนไหนก็ได้ทั้งโรงเรียน" : "เลือกได้เฉพาะครูในสายชั้นของคุณ"} — ใช้เมื่อครูลาผ่าตัด/ลายาวและยังไม่มีใบลาในระบบ
      </p>
    </div>
    <button onClick={() => setShowManualAssign(true)}
      className="px-4 py-2.5 bg-[#FB7185] hover:bg-[#BE185D] text-white text-sm font-bold rounded-xl shrink-0">
      ⚡ จัดอัตโนมัติ
    </button>
  </div>
)}


            {/* Filter + Print */}
<div className="w-full bg-white rounded-2xl border border-[#FBCFE8] p-5 shadow-sm">
  <div className="flex flex-wrap gap-4 items-end justify-between w-full">
    
    {/* ฝั่งตัวกรอง */}
    <div className="flex gap-4 flex-wrap items-end flex-1 min-w-[280px]">
      <div className="flex-1 sm:flex-initial min-w-[160px]">
        <label className="block text-xs font-bold text-slate-400 mb-1.5">วันที่</label>
        <input 
          type="date" 
          value={filterDate} 
          onChange={e=>setFilterDate(e.target.value)}
          className="w-full border-2 border-[#F9A8D4] rounded-xl px-3.5 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none transition-colors" 
        />
      </div>

      {canAssignSub && (
        <div className="flex-1 sm:flex-initial min-w-[200px]">
          <label className="block text-xs font-bold text-slate-400 mb-1.5">ครู</label>
          <select 
            value={filterTeacher} 
            onChange={e=>setFilterTeacher(e.target.value)}
            className="w-full border-2 border-[#F9A8D4] rounded-xl px-3.5 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none transition-colors"
          >
            <option value="">ทั้งหมด</option>
            {teachers.map(t=><option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </div>
      )}

      {(filterDate||filterTeacher) && (
        <button 
          onClick={()=>{setFilterDate("");setFilterTeacher("");}}
          className="px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-red-500 hover:underline transition-colors mb-0.5"
        >
          ✕ ล้างตัวกรอง
        </button>
      )}
    </div>

    {/* ฝั่งปุ่มพิมพ์ */}
    {canAssignSub && filteredSubs.length > 0 && (
      <div className="flex gap-2 shrink-0">
        <button 
          onClick={()=>printSubOrder(filteredSubs, filterDate?thaiDate(filterDate):"ทั้งหมด")}
          className="px-5 py-2.5 bg-[#DB2777] hover:bg-[#9D174D] active:scale-95 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all"
        >
          🖨️ พิมพ์ใบคำสั่ง
        </button>
      </div>
    )}

  </div>
</div>
{/* Sub records table */}
<div className="w-full bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden shadow-sm">
  <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between">
    <h3 className="font-bold text-slate-700 text-base">รายการสอนแทน ({filteredSubs.length})</h3>
  </div>
  
  {filteredSubs.length === 0 ? (
    <div className="text-center py-16 text-slate-400 text-sm">ไม่มีข้อมูล</div>
  ) : (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gradient-to-r from-[#9D174D] to-[#EC4899] text-white text-xs sm:text-sm">
            {["วันที่","คาบ","ห้อง","วิชา","ครูเจ้าของคาบ","ครูสอนแทน","ชม.","ที่มา","สถานะ","แลกคาบคืน", ...(canAssignSub ? ["จัดการ"] : [])].map(h=>(
              <th key={h} className="px-4 py-3.5 text-left font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#FCE7F3]">
          {filteredSubs.map((r,i)=>{
            const src = sourceOf(r.note);
            {r.absent_teacher_id === user?.id && r.status !== "cancelled" && (
  <button
    onClick={() => {
      setSwapInitialReason(`ขอแลกคาบคืนให้ ${fullName(r.substitute_teacher)} ที่เคยสอนแทนให้เมื่อ ${thaiDate(r.substitute_date)} (${r.slot_label ?? "-"})`);
      setShowSwapModal(true);
    }}
    className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-bold border border-purple-200 transition-colors ml-1.5"
  >
    🔄 แลกคาบคืน
  </button>
)}
            return (
              <tr key={r.id} className={`${i%2===0 ? "bg-[#FDF2F8]/50" : "bg-white"} hover:bg-[#FDF2F8]/40 transition-colors`}>
                <td className="px-4 py-3.5 whitespace-nowrap text-xs sm:text-sm">{thaiDate(r.substitute_date)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap text-xs sm:text-sm font-bold text-[#DB2777]">{r.slot_label??"-"}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm whitespace-nowrap">{r.room_name??"-"}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm font-medium">{r.subject_name??"-"}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm font-medium whitespace-nowrap">{fullName(r.absent_teacher)}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm font-semibold text-emerald-700 whitespace-nowrap">{fullName(r.substitute_teacher)}</td>
                <td className="px-4 py-3.5 text-center text-xs sm:text-sm font-bold">{r.hours_count}</td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border inline-block ${SOURCE_LABEL[src].cls}`}>
                    {SOURCE_LABEL[src].label}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border inline-block ${STATUS_SUB[r.status]?.cls}`}>
                    {STATUS_SUB[r.status]?.label??r.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
  {r.absent_teacher_id === user?.id && r.status !== "cancelled" && r.substitute_teacher_id ? (
  <button
    onClick={() => {
      setSwapMode("repay");
      setSwapFixedTargetTeacherId(r.substitute_teacher_id);
      setSwapInitialReason(`ขอแลกคาบคืนให้ ${fullName(r.substitute_teacher)} ที่เคยสอนแทนให้เมื่อ ${thaiDate(r.substitute_date)} (${r.slot_label ?? "-"})`);
      setShowSwapModal(true);
    }}
    className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-bold border border-purple-200 transition-colors"
  >
    🔄 แลกคาบคืน
  </button>
) : (
  <span className="text-xs text-slate-300">—</span>
)}
</td>
                {canAssignSub && (
  <td className="px-4 py-3.5 whitespace-nowrap">
    {r.status !== "cancelled" ? (
      <div className="flex gap-1.5">
        <button onClick={()=>setEditingSub(r)}
          className="px-2.5 py-1.5 rounded-lg bg-[#FDF2F8] hover:bg-[#FBCFE8] text-[#9D174D] text-xs font-bold border border-[#F9A8D4] transition-colors">
          ✏️ แก้ไข
        </button>
        <button onClick={()=>handleSubCancel(r.id)}
          className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold border border-red-200 transition-colors">
          ✕ ยกเลิก
        </button>
      </div>
    ) : (
      <span className="text-xs text-slate-300">—</span>
    )}
  </td>
)}
              </tr>
            );
          })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: สถิติ/ประวัติ ── */}
        {tab === "stat" && (
  <div className="w-full p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">📊 สถิติการสอนแทน</h2>
              {canAssignSub && (
                <button onClick={()=>printTeacherSubStat(subRecords, teachers)}
                  className="px-4 py-2 bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold rounded-xl flex items-center gap-1.5">
                  🖨️ พิมพ์สถิติ (คิดขั้นเงินเดือน)
                </button>
              )}
            </div>

            {/* My stat card */}
            {!canAssignSub && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label:"คาบที่ขาด/ลา", value: subRecords.filter(r=>r.absent_teacher_id===user.id && r.status!=="cancelled").length, color:"#dc2626", icon:"📋" },
                  { label:"ครั้งที่สอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id && r.status!=="cancelled").length, color:"#16a34a", icon:"✅" },
                  { label:"ชั่วโมงสอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id && r.status!=="cancelled").reduce((s,r)=>s+Number(r.hours_count),0), color:"#2563eb", icon:"⏰" },
                  { label:"คำขอแลกคาบ", value: mySwaps.length, color:"#7c3aed", icon:"🔄" },
                ].map(c=>(
                  <div key={c.label} className="bg-white rounded-2xl border border-[#FBCFE8] p-4 flex items-center gap-3">
                    <span className="text-3xl">{c.icon}</span>
                    <div>
                      <div className="text-2xl font-black" style={{color:c.color}}>{c.value}</div>
                      <div className="text-xs text-slate-400 font-medium">{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* All teachers stat table (admin/grade-head/dept-head) */}
            {canAssignSub && (
              <div className="bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#FCE7F3]">
                  <h3 className="font-bold text-slate-700 text-sm">สรุปรายบุคคล</h3>
                </div>
                {statMap.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-[#EC4899] to-[#EC4899] text-white text-xs">
                          <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                          <th className="px-3 py-3 text-center">คาบที่ขาด</th>
                          <th className="px-3 py-3 text-center">ครั้งสอนแทน</th>
                          <th className="px-3 py-3 text-center">รวมชั่วโมง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statMap.map(([id,s],i)=>(
                          <tr key={id} className={i%2===0?"bg-[#FDF2F8]":"bg-white"}>
                            <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                            <td className="px-3 py-3 text-center text-red-600 font-bold">{s.asAbsent}</td>
                            <td className="px-3 py-3 text-center text-emerald-600 font-bold">{s.asSub}</td>
                            <td className="px-3 py-3 text-center">
                              <span className="font-black text-[#DB2777] text-base">{s.hours}</span>
                              <span className="text-slate-400 text-xs"> ชม.</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ประวัติการแลกคาบ/สอนแทน */}
            <div className="bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#FCE7F3]">
                <h3 className="font-bold text-slate-700 text-sm">🕘 ประวัติการแลกคาบ/สอนแทนล่าสุด</h3>
                <p className="text-xs text-slate-400 mt-0.5">รวมทั้งคำขอแลกคาบที่ตกลงแล้ว และรายการสอนแทนทุกที่มา (สูงสุด 40 รายการล่าสุด)</p>
              </div>
              {combinedHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีประวัติ</div>
              ) : (
                <div className="divide-y divide-[#FCE7F3] max-h-[480px] overflow-y-auto">
                  {combinedHistory.map(item => {
                    if (item.kind === "swap") {
                      const r = item.data as SwapRequest;
                      return (
                        <div key={item.key} className="px-5 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-purple-50 text-purple-600 border-purple-200">🔄 แลกคาบเพื่อนครู</span>
                              <span className="text-xs text-slate-400">{thaiDate(r.swap_date)}</span>
                            </div>
                            <p className="text-sm font-bold text-slate-800 mt-1">
                              {fullName(r.requester)} <span className="text-slate-400 font-normal">↔</span> {fullName(r.target_teacher)}
                            </p>
                            {r.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{r.reason}</p>}
                          </div>
                        </div>
                      );
                    }
                    const r = item.data as SubRecord;
                    const src = sourceOf(r.note);
                    return (
                      <div key={item.key} className="px-5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${SOURCE_LABEL[src].cls}`}>{SOURCE_LABEL[src].label}</span>
                            <span className="text-xs text-slate-400">{thaiDate(r.substitute_date)} · {r.slot_label ?? "-"}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 mt-1">
                            {fullName(r.absent_teacher)} <span className="text-slate-400 font-normal">→ สอนแทนโดย</span> {fullName(r.substitute_teacher)}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{r.subject_name ?? "ไม่ระบุวิชา"} · {r.room_name ?? ""} · {r.hours_count} ชม.</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showSwapModal && academicYear && (
  <SwapRequestModal
    user={user} allEntries={allEntries} allTeachers={teachers} allTimeSlots={allTimeSlots}
    academicYearId={academicYear.id}
    initialReason={swapInitialReason}
    mode={swapMode}
    fixedTargetTeacherId={swapFixedTargetTeacherId}
    onSave={async()=>{ setShowSwapModal(false); setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); await loadData(); }}
    onClose={()=>{ setShowSwapModal(false); setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); }}
  />
)}
      {assignLeave && academicYear && (
        <AssignSubModal
          leaveRequest={assignLeave}
          teachers={teachers} entries={allEntries}
          academicYearId={academicYear.id}
          currentUser={user}
          onSave={async()=>{ setAssignLeave(null); await loadData(); }}
          onClose={()=>setAssignLeave(null)}
        />
      )}
      {editingSub && (
  <EditSubModal
    record={editingSub}
    allEntries={allEntries}
    teachers={teachers}
    currentUser={user}
    onSave={async()=>{ setEditingSub(null); await loadData(); }}
    onClose={()=>setEditingSub(null)}
  />
)}
      {showManualAssign && academicYear && (
  <ManualAssignModal
    selectableTeachers={manualAssignTeachers}
    allTeachers={teachers}
    entries={allEntries}
    academicYearId={academicYear.id}
    currentUser={user}
    onSave={async()=>{ setShowManualAssign(false); await loadData(); }}
    onClose={()=>setShowManualAssign(false)}
  />
)}
    </div>
  );
}