"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, User, Phone, MessageCircle, GraduationCap, CalendarDays, Trophy, FolderOpen, Loader2 } from "lucide-react";

function currentFiscalYear() {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  return now.getMonth() >= 9 ? beYear + 1 : beYear;
}

const LEAVE_LABEL: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจ", maternity: "ลาคลอด" };

export default function AdminTeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [leaveSummary, setLeaveSummary] = useState<any[]>([]);
  const [leaveCount, setLeaveCount] = useState<{ used_count: number; remaining_count: number } | null>(null);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [supportRequests, setSupportRequests] = useState<any[]>([]);

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const fy = currentFiscalYear();
    const [{ data: p }, { data: ls }, { data: cnt }, { data: tr }, { data: aw }, { data: mat }, { data: sr }] = await Promise.all([
      supabase.from("users").select("*").eq("id", id).maybeSingle(),
      supabase.from("v_leave_summary").select("leave_type,total_days,used_days,remaining_days").eq("user_id", id).eq("fiscal_year", fy),
      supabase.from("v_leave_count_summary").select("used_count,remaining_count").eq("user_id", id).eq("fiscal_year", fy).maybeSingle(),
      supabase.from("trainings").select("*").eq("user_id", id).order("training_date", { ascending: false }),
      supabase.from("awards").select("*").eq("user_id", id).order("award_date", { ascending: false }),
      supabase.from("teaching_materials").select("*").eq("user_id", id).order("submitted_at", { ascending: false }),
      supabase.from("support_requests").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(5),
    ]);
    setProfile(p);
    setLeaveSummary(ls || []);
    setLeaveCount(cnt || null);
    setTrainings(tr || []);
    setAwards(aw || []);
    setMaterials(mat || []);
    setSupportRequests(sr || []);
    setLoading(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">ไม่พบข้อมูลครูคนนี้</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <main className="w-full p-4 md:p-8 lg:p-10 space-y-6 max-w-4xl mx-auto">
        <button onClick={() => router.push("/admin/teachers")}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้ารวมข้อมูลครู
        </button>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center overflow-hidden shrink-0">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <User className="w-7 h-7" />}
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">{profile.first_name} {profile.last_name}</h1>
            <p className="text-sm text-slate-400 font-bold">{profile.subject_group || "—"}{profile.grade_level ? ` · ${profile.grade_level}` : ""}</p>
            <div className="flex gap-4 mt-2 text-xs text-slate-500 font-bold">
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {profile.phone || "—"}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {profile.line_id || "—"}</span>
              <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> {profile.education_level || "—"}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-extrabold text-slate-800">📊 สถิติการลา (ปีงบประมาณ {currentFiscalYear()})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {["sick", "personal", "maternity"].map(type => {
              const row = leaveSummary.find(r => r.leave_type === type);
              return (
                <div key={type} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {LEAVE_LABEL[type]}</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{row ? row.used_days : 0}<span className="text-xs font-bold text-slate-400"> / {row ? row.total_days : 0} วัน</span></p>
                  <p className="text-xs font-bold text-emerald-600 mt-0.5">เหลือ {row ? row.remaining_days : 0} วัน</p>
                </div>
              );
            })}
          </div>
          {leaveCount && (
            <div className={`rounded-xl p-4 border flex items-center justify-between ${
              leaveCount.remaining_count <= 1 ? "bg-rose-50 border-rose-200" : "bg-blue-50 border-blue-100"
            }`}>
              <div>
                <p className="text-xs font-bold text-slate-500">สิทธิ์การลารวมทุกประเภท (ปีงบประมาณ)</p>
                <p className="text-sm font-black text-slate-800 mt-0.5">ใช้ไปแล้ว {leaveCount.used_count} / 6 ครั้ง</p>
              </div>
              <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
                leaveCount.remaining_count <= 1 ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
              }`}>เหลือ {leaveCount.remaining_count} ครั้ง</span>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 mb-2">🎓 ประวัติการอบรม ({trainings.length})</h3>
          {trainings.length === 0 ? <p className="text-sm text-slate-400 py-3">ไม่มีข้อมูล</p> : trainings.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-slate-800">{t.title}</p>
                <p className="text-xs text-slate-400">{t.organizer || "—"}{t.hours ? ` · ${t.hours} ชม.` : ""}</p>
              </div>
              {t.certificate_url && <a href={t.certificate_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline shrink-0">เกียรติบัตร →</a>}
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 mb-2">🏆 รางวัลและความภาคภูมิใจ ({awards.length})</h3>
          {awards.length === 0 ? <p className="text-sm text-slate-400 py-3">ไม่มีข้อมูล</p> : awards.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0"><Trophy className="w-4 h-4" /></div>
              <div><p className="text-sm font-bold text-slate-800">{a.title}</p><p className="text-xs text-slate-400">{a.level || "—"}</p></div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 mb-2">📁 สื่อการสอนที่นำส่ง ({materials.length})</h3>
          {materials.length === 0 ? <p className="text-sm text-slate-400 py-3">ไม่มีข้อมูล</p> : materials.map(m => (
            <div key={m.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0"><FolderOpen className="w-4 h-4" /></div>
              <div><p className="text-sm font-bold text-slate-800">{m.title}</p><p className="text-xs text-slate-400">{m.subject || "—"}</p></div>
            </div>
          ))}
        </div>

        {supportRequests.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-800 mb-2">📨 คำร้องล่าสุดถึงแอดมิน</h3>
            {supportRequests.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-bold text-slate-800">{s.subject}</p>
                  <p className="text-xs text-slate-400">{s.message}</p>
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${
                  s.status === "resolved" ? "bg-emerald-100 text-emerald-700" :
                  s.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                }`}>{s.status === "resolved" ? "แก้ไขแล้ว" : s.status === "in_progress" ? "กำลังดำเนินการ" : "รอดำเนินการ"}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}