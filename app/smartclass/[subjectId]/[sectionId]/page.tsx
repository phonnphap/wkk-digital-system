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
type ScorePreset = { id: string; label: string; points: number; emoji: string; sort_order: number };

type TabKey = "roster" | "attendance" | "random" | "tools";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "roster", label: "รายชื่อ", icon: "👥" },
  { key: "attendance", label: "เช็กชื่อ", icon: "✅" },
  { key: "random", label: "สุ่มชื่อ", icon: "🎲" },
  { key: "tools", label: "เครื่องมือ", icon: "🧰" },
];

// Fallback presets shown even before the teacher has saved any of their own
// (used purely client-side until the teacher actually taps one, at which
// point it gets written to score_presets so it becomes "real" and reusable).
const DEFAULT_PRESETS: Omit<ScorePreset, "id">[] = [
  { label: "Keep It Up", points: 1, emoji: "😌", sort_order: 0 },
  { label: "Good Job", points: 1, emoji: "😄", sort_order: 1 },
  { label: "Needs Improvement", points: -1, emoji: "😟", sort_order: 2 },
  { label: "Excellent", points: 1, emoji: "🙂", sort_order: 3 },
  { label: "Well Done", points: 1, emoji: "😎", sort_order: 4 },
];

// ชุดสีสดใส สบายตา สำหรับวนใช้เป็นพื้นหลังอวาตาร์ตัวอักษรของ นร. แต่ละคน
const AVATAR_GRADIENTS = [
  "from-teal-400 to-emerald-400",
  "from-sky-400 to-blue-400",
  "from-violet-400 to-purple-400",
  "from-amber-400 to-orange-400",
  "from-pink-400 to-rose-400",
  "from-cyan-400 to-teal-400",
  "from-fuchsia-400 to-pink-400",
  "from-lime-400 to-green-400",
];
function avatarGradient(seed: number) {
  return AVATAR_GRADIENTS[seed % AVATAR_GRADIENTS.length];
}

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

/* ---------------- การ์ดนักเรียน (ตามภาพต้นแบบ) ---------------- */

function StudentCard({
  student,
  index,
  score,
  selectMode,
  selected,
  onClick,
}: {
  student: Student;
  index: number;
  score: number;
  selectMode: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const gradient = avatarGradient(index);
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl border-2 bg-white pt-7 pb-4 px-3 text-center transition-all hover:shadow-lg hover:-translate-y-1 ${
        selected ? "border-teal-400 ring-4 ring-teal-100 bg-teal-50/40" : "border-slate-100 shadow-sm"
      }`}
    >
      {/* badge คะแนนรวม */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 min-w-[30px] h-7 px-2 rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 text-white text-xs font-black flex items-center justify-center shadow-md ring-2 ring-white">
        {score}
      </div>

      {/* จุดจับ / checkbox ตอนเลือกหลายคน */}
      {selectMode ? (
        <div
          className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black transition-colors ${
            selected ? "bg-teal-500 border-teal-500 text-white" : "border-slate-200 bg-white text-transparent"
          }`}
        >
          ✓
        </div>
      ) : (
        <span className="absolute top-2 right-2 text-slate-300 text-sm leading-none">⠿</span>
      )}

      {student.avatar_url ? (
        <img src={student.avatar_url} className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-white shadow" />
      ) : (
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${gradient} text-white text-2xl font-black flex items-center justify-center mx-auto shadow-inner`}>
          {student.first_name[0]}
        </div>
      )}

      {student.prefix && <p className="text-slate-400 text-[11px] font-bold mt-2">{student.prefix}</p>}
      <p className="text-slate-700 font-black text-sm mt-0.5 truncate">{student.first_name} {student.last_name}</p>
      <p className="text-teal-500 text-[11px] font-black">Number {student.seat_number}</p>
    </button>
  );
}

/* ---------------- ป๊อปอัพให้/หักคะแนน ---------------- */

function ScoreModal({
  students,
  presets,
  usageCounts,
  onClose,
  onGiveScore,
  onAddPreset,
}: {
  students: Student[];
  presets: ScorePreset[];
  usageCounts: Record<string, number>;
  onClose: () => void;
  onGiveScore: (preset: ScorePreset | null, customPoints?: number) => void;
  onAddPreset: (label: string, points: number, emoji: string) => void;
}) {
  const [customPoints, setCustomPoints] = useState(0);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPoints, setNewPoints] = useState(1);
  const [newEmoji, setNewEmoji] = useState("🙂");
  const single = students.length === 1 ? students[0] : null;

  function submitNewPreset() {
    if (!newLabel.trim()) return;
    onAddPreset(newLabel.trim(), newPoints, newEmoji);
    setNewLabel("");
    setNewPoints(1);
    setNewEmoji("🙂");
    setAddingPreset(false);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col sm:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* ซ้าย: ข้อมูลนักเรียน */}
        <div className="sm:w-52 shrink-0 bg-slate-50 p-5 flex flex-col items-center text-center border-b sm:border-b-0 sm:border-r border-slate-100">
          {single ? (
            <>
              <div className="w-full rounded-t-xl bg-gradient-to-r from-cyan-500 to-sky-400 text-white font-black text-sm py-1.5 mb-3 shadow">
                {usageCounts[single.id] ?? 0}
              </div>
              {single.avatar_url ? (
                <img src={single.avatar_url} className="w-20 h-20 rounded-full object-cover border-2 border-white shadow" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-400 text-white text-2xl font-black flex items-center justify-center shadow-inner">
                  {single.first_name[0]}
                </div>
              )}
              <p className="mt-3 text-slate-700 font-black text-sm">{single.first_name} {single.last_name}</p>
              <p className="text-teal-500 text-xs font-black">Number {single.seat_number}</p>
            </>
          ) : (
            <>
              <p className="text-4xl mb-2">👥</p>
              <p className="text-slate-700 font-black text-sm">เลือกไว้ {students.length} คน</p>
              <p className="text-slate-400 text-xs font-bold mt-1">คะแนนจะถูกให้กับทุกคนที่เลือก</p>
            </>
          )}
        </div>

        {/* ขวา: ให้คะแนน */}
        <div className="flex-1 p-5 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-slate-800 text-lg">Give Your Student A Score!</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {/* ปุ่มเพิ่มพรีเซ็ตใหม่ */}
            <button
              onClick={() => setAddingPreset(true)}
              className="rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-500 hover:bg-teal-50/60 flex flex-col items-center justify-center py-4 gap-1 transition-colors"
            >
              <span className="text-2xl leading-none">+</span>
            </button>

            {presets.map(p => (
              <button
                key={p.id}
                onClick={() => onGiveScore(p)}
                className="relative rounded-xl border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50/60 flex flex-col items-center justify-center py-4 gap-1 transition-colors"
              >
                <span
                  className={`absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center shadow ${
                    p.points >= 0 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                >
                  {p.points >= 0 ? `+${p.points}` : p.points}
                </span>
                <span className="text-2xl leading-none">{p.emoji}</span>
                <span className="text-[11px] font-black text-slate-600 text-center leading-tight px-1">{p.label}</span>
              </button>
            ))}
          </div>

          {addingPreset && (
            <div className="mt-4 rounded-xl border-2 border-teal-200 bg-teal-50/40 p-3 space-y-2">
              <p className="font-black text-teal-700 text-xs">เพิ่มการ์ดให้คะแนนใหม่</p>
              <div className="flex gap-2">
                <input
                  value={newEmoji}
                  onChange={e => setNewEmoji(e.target.value)}
                  className="w-12 text-center border-2 border-slate-200 rounded-lg py-1.5 text-lg bg-white"
                  maxLength={2}
                />
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="เช่น ตอบคำถาม, พูดคำหยาบ"
                  className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold bg-white"
                />
                <input
                  type="number"
                  value={newPoints}
                  onChange={e => setNewPoints(Number(e.target.value))}
                  className="w-16 border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center bg-white"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={submitNewPreset} className="flex-1 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-black text-xs">
                  บันทึกการ์ด
                </button>
                <button onClick={() => setAddingPreset(false)} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-500 font-black text-xs">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mt-5">
            <input
              type="number"
              value={customPoints}
              onChange={e => setCustomPoints(Number(e.target.value))}
              className="w-24 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-center"
            />
            <button
              onClick={() => onGiveScore(null, customPoints)}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-600 hover:to-sky-600 text-white font-black text-sm shadow"
            >
              Give Score ★
            </button>
          </div>
        </div>
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

  // --- คะแนน ---
  const [presets, setPresets] = useState<ScorePreset[]>([]);
  const [studentScores, setStudentScores] = useState<Record<string, number>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scoreTargets, setScoreTargets] = useState<Student[] | null>(null);

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

      // โหลดพรีเซ็ตคะแนนของวิชานี้ + ผลรวมคะแนนของแต่ละคน (ถ้ายังไม่มีตาราง จะเงียบและใช้ค่า default แทน)
      if (sec?.id) {
        try {
          const { data: presetRows } = await supabase
            .from("score_presets").select("id, label, points, emoji, sort_order")
            .eq("subject_section_id", sec.id).order("sort_order");
          if (presetRows && presetRows.length > 0) {
            setPresets(presetRows as ScorePreset[]);
          } else {
            setPresets(DEFAULT_PRESETS.map((p, i) => ({ ...p, id: `local-${i}` })));
          }

          const { data: eventRows } = await supabase
            .from("score_events").select("student_id, points")
            .eq("subject_section_id", sec.id);
          const totals: Record<string, number> = {};
          (eventRows ?? []).forEach((r: any) => { totals[r.student_id] = (totals[r.student_id] ?? 0) + r.points; });
          setStudentScores(totals);
        } catch {
          setPresets(DEFAULT_PRESETS.map((p, i) => ({ ...p, id: `local-${i}` })));
        }
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

  // --- helpers คะแนน ---
  function toggleSelectMode() {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
  }
  function toggleStudentSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds(prev => (prev.size === students.length ? new Set() : new Set(students.map(s => s.id))));
  }
  function handleCardClick(student: Student) {
    if (selectMode) {
      toggleStudentSelected(student.id);
    } else {
      setScoreTargets([student]);
    }
  }
  function openScoreForSelected() {
    const chosen = students.filter(s => selectedIds.has(s.id));
    if (chosen.length > 0) setScoreTargets(chosen);
  }

  async function handleGiveScore(preset: ScorePreset | null, customPoints?: number) {
    if (!scoreTargets || !section?.id) return;
    const points = preset ? preset.points : (customPoints ?? 0);
    if (points === 0) return;

    let presetId: string | null = preset?.id ?? null;
    // ถ้าเป็นพรีเซ็ตค่า default ที่ยังไม่เคยบันทึกลงฐานข้อมูล (id ขึ้นต้นด้วย local-) ให้บันทึกจริงก่อน
    if (preset && preset.id.startsWith("local-")) {
      try {
        const { data } = await supabase
          .from("score_presets")
          .insert({ subject_section_id: section.id, label: preset.label, points: preset.points, emoji: preset.emoji, sort_order: preset.sort_order })
          .select().maybeSingle();
        if (data) {
          presetId = data.id;
          setPresets(prev => prev.map(p => (p.id === preset.id ? (data as ScorePreset) : p)));
        }
      } catch {
        // เก็บ event ต่อได้แม้บันทึกพรีเซ็ตไม่สำเร็จ แค่ไม่ผูก preset_id
        presetId = null;
      }
    }

    const rows = scoreTargets.map(s => ({
      student_id: s.id,
      subject_section_id: section.id,
      preset_id: presetId,
      points,
      created_by: currentUserId || null,
    }));

    try {
      await supabase.from("score_events").insert(rows);
    } catch {
      // ถ้าตาราง score_events ยังไม่ถูกสร้าง ให้ยังอัปเดตหน้าจอไว้ก่อนเพื่อไม่บล็อกครู
    }

    setStudentScores(prev => {
      const next = { ...prev };
      scoreTargets.forEach(s => { next[s.id] = (next[s.id] ?? 0) + points; });
      return next;
    });
    setScoreTargets(null);
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleAddPreset(label: string, points: number, emoji: string) {
    if (!section?.id) return;
    try {
      const { data } = await supabase
        .from("score_presets")
        .insert({ subject_section_id: section.id, label, points, emoji, sort_order: presets.length })
        .select().maybeSingle();
      if (data) setPresets(prev => [...prev, data as ScorePreset]);
    } catch {
      setPresets(prev => [...prev, { id: `local-${prev.length}`, label, points, emoji, sort_order: prev.length }]);
    }
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
    <div className="min-h-screen bg-slate-50 pb-24">
      {showQr && <QrCodeModal inviteUrl={inviteUrl} onClose={() => setShowQr(false)} />}
      {scoreTargets && (
        <ScoreModal
          students={scoreTargets}
          presets={presets}
          usageCounts={studentScores}
          onClose={() => setScoreTargets(null)}
          onGiveScore={handleGiveScore}
          onAddPreset={handleAddPreset}
        />
      )}

      <div className="bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500 px-4 pt-4 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => router.push(`/smartclass/${subjectId}`)}
            title="กลับหน้ารายห้องของวิชานี้"
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-lg transition-colors">←</button>
          <button onClick={() => router.push("/dashboard")}
            title="กลับแดชบอร์ด"
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-lg transition-colors">🏠</button>
        </div>
        <h1 className="text-xl font-black text-white leading-tight drop-shadow-sm">{subject.name_th}</h1>
        <p className="text-white/80 text-sm font-bold">
          {subject.subject_code} · {classroom?.grade_group} {classroom?.room_name} · 👥 {students.length} คน
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-white/80 text-xs font-bold">รหัสเข้าวิชา</span>
            <span className="font-black text-white font-mono tracking-widest">{section.join_code}</span>
          </div>
          <button onClick={copyInvite} className="px-3 py-2 rounded-xl bg-white text-teal-700 font-black text-xs hover:bg-amber-50 shadow-sm transition-colors">
            {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกลิงก์เชิญ"}
          </button>
          <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-black text-xs transition-colors">
            📷 QR
          </button>
        </div>
      </div>

      <main className={`p-4 lg:p-6 mx-auto w-full ${tab === "roster" ? "max-w-[1600px]" : "max-w-4xl"}`}>
        {tab === "roster" && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 w-full">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
              <h2 className="font-black text-slate-700 text-sm flex items-center gap-1.5">👥 รายชื่อนักเรียน</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {selectMode && (
                  <button onClick={toggleSelectAll} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors">
                    {selectedIds.size === students.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
                  </button>
                )}
                {selectMode && selectedIds.size > 0 && (
                  <button onClick={openScoreForSelected} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-600 hover:to-sky-600 text-white font-black text-xs shadow-sm transition-colors">
                    ⭐ ให้คะแนนที่เลือก ({selectedIds.size})
                  </button>
                )}
                <button
                  onClick={toggleSelectMode}
                  className={`px-3 py-1.5 rounded-lg font-black text-xs shadow-sm transition-colors ${
                    selectMode ? "bg-teal-500 hover:bg-teal-600 text-white" : "bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200"
                  }`}
                >
                  {selectMode ? "✓ กำลังเลือกการ์ด" : "เลือกการ์ดนักเรียน"}
                </button>
              </div>
            </div>

            {students.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-3xl mb-2">📭</p>
                <p className="font-bold text-sm">ยังไม่มีนักเรียนในห้องนี้</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
                {students.map((s, i) => (
                  <StudentCard
                    key={s.id}
                    student={s}
                    index={i}
                    score={studentScores[s.id] ?? 0}
                    selectMode={selectMode}
                    selected={selectedIds.has(s.id)}
                    onClick={() => handleCardClick(s)}
                  />
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