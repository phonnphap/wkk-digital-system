// app/admin/students-overview/page.tsx
//
// ⚠️ สมมติฐานเรื่องฐานข้อมูล (โปรดตรวจสอบ/ปรับให้ตรงกับสคีมาจริงของคุณ):
//   - ตาราง "classrooms": classroom_id, room_name (ระดับชั้นแยกจาก room_name ด้วย "/" เช่น "ป.1/2" -> "ป.1")
//   - ตาราง "students": id, classroom_id, student_code, prefix, first_name, last_name, gender
//     (ถ้าชื่อคอลัมน์จริงต่างจากนี้ ให้แก้ selectStr ในฟังก์ชัน fetchAllRows ด้านล่าง และ type StudentRow)
//   - role admin/director/deputy_director มีสิทธิ์ SELECT ทุกแถวผ่าน RLS policy (เหมือนหน้าสถิติการมาเรียน)
//
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Users, Search, Loader2, X } from "lucide-react";

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
          <p className="mt-1 text-sm text-slate-500">ดูรายชื่อนักเรียนทุกห้อง หรือกรองดูทีละระดับชั้น/ห้องเรียน</p>
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
                        <th className="px-4 py-3 text-left font-semibold">ชื่อ-สกุล</th>
                        <th className="px-4 py-3 text-left font-semibold">เพศ</th>
                        <th className="px-4 py-3 text-left font-semibold">ห้อง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s) => (
                        <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.student_code ?? "-"}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700">
                            {(s.prefix ?? "") + (s.first_name ?? "-")} {s.last_name ?? ""}
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
    </div>
  );
}