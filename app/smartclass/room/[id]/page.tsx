"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Classroom = { id: string; room_name?: string; grade_group?: string };
type Subject = { id: string; subject_code: string; name_th: string };
type SectionRow = {
  id: string;
  subject_id: string;
  classroom_id: string;
  teacher_id: string;
  co_teacher_id?: string | null;
};
type TeacherLite = { id: string; name: string };

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
];

const ROOM_NUMBER_GRADIENTS: Record<string, string> = {
  "1": "from-yellow-400 to-amber-300",
  "2": "from-pink-500 to-rose-400",
  "3": "from-emerald-500 to-green-400",
  "4": "from-red-500 to-rose-600",
  "5": "from-sky-400 to-cyan-300",
  "6": "from-orange-500 to-amber-400",
  "7": "from-blue-700 to-indigo-600",
};
const DEFAULT_GRADIENT = "from-slate-500 to-slate-400";

function getRoomGradient(roomName?: string) {
  const match = (roomName ?? "").match(/\/(\d+)\s*$/);
  const num = match ? match[1] : null;
  return (num && ROOM_NUMBER_GRADIENTS[num]) || DEFAULT_GRADIENT;
}

// รวมชื่อครูจากคอลัมน์ที่เป็นไปได้หลายแบบ เผื่อสคีมาต่างจากที่คาดไว้
function pickTeacherName(row: any): string {
  return (
    row?.full_name ||
    [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() ||
    row?.name ||
    row?.username ||
    "ไม่ระบุชื่อครู"
  );
}

export default function SmartClassRoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = (params?.id as string) ?? "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState("");

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Record<string, TeacherLite>>({});

  useEffect(() => {
    if (!roomId) return;
    (async () => {
      setLoading(true);

      const { data: room } = await supabase
        .from("classrooms")
        .select("id, room_name, grade_group")
        .eq("id", roomId)
        .maybeSingle();

      if (!room) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setClassroom(room as Classroom);

      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("classroom_id", roomId);
      setStudentCount(count ?? 0);

      const { data: secRows } = await supabase
        .from("subject_sections")
        .select("id, subject_id, classroom_id, teacher_id, co_teacher_id")
        .eq("classroom_id", roomId)
        .eq("is_active", true);

      const rows = (secRows ?? []) as SectionRow[];
      setSections(rows);

      const subjectIds = [...new Set(rows.map(r => r.subject_id))];
      if (subjectIds.length > 0) {
        const { data: subs } = await supabase
          .from("subjects")
          .select("id, subject_code, name_th")
          .in("id", subjectIds)
          .order("subject_code");
        setSubjects((subs ?? []) as Subject[]);
      }

      const teacherIds = [
        ...new Set(
          rows.flatMap(r => [r.teacher_id, r.co_teacher_id]).filter(Boolean) as string[]
        ),
      ];
      if (teacherIds.length > 0) {
        const { data: teacherRows } = await supabase
          .from("users")
          .select("*")
          .in("id", teacherIds);
        const map: Record<string, TeacherLite> = {};
        (teacherRows ?? []).forEach((t: any) => {
          map[t.id] = { id: t.id, name: pickTeacherName(t) };
        });
        setTeachers(map);
      }

      setLoading(false);
    })();
  }, [roomId]);

  const subjectCards = useMemo(() => {
    return subjects.map(subject => {
      const section = sections.find(s => s.subject_id === subject.id);
      const teacherNames = [
        section?.teacher_id ? teachers[section.teacher_id]?.name : null,
        section?.co_teacher_id ? teachers[section.co_teacher_id]?.name : null,
      ].filter(Boolean) as string[];
      return { subject, section, teacherNames };
    });
  }, [subjects, sections, teachers]);

  const filteredSubjectCards = useMemo(() => {
    if (!search.trim()) return subjectCards;
    const q = search.trim();
    return subjectCards.filter(
      c => c.subject.name_th.includes(q) || c.subject.subject_code.includes(q)
    );
  }, [subjectCards, search]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-black text-lg animate-pulse">กำลังโหลด Smart Class...</div>
      </div>
    );
  }

  if (notFound || !classroom) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-4xl">🏫</p>
        <p className="font-bold text-slate-500">ไม่พบชั้นเรียนนี้</p>
        <button
          onClick={() => router.push("/smartclass")}
          className="mt-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-black"
        >
          กลับไปหน้า Smart Class
        </button>
      </div>
    );
  }

  const gradient = getRoomGradient(classroom.room_name);
  const roomLabel = `${classroom.grade_group ?? ""} ${classroom.room_name ?? ""}`.trim();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`sticky top-0 z-30 bg-gradient-to-r ${gradient} shadow-md px-4 py-3`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/smartclass")}
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg shrink-0"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white leading-none truncate">🏫 {roomLabel}</h1>
            <p className="text-white/70 text-xs">
              👥 {studentCount} นักเรียน · {filteredSubjectCards.length} วิชา
            </p>
          </div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ค้นหาชื่อ/รหัสวิชา..."
          className="w-full mt-3 bg-white/90 border-2 border-white/40 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:border-white focus:outline-none"
        />
      </div>

      <main className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => router.push(`/smartclass/room/${roomId}/students`)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-black text-slate-600 hover:shadow-md transition-all"
          >
            👥 รายชื่อนักเรียนทั้งหมด
          </button>
        </div>

        {filteredSubjectCards.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-bold">{search ? "ไม่พบวิชาตามที่ค้นหา" : "ยังไม่มีวิชาที่สอนในห้องนี้"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSubjectCards.map(({ subject, teacherNames }, i) => {
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              return (
                <button
                  key={subject.id}
                  onClick={() => router.push(`/smartclass/${subject.id}/${roomId}`)}
                  className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}
                >
                  <p className={`font-black text-base ${accent.text} leading-tight`}>{subject.name_th}</p>
                  <p className="text-slate-400 text-xs font-bold mt-0.5">{subject.subject_code}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {teacherNames.length > 0 ? (
                      teacherNames.map((name, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-600"
                        >
                          👤 {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-400">
                        ไม่ระบุครูผู้สอน
                      </span>
                    )}
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