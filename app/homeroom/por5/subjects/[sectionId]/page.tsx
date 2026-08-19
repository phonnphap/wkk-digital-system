"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AttendanceOverviewTool from "@/components/attendance/AttendanceOverviewTool";
import GradeOverviewTool from "@/components/attendance/GradeOverviewTool";
import InsightsTool from "@/components/insights/InsightsTool";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string; homeroom_teacher_id?: string };
type SectionRow = { id: string; classroom_id: string; teacher_id: string; join_code: string; subject_id: string; academic_year_id?: string };
type Student = { id: string; prefix?: string; first_name: string; last_name: string; nick_name?: string; seat_number: number; avatar_url?: string };

type ViewTab = "attendance" | "grades" | "insights";

export default function Por5SectionPage() {
  const router = useRouter();
  const params = useParams();
  const sectionId = params?.sectionId as string;

  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [section, setSection] = useState<SectionRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [tab, setTab] = useState<ViewTab>("attendance");
  const [academicYearLabel, setAcademicYearLabel] = useState("");
  const [homeroomTeacherName, setHomeroomTeacherName] = useState("");
  const [subjectTeacherName, setSubjectTeacherName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
        if (profile) setCurrentUserId(profile.id);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!sectionId) return;
      const { data: sec } = await supabase
        .from("subject_sections")
        .select("id, classroom_id, teacher_id, join_code, subject_id, academic_year_id")
        .eq("id", sectionId).maybeSingle();
      setSection(sec as SectionRow);

      if (sec) {
        const [{ data: subj }, { data: room }] = await Promise.all([
          supabase.from("subjects").select("id, subject_code, name_th").eq("id", sec.subject_id).maybeSingle(),
          supabase.from("classrooms").select("id, room_name, grade_group, homeroom_teacher_id").eq("id", sec.classroom_id).maybeSingle(),
        ]);
        setSubject(subj as Subject);
        setClassroom(room as Classroom);

        if (room?.homeroom_teacher_id) {
          const { data: t } = await supabase.from("users").select("full_name, first_name, last_name").eq("id", room.homeroom_teacher_id).maybeSingle();
          if (t) setHomeroomTeacherName(t.full_name || `${t.first_name} ${t.last_name}`);
        }
        if (sec.teacher_id) {
          const { data: t } = await supabase.from("users").select("full_name, first_name, last_name").eq("id", sec.teacher_id).maybeSingle();
          if (t) setSubjectTeacherName(t.full_name || `${t.first_name} ${t.last_name}`);
        }
        if (sec.academic_year_id) {
          const { data: year } = await supabase.from("academic_years").select("year_name, semester").eq("id", sec.academic_year_id).maybeSingle();
          if (year) setAcademicYearLabel(`${year.year_name} ภาคเรียนที่ ${year.semester}`);
        }

        const { data: studentsData } = await supabase
          .from("students")
          .select("id, prefix, first_name, last_name, nick_name, seat_number, avatar_url")
          .eq("classroom_id", sec.classroom_id)
          .order("seat_number");
        setStudents((studentsData ?? []) as Student[]);
      }
      setLoading(false);
    })();
  }, [sectionId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 font-bold">กำลังโหลดข้อมูล...</div>;
  if (!section || !subject) return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold">❌ ไม่พบข้อมูลวิชานี้</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-4 pt-4 pb-6">
        <div className="flex items-center gap-2 mb-3 print:hidden">
          <button onClick={() => router.push("/homeroom/por5/subjects")} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">←</button>
        </div>
        <div className="text-center px-2">
          <h1 className="text-xl font-black text-white">{subject.name_th}</h1>
          <p className="text-white/80 text-sm font-bold">{subject.subject_code} · {classroom?.grade_group} {classroom?.room_name} · 👥 {students.length} คน</p>
          <p className="text-white/60 text-xs mt-1">📄 ปพ.5 — มุมมองดูอย่างเดียว แก้ไขคะแนนไม่ได้</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-4 flex items-center gap-2 flex-wrap print:hidden">
        <button onClick={() => setTab("attendance")}
          className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "attendance" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
          🗓️ ข้อมูลเช็กชื่อ
        </button>
        <button onClick={() => setTab("grades")}
          className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "grades" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
          ⭐ คะแนนรวม
        </button>
        <button onClick={() => setTab("insights")}
          className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "insights" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
          📊 ข้อมูลเชิงลึก
        </button>
      </div>

      <main className="max-w-6xl mx-auto p-4">
        {tab === "attendance" && (
          <AttendanceOverviewTool
            sectionId={section.id}
            subjectTitle={subject.name_th}
            subjectCode={subject.subject_code}
            academicYearLabel={academicYearLabel}
            students={students}
            readOnly
          />
        )}
        {tab === "grades" && (
          <GradeOverviewTool
            sectionId={section.id}
            subjectTitle={subject.name_th}
            subjectCode={subject.subject_code}
            academicYearLabel={academicYearLabel}
            classroomLabel={`${classroom?.grade_group ?? ""} ${classroom?.room_name ?? ""}`}
            homeroomTeacherName={homeroomTeacherName}
            subjectTeacherName={subjectTeacherName}
            students={students}
            currentUserId={currentUserId}
            readOnly
          />
        )}
        {tab === "insights" && classroom && (
          <InsightsTool
            currentUserId={currentUserId}
            subjectId={subject.id}
            classroomId={classroom.id}
          />
        )}
      </main>
    </div>
  );
}