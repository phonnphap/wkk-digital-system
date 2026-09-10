"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, Search, GraduationCap, ArrowLeft, Loader2, Users, CheckCircle2, Clock, XCircle } from "lucide-react";

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

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [onLeaveToday, setOnLeaveToday] = useState<Set<string>>(new Set());
  const [attendanceToday, setAttendanceToday] = useState<Map<string, AttendanceInfo>>(new Map());

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");

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
    const today = new Date().toISOString().split("T")[0];

    const [{ data: teacherRows }, { data: leaves }, { data: attendanceRows }] = await Promise.all([
      supabase
        .from("users")
        .select(
  `id, title, first_name, last_name, role, email, position, avatar_url, subject_group,
   department:departments!users_department_id_fkey(name),
   grade_level:grade_levels!users_grade_level_id_fkey(name)`
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

  const gradeLevels = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => t.grade_level?.name && set.add(t.grade_level.name));
    return Array.from(set).sort();
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers
      .filter((t) => {
        const matchesGrade = gradeFilter === "all" || t.grade_level?.name === gradeFilter;
        const fullName = `${t.first_name} ${t.last_name}`.toLowerCase();
        const matchesSearch = !q || fullName.includes(q) || (t.position ?? "").toLowerCase().includes(q);
        return matchesGrade && matchesSearch;
      })
      .sort(compareTeacherNames);
  }, [teachers, search, gradeFilter]);

  const stats = useMemo(() => {
    const total = teachers.length;
    const leaveCount = teachers.filter((t) => onLeaveToday.has(t.id)).length;
    return { total, presentCount: total - leaveCount };
  }, [teachers, onLeaveToday]);

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

        {/* สรุปภาพรวม */}
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

        {/* ตัวกรอง */}
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

        {/* ตารางรายชื่อครู */}
        {loading ? (
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
        )}
      </main>
    </div>
  );
}