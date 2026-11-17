// lib/goout-core.ts
// ตรรกะกลางของระบบ "ขออนุญาตออกนอกบริเวณโรงเรียน" (ไม่เกิน 3 ชม.)
// ตารางสอน / การหาครูสอนแทน คัดลอกวิธีเดียวกับหน้าระบบลา เพื่อให้ผลตรงกัน

export type SB = any;

export const HR_EMAIL = "hr@khienkhet.ac.th";
export const ADMIN_EMAIL = "admin@khienkhet.ac.th";
export const APPROVER_2_EMAIL = "titima@khienkhet.ac.th";
export const APPROVER_3_EMAIL = "thananut@khienkhet.ac.th";
export const APPROVER_2_NAME = "นางสาวฐิติมา กาบแก้ว";
export const APPROVER_2_POSITION = "รองผู้อำนวยการกลุ่มบริหารงานบุคคล";
export const APPROVER_3_NAME = "นายธนณัฐ ศิระวงษ์";
export const APPROVER_3_POSITION = "ผู้อำนวยการโรงเรียนวัดเขียนเขต";
export const SYSTEM_URL = "https://system.khienkhet.ac.th/goout";

export const MAX_HOURS = 3;
export const MAX_MINUTES = MAX_HOURS * 60;
export const SUB_LOAD_WARN_AT = 5;

// ─── Types ────────────────────────────────────────────────
export type OutStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled";

export type UserProfile = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string; signature_url?: string;
  grade_level?: string; phone?: string; extra_roles?: string[];
};

export type OutDuty = {
  entry_id: string; time_slot_id: string; classroom_id: string; subject_id: string;
  academic_year_id: string | null;
  grade_group: string | null; room_name: string | null; slot_number: number | null;
  subject_name: string | null; start_time: string | null; end_time: string | null;
  hours_count: number;
  co_teacher_id: string | null; homeroom_teacher_id: string | null;
  task: string; substitute_teacher_id: string | null;
};

export type Interval = { teacherId: string; start: string; end: string; why: string };
export type SubMeta = { onLeave: Set<string>; busy: Interval[] };

// ─── Name / date / time helpers ───────────────────────────
export function fullName(u: any) {
  if (!u) return "";
  if (u.full_name) return u.full_name;
  return `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}
export function displayName(u: any) {
  if (!u) return "";
  return `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}
const TZ = { timeZone: "Asia/Bangkok" } as const;

export function bangkokToday(): string {
  return new Date().toLocaleDateString("en-CA", TZ); // YYYY-MM-DD
}
export function toThaiDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", ...TZ }) : "";
}
export function toThaiDateLong(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", ...TZ }) : "";
}
export function toThaiDateTime(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...TZ })
    : "";
}
/** เวลา HH:MM ตามเวลาไทย จาก ISO */
export function toClock(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...TZ }) : "";
}
export function clockToIso(date: string, hhmm: string) {
  return `${date}T${hhmm}:00+07:00`;
}
export function fiscalYearLabel(fy: number) { return `ปีงบประมาณ ${fy + 543}`; }
export function fiscalYearRange(fy: number) { return { start: `${fy - 1}-10-01`, end: `${fy}-09-30` }; }

export function toMin(t?: string | null): number {
  if (!t) return NaN;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
export function overlap(aS?: string | null, aE?: string | null, bS?: string | null, bE?: string | null) {
  const as = toMin(aS), ae = toMin(aE), bs = toMin(bS), be = toMin(bE);
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}
export function calcHours(start: string, end: string): number | null {
  const s = toMin(start), e = toMin(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  return Math.round(((e - s) / 60) * 100) / 100;
}
export function fmtHours(h: number) {
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100);
}
export function fmtMinutes(m: number) {
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h} ชม. ${mm} นาที` : `${mm} นาที`;
}
export function addMinutesToClock(hhmm: string, add: number) {
  const t = toMin(hhmm);
  if (Number.isNaN(t)) return "";
  const x = Math.min(t + add, 23 * 60 + 59);
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}
export function dowOf(dateStr: string): number {
  if (!dateStr) return -1;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return -1;
  return new Date(y, m - 1, d).getDay();
}
const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ─── ผู้อนุมัติ ───────────────────────────────────────────
/** หัวหน้าสายชั้นของผู้ขอ (ไม่นับตัวผู้ขอเอง) */
export function gradeHeadsOf(requester: { id: string; grade_level?: string | null } | null | undefined, teachers: UserProfile[]) {
  if (!requester?.grade_level) return [];
  return teachers.filter(
    t => (t.extra_roles ?? []).includes("grade_head") && t.grade_level === requester.grade_level && t.id !== requester.id
  );
}
/** ลำดับผู้อนุมัติของผู้ใช้ที่ล็อกอิน สำหรับคำขอหนึ่งๆ */
export function mySlotFor(user: UserProfile, req: any): 1 | 2 | 3 | null {
  const e = user.email?.toLowerCase().trim();
  if (e === APPROVER_2_EMAIL) return 2;
  if (e === APPROVER_3_EMAIL) return 3;
  if (
    (user.extra_roles ?? []).includes("grade_head") &&
    user.grade_level && user.grade_level === req.user?.grade_level && user.id !== req.user_id
  ) return 1;
  return null;
}
export function canActOn(req: any, slot: 1 | 2 | 3 | null): boolean {
  if (!slot || req.status !== "pending") return false;
  const my = req[`approver_${slot}_status`];
  if (my !== "pending") return false;
  return slot === 1 || (slot === 2 && req.approver_1_status === "approved") || (slot === 3 && req.approver_2_status === "approved");
}

// ═══════════════════════════════════════════════════════════
// ตารางสอน (ต้องตรงกับหน้า /schedule และหน้าระบบลา)
// ═══════════════════════════════════════════════════════════
const SCHEDULE_TEMPLATES = [
  { key: "kindergarten", slots: [
    { slot_number: 0, start_time: "08:00", end_time: "08:30", slot_label: "คาบ 0", is_break: false },
    { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
    { slot_number: 2, start_time: "09:30", end_time: "09:50", slot_label: "คาบ 2", is_break: false },
    { slot_number: 3, start_time: "09:50", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
    { slot_number: 4, start_time: "11:00", end_time: "11:40", slot_label: "คาบ 4", is_break: false },
    { slot_number: 0, start_time: "11:40", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
    { slot_number: 0, start_time: "12:30", end_time: "14:00", slot_label: "นอนกลางวัน", is_break: true },
    { slot_number: 5, start_time: "14:00", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
    { slot_number: 0, start_time: "14:30", end_time: "15:00", slot_label: "คาบ 6", is_break: false },
  ] },
  { key: "primary", slots: [
    { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
    { slot_number: 2, start_time: "09:30", end_time: "10:30", slot_label: "คาบ 2", is_break: false },
    { slot_number: 3, start_time: "10:30", end_time: "11:30", slot_label: "คาบ 3", is_break: false },
    { slot_number: 0, start_time: "11:30", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
    { slot_number: 4, start_time: "12:30", end_time: "13:30", slot_label: "คาบ 4", is_break: false },
    { slot_number: 5, start_time: "13:30", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
    { slot_number: 6, start_time: "14:30", end_time: "15:30", slot_label: "คาบ 6", is_break: false },
  ] },
  { key: "junior", slots: [
    { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
    { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
    { slot_number: 3, start_time: "10:10", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
    { slot_number: 0, start_time: "11:00", end_time: "12:00", slot_label: "พักกลางวัน", is_break: true },
    { slot_number: 4, start_time: "12:00", end_time: "12:50", slot_label: "คาบ 4", is_break: false },
    { slot_number: 5, start_time: "12:50", end_time: "13:40", slot_label: "คาบ 5", is_break: false },
    { slot_number: 0, start_time: "13:40", end_time: "13:50", slot_label: "พักย่อย", is_break: true },
    { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
    { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
  ] },
  { key: "senior", slots: [
    { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
    { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
    { slot_number: 0, start_time: "10:10", end_time: "10:20", slot_label: "พักย่อย", is_break: true },
    { slot_number: 3, start_time: "10:20", end_time: "11:10", slot_label: "คาบ 3", is_break: false },
    { slot_number: 4, start_time: "11:10", end_time: "12:00", slot_label: "คาบ 4", is_break: false },
    { slot_number: 0, start_time: "12:00", end_time: "13:00", slot_label: "พักกลางวัน", is_break: true },
    { slot_number: 5, start_time: "13:00", end_time: "13:50", slot_label: "คาบ 5", is_break: false },
    { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
    { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
  ] },
];

function buildRoomSlots(scheduleType: string | undefined, allDbSlots: any[]): any[] {
  const type = scheduleType ?? "primary";
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[1];
  return tmpl.slots.map((ts, idx) => {
    let db = allDbSlots.find(s => (s.start_time ?? "").slice(0, 5) === ts.start_time && s.schedule_type === type);
    if (!db) db = allDbSlots.find(s => (s.start_time ?? "").slice(0, 5) === ts.start_time);
    if (db) return { ...db, slot_label: ts.slot_label, is_break: ts.is_break, end_time: ts.end_time, slot_number: ts.slot_number };
    return { id: `tmpl-${type}-${idx}-${ts.start_time.replace(":", "")}`, ...ts, schedule_type: type };
  });
}

function enrichEntries(raw: any[], classrooms: Record<string, any>, subjects: Record<string, any>, allSlots: any[]) {
  const cache: Record<string, any[]> = {};
  const roomSlots = (t?: string) => (cache[t ?? "primary"] ??= buildRoomSlots(t ?? "primary", allSlots));
  return raw.map(e => {
    const room = classrooms[e.classroom_id];
    const slots = roomSlots(room?.schedule_type);
    let slot = slots.find((s: any) => s.id === e.time_slot_id);
    if (!slot) {
      const r = allSlots.find((s: any) => s.id === e.time_slot_id);
      const start = (r?.start_time ?? "").slice(0, 5);
      slot = (start && slots.find((s: any) => (s.start_time ?? "").slice(0, 5) === start)) || r || null;
    }
    const subject = subjects[e.subject_id];
    return {
      ...e,
      slot_number: slot?.slot_number ?? null, slot_label: slot?.slot_label ?? null,
      start_time: slot?.start_time ?? null, end_time: slot?.end_time ?? null, is_break: slot?.is_break ?? false,
      room_name: room?.room_name ?? null, grade_group: room?.grade_group ?? null,
      room_semester: room?._semester ?? 1, room_split: !!room?._split,
      homeroom_teacher_id: room?.homeroom_teacher_id ?? null,
      subject_name: subject?.name_th ?? null,
    };
  });
}

async function fetchAllRows(build: () => any): Promise<any[]> {
  const size = 1000; let from = 0; let all: any[] = [];
  while (true) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

export async function loadTimetableBundle(sb: SB): Promise<{ entries: any[]; academicYearId: string | null }> {
  const { data: yearsAll } = await sb.from("academic_years").select("id,year_name,semester,is_current");
  const years = (yearsAll || []) as any[];
  const cur = years.find(y => y.is_current) ?? null;
  const yearIds = cur ? years.filter(y => y.year_name === cur.year_name).map(y => y.id) : [];
  const yearMap = Object.fromEntries(years.map(y => [y.id, y]));

  const [raw, slotsRes, roomsRes, subjRes] = await Promise.all([
    fetchAllRows(() => {
      let q = sb.from("timetable_entries")
        .select("id,academic_year_id,classroom_id,subject_id,teacher_id,day_of_week,time_slot_id,teacher_id_2,created_at")
        .order("id");
      if (yearIds.length) q = q.in("academic_year_id", yearIds);
      return q;
    }),
    sb.from("time_slots").select("id,slot_number,start_time,end_time,slot_label,is_break,schedule_type").order("slot_number", { ascending: true }),
    sb.from("classrooms").select("id,room_number,room_name,grade_group,schedule_type,homeroom_teacher_id,academic_year_id,split_by_semester"),
    sb.from("subjects").select("id,subject_code,name_th"),
  ]);
  const slots = slotsRes.data || [];
  const rooms = (roomsRes.data || []) as any[];
  const classrooms = Object.fromEntries(rooms.map(c => {
    const sem = yearMap[c.academic_year_id]?.semester ?? 1;
    const hasSibling = rooms.some(o =>
      o.id !== c.id && o.grade_group === c.grade_group &&
      (o.room_name ?? "").trim() === (c.room_name ?? "").trim() &&
      (yearMap[o.academic_year_id]?.semester ?? 1) !== sem &&
      yearMap[o.academic_year_id]?.year_name === yearMap[c.academic_year_id]?.year_name
    );
    return [c.id, { ...c, _semester: sem, _split: !!c.split_by_semester || hasSibling }];
  }));
  const subjects = Object.fromEntries((subjRes.data || []).map((s: any) => [s.id, s]));
  return { entries: enrichEntries(raw, classrooms, subjects, slots), academicYearId: cur?.id ?? null };
}

// เทอม 2 = 15 ต.ค. – มี.ค.
function semesterForDate(dateStr: string): 1 | 2 {
  if (!dateStr) return 1;
  const [, m, d] = dateStr.split("-").map(Number);
  return m >= 11 || m <= 3 || (m === 10 && d >= 15) ? 2 : 1;
}
export function filterEntriesForDate(entries: any[], dateStr: string) {
  const sem = semesterForDate(dateStr);
  return entries.filter(e => !e.room_split || e.room_semester === sem);
}
function slotHours(e: any): number {
  const d = toMin(e.end_time) - toMin(e.start_time);
  return d > 0 ? Math.round((d / 60) * 100) / 100 : 1;
}

// ═══════════════════════════════════════════════════════════
// คาบสอนที่ทับกับช่วงเวลาที่ขอออก + ภาระงาน
// ═══════════════════════════════════════════════════════════
export function findAffectedEntries(entries: any[], userId: string, date: string, start: string, end: string) {
  const dow = dowOf(date);
  return filterEntriesForDate(entries, date)
    .filter(e => e.day_of_week === dow && !e.is_break && (e.teacher_id === userId || e.teacher_id_2 === userId)
      && overlap(start, end, e.start_time, e.end_time))
    .sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
}

/** สร้างรายการภาระงานจากคาบที่ทับ โดยคงงาน/ครูที่เลือกไว้เดิม (จับคู่ด้วย entry_id) */
export function buildDuties(affected: any[], requesterId: string, existing: OutDuty[]): OutDuty[] {
  const old = new Map(existing.map(d => [d.entry_id, d]));
  return affected.map(e => {
    const o = old.get(e.id);
    return {
      entry_id: e.id, time_slot_id: e.time_slot_id, classroom_id: e.classroom_id, subject_id: e.subject_id,
      academic_year_id: e.academic_year_id ?? null,
      grade_group: e.grade_group ?? null, room_name: e.room_name ?? null, slot_number: e.slot_number ?? null,
      subject_name: e.subject_name ?? null, start_time: e.start_time ?? null, end_time: e.end_time ?? null,
      hours_count: slotHours(e),
      co_teacher_id: (e.teacher_id !== requesterId ? e.teacher_id : e.teacher_id_2) || null,
      homeroom_teacher_id: e.homeroom_teacher_id ?? null,
      task: o?.task ?? "", substitute_teacher_id: o?.substitute_teacher_id ?? null,
    };
  });
}

/** มีครูคู่สอนอยู่แล้ว (และไม่ได้ลา/ออกนอก/ติดสอนแทน) → ไม่ต้องจัดครูสอนแทน */
export function isCovered(d: OutDuty, meta?: SubMeta | null): boolean {
  if (!d.co_teacher_id) return false;
  if (!meta) return true;
  if (meta.onLeave.has(d.co_teacher_id)) return false;
  return !meta.busy.some(i => i.teacherId === d.co_teacher_id && overlap(d.start_time, d.end_time, i.start, i.end));
}
export function normalizeDuties(duties: OutDuty[], meta?: SubMeta | null): OutDuty[] {
  return duties.map(d => (isCovered(d, meta) ? { ...d, substitute_teacher_id: null } : d));
}

// ── ข้อมูลความว่างของครู ณ วันนั้น ──
export async function loadSubMeta(sb: SB, date: string, excludeOutId: string | null, entries: any[]): Promise<SubMeta> {
  const [leaves, outs, subs] = await Promise.all([
    sb.from("leave_requests").select("user_id,start_date,end_date,status")
      .in("status", ["pending", "approved"]).lte("start_date", date).gte("end_date", date),
    sb.from("out_requests").select("id,user_id,planned_start,planned_end,status")
      .eq("request_date", date).in("status", ["pending", "approved"]),
    sb.from("substitution_records").select("substitute_teacher_id,timetable_entry_id,out_request_id,status")
      .eq("substitute_date", date).neq("status", "cancelled"),
  ]);
  const onLeave = new Set<string>((leaves.data || []).map((l: any) => l.user_id));
  const busy: Interval[] = [];
  (outs.data || []).forEach((o: any) => {
    if (o.id === excludeOutId) return;
    busy.push({ teacherId: o.user_id, start: o.planned_start.slice(0, 5), end: o.planned_end.slice(0, 5), why: "ขอออกนอกโรงเรียนช่วงเวลานี้" });
  });
  const byId = new Map(entries.map(e => [e.id, e]));
  (subs.data || []).forEach((r: any) => {
    if (!r.substitute_teacher_id || (excludeOutId && r.out_request_id === excludeOutId)) return;
    const e = byId.get(r.timetable_entry_id);
    if (e?.start_time) busy.push({ teacherId: r.substitute_teacher_id, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5), why: "ถูกจัดสอนแทนในเวลาเดียวกันแล้ว" });
  });
  return { onLeave, busy };
}

// ── การจัดอันดับครูสอนแทน ──
const GRADE_LABEL: Record<string, string> = {
  k2: "อ.2", k3: "อ.3", p1: "ป.1", p2: "ป.2", p3: "ป.3", p4: "ป.4", p5: "ป.5", p6: "ป.6",
  m1: "ม.1", m2: "ม.2", m3: "ม.3", m4: "ม.4", m5: "ม.5", m6: "ม.6",
};
function roomGradeCode(gradeGroup?: string | null): string | null {
  const g = (gradeGroup ?? "").split("/")[0].trim();
  if (!g) return null;
  return Object.entries(GRADE_LABEL).find(([, label]) => label === g)?.[0] ?? null;
}
export function isSelectableTeacher(t: UserProfile): boolean {
  const role = (t.role || "").toLowerCase();
  return !(role === "staff" || role === "director" || role === "deputy_director" || role.includes("admin"));
}
/** 0 ครูประจำชั้น · 1 สายชั้นเดียวกับห้อง · 2 สอนวิชาเดียวกัน · 3 สายชั้นเดียวกับผู้ขอ · 4 อื่นๆ */
function priorityOf(c: UserProfile, d: OutDuty, requester: UserProfile, entries: any[]): number {
  if (d.homeroom_teacher_id && c.id === d.homeroom_teacher_id) return 0;
  const rg = roomGradeCode(d.grade_group);
  if (rg && c.grade_level === rg) return 1;
  if (entries.some(e => (e.teacher_id === c.id || e.teacher_id_2 === c.id) && e.subject_id === d.subject_id)) return 2;
  if (requester.grade_level && c.grade_level === requester.grade_level) return 3;
  return 4;
}

export type Candidate = { teacher: UserProfile; load: number; priority: number };

export function candidatesForDuty(
  duty: OutDuty,
  ctx: { date: string; entries: any[]; teachers: UserProfile[]; requester: UserProfile; meta: SubMeta },
  picks: OutDuty[]
): Candidate[] {
  const dow = dowOf(ctx.date);
  const dayEntries = filterEntriesForDate(ctx.entries, ctx.date);
  const out: Candidate[] = [];
  for (const t of ctx.teachers) {
    if (t.id === ctx.requester.id || !isSelectableTeacher(t) || ctx.meta.onLeave.has(t.id)) continue;
    const teachingNow = dayEntries.some(e => e.day_of_week === dow && (e.teacher_id === t.id || e.teacher_id_2 === t.id)
      && overlap(duty.start_time, duty.end_time, e.start_time, e.end_time));
    if (teachingNow) continue;
    if (ctx.meta.busy.some(i => i.teacherId === t.id && overlap(duty.start_time, duty.end_time, i.start, i.end))) continue;
    if (picks.some(p => p.entry_id !== duty.entry_id && p.substitute_teacher_id === t.id && overlap(duty.start_time, duty.end_time, p.start_time, p.end_time))) continue;
    const taught = dayEntries.filter(e => e.day_of_week === dow && !e.is_break && (e.teacher_id === t.id || e.teacher_id_2 === t.id)).length;
    const subs = ctx.meta.busy.filter(i => i.teacherId === t.id).length;
    const formPicks = picks.filter(p => p.substitute_teacher_id === t.id).length;
    out.push({ teacher: t, load: taught + subs + formPicks, priority: priorityOf(t, duty, ctx.requester, ctx.entries) });
  }
  return out.sort((a, b) => a.priority - b.priority || a.load - b.load || displayName(a.teacher).localeCompare(displayName(b.teacher), "th"));
}

/** กลุ่ม priority ดีที่สุด → ภาระน้อยสุด → สุ่มถ้าเท่ากัน */
export function pickCandidate(pool: Candidate[]): Candidate | null {
  if (!pool.length) return null;
  const best = Math.min(...pool.map(c => c.priority));
  const top = pool.filter(c => c.priority === best);
  const min = Math.min(...top.map(c => c.load));
  const group = top.filter(c => c.load === min);
  return group[Math.floor(Math.random() * group.length)];
}

export function autoAssign(
  duties: OutDuty[],
  ctx: { date: string; entries: any[]; teachers: UserProfile[]; requester: UserProfile; meta: SubMeta },
  rerollAll = false
): OutDuty[] {
  const work = duties.map(d => (rerollAll && !isCovered(d, ctx.meta) ? { ...d, substitute_teacher_id: null } : d));
  for (let i = 0; i < work.length; i++) {
    const d = work[i];
    if (isCovered(d, ctx.meta) || d.substitute_teacher_id) continue;
    const pick = pickCandidate(candidatesForDuty(d, ctx, work));
    if (pick) work[i] = { ...d, substitute_teacher_id: pick.teacher.id };
  }
  return work;
}

/** เขียน substitution_records ใหม่ทั้งชุดของคำขอนี้ */
export async function syncSubstitutions(
  sb: SB, outId: string, requesterId: string, date: string, duties: OutDuty[],
  assignedBy: string, fallbackYearId: string | null, assignedByHead = false
) {
  await sb.from("substitution_records").delete().eq("out_request_id", outId);
  const rows = duties.filter(d => d.substitute_teacher_id).map(d => ({
    timetable_entry_id: d.entry_id, substitute_date: date,
    original_teacher_id: requesterId, absent_teacher_id: requesterId,
    substitute_teacher_id: d.substitute_teacher_id,
    out_request_id: outId, leave_request_id: null,
    time_slot_id: d.time_slot_id, classroom_id: d.classroom_id, subject_id: d.subject_id,
    hours_count: d.hours_count, academic_year_id: d.academic_year_id ?? fallbackYearId,
    assigned_by: assignedBy, status: "assigned",
    note: assignedByHead ? "หัวหน้าสายชั้นจัดจากคำขอออกนอกโรงเรียน" : "จัดจากคำขอออกนอกโรงเรียน",
  }));
  if (!rows.length) return;
  const { error } = await sb.from("substitution_records").insert(rows);
  if (error) throw error;
}

export function dutyRows(duties: OutDuty[], teachers: UserProfile[], meta?: SubMeta | null) {
  const byId = Object.fromEntries(teachers.map(t => [t.id, t]));
  return duties.map(d => {
    const covered = isCovered(d, meta);
    const sub = covered ? `${displayName(byId[d.co_teacher_id!])} (ครูคู่สอน)` : d.substitute_teacher_id ? displayName(byId[d.substitute_teacher_id]) : "";
    return {
      cls: `${d.grade_group ?? ""} ${d.room_name ?? ""}`.trim(),
      period: d.slot_number != null ? String(d.slot_number) : (d.start_time ?? "").slice(0, 5),
      task: covered ? "-" : d.task, subName: sub,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// แจ้งเตือน (อีเมล + Teams push ผ่าน /api/goout-notify)
// ═══════════════════════════════════════════════════════════
export async function sendMail(to: string[], subject: string, html: string) {
  const list = Array.from(new Set(to.filter(Boolean)));
  if (!list.length) return;
  try {
    await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: list, subject, html }) });
  } catch (e) { console.warn("[goout sendMail]", e); }
}

export async function pushOutTeams(sb: SB, outId: string, event: "submitted" | "edited" | "approved" | "rejected" | "substituted" | "cancelled", extra?: any) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch("/api/goout-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ outId, event, ...extra }),
    });
  } catch (e) { console.warn("[pushOutTeams]", e); }
}

function mailHtml(c1: string, c2: string, title: string, rows: [string, string][], note?: string) {
  const tr = rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;width:110px;vertical-align:top">${esc(k)}</td><td style="font-weight:700">${esc(v)}</td></tr>`).join("");
  return `<div style="font-family:Sarabun,Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:linear-gradient(135deg,${c1},${c2});padding:24px;border-radius:12px 12px 0 0;color:white"><h2 style="margin:0">${title}</h2></div>
<div style="padding:24px;background:white;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
<table style="width:100%;border-collapse:collapse;font-size:14px">${tr}</table>
${note ? `<p style="margin-top:14px;font-size:13px;color:#334155">${esc(note)}</p>` : ""}
<p style="margin-top:16px;font-size:13px"><a href="${SYSTEM_URL}" style="color:#0d9488;font-weight:700">เปิดระบบขออนุญาตออกนอกโรงเรียน</a></p>
</div></div>`;
}
function summaryRows(r: any, requesterName: string): [string, string][] {
  return [
    ["ผู้ขอ", requesterName],
    ["วันที่", toThaiDateLong(r.request_date)],
    ["เวลา", `${String(r.planned_start).slice(0, 5)} – ${String(r.planned_end).slice(0, 5)} น. (${fmtHours(Number(r.planned_hours))} ชม.)`],
    ["สถานที่", r.destination],
    ["เพื่อ", r.purpose],
  ];
}
const emailsOf = (list: (UserProfile | undefined | null)[]) => list.map(t => t?.email).filter(Boolean) as string[];

/** ยื่นคำขอ → แจ้งหัวหน้าสายชั้น + รองฝ่ายบุคคล */
export async function notifySubmitted(r: any, requester: UserProfile, teachers: UserProfile[], edited = false) {
  const heads = gradeHeadsOf(requester, teachers);
  const to = [...emailsOf(heads), APPROVER_2_EMAIL];
  const unassigned = (r.duties as OutDuty[] | undefined)?.filter(d => !d.substitute_teacher_id && !d.co_teacher_id).length ?? 0;
  await sendMail(
    to, `[${edited ? "แก้ไข" : "ขอ"}ออกนอกโรงเรียน] ${fullName(requester)} · ${toThaiDate(r.request_date)}`,
    mailHtml("#14b8a6", "#0891b2", `🚪 ${edited ? "มีการแก้ไขคำขอ" : "มีคำขอออกนอกบริเวณโรงเรียน"}`,
      summaryRows(r, fullName(requester)),
      unassigned > 0 ? `มี ${unassigned} คาบที่ยังไม่ได้จัดครูสอนแทน — หัวหน้าสายชั้นกรุณาจัดให้ในระบบ` : undefined)
  );
}
/** รองฝ่ายบุคคลอนุมัติ (ครบทุกขั้น) → แจ้งผู้ขอ + หัวหน้าสายชั้น */
export async function notifyApproved(r: any, requester: UserProfile, teachers: UserProfile[]) {
  const to = [requester.email, ...emailsOf(gradeHeadsOf(requester, teachers))];
  await sendMail(to, `[อนุญาตแล้ว] ออกนอกโรงเรียน ${fullName(requester)} · ${toThaiDate(r.request_date)}`,
    mailHtml("#10b981", "#059669", "✅ อนุญาตให้ออกนอกบริเวณโรงเรียนแล้ว", summaryRows(r, fullName(requester)),
      "ผู้ขอกรุณากดบันทึกเวลา \"ออกจากโรงเรียน\" และ \"กลับถึงโรงเรียน\" ในระบบทุกครั้ง"));
}
export async function notifyRejected(r: any, requester: UserProfile, teachers: UserProfile[], reason: string) {
  const to = [requester.email, ...emailsOf(gradeHeadsOf(requester, teachers))];
  await sendMail(to, `[ไม่อนุญาต] ออกนอกโรงเรียน ${fullName(requester)} · ${toThaiDate(r.request_date)}`,
    mailHtml("#ef4444", "#dc2626", "❌ ไม่อนุญาตให้ออกนอกบริเวณโรงเรียน", [...summaryRows(r, fullName(requester)), ["เหตุผล", reason || "-"]]));
}
export async function notifyCancelled(r: any, requester: UserProfile, teachers: UserProfile[]) {
  const subs = ((r.duties as OutDuty[]) ?? []).map(d => teachers.find(t => t.id === d.substitute_teacher_id));
  await sendMail([...emailsOf(gradeHeadsOf(requester, teachers)), ...emailsOf(subs), APPROVER_2_EMAIL],
    `[ยกเลิก] ออกนอกโรงเรียน ${fullName(requester)} · ${toThaiDate(r.request_date)}`,
    mailHtml("#64748b", "#475569", "🚫 ยกเลิกคำขอออกนอกบริเวณโรงเรียน", summaryRows(r, fullName(requester)), "รายการสอนแทนที่ผูกกับคำขอนี้ถูกยกเลิกแล้ว"));
}
/** แจ้งครูที่ถูกจัดสอนแทน (ส่งเฉพาะคนใหม่) */
export async function notifySubstitutes(r: any, requester: UserProfile, duties: OutDuty[], teachers: UserProfile[], previous?: OutDuty[]) {
  // previous = รายการเดิมก่อนแก้ — ครูที่ได้คาบเดิมอยู่แล้วจะไม่ถูกแจ้งซ้ำ
  const prev = new Set((previous ?? []).map(d => `${d.entry_id}|${d.substitute_teacher_id}`));
  const by = new Map<string, OutDuty[]>();
  duties.forEach(d => {
    if (!d.substitute_teacher_id) return;
    if (prev.has(`${d.entry_id}|${d.substitute_teacher_id}`)) return;
    by.set(d.substitute_teacher_id, [...(by.get(d.substitute_teacher_id) ?? []), d]);
  });
  for (const [id, list] of Array.from(by.entries())) {
    const t = teachers.find(x => x.id === id);
    if (!t?.email) continue;
    const periods = list.map(d => `คาบ ${d.slot_number ?? "-"} ${(d.start_time ?? "").slice(0, 5)}–${(d.end_time ?? "").slice(0, 5)} ${d.grade_group ?? ""} ${d.room_name ?? ""} ${d.subject_name ?? ""}`.trim()).join(" | ");
    await sendMail([t.email], `[ขอให้สอนแทน] ${fullName(requester)} · ${toThaiDate(r.request_date)}`,
      mailHtml("#6366f1", "#4f46e5", "🔄 คำขอสอนแทน (ออกนอกโรงเรียน)", [
        ["ผู้ขอ", fullName(requester)], ["วันที่", toThaiDateLong(r.request_date)], ["คาบที่สอนแทน", periods],
      ]));
  }
}

// ═══════════════════════════════════════════════════════════
// ฟอร์มพิมพ์ (ตามต้นฉบับ formgoout.docx)
// ═══════════════════════════════════════════════════════════
export type OpinionData = { status?: string | null; name?: string; position?: string; signature?: string | null; at?: string | null; note?: string | null };
export type FormData = {
  fullName: string; position: string; createdAt?: string;
  purpose: string; destination: string; start: string; end: string; hours: number;
  rows: { cls: string; period: string; task: string; subName: string }[];
  requesterSig?: string;
  op1?: OpinionData; op2?: OpinionData;
  actualOut?: string | null; actualBack?: string | null; actualMinutes?: number | null;
};

export function buildGooutHTML(d: FormData): string {
  const doc = d.createdAt ? new Date(d.createdAt) : new Date();
  const day = doc.toLocaleDateString("th-TH", { day: "numeric", ...TZ });
  const month = doc.toLocaleDateString("th-TH", { month: "long", ...TZ });
  const year = doc.getFullYear() + 543;
  const dl = (v: string, w = 80, center = false) =>
    `<span class="dl" style="min-width:${w}px;${center ? "text-align:center;" : ""}">&nbsp;${esc(v)}&nbsp;</span>`;

  const hasDuty = d.rows.length > 0;
  const dutyHtml = hasDuty
    ? d.rows.map((r, i) => `
      <div class="duty">
        <div>${i + 1}. ชั้น ${dl(r.cls, 90, true)} คาบที่ ${dl(r.period, 50, true)} งานที่มอบหมาย ${dl(r.task, 300)}</div>
        <div style="padding-left:18px;margin-top:4px">ผู้สอนแทน ${dl(r.subName, 260)} ลงชื่อผู้สอนแทน ${dl("", 150)}</div>
      </div>`).join("")
    : "";

  const box = (title: string, o?: OpinionData, defaultName = "", defaultPos = "") => {
    const ok = o?.status === "approved", no = o?.status === "rejected";
    const sig = ok && o?.signature ? `<img src="${o.signature}" style="max-height:40px;max-width:150px;object-fit:contain"/>` : "";
    return `<div class="box">
      <div class="bt">${title}</div>
      <div style="margin-bottom:6px">เห็นควร &nbsp;<span class="chk">${ok ? "✓" : ""}</span> อนุญาต &nbsp;&nbsp;<span class="chk">${no ? "✓" : ""}</span> ไม่อนุญาต</div>
      <div style="margin-bottom:4px">เนื่องจาก ${dl(no ? (o?.note ?? "") : (ok ? (o?.note ?? "") : ""), 170)}</div>
      <div class="sg">${sig}</div>
      <div style="text-align:center;line-height:1.55">
        ลงชื่อ ${dl("", 20)}<br>(${esc(o?.name || defaultName)})<br>${esc(o?.position || defaultPos)}<br>
        วันที่ ${o?.at ? esc(toThaiDateLong(o.at)) : "........................"}
      </div></div>`;
  };

  const actual = d.actualOut || d.actualBack ? `
    <div class="actual">บันทึกเวลาจริง: ออกจากโรงเรียนเวลา ${dl(d.actualOut ? toClock(d.actualOut) : "", 50, true)} น.
      กลับถึงโรงเรียนเวลา ${dl(d.actualBack ? toClock(d.actualBack) : "", 50, true)} น.
      รวม ${dl(d.actualMinutes != null ? fmtMinutes(d.actualMinutes) : "", 90, true)}</div>` : "";

  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:210mm;font-family:'Sarabun',Arial,sans-serif;font-size:12.5pt;color:#000;background:#fff}
.page{padding:14mm 18mm 10mm;line-height:1.75}
.dl{display:inline-block;border-bottom:1px dotted #444;font-weight:500}
.chk{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.5px solid #000;margin-right:3px;font-size:10pt;vertical-align:middle}
.t1{text-align:center;font-weight:900;font-size:14.5pt}.t2{text-align:center;font-weight:700;font-size:13pt;margin-bottom:10px}
.box{border:1px solid #666;border-radius:4px;padding:8px 12px;flex:1;font-size:11.5pt}
.bt{font-weight:700;text-align:center;margin-bottom:6px}
.sg{height:42px;display:flex;align-items:flex-end;justify-content:center;margin-top:4px}
.duty{margin:6px 0 8px 22px}
.actual{margin-top:12px;padding:6px 10px;border:1px dashed #888;border-radius:4px;font-size:11pt}
@page{size:A4;margin:0}
</style></head><body><div class="page">
<div class="t1">แบบขออนุญาตออกนอกบริเวณโรงเรียนในเวลาราชการของครูและบุคลากร</div>
<div class="t2">กรณีไม่เกิน 3 ชั่วโมง</div>
<div style="text-align:right">เขียนที่ โรงเรียนวัดเขียนเขต<br>วันที่ ${dl(day, 36, true)} เดือน ${dl(month, 100, true)} พ.ศ. ${dl(String(year), 56, true)}</div>
<div style="margin-top:8px"><b>เรื่อง</b> ขออนุญาตออกนอกบริเวณโรงเรียน</div>
<div><b>เรียน</b> ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
<div style="margin-top:8px;padding-left:40px">ข้าพเจ้า ${dl(d.fullName, 230)} ตำแหน่ง ${dl(d.position, 180)}</div>
<div>ขออนุญาตออกนอกบริเวณโรงเรียน เพื่อ ${dl(d.purpose, 400)}</div>
<div>ระหว่างเวลา ${dl(d.start, 56, true)} น. ถึง เวลา ${dl(d.end, 56, true)} น. รวม ${dl(fmtHours(d.hours), 50, true)} ชั่วโมง สถานที่ไป ${dl(d.destination, 220)}</div>
<div style="margin-top:6px"><b>ภาระงาน</b> &nbsp;&nbsp;<span class="chk">${hasDuty ? "✓" : ""}</span> มี &nbsp;&nbsp;&nbsp;<span class="chk">${hasDuty ? "" : "✓"}</span> ไม่มี</div>
${dutyHtml}
<div style="text-align:right;padding-right:6%;margin-top:14px">
  <div style="display:inline-flex;flex-direction:column;align-items:center;width:260px">
    <div style="height:46px;display:flex;align-items:flex-end;justify-content:center">${d.requesterSig ? `<img src="${d.requesterSig}" style="max-height:46px;max-width:170px;object-fit:contain"/>` : ""}</div>
    <div>ลงชื่อ ${dl("", 90)} ผู้ขออนุญาต</div>
    <div>(${esc(d.fullName)})</div>
  </div>
</div>
<div style="font-size:11pt;margin:6px 0 10px"><b>หมายเหตุ</b> ให้ผู้บริหารฯ อนุญาตก่อนออกนอกบริเวณโรงเรียน</div>
<div style="display:flex;gap:14px">
  ${box("ความเห็นของหัวหน้าสายชั้น", d.op1, "", "หัวหน้าสายชั้น")}
  ${box("ความเห็นของรองผู้อำนวยการกลุ่มบริหารงานบุคคล", d.op2, APPROVER_2_NAME, APPROVER_2_POSITION)}
</div>
${actual}
</div></body></html>`;
}