"use client";

/**
 * SubstitutionSystem.tsx
 * ระบบแลกคาบ & สอนแทน — รับรายชื่อครูจาก props (page.tsx ดึงจาก Supabase มาให้แล้ว)
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── ประเภทข้อมูล ────────────────────────────────────────
type Teacher = {
  id: string;
  full_name: string;
  position?: string;
  role?: string;
};

type SwapRequest = {
  id: string;
  requester_id: string;
  target_teacher_id: string;
  day: string;
  period: string;
  subject: string;
  room: string;
  my_period: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  responded_at?: string;
  requester?: Teacher;
  target_teacher?: Teacher;
};

type SubRecord = {
  id: string;
  doc_no: string;
  absent_teacher_id: string;
  substitute_id: string;
  day: string;
  date: string;
  period: string;
  subject: string;
  room: string;
  leave_ref: string;
  note: string;
  created_at: string;
  absent_teacher?: Teacher;
  substitute?: Teacher;
};

interface SubstitutionSystemProps {
  teachers: any[];
  teacherMap: Record<string, any>;
}

// ─── ค่าคงที่ ─────────────────────────────────────────────
const SUBJECTS = ["คณิตศาสตร์","ภาษาไทย","วิทยาศาสตร์","ภาษาอังกฤษ","สังคมศึกษา","พลศึกษา","ศิลปะ","การงานอาชีพ","คอมพิวเตอร์","ดนตรี"];
const PERIODS  = ["1 (08:00–09:00)","2 (09:00–10:00)","3 (10:00–11:00)","4 (11:00–12:00)","5 (13:00–14:00)","6 (14:00–15:00)","7 (15:00–16:00)","8 (16:00–17:00)"];
const ROOMS    = ["ป.1/1","ป.1/2","ป.2/1","ป.2/2","ป.3/1","ป.3/2","ป.4/1","ป.4/2","ป.5/1","ป.5/2","ป.6/1","ป.6/2","ม.1/1","ม.1/2","ม.2/1","ม.2/2","ม.3/1","ม.3/2"];
const DAYS     = ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์"];
const NON_TEACHING_ROLES = ["admin","director","deputy_director","staff"];

// ─── helpers ─────────────────────────────────────────────
function displayName(t?: Teacher | null) {
  if (!t) return "—";
  return t.full_name || "—";
}

function toThaiDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", { year:"numeric", month:"short", day:"numeric", timeZone:"Asia/Bangkok" });
}

function todayThai() {
  return new Date().toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Bangkok" });
}

function periodShort(p: string) {
  return p.split(" ")[0];
}

// ─── StatusBadge ─────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string,{label:string;cls:string}> = {
    pending:   { label:"รอตอบรับ",   cls:"bg-amber-100 text-amber-700 border-amber-300" },
    approved:  { label:"ตกลงแล้ว",  cls:"bg-green-100 text-green-700 border-green-300" },
    rejected:  { label:"ปฏิเสธ",    cls:"bg-red-100 text-red-700 border-red-300" },
    completed: { label:"เสร็จสิ้น", cls:"bg-blue-100 text-blue-700 border-blue-300" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Input / Select helpers ───────────────────────────────
const inp = "w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors";
const sel = "w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm font-medium focus:border-blue-500 focus:outline-none appearance-none transition-colors";

// ─── SubstitutionSystem (export default เดียวเท่านั้น) ────
export default function SubstitutionSystem({ teachers: teachersProp, teacherMap }: SubstitutionSystemProps) {

  // ✅ แปลง users จาก props ให้เป็น Teacher[] ที่ใช้ในคอมโพเนนต์นี้
  //    กรอง role ที่ไม่ใช่ครูออกอีกชั้น (กันเผื่อ page.tsx เปลี่ยน filter ในอนาคต)
  const teachers: Teacher[] = useMemo(() => {
    return (teachersProp ?? [])
      .filter((u: any) => !NON_TEACHING_ROLES.includes(u.role ?? ""))
      .map((u: any) => ({
        id: u.id,
        full_name: u.full_name || `${u.title ?? ""} ${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g," ").trim(),
        position: u.position,
        role: u.role,
      }));
  }, [teachersProp]);

  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [subRecords,   setSubRecords]   = useState<SubRecord[]>([]);
  const [tab,          setTab]          = useState<"swap"|"sub"|"stats">("swap");
  const [loading,      setLoading]      = useState(true);
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [showSubForm,  setShowSubForm]  = useState(false);
  const [docPreview,   setDocPreview]   = useState<SubRecord|null>(null);
  const [saving,       setSaving]       = useState(false);

  // form state — ใช้ teachers ที่ได้จาก props ตั้งค่าเริ่มต้นได้เลย (ไม่ต้องรอ useEffect)
  const blankSwap = useCallback(() => ({
    requester_id: teachers[0]?.id ?? "",
    target_teacher_id: teachers[1]?.id ?? teachers[0]?.id ?? "",
    day: DAYS[0],
    period: PERIODS[0],
    subject: SUBJECTS[0],
    room: ROOMS[0],
    my_period: PERIODS[1],
    reason: "",
  }), [teachers]);

  const blankSub = useCallback(() => ({
    absent_teacher_id: teachers[0]?.id ?? "",
    substitute_id: teachers[1]?.id ?? teachers[0]?.id ?? "",
    day: DAYS[0],
    date: "",
    period: PERIODS[0],
    subject: SUBJECTS[0],
    room: ROOMS[0],
    leave_ref: "",
    note: "",
  }), [teachers]);

  const [swapForm, setSwapForm] = useState(blankSwap);
  const [subForm,  setSubForm]  = useState(blankSub);

  // ✅ ถ้า teachers โหลดมาช้ากว่า render แรก (เช่น prop เปลี่ยนทีหลัง) ให้ sync ค่าเริ่มต้นอีกครั้ง
  useEffect(() => {
    if (teachers.length === 0) return;
    setSwapForm(f => f.requester_id ? f : blankSwap());
    setSubForm(f => f.absent_teacher_id ? f : blankSub());
  }, [teachers, blankSwap, blankSub]);

  // ── โหลด swap requests ───────────────────────────────
  const loadSwaps = useCallback(async () => {
    const { data } = await supabase
      .from("swap_requests")
      .select(`
        *,
        requester:users!swap_requests_requester_id_fkey(id, full_name, position),
        target_teacher:users!swap_requests_target_teacher_id_fkey(id, full_name, position)
      `)
      .order("created_at", { ascending: false });
    setSwapRequests((data as SwapRequest[]) ?? []);
  }, []);

  // ── โหลด sub records ─────────────────────────────────
  const loadSubs = useCallback(async () => {
    const { data } = await supabase
      .from("sub_records")
      .select(`
        *,
        absent_teacher:users!sub_records_absent_teacher_id_fkey(id, full_name, position),
        substitute:users!sub_records_substitute_id_fkey(id, full_name, position)
      `)
      .order("created_at", { ascending: false });
    setSubRecords((data as SubRecord[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSwaps();
    loadSubs();
  }, [loadSwaps, loadSubs]);

  // ── ส่งคำขอแลกคาบ ────────────────────────────────────
  async function submitSwap() {
    if (!swapForm.requester_id || !swapForm.target_teacher_id) {
      alert("กรุณาเลือกครูผู้ขอและครูที่ต้องการแลกด้วย");
      return;
    }
    if (swapForm.requester_id === swapForm.target_teacher_id) {
      alert("กรุณาเลือกครูคนละคนกัน");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("swap_requests").insert([{
      requester_id:      swapForm.requester_id,
      target_teacher_id: swapForm.target_teacher_id,
      day:       swapForm.day,
      period:    swapForm.period,
      subject:   swapForm.subject,
      room:      swapForm.room,
      my_period: swapForm.my_period,
      reason:    swapForm.reason,
      status:    "pending",
    }]);
    setSaving(false);
    if (error) { alert("❌ " + error.message); return; }
    setShowSwapForm(false);
    setSwapForm(blankSwap());
    await loadSwaps();
  }

  // ── ตอบรับ/ปฏิเสธคำขอ ────────────────────────────────
  async function respondSwap(id: string, action: "approved"|"rejected") {
    const { error } = await supabase
      .from("swap_requests")
      .update({ status: action, responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { alert("❌ " + error.message); return; }
    await loadSwaps();
  }

  // ── บันทึกสอนแทน ─────────────────────────────────────
  async function submitSub() {
    if (!subForm.absent_teacher_id || !subForm.substitute_id) {
      alert("กรุณาเลือกครูที่ลาและครูสอนแทน");
      return;
    }
    if (subForm.absent_teacher_id === subForm.substitute_id) {
      alert("กรุณาเลือกครูคนละคนกัน");
      return;
    }
    if (!subForm.date) { alert("กรุณาเลือกวันที่"); return; }
    setSaving(true);

    // สร้างเลขเอกสาร
    const year  = new Date().getFullYear() + 543;
    const count = subRecords.length + 1;
    const docNo = `SUB-${year}-${String(count).padStart(3, "0")}`;

    const { error } = await supabase.from("sub_records").insert([{
      doc_no:             docNo,
      absent_teacher_id:  subForm.absent_teacher_id,
      substitute_id:      subForm.substitute_id,
      day:      subForm.day,
      date:     subForm.date,
      period:   subForm.period,
      subject:  subForm.subject,
      room:     subForm.room,
      leave_ref: subForm.leave_ref,
      note:     subForm.note,
    }]);
    setSaving(false);
    if (error) { alert("❌ " + error.message); return; }
    setShowSubForm(false);
    setSubForm(blankSub());
    await loadSubs();
  }

  // ── สถิติ ─────────────────────────────────────────────
  const stats = {
    totalSwaps: swapRequests.length,
    approved:   swapRequests.filter(r => r.status === "approved").length,
    pending:    swapRequests.filter(r => r.status === "pending").length,
    totalSubs:  subRecords.length,
  };

  // ── Teacher select helper ─────────────────────────────
  function TeacherSelect({
    label, value, onChange, exclude,
  }: { label: string; value: string; onChange: (v: string) => void; exclude?: string }) {
    return (
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)} className={sel}>
          <option value="">— เลือกครู —</option>
          {teachers
            .filter(t => !exclude || t.id !== exclude)
            .map(t => (
              <option key={t.id} value={t.id}>
                {displayName(t)}{t.position ? ` · ${t.position}` : ""}
              </option>
            ))}
        </select>
      </div>
    );
  }

  // ─── RENDER ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 font-bold animate-pulse">กำลังโหลด...</p>
      </div>
    );
  }

  if (teachers.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-4xl mb-2">👥</p>
          <p className="text-slate-500 font-bold">ไม่พบรายชื่อครูในระบบ</p>
          <p className="text-slate-400 text-sm mt-1">กรุณาตรวจสอบข้อมูลตาราง users</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10" style={{ fontFamily: "'Sarabun','IBM Plex Sans Thai',sans-serif" }}>

      {/* Header */}
      <div className="bg-gradient-to-br from-teal-500 to-cyan-600 px-6 py-6 text-white">
        <h1 className="text-2xl font-black">🔄 แลกคาบ &amp; สอนแทน</h1>
        <p className="text-teal-100 text-sm mt-1">ส่งคำขอแลกคาบ จัดครูสอนแทน และออกเอกสารคำสั่งอัตโนมัติ</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-4">
        {[
          { label:"คำขอแลกคาบทั้งหมด", value: stats.totalSwaps, color:"text-blue-600",   bg:"bg-blue-50",   border:"border-blue-200"  },
          { label:"ตกลงแล้ว",           value: stats.approved,   color:"text-green-600",  bg:"bg-green-50",  border:"border-green-200" },
          { label:"รอตอบรับ",           value: stats.pending,    color:"text-amber-600",  bg:"bg-amber-50",  border:"border-amber-200" },
          { label:"บันทึกสอนแทน",       value: stats.totalSubs,  color:"text-violet-600", bg:"bg-violet-50", border:"border-violet-200"},
        ].map(s => (
          <div key={s.label} className={`${s.bg} border-2 ${s.border} rounded-2xl p-4 text-center shadow-sm`}>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-500 text-xs font-bold mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 mx-4 mb-4 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
        {[
          ["swap",  "🔄 แลกคาบ"],
          ["sub",   "📋 สอนแทน"],
          ["stats", "📊 สถิติ"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${tab === k ? "bg-teal-500 text-white shadow" : "text-slate-500 hover:text-teal-600"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-4 max-w-3xl mx-auto">

        {/* ══ TAB: แลกคาบ ══ */}
        {tab === "swap" && (
          <>
            <div className="flex items-center justify-between">
              <p className="font-black text-slate-700">คำขอแลกคาบ</p>
              <button onClick={() => setShowSwapForm(v => !v)}
                className="px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-black text-sm shadow">
                + ส่งคำขอแลกคาบ
              </button>
            </div>

            {showSwapForm && (
              <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-5 space-y-4">
                <p className="font-black text-teal-700 text-base">📝 ส่งคำขอแลกคาบใหม่</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TeacherSelect label="ครูผู้ขอ *" value={swapForm.requester_id} onChange={v => setSwapForm(f => ({ ...f, requester_id: v }))} exclude={swapForm.target_teacher_id}/>
                  <TeacherSelect label="ครูที่ต้องการแลกด้วย *" value={swapForm.target_teacher_id} onChange={v => setSwapForm(f => ({ ...f, target_teacher_id: v }))} exclude={swapForm.requester_id}/>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วัน</label>
                    <select value={swapForm.day} onChange={e => setSwapForm(f => ({ ...f, day: e.target.value }))} className={sel}>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">คาบที่ต้องการ (ของอีกฝ่าย)</label>
                    <select value={swapForm.period} onChange={e => setSwapForm(f => ({ ...f, period: e.target.value }))} className={sel}>
                      {PERIODS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">คาบที่จะให้แลก (ของตัวเอง)</label>
                    <select value={swapForm.my_period} onChange={e => setSwapForm(f => ({ ...f, my_period: e.target.value }))} className={sel}>
                      {PERIODS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วิชา</label>
                    <select value={swapForm.subject} onChange={e => setSwapForm(f => ({ ...f, subject: e.target.value }))} className={sel}>
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">ห้อง</label>
                    <select value={swapForm.room} onChange={e => setSwapForm(f => ({ ...f, room: e.target.value }))} className={sel}>
                      {ROOMS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">เหตุผล</label>
                    <input value={swapForm.reason} onChange={e => setSwapForm(f => ({ ...f, reason: e.target.value }))}
                      placeholder="ระบุเหตุผล..." className={inp}/>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={submitSwap} disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-black text-sm disabled:opacity-50">
                    {saving ? "กำลังส่ง..." : "📤 ส่งคำขอ"}
                  </button>
                  <button onClick={() => setShowSwapForm(false)}
                    className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm hover:bg-slate-50">
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {swapRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-slate-400">
                <p className="text-4xl mb-2">🔄</p>
                <p className="font-bold">ยังไม่มีคำขอแลกคาบ</p>
                <p className="text-sm mt-1">กด "ส่งคำขอแลกคาบ" เพื่อเริ่มต้น</p>
              </div>
            ) : (
              <div className="space-y-3">
                {swapRequests.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 space-y-1">
                        <p className="font-black text-slate-800">
                          {displayName(r.requester)} <span className="text-slate-400 font-normal">→</span> {displayName(r.target_teacher)}
                        </p>
                        <p className="text-slate-500 text-sm">
                          วัน{r.day} · คาบ {periodShort(r.period)} ↔ คาบ {periodShort(r.my_period)} · {r.subject} · {r.room}
                        </p>
                        {r.reason && (
                          <p className="text-slate-400 text-xs">เหตุผล: {r.reason}</p>
                        )}
                        <p className="text-slate-300 text-xs">ส่งเมื่อ {toThaiDate(r.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={r.status}/>
                        {r.status === "pending" && (
                          <div className="flex gap-2">
                            <button onClick={() => respondSwap(r.id, "approved")}
                              className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-xs">
                              ✅ ตกลง
                            </button>
                            <button onClick={() => respondSwap(r.id, "rejected")}
                              className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs border border-red-200">
                              ❌ ปฏิเสธ
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ TAB: สอนแทน ══ */}
        {tab === "sub" && (
          <>
            <div className="flex items-center justify-between">
              <p className="font-black text-slate-700">บันทึกการสอนแทน</p>
              <button onClick={() => setShowSubForm(v => !v)}
                className="px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-black text-sm shadow">
                + จัดครูสอนแทน
              </button>
            </div>

            {showSubForm && (
              <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-5 space-y-4">
                <p className="font-black text-teal-700 text-base">📋 จัดครูสอนแทนใหม่</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TeacherSelect label="ครูที่ลา *" value={subForm.absent_teacher_id} onChange={v => setSubForm(f => ({ ...f, absent_teacher_id: v }))} exclude={subForm.substitute_id}/>
                  <TeacherSelect label="ครูสอนแทน *" value={subForm.substitute_id} onChange={v => setSubForm(f => ({ ...f, substitute_id: v }))} exclude={subForm.absent_teacher_id}/>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วัน</label>
                    <select value={subForm.day} onChange={e => setSubForm(f => ({ ...f, day: e.target.value }))} className={sel}>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วันที่ *</label>
                    <input type="date" value={subForm.date} onChange={e => setSubForm(f => ({ ...f, date: e.target.value }))} className={inp}/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">คาบที่สอนแทน</label>
                    <select value={subForm.period} onChange={e => setSubForm(f => ({ ...f, period: e.target.value }))} className={sel}>
                      {PERIODS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วิชา</label>
                    <select value={subForm.subject} onChange={e => setSubForm(f => ({ ...f, subject: e.target.value }))} className={sel}>
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">ห้อง</label>
                    <select value={subForm.room} onChange={e => setSubForm(f => ({ ...f, room: e.target.value }))} className={sel}>
                      {ROOMS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">อ้างอิงใบลา</label>
                    <input value={subForm.leave_ref} onChange={e => setSubForm(f => ({ ...f, leave_ref: e.target.value }))}
                      placeholder="เลขที่ใบลา หรือ SUB-xxxx..." className={inp}/>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">หมายเหตุ</label>
                    <input value={subForm.note} onChange={e => setSubForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="หมายเหตุเพิ่มเติม..." className={inp}/>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={submitSub} disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-black text-sm disabled:opacity-50">
                    {saving ? "กำลังบันทึก..." : "💾 บันทึกและออกเอกสาร"}
                  </button>
                  <button onClick={() => setShowSubForm(false)}
                    className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm hover:bg-slate-50">
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {subRecords.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-slate-400">
                <p className="text-4xl mb-2">📋</p>
                <p className="font-bold">ยังไม่มีบันทึกสอนแทน</p>
                <p className="text-sm mt-1">กด "จัดครูสอนแทน" เพื่อเริ่มต้น</p>
              </div>
            ) : (
              <div className="space-y-3">
                {subRecords.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 space-y-1">
                      <p className="font-black text-slate-800">
                        <span className="text-slate-400 font-normal text-xs mr-1">{r.doc_no} ·</span>
                        {displayName(r.absent_teacher)} ลา <span className="text-slate-400">→</span> {displayName(r.substitute)} สอนแทน
                      </p>
                      <p className="text-slate-500 text-sm">
                        วัน{r.day} {toThaiDate(r.date)} · คาบ {periodShort(r.period)} · {r.subject} · {r.room}
                      </p>
                      {r.leave_ref && <p className="text-slate-400 text-xs">อ้างอิงใบลา: {r.leave_ref}</p>}
                    </div>
                    <button onClick={() => setDocPreview(r)}
                      className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 flex items-center gap-1.5">
                      📄 ดูคำสั่ง
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ TAB: สถิติ ══ */}
        {tab === "stats" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="font-black text-slate-700 mb-3">🔄 ครูที่ขอแลกคาบบ่อยที่สุด</p>
              {teachers.map(t => {
                const count = swapRequests.filter(r => r.requester_id === t.id).length;
                if (count === 0) return null;
                return (
                  <div key={t.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700 text-sm font-medium">{displayName(t)}</span>
                    <span className="text-blue-600 font-black text-sm">{count} ครั้ง</span>
                  </div>
                );
              })}
              {swapRequests.length === 0 && <p className="text-slate-400 text-sm text-center py-4">ยังไม่มีข้อมูล</p>}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="font-black text-slate-700 mb-3">📋 ครูที่สอนแทนบ่อยที่สุด</p>
              {teachers.map(t => {
                const count = subRecords.filter(r => r.substitute_id === t.id).length;
                if (count === 0) return null;
                return (
                  <div key={t.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700 text-sm font-medium">{displayName(t)}</span>
                    <span className="text-green-600 font-black text-sm">{count} ครั้ง</span>
                  </div>
                );
              })}
              {subRecords.length === 0 && <p className="text-slate-400 text-sm text-center py-4">ยังไม่มีข้อมูล</p>}
            </div>
          </div>
        )}
      </div>

      {/* ══ DOC PREVIEW MODAL ══ */}
      {docPreview && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDocPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center border-b-2 border-slate-800 pb-4 mb-5">
              <p className="font-black text-lg text-slate-800">คำสั่งจัดครูสอนแทน</p>
              <p className="text-slate-500 text-sm">โรงเรียนวัดเขียนเขต · เลขที่ {docPreview.doc_no}</p>
            </div>

            <p className="text-slate-700 text-sm leading-8 mb-4">
              ด้วย <strong>{displayName(docPreview.absent_teacher)}</strong> ติดภารกิจ/ลา
              ในวัน{docPreview.day} ที่ {toThaiDate(docPreview.date)} คาบที่ {periodShort(docPreview.period)}
              วิชา<strong>{docPreview.subject}</strong> ห้อง<strong>{docPreview.room}</strong>
              จึงขอให้ <strong>{displayName(docPreview.substitute)}</strong> ทำหน้าที่สอนแทนในคาบดังกล่าว
            </p>
            {docPreview.leave_ref && (
              <p className="text-slate-500 text-sm mb-1">อ้างอิงใบลาเลขที่: {docPreview.leave_ref}</p>
            )}
            {docPreview.note && (
              <p className="text-slate-500 text-sm">หมายเหตุ: {docPreview.note}</p>
            )}

            <div className="flex justify-between mt-8 pt-5 border-t border-slate-200">
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-10">ผู้อนุมัติ (หัวหน้าฝ่ายวิชาการ)</p>
                <p className="text-slate-700 text-sm">………………………………</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-10">ครูสอนแทน ({displayName(docPreview.substitute)})</p>
                <p className="text-slate-700 text-sm">………………………………</p>
              </div>
            </div>
            <p className="text-slate-300 text-xs text-center mt-3">ออกเมื่อ {todayThai()}</p>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  const w = window.open("","_blank","width=700,height=600");
                  if (!w) return;
                  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;900&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Sarabun',sans-serif;padding:30mm 20mm;font-size:14pt;line-height:2}
h2{text-align:center;font-size:16pt;font-weight:900;margin-bottom:4px}.sub{text-align:center;color:#555;font-size:12pt;margin-bottom:20px}
hr{border:2px solid #000;margin:12px 0}.sig{display:flex;justify-content:space-between;margin-top:60px;text-align:center}
.sig div{width:220px}.sig p{font-size:12pt;color:#555;margin-bottom:40px}.sig hr{width:200px;margin:0 auto;border:1px solid #333}
</style></head><body>
<h2>คำสั่งจัดครูสอนแทน</h2>
<p class="sub">โรงเรียนวัดเขียนเขต · เลขที่ ${docPreview.doc_no}</p>
<hr/>
<p style="margin-top:20px">ด้วย <strong>${displayName(docPreview.absent_teacher)}</strong> ติดภารกิจ/ลา ในวัน${docPreview.day} ที่ ${toThaiDate(docPreview.date)} คาบที่ ${periodShort(docPreview.period)} วิชา<strong>${docPreview.subject}</strong> ห้อง<strong>${docPreview.room}</strong> จึงขอให้ <strong>${displayName(docPreview.substitute)}</strong> ทำหน้าที่สอนแทนในคาบดังกล่าว</p>
${docPreview.leave_ref ? `<p style="margin-top:10px;color:#555;font-size:13pt">อ้างอิงใบลาเลขที่: ${docPreview.leave_ref}</p>` : ""}
${docPreview.note ? `<p style="color:#555;font-size:13pt">หมายเหตุ: ${docPreview.note}</p>` : ""}
<div class="sig">
  <div><p>ผู้อนุมัติ (หัวหน้าฝ่ายวิชาการ)</p><hr/></div>
  <div><p>ครูสอนแทน (${displayName(docPreview.substitute)})</p><hr/></div>
</div>
<p style="text-align:center;color:#aaa;font-size:11pt;margin-top:20px">ออกเมื่อ ${todayThai()}</p>
</body></html>`);
                  w.document.close();
                  w.onload = () => { w.focus(); w.print(); };
                }}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm hover:bg-slate-50">
                🖨️ พิมพ์
              </button>
              <button onClick={() => setDocPreview(null)}
                className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-black text-sm hover:bg-teal-600">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}