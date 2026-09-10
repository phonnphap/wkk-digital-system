"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, Search, GraduationCap, ArrowLeft, Loader2, Users, CalendarDays, BarChart3 } from "lucide-react";

const ADMIN_ROLES = ["director", "deputy_director", "admin"];
const ADMIN_EMAILS = ["sumalin@khienkhet.ac.th"];
function isAdminViewer(role: string | null | undefined, email: string | null | undefined): boolean {
  if (role && ADMIN_ROLES.includes(role)) return true;
  if (email && ADMIN_EMAILS.includes(email.trim().toLowerCase())) return true;
  return false;
}

type TeacherRow = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  role: string | null;
  position: string | null;
  avatar_url: string | null;
  grade_level: string | null;
  subject_group: string | null;
  department: { name: string } | null;
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

export default function AdminTeachersListPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [onLeaveToday, setOnLeaveToday] = useState<Set<string>>(new Set());

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

    const [{ data: teacherRows }, { data: leaves }] = await Promise.all([
      supabase
        .from("users")
        .select("id, title, first_name, last_name, role, position, avatar_url, grade_level, subject_group, department:departments(name)")
        .order("first_name", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("user_id")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),
    ]);

    setTeachers((teacherRows as unknown as TeacherRow[]) || []);
    setOnLeaveToday(new Set((leaves || []).map((r: any) => r.user_id)));
    setLoading(false);
  }

  const gradeLevels = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => t.grade_level && set.add(t.grade_level));
    return Array.from(set).sort();
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      const matchesGrade = gradeFilter === "all" || t.grade_level === gradeFilter;
      const fullName = `${t.first_name} ${t.last_name}`.toLowerCase();
      const matchesSearch = !q || fullName.includes(q) || (t.position ?? "").toLowerCase().includes(q);
      return matchesGrade && matchesSearch;
    });
  }, [teachers, search, gradeFilter]);

  const stats = useMemo(() => {
    const total = teachers.length;
    const leaveCount = teachers.filter((t) => onLeaveToday.has(t.id)).length;
    return { total, leaveCount, presentCount: total - leaveCount };
  }, [teachers, onLeaveToday]);

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

        {/* สรุปภาพรวม + ปุ่มดูกราฟ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <button
            onClick={() => router.push("/admin/attendance-overview")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-blue-300 hover:shadow-md transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> ครูลาวันนี้ {stats.leaveCount} คน
              </p>
              <p className="text-sm font-black text-blue-600">📊 ดูสรุปภาพรวมทั้งโรงเรียน →</p>
            </div>
          </button>
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

        {/* รายชื่อครู */}
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : filteredTeachers.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">ไม่พบครูที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeachers.map((t) => {
              const onLeave = onLeaveToday.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/admin/teachers/${t.id}`)}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center overflow-hidden shrink-0">
                    {t.avatar_url ? <img src={t.avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-slate-800 truncate">
                      {t.title}{t.first_name} {t.last_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{t.position || ROLE_LABEL[t.role ?? ""] || "—"}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.grade_level && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                          <GraduationCap className="w-3 h-3" /> {t.grade_level}
                        </span>
                      )}
                      {onLeave && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">🔵 ลาวันนี้</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}