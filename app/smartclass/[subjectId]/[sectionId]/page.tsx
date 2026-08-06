"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AttendanceTool from "@/components/attendance/AttendanceTool";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };
type SectionRow = { id: string; join_code: string; classroom_id: string };
type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number; avatar_url?: string };

type TabKey = "roster" | "attendance" | "random" | "tools";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "roster", label: "รายชื่อ", icon: "👥" },
  { key: "attendance", label: "เช็กชื่อ", icon: "✅" },
  { key: "random", label: "สุ่มชื่อ", icon: "🎲" },
  { key: "tools", label: "เครื่องมือ", icon: "🧰" },
];

function QrCodeModal({ inviteUrl, onClose }: { inviteUrl: string; onClose: () => void }) {
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

/* ---------------- แท็บ สุ่มชื่อ ---------------- */

type RandomMode = "circle" | "slide" | "card" | "face";

function RandomPickerTab({ students }: { students: Student[] }) {
  const [mode, setMode] = useState<RandomMode>("card");
  const [selected, setSelected] = useState<Set<string>>(new Set(students.map(s => s.id)));
  const [excludePicked, setExcludePicked] = useState(true);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);
  const [spinning, setSpinning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setSelected(new Set(students.map(s => s.id))); }, [students]);

  const pool = useMemo(() => {
    return students.filter(s => selected.has(s.id) && (!excludePicked || !pickedIds.has(s.id)));
  }, [students, selected, excludePicked, pickedIds]);

  function toggleAll() {
    setSelected(prev => (prev.size === students.length ? new Set() : new Set(students.map(s => s.id))));
  }
  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function spin() {
    if (pool.length === 0 || spinning) return;
    setSpinning(true);
    setWinner(null);
    let ticks = 0;
    const totalTicks = 18 + Math.floor(Math.random() * 8);
    let delay = 60;
    function tick() {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setHighlightId(pick.id);
      ticks++;
      if (ticks >= totalTicks) {
        setWinner(pick);
        setHighlightId(pick.id);
        setPickedIds(prev => new Set(prev).add(pick.id));
        setSpinning(false);
        return;
      }
      delay = delay + ticks * 4; // ค่อยๆ ช้าลง
      intervalRef.current = setTimeout(tick, delay);
    }
    tick();
  }

  function resetPicked() {
    setPickedIds(new Set());
    setWinner(null);
    setHighlightId(null);
  }

  useEffect(() => () => { if (intervalRef.current) clearTimeout(intervalRef.current); }, []);

  return (
    <div className="space-y-4">
      {/* ตั้งค่าโหมด */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="font-black text-slate-700 text-sm mb-3">โหมดสุ่ม</p>
        <div className="grid grid-cols-4 gap-2">
          {([
            { key: "circle", label: "วงเวียน", icon: "🎡" },
            { key: "slide", label: "สไลด์", icon: "🃏" },
            { key: "card", label: "การ์ด", icon: "🗂️" },
            { key: "face", label: "ใบหน้า", icon: "🙂" },
          ] as { key: RandomMode; label: string; icon: string }[]).map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`rounded-xl border-2 py-2 text-xs font-black flex flex-col items-center gap-1 ${
                mode === m.key ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"
              }`}>
              <span className="text-lg">{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={toggleAll} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs">
              {selected.size === students.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
            <span className="text-xs text-slate-400 font-bold">เลือกแล้ว {selected.size}/{students.length} คน</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <input type="checkbox" checked={excludePicked} onChange={e => setExcludePicked(e.target.checked)} />
            ไม่สุ่มซ้ำคนที่เคยออกแล้ว
          </label>
        </div>
      </div>

      {/* พื้นที่แสดงผลสุ่ม */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center min-h-[220px]">
        {pool.length === 0 ? (
          <p className="text-slate-400 font-bold text-sm">ไม่มีนักเรียนในกลุ่มที่เลือก / สุ่มครบแล้ว</p>
        ) : winner && !spinning ? (
          <div className="text-center">
            {winner.avatar_url ? (
              <img src={winner.avatar_url} className="w-20 h-20 rounded-full object-cover mx-auto border-4 border-emerald-300" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-emerald-400 text-white text-2xl font-black flex items-center justify-center mx-auto">
                {winner.first_name[0]}
              </div>
            )}
            <p className="mt-3 text-xl font-black text-emerald-700">{winner.first_name} {winner.last_name}</p>
            <p className="text-slate-400 text-xs font-bold">เลขที่ {winner.seat_number}</p>
          </div>
        ) : (
          <div className="w-full">
            {mode === "card" || mode === "face" ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {pool.map(s => (
                  <div key={s.id} className={`rounded-xl p-2 text-center border-2 transition-all ${
                    highlightId === s.id ? "border-emerald-400 bg-emerald-50 scale-105" : "border-slate-100"
                  }`}>
                    {mode === "face" ? (
                      s.avatar_url ? (
                        <img src={s.avatar_url} className="w-9 h-9 rounded-full object-cover mx-auto" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-300 text-white text-xs font-black flex items-center justify-center mx-auto">
                          {s.first_name[0]}
                        </div>
                      )
                    ) : (
                      <p className="text-[10px] font-black text-slate-600 truncate">{s.first_name}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center">
                {highlightId ? (
                  <p className="text-2xl font-black text-slate-700 animate-pulse">
                    {students.find(s => s.id === highlightId)?.first_name ?? "?"}
                  </p>
                ) : (
                  <p className="text-slate-300 font-black text-lg">กดสุ่มเพื่อเริ่ม</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={spin} disabled={spinning || pool.length === 0}
          className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black">
          {spinning ? "กำลังสุ่ม..." : "🎲 สุ่มชื่อ"}
        </button>
        <button onClick={resetPicked} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-sm">
          รีเซ็ต
        </button>
      </div>
    </div>
  );
}

/* ---------------- แท็บ เครื่องมือ (จับเวลา / เสียงดัง / จัดกลุ่ม) ---------------- */

function TimerBox() {
  const [totalSec, setTotalSec] = useState(300);
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) { setRunning(false); return 0; }
          return r - 1;
        });
      }, 1000);
    } else if (ref.current) {
      clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="font-black text-slate-700 text-sm mb-3">⏱️ จับเวลา</p>
      <p className={`text-center text-5xl font-black tabular-nums mb-3 ${remaining === 0 ? "text-red-500" : "text-slate-700"}`}>{mm}:{ss}</p>
      <div className="flex gap-2 mb-3">
        {[60, 180, 300, 600].map(sec => (
          <button key={sec} onClick={() => { setTotalSec(sec); setRemaining(sec); setRunning(false); }}
            className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-black">{sec / 60} นาที</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setRunning(r => !r)} disabled={remaining === 0}
          className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white font-black text-sm">
          {running ? "หยุดชั่วคราว" : "เริ่ม"}
        </button>
        <button onClick={() => { setRunning(false); setRemaining(totalSec); }}
          className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-black text-sm">รีเซ็ต</button>
      </div>
    </div>
  );
}

function NoiseDetectorBox() {
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const [threshold, setThreshold] = useState(60);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      function loop() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, Math.round((avg / 255) * 100)));
        rafRef.current = requestAnimationFrame(loop);
      }
      loop();
      setActive(true);
    } catch {
      alert("ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตการใช้งานไมค์");
    }
  }
  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setActive(false);
    setLevel(0);
  }
  useEffect(() => () => stop(), []);

  const loud = level >= threshold;

  return (
    <div className={`bg-white rounded-2xl border-2 p-4 transition-colors ${loud ? "border-red-400" : "border-slate-200"}`}>
      <p className="font-black text-slate-700 text-sm mb-3">🔊 ตรวจจับเสียงดัง</p>
      <div className="h-4 rounded-full bg-slate-100 overflow-hidden mb-2">
        <div className={`h-full transition-all ${loud ? "bg-red-400" : "bg-emerald-400"}`} style={{ width: `${level}%` }} />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-slate-400 font-bold">ระดับเตือน</span>
        <input type="range" min={20} max={100} value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="flex-1" />
        <span className="text-[10px] text-slate-400 font-bold">{threshold}</span>
      </div>
      {loud && <p className="text-center text-red-500 font-black text-sm mb-2 animate-pulse">⚠️ เสียงดังเกินไป!</p>}
      <button onClick={active ? stop : start}
        className={`w-full py-2.5 rounded-xl font-black text-sm text-white ${active ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"}`}>
        {active ? "หยุดตรวจจับ" : "เริ่มตรวจจับ (ต้องอนุญาตไมค์)"}
      </button>
    </div>
  );
}

function GroupingBox({ students }: { students: Student[] }) {
  const [numGroups, setNumGroups] = useState(4);
  const [groups, setGroups] = useState<Student[][]>([]);

  function generate() {
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const result: Student[][] = Array.from({ length: numGroups }, () => []);
    shuffled.forEach((s, i) => result[i % numGroups].push(s));
    setGroups(result);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="font-black text-slate-700 text-sm mb-3">👨‍👩‍👧‍👦 สร้างกลุ่ม</p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-slate-500">จำนวนกลุ่ม</span>
        <input type="number" min={2} max={Math.max(2, students.length)} value={numGroups}
          onChange={e => setNumGroups(Math.max(2, Number(e.target.value) || 2))}
          className="w-16 border-2 border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-center" />
        <button onClick={generate} disabled={students.length === 0}
          className="ml-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white font-black text-xs">
          🔀 สุ่มแบ่งกลุ่ม
        </button>
      </div>
      {groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map((g, i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-black text-emerald-600 mb-1.5">กลุ่มที่ {i + 1} ({g.length} คน)</p>
              <div className="space-y-1">
                {g.map(s => (
                  <p key={s.id} className="text-xs font-bold text-slate-600 truncate">• {s.first_name} {s.last_name}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolsTab({ students }: { students: Student[] }) {
  return (
    <div className="space-y-4">
      <TimerBox />
      <NoiseDetectorBox />
      <GroupingBox students={students} />
    </div>
  );
}

/* ---------------- แท็บ เช็กชื่อ (placeholder — รอ schema ตารางสอน/เช็กชื่อโฮมรูม) ---------------- */

function AttendanceTabStub() {
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
      <p className="text-4xl mb-3">🚧</p>
      <p className="font-black text-slate-600 mb-1">แท็บเช็กชื่อกำลังจะมา</p>
      <p className="text-slate-400 text-xs max-w-xs mx-auto">
        ต้องการชื่อตาราง/คอลัมน์ของ "ตารางสอน" (เพื่อดูว่าวันนี้มีกี่คาบ) และ
        "ข้อมูลเช็กชื่อครูประจำชั้น" (เพื่อโชว์ badge โฮมรูม) ก่อนถึงจะต่อระบบให้ครบ
      </p>
    </div>
  );
}

/* ---------------- หน้าเพจหลัก ---------------- */

export default function SmartClassRosterPage() {
  const router = useRouter();
  const params = useParams();
  const subjectId = params?.subjectId as string;
  const sectionId = params?.sectionId as string;

  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [section, setSection] = useState<SectionRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<TabKey>("roster");
  const [currentUserId, setCurrentUserId] = useState("");
const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
type Period = { timetable_entry_id: string; slot_number?: number; start_time?: string; end_time?: string };
const [periods, setPeriods] = useState<Period[]>([]);
const [timetableEntryId, setTimetableEntryId] = useState("");
const [homeroomMap, setHomeroomMap] = useState<Record<string, { status: "present" | "absent" | "late" | "leave" }>>({});

  useEffect(() => {
    (async () => {
      if (!sectionId) return;

      const { data: sec } = await supabase
        .from("subject_sections").select("id, join_code, classroom_id").eq("id", sectionId).maybeSingle();
      setSection(sec as SectionRow);

      const [{ data: subj }, { data: room }] = await Promise.all([
        supabase.from("subjects").select("id, subject_code, name_th").eq("id", subjectId).maybeSingle(),
        sec?.classroom_id
          ? supabase.from("classrooms").select("id, room_name, grade_group").eq("id", sec.classroom_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setSubject(subj as Subject);
      setClassroom(room as Classroom);

      // ดึงรายชื่อ นร. ตรงจาก classroom_id ทันที ไม่ต้องรอ join code / subject_enrollments
      if (sec?.classroom_id) {
        const { data: studentsData } = await supabase
          .from("students")
          .select("id, prefix, first_name, last_name, seat_number, avatar_url")
.eq("classroom_id", sec.classroom_id)
.order("seat_number");
        setStudents((studentsData ?? []) as Student[]);
      }

      setLoading(false);
    })();
  }, [subjectId, sectionId]);

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
    if (!section?.id || !selectedDate) { setPeriods([]); setTimetableEntryId(""); return; }
    const res = await fetch(`/api/timetable/periods?subject_section_id=${section.id}&attendance_date=${selectedDate}`);
    const json = await res.json();
    const list = json.periods ?? [];
    setPeriods(list);
    setTimetableEntryId(list.length > 0 ? list[0].timetable_entry_id : "");
  })();
}, [section?.id, selectedDate]);

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

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !section) return "";
    return `${window.location.origin}/join/${section.join_code}`;
  }, [section]);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-black text-lg animate-pulse">กำลังโหลดรายชื่อ...</div>
      </div>
    );
  }
  if (!section || !subject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500 font-black">❌ ไม่พบข้อมูลห้องนี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {showQr && <QrCodeModal inviteUrl={inviteUrl} onClose={() => setShowQr(false)} />}

      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-4 pt-4 pb-6">
        <button onClick={() => router.push(`/smartclass/${subjectId}`)}
          className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-lg mb-3">←</button>
        <h1 className="text-xl font-black text-white leading-tight">{subject.name_th}</h1>
        <p className="text-white/70 text-sm font-bold">
          {subject.subject_code} · {classroom?.grade_group} {classroom?.room_name} · 👥 {students.length} คน
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-4">
          <div className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-white/70 text-xs font-bold">รหัสเข้าวิชา</span>
            <span className="font-black text-white font-mono tracking-widest">{section.join_code}</span>
          </div>
          <button onClick={copyInvite} className="px-3 py-2 rounded-xl bg-white text-emerald-700 font-black text-xs hover:bg-emerald-50">
            {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกลิงก์เชิญ"}
          </button>
          <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-black text-xs">
            📷 QR
          </button>
        </div>
      </div>

      <main className="p-4 max-w-4xl mx-auto">
        {tab === "roster" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-black text-slate-700 text-sm mb-4">👥 รายชื่อนักเรียน</h2>
            {students.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-3xl mb-2">📭</p>
                <p className="font-bold text-sm">ยังไม่มีนักเรียนในห้องนี้</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {students.map(s => (
                  <div key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-400 text-white text-xs font-black flex items-center justify-center">
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

        {tab === "attendance" && (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
    <div className="px-4 pt-4 flex items-center gap-2 flex-wrap">
      <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
        className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-emerald-400 focus:outline-none" />
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
    {periods.length === 0 ? (
      <div className="p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">🗓️</p>
        <p className="font-bold text-sm">วันนี้ไม่มีคาบเรียนวิชานี้ตามตารางสอน</p>
      </div>
    ) : (
      <AttendanceTool
        timetableEntryId={timetableEntryId} date={selectedDate} students={students} currentUserId={currentUserId}
        referenceMap={homeroomMap} referenceLabel="โฮมรูม"
      />
    )}
  </div>
)}
        {tab === "random" && <RandomPickerTab students={students} />}
        {tab === "tools" && <ToolsTab students={students} />}
      </main>

      {/* แท็บด้านล่าง */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-40">
        <div className="max-w-4xl mx-auto grid grid-cols-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-black ${
                tab === t.key ? "text-emerald-600" : "text-slate-400"
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}