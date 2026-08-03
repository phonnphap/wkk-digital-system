"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type SectionRow = { id: string; subject_id: string; classroom_id: string; teacher_id: string; co_teacher_id?: string };

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
];

export default function SmartClassSubjectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
      if (!profile) { setLoading(false); return; }

      const admin = !!profile.role && ["admin", "executive"].includes(profile.role);
      setIsAdmin(admin);

      let query = supabase
        .from("subject_sections")
        .select("id, subject_id, classroom_id, teacher_id, co_teacher_id")
        .eq("is_active", true);

      if (!admin) {
        query = query.or(`teacher_id.eq.${profile.id},co_teacher_id.eq.${profile.id}`);
      }

      const { data: secRows } = await query;
      const rows = (secRows ?? []) as SectionRow[];
      setSections(rows);

      const subjectIds = [...new Set(rows.map(r => r.subject_id))];
      if (subjectIds.length > 0) {
        const { data: subs } = await supabase
          .from("subjects").select("id, subject_code, name_th").in("id", subjectIds).order("subject_code");
        setSubjects((subs ?? []) as Subject[]);
      }

      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { subject: Subject; roomCount: number }>();
    subjects.forEach(s => {
      const roomCount = new Set(sections.filter(sec => sec.subject_id === s.id).map(sec => sec.classroom_id)).size;
      map.set(s.id, { subject: s, roomCount });
    });
    return Array.from(map.values());
  }, [subjects, sections]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.trim();
    return grouped.filter(g => g.subject.name_th.includes(q) || g.subject.subject_code.includes(q));
  }, [grouped, search]);

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
              {isAdmin ? "แสดงทุกวิชา (สิทธิ์แอดมิน/ผู้บริหาร)" : "วิชาที่คุณสอน"} · {filtered.length} วิชา
            </p>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อ/รหัสวิชา..."
          className="w-full mt-3 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none" />
      </div>

      <main className="p-4 max-w-5xl mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-bold">{search ? "ไม่พบวิชาตามที่ค้นหา" : "คุณยังไม่มีวิชาที่สอน"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((g, i) => {
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