"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type SectionRow = { id: string; subject_id: string; classroom_id: string; teacher_id: string; co_teacher_id?: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };

const SUBJECT_GRADIENTS = [
  "from-sky-500 to-blue-400",
  "from-pink-500 to-rose-400",
  "from-emerald-500 to-teal-400",
  "from-orange-500 to-amber-400",
  "from-purple-500 to-fuchsia-400",
  "from-cyan-500 to-sky-400",
];
const ROOM_NUMBER_GRADIENTS: Record<string, string> = {
  "1": "from-yellow-400 to-amber-300",   // เหลือง
  "2": "from-pink-500 to-rose-400",      // ชมพู
  "3": "from-emerald-500 to-green-400",  // เขียว
  "4": "from-red-500 to-rose-600",       // แดง
  "5": "from-sky-400 to-cyan-300",       // ฟ้า
  "6": "from-orange-500 to-amber-400",   // ส้ม
  "7": "from-blue-700 to-indigo-600",    // น้ำเงิน
};
const DEFAULT_GRADIENT = "from-slate-500 to-slate-400";

function getRoomGradient(roomName?: string) {
  const match = (roomName ?? "").match(/\/(\d+)\s*$/); // จับเลขหลัง "/" ท้ายสุด เช่น "อ.2/1" -> "1"
  const num = match ? match[1] : null;
  return (num && ROOM_NUMBER_GRADIENTS[num]) || DEFAULT_GRADIENT;
}

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
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

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

  const roomIds = (rooms ?? []).map((r: any) => r.id);
if (roomIds.length > 0) {
  let allStudents: { classroom_id: string }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page, error } = await supabase
      .from("students").select("classroom_id")
      .in("classroom_id", roomIds)
      .range(from, from + pageSize - 1);
    if (error || !page || page.length === 0) break;
    allStudents = allStudents.concat(page as { classroom_id: string }[]);
    if (page.length < pageSize) break; // ถึงหน้าสุดท้ายแล้ว
    from += pageSize;
  }
  const counts: Record<string, number> = {};
  allStudents.forEach(s => { counts[s.classroom_id] = (counts[s.classroom_id] ?? 0) + 1; });
  setStudentCounts(counts);
}
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-['TH_Sarabun_New',_sans-serif]">
      <div className="text-fuchsia-600 font-black text-2xl animate-pulse">กำลังโหลดข้อมูล...</div>
    </div>
  );
}

  return (
    <div className="min-h-screen bg-slate-50 font-['TH_Sarabun_New',_sans-serif]">
                  <div className="sticky top-0 z-30 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 shadow-md px-5 py-4">
  <div className="flex items-center gap-3">
    <button onClick={() => router.push("/dashboard")}
      className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-xl shrink-0 transition-colors">🏠</button>
    <h1 className="text-3xl font-black text-white leading-none whitespace-nowrap font-['TH_Sarabun_New',_sans-serif]">📚 Smart Class</h1>
    <div className="flex-1" />
    {isAdmin && (
      <button onClick={() => router.push("/smartclass/insights")}
        title="ข้อมูลเชิงลึก"
        className="shrink-0 px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center gap-2 text-white text-sm font-black transition-colors font-['TH_Sarabun_New',_sans-serif]">
        📊 ข้อมูลเชิงลึก
      </button>
    )}
  </div>

  <p className="text-white text-lg font-black mt-1 ml-[56px] leading-snug font-['TH_Sarabun_New',_sans-serif]">
  {isAdmin
    ? `แสดงทุกชั้นเรียน (สิทธิ์แอดมิน/ผู้บริหาร) · ${filteredClassrooms.length} ห้อง`
    : `วิชาที่คุณสอน · ${filteredSubjects.length} วิชา`}
</p>

<input value={search} onChange={e => setSearch(e.target.value)}
  placeholder={isAdmin ? "🔍 ค้นหาชื่อห้อง/สายชั้น..." : "🔍 ค้นหาชื่อ/รหัสวิชา..."}
  className="mt-2 ml-[60px] bg-white/90 border-2 border-white/40 rounded-lg px-3 py-1 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:border-white focus:outline-none w-full max-w-[1320px] font-['TH_Sarabun_New',_sans-serif]" />

  {isAdmin && (
    <div className="flex items-center gap-2 mt-3 ml-[56px] overflow-x-auto pb-1">
      <button onClick={() => setLevelFilter("all")}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-black transition-colors font-['TH_Sarabun_New',_sans-serif] ${
          levelFilter === "all" ? "bg-white text-fuchsia-600" : "bg-white/20 text-white hover:bg-white/30"
        }`}>ทั้งหมด</button>
      {LEVELS.filter(l => l.key !== "other").map(l => (
        <button key={l.key} onClick={() => setLevelFilter(l.key)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-black transition-colors font-['TH_Sarabun_New',_sans-serif] ${
            levelFilter === l.key ? "bg-white text-fuchsia-600" : "bg-white/20 text-white hover:bg-white/30"
          }`}>{l.label}</button>
      ))}
    </div>
  )}
</div>

      <main className="p-4 w-full">
        {isAdmin ? (
          filteredClassrooms.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border-2 border-slate-100">
  <p className="text-4xl mb-3">🏫</p>
  <p className="font-black text-slate-500">{search ? "ไม่พบห้องเรียนตามที่ค้นหา" : "ยังไม่มีข้อมูลชั้นเรียน"}</p>
</div>
          ) : (
            <div className="space-y-6">
              {classroomsByLevel.map(({ level, items }) => (
                <div key={level.key}>
                  {levelFilter === "all" && (
                    <h2 className="text-sm font-black text-slate-600 mb-2 flex items-center gap-2">
  <span className="w-1.5 h-4 rounded-full bg-fuchsia-400 inline-block" />
  {level.label}
  <span className="text-slate-300 font-black">({items.length})</span>
</h2>
                  )}
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {items.map(({ classroom }, i) => {
  const gradient = getRoomGradient(classroom.room_name);
  const label = classroom.room_name?.trim() ?? "";
  const count = studentCounts[classroom.id] ?? 0;
  return (
    <button key={classroom.id} onClick={() => router.push(`/smartclass/room/${classroom.id}`)}
  className="text-left rounded-2xl border-2 border-slate-100 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
  <div className={`h-14 bg-gradient-to-r ${gradient} px-4 flex items-center justify-between`}>
    <span className="text-sm font-black bg-white text-slate-900 px-2.5 py-1 rounded-full tracking-wide shadow-sm">
      CLASSROOM
    </span>
    <span className="text-white text-lg leading-none font-black">⠿</span>
  </div>
  <div className="p-4">
    <p className="font-black text-xl text-slate-900 leading-tight truncate">{label}</p>
    <p className="text-slate-400 text-sm font-bold mt-0.5">รายชื่อ</p>
    <div className="mt-3">
      <span className="text-sm font-black bg-fuchsia-100 border-2 border-fuchsia-200 px-3 py-1.5 rounded-lg text-fuchsia-700 inline-flex items-center gap-1.5">
        👥 {count} คน
      </span>
    </div>
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
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border-2 border-slate-100">
  <p className="text-4xl mb-3">📚</p>
  <p className="font-black text-slate-500">{search ? "ไม่พบวิชาตามที่ค้นหา" : "คุณยังไม่มีวิชาที่สอน"}</p>
</div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
  {filteredSubjects.map((g, i) => {
    const gradient = SUBJECT_GRADIENTS[i % SUBJECT_GRADIENTS.length];
    return (
      <button
  key={g.subject.id}
  onClick={() => router.push(`/smartclass/${g.subject.id}`)}
  className="text-left rounded-2xl border-2 border-slate-100 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
>
  <div className={`h-14 bg-gradient-to-r ${gradient} px-4 flex items-center justify-between`}>
    <span className="text-sm font-black bg-white text-slate-900 px-2.5 py-1 rounded-full tracking-wide shadow-sm">
      SUBJECT
    </span>
    <span className="text-white text-lg leading-none font-black">⠿</span>
  </div>
    <div className="p-4">
    <p className="font-black text-xl text-slate-900 leading-tight truncate">
      {g.subject.name_th}
    </p>
    <p className="text-slate-400 text-sm font-bold mt-0.5">{g.subject.subject_code}</p>
    <div className="mt-3 flex justify-center">
      <span className="text-sm font-black bg-fuchsia-100 border-2 border-fuchsia-200 px-3 py-1.5 rounded-lg text-fuchsia-700 inline-flex items-center gap-1.5">
        🏫 {g.roomCount} ห้อง
      </span>
    </div>
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