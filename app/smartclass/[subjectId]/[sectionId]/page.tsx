"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AttendanceTool from "@/components/attendance/AttendanceTool";
import AssignmentsTool from "@/components/assignments/AssignmentsTool";
import AttendanceOverviewTool from "@/components/attendance/AttendanceOverviewTool";
import GradeOverviewTool from "@/components/attendance/GradeOverviewTool";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };
type SectionRow = { id: string; join_code: string; classroom_id: string };
type Student = { id: string; prefix?: string; first_name: string; last_name: string; nick_name?: string; seat_number: number; avatar_url?: string };
type ScorePreset = { id: string; label: string; points: number; emoji: string; sort_order: number };

type TabKey = "roster" | "attendance" | "random" | "tools";
type BannerMenuKey = "assignments" | "attendanceInfo" | "totalScore" | "settings";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "roster", label: "รายชื่อ", icon: "👥" },
  { key: "attendance", label: "เช็กชื่อ", icon: "✅" },
  { key: "random", label: "สุ่มชื่อ", icon: "🎲" },
  { key: "tools", label: "เครื่องมือ", icon: "🧰" },
];

const BANNER_MENU: { key: BannerMenuKey; label: string; icon: string }[] = [
  { key: "assignments", label: "มอบหมายงาน", icon: "📌" },
  { key: "attendanceInfo", label: "ข้อมูลเช็กชื่อ", icon: "🗓️" },
  { key: "totalScore", label: "คะแนนรวม", icon: "⭐" },
  { key: "settings", label: "ตั้งค่ารายวิชา", icon: "⚙️" },
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

// อีโมจิที่เลือกใช้บ่อยสำหรับการ์ดให้คะแนน
const EMOJI_CHOICES = [
  "🙂", "😄", "😆", "😎", "🤩", "😍", "🥳", "👍", "👏", "💯",
  "⭐", "🌟", "🏆", "🎉", "✅", "💪", "🔥", "😌", "🤝", "📚",
  "😟", "😢", "😠", "👎", "⚠️", "🙄", "😴", "🤫", "❌", "🚫",
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-12 h-11 text-center border-2 border-slate-200 rounded-lg text-lg bg-white hover:border-fuchsia-300"
      >
        {value}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-xl p-2 grid grid-cols-6 gap-1">
            {EMOJI_CHOICES.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => { onChange(e); setOpen(false); }}
                className="text-lg rounded-lg hover:bg-fuchsia-50 py-1"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
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
        selected ? "border-fuchsia-400 ring-4 ring-fuchsia-100 bg-fuchsia-50/40" : "border-slate-100 shadow-sm"
      }`}
    >
      {/* badge คะแนนรวม */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 min-w-[30px] h-7 px-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white text-xs font-black flex items-center justify-center shadow-md ring-2 ring-white">
        {score}
      </div>

      {/* checkbox ตอนเลือกหลายคน */}
      {selectMode && (
        <div
          className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black transition-colors ${
            selected ? "bg-fuchsia-500 border-fuchsia-500 text-white" : "border-slate-200 bg-white text-transparent"
          }`}
        >
          ✓
        </div>
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
      {student.nick_name && <p className="text-slate-400 text-[11px] font-bold mt-0.5">({student.nick_name})</p>}
      <p className="text-fuchsia-500 text-[11px] font-black">เลขที่ {student.seat_number}</p>
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
  onDeletePreset,
}: {
  students: Student[];
  presets: ScorePreset[];
  usageCounts: Record<string, number>;
  onClose: () => void;
  onGiveScore: (preset: ScorePreset | null, customPoints?: number) => void;
  onAddPreset: (label: string, points: number, emoji: string) => void;
  onDeletePreset: (presetId: string) => void;
}) {
  const [customPoints, setCustomPoints] = useState(0);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPoints, setNewPoints] = useState(1);
  const [newEmoji, setNewEmoji] = useState("🙂");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
const presetToDelete = presets.find(p => p.id === confirmDeleteId) ?? null;
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
              <div className="w-full rounded-t-xl bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white font-black text-sm py-1.5 mb-3 shadow">
                {usageCounts[single.id] ?? 0}
              </div>
              {single.avatar_url ? (
                <img src={single.avatar_url} className="w-20 h-20 rounded-full object-cover border-2 border-white shadow" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-400 text-white text-2xl font-black flex items-center justify-center shadow-inner">
                  {single.first_name[0]}
                </div>
              )}
              <p className="mt-3 text-slate-700 font-black text-sm">{single.first_name} {single.last_name}</p>
              {single.nick_name && <p className="text-slate-400 text-[11px] font-bold mt-0.5">({single.nick_name})</p>}
              <p className="text-fuchsia-500 text-xs font-black">เลขที่ {single.seat_number}</p>
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
              className="rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-500 hover:bg-fuchsia-50/60 flex flex-col items-center justify-center py-4 gap-1 transition-colors"
            >
              <span className="text-2xl leading-none">+</span>
            </button>

            {presets.map(p => (
              <div
                key={p.id}
                className="group relative rounded-xl border-2 border-slate-200 hover:border-fuchsia-400 hover:bg-fuchsia-50/60 flex flex-col items-center justify-center py-4 gap-1 transition-colors"
              >
                <button
  type="button"
  onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
  title="ลบการ์ดนี้"
  className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-400 hover:bg-red-500 hover:border-red-500 hover:text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow"
>
  🗑
</button>
                <span
                  className={`absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center shadow ${
                    p.points >= 0 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                >
                  {p.points >= 0 ? `+${p.points}` : p.points}
                </span>
                <button onClick={() => onGiveScore(p)} className="flex flex-col items-center gap-1 w-full">
                  <span className="text-2xl leading-none">{p.emoji}</span>
                  <span className="text-[11px] font-black text-slate-600 text-center leading-tight px-1">{p.label}</span>
                </button>
              </div>
            ))}
          </div>

          {addingPreset && (
            <div className="mt-4 rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-2">
              <p className="font-black text-fuchsia-700 text-xs">เพิ่มการ์ดให้คะแนนใหม่</p>
              <div className="flex gap-2">
                <EmojiPicker value={newEmoji} onChange={setNewEmoji} />
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
                <button onClick={submitNewPreset} className="flex-1 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-black text-xs">
                  บันทึกการ์ด
                </button>
                <button onClick={() => setAddingPreset(false)} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-500 font-black text-xs">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
          {presetToDelete && (
  <div
    className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
    onClick={() => setConfirmDeleteId(null)}
  >
    <div
      className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 text-center"
      onClick={e => e.stopPropagation()}
    >
      <p className="text-3xl mb-2">{presetToDelete.emoji}</p>
      <h4 className="font-black text-slate-800 text-sm mb-1">ลบการ์ด "{presetToDelete.label}"?</h4>
      <p className="text-slate-400 text-xs font-bold mb-4">การ์ดนี้จะถูกลบออกจากรายการให้คะแนนถาวร</p>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirmDeleteId(null)}
          className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm"
        >
          ยกเลิก
        </button>
        <button
          onClick={() => {
            onDeletePreset(presetToDelete.id);
            setConfirmDeleteId(null);
          }}
          className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm"
        >
          ลบเลย
        </button>
      </div>
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
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white font-black text-sm shadow"
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

type RandomMode = "circle" | "slide" | "card";

type WheelEntry = {
  id: string;
  label: string;
  first_name: string;
  avatar_url?: string;
};

const WHEEL_COLORS = [
  "#f472b6", "#a78bfa", "#38bdf8", "#4ade80",
  "#facc15", "#fb923c", "#f87171", "#2dd4bf",
];

const MODE_INFO: Record<RandomMode, { label: string; icon: string }> = {
  circle: { label: "วงเวียน", icon: "🎡" },
  slide: { label: "สไลด์", icon: "🃏" },
  card: { label: "การ์ด", icon: "🗂️" },
};

function buildEntries(students: Student[]): WheelEntry[] {
  return students.map(s => ({
    id: s.id,
    label: `${s.seat_number}. ${s.first_name} ${s.last_name}`,
    first_name: s.first_name,
    avatar_url: s.avatar_url,
  }));
}

/* ---------------- แท็บ สุ่มชื่อ (หลัก) ---------------- */

function RandomPickerTab({ students }: { students: Student[] }) {
  const [mode, setMode] = useState<RandomMode>("circle");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [entries, setEntries] = useState<WheelEntry[]>(() => buildEntries(students));
  const [editing, setEditing] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [winner, setWinner] = useState<WheelEntry | null>(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    setEntries(buildEntries(students));
    setRemovedIds(new Set());
    setWinner(null);
  }, [students]);

  const pool = useMemo(() => entries.filter(e => !removedIds.has(e.id)), [entries, removedIds]);

  function updateLabel(id: string, label: string) {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, label } : e)));
  }
  function deleteEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    setRemovedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
  function moveEntry(id: string, dir: -1 | 1) {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }
  function shuffleOrderAuto() {
    setEntries(prev => {
      const copy = [...prev];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
  }
  function addEntry() {
    const label = window.prompt("พิมพ์ชื่อที่ต้องการเพิ่มเข้าวงล้อ");
    if (!label?.trim()) return;
    setEntries(prev => [...prev, { id: `custom-${Date.now()}`, label: label.trim(), first_name: label.trim() }]);
  }
  function resetEntries() {
    setEntries(buildEntries(students));
    setRemovedIds(new Set());
    setWinner(null);
  }
  function removeWinnerFromPool() {
    if (!winner) return;
    setRemovedIds(prev => new Set(prev).add(winner.id));
    setWinner(null);
  }
  function keepWinnerInPool() {
    setWinner(null);
  }

  return (
    <div className="space-y-3">
      {/* แถบควบคุมบาง ๆ ด้านบน: เมนูเลือกโหมด + แก้ไขรายชื่อ */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="relative">
          <button
            onClick={() => setModeMenuOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-black text-sm"
          >
            <span className="text-lg">{MODE_INFO[mode].icon}</span>
            {MODE_INFO[mode].label}
            <span className="text-xs">▾</span>
          </button>
          {modeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
              <div className="absolute z-20 top-full left-0 mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-xl p-1.5">
                {(Object.keys(MODE_INFO) as RandomMode[]).map(k => (
                  <button
                    key={k}
                    onClick={() => { setMode(k); setWinner(null); setModeMenuOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-black text-left transition-colors ${
                      mode === k ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-lg">{MODE_INFO[k].icon}</span>{MODE_INFO[k].label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-bold hidden sm:inline">เหลือ {pool.length}/{entries.length} คน</span>
          <button
            onClick={() => setEditing(v => !v)}
            className={`px-3 py-1.5 rounded-lg font-black text-xs transition-colors ${
              editing ? "bg-fuchsia-500 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            ✏️ {editing ? "เสร็จแล้ว" : "แก้ไขรายชื่อ"}
          </button>
          <button onClick={resetEntries} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-black text-xs">
            ↺ รีเซ็ต
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="font-black text-slate-700 text-sm">จัดการรายชื่อในวงล้อ</p>
            <div className="flex gap-2">
              <button onClick={shuffleOrderAuto} className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-black text-xs">
                🔀 สลับตำแหน่งอัตโนมัติ
              </button>
              <button onClick={addEntry} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs">
                + เพิ่มชื่อ
              </button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  removedIds.has(e.id) ? "bg-slate-50 border-slate-100 opacity-50" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col">
                  <button onClick={() => moveEntry(e.id, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-20 text-xs leading-none">▲</button>
                  <button onClick={() => moveEntry(e.id, 1)} disabled={i === entries.length - 1} className="text-slate-400 disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
                <input
                  value={e.label}
                  onChange={ev => updateLabel(e.id, ev.target.value)}
                  className="flex-1 text-sm font-bold border-0 focus:outline-none focus:ring-1 focus:ring-fuchsia-300 rounded px-1.5 py-1"
                />
                {removedIds.has(e.id) && (
                  <button
                    onClick={() => setRemovedIds(prev => { const n = new Set(prev); n.delete(e.id); return n; })}
                    className="text-[10px] font-black text-emerald-500 whitespace-nowrap"
                  >
                    คืนเข้ารายการ
                  </button>
                )}
                <button onClick={() => deleteEntry(e.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* พื้นที่เกมสุ่ม — ขยายเกือบเต็มพื้นที่ที่มี */}
      <div className="min-h-[65vh] flex items-center justify-center">
        {mode === "circle" && (
          <WheelPicker pool={pool} spinning={spinning} setSpinning={setSpinning} setWinner={setWinner} />
        )}
        {mode === "slide" && (
          <SlidePicker pool={pool} spinning={spinning} setSpinning={setSpinning} setWinner={setWinner} />
        )}
        {mode === "card" && (
          <CardPicker pool={pool} spinning={spinning} setSpinning={setSpinning} setWinner={setWinner} />
        )}
      </div>

      {/* ป๊อปอัพผลการสุ่ม กลางจอ */}
      {winner && !spinning && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={keepWinnerInPool}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-5xl mb-3">🎉</p>
            {winner.avatar_url ? (
              <img src={winner.avatar_url} className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-emerald-300 mb-3" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 text-white text-3xl font-black flex items-center justify-center mx-auto mb-3">
                {winner.first_name[0]}
              </div>
            )}
            <p className="text-2xl font-black text-slate-800">{winner.label}</p>
            <p className="text-slate-400 text-xs font-bold mt-1">คือคนที่ถูกสุ่มเลือก</p>
            <div className="flex gap-2 mt-6">
              <button onClick={keepWinnerInPool} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-sm">
                เก็บไว้ในรายชื่อ
              </button>
              <button onClick={removeWinnerFromPool} className="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-sm">
                🗑 เอาออกจากรายชื่อ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- โหมดวงเวียน (SVG spinning wheel) ---------------- */

function WheelPicker({
  pool, spinning, setSpinning, setWinner,
}: {
  pool: WheelEntry[];
  spinning: boolean;
  setSpinning: (v: boolean) => void;
  setWinner: (w: WheelEntry | null) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const size = 460;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  const n = pool.length;
  const segAngle = n > 0 ? 360 / n : 0;

  function polar(angleDeg: number, radius: number): [number, number] {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }

  function spin() {
    if (spinning || n === 0) return;
    setSpinning(true);
    setWinner(null);
    const winIdx = Math.floor(Math.random() * n);
    const targetMid = winIdx * segAngle + segAngle / 2;
    const remainder = (360 - targetMid) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    let delta = remainder - currentMod;
    if (delta <= 0) delta += 360;
    const extraSpins = 6;
    const newRotation = rotation + extraSpins * 360 + delta;
    setRotation(newRotation);
    window.setTimeout(() => {
      setWinner(pool[winIdx]);
      setSpinning(false);
    }, 4200);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 flex flex-col items-center gap-6 w-full max-w-3xl">
      {n === 0 ? (
        <p className="text-slate-400 font-bold text-sm py-10">ไม่มีนักเรียนในรายการ</p>
      ) : (
        <div className="relative" style={{ width: size, height: size, maxWidth: "100%" }}>
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 text-4xl drop-shadow" style={{ transform: "translateX(-50%) rotate(180deg)" }}>
            🔻
          </div>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${size} ${size}`}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4s cubic-bezier(0.17,0.67,0.12,0.99)" : "none",
            }}
          >
            {pool.map((e, i) => {
              const startAngle = i * segAngle;
              const endAngle = (i + 1) * segAngle;
              const [x1, y1] = polar(startAngle, r);
              const [x2, y2] = polar(endAngle, r);
              const largeArc = segAngle > 180 ? 1 : 0;
              const midAngle = startAngle + segAngle / 2;
              const [tx, ty] = polar(midAngle, r * 0.64);
              return (
                <g key={e.id}>
                  <path
                    d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={WHEEL_COLORS[i % WHEEL_COLORS.length]}
                    stroke="white"
                    strokeWidth={2}
                  />
                  <text
                    x={tx}
                    y={ty}
                    fontSize={13}
                    fontWeight={900}
                    fill="white"
                    textAnchor="middle"
                    transform={`rotate(${midAngle}, ${tx}, ${ty})`}
                  >
                    {e.label.length > 14 ? e.label.slice(0, 13) + "…" : e.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <button
            onClick={spin}
            disabled={spinning}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white border-4 border-fuchsia-400 shadow-lg font-black text-fuchsia-600 text-sm disabled:opacity-60"
          >
            {spinning ? "..." : "หมุน"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- โหมดสไลด์ (การ์ดเลื่อนไปด้านข้าง) ---------------- */

function SlidePicker({
  pool, spinning, setSpinning, setWinner,
}: {
  pool: WheelEntry[];
  spinning: boolean;
  setSpinning: (v: boolean) => void;
  setWinner: (w: WheelEntry | null) => void;
}) {
  const [speed, setSpeed] = useState<"slow" | "fast">("slow");
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const CARD_W = 120, GAP = 14, STEP = CARD_W + GAP, REPEATS = 10;

  const track = useMemo(() => Array.from({ length: REPEATS }, () => pool).flat(), [pool]);

  function spin() {
    if (spinning || pool.length === 0) return;
    setSpinning(true);
    setWinner(null);
    const winIdx = Math.floor(Math.random() * pool.length);
    const occurrence = pool.length * (REPEATS - 2) + winIdx;
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const center = containerWidth / 2;
    const targetOffset = -(occurrence * STEP + CARD_W / 2 - center);
    setOffset(targetOffset);
    const duration = speed === "fast" ? 1800 : 4000;
    window.setTimeout(() => {
      setWinner(pool[winIdx]);
      setSpinning(false);
    }, duration);
  }

  function restart() {
    setOffset(0);
    setWinner(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => setSpeed("slow")} className={`px-4 py-2 rounded-lg font-black text-sm ${speed === "slow" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>ช้า</button>
          <button onClick={() => setSpeed("fast")} className={`px-4 py-2 rounded-lg font-black text-sm ${speed === "fast" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>ไว</button>
        </div>
        <button onClick={restart} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 font-black text-xs">↺ เริ่มใหม่</button>
      </div>

      <div className="relative h-44 overflow-hidden rounded-xl bg-slate-50" ref={containerRef}>
        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-emerald-400 z-10 -translate-x-1/2" />
        <div
          className="absolute inset-y-0 left-0 flex items-center gap-3.5 px-2"
          style={{
            transform: `translateX(${offset}px)`,
            transition: spinning ? `transform ${speed === "fast" ? 1.8 : 4}s cubic-bezier(0.15,0.65,0.15,1)` : "none",
          }}
        >
          {track.map((e, i) => (
            <div key={i} style={{ width: CARD_W }} className="shrink-0 h-36 rounded-xl border-2 border-slate-200 bg-white flex flex-col items-center justify-center text-center px-1">
              {e.avatar_url ? (
                <img src={e.avatar_url} className="w-14 h-14 rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-blue-400 text-white text-lg font-black flex items-center justify-center">
                  {e.first_name[0]}
                </div>
              )}
              <p className="text-xs font-black text-slate-600 mt-2 truncate w-full">{e.label}</p>
            </div>
          ))}
        </div>
      </div>

      {pool.length === 0 && <p className="text-center text-slate-400 text-sm font-bold mt-3">ไม่มีนักเรียนในรายการ</p>}

      <button
        onClick={spin}
        disabled={spinning || pool.length === 0}
        className="w-full mt-5 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-lg"
      >
        {spinning ? "กำลังสุ่ม..." : "🃏 สุ่มชื่อ"}
      </button>
    </div>
  );
}

/* ---------------- โหมดการ์ด (สับไพ่ / เปิดไพ่) ---------------- */

function CardPicker({
  pool, spinning, setSpinning, setWinner,
}: {
  pool: WheelEntry[];
  spinning: boolean;
  setSpinning: (v: boolean) => void;
  setWinner: (w: WheelEntry | null) => void;
}) {
  const [displayList, setDisplayList] = useState<WheelEntry[]>(pool);
  const [flippedId, setFlippedId] = useState<string | null>(null);

  useEffect(() => {
    setDisplayList(pool);
    setFlippedId(null);
  }, [pool]);

  function shuffle() {
    if (spinning) return;
    setFlippedId(null);
    setWinner(null);
    setDisplayList(prev => [...prev].sort(() => Math.random() - 0.5));
  }

  function reveal() {
    if (spinning || pool.length === 0) return;
    setSpinning(true);
    setWinner(null);
    setFlippedId(null);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    let ticks = 0;
    const iv = setInterval(() => {
      setDisplayList(prev => [...prev].sort(() => Math.random() - 0.5));
      ticks++;
      if (ticks >= 6) {
        clearInterval(iv);
        setFlippedId(pick.id);
        setTimeout(() => {
          setWinner(pick);
          setSpinning(false);
        }, 700);
      }
    }, 200);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 w-full">
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 mb-5">
        {displayList.map(e => {
          const isFlipped = flippedId === e.id;
          return (
            <div key={e.id} className="relative h-28" style={{ perspective: "600px" }}>
              <div
                className="absolute inset-0 rounded-xl transition-transform duration-500"
                style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                {/* หลังไพ่ (เบลอ) */}
                <div
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-fuchsia-400 to-purple-400 flex items-center justify-center text-white text-3xl"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  🎴
                </div>
                {/* หน้าไพ่ */}
                <div
                  className="absolute inset-0 rounded-xl bg-white border-2 border-emerald-300 flex flex-col items-center justify-center px-1"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  {e.avatar_url ? (
                    <img src={e.avatar_url} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-400 text-white text-sm font-black flex items-center justify-center">
                      {e.first_name[0]}
                    </div>
                  )}
                  <p className="text-[10px] font-black text-slate-600 mt-1 truncate w-full text-center">{e.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pool.length === 0 && <p className="text-center text-slate-400 text-sm font-bold py-6">ไม่มีนักเรียนในรายการ</p>}

      <div className="flex gap-3">
        <button
          onClick={shuffle}
          disabled={spinning || pool.length === 0}
          className="flex-1 py-4 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 font-black"
        >
          🔀 สับไพ่
        </button>
        <button
          onClick={reveal}
          disabled={spinning || pool.length === 0}
          className="flex-1 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black"
        >
          {spinning ? "กำลังเปิดไพ่..." : "🎴 เปิดไพ่"}
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

/* ---------------- แท็บ คะแนนรวม (จากเมนูมุมซ้ายล่างของแบนเนอร์) ---------------- */

function TotalScoreTab({ students, studentScores }: { students: Student[]; studentScores: Record<string, number> }) {
  const sorted = [...students].sort((a, b) => (studentScores[b.id] ?? 0) - (studentScores[a.id] ?? 0));
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
      <h2 className="font-black text-slate-700 text-sm flex items-center gap-1.5 mb-4">⭐ คะแนนรวมของนักเรียน</h2>
      {sorted.length === 0 ? (
        <p className="text-center text-slate-400 font-bold text-sm py-8">ยังไม่มีนักเรียนในวิชานี้</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <span className="w-6 text-center text-xs font-black text-slate-300">{i + 1}</span>
              {s.avatar_url ? (
                <img src={s.avatar_url} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(i)} text-white text-xs font-black flex items-center justify-center`}>
                  {s.first_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-700 truncate">{s.first_name} {s.last_name}</p>
                <p className="text-[11px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white text-xs font-black shrink-0">
                {studentScores[s.id] ?? 0} คะแนน
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- แท็บ ตั้งค่ารายวิชา (จากเมนูมุมซ้ายล่างของแบนเนอร์) ---------------- */

function SubjectSettingsTab({ subject, classroom }: { subject: Subject | null; classroom: Classroom | null }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
      <h2 className="font-black text-slate-700 text-sm flex items-center gap-1.5 mb-4">⚙️ ตั้งค่ารายวิชา</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-[10px] font-black text-slate-400">รหัสวิชา</p>
          <p className="text-sm font-black text-slate-700 mt-0.5">{subject?.subject_code ?? "-"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-[10px] font-black text-slate-400">ชื่อวิชา</p>
          <p className="text-sm font-black text-slate-700 mt-0.5">{subject?.name_th ?? "-"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-[10px] font-black text-slate-400">ห้องเรียน</p>
          <p className="text-sm font-black text-slate-700 mt-0.5">{classroom?.grade_group} {classroom?.room_name}</p>
        </div>
      </div>
      <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400">
        <p className="text-2xl mb-1">🚧</p>
        <p className="font-bold text-xs">ฟีเจอร์ตั้งค่ารายวิชา (แก้ไขชื่อวิชา / ลบวิชา / จัดการผู้ช่วยสอน ฯลฯ) จะเปิดใช้งานเร็ว ๆ นี้</p>
      </div>
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
  const [bannerMenu, setBannerMenu] = useState<BannerMenuKey | null>(null);
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
  const [academicYearLabel, setAcademicYearLabel] = useState("");
const [homeroomTeacherName, setHomeroomTeacherName] = useState("");
const [subjectTeacherName, setSubjectTeacherName] = useState("");

useEffect(() => {
  (async () => {
    if (!section) return;

    // ปีการศึกษา — ใช้ academic_year_id จาก subject_sections (ต้อง select เพิ่มตอนโหลด section)
    // ครูประจำชั้น — จาก classrooms.homeroom_teacher_id
    // ครูประจำวิชา — จาก subject_sections.teacher_id
    // ตัวอย่าง query รวม (ปรับ path ตามจริง):
    const { data: sectionFull } = await supabase
      .from("subject_sections")
      .select("academic_year_id, teacher_id")
      .eq("id", section.id)
      .maybeSingle();

    if (sectionFull?.academic_year_id) {
      const { data: year } = await supabase
        .from("academic_years")
        .select("year_name, semester")
        .eq("id", sectionFull.academic_year_id)
        .maybeSingle();
      if (year) setAcademicYearLabel(`${year.year_name} ภาคเรียนที่ ${year.semester}`);
    }
    if (sectionFull?.teacher_id) {
      const { data: t } = await supabase
        .from("users").select("full_name, first_name, last_name")
        .eq("id", sectionFull.teacher_id).maybeSingle();
      if (t) setSubjectTeacherName(t.full_name || `${t.first_name} ${t.last_name}`);
    }
    if (classroom) {
      const { data: room } = await supabase
        .from("classrooms").select("homeroom_teacher_id").eq("id", classroom.id).maybeSingle();
      if (room?.homeroom_teacher_id) {
        const { data: t } = await supabase
          .from("users").select("full_name, first_name, last_name")
          .eq("id", room.homeroom_teacher_id).maybeSingle();
        if (t) setHomeroomTeacherName(t.full_name || `${t.first_name} ${t.last_name}`);
      }
    }
  })();
}, [section, classroom]);

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
  .select("id, prefix, first_name, last_name, nick_name, seat_number, avatar_url")
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

  // --- เมนูมุมซ้ายล่างของแบนเนอร์ ---
  function handleBannerMenuClick(key: BannerMenuKey) {
  setBannerMenu(key);
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

  async function handleDeletePreset(presetId: string) {
  const removed = presets.find(p => p.id === presetId) ?? null;
  setPresets(prev => prev.filter(p => p.id !== presetId)); // ซ่อนออกจาก UI ทันที (optimistic)

  if (presetId.startsWith("local-")) return; // ยังไม่เคยบันทึกลง DB จริง ไม่ต้องยิง API

  try {
    const res = await fetch("/api/score-presets/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset_id: presetId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "ลบการ์ดไม่สำเร็จ");
    }
  } catch (e: any) {
    // ลบไม่สำเร็จจริง ๆ -> คืนการ์ดกลับมาแสดง ไม่ให้ UI กับฐานข้อมูลเพี้ยนกัน
    if (removed) setPresets(prev => [...prev, removed].sort((a, b) => a.sort_order - b.sort_order));
    alert("ลบการ์ดไม่สำเร็จ: " + (e?.message ?? "unknown error"));
  }
}

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-['TH_Sarabun_New',_sans-serif]">
        <div className="text-fuchsia-500 font-black text-lg animate-pulse">กำลังโหลดรายชื่อ...</div>
      </div>
    );
  }
  if (!section || !subject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-['TH_Sarabun_New',_sans-serif]">
        <p className="text-red-500 font-black">❌ ไม่พบข้อมูลห้องนี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-['TH_Sarabun_New',_sans-serif]">
      {showQr && <QrCodeModal inviteUrl={inviteUrl} onClose={() => setShowQr(false)} />}
      {scoreTargets && (
        <ScoreModal
          students={scoreTargets}
          presets={presets}
          usageCounts={studentScores}
          onClose={() => setScoreTargets(null)}
          onGiveScore={handleGiveScore}
          onAddPreset={handleAddPreset}
          onDeletePreset={handleDeletePreset}
        />
      )}

      <div className="bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/dashboard")}
              title="กลับแดชบอร์ด"
              className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-lg transition-colors">🏠</button>
            <button onClick={() => router.push(`/smartclass/${subjectId}`)}
              title="กลับหน้ารายห้องของวิชานี้"
              className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-lg transition-colors">←</button>
          </div>
          <div className="w-9 sm:hidden" />
        </div>

        <div className="text-center px-2">
          <h1 className="text-xl font-black text-white leading-tight drop-shadow-sm">{subject.name_th}</h1>
          <p className="text-white/80 text-sm font-bold">
            {subject.subject_code} · {classroom?.grade_group} {classroom?.room_name} · 👥 {students.length} คน
          </p>
        </div>

        {/* แถวรวม: เมนูมุมซ้าย (มอบหมายงาน/ข้อมูลเช็กชื่อ/คะแนนรวม/ตั้งค่ารายวิชา) + ฝั่งขวา (รหัสเข้าวิชา/คัดลอกลิงก์/QR) */}
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-between mt-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {BANNER_MENU.map(m => (
              <button
                key={m.key}
                onClick={() => handleBannerMenuClick(m.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs backdrop-blur-sm transition-colors ${
                  bannerMenu === m.key
                    ? "bg-white text-fuchsia-700 shadow-sm"
                    : "bg-white/20 hover:bg-white/30 text-white"
                }`}
              >
                <span>{m.icon}</span>{m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-white/80 text-xs font-bold">รหัสเข้าวิชา</span>
              <span className="font-black text-white font-mono tracking-widest">{section.join_code}</span>
            </div>
            <button onClick={copyInvite} className="px-3 py-2 rounded-xl bg-white text-fuchsia-700 font-black text-xs hover:bg-pink-50 shadow-sm transition-colors">
              {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกลิงก์เชิญ"}
            </button>
            <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-black text-xs transition-colors">
              📷 QR
            </button>
          </div>
        </div>
      </div>

        <main className={`p-4 lg:p-6 mx-auto w-full ${
  bannerMenu === "assignments" ? "max-w-[1600px]"
  : tab === "roster" || tab === "attendance" ? "max-w-[1600px]"
  : tab === "random" ? "max-w-[1900px]"
  : "max-w-4xl"
}`}>
        {bannerMenu === "assignments" && section && (
          <AssignmentsTool sectionId={section.id} subjectId={subjectId} students={students} currentUserId={currentUserId} />
        )}
        {bannerMenu === "totalScore" && section && (
  <GradeOverviewTool
    sectionId={section.id}
    subjectTitle={subject.name_th}
    subjectCode={subject.subject_code}
    students={students}
    classroomLabel={`${classroom?.grade_group ?? ""} ${classroom?.room_name ?? ""}`}
    // ค่าด้านล่างนี้ยังไม่มีตัวแปรจริงในหน้า page.tsx ปัจจุบัน ต้องเพิ่ม fetch เอง (ดูข้อ 5)
    academicYearLabel={academicYearLabel}
    homeroomTeacherName={homeroomTeacherName}
    subjectTeacherName={subjectTeacherName}
  />
)}
        {bannerMenu === "attendanceInfo" && section && (
  <AttendanceOverviewTool
    sectionId={section.id}
    subjectTitle={subject.name_th}
    subjectCode={subject.subject_code}
    joinCode={section.join_code}
    students={students}
    onCreateNew={() => {
      setBannerMenu(null);
      setTab("attendance");
    }}
    onOpenSettings={() => setBannerMenu("settings")}
    onOpenDate={(date) => {
      setSelectedDate(date);
      setBannerMenu(null);
      setTab("attendance");
    }}
  />
)}
        {!bannerMenu && tab === "roster" && (
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
                  <button onClick={openScoreForSelected} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white font-black text-xs shadow-sm transition-colors">
                    ⭐ ให้คะแนนที่เลือก ({selectedIds.size})
                  </button>
                )}
                <button
                  onClick={toggleSelectMode}
                  className={`px-3 py-1.5 rounded-lg font-black text-xs shadow-sm transition-colors ${
                    selectMode ? "bg-fuchsia-500 hover:bg-fuchsia-600 text-white" : "bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200"
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
              <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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

        {!bannerMenu && tab === "attendance" && (
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
        {!bannerMenu && tab === "random" && <RandomPickerTab students={students} />}
        {!bannerMenu && tab === "tools" && <ToolsTab students={students} />}
      </main>

      {/* แท็บด้านล่าง */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-40">
        <div className="max-w-4xl mx-auto grid grid-cols-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setBannerMenu(null); setTab(t.key); }}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-black ${
                !bannerMenu && tab === t.key ? "text-fuchsia-600" : "text-slate-400"
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