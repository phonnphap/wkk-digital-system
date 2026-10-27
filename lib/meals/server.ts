// lib/meals/server.ts — ใช้ใน API routes เท่านั้น
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import {
  ADMIN_ROLES, FIXED_HOLIDAYS, GROUP_HEAD_LABEL, GROUP_HEAD_USER_ID, OWNER_ROLES, PROJECT_HEAD_LABEL, PROJECT_HEAD_USER_ID, daysInMonth, dateOf, mapAttendance, milkEligible, parseGrade,
  todayBkk, UNKNOWN_GRADE,
  type CellStatus, type ClassroomLite, type MealType, type SheetData, type SheetStudent,
} from "./shared";
import { planExtras, type DayInput } from "./distribute";

// ════════════════════════════════════════════════════════════════════════════
// ★ จุดเดียวที่ต้องปรับให้ตรงกับ schema จริงของโรงเรียน (ชื่อตาราง/คอลัมน์)
// ════════════════════════════════════════════════════════════════════════════
export const STUDENTS = {
  table: "active_students",
  id: "id",
  classroom: "classroom_id",
  no: "seat_number", // เลขที่
  prefix: "prefix",
  first: "first_name",
  last: "last_name",
};
const ATTENDANCE = {
  table: "homeroom_attendance", // ตารางเช็คชื่อโฮมรูมรายวัน
  student: "student_id",
  classroom: "classroom_id",
  date: "attendance_date",
  status: "status",
};
// สำรอง: ถ้า homeroom_attendance ไม่มีข้อมูลเดือนนั้น จะลองตารางนี้
const ATTENDANCE_ALT = { table: "attendance_records", student: "student_id", classroom: "classroom_id", date: "attendance_date", status: "status" };
const CLASSROOMS = { table: "classrooms", id: "classroom_id", name: "room_name" };
const BUCKET = "student-signatures";

// ── Auth ────────────────────────────────────────────────────────────────────
export async function getActor() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient() as any;
  const { data: profile } = await service
    .from("users")
    .select("id, role, first_name, last_name")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!profile) return null;
  const { data: rooms } = await supabase.rpc("get_my_classrooms");
  return {
    service,
    profile: profile as { id: string; role: string; first_name: string; last_name: string },
    isAdmin: ADMIN_ROLES.has(profile.role),
    isOwner: OWNER_ROLES.has(profile.role),
    myRooms: ((rooms ?? []) as { classroom_id: string; room_name: string }[]).map((r) => ({ id: r.classroom_id, name: r.room_name })),
    myRoomIds: new Set<string>(((rooms ?? []) as { classroom_id: string }[]).map((r) => r.classroom_id)),
  };
}
export type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>;
export const canAccessRoom = (a: Actor, classroomId: string) => a.isAdmin || a.isOwner || a.myRoomIds.has(classroomId);
/** แก้ไขได้เฉพาะครูประจำชั้น (หรือ admin) */
export const canEditRoom = (a: Actor, classroomId: string) =>
  a.profile.role === "admin" || a.myRoomIds.has(classroomId);

// ── Utils ───────────────────────────────────────────────────────────────────
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
export const monthRange = (month: string) => ({ start: dateOf(month, 1), end: dateOf(month, daysInMonth(month)) });
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function listClassrooms(a: Actor, all: boolean): Promise<ClassroomLite[]> {
  let rows: { id: string; name: string }[];
  if (all || a.isAdmin || a.isOwner) {
    const { data, error } = await a.service.from(CLASSROOMS.table).select(`id:${CLASSROOMS.id}, name:${CLASSROOMS.name}`);
    if (error) {
      if (!a.myRooms.length) throw new Error(`อ่านตารางห้องเรียนไม่ได้: ${error.message}`);
      rows = a.myRooms; // สำรอง: ใช้ห้องของครูจาก get_my_classrooms
    } else rows = data ?? [];
  } else {
    rows = a.myRooms;
  }
  return rows
    .map((r) => {
      const g = parseGrade(r.name) ?? UNKNOWN_GRADE;
      return { id: r.id, name: r.name, milk: milkEligible(g), o: g.order };
    })
    .sort((x, y) => x.o - y.o || x.name.localeCompare(y.name, "th"))
    .map(({ o, ...r }) => r);
}

type StudentRow = { id: string; no: number | null; name: string };
async function loadStudents(a: Actor, classroomId: string): Promise<StudentRow[]> {
  const { data, error } = await a.service
    .from(STUDENTS.table)
    .select(`id:${STUDENTS.id}, no:${STUDENTS.no}, prefix:${STUDENTS.prefix}, first:${STUDENTS.first}, last:${STUDENTS.last}`)
    .eq(STUDENTS.classroom, classroomId)
    .eq("is_active", true)
    .order(STUDENTS.no, { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s: any) => ({
    id: s.id,
    no: s.no ?? null,
    name: `${s.prefix ?? ""}${s.first ?? ""} ${s.last ?? ""}`.trim(),
  }));
}

/** ค่าล่าสุด ≤ สิ้นเดือน: เริ่มจากหน้าประเมินโภชนาการ (nutrition_assessments) แล้วให้ค่าที่ครูกรอกในหน้านี้ (meal_month_measures) ทับ */
async function latestValue(a: Actor, ids: string[], month: string, col: "weight_kg" | "height_cm") {
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  const { end } = monthRange(month);
  const nut = await fetchAll<any>((f, t) =>
    a.service
      .from("nutrition_assessments")
      .select(`student_id, assessment_date, v:${col}`)
      .in("student_id", ids)
      .lte("assessment_date", end)
      .not(col, "is", null)
      .order("assessment_date", { ascending: false })
      .order("student_id")
      .range(f, t),
  );
  for (const r of nut) if (!(r.student_id in out)) out[r.student_id] = Number(r.v);

  const mm = await fetchAll<any>((f, t) =>
    a.service
      .from("meal_month_measures")
      .select(`student_id, month, v:${col}`)
      .in("student_id", ids)
      .lte("month", month)
      .not(col, "is", null)
      .order("month", { ascending: false })
      .order("student_id")
      .range(f, t),
  );
  const seen = new Set<string>();
  for (const r of mm) if (!seen.has(r.student_id)) { seen.add(r.student_id); out[r.student_id] = Number(r.v); }
  return out;
}
const latestMetric = (a: Actor, ids: string[], month: string, type: MealType) =>
  latestValue(a, ids, month, type === "lunch" ? "weight_kg" : "height_cm");

async function signedUrls(a: Actor, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const { data } = await a.service.storage.from(BUCKET).createSignedUrls(paths, 3600);
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

// ── ข้อมูลหัวกระดาษ / ผู้ลงนาม ──────────────────────────────────────────────
async function academicYearName(a: Actor, date: string): Promise<string | null> {
  try {
    const { data } = await a.service.from("academic_years").select("*");
    if (!data?.length) return null;
    const hit =
      data.find((y: any) => y.start_date && y.end_date && y.start_date <= date && date <= y.end_date) ??
      data.find((y: any) => y.is_current === true) ??
      [...data].sort((x: any, y: any) => String(y.year_name).localeCompare(String(x.year_name)))[0];
    return hit?.year_name != null ? String(hit.year_name) : null;
  } catch { return null; }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** หา users.id ของครูที่ปรึกษาห้องนี้ — ปรับให้ตรง schema จริงได้ที่ HOMEROOM_JUNCTIONS */
const HOMEROOM_JUNCTIONS = ["classroom_teachers", "homeroom_teachers"];
async function homeroomTeacherIds(a: Actor, classroomId: string): Promise<string[]> {
  const ids = new Set<string>();
  const collect = (row: Record<string, unknown>, keyRe: RegExp) => {
    for (const [k, v] of Object.entries(row)) if (keyRe.test(k) && typeof v === "string" && UUID_RE.test(v)) ids.add(v);
  };
  try {
    const { data } = await a.service.from(CLASSROOMS.table).select("*").eq(CLASSROOMS.id, classroomId).maybeSingle();
    if (data) collect(data, /teacher/i);
  } catch { /* ignore */ }
  if (!ids.size) {
    for (const t of HOMEROOM_JUNCTIONS) {
      try {
        const { data, error } = await a.service.from(t).select("*").eq("classroom_id", classroomId);
        if (!error) (data ?? []).forEach((r: any) => collect(r, /(user|teacher)_id$/i));
      } catch { /* ignore */ }
      if (ids.size) break;
    }
  }
  if (!ids.size && a.myRoomIds.has(classroomId)) ids.add(a.profile.id); // สำรอง: ครูที่ล็อกอินและเป็นประจำชั้นห้องนี้
  return [...ids];
}

async function loadSigners(a: Actor, classroomId: string, type: MealType): Promise<SheetData["signers"]> {
  const teacherIds = (await homeroomTeacherIds(a, classroomId)).slice(0, 2);
  const want = [...teacherIds, PROJECT_HEAD_USER_ID, GROUP_HEAD_USER_ID];
  let res = await a.service.from("users").select("id, title, first_name, last_name, signature_url").in("id", want);
  if (res.error) res = await a.service.from("users").select("id, first_name, last_name, signature_url").in("id", want);
  const users = (res.data ?? []) as any[];
  const person = (id: string, role: string) => {
    const u = users.find((x) => x.id === id);
    return {
      role,
      name: u ? `${u.title ?? ""}${u.first_name}  ${u.last_name}` : null,
      signatureUrl: (u?.signature_url as string | null) || null,
    };
  };
  const teachers = teacherIds.length
    ? teacherIds.map((id) => person(id, "ครูที่ปรึกษา"))
    : [{ role: "ครูที่ปรึกษา", name: null, signatureUrl: null }];
  return [...teachers, person(PROJECT_HEAD_USER_ID, PROJECT_HEAD_LABEL[type]), person(GROUP_HEAD_USER_ID, GROUP_HEAD_LABEL)];
}

// ── Sync: ดึงจากเช็คชื่อโฮมรูม → meal_records + จัดแจกเพิ่ม ───────────────────
export async function syncMonth(
  a: Actor, classroomId: string, month: string, type: MealType,
  override?: { studentId: string; date: string; status: CellStatus | null },
) {
  const s = a.service;
  const { data: rep } = await s.from("meal_month_reports").select("teacher_confirmed_at")
    .eq("classroom_id", classroomId).eq("month", month).eq("meal_type", type).maybeSingle();
  if (rep?.teacher_confirmed_at) return { locked: true };

  if (override) {
    if (override.status) {
      await s.from("meal_records").upsert({
        classroom_id: classroomId, student_id: override.studentId, record_date: override.date,
        meal_type: type, status: override.status, extra_portions: 0, source: "manual",
        updated_at: new Date().toISOString(),
      }, { onConflict: "student_id,record_date,meal_type" });
    } else {
      await s.from("meal_records").delete()
        .eq("student_id", override.studentId).eq("record_date", override.date)
        .eq("meal_type", type).eq("source", "manual");
    }
  }

  const students = await loadStudents(a, classroomId);
  const ids = students.map((x) => x.id);
  const { start, end } = monthRange(month);
  const last = end < todayBkk() ? end : todayBkk();

  // ค้นด้วยรายชื่อนักเรียนในห้อง (ไม่พึ่ง classroom_id ในตารางเช็คชื่อ) และลองตารางสำรองถ้าตารางแรกว่าง
  let att: any[] = [];
  let source = ATTENDANCE.table;
  for (const A of [ATTENDANCE, ATTENDANCE_ALT]) {
    if (!ids.length) break;
    att = await fetchAll<any>((f, t) =>
      s.from(A.table)
        .select(`student:${A.student}, date:${A.date}, status:${A.status}`)
        .in(A.student, ids)
        .gte(A.date, start).lte(A.date, end)
        .order(A.date).order(A.student).range(f, t));
    source = A.table;
    if (att.length) break;
  }
  const unmapped = new Set<string>();
  const existing = await fetchAll<any>((f, t) =>
    s.from("meal_records").select("id, student_id, record_date, status, source")
      .eq("classroom_id", classroomId).eq("meal_type", type)
      .gte("record_date", start).lte("record_date", end)
      .order("record_date").order("student_id").range(f, t));

  // วัน → นักเรียน → สถานะ
  const byDate = new Map<string, Map<string, CellStatus>>();
  const put = (date: string, sid: string, st: CellStatus) => {
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date)!.set(sid, st);
  };
  for (const r of att) {
    if (r.date > last || !ids.includes(r.student)) continue;
    const st = mapAttendance(r.status);
    if (st) put(r.date, r.student, st);
    else unmapped.add(String(r.status));
  }
  const manualKeys = new Set<string>();
  for (const r of existing) {
    if (r.source === "manual" && ids.includes(r.student_id)) {
      put(r.record_date, r.student_id, r.status);
      manualKeys.add(`${r.student_id}|${r.record_date}`);
    }
  }

  const days: DayInput[] = [...byDate.entries()].map(([date, m]) => ({
    date, students: [...m.entries()].map(([id, status]) => ({ id, status })),
  }));
  const metric = await latestMetric(a, ids, month, type);
  const plan = planExtras(days, metric, `${classroomId}|${type}|${month}`);

  const now = new Date().toISOString();
  const rows: any[] = [];
  const keep = new Set<string>();
  for (const d of days) {
    for (const st of d.students) {
      const key = `${st.id}|${d.date}`;
      keep.add(key);
      rows.push({
        classroom_id: classroomId, student_id: st.id, record_date: d.date, meal_type: type,
        status: st.status, extra_portions: plan[d.date]?.[st.id] ?? 0,
        source: manualKeys.has(key) ? "manual" : "auto", updated_at: now,
      });
    }
  }
  for (const part of chunk(rows, 500)) {
    const { error } = await s.from("meal_records").upsert(part, { onConflict: "student_id,record_date,meal_type" });
    if (error) throw new Error(error.message);
  }
  // ลบแถว auto ที่ไม่มีข้อมูลเช็คชื่อรองรับแล้ว
  const stale = existing.filter((r) => r.source === "auto" && !keep.has(`${r.student_id}|${r.record_date}`)).map((r) => r.id);
  for (const part of chunk(stale, 200)) await s.from("meal_records").delete().in("id", part);
  return { locked: false, days: days.length, diag: { source, fetched: att.length, unmapped: [...unmapped] } };
}

// ── Sheet: ข้อมูลตารางรายเดือนของห้องเดียว ─────────────────────────────────────
export async function buildSheet(a: Actor, classroomId: string, month: string, type: MealType): Promise<SheetData> {
  const s = a.service;
  const classroom =
    (await listClassrooms(a, true)).find((r) => r.id === classroomId) ??
    (await listClassrooms(a, false)).find((r) => r.id === classroomId);
  if (!classroom) throw new Error("ไม่พบห้องเรียน");

  const students = await loadStudents(a, classroomId);
  const ids = students.map((x) => x.id);
  const { start, end } = monthRange(month);

  const [records, weights, sigRows, repRes] = await Promise.all([
    fetchAll<any>((f, t) =>
      s.from("meal_records").select("student_id, record_date, status, extra_portions, source")
        .eq("classroom_id", classroomId).eq("meal_type", type)
        .gte("record_date", start).lte("record_date", end)
        .order("record_date").order("student_id").range(f, t)),
    latestValue(a, ids, month, "weight_kg"),
    ids.length ? s.from("meal_signatures").select("subject_id, storage_path").eq("subject_type", "student").in("subject_id", ids) : { data: [] },
    s.from("meal_month_reports").select("*").eq("classroom_id", classroomId).eq("month", month).eq("meal_type", type).maybeSingle(),
  ]);
  const rep = repRes.data as any;
  const heights = await latestValue(a, ids, month, "height_cm");

  // ผู้ใช้ที่เกี่ยวข้อง (ครูที่ยืนยัน / เจ้าของโครงการ / ตัวเอง) + ลายมือชื่อ
  const userIds = [rep?.teacher_confirmed_by, rep?.owner_approved_by, a.profile.id].filter(Boolean) as string[];
  const [{ data: users }, { data: userSigs }] = await Promise.all([
    s.from("users").select("id, first_name, last_name").in("id", userIds),
    s.from("meal_signatures").select("subject_id, storage_path").eq("subject_type", "user").in("subject_id", userIds),
  ]);
  const uName = (id?: string | null) => {
    const u = (users ?? []).find((x: any) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : null;
  };
  const urls = await signedUrls(a, [...(sigRows.data ?? []), ...(userSigs ?? [])].map((r: any) => r.storage_path));
  const sigOf = (list: any[] | null, id?: string | null) => {
    const r = (list ?? []).find((x) => x.subject_id === id);
    return r ? urls[r.storage_path] ?? null : null;
  };

  const schoolDaySet = new Set<number>();
  const dayTotals: SheetData["dayTotals"] = {};
  const rowsByStudent = new Map<string, SheetStudent>(
    students.map((st) => [st.id, {
      ...st, cells: {}, present: 0, leave: 0, absent: 0, extra: 0,
      weight: weights[st.id] ?? null,
      height: heights[st.id] ?? null,
      signatureUrl: sigOf(sigRows.data, st.id),
    }]),
  );
  for (const r of records) {
    const row = rowsByStudent.get(r.student_id);
    if (!row) continue;
    const day = Number(String(r.record_date).slice(8, 10));
    schoolDaySet.add(day);
    row.cells[day] = { s: r.status, x: r.extra_portions ?? 0, m: r.source === "manual" };
    row[r.status as CellStatus] += 1;
    row.extra += r.extra_portions ?? 0;
    const t = (dayTotals[day] ??= { present: 0, leave: 0, absent: 0, extra: 0 });
    t[r.status as CellStatus] += 1;
    t.extra += r.extra_portions ?? 0;
  }

  const [signers, academicYear] = await Promise.all([
    loadSigners(a, classroomId, type),
    academicYearName(a, dateOf(month, 15)),
  ]);

  // ป้ายวันหยุด/เสาร์-อาทิตย์ (เฉพาะวันที่ไม่มีข้อมูลเช็คชื่อ = ไม่ใช่วันเรียน)
  const custom = new Map<string, string>();
  try {
    const { data: hol } = await s.from("school_holidays").select("holiday_date, name").gte("holiday_date", start).lte("holiday_date", end);
    (hol ?? []).forEach((h: any) => custom.set(h.holiday_date, h.name));
  } catch { /* ยังไม่ได้สร้างตาราง school_holidays */ }
  const [yy, mm] = month.split("-").map(Number);
  const dayLabels: Record<number, string> = {};
  for (let d = 1; d <= daysInMonth(month); d++) {
    if (schoolDaySet.has(d)) continue;
    const date = dateOf(month, d);
    const dow = new Date(Date.UTC(yy, mm - 1, d)).getUTCDay();
    const name = custom.get(date) ?? FIXED_HOLIDAYS[date.slice(5)];
    if (name) dayLabels[d] = name;
    else if (dow === 0) dayLabels[d] = "วันอาทิตย์";
    else if (dow === 6) dayLabels[d] = "วันเสาร์";
  }

  return {
    classroom, month, type, days: daysInMonth(month),
    schoolDays: [...schoolDaySet].sort((x, y) => x - y),
    students: [...rowsByStudent.values()],
    dayTotals,
    dayLabels,
    academicYear,
    milkPack: rep?.milk_pack === "กล่อง" ? "กล่อง" : "ถุง",
    signers,
    editable: canEditRoom(a, classroomId),
    me: {
      id: a.profile.id, name: `${a.profile.first_name} ${a.profile.last_name}`, isOwner: a.isOwner,
      hasSignature: !!sigOf(userSigs, a.profile.id),
    },
    report: {
      confirmed: !!rep?.teacher_confirmed_at,
      confirmedAt: rep?.teacher_confirmed_at ?? null,
      teacherName: uName(rep?.teacher_confirmed_by),
      teacherSignatureUrl: sigOf(userSigs, rep?.teacher_confirmed_by),
      approved: !!rep?.owner_approved_at,
      approvedAt: rep?.owner_approved_at ?? null,
      ownerName: uName(rep?.owner_approved_by),
      ownerSignatureUrl: sigOf(userSigs, rep?.owner_approved_by),
    },
  };
}

export { BUCKET };