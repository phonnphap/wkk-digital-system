"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string; subject_group?: string };
type Classroom = { id: string; room_name?: string; grade_group?: string; academic_year_id?: string };
type Teacher = { id: string; first_name?: string; last_name?: string; full_name?: string };
type AcademicYearRaw = { id: string; year_name: string; is_current?: boolean };
type SubjectSection = {
  id: string; subject_id: string; classroom_id: string; academic_year_id: string;
  teacher_id: string; co_teacher_id?: string; join_code: string; is_active: boolean; created_at: string;
};

function displayName(u?: Teacher | null) {
  if (!u) return "—";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return u.full_name ?? "—";
}

const CARD_ACCENTS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
];

// ══════════════════════════════════════════════════════════════════════════
// ── เปิดวิชาใหม่ (Modal) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function CreateSectionModal({ subjects, classrooms, teachers, academicYearId, currentUserId, onClose, onCreated }: {
  subjects: Subject[]; classrooms: Classroom[]; teachers: Teacher[]; academicYearId: string; currentUserId: string;
  onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [subjectQuery, setSubjectQuery] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [coTeacherId, setCoTeacherId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredSubjects = useMemo(() => {
    if (!subjectQuery.trim()) return subjects.slice(0, 30);
    const q = subjectQuery.trim();
    return subjects.filter(s => s.subject_code.includes(q) || s.name_th.includes(q)).slice(0, 30);
  }, [subjects, subjectQuery]);

  async function handleSubmit() {
    setError("");
    if (!subjectId || !classroomId) { setError("กรุณาเลือกวิชาและห้องเรียน"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/subject-sections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId, classroom_id: classroomId, academic_year_id: academicYearId,
          teacher_id: currentUserId, co_teacher_id: coTeacherId || undefined, created_by: currentUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "เปิดวิชาไม่สำเร็จ");
      await onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
    } finally {
      setSaving(false);
    }
  }

  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 px-6 py-4 shrink-0">
          <h3 className="text-lg font-black text-white">➕ เปิดวิชาใหม่</h3>
          <p className="text-white/70 text-xs">ระบบจะสร้าง Join Code ให้อัตโนมัติ</p>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ค้นหารายวิชา *</label>
            <input value={subjectQuery} onChange={e => setSubjectQuery(e.target.value)} placeholder="พิมพ์รหัสวิชาหรือชื่อวิชา..." className={inp} />
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inp + " mt-2"} size={6}>
              {filteredSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.subject_code} — {s.name_th}</option>
              ))}
              {filteredSubjects.length === 0 && <option disabled>ไม่พบรายวิชา</option>}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ห้องเรียน *</label>
            <select value={classroomId} onChange={e => setClassroomId(e.target.value)} className={inp}>
              <option value="">— เลือกห้อง —</option>
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.grade_group} {c.room_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              ครูร่วมสอน <span className="text-slate-400 font-normal normal-case">(ถ้ามี)</span>
            </label>
            <select value={coTeacherId} onChange={e => setCoTeacherId(e.target.value)} className={inp}>
              <option value="">— ไม่มี —</option>
              {teachers.filter(t => t.id !== currentUserId).map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
          </div>

          {error && <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2">❌ {error}</p>}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
            {saving ? "⏳ กำลังเปิด..." : "🚀 เปิดวิชา"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Main Page ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
export default function SubjectsCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [sections, setSections] = useState<SubjectSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicYearsRaw, setAcademicYearsRaw] = useState<AcademicYearRaw[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; year_name: string }[]>([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadSections = useCallback(async (yearId: string) => {
    if (!yearId) return;
    const selRow = academicYearsRaw.find(y => y.id === yearId);
    const yearIds = selRow ? academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id) : [yearId];
    const { data } = await supabase.from("subject_sections").select("*").in("academic_year_id", yearIds).order("created_at", { ascending: false });
    setSections((data ?? []) as SubjectSection[]);
  }, [academicYearsRaw]);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
        if (profile) setCurrentUserId(profile.id);
      }

      const [yearsRes, subjectsRes, teachersRes, classroomsRes] = await Promise.all([
        supabase.from("academic_years").select("id,year_name,is_current").order("year_name", { ascending: false }),
        supabase.from("subjects").select("id,subject_code,name_th,subject_group").order("subject_code"),
        supabase.from("users").select("id,first_name,last_name,full_name").order("first_name"),
        supabase.from("classrooms").select("id,room_name,grade_group,academic_year_id").order("grade_group").order("room_number"),
      ]);

      const yearsRaw = (yearsRes.data ?? []) as AcademicYearRaw[];
      setAcademicYearsRaw(yearsRaw);
      setSubjects((subjectsRes.data ?? []) as Subject[]);
      setTeachers((teachersRes.data ?? []) as Teacher[]);
      setClassrooms((classroomsRes.data ?? []) as Classroom[]);

      const uniqueYearMap = new Map<string, string>();
      yearsRaw.forEach(y => { if (!uniqueYearMap.has(y.year_name)) uniqueYearMap.set(y.year_name, y.id); });
      setAcademicYears(Array.from(uniqueYearMap.entries()).map(([year_name, id]) => ({ id, year_name })));

      const currentYear = yearsRaw.find(y => y.is_current) ?? yearsRaw[0];
      if (currentYear) setSelectedYear(uniqueYearMap.get(currentYear.year_name) ?? currentYear.id);

      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (selectedYear) loadSections(selectedYear); }, [selectedYear, loadSections]);

  const subjectOf = (id: string) => subjects.find(s => s.id === id);
  const classroomOf = (id: string) => classrooms.find(c => c.id === id);
  const teacherOf = (id: string) => teachers.find(t => t.id === id);

  const filtered = useMemo(() => {
    return sections.filter(sec => {
      if (!teacherFilter.trim()) return true;
      const t1 = displayName(teacherOf(sec.teacher_id));
      const t2 = sec.co_teacher_id ? displayName(teacherOf(sec.co_teacher_id)) : "";
      return t1.includes(teacherFilter.trim()) || t2.includes(teacherFilter.trim());
    });
  }, [sections, teacherFilter, teachers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดรายวิชา...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {showCreate && (
        <CreateSectionModal
          subjects={subjects} classrooms={classrooms.filter(c => c.academic_year_id === selectedYear || true)}
          teachers={teachers} academicYearId={selectedYear} currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreated={() => loadSections(selectedYear)}
        />
      )}

      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">จัดการรายวิชา</h1>
            <p className="text-slate-400 text-xs">{filtered.length} วิชาที่เปิดสอน</p>
          </div>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
            {academicYears.map(y => <option key={y.id} value={y.id}>{y.year_name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <input value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} placeholder="🔍 ค้นหาตามชื่อครูผู้สอน..."
            className="flex-1 min-w-[200px] bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none" />
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shrink-0">
            ➕ เปิดวิชาใหม่
          </button>
        </div>
      </div>

      <main className="p-4 max-w-6xl mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-bold">{teacherFilter ? "ไม่พบวิชาตามที่ค้นหา" : "ยังไม่มีวิชาที่เปิดสอนในปีการศึกษานี้"}</p>
            {!teacherFilter && (
              <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
                ➕ เปิดวิชาแรก
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((sec, i) => {
              const subject = subjectOf(sec.subject_id);
              const classroom = classroomOf(sec.classroom_id);
              const teacher = teacherOf(sec.teacher_id);
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              return (
                <button key={sec.id} onClick={() => router.push(`/subjects/${sec.id}`)}
                  className={`text-left rounded-2xl border-2 ${accent.border} ${accent.bg} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                  <p className={`font-black text-base ${accent.text} leading-tight`}>{subject?.name_th ?? "—"}</p>
                  <p className="text-slate-400 text-xs font-bold mt-0.5">{subject?.subject_code}</p>
                  <p className="text-slate-500 text-xs font-bold mt-2">🏫 {classroom?.grade_group} {classroom?.room_name}</p>
                  <p className="text-slate-500 text-xs font-bold">👤 {displayName(teacher)}</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[10px] font-black bg-white/70 px-2 py-1 rounded-lg text-slate-600 font-mono tracking-wider">
                      🔑 {sec.join_code}
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