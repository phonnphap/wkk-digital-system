// app/admin/students-overview/page.tsx
//
// ⚠️ สมมติฐานเรื่องฐานข้อมูล (โปรดตรวจสอบ/ปรับให้ตรงกับสคีมาจริงของคุณ):
//   - ตาราง "classrooms": classroom_id, room_name (ระดับชั้นแยกจาก room_name ด้วย "/" เช่น "ป.1/2" -> "ป.1")
//   - ตาราง "students": id, classroom_id, student_code, prefix, first_name, last_name, gender
//     (ถ้าชื่อคอลัมน์จริงต่างจากนี้ ให้แก้ selectStr ในฟังก์ชัน fetchAllRows ด้านล่าง และ type StudentRow)
//   - role admin/director/deputy_director มีสิทธิ์ SELECT ทุกแถวผ่าน RLS policy (เหมือนหน้าสถิติการมาเรียน)
//
//   ★ StudentDetailModal ดึงข้อมูล "ทุกคอลัมน์" ของนักเรียนคนนั้นด้วย select("*") แล้ว map เป็นภาษาไทย
//     ผ่านตัวแปร FIELD_LABELS ด้านล่าง — ถ้าตาราง students มีคอลัมน์อื่นที่อยากให้แสดงชื่อไทยสวย ๆ
//     (เช่น ข้อมูลผู้ปกครอง / ที่อยู่ / วันเกิด) ให้เพิ่ม key เข้าไปใน FIELD_LABELS ให้ตรงกับชื่อคอลัมน์จริง
//     คอลัมน์ไหนไม่รู้จักจะยังคงถูกแสดงต่อท้ายอัตโนมัติ (กันข้อมูลตกหล่น) แต่ label จะเป็นชื่อคอลัมน์ดิบ
//
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Users, Search, Loader2, X, User } from "lucide-react";

const supabase = createClient();

const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";
const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);

/* ------------------------------------------------------------------ */

function extractGradeLevel(roomName: string): string {
  const idx = roomName.indexOf("/");
  return idx === -1 ? roomName : roomName.slice(0, idx);
}

const GRADE_PREFIX_ORDER: Record<string, number> = { "อ": 0, "ป": 1, "ม": 2 };
function parseGrade(grade: string): { prefixRank: number; num: number } {
  const match = grade.match(/^([ก-๙]+)\.?(\d+)?/);
  const prefix = match?.[1]?.charAt(0) ?? "";
  const num = match?.[2] ? Number(match[2]) : 0;
  return { prefixRank: GRADE_PREFIX_ORDER[prefix] ?? 99, num };
}
function gradeSort(a: string, b: string) {
  const pa = parseGrade(a);
  const pb = parseGrade(b);
  if (pa.prefixRank !== pb.prefixRank) return pa.prefixRank - pb.prefixRank;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return a.localeCompare(b, "th", { numeric: true });
}

// ★ Supabase/PostgREST จำกัดผลลัพธ์ query ละ 1,000 แถวโดยดีฟอลต์ — วนดึงทีละหน้าจนครบ
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
type StudentRow = {
  id: string;
  classroom_id: string;
  student_code: string | null;
  prefix: string | null;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
};

const GENDER_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง" };

// ★ คอลัมน์ที่ไม่ต้องแสดงในหน้ารายละเอียด (เป็น field เชิงเทคนิค ไม่ใช่ข้อมูลที่ครูอยากดู)
const HIDE_IN_DETAIL = new Set(["id", "classroom_id", "created_at", "updated_at", "auth_id"]);

// ★ map ชื่อคอลัมน์ -> label ภาษาไทย ปรับ/เพิ่มให้ตรงกับสคีมาจริงได้ตามต้องการ
const FIELD_LABELS: Record<string, string> = {
  student_code: "รหัสนักเรียน",
  prefix: "คำนำหน้า",
  first_name: "ชื่อ",
  last_name: "นามสกุล",
  nick_name: "ชื่อเล่น",
  nickname: "ชื่อเล่น",
  gender: "เพศ",
  birth_date: "วันเกิด",
  citizen_id: "เลขบัตรประชาชน",
  address: "ที่อยู่",
  phone: "เบอร์โทร",
  parent_name: "ชื่อผู้ปกครอง",
  parent_phone: "เบอร์โทรผู้ปกครอง",
  father_name: "ชื่อบิดา",
  mother_name: "ชื่อมารดา",
  guardian_name: "ชื่อผู้ปกครอง (กรณีไม่ใช่บิดามารดา)",
  blood_type: "หมู่เลือด",
  congenital_disease: "โรคประจำตัว",
  allergy: "ประวัติแพ้ยา/อาหาร",
  seat_number: "เลขที่",
  avatar_url: "รูปประจำตัว",
  photo_url: "รูปประจำตัว",
  weight: "น้ำหนัก (กก.)",
  height: "ส่วนสูง (ซม.)",
};

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "gender" && typeof value === "string") return GENDER_LABEL[value] ?? value;
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  return String(value);
}

/* ------------------------------------------------------------------ */
/* Student detail modal — READ ONLY (แอดมินดูได้ แก้ไขไม่ได้)             */
/* ------------------------------------------------------------------ */

function StudentDetailModal({
  studentId,
  roomName,
  onClose,
}: {
  studentId: string;
  roomName: string;
  onClose: () => void;
}) {
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg("");
    supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setErrorMsg("โหลดข้อมูลนักเรียนไม่สำเร็จ");
        } else {
          setRow(data as Record<string, unknown>);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [studentId]);

  // แยก field ที่รู้จัก (มี label ไทย) ออกจาก field ที่ไม่รู้จัก (แสดงชื่อคอลัมน์ดิบต่อท้าย)
  const { known, unknown } = useMemo(() => {
    if (!row) return { known: [] as [string, unknown][], unknown: [] as [string, unknown][] };
    const knownRows: [string, unknown][] = [];
    const unknownRows: [string, unknown][] = [];
    Object.entries(row).forEach(([key, value]) => {
      if (HIDE_IN_DETAIL.has(key)) return;
      if (FIELD_LABELS[key]) knownRows.push([key, value]);
      else unknownRows.push([key, value]);
    });
    // เรียง known ตามลำดับที่กำหนดใน FIELD_LABELS เพื่อให้หน้าตาสม่ำเสมอ
    const order = Object.keys(FIELD_LABELS);
    knownRows.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    return { known: knownRows, unknown: unknownRows };
  }, [row]);

  const displayName = row
    ? `${(row.prefix as string) ?? ""}${(row.first_name as string) ?? ""} ${(row.last_name as string) ?? ""}`.trim()
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-black text-slate-800">{displayName || "รายละเอียดนักเรียน"}</p>
              <p className="text-xs font-semibold text-slate-400">ห้อง {roomName}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* แถบเตือนว่าดูได้อย่างเดียว */}
        <div className="mx-6 mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 shrink-0">
          🔒 โหมดดูข้อมูลเท่านั้น — แก้ไขข้อมูลนักเรียนได้ที่หน้าครูประจำชั้นของห้องนั้น
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
          ) : errorMsg ? (
            <p className="py-10 text-center text-sm text-rose-500">{errorMsg}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {known.map(([key, value]) => (
                  <div key={key} className={key === "address" ? "col-span-2" : ""}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{FIELD_LABELS[key]}</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-700 break-words">{formatFieldValue(key, value)}</p>
                  </div>
                ))}
              </div>

              {unknown.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-300">ข้อมูลเพิ่มเติม</p>
                  <div className="grid grid-cols-2 gap-3">
                    {unknown.map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[11px] font-bold text-slate-300">{key}</p>
                        <p className="mt-0.5 text-sm font-medium text-slate-500 break-words">{formatFieldValue(key, value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3 shrink-0 flex justify-end">
          <button onClick={onClose} className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function StudentsOverviewPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedGrade, setSelectedGrade] = useState<string>("__all__");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("__all__");
  const [search, setSearch] = useState("");

  // ★ นักเรียนที่กำลังเปิดดูรายละเอียด (read-only modal)
  const [viewingStudent, setViewingStudent] = useState<StudentRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("users").select("role").eq("auth_id", authUser.id).maybeSingle();
      if (profile?.role && ADMIN_ROLES.has(profile.role)) setAllowed(true);
      else router.push(HOMEROOM_PATH);
      setCheckingAuth(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    setErrorMsg("");
    (async () => {
      const [classroomsRes, studentsRes] = await Promise.all([
        supabase.from("classrooms").select("id, room_name").order("room_name"),
        fetchAllRows<{
          id: string; classroom_id: string; student_code: string | null;
          prefix: string | null; first_name: string | null; last_name: string | null; gender: string | null;
        }>("students", "id, classroom_id, student_code, prefix, first_name, last_name, gender"),
      ]);

      if (classroomsRes.error || studentsRes.error) {
        console.error(classroomsRes.error || studentsRes.error);
        setErrorMsg(
          "โหลดข้อมูลไม่สำเร็จ — อาจเป็นเพราะชื่อตาราง/คอลัมน์ไม่ตรงกับระบบจริง หรือ RLS policy ยังไม่อนุญาตให้ role นี้เห็นข้อมูลทุกห้อง กรุณาตรวจสอบคอมเมนต์ด้านบนของไฟล์นี้"
        );
        setLoading(false);
        return;
      }

      const cls = ((classroomsRes.data ?? []) as { id: string; room_name: string }[]).map((c) => ({
        classroom_id: c.id, room_name: c.room_name,
      }));
      setClassrooms(cls);
      setStudents((studentsRes.data ?? []) as StudentRow[]);
      setLoading(false);
    })();
  }, [allowed]);

  const classroomGrade = useMemo(
    () => new Map(classrooms.map((c) => [c.classroom_id, extractGradeLevel(c.room_name)])),
    [classrooms]
  );
  const classroomName = useMemo(
    () => new Map(classrooms.map((c) => [c.classroom_id, c.room_name])),
    [classrooms]
  );
  const grades = useMemo(
    () => Array.from(new Set(classrooms.map((c) => extractGradeLevel(c.room_name)))).sort(gradeSort),
    [classrooms]
  );
  const classroomsInSelectedGrade = useMemo(
    () =>
      classrooms
        .filter((c) => selectedGrade === "__all__" || extractGradeLevel(c.room_name) === selectedGrade)
        .sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true })),
    [classrooms, selectedGrade]
  );

  // เปลี่ยนระดับชั้นแล้วรีเซ็ตห้องที่เลือกไว้ ถ้าห้องเดิมไม่อยู่ในระดับชั้นใหม่
  useEffect(() => {
    if (selectedClassroom === "__all__") return;
    const stillValid = classroomsInSelectedGrade.some((c) => c.classroom_id === selectedClassroom);
    if (!stillValid) setSelectedClassroom("__all__");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => {
        if (selectedClassroom !== "__all__") return s.classroom_id === selectedClassroom;
        if (selectedGrade !== "__all__") return classroomGrade.get(s.classroom_id) === selectedGrade;
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        const fullName = `${s.prefix ?? ""}${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase();
        const code = (s.student_code ?? "").toLowerCase();
        return fullName.includes(q) || code.includes(q);
      })
      .sort((a, b) => {
        const roomA = classroomName.get(a.classroom_id) ?? "";
        const roomB = classroomName.get(b.classroom_id) ?? "";
        if (roomA !== roomB) return roomA.localeCompare(roomB, "th", { numeric: true });
        return (a.first_name ?? "").localeCompare(b.first_name ?? "", "th");
      });
  }, [students, selectedClassroom, selectedGrade, search, classroomGrade, classroomName]);

  const genderCounts = useMemo(() => {
    const c = { male: 0, female: 0, other: 0 };
    filteredStudents.forEach((s) => {
      if (s.gender === "male") c.male += 1;
      else if (s.gender === "female") c.female += 1;
      else c.other += 1;
    });
    return c;
  }, [filteredStudents]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!allowed) return null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-blue-600 hover:shadow-md">
            <Home className="h-4.5 w-4.5" />
          </button>
          <button onClick={() => router.push(HOMEROOM_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-blue-600 hover:shadow-md">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> สำหรับผู้ดูแลระบบ
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
            ทะเบียนนักเรียนทั้งโรงเรียน
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            ดูรายชื่อนักเรียนทุกห้อง หรือกรองดูทีละระดับชั้น/ห้องเรียน — คลิกชื่อเพื่อดูรายละเอียด (ดูได้อย่างเดียว)
          </p>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            ⚠️ {errorMsg}
          </div>
        )}

        {!errorMsg && (
          <>
            {/* ตัวกรอง */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
              >
                <option value="__all__">ทุกระดับชั้น</option>
                {grades.map((g) => (<option key={g} value={g}>ระดับ {g}</option>))}
              </select>

              <select
                value={selectedClassroom}
                onChange={(e) => setSelectedClassroom(e.target.value)}
                className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
              >
                <option value="__all__">ทุกห้องเรียน</option>
                {classroomsInSelectedGrade.map((c) => (
                  <option key={c.classroom_id} value={c.classroom_id}>ห้อง {c.room_name}</option>
                ))}
              </select>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ/รหัสนักเรียน..."
                  className="w-64 rounded-xl border-2 border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-slate-700 placeholder:text-slate-400"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* สรุปจำนวน */}
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">
                ทั้งหมด {filteredStudents.length} คน
              </span>
              <span className="rounded-full bg-blue-50 px-4 py-1.5 text-xs font-bold text-blue-700">
                👦 ชาย {genderCounts.male} คน
              </span>
              <span className="rounded-full bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-700">
                👧 หญิง {genderCounts.female} คน
              </span>
            </div>

            {/* ตารางรายชื่อ */}
            <div className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              {loading ? (
                <p className="py-16 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
              ) : filteredStudents.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">ไม่พบนักเรียนตามเงื่อนไขที่เลือก</p>
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-xs text-slate-500">
                        <th className="px-4 py-3 text-left font-semibold">รหัสนักเรียน</th>
                        <th className="px-4 py-3 text-left font-semibold">คำนำหน้า</th>
                        <th className="px-4 py-3 text-left font-semibold">ชื่อ-สกุล</th>
                        <th className="px-4 py-3 text-left font-semibold">เพศ</th>
                        <th className="px-4 py-3 text-left font-semibold">ห้อง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s) => (
                        <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.student_code ?? "-"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{s.prefix ?? "-"}</td>
                          <td className="px-4 py-2.5">
                            {/* ★ กดชื่อเพื่อเปิด modal ดูรายละเอียดแบบ read-only */}
                            <button
                              onClick={() => setViewingStudent(s)}
                              className="font-semibold text-slate-700 hover:text-blue-600 hover:underline text-left"
                            >
                              {(s.first_name ?? "-")} {s.last_name ?? ""}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">{s.gender ? GENDER_LABEL[s.gender] ?? s.gender : "-"}</td>
                          <td className="px-4 py-2.5 font-semibold text-blue-700">ห้อง {classroomName.get(s.classroom_id) ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal รายละเอียดนักเรียน — read-only */}
      {viewingStudent && (
        <StudentDetailModal
          studentId={viewingStudent.id}
          roomName={classroomName.get(viewingStudent.classroom_id) ?? "-"}
          onClose={() => setViewingStudent(null)}
        />
      )}
    </div>
  );
}