"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, User, CalendarDays, Loader2 } from "lucide-react";

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  subject_group: string | null;
  grade_level: string | null;
  avatar_url: string | null;
  checked_in_today: boolean;
  on_leave_today: boolean;
};

export default function AdminTeachersOverviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    const { data: teachers } = await supabase
      .from("users")
      .select("id, first_name, last_name, subject_group, grade_level, avatar_url")
      .neq("role", "admin")
      .order("first_name");

    const { data: leaveToday } = await supabase
      .from("leave_requests")
      .select("user_id")
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today);
    const onLeaveIds = new Set((leaveToday || []).map((r: any) => r.user_id));

    // ── ปรับให้ตรงกับตารางลงเวลาจริงของระบบ (ผูกกับ /face-scan) ──
    let checkedInIds = new Set<string>();
    try {
      const { data: attendanceToday } = await supabase
        .from("staff_attendance")
        .select("user_id")
        .eq("attendance_date", today);
      checkedInIds = new Set((attendanceToday || []).map((r: any) => r.user_id));
    } catch {
      // ตาราง staff_attendance ยังไม่มี — ข้ามไปก่อน ใส่ชื่อตารางจริงเมื่อพร้อม
    }

    setRows((teachers || []).map((t: any) => ({
      ...t,
      on_leave_today: onLeaveIds.has(t.id),
      checked_in_today: checkedInIds.has(t.id),
    })));
    setLoading(false);
  }

  const subjectGroups = useMemo(() => Array.from(new Set(rows.map(r => r.subject_group).filter(Boolean))) as string[], [rows]);
  const gradeLevels = useMemo(() => Array.from(new Set(rows.map(r => r.grade_level).filter(Boolean))) as string[], [rows]);

  const filtered = rows.filter(r => {
    const name = `${r.first_name} ${r.last_name}`.toLowerCase();
    if (q && !name.includes(q.toLowerCase())) return false;
    if (subjectFilter !== "all" && r.subject_group !== subjectFilter) return false;
    if (gradeFilter !== "all" && r.grade_level !== gradeFilter) return false;
    return true;
  });

  const notCheckedInCount = filtered.filter(r => !r.checked_in_today && !r.on_leave_today).length;
  const onLeaveCount = filtered.filter(r => r.on_leave_today).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <main className="w-full p-4 md:p-8 lg:p-10 space-y-6 max-w-6xl mx-auto">
        <div className="text-sm text-slate-500 font-bold flex items-center gap-2">
          <span>ผู้ดูแลระบบ</span><span className="text-slate-300">/</span>
          <span className="text-slate-800 font-extrabold">ภาพรวมข้อมูลครูทั้งหมด</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="ครูทั้งหมด" value={filtered.length} color="text-slate-700" bg="bg-slate-100" />
          <StatCard label="ยังไม่ลงเวลาวันนี้" value={notCheckedInCount} color="text-rose-600" bg="bg-rose-100" />
          <StatCard label="ลาวันนี้" value={onLeaveCount} color="text-amber-600" bg="bg-amber-100" />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อครู..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold" />
          </div>
          <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">
            <option value="all">ทุกกลุ่มสาระฯ</option>
            {subjectGroups.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">
            <option value="all">ทุกระดับชั้น</option>
            {gradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">ไม่พบข้อมูลครูตามเงื่อนไขที่เลือก</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(t => (
                <button key={t.id} onClick={() => router.push(`/admin/teachers/${t.id}`)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center overflow-hidden shrink-0">
                      {t.avatar_url ? <img src={t.avatar_url} className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{t.first_name} {t.last_name}</p>
                      <p className="text-xs text-slate-400 truncate">{t.subject_group || "—"}{t.grade_level ? ` · ${t.grade_level}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {t.on_leave_today && (
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        <CalendarDays className="w-3 h-3" /> ลาวันนี้
                      </span>
                    )}
                    {!t.checked_in_today && !t.on_leave_today && (
                      <span className="text-[10px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200">ยังไม่ลงเวลา</span>
                    )}
                    {t.checked_in_today && (
                      <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">ลงเวลาแล้ว</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color}`}>
        <span className={`inline-block w-2 h-2 rounded-full ${bg} mr-2`} />{value}
      </p>
    </div>
  );
}