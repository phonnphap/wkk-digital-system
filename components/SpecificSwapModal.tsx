"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const TH_DAYS = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];

interface User {
  id: string; first_name: string; last_name: string;
  title?: string; role: string; position?: string; academic_level?: string;
}
interface TimeSlot {
  id: string; slot_number: number; start_time: string; end_time: string;
  slot_label: string; is_break: boolean;
}
interface TimetableEntry {
  id: string; classroom_id: string; subject_id: string; teacher_id: string;
  day_of_week: number; time_slot_id: string; academic_year_id: string;
  classroom?: { room_name: string };
  subject?: { name: string };
  time_slot?: TimeSlot;
}
interface LeaveRequest {
  id: string; user_id: string; start_date: string; end_date: string; status: string;
}

function fullName(u?: User | null) {
  if (!u) return "—";
  return `${u.title ?? ""} ${u.first_name} ${u.last_name}`.trim();
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function thaiTime(t?: string) {
  return t ? t.slice(0, 5) + " น." : "—";
}

export default function SpecificSwapModal({
  user, teachers, myEntries, allEntries, leaveRequests, academicYearId, onSave, onClose,
}: {
  user: User;
  teachers: User[];
  myEntries: TimetableEntry[];
  allEntries: TimetableEntry[];
  leaveRequests: LeaveRequest[];
  academicYearId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(null);
  const [swapDate, setSwapDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<string | null>(null); // teacherId ที่กำลังส่งคำขอ

  // ★ จัดตารางของฉันเป็น grid: วัน x คาบ (เอาเฉพาะคาบที่ไม่ใช่ break และมีการสอนจริง)
  const mySchedule = useMemo(() => {
    const byDay: Record<number, TimetableEntry[]> = {};
    for (const e of myEntries) {
      if (!byDay[e.day_of_week]) byDay[e.day_of_week] = [];
      byDay[e.day_of_week].push(e);
    }
    Object.values(byDay).forEach((list) =>
      list.sort((a, b) => (a.time_slot?.start_time ?? "").localeCompare(b.time_slot?.start_time ?? ""))
    );
    return byDay;
  }, [myEntries]);

  // ★ เมื่อเลือกคาบ + วันที่แล้ว → หาครูทุกคนที่ "ว่าง" ตรงคาบนั้นในวันนั้น (day_of_week เดียวกัน) และไม่ได้ลาวันนั้น
  const freeTeachers = useMemo(() => {
    if (!selectedEntry || !swapDate) return [];
    const dayOfWeek = new Date(swapDate + "T00:00:00").getDay();
    if (dayOfWeek !== selectedEntry.day_of_week) return [];

    const onLeaveIds = new Set(
      leaveRequests
        .filter((lr) => lr.status === "approved" && lr.start_date <= swapDate && lr.end_date >= swapDate)
        .map((lr) => lr.user_id)
    );

    const busyTeacherIds = new Set(
      allEntries
        .filter((e) => e.day_of_week === dayOfWeek && e.time_slot_id === selectedEntry.time_slot_id)
        .map((e) => e.teacher_id)
    );

    return teachers.filter(
      (t) => t.id !== user.id && !busyTeacherIds.has(t.id) && !onLeaveIds.has(t.id)
    );
  }, [selectedEntry, swapDate, allEntries, teachers, leaveRequests, user.id]);

  function handlePickEntry(entry: TimetableEntry) {
    setSelectedEntry(entry);
    setSwapDate("");
    setDateError("");
    setStep(2);
  }

  function handleConfirmDate() {
    if (!swapDate) { setDateError("กรุณาเลือกวันที่"); return; }
    if (!selectedEntry) return;
    const dayOfWeek = new Date(swapDate + "T00:00:00").getDay();
    if (dayOfWeek !== selectedEntry.day_of_week) {
      setDateError(`วันที่เลือกต้องตรงกับวัน${TH_DAYS[selectedEntry.day_of_week]} (วันที่คาบนี้สอนอยู่)`);
      return;
    }
    setDateError("");
    setStep(3);
  }

  async function handleRequestWith(targetTeacherId: string) {
    if (!selectedEntry) return;
    setSaving(targetTeacherId);
    const { error } = await supabase.from("class_swap_requests").insert([
      {
        requester_id: user.id,
        target_teacher_id: targetTeacherId,
        requester_entry_id: selectedEntry.id,
        target_entry_id: null, // ★ ครูเป้าหมายว่างอยู่ ไม่มีคาบเดิมมาแลกด้วย
        swap_date: swapDate,
        reason,
        status: "pending",
        academic_year_id: academicYearId,
      },
    ]);
    setSaving(null);
    if (error) {
      alert("❌ ส่งคำขอไม่สำเร็จ: " + error.message);
      return;
    }
    alert("✅ ส่งคำขอแลกคาบแล้ว รอครูท่านนั้นตอบรับ");
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
            <h3 className="font-bold text-slate-800 text-base">🎯 แลกคาบแบบเจาะจง</h3>
            <p className="text-xs text-slate-400">
              {step === 1 && "ขั้นที่ 1: เลือกคาบของคุณที่ต้องการแลก"}
              {step === 2 && "ขั้นที่ 2: ระบุวันที่ต้องการแลก"}
              {step === 3 && "ขั้นที่ 3: เลือกครูที่ว่างตรงคาบนี้"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* ── Step 1: เลือกคาบจากตารางสอนของฉัน ── */}
          {step === 1 && (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((day) => {
                const entries = mySchedule[day] ?? [];
                if (entries.length === 0) return null;
                return (
                  <div key={day}>
                    <h4 className="font-bold text-slate-600 text-sm mb-2">📅 วัน{TH_DAYS[day]}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {entries.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => handlePickEntry(e)}
                          className="text-left rounded-xl border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:border-blue-400 px-3 py-2.5 transition-all"
                        >
                          <div className="text-xs font-black text-blue-700">{e.time_slot?.slot_label} · {thaiTime(e.time_slot?.start_time)}</div>
                          <div className="text-sm font-bold text-slate-800 truncate">{e.subject?.name ?? "—"}</div>
                          <div className="text-xs text-slate-400">{e.classroom?.room_name ?? "—"}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {Object.keys(mySchedule).length === 0 && (
                <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของคุณ</div>
              )}
            </div>
          )}

          {/* ── Step 2: ระบุวันที่ ── */}
          {step === 2 && selectedEntry && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 px-4 py-3">
                <div className="text-xs font-black text-blue-700">{selectedEntry.time_slot?.slot_label} · วัน{TH_DAYS[selectedEntry.day_of_week]}</div>
                <div className="text-sm font-bold text-slate-800">{selectedEntry.subject?.name}</div>
                <div className="text-xs text-slate-400">{selectedEntry.classroom?.room_name}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  วันที่ต้องการแลก <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={swapDate}
                  onChange={(e) => setSwapDate(e.target.value)}
                  className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors bg-white ${
                    dateError ? "border-red-400 bg-red-50" : "border-blue-200 focus:border-blue-500 text-slate-800"
                  }`}
                />
                {dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เหตุผล</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)"
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:border-blue-500 focus:outline-none bg-white"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-medium">← ย้อนกลับ</button>
                <button onClick={handleConfirmDate} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">
                  ถัดไป: ดูครูที่ว่าง →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: รายชื่อครูที่ว่าง ── */}
          {step === 3 && selectedEntry && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 px-4 py-3 text-sm">
                <span className="font-bold text-blue-800">{selectedEntry.time_slot?.slot_label}</span> ·{" "}
                {new Date(swapDate + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
              </div>

              {freeTeachers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-3xl mb-2">😔</p>
                  <p className="text-sm font-bold">ไม่พบครูที่ว่างตรงคาบนี้ในวันที่เลือก</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    พบครูที่ว่าง {freeTeachers.length} คน — เลือกคนที่ต้องการขอแลกด้วย
                  </p>
                  {freeTeachers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{fullName(t)}</p>
                        {t.academic_level && <p className="text-xs text-slate-400">{t.academic_level}</p>}
                      </div>
                      <button
                        disabled={saving === t.id}
                        onClick={() => handleRequestWith(t.id)}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 shrink-0"
                      >
                        {saving === t.id ? "กำลังส่ง..." : "ขอแลกกับครูท่านนี้"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-start pt-2">
                <button onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-medium">← ย้อนกลับ</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}