"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };
type SectionRow = { id: string; classroom_id: string; teacher_id: string; co_teacher_id?: string; join_code: string };

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

        // แก้บั๊ก: เดิมไม่ได้ select/กรอง classroom_id ทำให้นับจำนวน นร. ต่อห้องไม่ได้ (ขึ้น 0 เสมอ)
        const { data: studentsData } = await supabase
          .from("students")
          .select("id, classroom_id")
          .in("classroom_id", classroomIds);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-['TH_Sarabun_New',_sans-serif]">
        <div className="text-fuchsia-500 font-black text-lg animate-pulse">กำลังโหลดข้อมูล...</div>
      </div>
    );
  }
  if (!subject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-['TH_Sarabun_New',_sans-serif]">
        <p className="text-red-500 font-black">❌ ไม่พบวิชานี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-['TH_Sarabun_New',_sans-serif]">
      <div className="bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 px-4 pt-4 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => router.push("/dashboard")}
            title="กลับแดชบอร์ด"
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-lg transition-colors">🏠</button>
          <button onClick={() => router.push("/smartclass")}
            title="กลับหน้ารายวิชา"
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-lg transition-colors">←</button>
        </div>
        <div className="text-center px-2">
          <h1 className="text-xl font-black text-white leading-tight drop-shadow-sm">{subject.name_th}</h1>
          <p className="text-white/80 text-sm font-bold">
            {subject.subject_code} · {sections.length} ห้อง{isAdmin ? " (มุมมองแอดมิน)" : ""}
          </p>
        </div>
      </div>

      <main className="p-4 lg:p-6 w-full max-w-[1600px]">
        {sortedSections.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">🏫</p>
            <p className="font-bold">ไม่พบห้องที่สอนวิชานี้</p>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
  {sortedSections.map((sec) => {
    const room = classroomOf(sec.classroom_id);
    const gradient = getRoomGradient(room?.room_name);
    const label = `${room?.grade_group ?? ""} ${room?.room_name ?? ""}`.trim();
    const count = studentCounts[sec.classroom_id] ?? 0;
    return (
      <button
        key={sec.id}
        onClick={() => router.push(`/smartclass/${subjectId}/${sec.id}`)}
        className="text-left rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
      >
        <div className={`h-14 bg-gradient-to-r ${gradient} px-4 flex items-center justify-between`}>
          <span className="text-[10px] font-black bg-white/95 text-slate-700 px-2.5 py-1 rounded-full tracking-wide shadow-sm">
            CLASSROOM
          </span>
          <span className="text-white/60 text-lg leading-none">⠿</span>
        </div>
        <div className="p-4">
          <p className="font-black text-lg text-slate-800 leading-tight">{label}</p>
          <p className="text-slate-400 text-xs font-bold mt-1">รายชื่อ - {label}</p>
          <div className="mt-3">
            <span className="text-[11px] font-black bg-fuchsia-50 px-2.5 py-1.5 rounded-lg text-fuchsia-600 inline-flex items-center gap-1">
              👥 {count} คน
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