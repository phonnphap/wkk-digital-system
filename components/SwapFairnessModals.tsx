"use client";

// ══════════════════════════════════════════════════════════════════════════
// components/SwapFairnessModals.tsx
// ── 2 Modal สำหรับหน้า "แลกคาบ & สอนแทน" ─────────────────────────────────
//   1) SpecificPeriodSwapModal  → 🎯 แลกคาบแบบเจาะจง
//   2) WholeDaySwapModal        → 🗓️ ขอแลกคาบทั้งวัน (ลา/ไปราชการ)
//
// วิธีใช้ในหน้า SubstitutionPage เดิม: ดูตัวอย่างท้ายไฟล์นี้
// ══════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isTeacherOnLeave,
  autoAssignWholeDay,
  findGradeHeadEmails,
  notifySwapParties,
  type LeaveRow,
} from "@/lib/swap-fairness";

const supabase = createClient();

// ══════════════════════════════════════════════════════════════════════════
// ── Modal 1: 🎯 แลกคาบแบบเจาะจง ─────────────────────────────────────────
// เลือกคาบของตัวเอง + วันที่ -> ระบบแสดงครูทุกคนที่ว่างตรงกับคาบนั้นเป๊ะๆ
// กดขอ -> insert class_swap_requests (swap_type='cover', target_entry_id=null)
// ══════════════════════════════════════════════════════════════════════════

export function SpecificPeriodSwapModal({
  user,
  myEntries,
  allEntries,
  teachers,
  leaveRequests,
  academicYearId,
  onSave,
  onClose,
  fullNameFn,
  thaiDateFn,
  TH_DAYS,
}: {
  user: any;
  myEntries: any[];
  allEntries: any[];
  teachers: any[];
  leaveRequests: LeaveRow[];
  academicYearId: string;
  onSave: () => void;
  onClose: () => void;
  fullNameFn: (u: any) => string;
  thaiDateFn: (s?: string) => string;
  TH_DAYS: string[];
}) {
  const [myEntryId, setMyEntryId] = useState("");
  const [swapDate, setSwapDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  const myEntry = myEntries.find((e) => e.id === myEntryId);

  const freeTeachers = useMemo(() => {
    if (!myEntry) return [];
    return teachers.filter((t) => {
      if (t.id === user.id) return false;
      if (isTeacherOnLeave(t.id, swapDate, leaveRequests)) return false;
      const busy = allEntries.some(
        (e) =>
          e.teacher_id === t.id &&
          e.day_of_week === myEntry.day_of_week &&
          e.time_slot_id === myEntry.time_slot_id
      );
      return !busy;
    });
  }, [myEntry, teachers, allEntries, leaveRequests, swapDate, user.id]);

  async function requestCover(targetTeacherId: string) {
    if (!myEntry) return;
    setSending(targetTeacherId);
    const { error } = await supabase.from("class_swap_requests").insert([
      {
        requester_id: user.id,
        target_teacher_id: targetTeacherId,
        requester_entry_id: myEntry.id,
        target_entry_id: null, // ครูเป้าหมายว่างคาบนี้ ไม่มีคาบเดิมมาแลกคืน
        swap_date: swapDate,
        reason: reason || "ขอครูช่วยสอนแทนคาบนี้ (มีคาบว่างตรงกัน)",
        status: "pending",
        academic_year_id: academicYearId,
        swap_type: "cover",
      },
    ]);
    setSending(null);
    if (error) {
      alert("❌ " + error.message);
      return;
    }

    const target = teachers.find((t) => t.id === targetTeacherId);
    const gradeHeadEmails = findGradeHeadEmails(user.grade_level, teachers);
    await notifySwapParties({
      toTeacherEmails: [target?.email],
      gradeHeadEmails,
      subject: `[ขอแลกคาบเจาะจง] ${fullNameFn(user)} ขอให้ ${fullNameFn(target)} ช่วยสอนแทน`,
      html: `<p>${fullNameFn(user)} ขอให้คุณช่วยสอนแทนคาบ ${myEntry.time_slot?.slot_label} วันที่ ${thaiDateFn(
        swapDate
      )}
             วิชา ${myEntry.subject?.name} ห้อง ${myEntry.classroom?.room_name}</p>
             ${reason ? `<p>เหตุผล: ${reason}</p>` : ""}`,
    });
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">🎯 ขอแลกคาบแบบเจาะจง</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              วันที่ต้องการแลก
            </label>
            <input
              type="date"
              value={swapDate}
              onChange={(e) => setSwapDate(e.target.value)}
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              เลือกคาบของฉันที่ต้องการแลก
            </label>
            <select
              value={myEntryId}
              onChange={(e) => setMyEntryId(e.target.value)}
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium bg-white focus:outline-none focus:border-blue-500"
            >
              <option value="">— เลือกคาบ —</option>
              {myEntries.map((e) => (
                <option key={e.id} value={e.id}>
                  {TH_DAYS[e.day_of_week]} {e.time_slot?.slot_label} — {e.subject?.name} ({e.classroom?.room_name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              เหตุผล (ถ้ามี)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium resize-none focus:outline-none focus:border-blue-500"
            />
          </div>

          {myEntry && (
            <div>
              <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                ครูที่ว่างคาบ {myEntry.time_slot?.slot_label} วัน{TH_DAYS[myEntry.day_of_week]} ({freeTeachers.length}{" "}
                คน)
              </h4>
              {freeTeachers.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center bg-slate-50 rounded-xl">
                  ไม่มีครูว่างตรงกับคาบนี้ในวันที่เลือก
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {freeTeachers.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-700">{fullNameFn(t)}</p>
                        {t.position && <p className="text-xs text-slate-400">{t.position}</p>}
                      </div>
                      <button
                        onClick={() => requestCover(t.id)}
                        disabled={sending === t.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                      >
                        {sending === t.id ? "กำลังส่ง..." : "📤 ขอกับครูคนนี้"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Modal 2: 🗓️ ขอแลกคาบทั้งวัน (ลา/ไปราชการ) ──────────────────────────
// ครูเลือกวันที่ลา -> ระบบคำนวณอัตโนมัติ ("จัดอัตโนมัติ") ตามกติกาความเท่าเทียม
// ครูตรวจสอบ/แก้ไขได้ก่อนกดยืนยัน -> insert substitute_records + แจ้งเตือน
// ══════════════════════════════════════════════════════════════════════════

export function WholeDaySwapModal({
  user,
  teachers,
  allEntries,
  timeSlots,
  leaveRequests,
  subRecords,
  academicYearId,
  onSave,
  onClose,
  fullNameFn,
  thaiDateFn,
  TH_DAYS,
}: {
  user: any;
  teachers: any[];
  allEntries: any[];
  timeSlots: any[];
  leaveRequests: LeaveRow[];
  subRecords: any[];
  academicYearId: string;
  onSave: () => void;
  onClose: () => void;
  fullNameFn: (u: any) => string;
  thaiDateFn: (s?: string) => string;
  TH_DAYS: string[];
}) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [reasonType, setReasonType] = useState<"leave" | "official">("leave");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ entry: any; subId: string | null }[] | null>(null);
  const [saving, setSaving] = useState(false);

  const workingSlots = useMemo(() => timeSlots.filter((s: any) => !s.is_break), [timeSlots]);

  function runAutoAssign() {
    const dow = new Date(date + "T00:00:00").getDay();
    const myDayEntries = allEntries.filter((e) => e.teacher_id === user.id && e.day_of_week === dow);
    if (myDayEntries.length === 0) {
      alert("ไม่มีคาบสอนของคุณในวันนี้ (ตามตารางสอน)");
      setPreview([]);
      return;
    }
    const assigned = autoAssignWholeDay(
      user.id,
      date,
      dow,
      myDayEntries,
      allEntries,
      teachers,
      workingSlots,
      leaveRequests,
      subRecords
    );
    setPreview(myDayEntries.map((e) => ({ entry: e, subId: assigned[e.id] ?? null })));
  }

  function overrideRow(entryId: string, teacherId: string) {
    setPreview((prev) => prev!.map((p) => (p.entry.id === entryId ? { ...p, subId: teacherId || null } : p)));
  }

  async function confirmSubmit() {
    if (!preview || preview.length === 0) return;
    setSaving(true);
    const records = preview.map((p) => ({
      absent_teacher_id: user.id,
      substitute_teacher_id: p.subId,
      timetable_entry_id: p.entry.id,
      substitute_date: date,
      time_slot_id: p.entry.time_slot_id,
      classroom_id: p.entry.classroom_id,
      subject_id: p.entry.subject_id,
      hours_count: 1,
      status: p.subId ? "assigned" : "unassigned",
      note: note || (reasonType === "leave" ? "ลา (จัดสอนแทนอัตโนมัติ)" : "ไปราชการ (จัดสอนแทนอัตโนมัติ)"),
      academic_year_id: academicYearId,
    }));
    const { error } = await supabase.from("substitute_records").insert(records);
    setSaving(false);
    if (error) {
      alert("❌ " + error.message);
      return;
    }

    const gradeHeadEmails = findGradeHeadEmails(user.grade_level, teachers);
    for (const p of preview) {
      if (!p.subId) continue;
      const sub = teachers.find((t) => t.id === p.subId);
      await notifySwapParties({
        toTeacherEmails: [sub?.email],
        gradeHeadEmails,
        subject: `[จัดสอนแทนอัตโนมัติ] คุณได้รับมอบหมายสอนแทน ${fullNameFn(user)}`,
        html: `<p>ระบบจัดให้คุณสอนแทน ${fullNameFn(user)} คาบ ${p.entry.time_slot?.slot_label}
               วันที่ ${thaiDateFn(date)} วิชา ${p.entry.subject?.name} ห้อง ${p.entry.classroom?.room_name}</p>`,
      });
    }
    const unassignedCount = preview.filter((p) => !p.subId).length;
    if (unassignedCount > 0) {
      alert(`✅ จัดสอนแทนเรียบร้อย แต่มี ${unassignedCount} คาบที่ไม่มีครูว่างจริงๆ กรุณาแจ้งแอดมินจัดเพิ่ม`);
    }
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">🗓️ ขอแลกคาบทั้งวัน (ลา/ไปราชการ)</h3>
            <p className="text-xs text-slate-400">
              ระบบจะจัดครูสายชั้นเดียวกันที่ว่างมากที่สุด และสอนแทนน้อยที่สุดก่อน เพื่อความเท่าเทียม
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                วันที่ลา/ไปราชการ
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPreview(null);
                }}
                className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                ประเภท
              </label>
              <select
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value as any)}
                className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium bg-white"
              >
                <option value="leave">ลา</option>
                <option value="official">ไปราชการ</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              หมายเหตุ (ถ้ามี)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium"
            />
          </div>

          {!preview && (
            <button
              onClick={runAutoAssign}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"
            >
              🤖 คำนวณจัดครูสอนแทนอัตโนมัติ
            </button>
          )}

          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  ผลการจัดอัตโนมัติ (ตรวจสอบ/แก้ไขได้)
                </h4>
                <button onClick={runAutoAssign} className="text-xs text-indigo-600 font-bold underline">
                  🔄 คำนวณใหม่
                </button>
              </div>
              {preview.map((p) => (
                <div key={p.entry.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <div className="shrink-0 w-16 text-center">
                    <div className="text-xs font-bold text-blue-700">{p.entry.time_slot?.slot_label}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm truncate">{p.entry.subject?.name}</div>
                    <div className="text-xs text-slate-400">{p.entry.classroom?.room_name}</div>
                  </div>
                  <div className="shrink-0 w-48">
                    <select
                      value={p.subId ?? ""}
                      onChange={(e) => overrideRow(p.entry.id, e.target.value)}
                      className="w-full border-2 border-blue-200 rounded-xl px-2 py-2 text-sm bg-white"
                    >
                      <option value="">— ไม่มีครูว่าง —</option>
                      {teachers
                        .filter((t) => t.id !== user.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {fullNameFn(t)}
                          </option>
                        ))}
                    </select>
                  </div>
                  {!p.subId && <span className="text-xs font-bold text-red-500 shrink-0">⚠️ ว่าง</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        {preview && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-medium"
            >
              ยกเลิก
            </button>
            <button
              onClick={confirmSubmit}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "✅ ยืนยันการจัดสอนแทน"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── ตัวอย่างการเรียกใช้ในหน้า SubstitutionPage เดิม ──────────────────────
// ══════════════════════════════════════════════════════════════════════════
//
// import { SpecificPeriodSwapModal, WholeDaySwapModal } from "@/components/SwapFairnessModals";
//
// 1) เพิ่ม state:
//    const [showSpecificModal, setShowSpecificModal] = useState(false);
//    const [showWholeDayModal, setShowWholeDayModal] = useState(false);
//
// 2) ในแท็บ "แลกคาบ" ข้างปุ่ม "+ ขอแลกคาบใหม่" เดิม เพิ่ม:
//    <button onClick={()=>setShowSpecificModal(true)} className="px-4 py-2 bg-emerald-600 ...">
//      🎯 แลกคาบแบบเจาะจง
//    </button>
//    <button onClick={()=>setShowWholeDayModal(true)} className="px-4 py-2 bg-indigo-600 ...">
//      🗓️ แลกคาบทั้งวัน (ลา/ไปราชการ)
//    </button>
//
// 3) ต้อง fetch ตาราง time_slots ทั้งหมดของโรงเรียน (ไม่ใช่แค่ที่ผูกกับ entries)
//    เพิ่มใน loadData():
//      const { data: allTimeSlots } = await supabase.from("time_slots").select("*").order("slot_number");
//
// 4) วาง modal เหล่านี้คู่กับ SwapRequestModal เดิม:
//    {showSpecificModal && academicYear && (
//      <SpecificPeriodSwapModal
//        user={user} myEntries={myEntries} allEntries={allEntries} teachers={teachers}
//        leaveRequests={leaveRequests} academicYearId={academicYear.id}
//        fullNameFn={fullName} thaiDateFn={thaiDate} TH_DAYS={TH_DAYS}
//        onSave={async()=>{ setShowSpecificModal(false); await loadData(); }}
//        onClose={()=>setShowSpecificModal(false)}
//      />
//    )}
//    {showWholeDayModal && academicYear && (
//      <WholeDaySwapModal
//        user={user} teachers={teachers} allEntries={allEntries} timeSlots={allTimeSlots}
//        leaveRequests={leaveRequests} subRecords={subRecords} academicYearId={academicYear.id}
//        fullNameFn={fullName} thaiDateFn={thaiDate} TH_DAYS={TH_DAYS}
//        onSave={async()=>{ setShowWholeDayModal(false); await loadData(); }}
//        onClose={()=>setShowWholeDayModal(false)}
//      />
//    )}
//
// 5) ในหน้าแอดมิน AssignSubModal เดิม (ถ้ามี) เพิ่มปุ่ม "🤖 จัดอัตโนมัติทั้งหมด":
//    import { autoAssignWholeDay } from "@/lib/swap-fairness";
//    <button onClick={()=>{
//      const dow = new Date(leaveDates[0]+"T00:00:00").getDay();
//      const assigned = autoAssignWholeDay(absentId, leaveDates[0], dow,
//        absentEntries.filter(e=>e.day_of_week===dow),
//        entries, teachers, timeSlots.filter(s=>!s.is_break), approvedLeaves, subRecordsHistory);
//      setAssignments(prev => {
//        const next = {...prev};
//        Object.entries(assigned).forEach(([entryId, subId]) => { next[`${entryId}_${leaveDates[0]}`] = subId ?? ""; });
//        return next;
//      });
//    }}>🤖 จัดอัตโนมัติทั้งหมด</button>