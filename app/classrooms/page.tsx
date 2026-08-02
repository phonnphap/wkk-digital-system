"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
type Teacher = { id: string; first_name?: string; last_name?: string; full_name?: string };
type AcademicYearRaw = { id: string; year_name: string; is_current?: boolean };

function displayName(u?: Teacher | null) {
  if (!u) return "—";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return u.full_name ?? "—";
}
function gradeGroupSortKey(g?: string) {
  if (!g) return 999;
  if (g.includes("อนุบาล")) return 0;
  if (g.includes("ประถม")) return 1;
  if (g.includes("มัธยมศึกษาตอนต้น")) return 2;
  if (g.includes("มัธยมศึกษาตอนปลาย")) return 3;
  return 4;
}

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", ring: "ring-blue-400" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", ring: "ring-pink-400" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", ring: "ring-emerald-400" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", ring: "ring-orange-400" },
];

export default function ClassroomCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [academicYearsRaw, setAcademicYearsRaw] = useState<AcademicYearRaw[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; year_name: string }[]>([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");

  useEffect(() => {
    (async () => {
      const [yearsRes, teachersRes] = await Promise.all([
        supabase.from("academic_years").select("id,year_name,is_current").order("year_name", { ascending: false }),
        supabase.from("users").select("id,first_name,last_name,full_name").order("first_name"),
      ]);

      const yearsRaw = (yearsRes.data ?? []) as AcademicYearRaw[];
      setAcademicYearsRaw(yearsRaw);
      setTeachers((teachersRes.data ?? []) as Teacher[]);

      const uniqueYearMap = new Map<string, string>();
      yearsRaw.forEach(y => { if (!uniqueYearMap.has(y.year_name)) uniqueYearMap.set(y.year_name, y.id); });
      setAcademicYears(Array.from(uniqueYearMap.entries()).map(([year_name, id]) => ({ id, year_name })));

      const currentYear = yearsRaw.find(y => y.is_current) ?? yearsRaw[0];
      if (currentYear) setSelectedYear(uniqueYearMap.get(currentYear.year_name) ?? currentYear.id);

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedYear || academicYearsRaw.length === 0) return;
    (async () => {
      const selRow = academicYearsRaw.find(y => y.id === selectedYear);
      const yearIds = selRow
        ? academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id)
        : [selectedYear];

      const { data: roomsData } = await supabase
        .from("classrooms")
        .select("id,room_number,room_name,grade_group,academic_year_id,homeroom_teacher_id,homeroom_teacher_2_id")
        .in("academic_year_id", yearIds)
        .order("grade_group").order("room_number");

      const rooms = (roomsData ?? []) as Classroom[];
      setClassrooms(rooms);

      if (rooms.length > 0) {
        const { data: countsData } = await supabase
          .from("students")
          .select("classroom_id")
          .in("classroom_id", rooms.map(r => r.id));
        const counts: Record<string, number> = {};
        (countsData ?? []).forEach((s: any) => { counts[s.classroom_id] = (counts[s.classroom_id] ?? 0) + 1; });
        setStudentCounts(counts);
      } else {
        setStudentCounts({});
      }
    })();
  }, [selectedYear, academicYearsRaw]);

  const teacherOf = (c: Classroom) => teachers.find(t => t.id === c.homeroom_teacher_id);

  const filtered = useMemo(() => {
    return classrooms.filter(c => {
      if (gradeFilter && c.grade_group !== gradeFilter) return false;
      if (teacherFilter.trim()) {
        const t1 = displayName(teacherOf(c));
        const t2 = displayName(teachers.find(t => t.id === c.homeroom_teacher_2_id));
        const q = teacherFilter.trim();
        if (!t1.includes(q) && !t2.includes(q)) return false;
      }
      return true;
    });
  }, [classrooms, gradeFilter, teacherFilter, teachers]);

  const gradeGroups = useMemo(() => {
    return [...new Set(classrooms.map(c => c.grade_group).filter(Boolean))]
      .sort((a, b) => gradeGroupSortKey(a as string) - gradeGroupSortKey(b as string)) as string[];
  }, [classrooms]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดข้อมูลห้องเรียน...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">จัดการชั้นเรียน</h1>
            <p className="text-slate-400 text-xs">{filtered.length} ห้อง</p>
          </div>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
            {academicYears.map(y => <option key={y.id} value={y.id}>{y.year_name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <input value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}
            placeholder="🔍 ค้นหาตามชื่อครูประจำชั้น..."
            className="flex-1 min-w-[200px] bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none" />
          <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
            className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none">
            <option value="">— ทุกระดับชั้น —</option>
            {gradeGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {(teacherFilter || gradeFilter) && (
            <button onClick={() => { setTeacherFilter(""); setGradeFilter(""); }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-xs">
              ✕ ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      <main className="p-4 max-w-6xl mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">🏫</p>
            <p className="font-bold">ไม่พบห้องเรียนตามที่ค้นหา</p>
          </div>
        ) : (
          gradeGroups
            .filter(g => filtered.some(c => c.grade_group === g))
            .map(grade => {
              const rooms = filtered
                .filter(c => c.grade_group === grade)
                .sort((a, b) => (a.room_name ?? "").localeCompare(b.room_name ?? "", "th", { numeric: true }));
              return (
                <div key={grade} className="mb-8">
                  <h2 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-3">{grade}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {rooms.map((room, i) => {
                      const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                      const teacher1 = teacherOf(room);
                      const teacher2 = teachers.find(t => t.id === room.homeroom_teacher_2_id);
                      const count = studentCounts[room.id] ?? 0;
                      return (
                        <button key={room.id} onClick={() => router.push(`/classrooms/${room.id}`)}
                          className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                          <p className={`font-black text-lg ${accent.text}`}>{room.room_name ?? `ห้อง ${room.room_number}`}</p>
                          <p className="text-slate-500 text-xs font-bold mt-1 truncate">👤 {displayName(teacher1)}</p>
                          {teacher2 && <p className="text-slate-400 text-xs font-bold truncate">+ {displayName(teacher2)}</p>}
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-500">
                              👥 {count} คน
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
        )}
      </main>
    </div>
  );
}
