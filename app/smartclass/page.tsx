"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type SectionRow = { id: string; subject_id: string; classroom_id: string; teacher_id: string; co_teacher_id?: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
];

/* ---------- ตัวจำแนกสายชั้น ---------- */
type LevelKey = "kindergarten" | "primary" | "lower_secondary" | "upper_secondary" | "other";
const LEVELS: { key: LevelKey; label: string; order: number }[] = [
  { key: "kindergarten", label: "อนุบาล", order: 0 },
  { key: "primary", label: "ประถม", order: 1 },
  { key: "lower_secondary", label: "มัธยมต้น", order: 2 },
  { key: "upper_secondary", label: "มัธยมปลาย", order: 3 },
  { key: "other", label: "อื่นๆ", order: 99 },
];

function getLevel(gradeGroup?: string): { key: LevelKey; label: string; order: number } {
  const g = (gradeGroup ?? "").trim();
  if (!g) return LEVELS.find(l => l.key === "other")!;
  if (g.startsWith("อ")) return LEVELS.find(l => l.key === "kindergarten")!;
  if (g.startsWith("ป")) return LEVELS.find(l => l.key === "primary")!;
  if (g.startsWith("ม")) {
    const num = parseInt(g.match(/(\d+)/)?.[1] ?? "0", 10);
    return LEVELS.find(l => l.key === (num >= 4 ? "upper_secondary" : "lower_secondary"))!;
  }
  return LEVELS.find(l => l.key === "other")!;
}

/* ================= หน้าเพจหลัก ================= */

export default function SmartClassSubjectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");

  // ---- ข้อมูลสำหรับครู (มุมมองเดิม: รายวิชา) ----
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // ---- ข้อมูลสำหรับแอดมิน/ผู้บริหาร (มุมมองใหม่: ชั้นเรียน) ----
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [levelFilter, setLevelFilter] = useState<LevelKey | "all">("all");

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
      if (!profile) { setLoading(false); return; }

      const admin = !!profile.role && ["admin", "executive"].includes(profile.role);
      setIsAdmin(admin);

      if (admin) {
        // แอดมิน/ผู้บริหาร: เห็นชั้นเรียนทั้งหมด
        const { data: rooms } = await supabase
          .from("classrooms").select("id, room_name, grade_group");
        setClassrooms((rooms ?? []) as Classroom[]);
      } else {
        // ครูรายวิชา: เห็นเฉพาะวิชาที่ตัวเองสอน (มุมมองเดิม)
        const { data: secRows } = await supabase
          .from("subject_sections")
          .select("id, subject_id, classroom_id, teacher_id, co_teacher_id")
          .eq("is_active", true)
          .or(`teacher_id.eq.${profile.id},co_teacher_id.eq.${profile.id}`);

        const rows = (secRows ?? []) as SectionRow[];
        setSections(rows);

        const subjectIds = [...new Set(rows.map(r => r.subject_id))];
        if (subjectIds.length > 0) {
          const { data: subs } = await supabase
            .from("subjects").select("id, subject_code, name_th").in("id", subjectIds).order("subject_code");
          setSubjects((subs ?? []) as Subject[]);
        }
      }

      setLoading(false);
    })();
  }, []);

  /* ----- มุมมองครู: จัดกลุ่มวิชา ----- */
  const groupedSubjects = useMemo(() => {
    const map = new Map<string, { subject: Subject; roomCount: number }>();
    subjects.forEach(s => {
      const roomCount = new Set(sections.filter(sec => sec.subject_id === s.id).map(sec => sec.classroom_id)).size;
      map.set(s.id, { subject: s, roomCount });
    });
    return Array.from(map.values());
  }, [subjects, sections]);

  const filteredSubjects = useMemo(() => {
    if (!search.trim()) return groupedSubjects;
    const q = search.trim();
    return groupedSubjects.filter(g => g.subject.name_th.includes(q) || g.subject.subject_code.includes(q));
  }, [groupedSubjects, search]);

  /* ----- มุมมองแอดมิน: จัดกลุ่มชั้นเรียนตามสายชั้น ----- */
  const classroomsWithLevel = useMemo(() => {
    return classrooms.map(c => ({ classroom: c, level: getLevel(c.grade_group) }));
  }, [classrooms]);

  const filteredClassrooms = useMemo(() => {
    let list = classroomsWithLevel;
    if (levelFilter !== "all") list = list.filter(c => c.level.key === levelFilter);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(c => (c.classroom.room_name ?? "").includes(q) || (c.classroom.grade_group ?? "").includes(q));
    }
    return list;
  }, [classroomsWithLevel, levelFilter, search]);

  const classroomsByLevel = useMemo(() => {
    const groups = new Map<LevelKey, typeof filteredClassrooms>();
    filteredClassrooms.forEach(c => {
      const arr = groups.get(c.level.key) ?? [];
      arr.push(c);
      groups.set(c.level.key, arr);
    });
    // เรียงภายในแต่ละสายชั้นตามชื่อห้อง/สายชั้น
    groups.forEach(arr => arr.sort((a, b) =>
      `${a.classroom.grade_group ?? ""} ${a.classroom.room_name ?? ""}`.localeCompare(
        `${b.classroom.grade_group ?? ""} ${b.classroom.room_name ?? ""}`, "th", { numeric: true }
      )
    ));
    return LEVELS
      .filter(l => groups.has(l.key))
      .map(l => ({ level: l, items: groups.get(l.key)! }));
  }, [filteredClassrooms]);

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
            <h1 className="text-base font-black text-slate-800 leading-none">📚 Smart Class</h1>
            <p className="text-slate-400 text-xs">
              {isAdmin
                ? `แสดงทุกชั้นเรียน (สิทธิ์แอดมิน/ผู้บริหาร) · ${filteredClassrooms.length} ห้อง`
                : `วิชาที่คุณสอน · ${filteredSubjects.length} วิชา`}
            </p>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={isAdmin ? "🔍 ค้นหาชื่อห้อง/สายชั้น..." : "🔍 ค้นหาชื่อ/รหัสวิชา..."}
          className="w-full mt-3 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none" />

        {isAdmin && (
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
            <button onClick={() => setLevelFilter("all")}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-black ${
                levelFilter === "all" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
              }`}>ทั้งหมด</button>
            {LEVELS.filter(l => l.key !== "other").map(l => (
              <button key={l.key} onClick={() => setLevelFilter(l.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-black ${
                  levelFilter === l.key ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                }`}>{l.label}</button>
            ))}
          </div>
        )}
      </div>

      <main className="p-4 max-w-5xl mx-auto">
        {isAdmin ? (
          filteredClassrooms.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
              <p className="text-4xl mb-3">🏫</p>
              <p className="font-bold">{search ? "ไม่พบห้องเรียนตามที่ค้นหา" : "ยังไม่มีข้อมูลชั้นเรียน"}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {classroomsByLevel.map(({ level, items }) => (
                <div key={level.key}>
                  {levelFilter === "all" && (
                    <h2 className="text-sm font-black text-slate-500 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-4 rounded-full bg-emerald-400 inline-block" />
                      {level.label}
                      <span className="text-slate-300 font-bold">({items.length})</span>
                    </h2>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map(({ classroom }, i) => {
                      const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                      return (
                        <button key={classroom.id} onClick={() => router.push(`/smartclass/room/${classroom.id}`)}
                          className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                          <p className={`font-black text-lg ${accent.text} leading-tight`}>
                            {classroom.grade_group} {classroom.room_name}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredSubjects.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-bold">{search ? "ไม่พบวิชาตามที่ค้นหา" : "คุณยังไม่มีวิชาที่สอน"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSubjects.map((g, i) => {
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              return (
                <button key={g.subject.id} onClick={() => router.push(`/smartclass/${g.subject.id}`)}
                  className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                  <p className={`font-black text-base ${accent.text} leading-tight`}>{g.subject.name_th}</p>
                  <p className="text-slate-400 text-xs font-bold mt-0.5">{g.subject.subject_code}</p>
                  <div className="mt-3">
                    <span className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-600">
                      🏫 {g.roomCount} ห้อง
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