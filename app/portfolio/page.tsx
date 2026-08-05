"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  User, Phone, MessageCircle, GraduationCap, Pencil, X, Check,
  CalendarDays, Trophy, FolderOpen, FileText, AlertCircle, Send, Loader2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// ปีงบประมาณปัจจุบัน (พ.ศ.) — ต.ค.–ก.ย. นับปีงบประมาณไทย
// ═══════════════════════════════════════════════════════════════════
function currentFiscalYear() {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  return now.getMonth() >= 9 ? beYear + 1 : beYear; // เดือน >= ต.ค. (index 9) นับปีงบถัดไป
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
};

type LeaveSummaryRow = { leave_type: string; total_days: number; used_days: number; remaining_days: number };
type Training = { id: string; title: string; organizer: string | null; hours: number | null; training_date: string | null; certificate_url: string | null };
type Award = { id: string; title: string; level: string | null; award_date: string | null; image_url: string | null };
type Material = { id: string; title: string; subject: string | null; submitted_at: string };
type PendingTask = { id: string; label: string; path: string };

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

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportForm, setSupportForm] = useState({ category: "edit_locked_field", subject: "", message: "" });
  const [supportSending, setSupportSending] = useState(false);
  const [supportSent, setSupportSent] = useState(false);

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: me } = await supabase
      .from("users")
      .select("id, first_name, last_name, role, phone, line_id, avatar_url, education_level, education_major, education_school, subject_group")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (me) {
      setProfile(me as Profile);
      setForm(me as Profile);

      // ── real-time: ฟัง UPDATE ของแถวตัวเองในตาราง users ──
      supabase
        .channel(`profile-${me.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${me.id}` }, (payload) => {
          setProfile(payload.new as Profile);
        })
        .subscribe();

      const fy = currentFiscalYear();
      const [{ data: quotaRows }, { data: countRow }, { data: tr }, { data: aw }, { data: mat }] = await Promise.all([
        supabase.from("v_leave_summary").select("leave_type,total_days,used_days,remaining_days").eq("user_id", me.id).eq("fiscal_year", fy),
        supabase.from("v_leave_count_summary").select("used_count,remaining_count").eq("user_id", me.id).eq("fiscal_year", fy).maybeSingle(),
        supabase.from("trainings").select("id,title,organizer,hours,training_date,certificate_url").eq("user_id", me.id).order("training_date", { ascending: false }).limit(10),
        supabase.from("awards").select("id,title,level,award_date,image_url").eq("user_id", me.id).order("award_date", { ascending: false }).limit(10),
        supabase.from("teaching_materials").select("id,title,subject,submitted_at").eq("user_id", me.id).order("submitted_at", { ascending: false }).limit(10),
      ]);
      setLeaveSummary(quotaRows || []);
      setLeaveCount(countRow || null);
      setTrainings(tr || []);
      setAwards(aw || []);
      setMaterials(mat || []);

      // ── งานค้าง: ปรับ query ให้ตรงตารางจริงของระบบเมื่อพร้อม (attendance / scores) ──
      const today = new Date().toISOString().split("T")[0];
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

      void today; // เผื่อผูก attendance/scores เพิ่มด้วยวันปัจจุบันภายหลัง
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
    // ค่าบนหน้าจะอัปเดตอัตโนมัติจาก realtime subscription ด้านบน
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

        <div className="text-sm text-slate-500 font-bold flex items-center gap-2">
          <span>แดชบอร์ด</span><span className="text-slate-300">/</span>
          <span className="text-slate-800 font-extrabold">ประวัติส่วนตัวและผลการปฏิบัติงาน</span>
        </div>

        {/* Pending tasks widget */}
        {pendingTasks.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-700 font-black text-sm">
              <AlertCircle className="w-4 h-4" /> งานที่ยังค้างอยู่ ({pendingTasks.length})
            </div>
            {pendingTasks.map(t => (
              <button key={t.id} onClick={() => router.push(t.path)}
                className="text-left text-sm font-bold text-amber-800 hover:underline">
                • {t.label}
              </button>
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
                <p className="text-sm text-slate-400 font-bold">{profile.subject_group || "ยังไม่ระบุกลุ่มสาระฯ"}</p>
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
          </div>
          <p className="text-[11px] text-slate-400">
            ต้องการแก้ไขข้อมูลที่ถูกล็อก (เช่น ชื่อ-สกุล, บทบาท) ให้ส่งคำร้องด้านล่างถึงแอดมิน
          </p>
        </div>

        {/* Performance period + leave summary */}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {["sick", "personal", "maternity"].map(type => {
              const row = leaveSummary.find(r => r.leave_type === type);
              return (
                <div key={type} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {LEAVE_LABEL[type]}</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">
                    {row ? row.used_days : 0}
                    <span className="text-xs font-bold text-slate-400"> / {row ? row.total_days : 0} วัน</span>
                  </p>
                  <p className="text-xs font-bold text-emerald-600 mt-0.5">เหลือ {row ? row.remaining_days : 0} วัน</p>
                </div>
              );
            })}
          </div>

          {/* สิทธิ์รวมทุกประเภท: ไม่เกิน 6 ครั้ง/ปีงบประมาณ */}
          {leaveCount && (
            <div className={`rounded-xl p-4 border flex items-center justify-between ${
              leaveCount.remaining_count <= 1 ? "bg-rose-50 border-rose-200" : "bg-blue-50 border-blue-100"
            }`}>
              <div>
                <p className="text-xs font-bold text-slate-500">สิทธิ์การลารวมทุกประเภท (ปีงบประมาณ)</p>
                <p className="text-sm font-black text-slate-800 mt-0.5">
                  ใช้ไปแล้ว {leaveCount.used_count} / 6 ครั้ง
                </p>
              </div>
              <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
                leaveCount.remaining_count <= 1 ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
              }`}>
                เหลือ {leaveCount.remaining_count} ครั้ง
              </span>
            </div>
          )}
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
          renderItem={(a: Award) => (
            <div key={a.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0"><Trophy className="w-4 h-4" /></div>
              <div>
                <p className="text-sm font-bold text-slate-800">{a.title}</p>
                <p className="text-xs text-slate-400">{a.level || "—"}</p>
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
                <p className="text-xs text-slate-400">{m.subject || "—"}</p>
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