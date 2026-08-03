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
  { bg: "bg-gradient-to-br from-blue-50/80 to-indigo-50/30", border: "border-blue-200/80 hover:border-blue-400", text: "text-blue-900", badge: "bg-blue-100/80 text-blue-700" },
  { bg: "bg-gradient-to-br from-pink-50/80 to-rose-50/30", border: "border-pink-200/80 hover:border-pink-400", text: "text-pink-900", badge: "bg-pink-100/80 text-pink-700" },
  { bg: "bg-gradient-to-br from-emerald-50/80 to-teal-50/30", border: "border-emerald-200/80 hover:border-emerald-400", text: "text-emerald-900", badge: "bg-emerald-100/80 text-emerald-700" },
  { bg: "bg-gradient-to-br from-amber-50/80 to-orange-50/30", border: "border-orange-200/80 hover:border-orange-400", text: "text-orange-900", badge: "bg-orange-100/80 text-orange-700" },
  { bg: "bg-gradient-to-br from-purple-50/80 to-fuchsia-50/30", border: "border-purple-200/80 hover:border-purple-400", text: "text-purple-900", badge: "bg-purple-100/80 text-purple-700" },
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

  // อนุบาล
  if (g.startsWith("อ")) return LEVELS.find(l => l.key === "kindergarten")!;

  // ประถม
  if (g.startsWith("ป")) return LEVELS.find(l => l.key === "primary")!;

  // มัธยม
  if (g.startsWith("ม")) {
    // 1. เช็กคีย์เวิร์ด ม.ปลาย / มัธยมปลาย ก่อน
    if (g.includes("ปลาย")) {
      return LEVELS.find(l => l.key === "upper_secondary")!;
    }

    // 2. หาตัวเลขทั้งหมดในข้อความ
    const numbers = g.match(/\d+/g)?.map(n => parseInt(n, 10)) ?? [];

    if (numbers.length > 0) {
      // ถ้าตัวเลข *ทั้งหมด* หรือตัวเลข *สูงสุด* อยู่ในช่วง 4-6 ให้ถือว่าเป็น ม.ปลาย
      const maxNum = Math.max(...numbers);
      const minNum = Math.min(...numbers);

      // ถ้าเป็น ม.4-6 (หรือเริ่มต้นที่ ม.4 ขึ้นไป)
      if (minNum >= 4 || maxNum >= 4) {
        return LEVELS.find(l => l.key === "upper_secondary")!;
      }
    }

    // Default สำหรับ ม.ต้น
    return LEVELS.find(l => l.key === "lower_secondary")!;
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
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-2xl animate-bounce">
          📚
        </div>
        <div className="text-emerald-600 font-bold text-sm tracking-wide animate-pulse">
          กำลังโหลด Smart Class...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Header Bar */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-4 py-3 sm:px-6 transition-all">
        <div className="max-w-5xl mx-auto space-y-3">
          <div className="flex items-center gap-3.5">
            <button 
              onClick={() => router.push("/dashboard")}
              className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200/80 active:scale-95 flex items-center justify-center text-slate-700 text-lg transition-all shrink-0 shadow-xs"
              title="กลับหน้าหลัก"
            >
              🏠
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">Smart Class</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/50">
                  v2.0
                </span>
              </div>
              <p className="text-slate-500 text-xs font-medium mt-1 truncate">
                {isAdmin
                  ? `แสดงทุกชั้นเรียน (สิทธิ์แอดมิน/ผู้บริหาร) · ทั้งหมด ${filteredClassrooms.length} ห้อง`
                  : `วิชาที่คุณสอน · ทั้งหมด ${filteredSubjects.length} วิชา`}
              </p>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
              🔍
            </span>
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              placeholder={isAdmin ? "ค้นหาชื่อห้องเรียน หรือสายชั้น..." : "ค้นหาชื่อวิชา หรือรหัสวิชา..."}
              className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-slate-200/80 rounded-2xl pl-10 pr-4 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs" 
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Admin Level Filters */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
              <button 
                onClick={() => setLevelFilter("all")}
                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  levelFilter === "all" 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                ทั้งหมด
              </button>
              {LEVELS.filter(l => l.key !== "other").map(l => (
                <button 
                  key={l.key} 
                  onClick={() => setLevelFilter(l.key)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                    levelFilter === l.key 
                      ? "bg-emerald-600 text-white shadow-xs" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        {isAdmin ? (
          filteredClassrooms.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
                🏫
              </div>
              <h3 className="font-bold text-slate-800 text-base">ไม่พบข้อมูลชั้นเรียน</h3>
              <p className="text-slate-400 text-xs mt-1">
                {search ? "ลองค้นหาด้วยคำอื่น หรือล้างตัวกรองออก" : "ยังไม่มีข้อมูลชั้นเรียนในระบบ"}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {classroomsByLevel.map(({ level, items }) => (
                <div key={level.key} className="space-y-3">
                  {levelFilter === "all" && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-5 rounded-full bg-emerald-500 inline-block" />
                      <h2 className="text-sm font-black text-slate-700 tracking-tight">
                        {level.label}
                      </h2>
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {items.length}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                    {items.map(({ classroom }, i) => {
                      const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                      return (
                        <button 
                          key={classroom.id} 
                          onClick={() => router.push(`/smartclass/room/${classroom.id}`)}
                          className={`group text-left rounded-2xl border ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-1 active:translate-y-0 transition-all duration-200 relative overflow-hidden`}
                        >
                          <div className="flex flex-col justify-between h-full min-h-[72px]">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400/80">
                              Classroom
                            </span>
                            <p className={`font-black text-lg ${accent.text} leading-tight tracking-tight mt-1 group-hover:scale-[1.02] transition-transform origin-left`}>
                              {classroom.grade_group} {classroom.room_name}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredSubjects.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
              📚
            </div>
            <h3 className="font-bold text-slate-800 text-base">ไม่พบวิชาที่ค้นหา</h3>
            <p className="text-slate-400 text-xs mt-1">
              {search ? "ตรวจสอบรหัสวิชาหรือชื่อวิชาอีกครั้ง" : "คุณยังไม่มีรายวิชาที่รับผิดชอบในขณะนี้"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubjects.map((g, i) => {
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              return (
                <button 
                  key={g.subject.id} 
                  onClick={() => router.push(`/smartclass/${g.subject.id}`)}
                  className={`group text-left rounded-2xl border ${accent.border} ${accent.bg} p-5 hover:shadow-lg hover:-translate-y-1 active:translate-y-0 transition-all duration-200 flex flex-col justify-between relative overflow-hidden`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-extrabold text-slate-500 bg-white/80 backdrop-blur-xs px-2.5 py-0.5 rounded-md border border-slate-200/50 shadow-2xs">
                        {g.subject.subject_code}
                      </span>
                    </div>
                    <p className={`font-black text-base ${accent.text} leading-snug tracking-tight group-hover:text-emerald-700 transition-colors`}>
                      {g.subject.name_th}
                    </p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-200/40 flex items-center justify-between">
                    <span className={`text-[11px] font-bold ${accent.badge} px-2.5 py-1 rounded-xl flex items-center gap-1.5`}>
                      <span>🏫</span> {g.roomCount} ห้องเรียน
                    </span>
                    <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">
                      ➔
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