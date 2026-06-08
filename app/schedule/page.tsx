"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const DAY_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ."];
const DAY_COLORS = [
  { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", header: "bg-yellow-400" },
  { bg: "bg-pink-50",   border: "border-pink-300",   text: "text-pink-800",   header: "bg-pink-400"   },
  { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-800",  header: "bg-green-500"  },
  { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", header: "bg-orange-400" },
  { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-800",   header: "bg-blue-400"   },
];

const SUBJECT_COLORS = [
  "bg-red-100 border-red-300 text-red-800",
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-green-100 border-green-300 text-green-800",
  "bg-yellow-100 border-yellow-300 text-yellow-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-pink-100 border-pink-300 text-pink-800",
  "bg-indigo-100 border-indigo-300 text-indigo-800",
  "bg-orange-100 border-orange-300 text-orange-800",
  "bg-teal-100 border-teal-300 text-teal-800",
  "bg-cyan-100 border-cyan-300 text-cyan-800",
];

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head"];

type UserProfile = {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email: string;
  role: string;
  position?: string;
};

type TimeSlot = {
  id: string;
  slot_number: number;
  start_time: string;
  end_time: string;
  slot_label?: string;
  is_break: boolean;
};

type Subject = {
  id: string;
  subject_code: string;
  name_th: string;
  name_en?: string;
  subject_group?: string;
};

type Teacher = {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
};

type Classroom = {
  id: string;
  room_number: number;
  room_name?: string;
  grade_group?: string;
  academic_year_id?: string; // เพิ่มบรรทัดนี้
};

type TimetableEntry = {
  id: string;
  classroom_id: string;
  subject_id: string;
  teacher_id: string;
  day_of_week: number;
  time_slot_id: string;
  academic_year_id: string;
  subject?: Subject;
  teacher?: Teacher;
};

function fullName(u: any) {
  if (!u) return "—";
  if (u.full_name) return u.full_name;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—";
}

function shortName(u: any) {
  if (!u) return "—";
  const name = fullName(u);
  const parts = name.split(" ");
  if (parts.length >= 2) return parts[0][0] + ". " + parts[parts.length - 1];
  return name;
}

function formatTime(t: string) {
  return t?.slice(0, 5) ?? "";
}

// ── Entry Modal ───────────────────────────────────────────────────────────────
function EntryModal({
  entry, slot, day, classroom, subjects, teachers, academicYearId,
  onSave, onDelete, onClose,
}: {
  entry?: TimetableEntry;
  slot: TimeSlot;
  day: number;
  classroom: Classroom;
  subjects: Subject[];
  teachers: Teacher[];
  academicYearId: string;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [subjectId, setSubjectId] = useState(entry?.subject_id ?? "");
  const [teacherId, setTeacherId] = useState(entry?.teacher_id ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!subjectId || !teacherId) { alert("กรุณาเลือกวิชาและครู"); return; }
    setLoading(true);
    await onSave({
      id: entry?.id,
      classroom_id: classroom.id,
      subject_id: subjectId,
      teacher_id: teacherId,
      day_of_week: day,
      time_slot_id: slot.id,
      academic_year_id: academicYearId,
    });
    setLoading(false);
  }

  const dayColor = DAY_COLORS[day - 1];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`${dayColor.header} px-6 py-4 text-white`}>
          <p className="text-sm opacity-80 font-medium">
            {DAYS[day - 1]} · คาบ {slot.slot_number} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
          </p>
          <h3 className="text-lg font-black mt-0.5">
            {entry ? "✏️ แก้ไขคาบเรียน" : "➕ เพิ่มคาบเรียน"}
          </h3>
          <p className="text-sm opacity-70 mt-0.5">ห้อง {classroom.grade_group ?? ""} {classroom.room_name ?? ""}</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">วิชา *</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none">
              <option value="">— เลือกวิชา —</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.subject_code} {s.name_th}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">ครูผู้สอน *</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none">
              <option value="">— เลือกครู —</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{fullName(t)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-2">
          {entry && onDelete && (
            <button onClick={async () => { if (confirm("ลบคาบนี้?")) { setLoading(true); await onDelete(entry.id); setLoading(false); } }}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm hover:bg-red-100 transition-all">
              🗑️ ลบ
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50 transition-all">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm transition-all disabled:opacity-50">
            {loading ? "⏳ กำลังบันทึก..." : "💾 บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Timetable Grid ────────────────────────────────────────────────────────────
function TimetableGrid({
  classroom, entries, timeSlots, subjects, teachers,
  academicYearId, isAdmin, currentUser,
  onRefresh,
}: {
  classroom: Classroom;
  entries: TimetableEntry[];
  timeSlots: TimeSlot[];
  subjects: Subject[];
  teachers: Teacher[];
  academicYearId: string;
  isAdmin: boolean;
  currentUser: UserProfile;
  onRefresh: () => void;
}) {
  const [modal, setModal] = useState<{ slot: TimeSlot; day: number; entry?: TimetableEntry } | null>(null);

  const subjectColorMap: Record<string, string> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  function getEntry(day: number, slotId: string) {
    return entries.find(e => e.day_of_week === day && e.time_slot_id === slotId);
  }

  async function handleSave(data: any) {
    if (data.id) {
      await (supabase.from("timetable_entries") as any).update({
        subject_id: data.subject_id,
        teacher_id: data.teacher_id,
      }).eq("id", data.id);
    } else {
      await (supabase.from("timetable_entries") as any).insert([{
        classroom_id: data.classroom_id,
        subject_id: data.subject_id,
        teacher_id: data.teacher_id,
        day_of_week: data.day_of_week,
        time_slot_id: data.time_slot_id,
        academic_year_id: data.academic_year_id,
      }]);
    }
    setModal(null);
    onRefresh();
  }

  async function handleDelete(id: string) {
    await supabase.from("timetable_entries").delete().eq("id", id);
    setModal(null);
    onRefresh();
  }

  const nonBreakSlots = timeSlots.filter(s => !s.is_break);
  const breakSlots = timeSlots.filter(s => s.is_break);

  return (
    <>
      {modal && (
        <EntryModal
          entry={modal.entry}
          slot={modal.slot}
          day={modal.day}
          classroom={classroom}
          subjects={subjects}
          teachers={teachers}
          academicYearId={academicYearId}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      {/* Desktop grid */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-24 px-2 py-3 text-xs font-black text-slate-400 uppercase tracking-wider text-center border-b-2 border-slate-200">คาบ</th>
              {DAYS.map((day, i) => (
                <th key={day} className={`px-2 py-3 text-sm font-black text-white text-center ${DAY_COLORS[i].header} first:rounded-tl-xl last:rounded-tr-xl`}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map(slot => {
              if (slot.is_break) {
                return (
                  <tr key={slot.id} className="bg-slate-50">
                    <td colSpan={6} className="px-4 py-2 text-center text-xs font-bold text-slate-400 border-y border-slate-200">
                      — {slot.slot_label ?? "พักกลางวัน"} ({formatTime(slot.start_time)}–{formatTime(slot.end_time)}) —
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={slot.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  {/* Time slot */}
                  <td className="px-2 py-2 text-center border-r border-slate-200">
                    <div className="text-xs font-black text-slate-600">คาบ {slot.slot_number}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{formatTime(slot.start_time)}</div>
                    <div className="text-[10px] text-slate-400">–{formatTime(slot.end_time)}</div>
                  </td>
                  {/* Day cells */}
                  {[1, 2, 3, 4, 5].map(day => {
                    const entry = getEntry(day, slot.id);
                    const colorClass = entry ? (subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0]) : "";
                    const teacher = entry ? teachers.find(t => t.id === entry.teacher_id) : null;
                    const subject = entry ? subjects.find(s => s.id === entry.subject_id) : null;
                    const isMyClass = !isAdmin && entry?.teacher_id === currentUser.id;

                    return (
                      <td key={day} className="px-1.5 py-1.5 align-top">
                        {entry ? (
                          <div
                            className={`rounded-xl border-2 px-2 py-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${colorClass} ${isMyClass ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
                            onClick={() => isAdmin && setModal({ slot, day, entry })}
                          >
                            <p className="font-black text-xs leading-tight line-clamp-2">{subject?.name_th ?? "—"}</p>
                            <p className="text-[10px] font-medium opacity-70 mt-0.5 truncate">{shortName(teacher)}</p>
                            {isMyClass && <span className="text-[9px] font-black bg-blue-500 text-white px-1 py-0.5 rounded mt-0.5 inline-block">ฉัน</span>}
                          </div>
                        ) : (
                          isAdmin ? (
                            <div
                              className="rounded-xl border-2 border-dashed border-slate-200 px-2 py-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center"
                              onClick={() => setModal({ slot, day })}
                            >
                              <span className="text-slate-300 text-lg">+</span>
                            </div>
                          ) : (
                            <div className="rounded-xl border-2 border-dashed border-slate-100 px-2 py-4" />
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

      {/* Mobile: day tabs */}
      <MobileTimetable
        classroom={classroom}
        entries={entries}
        timeSlots={timeSlots}
        subjects={subjects}
        teachers={teachers}
        isAdmin={isAdmin}
        currentUser={currentUser}
        subjectColorMap={subjectColorMap}
        onCellClick={(slot, day, entry) => isAdmin && setModal({ slot, day, entry })}
      />
    </>
  );
}

// ── Mobile timetable ──────────────────────────────────────────────────────────
function MobileTimetable({ classroom, entries, timeSlots, subjects, teachers, isAdmin, currentUser, subjectColorMap, onCellClick }: {
  classroom: Classroom;
  entries: TimetableEntry[];
  timeSlots: TimeSlot[];
  subjects: Subject[];
  teachers: Teacher[];
  isAdmin: boolean;
  currentUser: UserProfile;
  subjectColorMap: Record<string, string>;
  onCellClick: (slot: TimeSlot, day: number, entry?: TimetableEntry) => void; // เพิ่มบรรทัดนี้
}) {
  const [activeDay, setActiveDay] = useState(1);

  return (
    <div className="md:hidden">
      {/* Day tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {DAYS.map((day, i) => (
          <button key={day} onClick={() => setActiveDay(i + 1)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${activeDay === i + 1 ? `${DAY_COLORS[i].header} text-white border-transparent` : "bg-white border-slate-200 text-slate-600"}`}>
            {DAY_SHORT[i]}
          </button>
        ))}
      </div>

      {/* Slots for active day */}
      <div className="space-y-2">
        {timeSlots.map(slot => {
          if (slot.is_break) return (
            <div key={slot.id} className="text-center text-xs text-slate-400 font-bold py-1">
              — {slot.slot_label ?? "พัก"} —
            </div>
          );
          const entry = entries.find((e: any) => e.day_of_week === activeDay && e.time_slot_id === slot.id);
          const teacher = entry ? teachers.find((t: any) => t.id === entry.teacher_id) : null;
          const subject = entry ? subjects.find((s: any) => s.id === entry.subject_id) : null;
          const colorClass = entry ? (subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0]) : "";
          const isMyClass = !isAdmin && entry?.teacher_id === currentUser.id;

          return (
            <div key={slot.id} className="flex gap-3 items-center">
              <div className="w-16 text-center shrink-0">
                <div className="text-xs font-black text-slate-500">คาบ {slot.slot_number}</div>
                <div className="text-[10px] text-slate-400">{formatTime(slot.start_time)}</div>
              </div>
              {entry ? (
                <div className={`flex-1 rounded-xl border-2 px-3 py-2 cursor-pointer ${colorClass} ${isMyClass ? "ring-2 ring-blue-400" : ""}`}
                  onClick={() => onCellClick(slot, activeDay, entry)}>
                  <p className="font-black text-sm">{subject?.name_th ?? "—"}</p>
                  <p className="text-xs opacity-70">{fullName(teacher)}</p>
                </div>
              ) : (
                isAdmin ? (
                  <div className="flex-1 rounded-xl border-2 border-dashed border-slate-200 px-3 py-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all text-center"
                    onClick={() => onCellClick(slot, activeDay, undefined)}>
                    <span className="text-slate-300 text-lg">+</span>
                  </div>
                ) : (
                  <div className="flex-1 rounded-xl border-2 border-dashed border-slate-100 px-3 py-3" />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function SchedulePage() {
  const router = useRouter();
  const [user,          setUser]          = useState<UserProfile | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [classrooms,    setClassrooms]    = useState<Classroom[]>([]);
  const [timeSlots,     setTimeSlots]     = useState<TimeSlot[]>([]);
  const [subjects,      setSubjects]      = useState<Subject[]>([]);
  const [teachers,      setTeachers]      = useState<Teacher[]>([]);
  const [entries,       setEntries]       = useState<TimetableEntry[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; year_name: string }[]>([]);
  const [selectedYear,  setSelectedYear]  = useState("");
  const [selectedRoom,  setSelectedRoom]  = useState("");
  const [viewMode,      setViewMode]      = useState<"room" | "teacher">("room");
  const [isPrinting,    setIsPrinting]    = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setLoading(false); return; }

    // ── เหมือนระบบลา: ลอง auth_id ก่อน ถ้าไม่เจอใช้ email ──
        let profileData: any = null;

        const { data: byAuthId } = await supabase
        .from("users")
        .select("id, first_name, last_name, full_name, email, role, position")
        .eq("auth_id", authUser.id)
        .maybeSingle();
        profileData = byAuthId;

        if (!profileData && authUser.email) {
        const { data: byEmail } = await supabase
            .from("users")
            .select("id, first_name, last_name, full_name, email, role, position")
            .eq("email", authUser.email)
            .maybeSingle();
        profileData = byEmail;
        if (profileData) {
            await (supabase.from("users") as any)
            .update({ auth_id: authUser.id })
            .eq("id", profileData.id);
        }
        }

    // ── Last resort: สร้าง profile จาก metadata ──
        if (!profileData) {
        const meta = authUser.user_metadata ?? {};
        profileData = {
            id: authUser.id,
            email: authUser.email ?? "",
            first_name: meta.first_name ?? meta.name ?? "",
            last_name: meta.last_name ?? "",
            full_name: meta.full_name ?? meta.name ?? authUser.email ?? "",
            role: meta.role ?? "teacher",
            position: meta.position ?? "",
        };
        }

        setUser({
        ...profileData,
        full_name: profileData.full_name ||
            `${profileData.first_name ?? ""} ${profileData.last_name ?? ""}`.trim(),
        });

      // Load static data
      const [yearsRes, slotsRes, subjectsRes, teachersRes, classroomsRes] = await Promise.all([
        supabase.from("academic_years").select("id, year_name").order("year_name", { ascending: false }),
        supabase.from("time_slots").select("*").order("slot_number"),
        supabase.from("subjects").select("id, subject_code, name_th, name_en, subject_group").order("subject_code"),
        supabase.from("users").select("id, first_name, last_name, full_name, position")
          .in("role", ["subject_teacher", "homeroom_teacher", "teacher", "staff"]),
        supabase.from("classrooms").select("id, room_number, room_name, grade_group, academic_year_id")
          .order("grade_group").order("room_number"),
      ]);

      const years = (yearsRes.data ?? []) as any[];
      setAcademicYears(years);
      setTimeSlots((slotsRes.data ?? []) as TimeSlot[]);
      setSubjects((subjectsRes.data ?? []) as Subject[]);
      setTeachers(((teachersRes.data ?? []) as any[]).map(t => ({
        ...t,
        full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
      })));

      const rooms = (classroomsRes.data ?? []) as Classroom[];
      if (years.length > 0) {
        setSelectedYear(years[0].id);
        const filtered = rooms.filter(r => r.academic_year_id === years[0].id);
        setClassrooms(filtered);
        if (filtered.length > 0) setSelectedRoom(filtered[0].id);
      }

      setLoading(false);
    };
    init();
  }, []);

  // Filter classrooms by selected year
  useEffect(() => {
    if (!selectedYear) return;
    supabase.from("classrooms")
      .select("id, room_number, room_name, grade_group, academic_year_id")
      .eq("academic_year_id", selectedYear)
      .order("grade_group").order("room_number")
      .then(({ data }) => {
        const rooms = (data ?? []) as Classroom[];
        setClassrooms(rooms);
        if (rooms.length > 0) setSelectedRoom(rooms[0].id);
      });
  }, [selectedYear]);

  const loadEntries = useCallback(async () => {
    if (!selectedYear) return;
    const { data } = await (supabase.from("timetable_entries") as any)
      .select("*, subject:subjects(id,subject_code,name_th), teacher:users(id,first_name,last_name,full_name)")
      .eq("academic_year_id", selectedYear);
    setEntries((data ?? []) as TimetableEntry[]);
  }, [selectedYear]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

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

  const isAdmin = ADMIN_ROLES.includes(user.role);
  const selectedClassroom = classrooms.find(c => c.id === selectedRoom);
  const roomEntries = entries.filter(e => e.classroom_id === selectedRoom);
  const myEntries = entries.filter(e => e.teacher_id === user.id);

  // Group by grade for sidebar
  const gradeGroups = [...new Set(classrooms.map(c => c.grade_group))].filter(Boolean).sort();

  function handlePrint() {
    setIsPrinting(true);
    setTimeout(() => { window.print(); setIsPrinting(false); }, 300);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans print:bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors text-lg">🏠</button>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-none">ตารางสอน</h1>
              <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Academic year selector */}
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none focus:border-blue-400">
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.year_name}</option>)}
            </select>

            {/* View mode toggle */}
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

            <button onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm transition-all flex items-center gap-1.5">
              🖨️ พิมพ์
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-65px)] print:h-auto">
        {/* Sidebar — room list */}
        <aside className="w-52 bg-white border-r border-slate-200 overflow-y-auto shrink-0 print:hidden">
          <div className="p-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider px-2 mb-2">ห้องเรียน</p>
            {gradeGroups.map(grade => {
              const gradeRooms = classrooms.filter(c => c.grade_group === grade);
              return (
                <div key={grade} className="mb-3">
                  <p className="text-xs font-black text-slate-500 px-2 mb-1">{grade}</p>
                  {gradeRooms.map(room => (
                    <button key={room.id}
                      onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5 ${selectedRoom === room.id && viewMode === "room" ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                      {room.room_name ?? `ห้อง ${room.room_number}`}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 print:p-0">
          {/* Print header */}
          <div className="hidden print:block mb-4 text-center">
            <h1 className="text-xl font-black">ตารางสอนโรงเรียนวัดเขียนเขต</h1>
            {viewMode === "room" && selectedClassroom && (
              <p className="text-base font-bold">{selectedClassroom.grade_group} {selectedClassroom.room_name}</p>
            )}
            {viewMode === "teacher" && (
              <p className="text-base font-bold">ตารางสอน{fullName(user)}</p>
            )}
          </div>

          {viewMode === "room" && selectedClassroom ? (
            <div>
              {/* Room header */}
              <div className="flex items-center justify-between mb-4 print:hidden">
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    {selectedClassroom.grade_group} {selectedClassroom.room_name}
                  </h2>
                  <p className="text-slate-400 text-sm">{roomEntries.length} คาบ · ปีการศึกษา {academicYears.find(y => y.id === selectedYear)?.year_name}</p>
                </div>
              </div>

              <TimetableGrid
                classroom={selectedClassroom}
                entries={roomEntries}
                timeSlots={timeSlots}
                subjects={subjects}
                teachers={teachers}
                academicYearId={selectedYear}
                isAdmin={isAdmin}
                currentUser={user}
                onRefresh={loadEntries}
              />
            </div>
          ) : viewMode === "teacher" ? (
            /* Teacher's own schedule */
            <div>
              <div className="mb-4 print:hidden">
                <h2 className="text-xl font-black text-slate-800">ตารางสอนของฉัน</h2>
                <p className="text-slate-400 text-sm">{fullName(user)} · {myEntries.length} คาบ/สัปดาห์</p>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 print:hidden">
                {DAYS.map((day, i) => {
                  const count = myEntries.filter(e => e.day_of_week === i + 1).length;
                  return (
                    <div key={day} className={`${DAY_COLORS[i].bg} border-2 ${DAY_COLORS[i].border} rounded-2xl p-3 text-center`}>
                      <p className={`text-xs font-black ${DAY_COLORS[i].text}`}>{day}</p>
                      <p className={`text-2xl font-black ${DAY_COLORS[i].text}`}>{count}</p>
                      <p className="text-slate-400 text-[10px] font-bold">คาบ</p>
                    </div>
                  );
                })}
              </div>

              {/* For teacher view, show all rooms they teach */}
              {classrooms.length > 0 && (
                <div className="space-y-6">
                  {classrooms.filter(room => myEntries.some(e => e.classroom_id === room.id)).map(room => {
                    const roomMyEntries = myEntries.filter(e => e.classroom_id === room.id);
                    return (
                      <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
                          <h3 className="font-black text-slate-700">{room.grade_group} {room.room_name}</h3>
                          <p className="text-slate-400 text-xs">{roomMyEntries.length} คาบ</p>
                        </div>
                        <div className="p-4">
                          <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map(day => {
                              const dayEntries = roomMyEntries.filter(e => e.day_of_week === day);
                              if (dayEntries.length === 0) return null;
                              return (
                                <div key={day} className="flex gap-2 items-center flex-wrap">
                                  <span className={`text-xs font-black px-2 py-1 rounded-lg ${DAY_COLORS[day - 1].bg} ${DAY_COLORS[day - 1].text} border ${DAY_COLORS[day - 1].border} w-12 text-center`}>
                                    {DAY_SHORT[day - 1]}
                                  </span>
                                  {dayEntries.map(e => {
                                    const slot = timeSlots.find(s => s.id === e.time_slot_id);
                                    const subject = subjects.find(s => s.id === e.subject_id);
                                    return (
                                      <span key={e.id} className="text-xs font-bold bg-blue-100 border border-blue-300 text-blue-800 px-2 py-1 rounded-lg">
                                        คาบ {slot?.slot_number} {subject?.name_th}
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {classrooms.filter(room => myEntries.some(e => e.classroom_id === room.id)).length === 0 && (
                    <div className="text-center py-16 text-slate-400">
                      <p className="text-4xl mb-3">📅</p>
                      <p className="font-bold">ยังไม่มีตารางสอน</p>
                    </div>
                  )}
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

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { font-size: 11px; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}