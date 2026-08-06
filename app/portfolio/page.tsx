"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  User, Phone, MessageCircle, GraduationCap, Pencil, X, Check,
  CalendarDays, Trophy, FolderOpen, FileText, AlertCircle, Send, Loader2,
  ClipboardList, ArrowRight,
} from "lucide-react";

function currentFiscalYear() {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  return now.getMonth() >= 9 ? beYear + 1 : beYear;
}

type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  line_id: string | null;
  avatar_url: string | null;
  education_level: string | null;
  education_major: string | null;
  education_school: string | null;
  subject_group: string | null;
  position: string | null;
  department_id: string | null;
  department?: { name: string } | null;
  homeroom?: { room_name: string }[] | null;
  homeroom_teacher_2?: { room_name: string }[] | null; 
};

type LeaveSummaryRow = { leave_type: string; total_days: number; used_days: number; remaining_days: number };
type Training = { id: string; title: string; organizer: string | null; hours: number | null; training_date: string | null; certificate_url: string | null };
type Award = { id: string; title: string; award_level: string | null; date_received: string | null; image_cover: string | null };
type Material = { id: string; title: string; subject_group: string | null; created_at: string };
type PendingTask = { id: string; label: string; path: string };
type AttendanceRow = { work_date: string; status: string; late_minutes: number; early_leave_minutes: number; eval_round: number };

const LEAVE_LABEL: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจ", maternity: "ลาคลอด" };

export default function TeacherPortfolioPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Profile>>({});

  const [period, setPeriod] = useState<"day" | "month" | "term" | "year">("month");
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummaryRow[]>([]);
  const [leaveCount, setLeaveCount] = useState<{ used_count: number; remaining_count: number } | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportForm, setSupportForm] = useState({ category: "edit_locked_field", subject: "", message: "" });
  const [supportSending, setSupportSending] = useState(false);
  const [supportSent, setSupportSent] = useState(false);

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── สรุปการลงเวลาตามช่วงที่เลือก (day/month/term/year) ──
  const attendanceStats = useMemo(() => {
    const now = new Date();
    const filtered = attendance.filter(r => {
      const d = new Date(r.work_date);
      if (period === "day") return d.toDateString() === now.toDateString();
      if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === "term") {
        const round = (now.getMonth() >= 9 || now.getMonth() <= 2) ? 1 : 2;
        return r.eval_round === round;
      }
      return true; // year = ทั้งปีงบ
    });
    const cnt = (s: string) => filtered.filter(r => r.status === s).length;
    return {
      present: cnt("present"),
      late: cnt("late") + cnt("late_and_left_early"),
      leftEarly: cnt("left_early") + cnt("late_and_left_early"),
      absent: cnt("absent"),
    };
  }, [attendance, period]);

  const MONTH_LABEL: Record<number, string> = {
  1: "ม.ค.", 2: "ก.พ.", 3: "มี.ค.", 4: "เม.ย.", 5: "พ.ค.", 6: "มิ.ย.",
  7: "ก.ค.", 8: "ส.ค.", 9: "ก.ย.", 10: "ต.ค.", 11: "พ.ย.", 12: "ธ.ค.",
};
const FY_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const monthlyAttendance = useMemo(() => {
  const now = new Date();
  let months: number[];
  if (period === "month") months = [now.getMonth() + 1];
  else if (period === "term") {
    const round = (now.getMonth() >= 9 || now.getMonth() <= 2) ? 1 : 2;
    months = round === 1 ? [10, 11, 12, 1, 2, 3] : [4, 5, 6, 7, 8, 9];
  } else {
    months = FY_MONTHS;
  }
  return months.map(m => {
    const rows = attendance.filter(r => new Date(r.work_date).getMonth() + 1 === m);
    const cnt = (s: string) => rows.filter(r => r.status === s).length;
    return {
      month: m,
      label: MONTH_LABEL[m],
      present: cnt("present"),
      late: cnt("late") + cnt("late_and_left_early"),
      leftEarly: cnt("left_early") + cnt("late_and_left_early"),
      absent: cnt("absent"),
    };
  });
}, [attendance, period]);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: me } = await supabase
      .from("users")
      .select(`
        id, first_name, last_name, role, phone, line_id, avatar_url,
        education_level, education_major, education_school, subject_group, position, department_id,
        department:departments(name),
        homeroom:classrooms!classrooms_homeroom_teacher_id_fkey(room_name), homeroom_teacher_2:classrooms!classrooms_homeroom_teacher_2_id_fkey(room_name)
      `)
      .eq("auth_id", user.id)
      .maybeSingle();

    if (me) {
      setProfile(me as unknown as Profile);
      setForm(me as unknown as Profile);

      supabase
        .channel(`profile-${me.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${me.id}` }, (payload) => {
          setProfile(payload.new as Profile);
        })
        .subscribe();

      const fy = currentFiscalYear();
      const [{ data: quotaRows }, { data: countRow }, { data: tr }, { data: aw }, { data: mat }, { data: att }] = await Promise.all([
        supabase.from("v_leave_summary").select("leave_type,total_days,used_days,remaining_days").eq("user_id", me.id).eq("fiscal_year", fy),
        supabase.from("v_leave_count_summary").select("used_count,remaining_count").eq("user_id", me.id).eq("fiscal_year", fy).maybeSingle(),
        supabase.from("trainings").select("id,title,organizer,hours,training_date,certificate_url").eq("user_id", me.id).order("training_date", { ascending: false }).limit(10),
        supabase
  .from("award_recipients")
  .select("award:awards(id,title,award_level,date_received,image_cover)")
  .eq("recipient_user_id", me.id)
  .order("created_at", { ascending: false })
  .limit(10),
supabase.from("teaching_materials").select("id,title,subject_group,created_at").eq("uploaded_by", me.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("v_attendance_enriched").select("work_date,status,late_minutes,early_leave_minutes,eval_round").eq("user_id", me.id).eq("fiscal_year", fy),
      ]);
      setLeaveSummary(quotaRows || []);
      setLeaveCount(countRow || null);
      setTrainings(tr || []);
      const awardRows = (aw || [])
  .map((r: any) => r.award)
  .filter(Boolean) as Award[];
setAwards(awardRows);
      setMaterials(mat || []);
      setAttendance(att || []);

      const tasks: PendingTask[] = [];
      const { count: myPendingLeave } = await supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", me.id)
        .eq("status", "pending");
      if ((myPendingLeave ?? 0) > 0) tasks.push({ id: "t-leave", label: "มีใบลาที่ยังรออนุมัติ", path: "/leave" });

      const { count: myPendingSupport } = await supabase
        .from("support_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", me.id)
        .eq("status", "pending");
      if ((myPendingSupport ?? 0) > 0) tasks.push({ id: "t-support", label: "คำร้องถึงแอดมินยังรอดำเนินการ", path: "/portfolio" });

      setPendingTasks(tasks);
    }
    setLoading(false);
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({
        phone: form.phone ?? null,
        line_id: form.line_id ?? null,
        avatar_url: form.avatar_url ?? null,
        education_level: form.education_level ?? null,
        education_major: form.education_major ?? null,
        education_school: form.education_school ?? null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (!error) setEditing(false);
    else alert("บันทึกไม่สำเร็จ: " + error.message);
  }

  // ตำแหน่ง — บันทึกทันทีที่แก้ ไม่ต้องรอกดปุ่มบันทึกรวม
  async function savePositionNow(value: string) {
    if (!profile) return;
    setForm(f => ({ ...f, position: value }));
    const { error } = await supabase
      .from("users")
      .update({ position: value })
      .eq("id", profile.id);
    if (error) alert("บันทึกตำแหน่งไม่สำเร็จ: " + error.message);
  }

  async function sendSupportRequest() {
    if (!profile || !supportForm.subject.trim() || !supportForm.message.trim()) return;
    setSupportSending(true);
    const { error } = await supabase.from("support_requests").insert({
      user_id: profile.id,
      category: supportForm.category,
      subject: supportForm.subject,
      message: supportForm.message,
    });
    setSupportSending(false);
    if (!error) {
      setSupportSent(true);
      setSupportForm({ category: "edit_locked_field", subject: "", message: "" });
      setTimeout(() => { setSupportOpen(false); setSupportSent(false); }, 1500);
    } else {
      alert("ส่งคำร้องไม่สำเร็จ: " + error.message);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <main className="w-full p-4 md:p-8 lg:p-10 space-y-8 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg transition-colors"
            title="ไปหน้าแดชบอร์ด">🏠</button>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-800 font-extrabold">ประวัติส่วนตัวและผลการปฏิบัติงาน</span>
        </div>

        {/* Pending tasks */}
        {pendingTasks.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-700 font-black text-sm">
              <AlertCircle className="w-4 h-4" /> งานที่ยังค้างอยู่ ({pendingTasks.length})
            </div>
            {pendingTasks.map(t => (
              <button key={t.id} onClick={() => router.push(t.path)}
                className="text-left text-sm font-bold text-amber-800 hover:underline">• {t.label}</button>
            ))}
          </div>
        )}

        {/* Profile card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center overflow-hidden shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">{profile.first_name} {profile.last_name}</h1>
                <p className="text-sm text-slate-400 font-bold">{profile.position || "ยังไม่ระบุตำแหน่ง"}</p>
              </div>
            </div>
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-50 border border-blue-100">
                <Pencil className="w-4 h-4" /> แก้ไขข้อมูลส่วนตัว
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveProfile} disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} บันทึก
                </button>
                <button onClick={() => { setEditing(false); setForm(profile); }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 border border-slate-200">
                  <X className="w-4 h-4" /> ยกเลิก
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ตำแหน่ง — บันทึกทันทีตอนออกจากช่อง ไม่ผูกปุ่มบันทึกรวม */}
            <div>
              <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                <User className="w-4 h-4" /> ตำแหน่ง
              </p>
              {editing ? (
                <input
                  defaultValue={profile.position ?? ""}
                  onBlur={(e) => savePositionNow(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700"
                />
              ) : (
                <p className="text-sm font-bold text-slate-700">{profile.position ?? "—"}</p>
              )}
            </div>

            <Field icon={<Phone className="w-4 h-4" />} label="เบอร์โทร" editing={editing}
              value={editing ? form.phone ?? "" : profile.phone ?? "—"}
              onChange={(v) => setForm(f => ({ ...f, phone: v }))} />
            <Field icon={<MessageCircle className="w-4 h-4" />} label="ไลน์ไอดี" editing={editing}
              value={editing ? form.line_id ?? "" : profile.line_id ?? "—"}
              onChange={(v) => setForm(f => ({ ...f, line_id: v }))} />
            <Field icon={<GraduationCap className="w-4 h-4" />} label="วุฒิการศึกษา" editing={editing}
              value={editing ? form.education_level ?? "" : profile.education_level ?? "—"}
              onChange={(v) => setForm(f => ({ ...f, education_level: v }))} />
            <Field icon={<GraduationCap className="w-4 h-4" />} label="สาขา / สถาบัน" editing={editing}
              value={editing ? form.education_major ?? "" : [profile.education_major, profile.education_school].filter(Boolean).join(" · ") || "—"}
              onChange={(v) => setForm(f => ({ ...f, education_major: v }))} />

            {/* อ่านอย่างเดียว — ครูแก้ไม่ได้ */}
            <div>
              <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                <GraduationCap className="w-4 h-4" /> กลุ่มสาระการเรียนรู้
              </p>
              <p className="text-sm font-bold text-slate-700">{profile.department?.name ?? profile.subject_group ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                <CalendarDays className="w-4 h-4" /> ประจำชั้น
              </p>
              <p className="text-sm font-bold text-slate-700">
  {[...(profile.homeroom ?? []), ...(profile.homeroom_teacher_2 ?? [])]
    .map(h => h.room_name).join(", ") || "—"}
</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            ต้องการแก้ไขข้อมูลที่ถูกล็อก (เช่น ชื่อ-สกุล, บทบาท, กลุ่มสาระ, ประจำชั้น) ให้ส่งคำร้องด้านล่างถึงแอดมิน
          </p>
        </div>

        {/* Quick links: การลา / การสอนแทน — พร้อมเลขสรุป */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => router.push("/leave")}
            className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-extrabold text-slate-800">ข้อมูลการลา</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {leaveCount
                    ? `สิทธิ์การลารวมทุกประเภท (ปีงบ ${currentFiscalYear()}) ใช้ไปแล้ว ${leaveCount.used_count} / 6 ครั้ง เหลือ ${leaveCount.remaining_count} ครั้ง`
                    : "ดูสิทธิ์ / ยื่นใบลา"}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>

          <button onClick={() => router.push("/substitution")}
            className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-purple-300 hover:shadow-sm transition-all flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-extrabold text-slate-800">ข้อมูลการสอนแทน</p>
                <p className="text-xs text-slate-400 mt-0.5">ดูประวัติ / ตารางสอนแทน</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        </div>

        {/* Performance period + leave + attendance summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-extrabold text-slate-800">📊 สรุปผลการปฏิบัติงาน</h3>
            <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
              {([
                ["day", "รายวัน"], ["month", "รายเดือน"], ["term", "รายเทอม"], ["year", "ปีงบประมาณ"],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === key ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* การลงเวลาปฏิบัติงาน */}
          <div>
            <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2">
              <ClipboardList className="w-3.5 h-3.5" /> การลงเวลาปฏิบัติงาน
            </p>
            {period === "day" ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label="มาปฏิบัติงาน" value={attendanceStats.present} color="emerald" />
                <StatBox label="มาสาย" value={attendanceStats.late} color="amber" />
                <StatBox label="กลับก่อน" value={attendanceStats.leftEarly} color="orange" />
                <StatBox label="ขาด" value={attendanceStats.absent} color="rose" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-3 py-2 font-bold text-slate-500 text-xs">เดือน</th>
                      <th className="text-center px-3 py-2 font-bold text-emerald-600 text-xs">มาปฏิบัติงาน</th>
                      <th className="text-center px-3 py-2 font-bold text-amber-600 text-xs">มาสาย</th>
                      <th className="text-center px-3 py-2 font-bold text-orange-600 text-xs">กลับก่อน</th>
                      <th className="text-center px-3 py-2 font-bold text-rose-600 text-xs">ขาด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {monthlyAttendance.map(m => (
                      <tr key={m.month}>
                        <td className="px-3 py-2 font-bold text-slate-700">{m.label}</td>
                        <td className="px-3 py-2 text-center font-black text-emerald-600">{m.present || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-amber-600">{m.late || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-orange-600">{m.leftEarly || "-"}</td>
                        <td className="px-3 py-2 text-center font-black text-rose-600">{m.absent || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">มุมมองที่เลือก: {{ day: "รายวัน", month: "รายเดือน", term: "รายเทอม", year: "ปีงบประมาณ" }[period]} — ปีงบประมาณ {currentFiscalYear()}</p>
        </div>

        {/* Trainings */}
        <SectionList
          title="🎓 ประวัติการอบรม"
          emptyText="ยังไม่มีประวัติการอบรม"
          items={trainings}
          renderItem={(t: Training) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-slate-800">{t.title}</p>
                <p className="text-xs text-slate-400">{t.organizer || "—"}{t.hours ? ` · ${t.hours} ชม.` : ""}</p>
              </div>
              {t.certificate_url && (
                <a href={t.certificate_url} target="_blank" rel="noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline shrink-0">ดูเกียรติบัตร →</a>
              )}
            </div>
          )}
        />

        {/* Awards */}
        <SectionList
          title="🏆 รางวัลและความภาคภูมิใจ"
          emptyText="ยังไม่มีรางวัลที่บันทึกไว้"
          items={awards}
// Awards section — เดิมใช้ a.level, ให้เปลี่ยนเป็น a.award_level
renderItem={(a: Award) => (
  <div key={a.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
    <div className="w-9 h-9 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0"><Trophy className="w-4 h-4" /></div>
    <div>
      <p className="text-sm font-bold text-slate-800">{a.title}</p>
      <p className="text-xs text-slate-400">{a.award_level || "—"}</p>
    </div>
  </div>
)}
        />

        {/* Materials */}
        <SectionList
          title="📁 สื่อการสอนที่อัปโหลด"
          emptyText="ยังไม่มีสื่อการสอนที่อัปโหลด"
          items={materials}
// Materials section — เดิมใช้ m.subject, ให้เปลี่ยนเป็น m.subject_group
renderItem={(m: Material) => (
  <div key={m.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
    <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0"><FolderOpen className="w-4 h-4" /></div>
    <div>
      <p className="text-sm font-bold text-slate-800">{m.title}</p>
      <p className="text-xs text-slate-400">{m.subject_group || "—"}</p>
    </div>
  </div>
)}
        />

        {/* Teaching materials */}
        <SectionList
          title="📁 สื่อการสอนที่นำส่ง"
          emptyText="ยังไม่มีสื่อการสอนที่นำส่ง"
          items={materials}
          renderItem={(m: Material) => (
            <div key={m.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0"><FolderOpen className="w-4 h-4" /></div>
              <div>
                <p className="text-sm font-bold text-slate-800">{m.title}</p>
                <p className="text-xs text-slate-400">{m.subject_group || "—"}</p>
              </div>
            </div>
          )}
        />

        {/* Support request to admin */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4" /> แจ้งเรื่อง / ขอแก้ไขข้อมูลถึงแอดมิน</h3>
            {!supportOpen && (
              <button onClick={() => setSupportOpen(true)} className="text-sm font-bold text-blue-600 hover:underline">+ สร้างคำร้องใหม่</button>
            )}
          </div>
          {supportOpen && (
            <div className="space-y-3">
              <select value={supportForm.category} onChange={e => setSupportForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700">
                <option value="edit_locked_field">ขอแก้ไขข้อมูลที่ถูกล็อก</option>
                <option value="bug_report">แจ้งปัญหาการใช้งาน</option>
                <option value="other">อื่นๆ</option>
              </select>
              <input value={supportForm.subject} onChange={e => setSupportForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="หัวข้อ" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
              <textarea value={supportForm.message} onChange={e => setSupportForm(f => ({ ...f, message: e.target.value }))}
                placeholder="รายละเอียด" rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setSupportOpen(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500">ยกเลิก</button>
                <button onClick={sendSupportRequest} disabled={supportSending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                  {supportSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {supportSent ? "ส่งแล้ว ✓" : "ส่งคำร้อง"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ icon, label, value, editing, onChange }: { icon: React.ReactNode; label: string; value: string; editing: boolean; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mb-1">{icon} {label}</p>
      {editing ? (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700" />
      ) : (
        <p className="text-sm font-bold text-slate-700">{value}</p>
      )}
    </div>
  );
}

function SectionList<T>({ title, emptyText, items, renderItem }: { title: string; emptyText: string; items: T[]; renderItem: (item: T) => React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-800 mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">{emptyText}</p>
      ) : (
        <div>{items.map(renderItem)}</div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: "emerald" | "amber" | "orange" | "rose" }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    orange: "bg-orange-50 text-orange-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className={`rounded-xl p-4 ${colorMap[color]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-bold mt-1">{label}</p>
    </div>
  );
}