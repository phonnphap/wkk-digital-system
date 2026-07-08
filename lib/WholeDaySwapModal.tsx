"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  autoAssignWholeDay,
  findGradeHeadEmails,
  notifySwapParties,
  type LeaveRow,
} from "@/lib/swap-fairness";

const supabase = createClient();

const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// ── Types: ตรงกับ SpecificSwapModal แต่เพิ่ม field ที่ระบบ fairness ต้องใช้ ──
interface User {
  id: string;
  first_name: string;
  last_name: string;
  title?: string;
  role: string;
  position?: string;
  academic_level?: string;
  grade_level?: string; // ★ ใช้จับกลุ่มสายชั้น
  extra_role?: string;  // ★ 'grade_head' = หัวหน้าสายชั้น
  email?: string;       // ★ ใช้ส่งอีเมลแจ้งเตือน
}
interface TimeSlot {
  id: string;
  slot_number: number;
  start_time: string;
  end_time: string;
  slot_label: string;
  is_break: boolean;
}
interface TimetableEntry {
  id: string;
  classroom_id: string;
  subject_id: string;
  teacher_id: string;
  day_of_week: number;
  time_slot_id: string;
  academic_year_id: string;
  classroom?: { room_name: string };
  subject?: { name: string };
  time_slot?: TimeSlot;
}

function fullName(u?: User | null) {
  if (!u) return "—";
  return `${u.title ?? ""} ${u.first_name} ${u.last_name}`.trim();
}
function thaiDateLong(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

export default function WholeDaySwapModal({
  user,
  teachers,
  allEntries,
  timeSlots,
  leaveRequests,
  subRecords,
  academicYearId,
  onSave,
  onClose,
}: {
  user: User;
  teachers: User[];
  allEntries: TimetableEntry[];
  timeSlots: TimeSlot[];
  leaveRequests: LeaveRow[];
  subRecords: { substitute_teacher_id?: string; hours_count: number }[];
  academicYearId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [reasonType, setReasonType] = useState<"leave" | "official">("leave");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ entry: TimetableEntry; subId: string | null }[] | null>(null);
  const [saving, setSaving] = useState(false);

  const workingSlots = useMemo(() => timeSlots.filter((s) => !s.is_break), [timeSlots]);

  function runAutoAssign() {
    if (!date) {
      setDateError("กรุณาเลือกวันที่ลา/ไปราชการ");
      return;
    }
    setDateError("");
    const dow = new Date(date + "T00:00:00").getDay();
    const myDayEntries = allEntries.filter((e) => e.teacher_id === user.id && e.day_of_week === dow);
    if (myDayEntries.length === 0) {
      alert(`ไม่มีคาบสอนของคุณในวัน${TH_DAYS[dow]} (ตามตารางสอน)`);
      setPreview([]);
      return;
    }
    // ★ ระบบเช็คครูที่ลา/ไปราชการวันนั้นออกจากรายชื่อผู้มีสิทธิ์สอนแทนโดยอัตโนมัติ
    //   (ทำอยู่ใน pickBestSubstitute -> isTeacherOnLeave ภายใน autoAssignWholeDay แล้ว)
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
    setPreview((prev) => (prev ? prev.map((p) => (p.entry.id === entryId ? { ...p, subId: teacherId || null } : p)) : prev));
  }

  // ★ กดยืนยันแล้วบันทึกทันที (ไม่ต้องรออนุมัติ ต่างจากแลกคาบเจาะจง)
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
    if (error) {
      setSaving(false);
      alert("❌ บันทึกไม่สำเร็จ: " + error.message);
      return;
    }

    // ★ แจ้งเตือนครูที่ถูกจัดสอนแทน + หัวหน้าสายชั้น (extra_role = 'grade_head') ทางอีเมล
    const gradeHeadEmails = findGradeHeadEmails(user.grade_level, teachers);
    for (const p of preview) {
      if (!p.subId) continue;
      const sub = teachers.find((t) => t.id === p.subId);
      await notifySwapParties({
        toTeacherEmails: [sub?.email],
        gradeHeadEmails,
        subject: `[จัดสอนแทนอัตโนมัติ] คุณได้รับมอบหมายสอนแทน ${fullName(user)}`,
        html: `<p>ระบบจัดให้คุณสอนแทน <b>${fullName(user)}</b> คาบ ${p.entry.time_slot?.slot_label ?? ""}
               วันที่ ${thaiDateLong(date)} วิชา ${p.entry.subject?.name ?? "-"} ห้อง ${p.entry.classroom?.room_name ?? "-"}</p>
               ${note ? `<p>หมายเหตุ: ${note}</p>` : ""}`,
      });
    }
    // แจ้งตัวผู้ลาเองด้วย สรุปว่าใครสอนแทนคาบไหนบ้าง
    const summaryRows = preview
      .map((p) => {
        const sub = teachers.find((t) => t.id === p.subId);
        return `<tr><td style="padding:4px 8px">${p.entry.time_slot?.slot_label ?? ""}</td><td style="padding:4px 8px">${p.entry.subject?.name ?? "-"}</td><td style="padding:4px 8px">${sub ? fullName(sub) : "⚠️ ไม่มีครูว่าง"}</td></tr>`;
      })
      .join("");
    await notifySwapParties({
      toTeacherEmails: [user.email],
      gradeHeadEmails,
      subject: `[สรุปการจัดสอนแทน] วันที่ ${thaiDateLong(date)}`,
      html: `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
             <tr style="background:#f1f5f9"><th style="padding:4px 8px;text-align:left">คาบ</th><th style="padding:4px 8px;text-align:left">วิชา</th><th style="padding:4px 8px;text-align:left">ครูสอนแทน</th></tr>
             ${summaryRows}</table>`,
    });

    setSaving(false);
    const unassignedCount = preview.filter((p) => !p.subId).length;
    if (unassignedCount > 0) {
      alert(`✅ จัดสอนแทนเรียบร้อย แต่มี ${unassignedCount} คาบที่ไม่มีครูว่างจริงๆ กรุณาแจ้งแอดมินจัดเพิ่ม`);
    } else {
      alert("✅ จัดสอนแทนและแจ้งเตือนเรียบร้อยแล้ว");
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
              ระบบจัดครูสายชั้นเดียวกันที่ว่างมากที่สุดก่อน รองลงมาคือครูที่สอนแทนสะสมน้อยกว่า (เพื่อความเท่าเทียม)
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                วันที่ลา/ไปราชการ <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateError("");
                  setPreview(null);
                }}
                className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium bg-white focus:outline-none ${
                  dateError ? "border-red-400 bg-red-50" : "border-blue-200 focus:border-blue-500"
                }`}
              />
              {dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ประเภท</label>
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">หมายเหตุ (ถ้ามี)</label>
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
                  ผลการจัดอัตโนมัติ วัน{TH_DAYS[new Date(date + "T00:00:00").getDay()]} (ตรวจสอบ/แก้ไขได้ก่อนยืนยัน)
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
                            {fullName(t)}
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

        {preview && preview.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-medium">
              ยกเลิก
            </button>
            <button
              onClick={confirmSubmit}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {saving ? "กำลังบันทึกและแจ้งเตือน..." : "✅ ยืนยันและบันทึกทันที"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}