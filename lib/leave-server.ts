import { createClient } from "@supabase/supabase-js";
import { getCurrentFiscalYear, isInFiscalYear, LEAVE_TYPE_CONFIG } from "@/lib/leave-config";

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://system.khienkhet.ac.th";
// ลิงก์ที่ หน.สายใช้จัดครูสอนแทน — ปรับเป็นหน้าจริงของคุณ
const SUBSTITUTE_URL = `${SITE}/leave`;

export const APPROVER_EMAILS: Record<1 | 2 | 3, string> = {
  1: "phansa@khienkhet.ac.th",
  2: "titima@khienkhet.ac.th",
  3: "thananut@khienkhet.ac.th",
};
const GRADE_LABEL: Record<string, string> = {
  k2:"อ.2",k3:"อ.3",p1:"ป.1",p2:"ป.2",p3:"ป.3",p4:"ป.4",p5:"ป.5",p6:"ป.6",
  m1:"ม.1",m2:"ม.2",m3:"ม.3",m4:"ม.4",m5:"ม.5",m6:"ม.6",
};
export const THAI_TO_CODE: Record<string, string> =
  Object.fromEntries(Object.entries(GRADE_LABEL).map(([k, v]) => [v, k]));

export type LeaveEvent = "submitted" | "edited" | "cancelled" | "approved" | "rejected" | "substituted" | "acknowledged";

const APPROVER_NAMES: Record<1 | 2 | 3, string> = {
  1: "นางสาวพรรษา แก้วใหญ่", 2: "นางสาวฐิติมา กาบแก้ว", 3: "นายธนณัฐ ศิระวงษ์",
};
type Role = "approver1" | "approver2" | "director" | "requester" | "head" | "substitute";
type Send = { to: string; role: Role; card: any };
type Stored = { email: string; role: Role; message_id: string };
const approverRole = (slot: 1 | 2 | 3): Role => (slot === 3 ? "director" : slot === 1 ? "approver1" : "approver2");
const rejectedSlot = (req: any): 1 | 2 | 3 | null =>
  ([1, 2, 3] as const).find(s => req[`approver_${s}_status`] === "rejected") ?? null;

// ───────────── helpers ─────────────
export const nm = (u: any) =>
  u ? `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim() : "-";
export const thDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function eachDate(s: string, e: string) {
  const out: string[] = [];
  const c = new Date(s + "T00:00:00Z"), l = new Date(e + "T00:00:00Z");
  while (c <= l) { out.push(c.toISOString().slice(0, 10)); c.setUTCDate(c.getUTCDate() + 1); }
  return out;
}
const dowOf = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
// เทอม 2 = 15 ต.ค. – มี.ค. (เหมือนฝั่ง client)
function semesterForDate(d: string): 1 | 2 {
  const [, m, day] = d.split("-").map(Number);
  return m >= 11 || m <= 3 || (m === 10 && day >= 15) ? 2 : 1;
}
const icon = (s?: string | null) => (s === "approved" ? "✅" : s === "rejected" ? "❌" : "⏳");

// ───────────── สถิติการลา ─────────────
async function stats(userId: string, excludeId: string, beforeDate: string) {
  const fy = getCurrentFiscalYear();
  const { data } = await admin.from("leave_requests")
    .select("id,leave_type,days_count,start_date,status").eq("user_id", userId).in("status", ["pending", "approved"]);
  const f = (data ?? []).filter(r => r.id !== excludeId && isInFiscalYear(r.start_date, fy) && r.start_date < beforeDate);
  const sum = (types: string[]) => f.filter(r => types.includes(r.leave_type)).reduce((s, r) => s + Number(r.days_count), 0);
  return { sick: sum(["sick"]), personal: sum(["personal", "other", "ordination"]), maternity: sum(["maternity"]) };
}

// ───────────── คาบสอนของผู้ลาในช่วงวันที่ลา + สถานะการสอนแทนแต่ละคาบ ─────────────
type Period = {
  date: string; time: string; subject: string; room: string;
  gradeCode: string | null; covered: boolean; subName: string | null;
  subId: string | null; acked: boolean; end: string;     // ★ เพิ่ม
};

async function loadPeriods(req: any): Promise<Period[]> {
  const dates = eachDate(req.start_date, req.end_date);
  const dows = new Set(dates.map(dowOf));

  const { data: years } = await admin.from("academic_years").select("id,year_name,semester,is_current");
  const cur = (years ?? []).find((y: any) => y.is_current);
  if (!cur) return [];
  const yearById: Record<string, any> = Object.fromEntries((years ?? []).map((y: any) => [y.id, y]));
  const yearIds = (years ?? []).filter((y: any) => y.year_name === cur.year_name).map((y: any) => y.id);

  const { data: ents } = await admin.from("timetable_entries")
    .select("id,classroom_id,subject_id,teacher_id,teacher_id_2,day_of_week,time_slot_id")
    .in("academic_year_id", yearIds)
    .or(`teacher_id.eq.${req.user_id},teacher_id_2.eq.${req.user_id}`);
  const mine = (ents ?? []).filter((e: any) => dows.has(e.day_of_week));
  if (mine.length === 0) return [];

  const coIdOf = (e: any): string | null =>
    e.teacher_id && e.teacher_id !== req.user_id ? e.teacher_id
    : e.teacher_id_2 && e.teacher_id_2 !== req.user_id ? e.teacher_id_2 : null;
  const coIds = [...new Set(mine.map(coIdOf).filter(Boolean))] as string[];

  const realSlotIds = [...new Set(mine.map((e: any) => e.time_slot_id).filter((id: any) => id && !String(id).startsWith("tmpl-")))];
  const [roomsRes, subjRes, slotsRes, subsRes, coLeaveRes] = await Promise.all([
    admin.from("classrooms").select("id,room_name,grade_group,academic_year_id,split_by_semester").in("academic_year_id", yearIds),
    admin.from("subjects").select("id,name_th").in("id", [...new Set(mine.map((e: any) => e.subject_id))]),
    admin.from("time_slots").select("id,start_time,end_time,is_break").in("id", realSlotIds),
    admin.from("substitution_records").select("timetable_entry_id,substitute_date,substitute_teacher_id,acknowledged_at")
        .eq("leave_request_id", req.id).neq("status", "cancelled"),
    coIds.length
      ? admin.from("leave_requests").select("user_id,start_date,end_date").in("user_id", coIds)
          .in("status", ["pending", "approved"]).lte("start_date", req.end_date).gte("end_date", req.start_date)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const rooms: any[] = roomsRes.data ?? [];
  const roomById: Record<string, any> = Object.fromEntries(rooms.map(r => [r.id, r]));
  const subjById: Record<string, any> = Object.fromEntries((subjRes.data ?? []).map((s: any) => [s.id, s]));
  const slotById: Record<string, any> = Object.fromEntries((slotsRes.data ?? []).map((s: any) => [s.id, s]));
  const coLeaves: any[] = (coLeaveRes as any).data ?? [];

  const subMap = new Map<string, string>();
const ackMap = new Map<string, boolean>();
(subsRes.data ?? []).forEach((r: any) => {
  const k = `${r.timetable_entry_id}|${r.substitute_date}`;
  subMap.set(k, r.substitute_teacher_id);
  ackMap.set(k, !!r.acknowledged_at);
});
  const subIds = [...new Set([...subMap.values()])];
  const { data: subUsers } = subIds.length
    ? await admin.from("users").select("id,title,first_name,last_name").in("id", subIds)
    : { data: [] as any[] };
  const subNameById: Record<string, string> = Object.fromEntries((subUsers ?? []).map((u: any) => [u.id, nm(u)]));

  const roomInfo = (r: any) => {
    const sem = yearById[r.academic_year_id]?.semester ?? 1;
    const sibling = rooms.some(o =>
      o.id !== r.id && o.grade_group === r.grade_group &&
      (o.room_name ?? "").trim() === (r.room_name ?? "").trim() &&
      (yearById[o.academic_year_id]?.semester ?? 1) !== sem);
    return { sem, split: !!r.split_by_semester || sibling };
  };

  const out: Period[] = [];
  for (const date of dates) {
    const dow = dowOf(date);
    for (const e of mine) {
      if (e.day_of_week !== dow) continue;
      const room = roomById[e.classroom_id];
      if (!room) continue;
      const info = roomInfo(room);
      if (info.split && info.sem !== semesterForDate(date)) continue;

      let time = "", end = "";
if (String(e.time_slot_id).startsWith("tmpl-")) {
  const hhmm = String(e.time_slot_id).split("-").pop() ?? "";
  time = hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : "";
} else {
  const s = slotById[e.time_slot_id];
  if (s?.is_break) continue;
  time = (s?.start_time ?? "").slice(0, 5);
  end = (s?.end_time ?? "").slice(0, 5);
}

      const coId = coIdOf(e);
      const coOnLeave = coId ? coLeaves.some(l => l.user_id === coId && l.start_date <= date && l.end_date >= date) : false;
      const subId = subMap.get(`${e.id}|${date}`);
      out.push({
        date, time, end,
        subject: subjById[e.subject_id]?.name_th ?? "ไม่ระบุวิชา",
        room: room.grade_group ? `${room.grade_group}${room.room_name ? " " + room.room_name : ""}`.trim() : (room.room_name ?? ""),
        gradeCode: THAI_TO_CODE[(room.grade_group ?? "").split("/")[0].trim()] ?? null,
        covered: !!coId && !coOnLeave,              // มีครูคู่สอนอยู่แล้ว ไม่ต้องจัดแทน
        subName: subId ? (subNameById[subId] ?? "ครูสอนแทน") : null,
  subId: subId ?? null,
  acked: ackMap.get(`${e.id}|${date}`) ?? false,
      });
    }
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

const needCount = (l: Period[]) => l.filter(p => !p.covered).length;
const missingCount = (l: Period[]) => l.filter(p => !p.covered && !p.subName).length;

// ───────────── context ─────────────
type Ctx = {
  req: any; requester: any; event: LeaveEvent; slot?: 1 | 2 | 3; reason?: string;
  typeText: string; dateText: string; daysText: string; reasonText: string; progress: string;
  periods: Period[]; st: { sick: number; personal: number; maternity: number }; heads: any[];
  subUsers: Record<string, any>; actorId?: string;
};

async function loadCtx(leaveId: string, event: LeaveEvent, slot?: 1 | 2 | 3, reason?: string, actorId?: string): Promise<Ctx | null> {
  const { data: req } = await admin.from("leave_requests").select("*").eq("id", leaveId).maybeSingle();
  if (!req) return null;
  const { data: requester } = await admin.from("users")
    .select("id,title,first_name,last_name,email,position,grade_level").eq("id", req.user_id).single();
  const [periods, st, headsRes] = await Promise.all([
    loadPeriods(req),
    stats(req.user_id, leaveId, req.start_date),
    admin.from("users").select("id,title,first_name,last_name,email,grade_level,extra_roles").contains("extra_roles", ["grade_head"]),
  ]);
  const subIds = [...new Set(periods.map(p => p.subId).filter(Boolean))] as string[];
const { data: subUsersData } = subIds.length
  ? await admin.from("users").select("id,title,first_name,last_name,email").in("id", subIds)
  : { data: [] as any[] };
const subUsers = Object.fromEntries((subUsersData ?? []).map((u: any) => [u.id, u]));
  const cfg: any = (LEAVE_TYPE_CONFIG as any)[req.leave_type];
  const label = req.leave_type === "other" && req.other_leave_name ? req.other_leave_name : cfg?.label ?? req.leave_type;
  const approvedCount = [req.approver_1_status, req.approver_2_status, req.approver_3_status].filter(s => s === "approved").length;
  return {
    req, requester, event, slot, reason, actorId, periods, st, heads: headsRes.data ?? [], subUsers,
    typeText: `${cfg?.icon ?? ""} ${label}`.trim(),
    dateText: req.start_date === req.end_date ? thDate(req.start_date) : `${thDate(req.start_date)} – ${thDate(req.end_date)}`,
    daysText: `${req.days_count} วัน${req.half_day ? ` (ครึ่ง${req.half_day === "morning" ? "เช้า" : "บ่าย"})` : ""}`,
    reasonText: (req.reason ?? "").replace(/\[.+?\]/g, "").trim() || "-",
    progress: `① ${icon(req.approver_1_status)} → ② ${icon(req.approver_2_status)} → ③ ${icon(req.approver_3_status)}  (${approvedCount}/3)`,
  };
}

// ───────────── card building blocks ─────────────
export const tb = (text: string, o: any = {}) => ({ type: "TextBlock", text, wrap: true, ...o });
export const facts = (rows: [string, string][]) => ({ type: "FactSet", facts: rows.map(([title, value]) => ({ title, value })) });
export const wrapCard = (body: any[], actions: any[] = [], source = "ระบบลา · โรงเรียนวัดเขียนเขต") => ({
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
  msteams: { width: "Full" },
  body: [
    { type: "TextBlock", text: source, size: "Small", weight: "Bolder", isSubtle: true, wrap: true },
    ...body,
  ],
  actions,
});
export const openUrl = (title: string, url: string, style?: string) => ({ type: "Action.OpenUrl", title, url, ...(style ? { style } : {}) });

function periodLines(list: Period[], max = 12) {
  const rows = list.slice(0, max).map(p => {
    const who = p.covered ? "👥 มีครูคู่สอนอยู่แล้ว"
      : p.subName ? `→ ${p.subName} ${p.acked ? "✅ รับทราบ" : "⏳ รอรับทราบ"}`
      : "→ ⚠️ ยังไม่จัด";
    return tb(`• ${thDate(p.date)} ${p.time} · ${p.subject} · ${p.room} ${who}`, { size: "Small", spacing: "None" });
  });
  if (list.length > max) rows.push(tb(`…และอีก ${list.length - max} คาบ (ดูทั้งหมดในระบบ)`, { size: "Small", isSubtle: true }));
  return rows;
}

function swapSummary(list: Period[]) {
  const need = needCount(list), miss = missingCount(list);
  if (list.length === 0) return tb("ไม่มีคาบสอนในวันที่ลา", { isSubtle: true });
  if (need === 0) return tb("👥 ทุกคาบมีครูคู่สอนอยู่แล้ว ไม่ต้องจัดสอนแทน", { color: "Good" });
  if (miss === 0) return tb(`🔄 จัดครูสอนแทนครบแล้ว ${need} คาบ`, { color: "Good" });
  return tb(`⚠️ ยังไม่ได้จัดสอนแทน ${miss}/${need} คาบ — หัวหน้าสายได้รับแจ้งแล้ว`, { color: "Warning" });
}

const baseFacts = (c: Ctx, withDetail: boolean): [string, string][] => {
  const rows: [string, string][] = [
    ["ผู้ลา", `${nm(c.requester)} (${c.requester?.position ?? "-"})`],
    ["ประเภท", c.typeText],
    ["วันที่", c.dateText],
    ["จำนวน", c.daysText],
  ];
  if (withDetail) {
    rows.push(["เหตุผล", c.reasonText]);
    rows.push(["สถิติปีงบนี้", `ป่วย ${c.st.sick} · กิจ ${c.st.personal} · คลอด ${c.st.maternity} วัน (ก่อนใบนี้)`]);
  }
  return rows;
};

// ───────────── แต่ละบทบาท ─────────────
function approverCard(c: Ctx, slot: 1 | 2 | 3) {
  const { req, event } = c;
  const mine = req[`approver_${slot}_status`];
  const rej = rejectedSlot(req);
  const live = event !== "cancelled" && req.status === "pending" && mine === "pending" &&
    (slot === 1 || req.approver_1_status === "approved");
  let title: string, color: string;
  if (event === "cancelled") { title = "🗑️ ผู้ขอยกเลิกใบลานี้แล้ว — ไม่ต้องดำเนินการ"; color = "Attention"; }
  else if (req.status === "rejected") {
    title = `❌ ${rej === slot ? "คุณ" : rej ? APPROVER_NAMES[rej] : "ผู้อนุมัติ"}ไม่อนุมัติใบลานี้`; color = "Attention";
  }
  else if (req.status === "approved") { title = mine === "approved" ? "✅ คุณอนุมัติแล้ว — ใบลาอนุมัติครบ 3 ท่าน" : "✅ ใบลาอนุมัติครบแล้ว"; color = "Good"; }
  else if (mine === "approved") { title = `✅ คุณอนุมัติแล้ว (ลำดับ ${slot}) — รอผู้อนุมัติท่านถัดไป`; color = "Good"; }
  else { title = `${event === "edited" ? "✏️ (แก้ไขแล้ว) " : "⏳ "}ใบลารอคุณอนุมัติ (ลำดับ ${slot})`; color = "Accent"; }

  const body: any[] = [
    tb(title, { weight: "Bolder", size: "Large", color }),
    tb(`ขั้นตอนอนุมัติ: ${c.progress}`, { weight: "Bolder" }),
    facts(baseFacts(c, true)),
  ];
  const reason = c.reason ?? req.reject_reason;
  if (req.status === "rejected" && reason) body.push(tb(`เหตุผลที่ไม่อนุมัติ: ${reason}`, { color: "Attention" }));
  if (event !== "cancelled" && req.status !== "rejected") body.push(swapSummary(c.periods));

  const actions: any[] = [];
  if (live) {
    const base = `${SITE}/leave/action?id=${req.id}&slot=${slot}`;
    actions.push(
      openUrl(`✅ อนุมัติ (ลำดับ ${slot})`, `${base}&action=approved`, "positive"),
      openUrl("❌ ไม่อนุมัติ", `${base}&action=rejected`, "destructive"),
    );
  }
  if (event !== "cancelled") actions.push(openUrl("เปิดในระบบ", `${SITE}/leave`));
  return wrapCard(body, actions);
}

function requesterCard(c: Ctx) {
  const { req, event } = c;
  const final = req.status === "approved";
  const rej = rejectedSlot(req);
  const n = [req.approver_1_status, req.approver_2_status, req.approver_3_status].filter(s => s === "approved").length;
  const cancelled = event === "cancelled";
  const rejected = req.status === "rejected";
  const title =
    cancelled ? "🗑️ ยกเลิกใบลาแล้ว" :
    rejected ? `❌ ใบลาไม่ได้รับอนุมัติ${rej ? ` (โดย ${APPROVER_NAMES[rej]})` : ""}` :
    final ? "✅ ใบลาได้รับอนุมัติครบแล้ว" :
    n > 0 ? `✅ อนุมัติแล้ว ${n}/3 — รอผู้อนุมัติท่านถัดไป` :
    event === "edited" ? "✏️ แก้ไขใบลาแล้ว รอผู้อนุมัติ" : "📝 ส่งใบลาแล้ว รอผู้อนุมัติ";
  const color = cancelled || rejected ? "Attention" : final || n > 0 ? "Good" : "Accent";
  const body: any[] = [
    tb(title, { weight: "Bolder", size: "Large", color }),
    tb(`ขั้นตอนอนุมัติ: ${c.progress}`, { weight: "Bolder" }),
    facts(baseFacts(c, false)),
  ];
  const reason = c.reason ?? req.reject_reason;
  if (rejected && reason) body.push(tb(`เหตุผลที่ไม่อนุมัติ: ${reason}`, { color: "Attention" }));
  if (!cancelled && !rejected) { body.push(swapSummary(c.periods)); body.push(...ackSummary(c.periods)); }
  return wrapCard(body, cancelled ? [] : [openUrl("เปิดในระบบ", `${SITE}/leave`)]);
}

function directorCard(c: Ctx) {
  const cancelled = c.event === "cancelled";
  return wrapCard([
    tb(cancelled ? "🗑️ ผู้ขอยกเลิกใบลานี้แล้ว" : "✅ ใบลาอนุมัติครบแล้ว (แจ้งให้ทราบ)",
      { weight: "Bolder", size: "Large", color: cancelled ? "Attention" : "Good" }),
    tb(`ขั้นตอนอนุมัติ: ${c.progress}`, { weight: "Bolder" }),
    facts(baseFacts(c, false)),
  ], cancelled ? [] : [openUrl("เปิดในระบบ", `${SITE}/leave`)]);
}

function headCard(c: Ctx, head: any, list: Period[], ownSide: boolean) {
  const { event, req } = c;
  const final = req.status === "approved";
  const cancelled = event === "cancelled";
  const rejected = req.status === "rejected";
  const title =
    cancelled ? "🗑️ ใบลาในสายชั้นของคุณถูกยกเลิก" :
    rejected ? "❌ ใบลาในสายชั้นของคุณไม่ได้รับอนุมัติ" :
    final ? "✅ ใบลาในสายชั้นของคุณอนุมัติครบแล้ว" :
    event === "edited" ? "✏️ ใบลาในสายชั้นของคุณมีการแก้ไข" : "📝 มีใบลาในสายชั้นของคุณ";
  const color = cancelled || rejected ? "Attention" : final ? "Good" : "Accent";
  const body: any[] = [
    tb(title, { weight: "Bolder", size: "Large", color }),
    tb(`ขั้นตอนอนุมัติ: ${c.progress}`, { weight: "Bolder" }),
    facts(baseFacts(c, false)),
  ];
  const live = !cancelled && !rejected;
  let miss = 0;
  if (live) {
    const scope = ownSide ? "คาบทั้งหมดของผู้ลา" : `เฉพาะคาบสายชั้น ${GRADE_LABEL[head.grade_level] ?? head.grade_level}`;
    miss = missingCount(list);
    body.push(tb(scope, { isSubtle: true, size: "Small" }));
    if (list.length === 0) body.push(tb("ไม่มีคาบสอนของผู้ลาในวันที่ลา", { isSubtle: true }));
    else {
      body.push(miss > 0
        ? tb(`⚠️ ยังไม่ได้จัดสอนแทน ${miss} คาบ กรุณาจัดครูสอนแทน`, { color: "Warning", weight: "Bolder" })
        : tb("🔄 จัดครูสอนแทนครบแล้ว", { color: "Good", weight: "Bolder" }));
      body.push(...periodLines(list));
      body.push(...ackSummary(list));          // ★ แทน ackCard เดิม
    }
  }
  return wrapCard(body, miss > 0 ? [openUrl("📂 เปิดในระบบเพื่อจัดสอนแทน", SUBSTITUTE_URL)] : []);
}
function substituteCard(c: Ctx, list: Period[], mode: "assign" | "cancel") {
  const pending = list.some(p => !p.acked);
  const title = mode === "cancel"
    ? "🗑️ ยกเลิกการสอนแทน — คุณไม่ต้องสอนแทนแล้ว"
    : "🔄 คุณถูกจัดให้สอนแทน";
  const body: any[] = [
    tb(title, { weight: "Bolder", size: "Large", color: mode === "cancel" ? "Attention" : "Accent" }),
    tb(`สอนแทน: ${nm(c.requester)} (${c.requester?.position ?? "-"})`, { weight: "Bolder" }),
    ...(mode === "assign" && c.req.status === "pending" ? [tb("ใบลายังอยู่ระหว่างรออนุมัติ", { isSubtle: true, size: "Small" })] : []),
    ...list.map(p => tb(
      `• ${thDate(p.date)} ${p.time}${p.end ? "–" + p.end : ""} · ${p.subject} · ${p.room}${p.acked && mode === "assign" ? " ✅ รับทราบแล้ว" : ""}`,
      { size: "Small", spacing: "None" })),
  ];
  const actions: any[] = [];
  if (mode === "assign" && pending)
    actions.push(openUrl("✅ รับทราบ", `${SITE}/leave/ack?id=${c.req.id}`, "positive"));
  actions.push(openUrl("เปิดในระบบ", `${SITE}/leave`));
  return wrapCard(body, actions);
}

function ackSummary(list: Period[]) {
  const by = new Map<string, { name: string; total: number; acked: number }>();
  list.forEach(p => {
    if (!p.subId) return;
    const cur = by.get(p.subId) ?? { name: p.subName ?? "ครูสอนแทน", total: 0, acked: 0 };
    cur.total++; if (p.acked) cur.acked++;
    by.set(p.subId, cur);
  });
  if (by.size === 0) return [];
  return [
    tb("สถานะการรับทราบของครูสอนแทน", { weight: "Bolder", size: "Small" }),
    ...[...by.values()].map(v => tb(
      `${v.acked === v.total ? "✅" : "⏳"} ${v.name} — ${v.acked === v.total ? "รับทราบแล้ว" : `รับทราบ ${v.acked}/${v.total} คาบ`}`,
      { size: "Small", spacing: "None" })),
  ];
}

// ───────────── ใครได้การ์ดอะไร ─────────────

function headView(c: Ctx, h: any) {
  const ownSide = !!c.requester?.grade_level && h.grade_level === c.requester.grade_level;
  const rel = ownSide ? c.periods : c.periods.filter(p => p.gradeCode === h.grade_level);
  return { ownSide, rel };
}
function periodsOfSub(c: Ctx, email: string): Period[] {
  const u: any = Object.values(c.subUsers).find((x: any) => x.email?.toLowerCase() === email.toLowerCase());
  return u ? c.periods.filter(p => p.subId === u.id) : [];
}

// สร้างการ์ดใหม่ให้คนที่เคยได้การ์ดไปแล้ว ตามบทบาทเดิม (ใช้อัปเดตการ์ดเก่า)
function cardForRole(c: Ctx, role: Role, email: string) {
  switch (role) {
    case "approver1": return approverCard(c, 1);
    case "approver2": return approverCard(c, 2);
    case "director": return directorCard(c);
    case "requester": return requesterCard(c);
    case "head": {
      const h = c.heads.find((x: any) => x.email?.toLowerCase() === email.toLowerCase());
      if (!h) return null;
      const { ownSide, rel } = headView(c, h);
      return headCard(c, h, rel, ownSide);
    }
    case "substitute": {
      const list = periodsOfSub(c, email);
      const cancel = list.length === 0 || c.event === "cancelled" || c.req.status === "rejected";
      return substituteCard(c, list, cancel ? "cancel" : "assign");
    }
  }
}

function buildSends(c: Ctx): Send[] {
  const { req, event } = c;
  const out: Send[] = [];
  const final = req.status === "approved";
  const add = (to: string | null | undefined, role: Role, card: any) => {
  if (!to || !card) return;
  if (out.some(o => o.to.toLowerCase() === to.toLowerCase())) return;   // 1 คน 1 การ์ด
  out.push({ to, role, card });
};

  // ── ครูกดรับทราบ → อัปเดตการ์ดครูคนนั้น + ผู้ลา + หน.สายที่เกี่ยวข้อง ──
  if (event === "acknowledged") {
    const mineAll = c.periods.filter(p => p.subId === c.actorId);
    add(c.subUsers[c.actorId ?? ""]?.email, "substitute", substituteCard(c, mineAll, "assign"));
    add(c.requester?.email, "requester", requesterCard(c));
    for (const h of c.heads) {
      if (!h.email || !h.grade_level) continue;
      const { ownSide, rel } = headView(c, h);
      if (!mineAll.some(p => ownSide || p.gradeCode === h.grade_level)) continue;
      add(h.email, "head", headCard(c, h, rel, ownSide));
    }
    return out;
  }

  // ── ครูที่ถูกจัดสอนแทน ──
  const bySub = new Map<string, Period[]>();
  c.periods.forEach(p => { if (p.subId) bySub.set(p.subId, [...(bySub.get(p.subId) ?? []), p]); });
  const subMode: "assign" | "cancel" | null =
    event === "submitted" || event === "edited" || event === "substituted" ? "assign" :
    event === "cancelled" || event === "rejected" ? "cancel" : null;
  if (subMode) {
    for (const [sid, list] of bySub) {
      const u = c.subUsers[sid];
      if (event === "substituted" && list.every(p => p.acked)) continue;
      add(u?.email, "substitute", substituteCard(c, list, subMode));
    }
  }
  if (event === "substituted") return out;   // คนอื่นถูกรีเฟรชเงียบๆ ในขั้น stale

  // ── ผู้อนุมัติที่ถึงคิว ──
  let actionSlot: 1 | 2 | null = null;
  if (req.status === "pending") {
    if (req.approver_1_status === "pending") actionSlot = 1;
    else if (req.approver_1_status === "approved" && req.approver_2_status === "pending") actionSlot = 2;
  }
  if (actionSlot &&
    (event === "submitted" || event === "edited" || event === "cancelled" || (event === "approved" && !final)))
    add(APPROVER_EMAILS[actionSlot], approverRole(actionSlot), approverCard(c, actionSlot));

  add(c.requester?.email, "requester", requesterCard(c));
  if (event === "approved" && final) add(APPROVER_EMAILS[3], "director", directorCard(c));

  const sendHeads = event === "submitted" || event === "edited" || event === "cancelled" ||
    event === "rejected" || (event === "approved" && final);
  if (sendHeads) {
    for (const h of c.heads) {
      if (!h.email || !h.grade_level) continue;
      const { ownSide, rel } = headView(c, h);
      if (!ownSide && rel.length === 0) continue;
      add(h.email, "head", headCard(c, h, rel, ownSide));
    }
  }
  return out;
}

// ───────────── ส่ง ─────────────
async function callFlow(url: string, payload: any): Promise<{ messageId?: string } | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) { console.warn("[teams]", payload.action, payload.to, r.status); return null; }
    return (await r.json().catch(() => ({}))) ?? {};
  } catch (e) { console.warn("[teams] fetch error", e); return null; }
}

async function remember(leaveId: string, s: Send, messageId: string) {
  await admin.from("leave_teams_messages").upsert({
    leave_id: leaveId, email: s.to.toLowerCase(), role: s.role, message_id: messageId,
    updated_at: new Date().toISOString(),
  });
}

async function deliver(url: string, leaveId: string, s: Send, existing?: Stored) {
  if (existing) {
    const r = await callFlow(url, { action: "update", to: s.to, messageId: existing.message_id, card: s.card });
    if (r) { await remember(leaveId, s, existing.message_id); return; }   // อัปเดตการ์ดเดิมสำเร็จ
    // อัปเดตไม่ได้ (เช่นข้อความถูกลบ) → ตกไปสร้างใหม่
  }
  const r = await callFlow(url, { action: "create", to: s.to, card: s.card });
  if (r?.messageId) await remember(leaveId, s, r.messageId);
  else console.warn("[teams] ไม่ได้รับ messageId จาก Flow — ครั้งหน้าจะสร้างการ์ดใหม่อีก", s.to);
}

export async function notifyLeaveTeams(leaveId: string, event: LeaveEvent, slot?: 1 | 2 | 3, reason?: string, actorId?: string) {
  const url = process.env.TEAMS_LEAVE_WEBHOOK_URL;
  if (!url) return;
  const ctx = await loadCtx(leaveId, event, slot, reason, actorId);
  if (!ctx) return;

  const { data: stored } = await admin.from("leave_teams_messages")
    .select("email,role,message_id").eq("leave_id", leaveId);
  const storedBy = new Map<string, Stored>((stored ?? []).map((m: any) => [m.email.toLowerCase(), m as Stored]));

  const sends = buildSends(ctx);

  // คนที่เคยได้การ์ดแต่ไม่อยู่ในรอบนี้ (เช่น ผู้อนุมัติลำดับ 1 หลังกดอนุมัติ) → แก้การ์ดเดิมให้เป็นสถานะล่าสุด
  if (event !== "acknowledged") {
    const have = new Set(sends.map(s => s.to.toLowerCase()));
    for (const m of storedBy.values()) {
      if (have.has(m.email.toLowerCase())) continue;
      const card = cardForRole(ctx, m.role, m.email);
      if (card) sends.push({ to: m.email, role: m.role, card });
    }
  }
  await Promise.allSettled(sends.map(s => deliver(url, leaveId, s, storedBy.get(s.to.toLowerCase()))));
}

// ───────────── อนุมัติ/ไม่อนุมัติ ─────────────
export async function applyApproval(leaveId: string, slot: 1 | 2, action: "approved" | "rejected", reason?: string) {
  const { data: req } = await admin.from("leave_requests").select("*").eq("id", leaveId).maybeSingle();
  if (!req) throw new Error("ไม่พบใบลา");
  if (req.status !== "pending") throw new Error("ใบลานี้ไม่อยู่ในสถานะรออนุมัติแล้ว");
  if (req[`approver_${slot}_status`] !== "pending") throw new Error("คุณดำเนินการรายการนี้ไปแล้ว");
  if (slot === 2 && req.approver_1_status !== "approved") throw new Error("ผู้อนุมัติลำดับ 1 ยังไม่อนุมัติ");

  const { data: me } = await admin.from("users").select("id,signature_url").eq("email", APPROVER_EMAILS[slot]).single();
  const now = () => new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  const updates: any = { [`approver_${slot}_status`]: action, [`approver_${slot}_id`]: me?.id };

  if (action === "rejected") {
    updates.status = "rejected"; updates[`approver_${slot}_reject_reason`] = reason; updates.reject_reason = reason;
  } else {
    if (!me?.signature_url) throw new Error("ยังไม่มีลายเซ็นของคุณในระบบ กรุณาเข้าระบบลาเพื่อเพิ่มลายเซ็นก่อน");
    updates[`approver_${slot}_signature`] = me.signature_url; updates[`approver_${slot}_approved_at`] = now();
    if (slot === 2 && req.approver_3_id) {
      const { data: u3 } = await admin.from("users").select("signature_url").eq("id", req.approver_3_id).single();
      updates.approver_3_status = "approved"; updates.approver_3_signature = u3?.signature_url ?? "";
      updates.approver_3_approved_at = now(); updates.status = "approved";
    }
  }
      const { error } = await admin.from("leave_requests").update(updates).eq("id", leaveId);
  if (error) throw new Error(error.message);
  await notifyLeaveTeams(leaveId, action === "approved" ? "approved" : "rejected", slot, reason);
  return { fullyApproved: updates.status === "approved" };
}