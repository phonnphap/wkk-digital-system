"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addDays } from "date-fns";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "academic_head"];

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
  return `${u.title??""} ${u.first_name} ${u.last_name}`.trim();
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

const STATUS_SWAP: Record<string,{label:string;cls:string}> = {
  pending:  { label:"รออนุมัติ",  cls:"bg-amber-50 text-amber-700 border-amber-300" },
  accepted: { label:"ตกลงแล้ว",  cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  rejected: { label:"ปฏิเสธ",    cls:"bg-red-50 text-red-700 border-red-300" },
  cancelled:{ label:"ยกเลิก",    cls:"bg-slate-100 text-slate-500 border-slate-300" },
};
const STATUS_SUB: Record<string,{label:string;cls:string}> = {
  assigned:  { label:"จัดแล้ว",  cls:"bg-blue-50 text-blue-700 border-blue-300" },
  confirmed: { label:"ยืนยัน",   cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  done:      { label:"เสร็จสิ้น",cls:"bg-slate-100 text-slate-600 border-slate-300" },
};
const SOURCE_LABEL: Record<string,{label:string;cls:string}> = {
  auto:      { label:"🤖 อัตโนมัติจากใบลา", cls:"bg-indigo-50 text-indigo-600 border-indigo-200" },
  specific:  { label:"🎯 เจาะจงจากใบลา",   cls:"bg-emerald-50 text-emerald-600 border-emerald-200" },
  admin:     { label:"🏫 แอดมินจัดเอง",     cls:"bg-slate-50 text-slate-600 border-slate-200" },
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
    th { background:#1e3a8a; color:#fff; padding:6px 8px; font-size:11pt; text-align:left; }
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
    th { background:#1e3a8a; color:#fff; padding:6px 8px; }
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
// ── SwapRequestModal — เขียนใหม่ทั้งหมด ─────────────────────
// 1) วันที่อยู่ช่องแรกและใช้กรองคาบจริง (เดิมไม่กรอง)
// 2) คาบของฉันวันนั้นแสดงเป็นตารางกดเลือก (เทา -> น้ำเงินเมื่อเลือก)
// 3) รายชื่อครูที่ว่าง เรียงตามกฎ: ครูประจำชั้น(ป.1/ป.2) -> สายชั้นเดียวกัน
//    (คาบว่างเยอะสุดก่อน, เท่ากันดูสถิติสอนแทนน้อยสุดก่อน) -> วิชาเดียวกัน -> ที่เหลือ
// ══════════════════════════════════════════════════════════
function SwapRequestModal({ user, allEntries, allTeachers, allTimeSlots, academicYearId, onSave, onClose }: {
  user: User; allEntries: TimetableEntry[]; allTeachers: User[]; allTimeSlots: any[]; academicYearId: string;
  onSave: () => void; onClose: () => void;
}) {
  const [swapDate, setSwapDate] = useState(ymd(new Date()));
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(null);
  const [pickedTeacherId, setPickedTeacherId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [onLeaveIds, setOnLeaveIds] = useState<Set<string>>(new Set());
  const [subHistCounts, setSubHistCounts] = useState<Record<string, number>>({});
  const [homeroomMap, setHomeroomMap] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const dow = swapDate ? dowOf(swapDate) : null;

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

  // ★ รายชื่อครูที่ว่าง จัดเป็นชั้นลำดับความสำคัญตามกฎ
  const tiers = useMemo(() => {
    if (!selectedEntry || dow === null) return [] as { label: string; teachers: User[] }[];
    const startKey = (selectedEntry.start_time ?? "").slice(0, 5);
    const busyIds = new Set(
      allEntries.filter(e => e.day_of_week === dow && (e.start_time ?? "").slice(0, 5) === startKey)
        .flatMap(e => [e.teacher_id, e.teacher_id_2].filter(Boolean))
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
          .flatMap(e => [e.teacher_id, e.teacher_id_2].filter(Boolean))
      );
      const list = scored(allTeachers.filter(t => gradeIds.has(t.id) && !used.has(t.id)));
      if (list.length > 0) { result.push({ label: `🏫 สายชั้น ${gradeOnly}`, teachers: list }); list.forEach(t => used.add(t.id)); }
    }

    // 3. วิชาเดียวกัน (ไม่จำกัดสายชั้น)
    if (selectedEntry.subject_id) {
      const subjIds = new Set(
        allEntries.filter(e => e.subject_id === selectedEntry.subject_id)
          .flatMap(e => [e.teacher_id, e.teacher_id_2].filter(Boolean))
      );
      const list = scored(allTeachers.filter(t => subjIds.has(t.id) && !used.has(t.id)));
      if (list.length > 0) { result.push({ label: "📘 ครูวิชาเดียวกัน", teachers: list }); list.forEach(t => used.add(t.id)); }
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
    if (!pickedTeacherId) e.pickedTeacherId = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const { error } = await supabase.from("class_swap_requests").insert([{
      requester_id: user.id, target_teacher_id: pickedTeacherId,
      requester_entry_id: selectedEntry!.id, target_entry_id: null,
      swap_date: swapDate, reason, status: "pending", academic_year_id: academicYearId,
    }]);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    onSave();
  };

  const iCls = (err?: boolean) =>
    `w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors bg-white
    ${err ? "border-red-400 bg-red-50" : "border-blue-200 focus:border-blue-500 text-slate-800"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">🔄 ขอแลกคาบสอน</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
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
                คาบของฉันในวัน{TH_DAYS[dow!]} — กดเลือกคาบที่ต้องการแลก <span className="text-red-400">*</span>
              </label>
              {myDayEntries.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl border border-slate-200">ไม่มีคาบสอนของคุณในวันนี้</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {myDayEntries.map(e => {
                    const active = selectedEntry?.id === e.id;
                    return (
                      <button key={e.id} type="button"
                        onClick={() => { setSelectedEntry(e); setPickedTeacherId(""); }}
                        className={`p-2.5 rounded-xl border-2 text-[11px] font-bold text-left transition-all ${
                          active ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                        }`}>
                        <div className="flex justify-between"><span>{e.slot_label}</span><span className="opacity-70">{e.start_time?.slice(0,5)}</span></div>
                        <div className="truncate mt-0.5">{e.subject_name ?? "ไม่ระบุวิชา"}</div>
                        <div className={`truncate ${active ? "opacity-80" : "text-slate-400"}`}>{e.room_name ?? ""}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {errors.selectedEntry && <p className="text-xs text-red-500 mt-1">กรุณาเลือกคาบ</p>}
            </div>
          )}

          {/* ★ 3) รายชื่อครูที่ว่าง เรียงตามกฎ */}
          {selectedEntry && (
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
                                active ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
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
          )}

          {/* เหตุผล */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เหตุผล</label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
              placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)" className={iCls()+" resize-none"} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-medium">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
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

  function setAsgn(key: string, val: string) {
    setAssignments(prev => ({ ...prev, [key]: val }));
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
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">📋 จัดครูสอนแทน</h3>
            <p className="text-sm text-slate-500">{fullName(leaveRequest.user)} ลา {thaiDate(leaveRequest.start_date)}
              {leaveRequest.start_date !== leaveRequest.end_date ? ` – ${thaiDate(leaveRequest.end_date)}` : ""}
              {" "}({leaveRequest.days_count} วัน)
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {absentEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของครูคนนี้</div>
          ) : (
            <div className="space-y-6">
              {leaveDates.map(date => {
                const dayOfWeek = new Date(date+"T00:00:00").getDay();
                const dayEntries = absentEntries.filter(e => e.day_of_week === dayOfWeek && !e.is_break);
                if (dayEntries.length === 0) return null;
                return (
                  <div key={date}>
                    <h4 className="font-bold text-slate-700 text-sm mb-3 pb-2 border-b border-slate-200">
                      📅 {TH_DAYS[dayOfWeek]} {thaiDate(date)}
                    </h4>
                    <div className="space-y-2">
                      {dayEntries.map(entry => {
                        const key = `${entry.id}_${date}`;
                        return (
                          <div key={key} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            <div className="shrink-0 text-center w-16">
                              <div className="text-xs font-bold text-blue-700">{entry.slot_label}</div>
                              <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
                              <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
                            </div>
                            <div className="shrink-0 w-48">
                              <select value={assignments[key]||""} onChange={e=>setAsgn(key,e.target.value)}
                                className="w-full border-2 border-blue-200 rounded-xl px-2 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                                <option value="">— เลือกครูสอนแทน —</option>
                                {teachers.filter(t=>t.id!==absentId).map(t=>(
                                  <option key={t.id} value={t.id}>{fullName(t)}</option>
                                ))}
                              </select>
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
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
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
  const [filterDate, setFilterDate] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");

  const isAdmin = useMemo(() => ADMIN_ROLES.includes(user?.role ?? ""), [user]);
  // ★ ขยายสิทธิ์ "จัดสอนแทน" ให้หัวหน้าสายชั้น/หัวหน้าหมวด ไม่ใช่แค่แอดมิน
  //   ต้องมีคอลัมน์ users.extra_roles (text[]) เก็บค่าเช่น 'grade_head', 'dept_head'
  const canAssignSub = useMemo(() => {
    if (!user) return false;
    if (isAdmin) return true;
    const roles = user.extra_roles ?? [];
    return roles.includes("grade_head") || roles.includes("dept_head");
  }, [user, isAdmin]);

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
  .in("role", ["teacher","homeroom_teacher","subject_teacher"])
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-lg animate-pulse">กำลังโหลด...</p>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-lg">กรุณาเข้าสู่ระบบ</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-600 via-pink-500 to-rose-400 px-5 py-4 flex items-center gap-3 shadow-lg shrink-0">
        <button onClick={() => router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold text-lg shrink-0">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight">🔄 แลกคาบ & สอนแทน</h1>
          <p className="text-pink-100 text-sm">{fullName(user)} · {academicYear?.year_name}</p>
        </div>
        <button onClick={() => setShowSwapModal(true)}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-bold rounded-xl border border-white/30">
          + ขอแลกคาบ
        </button>
      </div>

      {/* Incoming swap badge */}
      {incomingSwaps.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-3">
          <span className="text-amber-600 font-bold text-sm">⏳ มีคำขอแลกคาบรอการตอบรับ {incomingSwaps.length} รายการ</span>
          <button onClick={() => setTab("swap")} className="text-xs text-amber-700 underline font-bold">ดู</button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 flex overflow-x-auto shrink-0">
        {([
          ["swap",       "🔄 แลกคาบ"],
          ["substitute", "📋 สอนแทน"],
          ["stat",       "📊 สถิติ/ประวัติ"],
        ] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-3.5 text-sm font-bold border-b-2 whitespace-nowrap transition-all
              ${tab===k ? "border-pink-500 text-pink-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
            {l}
            {k==="swap" && incomingSwaps.length > 0 && (
              <span className="ml-1.5 bg-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{incomingSwaps.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Tab: แลกคาบ ── */}
        {tab === "swap" && (
          <div className="max-w-3xl mx-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">คำขอแลกคาบของฉัน</h2>
              <button onClick={() => setShowSwapModal(true)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold rounded-xl">
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
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">คำขอทั้งหมดของฉัน</h3>
              {mySwaps.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400">
                  <p className="text-4xl mb-2">🔄</p>
                  <p className="text-sm">ยังไม่มีคำขอแลกคาบ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mySwaps.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm">
                            {r.requester_id === user?.id
                              ? <span>ขอแลกกับ <span className="text-blue-600">{fullName(r.target_teacher)}</span></span>
                              : <span><span className="text-blue-600">{fullName(r.requester)}</span> ขอแลกกับคุณ</span>
                            }
                          </p>
                          <p className="text-xs text-slate-400">📅 {thaiDate(r.swap_date)}</p>
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
          <div className="max-w-4xl mx-auto p-5 space-y-5">
            {/* แอดมิน/หัวหน้าสายชั้น/หัวหน้าหมวด: จัดสอนแทนจากใบลา */}
            {canAssignSub && leaveRequests.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  📋 ครูที่ลา (รอจัดสอนแทน) — {leaveRequests.length} คน
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {leaveRequests.map(lr => {
                    const alreadyAssigned = subRecords.some(r => r.leave_request_id === lr.id);
                    return (
                      <div key={lr.id} className={`rounded-2xl border p-4 ${alreadyAssigned ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
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
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shrink-0">
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

            {/* Filter + Print */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-3 items-end justify-between">
                <div className="flex gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">วันที่</label>
                    <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
                      className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none" />
                  </div>
                  {canAssignSub && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">ครู</label>
                      <select value={filterTeacher} onChange={e=>setFilterTeacher(e.target.value)}
                        className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                        <option value="">ทั้งหมด</option>
                        {teachers.map(t=><option key={t.id} value={t.id}>{fullName(t)}</option>)}
                      </select>
                    </div>
                  )}
                  {(filterDate||filterTeacher) && (
                    <button onClick={()=>{setFilterDate("");setFilterTeacher("");}}
                      className="px-3 py-2 text-xs text-slate-400 hover:text-slate-600 underline self-end">ล้างตัวกรอง</button>
                  )}
                </div>
                {canAssignSub && filteredSubs.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={()=>printSubOrder(filteredSubs, filterDate?thaiDate(filterDate):"ทั้งหมด")}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                      🖨️ พิมพ์ใบคำสั่ง
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sub records table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm">รายการสอนแทน ({filteredSubs.length})</h3>
              </div>
              {filteredSubs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">ไม่มีข้อมูล</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{minWidth:820}}>
                    <thead>
                      <tr className="bg-gradient-to-r from-blue-800 to-blue-600 text-white text-xs">
                        {["วันที่","คาบ","ห้อง","วิชา","ครูเจ้าของคาบ","ครูสอนแทน","ชม.","ที่มา","สถานะ"].map(h=>(
                          <th key={h} className="px-3 py-3 text-left font-bold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubs.map((r,i)=>{
                        const src = sourceOf(r.note);
                        return (
                        <tr key={r.id} className={i%2===0?"bg-slate-50":"bg-white"}>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">{thaiDate(r.substitute_date)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs font-bold text-blue-700">{r.slot_label??"-"}</td>
                          <td className="px-3 py-2.5 text-xs">{r.room_name??"-"}</td>
                          <td className="px-3 py-2.5 text-xs">{r.subject_name??"-"}</td>
                          <td className="px-3 py-2.5 text-xs font-medium">{fullName(r.absent_teacher)}</td>
                          <td className="px-3 py-2.5 text-xs font-medium text-emerald-700">{fullName(r.substitute_teacher)}</td>
                          <td className="px-3 py-2.5 text-center text-xs font-bold">{r.hours_count}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border whitespace-nowrap ${SOURCE_LABEL[src].cls}`}>
                              {SOURCE_LABEL[src].label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${STATUS_SUB[r.status]?.cls}`}>
                              {STATUS_SUB[r.status]?.label??r.status}
                            </span>
                          </td>
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
          <div className="max-w-3xl mx-auto p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">📊 สถิติการสอนแทน</h2>
              {canAssignSub && (
                <button onClick={()=>printTeacherSubStat(subRecords, teachers)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl flex items-center gap-1.5">
                  🖨️ พิมพ์สถิติ (คิดขั้นเงินเดือน)
                </button>
              )}
            </div>

            {/* My stat card */}
            {!canAssignSub && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label:"ครั้งที่ขาด/ลา", value: subRecords.filter(r=>r.absent_teacher_id===user.id).length, color:"#dc2626", icon:"📋" },
                  { label:"ครั้งที่สอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id).length, color:"#16a34a", icon:"✅" },
                  { label:"ชั่วโมงสอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id).reduce((s,r)=>s+Number(r.hours_count),0), color:"#2563eb", icon:"⏰" },
                  { label:"คำขอแลกคาบ", value: mySwaps.length, color:"#7c3aed", icon:"🔄" },
                ].map(c=>(
                  <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
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
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="font-bold text-slate-700 text-sm">สรุปรายบุคคล</h3>
                </div>
                {statMap.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-slate-700 to-slate-600 text-white text-xs">
                          <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                          <th className="px-3 py-3 text-center">ครั้งที่ขาด</th>
                          <th className="px-3 py-3 text-center">ครั้งสอนแทน</th>
                          <th className="px-3 py-3 text-center">รวมชั่วโมง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statMap.map(([id,s],i)=>(
                          <tr key={id} className={i%2===0?"bg-slate-50":"bg-white"}>
                            <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                            <td className="px-3 py-3 text-center text-red-600 font-bold">{s.asAbsent}</td>
                            <td className="px-3 py-3 text-center text-emerald-600 font-bold">{s.asSub}</td>
                            <td className="px-3 py-3 text-center">
                              <span className="font-black text-blue-600 text-base">{s.hours}</span>
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
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-700 text-sm">🕘 ประวัติการแลกคาบ/สอนแทนล่าสุด</h3>
                <p className="text-xs text-slate-400 mt-0.5">รวมทั้งคำขอแลกคาบที่ตกลงแล้ว และรายการสอนแทนทุกที่มา (สูงสุด 40 รายการล่าสุด)</p>
              </div>
              {combinedHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีประวัติ</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
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
          onSave={async()=>{ setShowSwapModal(false); await loadData(); }}
          onClose={()=>setShowSwapModal(false)}
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
    </div>
  );
}