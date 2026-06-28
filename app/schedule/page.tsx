"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const DAY_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ."];
const DAY_COLORS = [
  { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-700", header: "bg-yellow-400", headerText: "text-yellow-900" },
  { bg: "bg-pink-50",   border: "border-pink-300",   text: "text-pink-700",   header: "bg-pink-400",   headerText: "text-pink-900"   },
  { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-700",  header: "bg-green-500",  headerText: "text-white"      },
  { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", header: "bg-orange-400", headerText: "text-orange-900" },
  { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-700",   header: "bg-blue-500",   headerText: "text-white"      },
];

const SUBJECT_COLORS = [
  { bg: "bg-red-100",    border: "border-red-300",    text: "text-red-800"    },
  { bg: "bg-blue-100",   border: "border-blue-300",   text: "text-blue-800"   },
  { bg: "bg-green-100",  border: "border-green-300",  text: "text-green-800"  },
  { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-800" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
  { bg: "bg-pink-100",   border: "border-pink-300",   text: "text-pink-800"   },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
  { bg: "bg-teal-100",   border: "border-teal-300",   text: "text-teal-800"   },
  { bg: "bg-cyan-100",   border: "border-cyan-300",   text: "text-cyan-800"   },
];

export const SCHEDULE_TEMPLATES = [
  {
    key: "primary",
    label: "ประถม (ป.1–ป.6)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:30", end_time: "10:30", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "10:30", end_time: "11:30", slot_label: "คาบ 3", is_break: false },
      { slot_number: 0, start_time: "11:30", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 4, start_time: "12:30", end_time: "13:30", slot_label: "คาบ 4", is_break: false },
      { slot_number: 5, start_time: "13:30", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
      { slot_number: 6, start_time: "14:30", end_time: "15:30", slot_label: "คาบ 6", is_break: false },
    ],
  },
  {
    key: "junior",
    label: "มัธยมต้น (ม.1–ม.2)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "10:10", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
      { slot_number: 0, start_time: "11:00", end_time: "12:00", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 4, start_time: "12:00", end_time: "12:50", slot_label: "คาบ 4", is_break: false },
      { slot_number: 5, start_time: "12:50", end_time: "13:40", slot_label: "คาบ 5", is_break: false },
      { slot_number: 0, start_time: "13:40", end_time: "13:50", slot_label: "พักย่อย", is_break: true },
      { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
      { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
    ],
  },
  {
    key: "senior",
    label: "มัธยมปลาย (ม.3–ม.6)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
      { slot_number: 0, start_time: "10:10", end_time: "10:20", slot_label: "พักย่อย", is_break: true },
      { slot_number: 3, start_time: "10:20", end_time: "11:10", slot_label: "คาบ 3", is_break: false },
      { slot_number: 4, start_time: "11:10", end_time: "12:00", slot_label: "คาบ 4", is_break: false },
      { slot_number: 0, start_time: "12:00", end_time: "13:00", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 5, start_time: "13:00", end_time: "13:50", slot_label: "คาบ 5", is_break: false },
      { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
      { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
    ],
  },
];

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head"];

// ── Types ─────────────────────────────────────────────────────────────────────
type UserProfile = {
  id: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string;
  homeroom_classroom_id?: string; // ★ ห้องที่เป็นครูประจำชั้น
};
type TimeSlot = { id: string; slot_number: number; start_time: string; end_time: string; slot_label?: string; is_break: boolean; schedule_type?: string };
type Subject = { id: string; subject_code: string; name_th: string; subject_group?: string };
type Teacher = { id: string; first_name?: string; last_name?: string; full_name?: string; position?: string };
type Classroom = { id: string; room_number: number; room_name?: string; grade_group?: string; academic_year_id?: string; schedule_type?: string };
type TimetableEntry = {
  id: string; classroom_id: string; subject_id: string; teacher_id: string;
  teacher_id_2?: string; // ★ ครูคนที่ 2
  day_of_week: number; time_slot_id: string; academic_year_id: string;
  subject?: Subject; teacher?: Teacher; teacher2?: Teacher;
};
type AcademicYearRaw = { id: string; year_name: string; semester?: number; is_current?: boolean };

// ── helpers ───────────────────────────────────────────────────────────────────
function fullName(u: any) {
  if (!u) return "—";
  if (u.full_name) return u.full_name;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—";
}
// ★ ชื่อจริง first_name + last_name (ไม่ย่อ)
function displayName(u: any) {
  if (!u) return "—";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  if (u.full_name) return u.full_name;
  return "—";
}
function formatTime(t: string) { return t?.slice(0, 5) ?? ""; }

function gradeGroupSortKey(grade?: string): number {
  if (!grade) return 999;
  if (grade.includes("อนุบาล")) return 0;
  if (grade.includes("ประถม")) return 1;
  if (grade.includes("มัธยมศึกษาตอนต้น")) return 2;
  if (grade.includes("มัธยมศึกษาตอนปลาย")) return 3;
  return 999;
}

// ── Entry Modal ───────────────────────────────────────────────────────────────
function EntryModal({ entry, slot, day, classroom, subjects, teachers, academicYearId, onSave, onDelete, onClose }: {
  entry?: TimetableEntry; slot: TimeSlot; day: number; classroom: Classroom;
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  onSave: (d: any) => Promise<void>; onDelete?: (id: string) => Promise<void>; onClose: () => void;
}) {
  const [subjectGroup, setSubjectGroup] = useState("");
  const [subjectId, setSubjectId]       = useState(entry?.subject_id ?? "");
  const [teacherId1, setTeacherId1]     = useState(entry?.teacher_id ?? "");
  const [teacherId2, setTeacherId2]     = useState(entry?.teacher_id_2 ?? "");
  const [loading, setLoading]           = useState(false);
  const dc = DAY_COLORS[day - 1];

  // ── ดึงตัวเลขระดับชั้นจาก subject_code ──────────────────────────────────
  function getGradeDigit(code: string): string {
    const match = code?.match(/^[ก-ฮA-Za-z]+(\d)(\d)/);
    return match ? match[2] : "";
  }

  // ── ระดับชั้นจากชื่อห้อง ─────────────────────────────────────────────────
  function getRoomGradeLevel(): string {
    const m = (classroom.room_name ?? "").match(/[ปมอ]\.?(\d+)/);
    return m ? m[1] : "";
  }

  // ── ชื่อย่อห้อง เช่น "ป.", "ม.", "อ." ───────────────────────────────────
  function getRoomPrefix(): string {
    const m = (classroom.room_name ?? "").match(/([ปมอ])\./);
    return m ? m[1] + "." : "";
  }

  const roomGrade  = getRoomGradeLevel();
  const roomPrefix = getRoomPrefix();

  const subjectGroups = [...new Set(subjects.map(s => s.subject_group).filter(Boolean))].sort();

  const filteredSubjects = subjects.filter(s => {
    const gradeMatch = !roomGrade || getGradeDigit(s.subject_code) === roomGrade;
    const groupMatch = !subjectGroup || s.subject_group === subjectGroup;
    return gradeMatch && groupMatch;
  });

  async function handleSave() {
    if (!subjectId || !teacherId1) { alert("กรุณาเลือกวิชาและครูอย่างน้อย 1 คน"); return; }
    setLoading(true);
    await onSave({
      id: entry?.id,
      classroom_id: classroom.id,
      subject_id: subjectId,
      teacher_id: teacherId1,
      teacher_id_2: teacherId2 || null,
      day_of_week: day,
      time_slot_id: slot.id,
      academic_year_id: academicYearId,
    });
    setLoading(false);
  }

  const inputCls = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`${dc.header} px-6 py-4`}>
          <p className="text-sm text-white/80 font-medium">{DAYS[day - 1]} · {slot.slot_label} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}</p>
          <h3 className="text-lg font-black text-white mt-0.5">{entry ? "✏️ แก้ไขคาบเรียน" : "➕ เพิ่มคาบเรียน"}</h3>
          <p className="text-sm text-white/70 mt-0.5">ห้อง {classroom.grade_group} {classroom.room_name}</p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* กลุ่มสาระ */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">กลุ่มสาระ</label>
            <select value={subjectGroup} onChange={e => { setSubjectGroup(e.target.value); setSubjectId(""); }} className={inputCls}>
              <option value="">— ทุกกลุ่มสาระ —</option>
              {subjectGroups.map(g => <option key={g} value={g!}>{g}</option>)}
            </select>
          </div>

          {/* รายวิชา */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              รายวิชา *
              {/* ★ แก้คำ: แสดงชื่อห้องจริง */}
              {roomGrade && (
                <span className="text-slate-400 font-normal normal-case ml-1">
                  (กรองเฉพาะชั้น {roomPrefix}{roomGrade})
                </span>
              )}
            </label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inputCls}>
              <option value="">— เลือกรายวิชา —</option>
              {filteredSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.subject_code} {s.name_th}</option>
              ))}
            </select>
            {filteredSubjects.length === 0 && roomGrade && (
              <p className="text-xs text-amber-600 font-bold mt-1">
                ⚠️ ไม่พบวิชาสำหรับชั้นนี้ (รหัสตัวที่ 2 = {roomGrade})
              </p>
            )}
          </div>

          {/* ครูผู้สอนคนที่ 1 */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ครูผู้สอน คนที่ 1 *</label>
            <select value={teacherId1} onChange={e => setTeacherId1(e.target.value)} className={inputCls}>
              <option value="">— เลือกครู —</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{displayName(t)}</option>
              ))}
            </select>
          </div>

          {/* ครูผู้สอนคนที่ 2 */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              ครูผู้สอน คนที่ 2 <span className="text-slate-400 font-normal normal-case">(ถ้ามี)</span>
            </label>
            <select value={teacherId2} onChange={e => setTeacherId2(e.target.value)} className={inputCls}>
              <option value="">— ไม่มีครูคนที่ 2 —</option>
              {teachers.filter(t => t.id !== teacherId1).map(t => (
                <option key={t.id} value={t.id}>{displayName(t)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          {entry && onDelete && (
            <button onClick={async () => { if (confirm("ลบคาบนี้?")) { setLoading(true); await onDelete(entry.id); setLoading(false); } }}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm hover:bg-red-100">
              🗑️ ลบ
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳..." : "💾 บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Timetable Grid ─────────────────────────────────────────────────────────────
function TimetableGrid({ classroom, entries, timeSlots, subjects, teachers, academicYearId, isAdmin, currentUser, onRefresh }: {
  classroom: Classroom; entries: TimetableEntry[]; timeSlots: TimeSlot[];
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  isAdmin: boolean; currentUser: UserProfile; onRefresh: () => void;
}) {
  const [modal, setModal] = useState<{ slot: TimeSlot; day: number; entry?: TimetableEntry } | null>(null);

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  function getEntry(day: number, slotId: string) {
    return entries.find(e => e.day_of_week === day && e.time_slot_id === slotId);
  }

  async function handleSave(data: any) {
    if (data.id) {
      await (supabase.from("timetable_entries") as any)
        .update({ subject_id: data.subject_id, teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 })
        .eq("id", data.id);
    } else {
      await (supabase.from("timetable_entries") as any).insert([{
        classroom_id: data.classroom_id, subject_id: data.subject_id,
        teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2,
        day_of_week: data.day_of_week, time_slot_id: data.time_slot_id,
        academic_year_id: data.academic_year_id,
      }]);
    }
    setModal(null); onRefresh();
  }

  async function handleDelete(id: string) {
    await supabase.from("timetable_entries").delete().eq("id", id);
    setModal(null); onRefresh();
  }

  return (
    <>
      {modal && (
        <EntryModal entry={modal.entry} slot={modal.slot} day={modal.day} classroom={classroom}
          subjects={subjects} teachers={teachers} academicYearId={academicYearId}
          onSave={handleSave} onDelete={handleDelete} onClose={() => setModal(null)} />
      )}

      {/* ★ ตารางใหญ่ขึ้น: ลบ overflow-x-auto ออก ให้ table เต็มพื้นที่ */}
      <div className="w-full rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
        <table className="border-collapse w-full table-fixed">
          <colgroup>
            <col style={{ width: "80px" }} />
            {timeSlots.map(slot => (
              <col key={slot.id} style={{ width: slot.is_break ? "56px" : undefined }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="px-2 py-3 bg-slate-50 border-b-2 border-r-2 border-slate-200 text-slate-400 font-black text-xs uppercase tracking-wider text-center sticky left-0 z-10">
                วัน / คาบ
              </th>
              {timeSlots.map(slot => (
                <th key={slot.id}
                  className={`px-1 py-2 border-b-2 border-r border-slate-200 text-center font-black
                    ${slot.is_break ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                  {slot.is_break ? (
                    <div className="text-[9px] leading-tight opacity-60">
                      <div>{slot.slot_label}</div>
                      <div className="font-normal">{formatTime(slot.start_time)}</div>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-slate-700">{slot.slot_label}</div>
                      <div className="text-[10px] font-normal text-slate-400">{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</div>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(day => {
              const dc = DAY_COLORS[day - 1];
              return (
                <tr key={day} className="border-b border-slate-100">
                  <td className={`px-2 py-3 border-r-2 border-slate-200 sticky left-0 z-10 ${dc.bg}`}>
                    <div className={`font-black text-sm ${dc.text}`}>{DAYS[day - 1]}</div>
                    <div className={`text-[10px] font-medium ${dc.text} opacity-60`}>{DAY_SHORT[day - 1]}</div>
                  </td>
                  {timeSlots.map(slot => {
                    if (slot.is_break) {
                      return (
                        <td key={slot.id} className="bg-slate-50 border-r border-slate-100 align-middle text-center p-0">
                          <div className="text-[9px] text-slate-300 font-bold" style={{ writingMode: "vertical-rl", whiteSpace: "nowrap", margin: "0 auto" }}>พัก</div>
                        </td>
                      );
                    }
                    const entry = getEntry(day, slot.id);
                    const colors = entry ? subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0] : null;
                    // ★ ดึงครูทั้ง 2 คน
                    const teacher1 = entry ? (teachers.find(t => t.id === entry.teacher_id) ?? (entry as any).teacher) : null;
                    const teacher2 = entry?.teacher_id_2 ? (teachers.find(t => t.id === entry.teacher_id_2) ?? (entry as any).teacher2) : null;
                    const subject  = entry ? (subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject) : null;
                    const isMyClass = !isAdmin && (entry?.teacher_id === currentUser.id || entry?.teacher_id_2 === currentUser.id);

                    return (
                      <td key={slot.id} className="p-1 align-top border-r border-slate-100">
                        {entry && colors ? (
                          <div
                            className={`rounded-xl border-2 px-2 py-2 h-full transition-all
                              ${colors.bg} ${colors.border} ${colors.text}
                              ${isAdmin ? "cursor-pointer hover:shadow-md hover:scale-[1.01]" : ""}
                              ${isMyClass ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
                            style={{ minHeight: "90px" }}
                            onClick={() => isAdmin && setModal({ slot, day, entry })}>
                            {/* ★ ชื่อวิชา */}
                            <p className="font-black text-xs leading-tight line-clamp-2 mb-1">{(subject as any)?.name_th ?? "—"}</p>
                            {/* ★ ชื่อครูจริง ไม่ย่อ */}
                            <p className="text-[11px] font-bold opacity-80 leading-tight truncate">{displayName(teacher1)}</p>
                            {/* ★ ครูคนที่ 2 ถ้ามี */}
                            {teacher2 && (
                              <p className="text-[11px] font-bold opacity-80 leading-tight truncate mt-0.5">
                                {displayName(teacher2)}
                              </p>
                            )}
                            {isMyClass && (
                              <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded mt-1 inline-block">ฉัน</span>
                            )}
                          </div>
                        ) : (
                          isAdmin ? (
                            <div
                              className="rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center"
                              style={{ minHeight: "90px" }}
                              onClick={() => setModal({ slot, day })}>
                              <span className="text-slate-300 text-2xl font-thin">+</span>
                            </div>
                          ) : (
                            <div className="rounded-xl border-2 border-dashed border-slate-100" style={{ minHeight: "90px" }} />
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Schedule Type Settings Modal ──────────────────────────────────────────────
function ScheduleSettingsModal({ onClose, onApply }: { onClose: () => void; onApply: (type: string) => Promise<void> }) {
  const [selected, setSelected] = useState("primary");
  const [loading, setLoading]   = useState(false);
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === selected)!;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 px-6 py-4">
          <h3 className="text-lg font-black text-white">⚙️ ตั้งค่าตารางเวลา</h3>
          <p className="text-slate-300 text-sm mt-0.5">เลือกแบบตารางเวลาสำหรับห้องนี้</p>
        </div>
        <div className="p-6">
          <div className="flex gap-2 mb-5">
            {SCHEDULE_TEMPLATES.map(t => (
              <button key={t.key} onClick={() => setSelected(t.key)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${selected === t.key ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-200 px-4 py-2">
              <p className="text-xs font-black text-slate-600">ตัวอย่างตารางเวลา — {tmpl.label}</p>
            </div>
            <div className="divide-y divide-slate-200">
              {tmpl.slots.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-2 ${s.is_break ? "bg-amber-50" : ""}`}>
                  <span className={`text-xs font-black w-16 ${s.is_break ? "text-amber-600" : "text-blue-600"}`}>
                    {s.is_break ? "พัก" : s.slot_label}
                  </span>
                  <span className="text-xs text-slate-500">{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                  {s.is_break && <span className="text-xs text-amber-500 font-bold">{s.slot_label}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={async () => { setLoading(true); await onApply(selected); setLoading(false); onClose(); }}
            disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳ กำลังบันทึก..." : "✅ ใช้ตารางเวลานี้"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile view ───────────────────────────────────────────────────────────────
function MobileView({ entries, timeSlots, subjects, teachers, isAdmin, currentUser, subjectColorMap, onCellClick }: {
  entries: TimetableEntry[]; timeSlots: TimeSlot[]; subjects: Subject[]; teachers: Teacher[];
  isAdmin: boolean; currentUser: UserProfile; subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]>;
  onCellClick: (slot: TimeSlot, day: number, entry?: TimetableEntry) => void;
}) {
  const [activeDay, setActiveDay] = useState(1);

  return (
    <div className="md:hidden">
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {DAYS.map((day, i) => {
          const dc = DAY_COLORS[i];
          return (
            <button key={day} onClick={() => setActiveDay(i + 1)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-black border-2 transition-all
                ${activeDay === i + 1 ? `${dc.header} text-white border-transparent` : "bg-white border-slate-200 text-slate-600"}`}>
              {DAY_SHORT[i]}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {timeSlots.map(slot => {
          if (slot.is_break) return (
            <div key={slot.id} className="text-center text-xs text-slate-400 font-bold py-1 bg-slate-50 rounded-lg">
              — {slot.slot_label} ({formatTime(slot.start_time)}–{formatTime(slot.end_time)}) —
            </div>
          );
          const entry = entries.find(e => e.day_of_week === activeDay && e.time_slot_id === slot.id);
          const teacher1 = entry ? (teachers.find(t => t.id === entry.teacher_id) ?? (entry as any).teacher) : null;
          const teacher2 = entry?.teacher_id_2 ? (teachers.find(t => t.id === entry.teacher_id_2) ?? (entry as any).teacher2) : null;
          const subject  = entry ? (subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject) : null;
          const colors   = entry ? subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0] : null;
          const isMyClass = !isAdmin && (entry?.teacher_id === currentUser.id || entry?.teacher_id_2 === currentUser.id);

          return (
            <div key={slot.id} className="flex gap-3 items-stretch">
              <div className="w-16 text-center shrink-0 flex flex-col justify-center">
                <div className="text-xs font-black text-slate-500">{slot.slot_label}</div>
                <div className="text-[10px] text-slate-400">{formatTime(slot.start_time)}</div>
              </div>
              {entry && colors ? (
                <div className={`flex-1 rounded-xl border-2 px-3 py-2.5 ${colors.bg} ${colors.border} ${colors.text} ${isMyClass ? "ring-2 ring-blue-400" : ""} ${isAdmin ? "cursor-pointer" : ""}`}
                  onClick={() => isAdmin && onCellClick(slot, activeDay, entry)}>
                  <p className="font-black text-sm">{(subject as any)?.name_th ?? "—"}</p>
                  <p className="text-xs opacity-70 mt-0.5">{displayName(teacher1)}</p>
                  {teacher2 && <p className="text-xs opacity-70">{displayName(teacher2)}</p>}
                </div>
              ) : (
                isAdmin ? (
                  <div className="flex-1 rounded-xl border-2 border-dashed border-slate-200 px-3 py-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all text-center"
                    onClick={() => onCellClick(slot, activeDay, undefined)}>
                    <span className="text-slate-300 text-lg">+</span>
                  </div>
                ) : (
                  <div className="flex-1 rounded-xl border-2 border-dashed border-slate-100 px-3 py-4" />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ★ Personal Timetable Grid (ตารางสอนของฉัน) ────────────────────────────────
function PersonalTimetableGrid({ myEntries, timeSlots, subjects, teachers, classrooms, userId }: {
  myEntries: TimetableEntry[]; timeSlots: TimeSlot[]; subjects: Subject[];
  teachers: Teacher[]; classrooms: Classroom[]; userId: string;
}) {
  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  function getEntry(day: number, slotId: string) {
    return myEntries.find(e => e.day_of_week === day && e.time_slot_id === slotId);
  }

  const nonBreakSlots = timeSlots.filter(s => !s.is_break);

  return (
    <div className="w-full rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
      <table className="border-collapse w-full table-fixed">
        <colgroup>
          <col style={{ width: "80px" }} />
          {timeSlots.map(slot => (
            <col key={slot.id} style={{ width: slot.is_break ? "52px" : undefined }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="px-2 py-3 bg-slate-50 border-b-2 border-r-2 border-slate-200 text-slate-400 font-black text-xs uppercase tracking-wider text-center sticky left-0 z-10">
              วัน / คาบ
            </th>
            {timeSlots.map(slot => (
              <th key={slot.id}
                className={`px-1 py-2 border-b-2 border-r border-slate-200 text-center font-black
                  ${slot.is_break ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                {slot.is_break ? (
                  <div className="text-[9px] leading-tight opacity-60">
                    <div>{slot.slot_label}</div>
                    <div className="font-normal">{formatTime(slot.start_time)}</div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-slate-700">{slot.slot_label}</div>
                    <div className="text-[10px] font-normal text-slate-400">{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</div>
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map(day => {
            const dc = DAY_COLORS[day - 1];
            return (
              <tr key={day} className="border-b border-slate-100">
                <td className={`px-2 py-3 border-r-2 border-slate-200 sticky left-0 z-10 ${dc.bg}`}>
                  <div className={`font-black text-sm ${dc.text}`}>{DAYS[day - 1]}</div>
                  <div className={`text-[10px] font-medium ${dc.text} opacity-60`}>{DAY_SHORT[day - 1]}</div>
                </td>
                {timeSlots.map(slot => {
                  if (slot.is_break) {
                    return (
                      <td key={slot.id} className="bg-slate-50 border-r border-slate-100 align-middle text-center p-0">
                        <div className="text-[9px] text-slate-300 font-bold" style={{ writingMode: "vertical-rl", whiteSpace: "nowrap", margin: "0 auto" }}>พัก</div>
                      </td>
                    );
                  }
                  const entry = getEntry(day, slot.id);
                  if (!entry) {
                    return (
                      <td key={slot.id} className="p-1 align-top border-r border-slate-100">
                        <div className="rounded-xl border-2 border-dashed border-slate-100" style={{ minHeight: "90px" }} />
                      </td>
                    );
                  }
                  const colors  = subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0];
                  const subject = subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject;
                  const room    = classrooms.find(c => c.id === entry.classroom_id);
                  const isMe1   = entry.teacher_id === userId;
                  const isMe2   = entry.teacher_id_2 === userId;

                  return (
                    <td key={slot.id} className="p-1 align-top border-r border-slate-100">
                      <div
                        className={`rounded-xl border-2 px-2 py-2 h-full ${colors.bg} ${colors.border} ${colors.text} ring-2 ring-offset-1 ring-blue-400`}
                        style={{ minHeight: "90px" }}>
                        <p className="font-black text-xs leading-tight line-clamp-2 mb-1">{(subject as any)?.name_th ?? "—"}</p>
                        {room && (
                          <p className="text-[10px] font-bold opacity-70 truncate">{room.grade_group} {room.room_name}</p>
                        )}
                        <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded mt-1 inline-block">
                          {isMe1 && isMe2 ? "ครู 1" : isMe2 ? "ครู 2" : "ครู 1"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function SchedulePage() {
  const router = useRouter();
  const [user,             setUser]             = useState<UserProfile | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [allClassrooms,    setAllClassrooms]    = useState<Classroom[]>([]);
  const [classrooms,       setClassrooms]       = useState<Classroom[]>([]);
  const [timeSlots,        setTimeSlots]        = useState<TimeSlot[]>([]);
  const [subjects,         setSubjects]         = useState<Subject[]>([]);
  const [teachers,         setTeachers]         = useState<Teacher[]>([]);
  const [entries,          setEntries]          = useState<TimetableEntry[]>([]);
  const [academicYearsRaw, setAcademicYearsRaw] = useState<AcademicYearRaw[]>([]);
  const [academicYears,    setAcademicYears]    = useState<{ id: string; year_name: string }[]>([]);
  const [selectedYear,     setSelectedYear]     = useState("");
  const [selectedRoom,     setSelectedRoom]     = useState("");
  const [viewMode,         setViewMode]         = useState<"room" | "teacher">("room");
  const [showSettings,     setShowSettings]     = useState(false);
  const [roomTimeSlots,    setRoomTimeSlots]    = useState<TimeSlot[]>([]);
  const [modal,            setModal]            = useState<{ slot: TimeSlot; day: number; entry?: TimetableEntry } | null>(null);
  const [debugInfo,        setDebugInfo]        = useState<string>("");

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const meta   = authUser.user_metadata ?? {};
      const email  = authUser.email || meta.email || meta.preferred_username || meta.upn || "";

      let profileData: any = null;
      const { data: byAuthId } = await supabase.from("users")
        .select("id, first_name, last_name, full_name, email, role, position, homeroom_classroom_id")
        .eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;

      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id, first_name, last_name, full_name, email, role, position, homeroom_classroom_id")
          .eq("email", email).maybeSingle();
        profileData = byEmail;
        if (profileData) await (supabase.from("users") as any).update({ auth_id: authUser.id }).eq("id", profileData.id);
      }

      if (!profileData) {
        profileData = { id: authUser.id, email: authUser.email ?? "", first_name: meta.name ?? "", last_name: "", role: "subject_teacher" };
      }

      setUser({ ...profileData, full_name: profileData.full_name || `${profileData.first_name ?? ""} ${profileData.last_name ?? ""}`.trim() });

      const [yearsRes, slotsRes, subjectsRes, teachersRes, classroomsRes] = await Promise.all([
        supabase.from("academic_years").select("id, year_name, semester, is_current")
          .order("year_name", { ascending: false }).order("semester", { ascending: false }),
        supabase.from("time_slots").select("*").order("slot_number").order("start_time"),
        supabase.from("subjects").select("id, subject_code, name_th, subject_group").order("subject_code"),
        supabase.from("users").select("id, first_name, last_name, full_name, position")
          .in("role", ["subject_teacher", "homeroom_teacher", "grade_head", "staff"]),
        supabase.from("classrooms").select("id, room_number, room_name, grade_group, academic_year_id, schedule_type")
          .order("grade_group").order("room_number"),
      ]);

      const yearsRaw = (yearsRes.data ?? []) as AcademicYearRaw[];
      setAcademicYearsRaw(yearsRaw);

      const uniqueYearMap = new Map<string, string>();
      yearsRaw.forEach(y => { if (!uniqueYearMap.has(y.year_name)) uniqueYearMap.set(y.year_name, y.id); });
      const uniqueYears = Array.from(uniqueYearMap.entries()).map(([year_name, id]) => ({ id, year_name }));
      setAcademicYears(uniqueYears);

      setTimeSlots((slotsRes.data ?? []) as TimeSlot[]);
      setSubjects((subjectsRes.data ?? []) as Subject[]);
      setTeachers(((teachersRes.data ?? []) as any[]).map(t => ({
        ...t, full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
      })));

      const allRooms = (classroomsRes.data ?? []) as Classroom[];
      setAllClassrooms(allRooms);

      const currentYearRow = yearsRaw.find(y => y.is_current) ?? yearsRaw[0];
      let dbg = `academic_years พบ ${yearsRaw.length} แถว | classrooms พบ ${allRooms.length} ห้อง | `;

      if (currentYearRow) {
        setSelectedYear(uniqueYearMap.get(currentYearRow.year_name) ?? currentYearRow.id);
        const sameYearIds = yearsRaw.filter(y => y.year_name === currentYearRow.year_name).map(y => y.id);
        const matched     = allRooms.filter(r => sameYearIds.includes(r.academic_year_id ?? ""));
        dbg += `ปีปัจจุบัน: ${currentYearRow.year_name} | ห้องที่ตรงปี: ${matched.length}`;

        const roomList = matched.length > 0 ? matched : allRooms;
        setClassrooms(roomList);

        // ★ ถ้าเป็นครูประจำชั้น ให้เลือกห้องตัวเองก่อน
        const homeroomId = profileData?.homeroom_classroom_id;
        if (homeroomId && roomList.find(r => r.id === homeroomId)) {
          setSelectedRoom(homeroomId);
        } else if (roomList.length > 0) {
          setSelectedRoom(roomList[0].id);
        }
        if (matched.length === 0 && allRooms.length > 0) {
          dbg += " | ⚠️ fallback แสดงห้องทั้งหมด";
        }
      } else if (allRooms.length > 0) {
        setClassrooms(allRooms);
        setSelectedRoom(allRooms[0].id);
        dbg += " | ⚠️ ไม่พบ academic_years";
      }

      setDebugInfo(dbg);
      setLoading(false);
    };
    init();
  }, []);

  // ── Filter classrooms เมื่อเปลี่ยนปี ─────────────────────────────────────
  useEffect(() => {
    if (!selectedYear || academicYearsRaw.length === 0) return;
    const selectedYearRow = academicYearsRaw.find(y => y.id === selectedYear);
    if (!selectedYearRow) return;
    const sameYearIds = academicYearsRaw.filter(y => y.year_name === selectedYearRow.year_name).map(y => y.id);
    const matched     = allClassrooms.filter(r => sameYearIds.includes(r.academic_year_id ?? ""));
    const roomList    = matched.length > 0 ? matched : allClassrooms;
    setClassrooms(roomList);
    if (roomList.length > 0 && !roomList.find(r => r.id === selectedRoom)) {
      setSelectedRoom(roomList[0].id);
    }
  }, [selectedYear, academicYearsRaw, allClassrooms]);

  // ── Time slots ตามประเภทตารางของห้อง ─────────────────────────────────────
  useEffect(() => {
    const room = classrooms.find(c => c.id === selectedRoom);
    const type = room?.schedule_type ?? "primary";
    const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[0];

    if (timeSlots.length > 0) {
      const ordered: TimeSlot[] = tmpl.slots.map((tmplSlot, idx) => {
        const matched = timeSlots.find(s =>
          s.start_time.slice(0, 5) === tmplSlot.start_time &&
          (!s.schedule_type || s.schedule_type === type)
        );
        if (matched) return matched;
        return {
          id: `tmpl-${type}-${idx}`,
          slot_number: tmplSlot.slot_number,
          start_time: tmplSlot.start_time,
          end_time: tmplSlot.end_time,
          slot_label: tmplSlot.slot_label,
          is_break: tmplSlot.is_break,
          schedule_type: type,
        } as TimeSlot;
      });
      setRoomTimeSlots(ordered);
    } else {
      setRoomTimeSlots(tmpl.slots.map((s, i) => ({ ...s, id: `tmpl-${i}` })));
    }
  }, [selectedRoom, classrooms, timeSlots]);

  const loadEntries = useCallback(async () => {
    if (!selectedYear) return;
    const selectedYearRow = academicYearsRaw.find(y => y.id === selectedYear);
    const sameYearIds = selectedYearRow
      ? academicYearsRaw.filter(y => y.year_name === selectedYearRow.year_name).map(y => y.id)
      : [selectedYear];

    // ★ ดึง teacher_id_2 ด้วย
    const { data } = await (supabase.from("timetable_entries") as any)
      .select("*, subject:subjects(id,subject_code,name_th), teacher:users!timetable_entries_teacher_id_fkey(id,first_name,last_name,full_name), teacher2:users!timetable_entries_teacher_id_2_fkey(id,first_name,last_name,full_name)")
      .in("academic_year_id", sameYearIds);
    setEntries((data ?? []) as TimetableEntry[]);
  }, [selectedYear, academicYearsRaw]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  async function applyScheduleType(type: string) {
    await (supabase.from("classrooms") as any).update({ schedule_type: type }).eq("id", selectedRoom);
    const { data } = await supabase.from("classrooms")
      .select("id, room_number, room_name, grade_group, academic_year_id, schedule_type")
      .order("grade_group").order("room_number");
    const allRooms = (data ?? []) as Classroom[];
    setAllClassrooms(allRooms);
    const selectedYearRow = academicYearsRaw.find(y => y.id === selectedYear);
    if (selectedYearRow) {
      const sameYearIds = academicYearsRaw.filter(y => y.year_name === selectedYearRow.year_name).map(y => y.id);
      const matched = allRooms.filter(r => sameYearIds.includes(r.academic_year_id ?? ""));
      setClassrooms(matched.length > 0 ? matched : allRooms);
    } else {
      setClassrooms(allRooms);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดตารางสอน...</div>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</p>
    </div>
  );

  const isAdmin            = ADMIN_ROLES.includes(user.role);
  const isHomeroomTeacher  = user.role === "homeroom_teacher";
  const selectedClassroom  = classrooms.find(c => c.id === selectedRoom);
  const roomEntries        = entries.filter(e => e.classroom_id === selectedRoom);
  // ★ myEntries: ทั้งครู 1 และครู 2
  const myEntries          = entries.filter(e => e.teacher_id === user.id || e.teacher_id_2 === user.id);

  // ★ สายชั้นที่ครูนี้สอน (จาก entries)
  const myClassroomIds     = [...new Set(myEntries.map(e => e.classroom_id))];
  const myClassrooms       = classrooms.filter(c => myClassroomIds.includes(c.id));
  // ★ ห้องของครูประจำชั้น
  const homeroomClassroom  = user.homeroom_classroom_id
    ? classrooms.find(c => c.id === user.homeroom_classroom_id)
    : null;

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  const gradeGroups = [...new Set(classrooms.map(c => c.grade_group))]
    .filter(Boolean)
    .sort((a, b) => gradeGroupSortKey(a as string) - gradeGroupSortKey(b as string)) as string[];

  const currentScheduleType = SCHEDULE_TEMPLATES.find(t => t.key === selectedClassroom?.schedule_type)?.label ?? "ประถม";

  // ★ time slots สำหรับ "ของฉัน" → ใช้ primary เป็น default
  const myTimeSlots = (() => {
    if (homeroomClassroom) {
      const type = homeroomClassroom.schedule_type ?? "primary";
      const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[0];
      if (timeSlots.length > 0) {
        return tmpl.slots.map((tmplSlot, idx) => {
          const m = timeSlots.find(s => s.start_time.slice(0, 5) === tmplSlot.start_time && (!s.schedule_type || s.schedule_type === type));
          return m ?? { id: `tmpl-${type}-${idx}`, ...tmplSlot, schedule_type: type } as TimeSlot;
        });
      }
      return tmpl.slots.map((s, i) => ({ ...s, id: `tmpl-${i}` }));
    }
    // fallback: ใช้ primary
    const tmpl = SCHEDULE_TEMPLATES[0];
    if (timeSlots.length > 0) {
      return tmpl.slots.map((tmplSlot, idx) => {
        const m = timeSlots.find(s => s.start_time.slice(0, 5) === tmplSlot.start_time);
        return m ?? { id: `tmpl-p-${idx}`, ...tmplSlot } as TimeSlot;
      });
    }
    return tmpl.slots.map((s, i) => ({ ...s, id: `tmpl-${i}` }));
  })();

  return (
    <div className="min-h-screen bg-slate-50 font-sans print:bg-white">
      {showSettings && selectedClassroom && (
        <ScheduleSettingsModal onClose={() => setShowSettings(false)} onApply={applyScheduleType} />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg">🏠</button>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-none">ตารางสอน</h1>
              <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.year_name}</option>)}
            </select>
            {/* ★ ครู + ครูประจำชั้น แสดงปุ่ม "ของฉัน" */}
            {!isAdmin && (
              <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                <button onClick={() => setViewMode("room")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "room" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                  🏫 ห้อง
                </button>
                <button onClick={() => setViewMode("teacher")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "teacher" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                  👤 ของฉัน
                </button>
              </div>
            )}
            {isAdmin && selectedClassroom && (
              <button onClick={() => setShowSettings(true)}
                className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50 flex items-center gap-1.5">
                ⚙️ <span className="hidden sm:inline">{currentScheduleType}</span>
              </button>
            )}
            <button onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex items-center gap-1.5">
              🖨️ พิมพ์
            </button>
          </div>
        </div>
      </div>

      {/* Debug banner */}
      {isAdmin && debugInfo && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 print:hidden">
          <p className="text-[11px] text-amber-700 font-mono">{debugInfo}</p>
        </div>
      )}

      <div className="flex h-[calc(100vh-65px)] print:h-auto">
        {/* Sidebar */}
        <aside className="w-52 bg-white border-r border-slate-200 overflow-y-auto shrink-0 print:hidden">
          <div className="p-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider px-2 mb-2">ห้องเรียน</p>

            {/* ★ ครูประจำชั้น: แสดงห้องของตัวเองก่อน */}
            {!isAdmin && homeroomClassroom && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-blue-500 uppercase px-2 mb-1">ห้องของฉัน</p>
                <button
                  onClick={() => { setSelectedRoom(homeroomClassroom.id); setViewMode("room"); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5 flex items-center justify-between
                    ${selectedRoom === homeroomClassroom.id && viewMode === "room" ? "bg-blue-600 text-white" : "hover:bg-blue-50 text-blue-700 bg-blue-50 border border-blue-200"}`}>
                  <span>⭐ {homeroomClassroom.room_name ?? `ห้อง ${homeroomClassroom.room_number}`}</span>
                </button>
              </div>
            )}

            {/* ★ ห้องที่ครูสอน (สายชั้นของตัวเอง) */}
            {!isAdmin && myClassrooms.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1">ห้องที่ฉันสอน</p>
                {myClassrooms.map(room => (
                  <button key={room.id}
                    onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5 flex items-center justify-between
                      ${selectedRoom === room.id && viewMode === "room" ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                    <span>{room.room_name ?? `ห้อง ${room.room_number}`}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${selectedRoom === room.id && viewMode === "room" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {room.grade_group}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {classrooms.length === 0 && (
              <div className="text-xs text-slate-400 px-2 py-4 text-center space-y-2">
                <p>ยังไม่มีข้อมูลห้องเรียน</p>
                {isAdmin && <p className="text-amber-600 font-bold">เพิ่มห้องเรียนใน Supabase ก่อน</p>}
              </div>
            )}

            {/* ★ Admin: แสดงทุกห้อง */}
            {isAdmin && gradeGroups.map(grade => {
              const gradeRooms = classrooms
                .filter(c => c.grade_group === grade)
                .sort((a, b) => (a.room_name ?? "").localeCompare(b.room_name ?? "", "th", { numeric: true }));
              return (
                <div key={grade} className="mb-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1">{grade}</p>
                  {gradeRooms.map(room => {
                    const tmplKey   = room.schedule_type ?? "primary";
                    const tmplLabel = tmplKey === "primary" ? "ป." : tmplKey === "junior" ? "ม.ต้น" : "ม.ปลาย";
                    return (
                      <button key={room.id}
                        onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5 flex items-center justify-between
                          ${selectedRoom === room.id && viewMode === "room" ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                        <span>{room.room_name ?? `ห้อง ${room.room_number}`}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${selectedRoom === room.id && viewMode === "room" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                          {tmplLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto p-4 print:p-0">
          <div className="hidden print:block mb-4 text-center border-b pb-4">
            <h1 className="text-xl font-black">ตารางสอนโรงเรียนวัดเขียนเขต</h1>
            {viewMode === "room" && selectedClassroom && (
              <p className="text-base font-bold">{selectedClassroom.grade_group} {selectedClassroom.room_name} · ปีการศึกษา {academicYears.find(y => y.id === selectedYear)?.year_name}</p>
            )}
          </div>

          {/* ── ดูตามห้อง ── */}
          {viewMode === "room" && selectedClassroom ? (
            <div>
              <div className="flex items-center justify-between mb-4 print:hidden flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-black text-slate-800">{selectedClassroom.grade_group} {selectedClassroom.room_name}</h2>
                  <p className="text-slate-400 text-sm">{roomEntries.length} คาบ · ตาราง{currentScheduleType}</p>
                </div>
              </div>

              {/* Desktop */}
              <div className="hidden md:block">
                <TimetableGrid
                  classroom={selectedClassroom} entries={roomEntries} timeSlots={roomTimeSlots}
                  subjects={subjects} teachers={teachers} academicYearId={selectedYear}
                  isAdmin={isAdmin} currentUser={user} onRefresh={loadEntries}
                />
              </div>

              {/* Mobile */}
              <MobileView
                entries={roomEntries} timeSlots={roomTimeSlots} subjects={subjects} teachers={teachers}
                isAdmin={isAdmin} currentUser={user} subjectColorMap={subjectColorMap}
                onCellClick={(slot, day, entry) => { if (isAdmin) setModal({ slot, day, entry }); }}
              />
              {modal && selectedClassroom && (
                <EntryModal
                  entry={modal.entry} slot={modal.slot} day={modal.day} classroom={selectedClassroom}
                  subjects={subjects} teachers={teachers} academicYearId={selectedYear}
                  onSave={async (data) => {
                    if (data.id) {
                      await (supabase.from("timetable_entries") as any)
                        .update({ subject_id: data.subject_id, teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 })
                        .eq("id", data.id);
                    } else {
                      await (supabase.from("timetable_entries") as any).insert([{
                        classroom_id: data.classroom_id, subject_id: data.subject_id,
                        teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2,
                        day_of_week: data.day_of_week, time_slot_id: data.time_slot_id,
                        academic_year_id: data.academic_year_id,
                      }]);
                    }
                    setModal(null); loadEntries();
                  }}
                  onDelete={async (id) => { await supabase.from("timetable_entries").delete().eq("id", id); setModal(null); loadEntries(); }}
                  onClose={() => setModal(null)}
                />
              )}
            </div>
          ) : viewMode === "teacher" ? (
            /* ── ตารางสอนของฉัน ── */
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-800">ตารางสอนของฉัน</h2>
                <p className="text-slate-400 text-sm">{fullName(user)} · {myEntries.length} คาบ/สัปดาห์</p>
                {homeroomClassroom && (
                  <p className="text-blue-600 text-sm font-bold mt-1">⭐ ครูประจำชั้น: {homeroomClassroom.grade_group} {homeroomClassroom.room_name}</p>
                )}
              </div>

              {/* สรุปรายวัน */}
              <div className="grid grid-cols-5 gap-3 mb-5">
                {DAYS.map((day, i) => {
                  const count = myEntries.filter(e => e.day_of_week === i + 1).length;
                  const dc    = DAY_COLORS[i];
                  return (
                    <div key={day} className={`${dc.bg} border-2 ${dc.border} rounded-2xl p-3 text-center`}>
                      <p className={`text-xs font-black ${dc.text}`}>{day}</p>
                      <p className={`text-2xl font-black ${dc.text}`}>{count}</p>
                      <p className="text-slate-400 text-[10px] font-bold">คาบ</p>
                    </div>
                  );
                })}
              </div>

              {/* ★ ตาราง grid แสดงคาบของฉัน */}
              {myEntries.length > 0 ? (
                <div className="mb-5">
                  <h3 className="font-black text-slate-700 text-sm mb-3">📅 ตารางคาบสอนของฉัน</h3>
                  <PersonalTimetableGrid
                    myEntries={myEntries} timeSlots={myTimeSlots} subjects={subjects}
                    teachers={teachers} classrooms={classrooms} userId={user.id}
                  />
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200 mb-5">
                  <p className="text-4xl mb-3">📅</p>
                  <p className="font-bold">ยังไม่มีตารางสอน</p>
                </div>
              )}

              {/* ★ รายชั้นเรียนที่สอน */}
              {myClassrooms.length > 0 && (
                <div>
                  <h3 className="font-black text-slate-700 text-sm mb-3">🏫 ห้องเรียนที่ฉันสอน ({myClassrooms.length} ห้อง)</h3>
                  <div className="space-y-4">
                    {myClassrooms.map(room => {
                      const roomMyEntries = myEntries.filter(e => e.classroom_id === room.id);
                      const roomSlots     = (() => {
                        const type = room.schedule_type ?? "primary";
                        const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[0];
                        if (timeSlots.length > 0) {
                          return tmpl.slots.map((tmplSlot, idx) => {
                            const m = timeSlots.find(s => s.start_time.slice(0, 5) === tmplSlot.start_time && (!s.schedule_type || s.schedule_type === type));
                            return m ?? { id: `tmpl-${type}-${idx}`, ...tmplSlot, schedule_type: type } as TimeSlot;
                          });
                        }
                        return tmpl.slots.map((s, i) => ({ ...s, id: `tmpl-${i}` }));
                      })();

                      return (
                        <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                            <div>
                              <h4 className="font-black text-slate-700">{room.grade_group} {room.room_name}</h4>
                              <p className="text-slate-400 text-xs">{roomMyEntries.length} คาบ</p>
                            </div>
                            <button onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                              className="text-xs font-black text-blue-600 px-3 py-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100">
                              👁️ ดูตารางห้อง
                            </button>
                          </div>
                          <div className="p-4 space-y-2">
                            {[1, 2, 3, 4, 5].map(day => {
                              const dayEntries = roomMyEntries.filter(e => e.day_of_week === day);
                              if (dayEntries.length === 0) return null;
                              const dc = DAY_COLORS[day - 1];
                              return (
                                <div key={day} className="flex gap-2 items-center flex-wrap">
                                  <span className={`text-xs font-black px-2 py-1 rounded-lg ${dc.bg} ${dc.text} border ${dc.border} w-12 text-center shrink-0`}>{DAY_SHORT[day - 1]}</span>
                                  {dayEntries.map(e => {
                                    const slot    = roomSlots.find(s => s.id === e.time_slot_id);
                                    const subject = subjects.find(s => s.id === e.subject_id) ?? (e as any).subject;
                                    const isMe2   = e.teacher_id_2 === user.id;
                                    return (
                                      <span key={e.id} className="text-xs font-bold bg-blue-100 border border-blue-300 text-blue-800 px-2 py-1 rounded-lg flex items-center gap-1">
                                        <span className="font-black">{slot?.slot_label}</span>
                                        <span>{(subject as any)?.name_th ?? "—"}</span>
                                        {isMe2 && <span className="text-[9px] bg-purple-500 text-white px-1 rounded">ครู 2</span>}
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-3">🏫</p>
                <p className="font-bold">เลือกห้องเรียนจากเมนูซ้าย</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        @media print {
          aside, .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { font-size: 10px; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}