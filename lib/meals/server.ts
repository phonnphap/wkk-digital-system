// lib/meals/server.ts — ใช้ใน API routes เท่านั้น
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import {
  ADMIN_ROLES, FIXED_HOLIDAYS, GROUP_HEAD_LABEL, GROUP_HEAD_USER_ID, OWNER_ROLES, PROJECT_HEAD_EMAIL, PROJECT_HEAD_LABEL, daysInMonth, dateOf, mapAttendance, milkEligible, parseGrade,
  todayBkk, UNKNOWN_GRADE,
  type CellStatus, type ClassroomLite, type MealType, type SheetData, type SheetStudent,
} from "./shared";
import { planExtras, type DayInput } from "./distribute";

// ════════════════════════════════════════════════════════════════════════════
// ★ จุดเดียวที่ต้องปรับให้ตรงกับ schema จริงของโรงเรียน (ชื่อตาราง/คอลัมน์)
// ════════════════════════════════════════════════════════════════════════════
// ตารางเดียวกับหน้า /attendance (เช็คชื่อโฮมรูม): students + attendance_records
export const STUDENTS = {
  table: "students",
  id: "id",
  classroom: "classroom_id",
  no: "seat_number", // เลขที่
  prefix: "prefix",
  first: "first_name",
  last: "last_name",
};
const ATTENDANCE = {
  table: "attendance_records", // หน้าเช็คชื่อโฮมรูมบันทึกลงตารางนี้ (recorded_source = 'homeroom')
  student: "student_id",
  classroom: "classroom_id",
  date: "attendance_date",
  status: "status",
  ts: "recorded_at",
};
// สำรอง: ถ้า attendance_records ไม่มีข้อมูลเดือนนั้น จะลองตารางนี้
const ATTENDANCE_ALT = { table: "homeroom_attendance", student: "student_id", classroom: "classroom_id", date: "attendance_date", status: "status", ts: "check_time" };
// ตาราง classrooms ใช้ PK ชื่อ id (ฟังก์ชัน get_my_classrooms ส่งออกเป็น classroom_id)
const CLASSROOMS = { table: "classrooms", id: "id", name: "room_name" };

const BUCKET = "student-signatures";

// ── แคชระดับโมดูล (อยู่ข้ามคำขอ ลดการยิงฐานข้อมูลซ้ำ) ─────────────────────────
const CACHE_TTL = 5 * 60 * 1000;      // รายชื่อห้อง / จำนวนนักเรียน
const URL_TTL = 30 * 60 * 1000;       // signed URL ลายเซ็น (ออกให้ 60 นาที ใช้ซ้ำ 30 นาที → เบราว์เซอร์แคชรูปได้)
let roomsCache: { at: number; rows: { id: string; name: string }[] } | null = null;
const countCache = new Map<string, { at: number; n: number }>();
const urlCache = new Map<string, { at: number; url: string }>();
/** เรียกหลังอัปโหลด/ลบลายเซ็น ถ้า storage_path เดิมถูกเขียนทับ */
export function invalidateSignedUrls() { urlCache.clear(); }

async function cachedAllRooms(service: any): Promise<{ id: string; name: string }[]> {
  if (roomsCache && Date.now() - roomsCache.at < CACHE_TTL) return roomsCache.rows;
  const { data, error } = await service.from(CLASSROOMS.table).select(`id:${CLASSROOMS.id}, name:${CLASSROOMS.name}`);
  const rows = (data ?? []) as { id: string; name: string }[];
  if (!error && rows.length) roomsCache = { at: Date.now(), rows };
  return rows;
}

type RoomGroup = { name: string; canonical: string; ids: string[]; resolved: boolean };
type StudentRow = { id: string; no: number | null; name: string };
type Measures = {
  weightIn: Record<string, number>; heightIn: Record<string, number>;
  weightBefore: Record<string, number>; heightBefore: Record<string, number>;
  weightLatest: Record<string, number>; heightLatest: Record<string, number>;
};

// ── Auth ────────────────────────────────────────────────────────────────────
export async function getActor() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient() as any;

  // ยิงพร้อมกัน: โปรไฟล์ + ห้องของฉัน + ห้องทั้งหมด (เดิมรอทีละอัน)
  const [{ data: profile }, { data: rooms }, allRooms] = await Promise.all([
    service.from("users").select("id, role, first_name, last_name, email").eq("auth_id", user.id).maybeSingle(),
    supabase.rpc("get_my_classrooms"),
    cachedAllRooms(service),
  ]);
  if (!profile) return null;
  const myEmail = String(profile.email ?? user.email ?? "").toLowerCase();
  const isProjectHead = Object.values(PROJECT_HEAD_EMAIL).some((e) => e.toLowerCase() === myEmail);

  const mine = ((rooms ?? []) as { classroom_id: string; room_name: string }[]);
  const myNames = new Set(mine.map((r) => r.room_name));
  const myRoomIds = new Set<string>(mine.map((r) => r.classroom_id));
  // ★ ครูมีสิทธิ์กับห้องพี่น้องทุกเทอมของห้องตัวเอง
  allRooms.forEach((r) => { if (myNames.has(r.name)) myRoomIds.add(r.id); });

  return {
    service,
    profile: profile as { id: string; role: string; first_name: string; last_name: string },
    email: myEmail,
    isAdmin: ADMIN_ROLES.has(profile.role) || profile.id === GROUP_HEAD_USER_ID,
    isOwner: OWNER_ROLES.has(profile.role) || isProjectHead,
    myRooms: mine.map((r) => ({ id: r.classroom_id, name: r.room_name })),
    myRoomIds,
    allRooms,
    cache: {} as {
      groups?: Map<string, RoomGroup>;
      students?: Map<string, StudentRow[]>;
      measures?: Map<string, Measures>;
    },
  };
}
export type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>;
export const canAccessRoom = (a: Actor, classroomId: string) => a.isAdmin || a.isOwner || a.myRoomIds.has(classroomId);
/** แก้ไขได้เฉพาะครูประจำชั้น (หรือ admin) */
export const canEditRoom = (a: Actor, classroomId: string) =>
  a.profile.role === "admin" || a.myRoomIds.has(classroomId);

/** รับรองรายงานได้เฉพาะหัวหน้าโครงการของประเภทนั้น (หรือ admin / role เจ้าของโครงการ) */
export const canApproveType = (a: Actor, type: MealType) =>
  a.profile.role === "admin" ||
  OWNER_ROLES.has(a.profile.role) ||
  a.email === PROJECT_HEAD_EMAIL[type].toLowerCase();

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

async function levelHolidayMap(a: Actor, roomName: string, start: string, end: string) {
  const level = (parseGrade(roomName) ?? UNKNOWN_GRADE).level;
  const out = new Map<string, string>();
  try {
    const { data } = await a.service.from("level_holidays").select("holiday_date, name, levels")
      .gte("holiday_date", start).lte("holiday_date", end);
    (data ?? []).forEach((h: any) => { if ((h.levels ?? []).includes(level)) out.set(h.holiday_date, h.name); });
  } catch { /* ยังไม่ได้สร้างตาราง */ }
  return out;
}

// ── กลุ่มห้อง (ห้องชื่อเดียวกันคนละเทอม) ─────────────────────────────────────
/** นับนักเรียนเฉพาะห้องที่ต้องใช้ตัดสิน (เดิมดึงนักเรียนทั้งโรงเรียนมานับทุกคำขอ) */
async function studentCounts(a: Actor, ids: string[]): Promise<Map<string, number>> {
  const now = Date.now();
  const out = new Map<string, number>();
  const need: string[] = [];
  for (const id of ids) {
    const c = countCache.get(id);
    if (c && now - c.at < CACHE_TTL) out.set(id, c.n); else need.push(id);
  }
  if (need.length) {
    const rows = await fetchAll<any>((f, t) =>
      a.service.from(STUDENTS.table).select("classroom_id")
        .in("classroom_id", need).is("moved_out_at", null).order(STUDENTS.id).range(f, t));
    const tmp = new Map<string, number>(need.map((id) => [id, 0]));
    rows.forEach((r) => tmp.set(r.classroom_id, (tmp.get(r.classroom_id) ?? 0) + 1));
    tmp.forEach((n, id) => { countCache.set(id, { at: now, n }); out.set(id, n); });
  }
  return out;
}

async function roomGroups(a: Actor): Promise<Map<string, RoomGroup>> {
  if (a.cache.groups) return a.cache.groups;
  const rooms = a.allRooms.length ? a.allRooms : a.myRooms;
  const groups = new Map<string, RoomGroup>();
  for (const r of rooms) {
    const g = groups.get(r.name);
    if (!g) groups.set(r.name, { name: r.name, canonical: r.id, ids: [r.id], resolved: false });
    else g.ids.push(r.id);
  }
  a.cache.groups = groups;
  return groups;
}
/** id หลัก = ห้องที่มีนักเรียนมากที่สุดในกลุ่ม (นับเฉพาะกลุ่มที่มีหลายเทอม) */
async function resolveGroup(a: Actor, g: RoomGroup): Promise<RoomGroup> {
  if (g.resolved) return g;
  if (g.ids.length > 1) {
    const counts = await studentCounts(a, g.ids);
    g.canonical = g.ids[0];
    for (const id of g.ids) if ((counts.get(id) ?? 0) > (counts.get(g.canonical) ?? 0)) g.canonical = id;
  }
  g.resolved = true;
  return g;
}
async function groupOf(a: Actor, classroomId: string): Promise<RoomGroup | null> {
  for (const g of (await roomGroups(a)).values()) if (g.ids.includes(classroomId)) return resolveGroup(a, g);
  return null;
}
/** แปลง id ใดก็ได้ของห้อง → id หลัก (กรณี URL เก่าที่ส่ง id ของเทอมอื่นมา) */
export async function canonicalRoomId(a: Actor, classroomId: string) {
  return (await groupOf(a, classroomId))?.canonical ?? classroomId;
}
export async function listClassrooms(a: Actor, all: boolean): Promise<ClassroomLite[]> {
  const groups = [...(await roomGroups(a)).values()];
  const seeAll = all || a.isAdmin || a.isOwner;
  const visible = seeAll ? groups : groups.filter((g) => g.ids.some((id) => a.myRoomIds.has(id)));
  await studentCounts(a, visible.filter((g) => g.ids.length > 1).flatMap((g) => g.ids)); // นับรวมครั้งเดียว
  const resolved = await Promise.all(visible.map((g) => resolveGroup(a, g)));
  return resolved
    .map((g) => {
      const gr = parseGrade(g.name) ?? UNKNOWN_GRADE;
      return { id: g.canonical, name: g.name, milk: milkEligible(gr), o: gr.order };
    })
    .sort((x, y) => x.o - y.o || x.name.localeCompare(y.name, "th"))
    .map(({ o, ...r }) => r);
}

async function loadStudents(a: Actor, classroomId: string): Promise<StudentRow[]> {
  const hit = a.cache.students?.get(classroomId);
  if (hit) return hit;
  const ids = (await groupOf(a, classroomId))?.ids ?? [classroomId]; // ★ นักเรียนทุกเทอมของห้องนี้
  const { data, error } = await a.service
    .from(STUDENTS.table)
    .select(`id:${STUDENTS.id}, no:${STUDENTS.no}, prefix:${STUDENTS.prefix}, first:${STUDENTS.first}, last:${STUDENTS.last}`)
    .in(STUDENTS.classroom, ids)
    .is("moved_out_at", null)
    .order(STUDENTS.no, { ascending: true });
  if (error) throw new Error(error.message);
  const rows: StudentRow[] = (data ?? []).map((s: any) => ({
    id: s.id,
    no: s.no ?? null,
    name: `${s.prefix ?? ""}${s.first ?? ""} ${s.last ?? ""}`.trim(),
  }));
  (a.cache.students ??= new Map()).set(classroomId, rows);
  return rows;
}

/**
 * น้ำหนัก/ส่วนสูง ทั้ง 3 โหมด (in = บันทึกในเดือนนี้ | before = ล่าสุดก่อนเดือนนี้ | latest = ล่าสุด ≤ สิ้นเดือน)
 * เดิมยิง 8 query ต่อกันทีละอัน → ตอนนี้ 2 query พร้อมกัน แล้วคัดในหน่วยความจำ (ผลลัพธ์เหมือนเดิม: meal_month_measures ทับ nutrition_assessments)
 */
async function loadMeasures(a: Actor, ids: string[], month: string): Promise<Measures> {
  const empty = (): Record<string, number> => ({});
  if (!ids.length) {
    return { weightIn: empty(), heightIn: empty(), weightBefore: empty(), heightBefore: empty(), weightLatest: empty(), heightLatest: empty() };
  }
  const ck = `${month}|${ids.join(",")}`;
  const hit = a.cache.measures?.get(ck);
  if (hit) return hit;

  const { start, end } = monthRange(month);
  const [nut, mm] = await Promise.all([
    fetchAll<any>((f, t) =>
      a.service.from("nutrition_assessments")
        .select("student_id, assessment_date, weight_kg, height_cm")
        .in("student_id", ids).lte("assessment_date", end)
        .order("assessment_date", { ascending: false }).order("student_id").range(f, t)),
    fetchAll<any>((f, t) =>
      a.service.from("meal_month_measures")
        .select("student_id, month, weight_kg, height_cm")
        .in("student_id", ids).lte("month", month)
        .order("month", { ascending: false }).order("student_id").range(f, t)),
  ]);

  // rows เรียงใหม่→เก่า: แถวแรกที่ผ่านเงื่อนไขและมีค่า = ค่าล่าสุดของนักเรียนคนนั้น
  const pick = (rows: any[], dateKey: string, col: string, ok: (d: string) => boolean) => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r[col] == null || r.student_id in out || !ok(String(r[dateKey]))) continue;
      out[r.student_id] = Number(r[col]);
    }
    return out;
  };
  const merged = (col: "weight_kg" | "height_cm", mode: "in" | "before" | "latest") => ({
    ...pick(nut, "assessment_date", col, (d) => mode === "in" ? d >= start && d <= end : mode === "before" ? d < start : true),
    ...pick(mm, "month", col, (d) => mode === "in" ? d === month : mode === "before" ? d < month : true),
  });
  const result: Measures = {
    weightIn: merged("weight_kg", "in"), heightIn: merged("height_cm", "in"),
    weightBefore: merged("weight_kg", "before"), heightBefore: merged("height_cm", "before"),
    weightLatest: merged("weight_kg", "latest"), heightLatest: merged("height_cm", "latest"),
  };
  (a.cache.measures ??= new Map()).set(ck, result);
  return result;
}

/** signed URL ใช้ซ้ำได้ 30 นาที → URL เดิมทุกครั้ง เบราว์เซอร์จึงแคชรูปลายเซ็นได้ และไม่ต้องเรียก Storage ทุกครั้ง */
async function signedUrls(a: Actor, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths.filter(Boolean))) {
    const c = urlCache.get(p);
    if (c && now - c.at < URL_TTL) out[p] = c.url; else need.push(p);
  }
  if (need.length) {
    const { data } = await a.service.storage.from(BUCKET).createSignedUrls(need, 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) { out[d.path] = d.signedUrl; urlCache.set(d.path, { at: now, url: d.signedUrl }); }
  }
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

/** ครูที่ปรึกษา: classrooms.homeroom_teacher_id และ homeroom_teacher_2_id (มีกี่คนก็สร้างช่องลงชื่อเท่านั้น) */
async function homeroomTeacherIds(a: Actor, classroomId: string): Promise<string[]> {
  const ids = (await groupOf(a, classroomId))?.ids ?? [classroomId];
  for (const pk of [CLASSROOMS.id, "classroom_id"]) {
    const { data, error } = await a.service
      .from(CLASSROOMS.table)
      .select("homeroom_teacher_id, homeroom_teacher_2_id")
      .in(pk, ids);
    if (error || !data?.length) continue;
    return [...new Set(data.flatMap((d: any) => [d.homeroom_teacher_id, d.homeroom_teacher_2_id]).filter(Boolean) as string[])];
  }
  return [];
}

async function loadSigners(a: Actor, classroomId: string, type: MealType): Promise<SheetData["signers"]> {
  const [teacherIds, { data: headRow }] = await Promise.all([
    homeroomTeacherIds(a, classroomId),
    a.service.from("users").select("id").ilike("email", PROJECT_HEAD_EMAIL[type]).maybeSingle(),
  ]);
  const headId: string = headRow?.id ?? "";
  const want = [...teacherIds, headId, GROUP_HEAD_USER_ID].filter(Boolean);
  let res = await a.service.from("users").select("id, title, first_name, last_name, signature_url").in("id", want);
  if (res.error) res = await a.service.from("users").select("id, first_name, last_name, signature_url").in("id", want);
  const users = (res.data ?? []) as any[];
  // ถ้า homeroom_teacher_id เก็บเป็น auth_id ให้ลองหาจาก users.auth_id เพิ่ม
  const missing = teacherIds.filter((id) => !users.some((u) => u.id === id));
  if (missing.length) {
    let r2 = await a.service.from("users").select("id, auth_id, title, first_name, last_name, signature_url").in("auth_id", missing);
    if (r2.error) r2 = await a.service.from("users").select("id, auth_id, first_name, last_name, signature_url").in("auth_id", missing);
    for (const u of (r2.data ?? []) as any[]) users.push({ ...u, id: u.auth_id });
  }
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
  return [...teachers, person(headId, PROJECT_HEAD_LABEL[type]), person(GROUP_HEAD_USER_ID, GROUP_HEAD_LABEL)];
}

// ── Sync: ดึงจากเช็คชื่อโฮมรูม → meal_records + จัดแจกเพิ่ม ───────────────────
export async function syncMonth(
  a: Actor, classroomIdIn: string, month: string, type: MealType,
  override?: { studentId: string; date: string; status: CellStatus | null },
  opts?: { clearManual?: boolean },
) {
  const classroomId = await canonicalRoomId(a, classroomIdIn);
  const s = a.service;
  const { data: rep } = await s.from("meal_month_reports").select("teacher_confirmed_at")
    .eq("classroom_id", classroomId).eq("month", month).eq("meal_type", type).maybeSingle();
  if (rep?.teacher_confirmed_at) return { locked: true };

  if (opts?.clearManual) {
    const r = monthRange(month);
    await s.from("meal_records").delete()
      .eq("classroom_id", classroomId).eq("meal_type", type).eq("source", "manual")
      .gte("record_date", r.start).lte("record_date", r.end);
  }
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
  const idSet = new Set(ids);
  const { start, end } = monthRange(month);
  const last = end < todayBkk() ? end : todayBkk();
  const roomName = (await groupOf(a, classroomId))?.name ?? "";

  // ค้นด้วยรายชื่อนักเรียนในห้อง (ไม่พึ่ง classroom_id ในตารางเช็คชื่อ) และลองตารางสำรองถ้าตารางแรกว่าง
  const fetchAttendance = async () => {
    let att: any[] = [];
    let source = ATTENDANCE.table;
    for (const A of [ATTENDANCE, ATTENDANCE_ALT]) {
      if (!ids.length) break;
      att = await fetchAll<any>((f, t) =>
        s.from(A.table)
          .select(`student:${A.student}, date:${A.date}, status:${A.status}`)
          .in(A.student, ids)
          .gte(A.date, start).lte(A.date, end)
          .order(A.date).order(A.student).order(A.ts, { ascending: true }).range(f, t));
      source = A.table;
      if (att.length) break;
    }
    return { att, source };
  };

  // ข้อมูลที่ไม่ขึ้นต่อกัน → ดึงพร้อมกัน (เดิมดึงทีละอัน)
  const [{ att, source }, existing, holidays, measures] = await Promise.all([
    fetchAttendance(),
    fetchAll<any>((f, t) =>
      s.from("meal_records").select("id, student_id, record_date, status, extra_portions, source")
        .eq("classroom_id", classroomId).eq("meal_type", type)
        .gte("record_date", start).lte("record_date", end)
        .order("record_date").order("student_id").range(f, t)),
    levelHolidayMap(a, roomName, start, end),
    loadMeasures(a, ids, month),
  ]);

  const unmapped = new Set<string>();
  const statusCounts: Record<string, number> = {};

  // วัน → นักเรียน → สถานะ
  const byDate = new Map<string, Map<string, CellStatus>>();
  const put = (date: string, sid: string, st: CellStatus) => {
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date)!.set(sid, st);
  };
  for (const r of att) {
    if (r.date > last || !idSet.has(r.student)) continue;
    statusCounts[String(r.status)] = (statusCounts[String(r.status)] ?? 0) + 1;
    const st = mapAttendance(r.status);
    if (st) put(r.date, r.student, st); // แถวหลังสุด (ใหม่สุด) ทับแถวก่อนหน้า
    else unmapped.add(String(r.status));
  }
  holidays.forEach((_, d) => byDate.delete(d));
  // วันที่มีการเช็คชื่อจริง: นักเรียนที่ไม่มีแถวในวันนั้น = "มา" (ตรงกับหน้าเช็คชื่อที่ตั้งค่าเริ่มต้นเป็นมา)
  const attDates = [...byDate.keys()];
  const fromAtt = new Map<string, CellStatus>();
  byDate.forEach((m, d) => m.forEach((st, sid) => fromAtt.set(`${sid}|${d}`, st)));

  const manualKeys = new Set<string>();
  for (const r of existing) {
    const key = `${r.student_id}|${r.record_date}`;
    if (r.source !== "manual" || !idSet.has(r.student_id)) continue;
    if (fromAtt.get(key) === r.status) continue; // ค่าที่แก้เองตรงกับเช็คชื่อแล้ว → ใช้ค่าอัตโนมัติ
    put(r.record_date, r.student_id, r.status);
    manualKeys.add(key);
  }
  for (const d of attDates) for (const sid of ids) if (!byDate.get(d)!.has(sid)) put(d, sid, "present");

  const days: DayInput[] = [...byDate.entries()].map(([date, m]) => ({
    date, students: [...m.entries()].map(([id, status]) => ({ id, status })),
  }));
  const metric = type === "lunch" ? measures.weightLatest : measures.heightLatest;
  const plan = planExtras(days, metric, `${classroomId}|${type}|${month}`);

  // เขียนเฉพาะแถวที่ "เปลี่ยนจริง" (เดิม upsert ทุกแถวทุกครั้งที่เปิดหน้า ≈ นักเรียน × วัน)
  const existingMap = new Map<string, any>(existing.map((r) => [`${r.student_id}|${r.record_date}`, r]));
  const now = new Date().toISOString();
  const changed: any[] = [];
  const keep = new Set<string>();
  for (const d of days) {
    for (const st of d.students) {
      const key = `${st.id}|${d.date}`;
      keep.add(key);
      const extra = plan[d.date]?.[st.id] ?? 0;
      const source = manualKeys.has(key) ? "manual" : "auto";
      const ex = existingMap.get(key);
      if (ex && ex.status === st.status && (ex.extra_portions ?? 0) === extra && ex.source === source) continue;
      changed.push({
        classroom_id: classroomId, student_id: st.id, record_date: d.date, meal_type: type,
        status: st.status, extra_portions: extra, source, updated_at: now,
      });
    }
  }
  const stale = existing.filter((r) => r.source === "auto" && !keep.has(`${r.student_id}|${r.record_date}`)).map((r) => r.id);

  const writes = await Promise.all([
    ...chunk(changed, 500).map((part) => s.from("meal_records").upsert(part, { onConflict: "student_id,record_date,meal_type" })),
    ...chunk(stale, 200).map((part) => s.from("meal_records").delete().in("id", part)),
  ]);
  for (const w of writes) if (w?.error) throw new Error(w.error.message);

  return { locked: false, days: days.length, diag: { source, fetched: att.length, unmapped: [...unmapped], statusCounts } };
}

// ── Sheet: ข้อมูลตารางรายเดือนของห้องเดียว ─────────────────────────────────────
export async function buildSheet(a: Actor, classroomIdIn: string, month: string, type: MealType): Promise<SheetData> {
  const classroomId = await canonicalRoomId(a, classroomIdIn);
  const s = a.service;
  const group = await groupOf(a, classroomId);
  if (!group) throw new Error("ไม่พบห้องเรียน");
  const classroom: ClassroomLite = {
    id: group.canonical, name: group.name, milk: milkEligible(parseGrade(group.name) ?? UNKNOWN_GRADE),
  };
  const { start, end } = monthRange(month);

  // ── ขั้นที่ 1: ยิงทุกอย่างที่ไม่ขึ้นต่อกันพร้อมกัน ──
  const studentsP = loadStudents(a, classroomId);
  const recordsP = fetchAll<any>((f, t) =>
    s.from("meal_records").select("student_id, record_date, status, extra_portions, source")
      .eq("classroom_id", classroomId).eq("meal_type", type)
      .gte("record_date", start).lte("record_date", end)
      .order("record_date").order("student_id").range(f, t));
  const repP = s.from("meal_month_reports").select("*")
    .eq("classroom_id", classroomId).eq("month", month).eq("meal_type", type).maybeSingle();
  const signersP = loadSigners(a, classroomId, type);
  const yearP = academicYearName(a, dateOf(month, 15));
  const holidaysP = (async () => {
    const custom = new Map<string, string>();
    try {
      const { data: hol } = await s.from("school_holidays").select("holiday_date, name").gte("holiday_date", start).lte("holiday_date", end);
      (hol ?? []).forEach((h: any) => custom.set(h.holiday_date, h.name));
    } catch { /* ยังไม่ได้สร้างตาราง school_holidays */ }
    (await levelHolidayMap(a, classroom.name, start, end)).forEach((name, d) => custom.set(d, name));
    return custom;
  })();
  const measuresP = studentsP.then((st) => loadMeasures(a, st.map((x) => x.id), month));
  const sigRowsP = studentsP.then(async (st) => {
    const ids = st.map((x) => x.id);
    if (!ids.length) return [] as any[];
    const { data } = await s.from("meal_signatures").select("subject_id, storage_path").eq("subject_type", "student").in("subject_id", ids);
    return (data ?? []) as any[];
  });
  const studentUrlsP = sigRowsP.then((rows) => signedUrls(a, rows.map((r) => r.storage_path)));

  const [students, records, repRes, signers, academicYear, custom, measures, sigRows, studentUrls] = await Promise.all([
    studentsP, recordsP, repP, signersP, yearP, holidaysP, measuresP, sigRowsP, studentUrlsP,
  ]);
  const rep = repRes.data as any;

  // ── ขั้นที่ 2: ผู้ใช้ที่เกี่ยวข้อง (ครูที่ยืนยัน / เจ้าของโครงการ / ตัวเอง) + ลายมือชื่อ ──
  const userIds = [rep?.teacher_confirmed_by, rep?.owner_approved_by, a.profile.id].filter(Boolean) as string[];
  const [{ data: users }, { data: userSigs }] = await Promise.all([
    s.from("users").select("id, first_name, last_name").in("id", userIds),
    s.from("meal_signatures").select("subject_id, storage_path").eq("subject_type", "user").in("subject_id", userIds),
  ]);
  const userUrls = await signedUrls(a, (userSigs ?? []).map((r: any) => r.storage_path));
  const urls = { ...studentUrls, ...userUrls };
  const uName = (id?: string | null) => {
    const u = (users ?? []).find((x: any) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : null;
  };
  const sigOf = (list: any[] | null, id?: string | null) => {
    const r = (list ?? []).find((x) => x.subject_id === id);
    return r ? urls[r.storage_path] ?? null : null;
  };
  const sigByStudent = new Map<string, any>(sigRows.map((r: any) => [r.subject_id, r]));

  const schoolDaySet = new Set<number>();
  const dayTotals: SheetData["dayTotals"] = {};
  const rowsByStudent = new Map<string, SheetStudent>(
    students.map((st) => [st.id, {
      ...st, cells: {}, present: 0, leave: 0, absent: 0, extra: 0,
      weight: measures.weightIn[st.id] ?? null,
      height: measures.heightIn[st.id] ?? null,
      prevWeight: measures.weightBefore[st.id] ?? null,
      prevHeight: measures.heightBefore[st.id] ?? null,
      signatureUrl: (() => { const r = sigByStudent.get(st.id); return r ? urls[r.storage_path] ?? null : null; })(),
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

  // ป้ายวันหยุด/เสาร์-อาทิตย์ (เฉพาะวันที่ไม่มีข้อมูลเช็คชื่อ = ไม่ใช่วันเรียน)
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
      id: a.profile.id, name: `${a.profile.first_name} ${a.profile.last_name}`,
      isOwner: canApproveType(a, type),
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