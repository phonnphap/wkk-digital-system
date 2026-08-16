"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AttendanceOverviewTool from "@/components/attendance/AttendanceOverviewTool";
import GradeOverviewTool from "@/components/attendance/GradeOverviewTool";
import InsightsTool from "@/components/insights/InsightsTool";

const supabase = createClient();

type Classroom = { id: string; room_name?: string; grade_group?: string };
type Subject = { id: string; subject_code: string; name_th: string };
type SectionRow = {
  id: string; subject_id: string; classroom_id: string;
  teacher_id: string; co_teacher_id?: string | null;
  academic_year?: number | string | null; semester?: number | string | null; term?: number | string | null;
};
type TeacherLite = { id: string; name: string };

const SUBJECT_GRADIENTS = [
  "from-sky-500 to-blue-400", "from-pink-500 to-rose-400", "from-emerald-500 to-teal-400",
  "from-orange-500 to-amber-400", "from-purple-500 to-fuchsia-400", "from-cyan-500 to-sky-400",
];
const ROOM_NUMBER_GRADIENTS: Record<string, string> = {
  "1": "from-yellow-400 to-amber-300", "2": "from-pink-500 to-rose-400", "3": "from-emerald-500 to-green-400",
  "4": "from-red-500 to-rose-600", "5": "from-sky-400 to-cyan-300", "6": "from-orange-500 to-amber-400",
  "7": "from-blue-700 to-indigo-600",
};
const DEFAULT_GRADIENT = "from-slate-500 to-slate-400";

function getRoomGradient(roomName?: string) {
  const match = (roomName ?? "").match(/\/(\d+)\s*$/);
  const num = match ? match[1] : null;
  return (num && ROOM_NUMBER_GRADIENTS[num]) || DEFAULT_GRADIENT;
}
function isPrePrimaryLevel(gradeGroup?: string) {
  const g = (gradeGroup ?? "").trim();
  return g.startsWith("อ") || g.startsWith("ป");
}
function getCurrentAcademicPeriod(): { year: number; semester: number } {
  const now = new Date();
  const month = now.getMonth();
  const semester = month >= 4 && month <= 9 ? 1 : 2;
  let year = now.getFullYear();
  if (semester === 2 && month <= 3) year -= 1;
  return { year, semester };
}
function pickTeacherName(row: any): string {
  return (
    row?.full_name || [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() ||
    row?.name || row?.username || "ไม่ระบุชื่อครู"
  );
}

// เมนูข้อมูลระดับห้องเรียน — เฉพาะแอดมิน/ผู้บริหาร (view/print เท่านั้น แก้ไขไม่ได้)
type RoomMenuKey = "attendanceInfo" | "totalScore" | "insights";
const ROOM_ADMIN_MENU: { key: RoomMenuKey; label: string; icon: string }[] = [
  { key: "attendanceInfo", label: "ข้อมูลเช็กชื่อ", icon: "🗓️" },
  { key: "totalScore", label: "คะแนนรวม", icon: "⭐" },
  { key: "insights", label: "ข้อมูลเชิงลึก", icon: "📊" },
];

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

  // --- สิทธิ์แอดมิน/ผู้บริหาร: ดู/ปริ้นท์ได้ แก้ไขไม่ได้ ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  // --- เมนูข้อมูลระดับห้อง (เฉพาะแอดมิน) ---
  const [roomMenu, setRoomMenu] = useState<RoomMenuKey | null>(null);
  const [menuSubjectId, setMenuSubjectId] = useState<string>(""); // สำหรับแท็บที่ต้องเลือกวิชา (เช็กชื่อ/คะแนนรวม)
  const [students, setStudents] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
        if (profile) {
          setCurrentUserId(profile.id);
          setIsAdmin(!!profile.role && ["admin", "executive"].includes(profile.role));
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!roomId) return;
    (async () => {
      setLoading(true);

      const { data: room } = await supabase
        .from("classrooms").select("id, room_name, grade_group").eq("id", roomId).maybeSingle();

      if (!room) { setNotFound(true); setLoading(false); return; }
      setClassroom(room as Classroom);

      const { count } = await supabase
        .from("students").select("id", { count: "exact", head: true }).eq("classroom_id", roomId);
      setStudentCount(count ?? 0);

      const { data: studentsData } = await supabase
        .from("students")
        .select("id, prefix, first_name, last_name, nick_name, seat_number, avatar_url")
        .eq("classroom_id", roomId)
        .order("seat_number");
      setStudents((studentsData ?? []) as any[]);

      const { data: secRows } = await supabase
        .from("subject_sections").select("*").eq("classroom_id", roomId).eq("is_active", true);
      const rows = (secRows ?? []) as SectionRow[];
      setSections(rows);

      const subjectIds = [...new Set(rows.map(r => r.subject_id))];
      if (subjectIds.length > 0) {
        const { data: subs } = await supabase
          .from("subjects").select("id, subject_code, name_th").in("id", subjectIds).order("subject_code");
        setSubjects((subs ?? []) as Subject[]);
        setMenuSubjectId(prev => prev || (subs ?? [])[0]?.id || "");
      }

      const teacherIds = [...new Set(rows.flatMap(r => [r.teacher_id, r.co_teacher_id]).filter(Boolean) as string[])];
      if (teacherIds.length > 0) {
        const { data: teacherRows } = await supabase.from("users").select("*").in("id", teacherIds);
        const map: Record<string, TeacherLite> = {};
        (teacherRows ?? []).forEach((t: any) => { map[t.id] = { id: t.id, name: pickTeacherName(t) }; });
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
    return subjectCards.filter(c => c.subject.name_th.includes(q) || c.subject.subject_code.includes(q));
  }, [subjectCards, search]);

  const menuSection = sections.find(s => s.subject_id === menuSubjectId);
  const menuSubject = subjects.find(s => s.id === menuSubjectId);

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
        <button onClick={() => router.push("/smartclass")} className="mt-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-black">
          กลับไปหน้า Smart Class
        </button>
      </div>
    );
  }

  const gradient = getRoomGradient(classroom.room_name);
  const roomLabel = `${classroom.grade_group ?? ""} ${classroom.room_name ?? ""}`.trim();
  const prePrimary = isPrePrimaryLevel(classroom.grade_group);
  const defaultPeriod = getCurrentAcademicPeriod();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`sticky top-0 z-30 bg-gradient-to-r ${gradient} shadow-md px-4 py-3`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/smartclass")}
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white leading-none truncate">🏫 {roomLabel}</h1>
            <p className="text-white/70 text-xs">
              👥 {studentCount} นักเรียน · {filteredSubjectCards.length} วิชา{isAdmin ? " · มุมมองแอดมิน (ดูอย่างเดียว)" : ""}
            </p>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ค้นหาชื่อ/รหัสวิชา..."
          className="w-full mt-3 bg-white/90 border-2 border-white/40 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:border-white focus:outline-none" />

        {isAdmin && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {ROOM_ADMIN_MENU.map(m => (
              <button key={m.key}
                onClick={() => setRoomMenu(prev => (prev === m.key ? null : m.key))}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs backdrop-blur-sm transition-colors ${
                  roomMenu === m.key ? "bg-white text-purple-700 shadow-sm" : "bg-white/20 hover:bg-white/30 text-white"
                }`}>
                <span>{m.icon}</span>{m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="p-4 w-full">
        {/* เมนูข้อมูลระดับห้อง (เฉพาะแอดมิน) */}
        {isAdmin && roomMenu === "insights" && (
          <div className="mb-6">
            <InsightsTool currentUserId={currentUserId} isAdmin={isAdmin} defaultScope="school" />
          </div>
        )}

        {isAdmin && (roomMenu === "attendanceInfo" || roomMenu === "totalScore") && (
          <div className="mb-6 space-y-3">
            {subjects.length > 1 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-400">เลือกวิชา:</span>
                {subjects.map(s => (
                  <button key={s.id} onClick={() => setMenuSubjectId(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                      menuSubjectId === s.id ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-500"
                    }`}>
                    {s.name_th}
                  </button>
                ))}
              </div>
            )}
            {!menuSection ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 font-bold text-sm">
                ไม่พบข้อมูล section ของวิชานี้
              </div>
            ) : roomMenu === "attendanceInfo" ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
                <AttendanceOverviewTool
                  sectionId={menuSection.id}
                  subjectTitle={menuSubject?.name_th ?? ""}
                  subjectCode={menuSubject?.subject_code ?? ""}
                  students={students}
                  readOnly
                />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
                <GradeOverviewTool
                  sectionId={menuSection.id}
                  subjectTitle={menuSubject?.name_th ?? ""}
                  subjectCode={menuSubject?.subject_code ?? ""}
                  classroomLabel={roomLabel}
                  students={students}
                  currentUserId={currentUserId}
                  readOnly
                />
              </div>
            )}
          </div>
        )}

        {/* รายการวิชาในห้อง (มุมมองเดิม) — ซ่อนเมื่อกำลังเปิดเมนูแอดมินอยู่ เพื่อไม่ให้หน้ายาวเกิน */}
        {!roomMenu && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => router.push(`/smartclass/room/${roomId}/students`)}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-black text-slate-600 hover:shadow-md transition-all"
              >
                📚 รายวิชาทั้งหมด
              </button>
            </div>

            {filteredSubjectCards.length === 0 ? (
              <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
                <p className="text-4xl mb-3">📚</p>
                <p className="font-bold">{search ? "ไม่พบวิชาตามที่ค้นหา" : "ยังไม่มีวิชาที่สอนในห้องนี้"}</p>
              </div>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                {filteredSubjectCards.map(({ subject, section, teacherNames }, i) => {
                  const cardGradient = SUBJECT_GRADIENTS[i % SUBJECT_GRADIENTS.length];
                  const year = section?.academic_year ?? defaultPeriod.year;
                  const semester = section?.semester ?? section?.term ?? defaultPeriod.semester;
                  const periodText = prePrimary ? `${year}` : `${semester}/${year}`;

                  return (
                    <div key={subject.id} role="button" tabIndex={0}
                      onClick={() => router.push(`/smartclass/${subject.id}/${roomId}`)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") router.push(`/smartclass/${subject.id}/${roomId}`); }}
                      className="text-left rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden cursor-pointer">
                      <div className={`h-14 bg-gradient-to-r ${cardGradient} px-4 flex items-center justify-between`}>
                        <span className="text-[10px] font-black bg-white/95 text-slate-700 px-2.5 py-1 rounded-full tracking-wide shadow-sm">SUBJECT</span>
                        <span className="text-white/60 text-lg leading-none">⠿</span>
                      </div>
                      <div className="p-4">
                        <p className="font-black text-base text-slate-800 leading-tight truncate">{subject.name_th}</p>
                        <p className="text-slate-400 text-xs font-bold mt-1">{subject.subject_code} · ปีการศึกษา {periodText}</p>
                        <div className="mt-3 space-y-1.5">
                          {teacherNames.length > 0 ? (
                            teacherNames.map((name, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="w-6 h-6 shrink-0 rounded-full bg-slate-400 text-white text-[10px] font-black flex items-center justify-center">
                                  {name.trim().charAt(0) || "?"}
                                </span>
                                <span className="text-slate-600 text-xs font-bold truncate">{name}</span>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 shrink-0 rounded-full bg-slate-200 text-slate-400 text-[10px] font-black flex items-center justify-center">?</span>
                              <span className="text-slate-400 text-xs font-bold">ไม่ระบุครูผู้สอน</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}