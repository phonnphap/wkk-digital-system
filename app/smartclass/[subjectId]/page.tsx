"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };
type SectionRow = { id: string; classroom_id: string; teacher_id: string; co_teacher_id?: string; join_code: string };

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
];

export default function SmartClassRoomsPage() {
  const router = useRouter();
  const params = useParams();
  const subjectId = params?.subjectId as string;

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      if (!subjectId) return;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
      if (!profile) { setLoading(false); return; }

      const admin = !!profile.role && ["admin", "executive"].includes(profile.role);
      setIsAdmin(admin);

      const { data: subj } = await supabase
        .from("subjects").select("id, subject_code, name_th").eq("id", subjectId).maybeSingle();
      setSubject(subj as Subject);

      let query = supabase
        .from("subject_sections")
        .select("id, classroom_id, teacher_id, co_teacher_id, join_code")
        .eq("subject_id", subjectId)
        .eq("is_active", true);

      if (!admin) {
        query = query.or(`teacher_id.eq.${profile.id},co_teacher_id.eq.${profile.id}`);
      }

      const { data: secRows } = await query;
      const rows = (secRows ?? []) as SectionRow[];
      setSections(rows);

      const classroomIds = [...new Set(rows.map(r => r.classroom_id))];
      if (classroomIds.length > 0) {
        const { data: rooms } = await supabase
          .from("classrooms").select("id, room_name, grade_group").in("id", classroomIds);
        setClassrooms((rooms ?? []) as Classroom[]);

        const { data: studentsData } = await supabase
          .from("students").select("id,first_name,last_name,seat_number,avatar_url")
        const counts: Record<string, number> = {};
        (studentsData ?? []).forEach((s: any) => { counts[s.classroom_id] = (counts[s.classroom_id] ?? 0) + 1; });
        setStudentCounts(counts);
      }

      setLoading(false);
    })();
  }, [subjectId]);

  const classroomOf = (id: string) => classrooms.find(c => c.id === id);

  const sortedSections = [...sections].sort((a, b) => {
    const ra = classroomOf(a.classroom_id);
    const rb = classroomOf(b.classroom_id);
    return `${ra?.grade_group ?? ""} ${ra?.room_name ?? ""}`.localeCompare(
      `${rb?.grade_group ?? ""} ${rb?.room_name ?? ""}`, "th", { numeric: true }
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-black text-lg animate-pulse">กำลังโหลดข้อมูล...</div>
      </div>
    );
  }
  if (!subject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500 font-black">❌ ไม่พบวิชานี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-4 pt-4 pb-6">
        <button onClick={() => router.push("/smartclass")}
          className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-lg mb-3">←</button>
        <h1 className="text-xl font-black text-white leading-tight">{subject.name_th}</h1>
        <p className="text-white/70 text-sm font-bold">{subject.subject_code} · {sections.length} ห้อง{isAdmin ? " (มุมมองแอดมิน)" : ""}</p>
      </div>

      <main className="p-4 max-w-5xl mx-auto">
        {sortedSections.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">🏫</p>
            <p className="font-bold">ไม่พบห้องที่สอนวิชานี้</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sortedSections.map((sec, i) => {
              const room = classroomOf(sec.classroom_id);
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              const count = studentCounts[sec.classroom_id] ?? 0;
              return (
                <button key={sec.id} onClick={() => router.push(`/smartclass/${subjectId}/${sec.id}`)}
                  className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                  <p className={`font-black text-lg ${accent.text}`}>{room?.grade_group} {room?.room_name}</p>
                  <div className="mt-3">
                    <span className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-600">
                      👥 {count} คน
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