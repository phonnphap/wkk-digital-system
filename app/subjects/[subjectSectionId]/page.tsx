"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AttendanceTool from "@/components/attendance/AttendanceTool";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string; subject_group?: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };
type Teacher = { id: string; first_name?: string; last_name?: string; full_name?: string };
type AcademicYear = { id: string; year_name: string; semester?: number };
type SubjectSection = {
  id: string; subject_id: string; classroom_id: string; academic_year_id: string;
  teacher_id: string; co_teacher_id?: string; join_code: string; is_active: boolean;
};
type EnrolledStudent = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number; avatar_url?: string };

function displayName(u?: Teacher | null) {
  if (!u) return "—";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return u.full_name ?? "—";
}

// ══════════════════════════════════════════════════════════════════════════
// ── QR Code Modal ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function QrCodeModal({ inviteUrl, onClose }: { inviteUrl: string; onClose: () => void }) {
  // ใช้บริการ qrserver.com สร้างรูป QR แบบไม่ต้องติดตั้ง library เพิ่ม
  // ★ หมายเหตุความเป็นส่วนตัว: วิธีนี้ส่ง URL (ซึ่งมี join_code) ไปยัง third-party service ภายนอก
  //   ถ้าต้องการสร้าง QR แบบไม่พึ่งบริการภายนอก แนะนำเปลี่ยนไปใช้ npm package "qrcode" แทน (gen ฝั่ง client ได้เลย)
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(inviteUrl)}`;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 text-lg mb-3">📷 QR เข้าร่วมวิชา</h3>
        <img src={qrSrc} alt="QR Code" className="mx-auto rounded-xl border-2 border-slate-100" width={260} height={260} />
        <p className="text-slate-400 text-xs mt-3">สแกนเพื่อเข้าร่วมวิชานี้</p>
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ปิด</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── สุ่มชื่อ (Randomizer) ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function RandomizerTool({ students }: { students: EnrolledStudent[] }) {
  const [picked, setPicked] = useState<EnrolledStudent | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [excludeUsed, setExcludeUsed] = useState(true);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());

  function spin() {
    const pool = excludeUsed ? students.filter(s => !usedIds.has(s.id)) : students;
    if (pool.length === 0) { alert("สุ่มครบทุกคนแล้ว! กด 'เริ่มใหม่' เพื่อสุ่มรอบใหม่"); return; }
    setSpinning(true);
    let i = 0;
    const interval = setInterval(() => {
      setPicked(pool[Math.floor(Math.random() * pool.length)]);
      i++;
      if (i > 12) {
        clearInterval(interval);
        setSpinning(false);
        const finalPick = pool[Math.floor(Math.random() * pool.length)];
        setPicked(finalPick);
        setUsedIds(prev => new Set(prev).add(finalPick.id));
      }
    }, 80);
  }

  return (
    <div className="p-5 text-center">
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border-2 border-blue-200 p-8 mb-4 min-h-[140px] flex items-center justify-center">
        {picked ? (
          <div>
            <p className="text-3xl font-black text-blue-700">{picked.prefix} {picked.first_name} {picked.last_name}</p>
            <p className="text-slate-400 font-bold mt-1">เลขที่ {picked.seat_number}</p>
          </div>
        ) : (
          <p className="text-slate-300 font-bold">กดปุ่มด้านล่างเพื่อสุ่มชื่อ</p>
        )}
      </div>
      <label className="flex items-center justify-center gap-2 text-xs font-bold text-slate-500 mb-3">
        <input type="checkbox" checked={excludeUsed} onChange={e => setExcludeUsed(e.target.checked)} />
        ไม่สุ่มซ้ำคนเดิม ({usedIds.size}/{students.length} คนถูกสุ่มแล้ว)
      </label>
      <div className="flex gap-2 justify-center">
        <button onClick={spin} disabled={spinning || students.length === 0}
          className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-50">
          {spinning ? "🎲 กำลังสุ่ม..." : "🎲 สุ่มชื่อ"}
        </button>
        {usedIds.size > 0 && (
          <button onClick={() => { setUsedIds(new Set()); setPicked(null); }}
            className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-500 font-black text-sm">
            🔄 เริ่มใหม่
          </button>
        )}
      </div>
      {students.length === 0 && <p className="text-amber-600 text-xs font-bold mt-3">⚠️ ยังไม่มีนักเรียนเข้าร่วมวิชานี้</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── จัดกลุ่ม (Group Tool) ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function GroupTool({ students }: { students: EnrolledStudent[] }) {
  const [groupSize, setGroupSize] = useState(4);
  const [groups, setGroups] = useState<EnrolledStudent[][] | null>(null);

  function shuffle() {
    if (students.length === 0) { alert("ยังไม่มีนักเรียนเข้าร่วมวิชานี้"); return; }
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const result: EnrolledStudent[][] = [];
    for (let i = 0; i < shuffled.length; i += groupSize) result.push(shuffled.slice(i, i + groupSize));
    setGroups(result);
  }

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 justify-center mb-4">
        <label className="text-sm font-bold text-slate-600">คนต่อกลุ่ม:</label>
        <input type="number" min={2} max={10} value={groupSize} onChange={e => setGroupSize(Number(e.target.value))}
          className="w-16 text-center bg-slate-50 border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold" />
        <button onClick={shuffle} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm">
          🔀 จัดกลุ่มใหม่
        </button>
      </div>
      {groups ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {groups.map((g, i) => (
            <div key={i} className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3">
              <p className="font-black text-purple-700 text-sm mb-2">กลุ่ม {i + 1}</p>
              <ul className="space-y-1">
                {g.map(s => <li key={s.id} className="text-xs font-bold text-slate-600">• {s.first_name} {s.last_name}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-slate-300 font-bold py-8">กด "จัดกลุ่มใหม่" เพื่อเริ่มแบ่งกลุ่มแบบสุ่ม</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Main Page ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
export default function SubjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sectionId = params?.subjectSectionId as string;

  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SubjectSection | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [coTeacher, setCoTeacher] = useState<Teacher | null>(null);
  const [academicYear, setAcademicYear] = useState<AcademicYear | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [tool, setTool] = useState<"none" | "attendance" | "randomizer" | "groups" | "activities">("none");
  const [currentUserId, setCurrentUserId] = useState("");
  type Period = { timetable_entry_id: string; slot_number?: number; start_time?: string; end_time?: string; slot_label?: string };

const [periods, setPeriods] = useState<Period[]>([]);
const [timetableEntryId, setTimetableEntryId] = useState("");
const [loadingPeriods, setLoadingPeriods] = useState(false);
const [homeroomMap, setHomeroomMap] = useState<Record<string, { status: "present" | "absent" | "late" | "leave" }>>({});

useEffect(() => {
  (async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
      if (profile) setCurrentUserId(profile.id);
    }
  })();
}, []);

useEffect(() => {
  (async () => {
    if (!section?.classroom_id || !selectedDate) { setHomeroomMap({}); return; }
    const { data } = await supabase
      .from("attendance_records")
      .select("student_id, status")
      .eq("classroom_id", section.classroom_id)
      .eq("attendance_date", selectedDate);
    const map: Record<string, { status: any }> = {};
    (data ?? []).forEach((r: any) => { map[r.student_id] = { status: r.status }; });
    setHomeroomMap(map);
  })();
}, [section?.classroom_id, selectedDate]);

  const loadSection = useCallback(async () => {
    if (!sectionId) return;
    const { data: sec } = await supabase.from("subject_sections").select("*").eq("id", sectionId).maybeSingle();
    if (!sec) { setLoading(false); return; }
    setSection(sec as SubjectSection);


    const [{ data: subj }, { data: room }, { data: t1 }, { data: t2 }, { data: year }, { data: enrollments }] = await Promise.all([
      supabase.from("subjects").select("id,subject_code,name_th,subject_group").eq("id", sec.subject_id).maybeSingle(),
      supabase.from("classrooms").select("id,room_name,grade_group").eq("id", sec.classroom_id).maybeSingle(),
      supabase.from("users").select("id,first_name,last_name,full_name").eq("id", sec.teacher_id).maybeSingle(),
      sec.co_teacher_id
        ? supabase.from("users").select("id,first_name,last_name,full_name").eq("id", sec.co_teacher_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("academic_years").select("id,year_name,semester").eq("id", sec.academic_year_id).maybeSingle(),
      supabase.from("subject_enrollments").select("student_id").eq("subject_section_id", sectionId),
    ]);

    setSubject(subj as Subject);
    setClassroom(room as Classroom);
    setTeacher(t1 as Teacher);
    setCoTeacher(t2 as Teacher | null);
    setAcademicYear(year as AcademicYear);

    const studentIds = (enrollments ?? []).map((e: any) => e.student_id);
    if (studentIds.length > 0) {
      const { data: studentsData } = await supabase
        .from("students").select("id,prefix,first_name,last_name,seat_number,avatar_url")
.in("id", studentIds).order("seat_number");
      setStudents((studentsData ?? []) as EnrolledStudent[]);
    } else {
      setStudents([]);
    }

    setLoading(false);
  }, [sectionId]);

  useEffect(() => {
  (async () => {
    if (!section?.id || !selectedDate) { setPeriods([]); setTimetableEntryId(""); return; }
    const res = await fetch(`/api/timetable/periods?subject_section_id=${section.id}&attendance_date=${selectedDate}`);
    const json = await res.json();
    const list = json.periods ?? [];
    setPeriods(list);
    setTimetableEntryId(list.length > 0 ? list[0].timetable_entry_id : "");
  })();
}, [section?.id, selectedDate]);

  useEffect(() => { loadSection(); }, [loadSection]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !section) return "";
    return `${window.location.origin}/join/${section.join_code}`;
  }, [section]);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerateCode() {
    if (!section || !confirm("สุ่มรหัสเข้าวิชาใหม่? รหัสเดิมจะใช้ไม่ได้อีกต่อไป")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/subject-sections/${section.id}/join-code/regenerate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "สุ่มรหัสใหม่ไม่สำเร็จ");
      setSection(json.section);
    } catch (err: any) {
      alert("❌ " + (err?.message ?? "เกิดข้อผิดพลาด"));
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดข้อมูลวิชา...</div>
      </div>
    );
  }
  if (!section || !subject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500 font-black">❌ ไม่พบวิชานี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {showQr && <QrCodeModal inviteUrl={inviteUrl} onClose={() => setShowQr(false)} />}

      {/* Subject Banner */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-4 pt-4 pb-6">
        <button onClick={() => router.push("/subjects")}
          className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-lg mb-3">←</button>
        <h1 className="text-xl font-black text-white leading-tight">{subject.name_th}</h1>
        <p className="text-white/70 text-sm font-bold">
          {subject.subject_code} · {classroom?.grade_group} {classroom?.room_name} · {academicYear?.year_name}
          {academicYear?.semester ? ` เทอม ${academicYear.semester}` : ""}
        </p>
        <p className="text-white/60 text-xs font-bold mt-1">
          👤 {displayName(teacher)}{coTeacher ? ` + ${displayName(coTeacher)}` : ""} · 👥 {students.length} คน
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-4">
          <div className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-white/70 text-xs font-bold">รหัสเข้าวิชา</span>
            <span className="font-black text-white font-mono tracking-widest">{section.join_code}</span>
          </div>
          <button onClick={copyInvite} className="px-3 py-2 rounded-xl bg-white text-blue-700 font-black text-xs hover:bg-blue-50">
            {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกลิงก์เชิญ"}
          </button>
          <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-black text-xs">
            📷 QR
          </button>
          <button onClick={regenerateCode} disabled={regenerating} className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-black text-xs disabled:opacity-50">
            {regenerating ? "⏳..." : "🔄 สุ่มรหัสใหม่"}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-2 flex-wrap">
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none" />
        <span className="text-xs text-slate-400 font-bold">← วันที่จัดการเรียนการสอน (ใช้กับเช็กชื่อ/กิจกรรม)</span>
        {periods.length > 1 && (
  <select value={timetableEntryId} onChange={e => setTimetableEntryId(e.target.value)}
    className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none">
    {periods.map(p => (
      <option key={p.timetable_entry_id} value={p.timetable_entry_id}>
        คาบ {p.slot_number} · {p.start_time?.slice(0,5)}-{p.end_time?.slice(0,5)}
      </option>
    ))}
  </select>
)}
      </div>

      {/* Content area */}
      <main className="p-4 max-w-3xl mx-auto">
        {tool === "none" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-black text-slate-700 text-sm mb-4">👥 นักเรียนที่เข้าร่วมวิชานี้</h2>
            {students.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-3xl mb-2">📭</p>
                <p className="font-bold text-sm">ยังไม่มีนักเรียนเข้าร่วม — แชร์รหัส/QR ด้านบนให้นักเรียนเข้าวิชานี้</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {students.map(s => (
                  <div key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-400 text-white text-xs font-black flex items-center justify-center">
                        {s.first_name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-700 truncate">{s.first_name} {s.last_name}</p>
                      <p className="text-[10px] text-slate-400">เลขที่ {s.seat_number}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tool === "randomizer" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <RandomizerTool students={students} />
          </div>
        )}
        {tool === "groups" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <GroupTool students={students} />
          </div>
        )}
        {tool === "attendance" && (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
    {periods.length === 0 ? (
      <div className="p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">🗓️</p>
        <p className="font-bold text-sm">วันนี้ไม่มีคาบเรียนวิชานี้ตามตารางสอน</p>
      </div>
    ) : (
      <>
        {periods.length > 1 && (
          <div className="px-4 pt-4">
            <select value={timetableEntryId} onChange={e => setTimetableEntryId(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none">
              {periods.map((p: any) => (
                <option key={p.timetable_entry_id} value={p.timetable_entry_id}>
                  คาบ {p.slot_number} · {p.start_time?.slice(0,5)}-{p.end_time?.slice(0,5)}
                </option>
              ))}
            </select>
          </div>
        )}
        <AttendanceTool
          timetableEntryId={timetableEntryId} date={selectedDate} students={students} currentUserId={currentUserId}
          referenceMap={homeroomMap} referenceLabel="โฮมรูม"
        />
      </>
    )}
  </div>
)}
        {tool === "activities" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
            <p className="text-4xl mb-3">🚧</p>
            <p className="font-bold">ระบบกิจกรรม/งานที่มอบหมาย กำลังพัฒนา (โมดูลถัดไป: Attendance + Scores)</p>
          </div>
        )}
      </main>

      {/* Bottom Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-2 py-2">
        <div className="max-w-3xl mx-auto grid grid-cols-4 gap-1">
          {[
            { key: "attendance", icon: "✅", label: "เช็กชื่อ" },
            { key: "randomizer", icon: "🎲", label: "สุ่มชื่อ" },
            { key: "groups", icon: "🧩", label: "เครื่องมือ" },
            { key: "activities", icon: "📝", label: "กิจกรรม" },
          ].map(item => (
            <button key={item.key} onClick={() => setTool(tool === item.key ? "none" : item.key as any)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all ${tool === item.key ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-50"}`}>
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px] font-black">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}