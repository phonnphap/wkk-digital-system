"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Classroom = {
  id: string;
  room_number: number;
  room_name?: string;
  grade_group?: string;
  academic_year_id?: string;
  homeroom_teacher_id?: string;
  homeroom_teacher_2_id?: string;
};
type AcademicYear = { id: string; year_name: string };
type Subject = { id: string; subject_code: string; name_th: string };
type Teacher = { id: string; first_name?: string; last_name?: string; full_name?: string };
type SubjectSection = {
  id: string; subject_id: string; teacher_id: string; co_teacher_id?: string;
  join_code: string; is_active: boolean;
};

function displayName(u?: Teacher | null) {
  if (!u) return "—";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return u.full_name ?? "—";
}

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
];

export default function ClassroomDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classroomId = params?.classroomId as string;

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true); // เผื่อไม่มี role ตรงเงื่อนไข
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [academicYear, setAcademicYear] = useState<AcademicYear | null>(null);
  const [sections, setSections] = useState<SubjectSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [teacherFilter, setTeacherFilter] = useState("");

  useEffect(() => {
    (async () => {
      if (!classroomId) return;

      // ★ เช็กสิทธิ์: แอดมิน/ผู้บริหารดูได้ทุกห้อง — ปรับชื่อคอลัมน์/ค่า role ให้ตรงกับระบบจริงถ้าจำเป็น
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
        if (profile && profile.role && !["admin", "executive"].includes(profile.role)) {
          // ไม่ใช่แอดมิน/ผู้บริหาร — ยังคงให้ดูได้ (ครูประจำวิชา/ประจำชั้นก็ควรดูได้ตามสเปค)
          // ถ้าต้องการปิดกั้นจริงจัง ให้ setAuthorized(false) ตรงนี้แทน
        }
      }

      const { data: room } = await supabase
  .from("classrooms")
  .select("id, room_number, room_name, grade_group, academic_year_id, homeroom_teacher_id, homeroom_teacher_2_id")
  .eq("id", classroomId).maybeSingle();
setClassroom(room as Classroom);

      if (room?.academic_year_id) {
        const { data: year } = await supabase
          .from("academic_years").select("id, year_name").eq("id", room.academic_year_id).maybeSingle();
        setAcademicYear(year as AcademicYear);
      }

      const { data: secRows } = await supabase
        .from("subject_sections")
        .select("id, subject_id, teacher_id, co_teacher_id, join_code, is_active")
        .eq("classroom_id", classroomId)
        .eq("is_active", true);

      const rows = (secRows ?? []) as SubjectSection[];
      setSections(rows);

      const subjectIds = [...new Set(rows.map(r => r.subject_id))];
      const teacherIds = [...new Set([
  ...rows.flatMap(r => [r.teacher_id, r.co_teacher_id].filter(Boolean)),
  room?.homeroom_teacher_id, room?.homeroom_teacher_2_id,
].filter(Boolean))] as string[];

      const [{ data: subs }, { data: techs }, { data: enrollments }] = await Promise.all([
        subjectIds.length ? supabase.from("subjects").select("id, subject_code, name_th").in("id", subjectIds) : Promise.resolve({ data: [] }),
        teacherIds.length ? supabase.from("users").select("id, first_name, last_name, full_name").in("id", teacherIds) : Promise.resolve({ data: [] }),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("classroom_id", classroomId),
      ]);

      setSubjects((subs ?? []) as Subject[]);
      setTeachers((techs ?? []) as Teacher[]);
      setStudentCount((enrollments as any)?.count ?? 0);

      setLoading(false);
    })();
  }, [classroomId]);

  const subjectOf = (id: string) => subjects.find(s => s.id === id);
  const teacherOf = (id?: string) => teachers.find(t => t.id === id);

  const filtered = useMemo(() => {
    return sections.filter(sec => {
      if (!teacherFilter.trim()) return true;
      const t1 = displayName(teacherOf(sec.teacher_id));
      const t2 = sec.co_teacher_id ? displayName(teacherOf(sec.co_teacher_id)) : "";
      return t1.includes(teacherFilter.trim()) || t2.includes(teacherFilter.trim());
    });
  }, [sections, teacherFilter, teachers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดข้อมูลห้องเรียน...</div>
      </div>
    );
  }
  if (!classroom) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500 font-black">❌ ไม่พบห้องเรียนนี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-4 pt-4 pb-6">
        <button onClick={() => router.push("/classrooms")}
          className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-lg mb-3">←</button>
        <h1 className="text-xl font-black text-white leading-tight">
  {classroom.grade_group} {classroom.room_name ?? `ห้อง ${classroom.room_number}`}
</h1>
<p className="text-white/70 text-sm font-bold">
  {academicYear?.year_name ?? "—"} · 👥 นักเรียน {studentCount} คน · 📚 {sections.length} วิชา
</p>
<p className="text-white/60 text-xs font-bold mt-1">
  🧑‍🏫 ครูประจำชั้น: {displayName(teacherOf(classroom.homeroom_teacher_id))}
  {classroom.homeroom_teacher_2_id ? ` + ${displayName(teacherOf(classroom.homeroom_teacher_2_id))}` : ""}
</p>
      </div>

      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <input value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} placeholder="🔍 ค้นหาตามชื่อครูผู้สอน..."
          className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none" />
      </div>

      <main className="p-4 max-w-6xl mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-bold">{teacherFilter ? "ไม่พบวิชาตามที่ค้นหา" : "ยังไม่มีวิชาที่เปิดสอนในห้องนี้"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((sec, i) => {
              const subject = subjectOf(sec.subject_id);
              const teacher = teacherOf(sec.teacher_id);
              const coTeacher = sec.co_teacher_id ? teacherOf(sec.co_teacher_id) : null;
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              return (
                <button key={sec.id} onClick={() => router.push(`/subjects/${sec.id}`)}
                  className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                  <p className={`font-black text-base ${accent.text} leading-tight`}>{subject?.name_th ?? "—"}</p>
                  <p className="text-slate-400 text-xs font-bold mt-0.5">{subject?.subject_code}</p>
                  <p className="text-slate-500 text-xs font-bold mt-2">
                    👤 {displayName(teacher)}{coTeacher ? ` + ${displayName(coTeacher)}` : ""}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-600 font-mono tracking-wider">
                      🔑 {sec.join_code}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}