"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DAY_OF_WEEK_LABELS, DAY_OF_WEEK_LIST, dateToDayOfWeek,
  getCurrentAcademicYearId, loadTimeSlots, loadTeacherSchedule,
  findSwapCandidates, findBusyTeacherIds, autoAssignSubstitute,
  findGradeHeadEmails, notifyParties,
  type TimeSlot, type ScheduleEntry, type MiniTeacher,
} from "../../lib/timetable-substitution";

const supabase = createClient();

// ─── ประเภทข้อมูล ────────────────────────────────────────
type Teacher = { id: string; full_name: string; position?: string; role?: string; grade_level?: string | null; email?: string };

type ChangeRequest = {
  id: string;
  requester_id: string;
  classroom_id: string;
  time_slot_id: string;
  day_of_week: number;
  academic_year_id: string;
  old_teacher_id: string;
  new_teacher_id: string;
  old_subject_id?: string;
  new_subject_id?: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  reject_reason?: string;
  request_type: "swap" | "full_day" | "leave_substitute";
  linked_request_id?: string;
  same_grade?: boolean;
  created_at: string;
  responded_at?: string;
  classroom?: { id: string; room_name?: string; room_number?: string; grade_level_id: string };
  time_slot?: TimeSlot;
  subject?: { id: string; name: string };
};

interface SubstitutionSystemProps {
  teachers: any[];
  teacherMap: Record<string, any>;
}

const NON_TEACHING_ROLES = ["admin", "director", "deputy_director", "staff"];

function displayName(t?: Teacher | null) { return t?.full_name || "—"; }
function toThaiDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "รอตอบรับ", cls: "bg-amber-100 text-amber-700 border-amber-300" },
    approved: { label: "ตกลงแล้ว", cls: "bg-green-100 text-green-700 border-green-300" },
    rejected: { label: "ปฏิเสธ", cls: "bg-red-100 text-red-700 border-red-300" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border ${s.cls}`}>{s.label}</span>;
}
function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    swap: { label: "🔄 แลกคาบเจาะจง", cls: "bg-teal-100 text-teal-700 border-teal-300" },
    full_day: { label: "📅 แลกทั้งวัน (ลา)", cls: "bg-violet-100 text-violet-700 border-violet-300" },
    leave_substitute: { label: "🤒 สอนแทน (จากใบลา)", cls: "bg-sky-100 text-sky-700 border-sky-300" },
  };
  const t = map[type] ?? map.swap;
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border ${t.cls}`}>{t.label}</span>;
}

const inp = "w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors";
const sel = "w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm font-medium focus:border-blue-500 focus:outline-none appearance-none transition-colors";

export default function SubstitutionSystem({ teachers: teachersProp, teacherMap }: SubstitutionSystemProps) {
  const router = useRouter();

  const teachers: Teacher[] = useMemo(() => (teachersProp ?? [])
    .filter((u: any) => !NON_TEACHING_ROLES.includes(u.role ?? ""))
    .map((u: any) => ({
      id: u.id,
      full_name: u.full_name || `${u.title ?? ""} ${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim(),
      position: u.position, role: u.role, grade_level: u.grade_level ?? null, email: u.email,
    })), [teachersProp]);

  // ── current user (ครูที่ล็อกอิน) ─────────────────────
  const [me, setMe] = useState<Teacher | null>(null);
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [mySchedule, setMySchedule] = useState<ScheduleEntry[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [tab, setTab] = useState<"schedule" | "swap" | "history" | "stats">("schedule");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [swapMode, setSwapMode] = useState<"specific" | "fullday">("specific");

  // ── specific-swap state ───────────────────────────────
  const [mySlotEntryId, setMySlotEntryId] = useState("");
  const [theirDay, setTheirDay] = useState<number>(1);
  const [theirSlotId, setTheirSlotId] = useState("");
  const [candidates, setCandidates] = useState<Teacher[]>([]);
  const [targetTeacherId, setTargetTeacherId] = useState("");
  const [reason, setReason] = useState("");
  const [checkingCandidates, setCheckingCandidates] = useState(false);
  const [candidateWarning, setCandidateWarning] = useState("");

  // ── full-day (ลา/ไปราชการ) state ──────────────────────
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveRef, setLeaveRef] = useState("");
  const [assignments, setAssignments] = useState<{ entry: ScheduleEntry; suggestedTeacherId: string | null; sameGrade: boolean; overrideTeacherId: string; freeOptions: Teacher[] }[]>([]);
  const [calculating, setCalculating] = useState(false);

  // ── โหลดข้อมูลตั้งต้น ──────────────────────────────────
  const init = useCallback(async () => {
    setLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    let profile: Teacher | null = null;
    if (authUser) {
      const { data } = await supabase.from("users").select("id,title,first_name,last_name,full_name,email,role,position,grade_level").eq("auth_id", authUser.id).maybeSingle();
      if (data) profile = { id: data.id, full_name: data.full_name || `${data.title ?? ""} ${data.first_name ?? ""} ${data.last_name ?? ""}`.replace(/\s+/g, " ").trim(), position: data.position, role: data.role, grade_level: data.grade_level, email: data.email };
    }
    setMe(profile);

    const fy = await getCurrentAcademicYearId();
    setAcademicYearId(fy);
    const slots = await loadTimeSlots();
    setTimeSlots(slots);

    if (profile?.id && fy) {
      const sched = await loadTeacherSchedule(profile.id, fy);
      setMySchedule(sched.sort((a, b) => a.day_of_week - b.day_of_week || (a.time_slot?.slot_number ?? 0) - (b.time_slot?.slot_number ?? 0)));
    }
    setLoading(false);
  }, []);
  useEffect(() => { init(); }, [init]);

  // ── โหลดคำขอที่เกี่ยวข้องกับฉัน ────────────────────────
  const loadRequests = useCallback(async () => {
    if (!me?.id) return;
    const { data } = await supabase
      .from("timetable_change_requests")
      .select(`*, classroom:classrooms(id,room_name,room_number,grade_level_id), time_slot:time_slots(*), subject:subjects(id,name)`)
      .or(`requester_id.eq.${me.id},old_teacher_id.eq.${me.id},new_teacher_id.eq.${me.id}`)
      .order("created_at", { ascending: false });
    setRequests((data as unknown as ChangeRequest[]) ?? []);
  }, [me?.id]);
  useEffect(() => { loadRequests(); }, [loadRequests]);

  const teacherById = useCallback((id?: string) => teachers.find(t => t.id === id) ?? (teacherMap?.[id ?? ""] ?? null), [teachers, teacherMap]);

  // ── STEP 2 (specific mode): หาผู้ที่มีคาบว่างตรงกัน ─────
  useEffect(() => {
    (async () => {
      setCandidateWarning(""); setCandidates([]); setTargetTeacherId("");
      if (swapMode !== "specific" || !mySlotEntryId || !theirSlotId || !academicYearId || !me?.id) return;
      const myEntry = mySchedule.find(e => e.id === mySlotEntryId);
      if (!myEntry) return;
      setCheckingCandidates(true);
      // ตรวจว่าฉันว่างในคาบที่ต้องการจริงหรือไม่
      const busyMeAtTarget = await findBusyTeacherIds(theirDay, theirSlotId, academicYearId);
      if (busyMeAtTarget.has(me.id)) {
        setCandidateWarning("⚠️ คุณติดสอนอยู่แล้วในวัน/คาบที่เลือก ไม่สามารถแลกคาบนี้ได้");
        setCheckingCandidates(false);
        return;
      }
      const ids = await findSwapCandidates({
        myDayOfWeek: myEntry.day_of_week, myTimeSlotId: myEntry.time_slot_id,
        theirDayOfWeek: theirDay, theirTimeSlotId: theirSlotId,
        academicYearId, myTeacherId: me.id,
      });
      const found = ids.map(id => teacherById(id)).filter(Boolean) as Teacher[];
      setCandidates(found);
      if (found.length === 0) setCandidateWarning("ไม่พบครูที่มีคาบตรงกับที่คุณต้องการ และว่างในคาบของคุณพร้อมกัน");
      setCheckingCandidates(false);
    })();
  }, [swapMode, mySlotEntryId, theirDay, theirSlotId, academicYearId, me?.id]); // eslint-disable-line

  // ── STEP (fullday mode): คำนวณจัดครูสอนแทนอัตโนมัติทุกคาบ ─
  async function calculateFullDayAssignments() {
    if (!leaveDate || !academicYearId || !me?.id) { alert("กรุณาเลือกวันที่"); return; }
    const dow = dateToDayOfWeek(leaveDate);
    if (!dow) { alert("วันที่เลือกเป็นวันเสาร์-อาทิตย์ ไม่มีคาบสอน"); return; }
    setCalculating(true);
    const todaysPeriods = mySchedule.filter(e => e.day_of_week === dow);
    const result: typeof assignments = [];
    for (const entry of todaysPeriods) {
      const gradeLevelId = entry.classroom?.grade_level_id ?? null;
      const { teacherId, sameGrade } = await autoAssignSubstitute({
        dayOfWeek: dow, timeSlotId: entry.time_slot_id, academicYearId,
        absentTeacherId: me.id, classroomGradeLevelId: gradeLevelId, allTeachers: teachers as MiniTeacher[],
      });
      const busy = await findBusyTeacherIds(dow, entry.time_slot_id, academicYearId);
      const freeOptions = teachers.filter(t => t.id !== me.id && !busy.has(t.id));
      result.push({ entry, suggestedTeacherId: teacherId, sameGrade, overrideTeacherId: teacherId ?? "", freeOptions });
    }
    setAssignments(result);
    setCalculating(false);
  }

  // ── ส่งคำขอแลกคาบเจาะจง (2 แถวผูกกัน) ───────────────────
  async function submitSpecificSwap() {
    if (!me?.id || !academicYearId) return;
    const myEntry = mySchedule.find(e => e.id === mySlotEntryId);
    if (!myEntry || !targetTeacherId) { alert("กรุณาเลือกคาบของคุณและครูที่ต้องการแลกด้วย"); return; }

    setSaving(true);
    // หา entry ของฝั่งเป้าหมายในวัน/คาบที่ต้องการ เพื่อดึง classroom_id/subject_id จริง
    const { data: theirRows } = await supabase
      .from("timetable_entries")
      .select("*")
      .eq("academic_year_id", academicYearId)
      .eq("day_of_week", theirDay)
      .eq("time_slot_id", theirSlotId)
      .or(`teacher_id.eq.${targetTeacherId},teacher_id_2.eq.${targetTeacherId}`)
      .limit(1);
    const theirEntry = theirRows?.[0];
    if (!theirEntry) { alert("ไม่พบคาบสอนของครูที่เลือกในวัน/คาบดังกล่าว"); setSaving(false); return; }

    const linkedId = crypto.randomUUID();
    const { error } = await supabase.from("timetable_change_requests").insert([
      {
        requester_id: me.id, classroom_id: myEntry.classroom_id, time_slot_id: myEntry.time_slot_id,
        day_of_week: myEntry.day_of_week, academic_year_id: academicYearId,
        old_subject_id: myEntry.subject_id, old_teacher_id: me.id,
        new_subject_id: myEntry.subject_id, new_teacher_id: targetTeacherId,
        status: "pending", note: reason, request_type: "swap", linked_request_id: linkedId,
      },
      {
        requester_id: me.id, classroom_id: theirEntry.classroom_id, time_slot_id: theirSlotId,
        day_of_week: theirDay, academic_year_id: academicYearId,
        old_subject_id: theirEntry.subject_id, old_teacher_id: targetTeacherId,
        new_subject_id: theirEntry.subject_id, new_teacher_id: me.id,
        status: "pending", note: reason, request_type: "swap", linked_request_id: linkedId,
      },
    ]);
    setSaving(false);
    if (error) { alert("❌ " + error.message); return; }

    // แจ้งเตือน: ครูที่ขอแลกด้วย + หัวหน้าสายชั้นทั้งสองฝั่ง
    const target = teacherById(targetTeacherId);
    const heads1 = await findGradeHeadEmails(myEntry.classroom?.grade_level_id ?? null);
    const heads2 = await findGradeHeadEmails(theirEntry.classroom_id ? (mySchedule.find(x => x.classroom_id === theirEntry.classroom_id)?.classroom?.grade_level_id ?? null) : null);
    await notifyParties({
      to: [target?.email, ...heads1, ...heads2].filter(Boolean) as string[],
      subject: `[คำขอแลกคาบ] จาก ${displayName(me)}`,
      html: `<p>${displayName(me)} ขอแลกคาบกับคุณ (${DAY_OF_WEEK_LABELS[myEntry.day_of_week]} คาบ ${myEntry.time_slot?.slot_label ?? ""} ↔ ${DAY_OF_WEEK_LABELS[theirDay]} คาบ ${timeSlots.find(s => s.id === theirSlotId)?.slot_label ?? ""})<br/>เหตุผล: ${reason || "-"}<br/>กรุณาเข้าสู่ระบบเพื่อตอบรับ/ปฏิเสธ</p>`,
    });

    setShowForm(false); setMySlotEntryId(""); setTheirSlotId(""); setTargetTeacherId(""); setReason("");
    await loadRequests();
  }

  // ── ส่งคำขอแลกทั้งวัน (หลายแถว ผูก linked_request_id เดียวกัน) ─
  async function submitFullDaySwap() {
    if (!me?.id || !academicYearId || assignments.length === 0) return;
    if (assignments.some(a => !a.overrideTeacherId)) { alert("กรุณาเลือกครูสอนแทนให้ครบทุกคาบ"); return; }
    setSaving(true);
    const linkedId = crypto.randomUUID();
    const dow = dateToDayOfWeek(leaveDate)!;
    const rows = assignments.map(a => ({
      requester_id: me.id, classroom_id: a.entry.classroom_id, time_slot_id: a.entry.time_slot_id,
      day_of_week: dow, academic_year_id: academicYearId,
      old_subject_id: a.entry.subject_id, old_teacher_id: me.id,
      new_subject_id: a.entry.subject_id, new_teacher_id: a.overrideTeacherId,
      status: "pending", note: `${leaveRef ? `[อ้างอิง: ${leaveRef}] ` : ""}ขอแลกคาบทั้งวัน (${leaveDate})`,
      request_type: "full_day", linked_request_id: linkedId,
      same_grade: a.overrideTeacherId === a.suggestedTeacherId ? a.sameGrade : null,
    }));
    const { error } = await supabase.from("timetable_change_requests").insert(rows);
    setSaving(false);
    if (error) { alert("❌ " + error.message); return; }

    // แจ้งเตือนครูสอนแทนทุกคน + หัวหน้าสายชั้น
    for (const a of assignments) {
      const sub = teacherById(a.overrideTeacherId);
      const heads = await findGradeHeadEmails(a.entry.classroom?.grade_level_id ?? null);
      await notifyParties({
        to: [sub?.email, ...heads].filter(Boolean) as string[],
        subject: `[ขอให้สอนแทน] ${DAY_OF_WEEK_LABELS[dow]} คาบ ${a.entry.time_slot?.slot_label ?? ""}`,
        html: `<p>${displayName(me)} ขอให้คุณสอนแทนวัน${DAY_OF_WEEK_LABELS[dow]} (${leaveDate}) คาบ ${a.entry.time_slot?.slot_label ?? ""} วิชา ${a.entry.subject?.name ?? ""} ห้อง ${a.entry.classroom?.room_name ?? a.entry.classroom?.room_number ?? ""}<br/>กรุณาเข้าสู่ระบบเพื่อตอบรับ/ปฏิเสธ</p>`,
      });
    }

    setShowForm(false); setLeaveDate(""); setLeaveRef(""); setAssignments([]);
    await loadRequests();
  }

  // ── ตอบรับ/ปฏิเสธ ────────────────────────────────────
  async function respond(r: ChangeRequest, action: "approved" | "rejected") {
    const updates: any = { status: action, responded_at: new Date().toISOString() };
    if (r.request_type === "swap" && r.linked_request_id) {
      await supabase.from("timetable_change_requests").update(updates).eq("linked_request_id", r.linked_request_id);
    } else {
      await supabase.from("timetable_change_requests").update(updates).eq("id", r.id);
    }
    await loadRequests();
  }

  const stats = {
    total: requests.length,
    approved: requests.filter(r => r.status === "approved").length,
    pending: requests.filter(r => r.status === "pending").length,
    fullDay: requests.filter(r => r.request_type === "full_day" || r.request_type === "leave_substitute").length,
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400 font-bold animate-pulse">กำลังโหลด...</p></div>;
  }
  if (!me) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-center p-6"><div><p className="text-4xl mb-2">🔒</p><p className="text-slate-500 font-bold">ไม่พบข้อมูลครูที่ล็อกอิน กรุณาเข้าสู่ระบบใหม่</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10" style={{ fontFamily: "'Sarabun','IBM Plex Sans Thai',sans-serif" }}>

      {/* Header + ปุ่มย้อนกลับหน้าแดชบอร์ด */}
      <div className="bg-gradient-to-br from-teal-500 to-cyan-600 px-4 sm:px-6 py-5 text-white flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")} className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xl shrink-0">🏠</button>
        <div>
          <h1 className="text-xl sm:text-2xl font-black">🔄 แลกคาบ &amp; สอนแทน</h1>
          <p className="text-teal-100 text-xs sm:text-sm mt-0.5">{displayName(me)} · {me.position}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-4">
        {[
          { label: "คำขอทั้งหมด", value: stats.total, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
          { label: "ตกลงแล้ว", value: stats.approved, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
          { label: "รอตอบรับ", value: stats.pending, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
          { label: "สอนแทนทั้งวัน/จากใบลา", value: stats.fullDay, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border-2 ${s.border} rounded-2xl p-4 text-center shadow-sm`}>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-500 text-xs font-bold mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mx-4 mb-4 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {[["schedule", "🗓️ ตารางสอนของฉัน"], ["swap", "🔄 แลกคาบ / สอนแทน"], ["history", "📋 ประวัติคำขอ"], ["stats", "📊 สถิติ"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`flex-1 min-w-[110px] py-2.5 rounded-xl text-sm font-black transition-all ${tab === k ? "bg-teal-500 text-white shadow" : "text-slate-500 hover:text-teal-600"}`}>{l}</button>
        ))}
      </div>

      <div className="px-4 space-y-4 max-w-4xl mx-auto">

        {/* ══ TAB: ตารางสอนของฉัน ══ */}
        {tab === "schedule" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3"><p className="font-black text-slate-700">🗓️ ตารางสอนของ {displayName(me)}</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead><tr className="bg-slate-50 border-b"><th className="px-3 py-2 text-left font-black text-slate-500">คาบ</th>{DAY_OF_WEEK_LIST.map(d => <th key={d} className="px-3 py-2 text-center font-black text-slate-500">{DAY_OF_WEEK_LABELS[d]}</th>)}</tr></thead>
                <tbody>
                  {timeSlots.map(slot => (
                    <tr key={slot.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold text-slate-600 whitespace-nowrap">{slot.slot_label}</td>
                      {DAY_OF_WEEK_LIST.map(d => {
                        const e = mySchedule.find(x => x.day_of_week === d && x.time_slot_id === slot.id);
                        return (
                          <td key={d} className="px-3 py-2 text-center">
                            {e ? (
                              <div className="bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                                <p className="font-bold text-teal-700 leading-tight">{e.subject?.name ?? "-"}</p>
                                <p className="text-slate-400 text-[10px]">{e.classroom?.room_name ?? e.classroom?.room_number ?? ""}</p>
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TAB: แลกคาบ / สอนแทน ══ */}
        {tab === "swap" && (
          <>
            <div className="flex items-center justify-between">
              <p className="font-black text-slate-700">ส่งคำขอแลกคาบ / สอนแทน</p>
              <button onClick={() => setShowForm(v => !v)} className="px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-black text-sm shadow">+ ส่งคำขอ</button>
            </div>

            {showForm && (
              <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-5 space-y-4">
                <div className="flex gap-2">
                  <button onClick={() => setSwapMode("specific")} className={`flex-1 py-2.5 rounded-xl font-black text-sm border-2 ${swapMode === "specific" ? "bg-teal-500 border-teal-500 text-white" : "bg-white border-slate-200 text-slate-600"}`}>🎯 แลกคาบเจาะจง</button>
                  <button onClick={() => setSwapMode("fullday")} className={`flex-1 py-2.5 rounded-xl font-black text-sm border-2 ${swapMode === "fullday" ? "bg-violet-500 border-violet-500 text-white" : "bg-white border-slate-200 text-slate-600"}`}>📅 แลกทั้งวัน (ลา/ไปราชการ)</button>
                </div>

                {/* ── โหมดเจาะจง ── */}
                {swapMode === "specific" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">1) คาบของคุณที่จะยกให้ *</label>
                      <select value={mySlotEntryId} onChange={e => setMySlotEntryId(e.target.value)} className={sel}>
                        <option value="">— เลือกคาบของคุณ —</option>
                        {mySchedule.map(e => (
                          <option key={e.id} value={e.id}>{DAY_OF_WEEK_LABELS[e.day_of_week]} คาบ {e.time_slot?.slot_label} · {e.subject?.name} · {e.classroom?.room_name ?? e.classroom?.room_number}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">2) วันที่ต้องการแลกด้วย *</label>
                        <select value={theirDay} onChange={e => setTheirDay(Number(e.target.value))} className={sel}>
                          {DAY_OF_WEEK_LIST.map(d => <option key={d} value={d}>{DAY_OF_WEEK_LABELS[d]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">คาบที่ต้องการ *</label>
                        <select value={theirSlotId} onChange={e => setTheirSlotId(e.target.value)} className={sel}>
                          <option value="">— เลือกคาบ —</option>
                          {timeSlots.map(s => <option key={s.id} value={s.id}>{s.slot_label}</option>)}
                        </select>
                      </div>
                    </div>

                    {checkingCandidates && <p className="text-slate-400 text-sm animate-pulse">⏳ กำลังค้นหาครูที่มีคาบว่างตรงกัน...</p>}
                    {candidateWarning && <p className="text-red-500 text-sm font-bold">{candidateWarning}</p>}
                    {candidates.length > 0 && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">3) เลือกครูที่จะแลกด้วย ({candidates.length} คนว่างตรงกัน)</label>
                        <select value={targetTeacherId} onChange={e => setTargetTeacherId(e.target.value)} className={sel}>
                          <option value="">— เลือกครู —</option>
                          {candidates.map(t => <option key={t.id} value={t.id}>{displayName(t)}{t.position ? ` · ${t.position}` : ""}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">เหตุผล</label>
                      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="ระบุเหตุผล..." className={inp} />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={submitSpecificSwap} disabled={saving || !targetTeacherId} className="flex-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-black text-sm disabled:opacity-50">{saving ? "กำลังส่ง..." : "📤 ส่งคำขอแลกคาบ"}</button>
                      <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm hover:bg-slate-50">ยกเลิก</button>
                    </div>
                  </div>
                )}

                {/* ── โหมดทั้งวัน ── */}
                {swapMode === "fullday" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">วันที่ลา/ไปราชการ *</label>
                        <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">อ้างอิงใบลา (ถ้ามี)</label>
                        <input value={leaveRef} onChange={e => setLeaveRef(e.target.value)} placeholder="เลขที่ใบลา..." className={inp} />
                      </div>
                    </div>
                    <button onClick={calculateFullDayAssignments} disabled={calculating || !leaveDate} className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-black text-sm disabled:opacity-50">
                      {calculating ? "⏳ กำลังคำนวณ..." : "🧮 คำนวณจัดครูสอนแทนอัตโนมัติ (สายชั้นเดียวกันก่อน)"}
                    </button>

                    {assignments.length > 0 && (
                      <div className="space-y-2">
                        {assignments.map((a, i) => (
                          <div key={a.entry.id} className="border-2 border-slate-200 rounded-xl p-3">
                            <p className="font-bold text-slate-700 text-sm">{DAY_OF_WEEK_LABELS[a.entry.day_of_week]} คาบ {a.entry.time_slot?.slot_label} · {a.entry.subject?.name} · {a.entry.classroom?.room_name ?? a.entry.classroom?.room_number}</p>
                            {a.suggestedTeacherId ? (
                              <p className="text-xs mt-1">
                                <span className={a.sameGrade ? "text-green-600 font-bold" : "text-amber-600 font-bold"}>{a.sameGrade ? "✅ ครูสายชั้นเดียวกันที่ว่าง" : "⚠️ ไม่มีครูสายชั้นเดียวกันว่าง — เลือกครูว่างทั้งโรงเรียนแทน"}</span>
                              </p>
                            ) : <p className="text-xs text-red-500 font-bold mt-1">❌ ไม่พบครูว่างในคาบนี้ กรุณาเลือกเอง</p>}
                            <select value={a.overrideTeacherId} onChange={e => setAssignments(prev => prev.map((x, xi) => xi === i ? { ...x, overrideTeacherId: e.target.value } : x))} className={sel + " mt-2"}>
                              <option value="">— เลือกครูสอนแทน —</option>
                              {a.freeOptions.map(t => <option key={t.id} value={t.id}>{displayName(t)}{t.grade_level === a.entry.classroom?.grade_level_id ? " (สายชั้นเดียวกัน)" : ""}</option>)}
                            </select>
                          </div>
                        ))}
                        <button onClick={submitFullDaySwap} disabled={saving} className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-black text-sm disabled:opacity-50">{saving ? "กำลังส่ง..." : "📤 ส่งคำขอสอนแทนทั้งวัน"}</button>
                      </div>
                    )}
                    <button onClick={() => setShowForm(false)} className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm hover:bg-slate-50">ยกเลิก</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══ TAB: ประวัติคำขอ ══ */}
        {tab === "history" && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-slate-400"><p className="text-4xl mb-2">📋</p><p className="font-bold">ยังไม่มีคำขอ</p></div>
            ) : requests.map(r => {
              const counterpartId = r.old_teacher_id === me.id ? r.new_teacher_id : r.old_teacher_id;
              const counterpart = teacherById(counterpartId);
              const iAmTarget = r.new_teacher_id === me.id;
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap"><TypeBadge type={r.request_type} /><StatusBadge status={r.status} /></div>
                      <p className="font-black text-slate-800">{DAY_OF_WEEK_LABELS[r.day_of_week]} คาบ {r.time_slot?.slot_label} · {r.subject?.name} · {r.classroom?.room_name ?? r.classroom?.room_number}</p>
                      <p className="text-slate-500 text-sm">คู่สลับ/ครูสอนแทน: {displayName(counterpart)}</p>
                      {r.note && <p className="text-slate-400 text-xs">หมายเหตุ: {r.note}</p>}
                      <p className="text-slate-300 text-xs">ส่งเมื่อ {toThaiDateTime(r.created_at)}</p>
                    </div>
                    {iAmTarget && r.status === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => respond(r, "approved")} className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-xs">✅ ตกลง</button>
                        <button onClick={() => respond(r, "rejected")} className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs border border-red-200">❌ ปฏิเสธ</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TAB: สถิติ ══ */}
        {tab === "stats" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="font-black text-slate-700 mb-3">📊 สรุปคำขอของฉัน</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["ทั้งหมด", stats.total, "text-blue-600"], ["ตกลงแล้ว", stats.approved, "text-green-600"], ["รอตอบรับ", stats.pending, "text-amber-600"], ["สอนแทนทั้งวัน/ใบลา", stats.fullDay, "text-violet-600"]].map(([label, val, color]) => (
                <div key={label as string} className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200">
                  <p className={`text-2xl font-black ${color}`}>{val}</p>
                  <p className="text-slate-500 text-xs font-bold mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}