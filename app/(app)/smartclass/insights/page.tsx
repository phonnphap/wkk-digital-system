"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InsightsTool from "@/components/insights/InsightsTool";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };

export default function SmartClassInsightsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [classroomId, setClassroomId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
      if (!profile) { setLoading(false); return; }
      const admin = !!profile.role && ["admin", "executive"].includes(profile.role);
      setIsAdmin(admin);
      setCurrentUserId(profile.id);

      if (admin) {
        const [{ data: subs }, { data: rooms }] = await Promise.all([
          supabase.from("subjects").select("id, subject_code, name_th").order("subject_code"),
          supabase.from("classrooms").select("id, room_name, grade_group").order("grade_group"),
        ]);
        setSubjects((subs ?? []) as Subject[]);
        setClassrooms((rooms ?? []) as Classroom[]);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-black text-lg animate-pulse">กำลังโหลด...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-4xl">🔒</p>
        <p className="font-bold text-slate-500">หน้านี้สำหรับแอดมิน/ผู้บริหารเท่านั้น</p>
        <button onClick={() => router.push("/smartclass")} className="mt-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-black">
          กลับไปหน้า Smart Class
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-md px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/smartclass")}
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white leading-none">📊 ข้อมูลเชิงลึก</h1>
            <p className="text-white/70 text-xs">ภาพรวมทั้งโรงเรียน / สายชั้น / รายวิชา / ห้องเรียน</p>
          </div>
        </div>
      </div>

      <main className="p-4 lg:p-6 max-w-[1600px] mx-auto w-full space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[11px] font-black text-slate-400 mb-1">
              รายวิชา (จำเป็นสำหรับขอบเขต "สายชั้น" / "วิชานี้ทุกห้อง" / "ห้องเรียน")
            </p>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-purple-400 focus:outline-none">
              <option value="">— ไม่เลือก (ดูทั้งโรงเรียนทุกวิชา) —</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name_th} ({s.subject_code})</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-[11px] font-black text-slate-400 mb-1">
              ห้องเรียน (จำเป็นสำหรับขอบเขต "ห้องเรียน" / "สายชั้น")
            </p>
            <select value={classroomId} onChange={e => setClassroomId(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-purple-400 focus:outline-none">
              <option value="">— ไม่เลือก —</option>
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.grade_group ?? ""} {c.room_name ?? ""}</option>
              ))}
            </select>
          </div>
        </div>

        <InsightsTool
          key={`${subjectId}-${classroomId}`}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          subjectId={subjectId || undefined}
          classroomId={classroomId || undefined}
        />
      </main>
    </div>
  );
}