"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AttendanceTool from "@/components/attendance/AttendanceTool";

const supabase = createClient();

type SectionOption = {
  id: string; classroom_id: string;
  subject_name: string; subject_code: string;
  classroom_label: string;
};
type Student = { id: string; title?: string; first_name: string; last_name: string; student_number: number; avatar_url?: string };
type RefStatus = "present" | "absent" | "late" | "leave";


export default function SmartClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [homeroomMap, setHomeroomMap] = useState<Record<string, { status: RefStatus }>>({});
  type Period = { timetable_entry_id: string; slot_number?: number; start_time?: string; end_time?: string; slot_label?: string };

const [periods, setPeriods] = useState<Period[]>([]);
const [timetableEntryId, setTimetableEntryId] = useState("");
const [loadingPeriods, setLoadingPeriods] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
      if (!profile) { setLoading(false); return; }
      setCurrentUserId(profile.id);

      const { data: secRows } = await supabase
        .from("subject_sections")
        .select("id, classroom_id, subject_id, teacher_id, co_teacher_id")
        .or(`teacher_id.eq.${profile.id},co_teacher_id.eq.${profile.id}`)
        .eq("is_active", true);

      const rows = secRows ?? [];
      const subjectIds = [...new Set(rows.map((r: any) => r.subject_id))];
      const classroomIds = [...new Set(rows.map((r: any) => r.classroom_id))];

      const [{ data: subs }, { data: rooms }] = await Promise.all([
        subjectIds.length ? supabase.from("subjects").select("id,name_th,subject_code").in("id", subjectIds) : Promise.resolve({ data: [] }),
        classroomIds.length ? supabase.from("classrooms").select("id,room_name,grade_group").in("id", classroomIds) : Promise.resolve({ data: [] }),
      ]);
      const subMap = new Map((subs ?? []).map((s: any) => [s.id, s]));
      const roomMap = new Map((rooms ?? []).map((r: any) => [r.id, r]));

      const options: SectionOption[] = rows.map((r: any) => {
        const subj = subMap.get(r.subject_id);
        const room = roomMap.get(r.classroom_id);
        return {
          id: r.id, classroom_id: r.classroom_id,
          subject_name: subj?.name_th ?? "—", subject_code: subj?.subject_code ?? "",
          classroom_label: room ? `${room.grade_group ?? ""} ${room.room_name ?? ""}`.trim() : "—",
        };
      });
      setSections(options);
      if (options.length > 0) setSectionId(options[0].id);
      setLoading(false);
    })();
  }, []);

  const loadStudents = useCallback(async (secId: string) => {
    if (!secId) { setStudents([]); return; }
    setLoadingStudents(true);
    const { data: enrollments } = await supabase.from("subject_enrollments").select("student_id").eq("subject_section_id", secId);
    const ids = (enrollments ?? []).map((e: any) => e.student_id);
    if (ids.length === 0) { setStudents([]); setLoadingStudents(false); return; }
    const { data } = await supabase.from("students").select("id,title,first_name,last_name,student_number,avatar_url").in("id", ids).order("student_number");
    setStudents((data ?? []) as Student[]);
    setLoadingStudents(false);
  }, []);

  useEffect(() => {
  (async () => {
    if (!sectionId || !selectedDate) { setPeriods([]); setTimetableEntryId(""); return; }
    setLoadingPeriods(true);
    try {
      const res = await fetch(`/api/timetable/periods?subject_section_id=${sectionId}&attendance_date=${selectedDate}`);
      const json = await res.json();
      const list: Period[] = json.periods ?? [];
      setPeriods(list);
      setTimetableEntryId(list.length > 0 ? list[0].timetable_entry_id : "");
    } catch {
      setPeriods([]); setTimetableEntryId("");
    } finally {
      setLoadingPeriods(false);
    }
  })();
}, [sectionId, selectedDate]);

  useEffect(() => { if (sectionId) loadStudents(sectionId); }, [sectionId, loadStudents]);

  const selectedSection = useMemo(() => sections.find(s => s.id === sectionId), [sections, sectionId]);

  // ดึงเช็กชื่อโฮมรูมของห้อง+วันนี้ มาโชว์เป็นข้อมูลอ้างอิง (จากตาราง attendance_records เดิมที่มีอยู่แล้ว)
  useEffect(() => {
    (async () => {
      if (!selectedSection?.classroom_id || !selectedDate) { setHomeroomMap({}); return; }
      const { data } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("classroom_id", selectedSection.classroom_id)
        .eq("attendance_date", selectedDate);
      const map: Record<string, { status: RefStatus }> = {};
      (data ?? []).forEach((r: any) => { map[r.student_id] = { status: r.status }; });
      setHomeroomMap(map);
    })();
  }, [selectedSection?.classroom_id, selectedDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-black text-lg animate-pulse">กำลังโหลด Smart Class...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">✅ Smart Class — เช็กชื่อรายวิชา</h1>
            <p className="text-slate-400 text-xs">เลือกวิชาและวันที่เพื่อเริ่มเช็กชื่อ</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <select value={sectionId} onChange={e => setSectionId(e.target.value)}
            className="flex-1 min-w-[220px] bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none">
            {sections.length === 0 && <option value="">— ไม่มีวิชาที่คุณสอน —</option>}
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.subject_code} {s.subject_name} · {s.classroom_label}</option>
            ))}
          </select>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none" />
        </div>
        {periods.length > 1 && (
  <select value={timetableEntryId} onChange={e => setTimetableEntryId(e.target.value)}
    className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none">
    {periods.map(p => (
      <option key={p.timetable_entry_id} value={p.timetable_entry_id}>
        คาบ {p.slot_number} · {p.start_time?.slice(0,5)}-{p.end_time?.slice(0,5)}
      </option>
    ))}
  </select>
)}
      </div>

      <main className="max-w-2xl mx-auto py-4">
        {!selectedSection ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200 mx-4">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-bold">คุณยังไม่มีวิชาที่เปิดสอน ไปที่ "จัดการรายวิชา" เพื่อเปิดวิชาก่อน</p>
            <button onClick={() => router.push("/subjects")}
              className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
              ไปหน้าจัดการรายวิชา
            </button>
          </div>
        ) : loadingPeriods ? (
  <div className="p-10 text-center text-slate-400 font-bold animate-pulse">กำลังตรวจสอบตารางสอน...</div>
) : periods.length === 0 ? (
  <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200 mx-4">
    <p className="text-3xl mb-2">🗓️</p>
    <p className="font-bold text-sm">วิชานี้ไม่มีคาบเรียนตามตารางสอนในวันที่เลือก</p>
    <p className="text-xs mt-1 text-slate-300">เช็กชื่อได้เฉพาะวันที่มีคาบเรียนตรงตามตารางสอนเท่านั้น</p>
  </div>
) : loadingStudents ? (
          <div className="p-10 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดรายชื่อนักเรียน...</div>
        ) : (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mx-4">
    <AttendanceTool
      timetableEntryId={timetableEntryId} date={selectedDate} students={students} currentUserId={currentUserId}
      referenceMap={homeroomMap} referenceLabel="โฮมรูม"
    />
  </div>
)}
      </main>
    </div>
  );
}