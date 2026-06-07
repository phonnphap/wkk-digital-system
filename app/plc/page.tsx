"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Thai date helpers ────────────────────────────────────────────────────────
function toThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
function fullName(u: any) {
  if (!u) return "—";
  if (u.full_name) return u.full_name;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "—";
}

// ─── Subject group config ─────────────────────────────────────────────────────
type SubGroup = {
  key: string;
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
  bgLight: string;
  icon: string;
  match: string[];
};

type SubjectGroup = {
  key: string;
  label: string;
  icon: string;
  color: string;
  subGroups: SubGroup[];
};

const SUBJECT_GROUPS: SubjectGroup[] = [
  {
    key: "thai", label: "ภาษาไทย", icon: "📖", color: "rose",
    subGroups: [
      { key: "thai_primary", label: "ภาษาไทย ประถม", color: "bg-rose-500", textColor: "text-rose-700", borderColor: "border-rose-300", bgLight: "bg-rose-50", icon: "📗", match: ["ภาษาไทย", "thai", "ประถม"] },
      { key: "thai_secondary", label: "ภาษาไทย มัธยม", color: "bg-rose-700", textColor: "text-rose-900", borderColor: "border-rose-400", bgLight: "bg-rose-100", icon: "📘", match: ["ภาษาไทย", "thai", "มัธยม"] },
    ],
  },
  {
    key: "math", label: "คณิตศาสตร์", icon: "🔢", color: "blue",
    subGroups: [
      { key: "math_primary", label: "คณิตศาสตร์ ประถม", color: "bg-blue-500", textColor: "text-blue-700", borderColor: "border-blue-300", bgLight: "bg-blue-50", icon: "🔢", match: ["คณิต", "math", "ประถม"] },
      { key: "math_secondary", label: "คณิตศาสตร์ มัธยม", color: "bg-blue-700", textColor: "text-blue-900", borderColor: "border-blue-400", bgLight: "bg-blue-100", icon: "📐", match: ["คณิต", "math", "มัธยม"] },
    ],
  },
  {
    key: "science", label: "วิทยาศาสตร์", icon: "🔬", color: "emerald",
    subGroups: [
      { key: "science_primary", label: "วิทยาศาสตร์ ประถม", color: "bg-emerald-500", textColor: "text-emerald-700", borderColor: "border-emerald-300", bgLight: "bg-emerald-50", icon: "🌿", match: ["วิทยาศาสตร์", "science", "ประถม"] },
      { key: "science_secondary", label: "วิทยาศาสตร์ มัธยม", color: "bg-emerald-700", textColor: "text-emerald-900", borderColor: "border-emerald-400", bgLight: "bg-emerald-100", icon: "🔬", match: ["วิทยาศาสตร์", "science", "มัธยม"] },
      { key: "computer", label: "คอมพิวเตอร์", color: "bg-emerald-700", textColor: "text-emerald-900", borderColor: "border-emerald-400", bgLight: "bg-emerald-100", icon: "💻", match: ["คอมพิวเตอร์", "computer"] },
    ],
  },
  {
    key: "social", label: "สังคมศึกษา", icon: "🌏", color: "amber",
    subGroups: [
      { key: "social_all", label: "สังคมศึกษา", color: "bg-amber-500", textColor: "text-amber-700", borderColor: "border-amber-300", bgLight: "bg-amber-50", icon: "🌏", match: ["สังคม", "social"] },
    ],
  },
  {
    key: "english", label: "ภาษาต่างประเทศ", icon: "🌐", color: "sky",
    subGroups: [
      { key: "english_primary", label: "ภาษาต่างประเทศ ประถม", color: "bg-sky-500", textColor: "text-sky-700", borderColor: "border-sky-300", bgLight: "bg-sky-50", icon: "🇬🇧", match: ["ภาษาต่างประเทศ", "english", "ประถม"] },
      { key: "english_secondary", label: "ภาษาต่างประเทศ มัธยม", color: "bg-sky-700", textColor: "text-sky-900", borderColor: "border-sky-400", bgLight: "bg-sky-100", icon: "🌐", match: ["ภาษาต่างประเทศ", "english", "มัธยม"] },
    ],
  },
  {
    key: "pe", label: "สุขศึกษาและพลศึกษา", icon: "⚽", color: "orange",
    subGroups: [
      { key: "pe_all", label: "สุขศึกษาและพลศึกษา", color: "bg-orange-500", textColor: "text-orange-700", borderColor: "border-orange-300", bgLight: "bg-orange-50", icon: "⚽", match: ["พลศึกษา", "สุขศึกษา", "pe"] },
    ],
  },
  {
    key: "arts", label: "ศิลปะ", icon: "🎨", color: "purple",
    subGroups: [
      { key: "arts_all", label: "ศิลปะ", color: "bg-purple-500", textColor: "text-purple-700", borderColor: "border-purple-300", bgLight: "bg-purple-50", icon: "🎨", match: ["ศิลปะ", "art"] },
    ],
  },
  {
    key: "career", label: "การงานอาชีพ", icon: "🔧", color: "teal",
    subGroups: [
      { key: "career_all", label: "การงานอาชีพ", color: "bg-teal-500", textColor: "text-teal-700", borderColor: "border-teal-300", bgLight: "bg-teal-50", icon: "🔧", match: ["การงาน", "อาชีพ", "career"] },
    ],
  },
];

const ALL_SUBGROUPS = SUBJECT_GROUPS.flatMap(g => g.subGroups);

function getSubGroupForTeacher(teacher: any): string {
  const pos = ((teacher.position ?? "") + " " + (teacher.department_name ?? "")).toLowerCase();
  for (const sg of ALL_SUBGROUPS) {
    const matchWords = sg.match.map(m => m.toLowerCase());
    if (matchWords.every(w => pos.includes(w))) return sg.key;
  }
  return "other";
}

function getSubjectGroupForTeacher(teacher: any): string {
  const sgKey = getSubGroupForTeacher(teacher);
  for (const g of SUBJECT_GROUPS) {
    if (g.subGroups.some(sg => sg.key === sgKey)) return g.key;
  }
  return "other";
}

// ─── Types ────────────────────────────────────────────────────────────────────
type UserProfile = { id: string; first_name?: string; last_name?: string; full_name?: string; email: string; role: string; position?: string; };
type Teacher = UserProfile & { subGroupKey: string; subjectGroupKey: string };
type AcademicYear = { id: string; name: string; year: number };
type PLCMeeting = {
  id: string;
  meeting_number?: number;
  meeting_date: string;
  start_time?: string;
  end_time?: string;
  title: string;
  topic?: string;
  duration_hours: number;
  facilitator_id: string;
  participants: string[];
  academic_year_id: string;
  location?: string;
  // Report fields
  problem_description?: string;
  objectives?: string;
  methods?: string;
  results?: string;
  solutions?: string;
  reflections?: string;
  future_development?: string;
  image_urls?: string[];
  status?: "draft" | "submitted";
  created_at?: string;
  facilitator?: any;
};

const TARGET_HOURS = 50;
const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head"];

// ─── Progress ring ─────────────────────────────────────────────────────────────
function RingProgress({ pct, size = 56, stroke = 6, color = "#3b82f6" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct / 100, 1));
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset .6s ease" }} />
    </svg>
  );
}

function HourBadge({ hours, target = TARGET_HOURS }: { hours: number; target?: number }) {
  const pct = (hours / target) * 100;
  const color = pct >= 100 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                pct >= 60  ? "text-amber-600 bg-amber-50 border-amber-200" :
                             "text-red-600 bg-red-50 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black border ${color}`}>
      {hours} <span className="font-normal opacity-70">/ {target} ชม.</span>
    </span>
  );
}

// ─── Report Detail Modal ───────────────────────────────────────────────────────
function ReportDetailModal({ meeting, allTeachers, onClose, onEdit, onDelete, canEdit }: {
  meeting: PLCMeeting;
  allTeachers: Teacher[];
  onClose: () => void;
  onEdit: (m: PLCMeeting) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const participants = allTeachers.filter(t => meeting.participants?.includes(t.id));
  const facilitator = allTeachers.find(t => t.id === meeting.facilitator_id);

  const sections = [
    { label: "สภาพปัญหา", value: meeting.problem_description, icon: "⚠️" },
    { label: "วัตถุประสงค์", value: meeting.objectives, icon: "🎯" },
    { label: "วิธีการดำเนินการ", value: meeting.methods, icon: "📋" },
    { label: "ผลที่เกิดขึ้น", value: meeting.results, icon: "✨" },
    { label: "แนวทางแก้ไขปัญหา", value: meeting.solutions, icon: "🔧" },
    { label: "การสะท้อนผล", value: meeting.reflections, icon: "🪞" },
    { label: "แนวทางการพัฒนาต่อ", value: meeting.future_development, icon: "🚀" },
  ];

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-black px-2 py-1 rounded-lg border ${
                meeting.status === "submitted"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}>
                {meeting.status === "submitted" ? "✅ ส่งแล้ว" : "📝 ร่าง"}
              </span>
              {meeting.meeting_number && (
                <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">ครั้งที่ {meeting.meeting_number}</span>
              )}
            </div>
            <h3 className="font-black text-slate-800 text-lg leading-tight">{meeting.title}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              <span>📅 {toThaiDate(meeting.meeting_date)}</span>
              {meeting.start_time && meeting.end_time && (
                <span>🕐 {meeting.start_time} – {meeting.end_time}</span>
              )}
              {meeting.location && <span>📍 {meeting.location}</span>}
              <span>⏱️ {meeting.duration_hours} ชม.</span>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg shrink-0">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Facilitator + Participants */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-blue-500 mb-1">วิทยากร / ผู้นำ</p>
              <p className="font-bold text-slate-800 text-sm">{facilitator ? fullName(facilitator) : "—"}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-slate-500 mb-1">ผู้เข้าร่วม ({participants.length} คน)</p>
              <div className="flex flex-wrap gap-1">
                {participants.slice(0, 5).map(t => (
                  <span key={t.id} className="text-xs bg-white border border-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded-lg">{fullName(t)}</span>
                ))}
                {participants.length > 5 && <span className="text-xs text-slate-400">+{participants.length - 5}</span>}
              </div>
            </div>
          </div>

          {/* Report sections */}
          {sections.map(s => s.value ? (
            <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-slate-500 mb-1.5 flex items-center gap-1.5">
                <span>{s.icon}</span>{s.label}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{s.value}</p>
            </div>
          ) : null)}

          {/* Images */}
          {meeting.image_urls && meeting.image_urls.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-500 mb-2 flex items-center gap-1.5">📷 รูปภาพการประชุม</p>
              <div className="grid grid-cols-3 gap-2">
                {meeting.image_urls.map((url, i) => (
                  <img key={i} src={url} alt={`meeting-${i+1}`}
                    className="w-full h-24 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(url, "_blank")} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="border-t border-slate-100 px-6 py-4 flex gap-2 shrink-0 bg-slate-50 rounded-b-3xl">
            <button onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-100 flex items-center gap-1.5">
              🖨️ พิมพ์
            </button>
            <button onClick={() => { onClose(); onEdit(meeting); }}
              className="px-4 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-black text-sm hover:bg-blue-100 flex items-center gap-1.5">
              ✏️ แก้ไข
            </button>
            <button onClick={() => { if (confirm("ยืนยันการลบ?")) { onDelete(meeting.id); onClose(); } }}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm hover:bg-red-100 flex items-center gap-1.5">
              🗑️ ลบ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meeting Modal (Add/Edit) ─────────────────────────────────────────────────
function MeetingModal({
  meeting, allTeachers, academicYears, currentUserId, onSave, onClose,
}: {
  meeting: Partial<PLCMeeting> | null;
  allTeachers: Teacher[];
  academicYears: AcademicYear[];
  currentUserId: string;
  onSave: (data: any, isDraft: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!meeting?.id;
  const [date,        setDate]        = useState(meeting?.meeting_date ?? new Date().toISOString().slice(0, 10));
  const [startTime,   setStartTime]   = useState(meeting?.start_time ?? "08:30");
  const [endTime,     setEndTime]     = useState(meeting?.end_time ?? "12:30");
  const [meetingNo,   setMeetingNo]   = useState<number | "">(meeting?.meeting_number ?? "");
  const [title,       setTitle]       = useState(meeting?.title ?? "");
  const [topic,       setTopic]       = useState(meeting?.topic ?? "");
  const [hours,       setHours]       = useState<number>(meeting?.duration_hours ?? 1);
  const [location,    setLocation]    = useState(meeting?.location ?? "");
  const [facilId,     setFacilId]     = useState(meeting?.facilitator_id ?? currentUserId);
  const [yearId,      setYearId]      = useState(meeting?.academic_year_id ?? academicYears[0]?.id ?? "");
  const [selected,    setSelected]    = useState<string[]>(meeting?.participants ?? [currentUserId]);
  // Report fields
  const [problem,     setProblem]     = useState(meeting?.problem_description ?? "");
  const [objectives,  setObjectives]  = useState(meeting?.objectives ?? "");
  const [methods,     setMethods]     = useState(meeting?.methods ?? "");
  const [results,     setResults]     = useState(meeting?.results ?? "");
  const [solutions,   setSolutions]   = useState(meeting?.solutions ?? "");
  const [reflections, setReflections] = useState(meeting?.reflections ?? "");
  const [futuredev,   setFuturedev]   = useState(meeting?.future_development ?? "");
  const [images,      setImages]      = useState<string[]>(meeting?.image_urls ?? []);
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [tab,         setTab]         = useState<"basic" | "report">("basic");

  // Auto-calc hours from time
  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const diff = (eh * 60 + em - sh * 60 - sm) / 60;
      if (diff > 0) setHours(Math.round(diff * 2) / 2);
    }
  }, [startTime, endTime]);

  const filtered = allTeachers.filter(t =>
    fullName(t).toLowerCase().includes(search.toLowerCase()) ||
    (t.position ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggleTeacher(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const path = `plc-images/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("plc").upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from("plc").getPublicUrl(path);
        setImages(prev => [...prev, data.publicUrl]);
      }
    }
  }

  async function handleSave(isDraft: boolean) {
    if (!date || !title || !hours || !yearId) { alert("กรุณากรอกข้อมูลให้ครบ"); return; }
    setLoading(true);
    await onSave({
      meeting_date: date,
      start_time: startTime,
      end_time: endTime,
      meeting_number: meetingNo === "" ? null : meetingNo,
      title,
      topic,
      duration_hours: hours,
      location,
      facilitator_id: facilId,
      participants: selected,
      academic_year_id: yearId,
      problem_description: problem,
      objectives,
      methods,
      results,
      solutions,
      reflections,
      future_development: futuredev,
      image_urls: images,
      status: isDraft ? "draft" : "submitted",
    }, isDraft);
    setLoading(false);
  }

  const inputCls = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none focus:bg-white transition-colors";
  const textareaCls = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:border-blue-400 focus:outline-none focus:bg-white resize-none transition-colors";
  const labelCls = "block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-lg">{isEdit ? "✏️ แก้ไขการประชุม" : "➕ บันทึกชั่วโมง PLC"}</h3>
            <p className="text-slate-400 text-xs mt-0.5">กรอกข้อมูลการประชุมกลุ่ม PLC</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0 px-6">
          {[
            { key: "basic", label: "📋 ข้อมูลพื้นฐาน" },
            { key: "report", label: "📝 รายงาน PLC" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-3 text-sm font-black border-b-2 transition-all ${
                tab === t.key ? "border-blue-500 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {tab === "basic" && (
            <>
              {/* Date + Meeting No */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>วันที่ประชุม *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ครั้งที่</label>
                  <input type="number" min="1" value={meetingNo} onChange={e => setMeetingNo(e.target.value === "" ? "" : +e.target.value)}
                    placeholder="1" className={inputCls} />
                </div>
              </div>

              {/* Start-End Time + Hours */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>เวลาเริ่ม</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>เวลาสิ้นสุด</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ชั่วโมง *</label>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setHours(h => Math.max(0.5, +(h - 0.5).toFixed(1)))}
                      className="w-9 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-black text-slate-600 transition-colors shrink-0">−</button>
                    <input type="number" min="0.5" max="8" step="0.5" value={hours} onChange={e => setHours(+e.target.value)}
                      className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2.5 text-slate-800 text-sm font-black text-center focus:border-blue-400 focus:outline-none transition-colors" />
                    <button type="button" onClick={() => setHours(h => Math.min(8, +(h + 0.5).toFixed(1)))}
                      className="w-9 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-black text-slate-600 transition-colors shrink-0">+</button>
                  </div>
                </div>
              </div>

              {/* Academic year */}
              <div>
                <label className={labelCls}>ปีการศึกษา *</label>
                <select value={yearId} onChange={e => setYearId(e.target.value)} className={inputCls}>
                  {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className={labelCls}>ชื่อการประชุม / กิจกรรม *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="เช่น PLC กลุ่มสาระภาษาไทย ครั้งที่ 1" className={inputCls} />
              </div>

              {/* Topic */}
              <div>
                <label className={labelCls}>หัวข้อ / ประเด็น</label>
                <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="เช่น การออกแบบกิจกรรมการเรียนรู้เชิงรุก" className={inputCls} />
              </div>

              {/* Location + Facilitator */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>สถานที่</label>
                  <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="ห้องประชุม..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>วิทยากร / ผู้นำ</label>
                  <select value={facilId} onChange={e => setFacilId(e.target.value)} className={inputCls}>
                    {allTeachers.map(t => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
                  </select>
                </div>
              </div>

              {/* Participants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls}>ผู้เข้าร่วม ({selected.length} คน)</label>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setSelected(allTeachers.map(t => t.id))}
                      className="text-xs font-black text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50">เลือกทั้งหมด</button>
                    <button type="button" onClick={() => setSelected([])}
                      className="text-xs font-black text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100">ล้าง</button>
                  </div>
                </div>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="🔍 ค้นหาชื่อครู..." className={`${inputCls} mb-2`} />
                <div className="border-2 border-slate-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {filtered.map(t => {
                    const checked = selected.includes(t.id);
                    return (
                      <button key={t.id} type="button" onClick={() => toggleTeacher(t.id)}
                        className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition-colors ${checked ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"}`}>
                          {checked && <span className="text-white text-xs font-black">✓</span>}
                        </div>
                        <span className={`font-bold flex-1 ${checked ? "text-blue-700" : "text-slate-700"}`}>{fullName(t)}</span>
                        {t.position && <span className="text-slate-400 text-xs">{t.position}</span>}
                      </button>
                    );
                  })}
                  {filtered.length === 0 && <div className="text-center py-6 text-slate-400 text-sm">ไม่พบ</div>}
                </div>
              </div>
            </>
          )}

          {tab === "report" && (
            <>
              {[
                { label: "⚠️ สภาพปัญหา", placeholder: "ระบุปัญหาหรือความท้าทายที่พบในการจัดการเรียนการสอน...", value: problem, set: setProblem },
                { label: "🎯 วัตถุประสงค์", placeholder: "ระบุวัตถุประสงค์ของการประชุม PLC ครั้งนี้...", value: objectives, set: setObjectives },
                { label: "📋 วิธีการดำเนินการ", placeholder: "อธิบายกระบวนการ/กิจกรรมที่ดำเนินการในการประชุม...", value: methods, set: setMethods },
                { label: "✨ ผลที่เกิดขึ้น", placeholder: "ระบุผลลัพธ์ที่เกิดขึ้นจากการประชุม...", value: results, set: setResults },
                { label: "🔧 แนวทางแก้ไขปัญหา", placeholder: "แนวทางหรือมาตรการที่ตกลงร่วมกันในการแก้ปัญหา...", value: solutions, set: setSolutions },
                { label: "🪞 การสะท้อนผล", placeholder: "สะท้อนสิ่งที่ได้เรียนรู้และข้อค้นพบจากการประชุม...", value: reflections, set: setReflections },
                { label: "🚀 แนวทางการพัฒนาต่อ", placeholder: "แผนหรือแนวทางที่จะนำไปพัฒนาต่อในครั้งถัดไป...", value: futuredev, set: setFuturedev },
              ].map(f => (
                <div key={f.label}>
                  <label className={labelCls}>{f.label}</label>
                  <textarea value={f.value} onChange={e => f.set(e.target.value)} rows={3}
                    placeholder={f.placeholder} className={textareaCls} />
                </div>
              ))}

              {/* Image upload */}
              <div>
                <label className={labelCls}>📷 แนบรูปการประชุม</label>
                <label className="flex items-center gap-3 cursor-pointer bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl px-4 py-3 transition-colors">
                  <span className="text-2xl">📁</span>
                  <div>
                    <p className="font-bold text-slate-600 text-sm">คลิกเพื่อเลือกรูปภาพ</p>
                    <p className="text-slate-400 text-xs">JPG, PNG ขนาดไม่เกิน 5MB</p>
                  </div>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                </label>
                {images.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {images.map((url, i) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="w-full h-16 object-cover rounded-lg border border-slate-200" />
                        <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center font-black">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0 bg-white rounded-b-3xl">
          <button onClick={onClose}
            className="px-4 py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50 transition-all">
            ยกเลิก
          </button>
          <button onClick={() => handleSave(true)} disabled={loading || !title || !date || !yearId}
            className="flex-1 py-3 rounded-2xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> : "📝 ร่างรายงาน"}
          </button>
          <button onClick={() => handleSave(false)} disabled={loading || !title || !date || !yearId}
            className="flex-[2] py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (isEdit ? "💾 บันทึกการแก้ไข" : "✅ บันทึกและส่ง")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SubGroup Panel ────────────────────────────────────────────────────────────
function SubGroupPanel({
  subGroup, teachers, meetings, onAddMeeting, onEdit, onDelete, canEdit, targetHours, isAdmin,
}: {
  subGroup: SubGroup;
  teachers: Teacher[];
  meetings: PLCMeeting[];
  onAddMeeting: (subGroupKey: string) => void;
  onEdit: (m: PLCMeeting) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  targetHours: number;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewMeeting, setViewMeeting] = useState<PLCMeeting | null>(null);

  const totalHours = meetings.reduce((s, m) => {
    const hasTeacher = teachers.some(t => m.participants?.includes(t.id));
    return hasTeacher ? s + Number(m.duration_hours) : s;
  }, 0);

  const pct = (totalHours / targetHours) * 100;
  const ringColor = pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#3b82f6";

  return (
    <>
      {viewMeeting && (
        <ReportDetailModal
          meeting={viewMeeting}
          allTeachers={teachers}
          onClose={() => setViewMeeting(null)}
          onEdit={(m) => { setViewMeeting(null); onEdit(m); }}
          onDelete={(id) => { onDelete(id); setViewMeeting(null); }}
          canEdit={canEdit}
        />
      )}

      <div className={`border-2 ${subGroup.borderColor} ${subGroup.bgLight} rounded-2xl overflow-hidden`}>
        <button className="w-full px-5 py-4 flex items-center gap-4 text-left hover:brightness-95 transition-all"
          onClick={() => setExpanded(!expanded)}>
          <div className="relative shrink-0">
            <RingProgress pct={pct} size={52} stroke={5} color={ringColor} />
            <span className="absolute inset-0 flex items-center justify-center text-lg">{subGroup.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-black text-sm ${subGroup.textColor}`}>{subGroup.label}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-slate-500 text-xs font-bold">{teachers.length} คน · {meetings.length} ครั้ง</span>
              <HourBadge hours={totalHours} target={targetHours} />
            </div>
          </div>
          <div className="hidden sm:block w-24">
            <div className="h-2 bg-white/70 rounded-full overflow-hidden border border-white">
              <div className={`h-full ${subGroup.color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <p className="text-[10px] font-black text-slate-500 mt-1 text-right">{Math.round(pct)}%</p>
          </div>
          <span className={`${subGroup.textColor} text-sm shrink-0`}>{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="border-t border-white/60">
            {/* Teachers */}
            {isAdmin && teachers.length > 0 && (
              <div className="px-5 py-3 border-b border-white/50">
                <p className="text-xs font-black text-slate-500 mb-2">สมาชิกในกลุ่ม</p>
                <div className="flex flex-wrap gap-1.5">
                  {teachers.map(t => {
                    const tHours = meetings.reduce((s, m) => m.participants?.includes(t.id) ? s + Number(m.duration_hours) : s, 0);
                    return (
                      <div key={t.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
                        <span className="text-slate-700 font-bold text-xs">{fullName(t)}</span>
                        <HourBadge hours={tHours} target={targetHours} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Report table */}
            <div className="px-5 py-4">
              {meetings.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">ยังไม่มีการประชุม</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/80">
                        <th className="text-left pb-2 text-xs font-black text-slate-400">ครั้งที่</th>
                        <th className="text-left pb-2 text-xs font-black text-slate-400">วันที่</th>
                        <th className="text-left pb-2 text-xs font-black text-slate-400">ชื่อ/หัวข้อ</th>
                        <th className="text-center pb-2 text-xs font-black text-slate-400">ชม.</th>
                        <th className="text-center pb-2 text-xs font-black text-slate-400">สถานะ</th>
                        <th className="text-center pb-2 text-xs font-black text-slate-400">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/60">
                      {meetings.map(m => (
                        <tr key={m.id} className="hover:bg-white/50 transition-colors">
                          <td className="py-2.5 pr-3 text-center">
                            <span className="text-xs font-black text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                              {m.meeting_number ?? "—"}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-slate-600 font-bold whitespace-nowrap">{toThaiDate(m.meeting_date)}</td>
                          <td className="py-2.5 pr-3">
                            <p className="font-bold text-slate-700 text-xs line-clamp-1">{m.title}</p>
                            {m.topic && <p className="text-slate-400 text-[10px] line-clamp-1">{m.topic}</p>}
                          </td>
                          <td className="py-2.5 pr-3 text-center">
                            <span className="font-black text-blue-600 text-xs">{m.duration_hours}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-center">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                              m.status === "submitted"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {m.status === "submitted" ? "✅ ส่งแล้ว" : "📝 ร่าง"}
                            </span>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setViewMeeting(m)}
                                className="text-[10px] font-black text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                                👁️ ดู
                              </button>
                              {canEdit && (
                                <>
                                  <button onClick={() => onEdit(m)}
                                    className="text-[10px] font-black text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                                    ✏️
                                  </button>
                                  <button onClick={() => onDelete(m.id)}
                                    className="text-[10px] font-black text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canEdit && (
                <button onClick={() => onAddMeeting(subGroup.key)}
                  className={`mt-3 w-full py-3 rounded-xl border-2 border-dashed ${subGroup.borderColor} ${subGroup.textColor} font-black text-sm hover:brightness-95 transition-all`}>
                  ➕ บันทึกชั่วโมง PLC
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── All Reports Modal ─────────────────────────────────────────────────────────
function AllReportsModal({ meetings, allTeachers, academicYears, selectedYearId, onClose, onEdit, onDelete, canEdit }: {
  meetings: PLCMeeting[];
  allTeachers: Teacher[];
  academicYears: AcademicYear[];
  selectedYearId: string;
  onClose: () => void;
  onEdit: (m: PLCMeeting) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "submitted">("all");
  const [viewMeeting, setViewMeeting] = useState<PLCMeeting | null>(null);

  const yearName = academicYears.find(y => y.id === selectedYearId)?.name ?? "";

  const filtered = meetings.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.topic ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const submitted = meetings.filter(m => m.status === "submitted").length;
  const draft = meetings.filter(m => m.status === "draft").length;
  const totalHours = meetings.reduce((s, m) => s + Number(m.duration_hours), 0);

  return (
    <>
      {viewMeeting && (
        <ReportDetailModal
          meeting={viewMeeting}
          allTeachers={allTeachers}
          onClose={() => setViewMeeting(null)}
          onEdit={(m) => { setViewMeeting(null); onClose(); onEdit(m); }}
          onDelete={(id) => { onDelete(id); setViewMeeting(null); }}
          canEdit={canEdit}
        />
      )}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-black text-slate-800 text-lg">📊 รายงานทั้งหมด</h3>
              <p className="text-slate-400 text-xs mt-0.5">ปีการศึกษา {yearName}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">✕</button>
          </div>

          {/* Summary */}
          <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-3 gap-3 shrink-0">
            {[
              { label: "ชั่วโมงรวม", value: totalHours, unit: "ชม.", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
              { label: "ส่งแล้ว", value: submitted, unit: "ครั้ง", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
              { label: "ร่าง", value: draft, unit: "ครั้ง", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl px-4 py-3 text-center`}>
                <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
                <div className="text-xs text-slate-400 font-bold">{c.unit} · {c.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="px-6 py-3 border-b border-slate-100 flex gap-3 shrink-0 flex-wrap">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 ค้นหา..."
              className="flex-1 min-w-[180px] bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none" />
            <div className="flex gap-1.5">
              {(["all", "submitted", "draft"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-black border-2 transition-all ${
                    statusFilter === s ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}>
                  {s === "all" ? "ทั้งหมด" : s === "submitted" ? "✅ ส่งแล้ว" : "📝 ร่าง"}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-y-auto flex-1 px-6 py-4">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">ไม่พบรายการ</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-3 text-xs font-black text-slate-400">ครั้งที่</th>
                      <th className="text-left pb-3 text-xs font-black text-slate-400">วันที่</th>
                      <th className="text-left pb-3 text-xs font-black text-slate-400">ชื่อ / หัวข้อ</th>
                      <th className="text-center pb-3 text-xs font-black text-slate-400">ชม.</th>
                      <th className="text-center pb-3 text-xs font-black text-slate-400">สถานะ</th>
                      <th className="text-center pb-3 text-xs font-black text-slate-400">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-3 text-center">
                          <span className="text-xs font-black text-slate-500 bg-slate-100 rounded-lg px-2 py-0.5">{m.meeting_number ?? "—"}</span>
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-600 font-bold whitespace-nowrap">{toThaiDate(m.meeting_date)}</td>
                        <td className="py-3 pr-3">
                          <p className="font-bold text-slate-800 text-sm line-clamp-1">{m.title}</p>
                          {m.topic && <p className="text-slate-400 text-xs line-clamp-1">{m.topic}</p>}
                        </td>
                        <td className="py-3 pr-3 text-center">
                          <span className="font-black text-blue-600">{m.duration_hours}</span>
                        </td>
                        <td className="py-3 pr-3 text-center">
                          <span className={`text-xs font-black px-2 py-1 rounded-lg border ${
                            m.status === "submitted"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {m.status === "submitted" ? "✅ ส่งแล้ว" : "📝 ร่าง"}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setViewMeeting(m)}
                              className="text-xs font-black text-blue-500 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">👁️ ดู</button>
                            {canEdit && (
                              <>
                                <button onClick={() => { onClose(); onEdit(m); }}
                                  className="text-xs font-black text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">✏️</button>
                                <button onClick={() => { if (confirm("ยืนยันลบ?")) onDelete(m.id); }}
                                  className="text-xs font-black text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PLCHoursPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<UserProfile | null>(null);
  const [allTeachers,    setAllTeachers]    = useState<Teacher[]>([]);
  const [academicYears,  setAcademicYears]  = useState<AcademicYear[]>([]);
  const [meetings,       setMeetings]       = useState<PLCMeeting[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [loading,        setLoading]        = useState(true);
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editMeeting,    setEditMeeting]    = useState<Partial<PLCMeeting> | null>(null);
  const [activeGroup,    setActiveGroup]    = useState<string>("all");
  const [targetHours,    setTargetHours]    = useState(TARGET_HOURS);
  const [showReports,    setShowReports]    = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const meta = authUser.user_metadata ?? {};
      const claims = meta.custom_claims ?? {};
      const email = authUser.email || meta.email || meta.preferred_username || meta.upn || claims.email || claims.preferred_username || "";

      let profileData: any = null;
      const byAuthId = await supabase.from("users")
        .select("id, first_name, last_name, email, role, position")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (byAuthId.data) {
        profileData = byAuthId.data;
      } else if (email) {
        const byEmail = await supabase.from("users")
          .select("id, first_name, last_name, email, role, position")
          .eq("email", email)
          .maybeSingle();
        profileData = byEmail.data;
        if (profileData) {
          await (supabase.from("users") as any)
            .update({ auth_id: authUser.id })
            .eq("id", profileData.id);
        }
      }

      if (profileData) {
        setUser({ ...profileData, full_name: profileData.full_name || `${profileData.first_name ?? ""} ${profileData.last_name ?? ""}`.trim() });
      }

      const { data: years } = await supabase
        .from("academic_years")
        .select("id, name, year")
        .order("year", { ascending: false });
      const ys = (years as AcademicYear[]) || [];
      setAcademicYears(ys);
      if (ys.length > 0) setSelectedYearId(ys[0].id);

      const teacherRoles = ["homeroom_teacher", "subject_teacher"];
      const staffRoles   = ["teacher", "staff"];
      const [res1, res2] = await Promise.all([
        supabase.from("users").select("id, first_name, last_name, email, role, position").in("role", teacherRoles),
        supabase.from("users").select("id, first_name, last_name, email, role, position").in("role", staffRoles),
      ]);
      const combined = [...(res1.data || []), ...(res2.data || [])];
      const teachers: Teacher[] = combined.map((t: any) => ({
        ...t,
        full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
        subGroupKey: getSubGroupForTeacher(t),
        subjectGroupKey: getSubjectGroupForTeacher(t),
      }));
      setAllTeachers(teachers);
      setLoading(false);
    };
    init();
  }, []);
  
  const isAdmin = !!(user?.role && ADMIN_ROLES.includes(user.role));
  const isTeacher = !isAdmin;
  
  const mySubjectGroupKey = useMemo(() => {
    if (!user || isAdmin) return null;
    const me = allTeachers.find(t => t.id === user.id);
    return me?.subjectGroupKey ?? null;
  }, [user, allTeachers, isAdmin]);

  const mySubGroupKey = useMemo(() => {
    if (!user || isAdmin) return null;
    const me = allTeachers.find(t => t.id === user.id);
    return me?.subGroupKey ?? null;
  }, [user, allTeachers, isAdmin]);

  const loadMeetings = useCallback(async () => {
    if (!selectedYearId) return;

    let query = supabase
      .from("plc_meetings")
      .select("*")
      .eq("academic_year_id", selectedYearId)
      .order("meeting_date", { ascending: false });

    // ถ้าไม่ใช่ Admin ให้ดึงเฉพาะข้อมูลที่เกี่ยวข้องกับกลุ่มสาระตัวเอง
    if (!isAdmin && mySubjectGroupKey) {
      query = query.eq("subject_group_key", mySubjectGroupKey);
    }

    const { data, error } = await query;
    if (error) console.error("Error loading meetings:", error);
    setMeetings((data as PLCMeeting[]) || []);
  }, [selectedYearId, isAdmin, mySubjectGroupKey]);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  // Filter subject groups visible to this user
  const visibleGroups = useMemo(() => {
    if (isAdmin) return SUBJECT_GROUPS;
    if (!mySubjectGroupKey) return [];
    return SUBJECT_GROUPS.filter(g => g.key === mySubjectGroupKey);
  }, [isAdmin, mySubjectGroupKey]);

  const subGroupMeetings = useMemo(() => {
    const map: Record<string, PLCMeeting[]> = {};
    ALL_SUBGROUPS.forEach(sg => { map[sg.key] = []; });
    map["other"] = [];
    meetings.forEach(m => {
      const participants = allTeachers.filter(t => m.participants?.includes(t.id));
      const keys = new Set(participants.map(t => t.subGroupKey));
      if (keys.size === 0) { map["other"] = [...(map["other"] || []), m]; return; }
      keys.forEach(k => { map[k] = [...(map[k] || []), m]; });
    });
    return map;
  }, [meetings, allTeachers]);

  const subGroupTeachers = useMemo(() => {
    const map: Record<string, Teacher[]> = {};
    ALL_SUBGROUPS.forEach(sg => { map[sg.key] = allTeachers.filter(t => t.subGroupKey === sg.key); });
    map["other"] = allTeachers.filter(t => t.subGroupKey === "other");
    return map;
  }, [allTeachers]);

  const { schoolStats, myStats } = useMemo(() => {
  // สถิติทั้งโรงเรียน (รวมทั้งหมด)
  const totalSchoolHours = meetings.reduce((sum, m) => sum + (m.duration_hours || 0), 0);
  const totalSchoolMeetings = meetings.length;

  // สถิติของครูที่ล็อกอิน (กรองเฉพาะรายการที่ครูมีชื่อเป็นผู้เข้าร่วม หรือเป็นคนบันทึก)
  const myMeetings = meetings.filter(m => 
    m.created_at === user?.id || m.participants?.includes(user?.id ?? '')
  );
  const totalMyHours = myMeetings.reduce((sum, m) => sum + (m.duration_hours || 0), 0);

  return {
    schoolStats: { total: totalSchoolHours, count: totalSchoolMeetings },
    myStats: { total: totalMyHours, count: myMeetings.length }
  };
}, [meetings, user?.id]);

  const totalHoursAll = meetings.reduce((s, m) => s + Number(m.duration_hours), 0);
  const totalMeetings = meetings.length;
  const totalTeachers = allTeachers.length;
  const teachersOnTarget = allTeachers.filter(t => {
    const h = meetings.reduce((s, m) => m.participants?.includes(t.id) ? s + Number(m.duration_hours) : s, 0);
    return h >= targetHours;
  }).length;

  async function handleSave(data: any, isDraft: boolean) {
    const payload = { ...data, status: isDraft ? "draft" : "submitted" };
    if (editMeeting?.id) {
      const { error } = await (supabase.from("plc_meetings") as any)
        .update(payload).eq("id", editMeeting.id);
      if (error) { alert("❌ " + error.message); return; }
    } else {
      const { error } = await (supabase.from("plc_meetings") as any)
        .insert([{ ...payload, academic_year_id: selectedYearId }]);
      if (error) { alert("❌ " + error.message); return; }
    }
    setModalOpen(false);
    setEditMeeting(null);
    await loadMeetings();
  }

  async function handleDelete(id: string) {
    if (!confirm("ยืนยันการลบรายการนี้?")) return;
    await supabase.from("plc_meetings").delete().eq("id", id);
    await loadMeetings();
  }

  function openAdd(subGroupKey?: string) {
    const defaultParticipants = subGroupKey
      ? subGroupTeachers[subGroupKey]?.map(t => t.id) ?? []
      : [];
    setEditMeeting({ participants: defaultParticipants, academic_year_id: selectedYearId });
    setModalOpen(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลด...</div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors text-lg">🏠</button>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-none">บันทึกชั่วโมง PLC</h1>
              <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต{isTeacher ? ` · ${fullName(user)}` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none focus:border-blue-400">
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            {/* FIXED: Both admin and teacher can add */}
            {!isAdmin && (
              <button 
                onClick={() => openAdd(mySubGroupKey || "")}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm transition-all shadow-sm whitespace-nowrap"
              >
                ➕ บันทึก
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full px-6 px-4 py-6 space-y-6">

        {/* Overview cards — admin only */}
        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "ชั่วโมงรวม", value: totalHoursAll, unit: "ชม.", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", icon: "⏱️" },
              { label: "จำนวนครั้ง", value: totalMeetings, unit: "ครั้ง", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: "📅" },
              { label: "ครูทั้งหมด", value: totalTeachers, unit: "คน", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: "👩‍🏫" },
              { label: `ครบ ${targetHours} ชม.`, value: teachersOnTarget, unit: "คน", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200", icon: "✅" },
            ].map(card => (
              <div key={card.label} className={`${card.bg} border-2 ${card.border} rounded-2xl p-4 text-center`}>
                <div className="text-2xl mb-1">{card.icon}</div>
                <div className={`text-3xl font-black ${card.color} leading-none`}>{card.value}</div>
                <div className="text-slate-500 text-xs font-bold mt-1">{card.unit}</div>
                <div className="text-slate-400 text-[10px] font-bold mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* All Reports card — admin only */}
        {isAdmin && (
          <button onClick={() => setShowReports(true)}
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl px-6 py-4 flex items-center justify-between transition-all shadow-sm group">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📊</span>
              <div className="text-left">
                <p className="font-black text-base">รายงานทั้งหมด</p>
                <p className="text-indigo-200 text-xs">{totalMeetings} รายการ · {totalHoursAll} ชั่วโมง</p>
              </div>
            </div>
            <span className="text-white/60 group-hover:text-white transition-colors text-xl">→</span>
          </button>
        )}

        {/* Target hours — admin only */}
        {isAdmin && (
          <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-sm font-bold">🎯 เป้าหมายชั่วโมง/คน/ปี:</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setTargetHours(h => Math.max(10, h - 5))}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-600 text-sm">−</button>
                <span className="font-black text-blue-600 text-xl w-12 text-center">{targetHours}</span>
                <button onClick={() => setTargetHours(h => Math.min(200, h + 5))}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-600 text-sm">+</button>
              </div>
              <span className="text-slate-400 text-sm">ชั่วโมง</span>
            </div>
          </div>
        )}

        {/* Tab bar — subject groups */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {isAdmin && (
            <button onClick={() => setActiveGroup("all")}
              className={`px-4 py-2 rounded-xl text-sm font-black border-2 whitespace-nowrap transition-all ${activeGroup === "all" ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              🏫 ทุกกลุ่มสาระ
            </button>
          )}
          {visibleGroups.map(g => {
            const gMeetings = g.subGroups.flatMap(sg => subGroupMeetings[sg.key] ?? []);
            const uniqueMeetings = Array.from(new Map(gMeetings.map(m => [m.id, m])).values());
            const gHours = uniqueMeetings.reduce((s, m) => s + Number(m.duration_hours), 0);
            const isActive = activeGroup === g.key || (!isAdmin && visibleGroups.length === 1);
            return (
              <button key={g.key} onClick={() => setActiveGroup(g.key)}
                className={`px-4 py-2 rounded-xl text-sm font-black border-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}>
                {g.icon} {g.label}
                {gHours > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {gHours}ชม.
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Subject group panels */}
        <div className="space-y-4">
          {visibleGroups
            .filter(g => activeGroup === "all" || activeGroup === g.key || (!isAdmin && visibleGroups.length === 1))
            .map(g => (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{g.icon}</span>
                  <h2 className="font-black text-slate-700 text-base">{g.label}</h2>
                  <div className="flex-1 h-px bg-slate-200" />
                  {(() => {
                    const gMs = g.subGroups.flatMap(sg => subGroupMeetings[sg.key] ?? []);
                    const unique = Array.from(new Map(gMs.map(m => [m.id, m])).values());
                    const h = unique.reduce((s, m) => s + Number(m.duration_hours), 0);
                    return h > 0 ? (
                      <span className="text-xs font-black text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                        {h} ชม. · {unique.length} ครั้ง
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-2">
                  {g.subGroups
                    .filter(sg => !mySubGroupKey || isAdmin || sg.key === mySubGroupKey)
                    .map(sg => (
                      <SubGroupPanel
                        key={sg.key}
                        subGroup={sg}
                        teachers={subGroupTeachers[sg.key] ?? []}
                        meetings={subGroupMeetings[sg.key] ?? []}
                        onAddMeeting={(key) => openAdd(key)}
                        onEdit={(m) => { setEditMeeting(m); setModalOpen(true); }}
                        onDelete={handleDelete}
                        canEdit={true}
                        targetHours={targetHours}
                        isAdmin={isAdmin}
                      />
                    ))}
                </div>
              </div>
            ))}
        </div>

        {/* Teacher summary table — admin only */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-black text-slate-700 text-sm">👩‍🏫 สรุปชั่วโมงรายบุคคล</h3>
              <span className="text-xs text-slate-400 font-bold">เป้าหมาย {targetHours} ชม./คน</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">ชื่อ–สกุล</th>
                    <th className="text-left px-3 py-3 text-xs font-black text-slate-400 uppercase tracking-wider hidden sm:table-cell">กลุ่ม</th>
                    <th className="text-center px-3 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">ชั่วโมง</th>
                    <th className="text-left px-3 py-3 text-xs font-black text-slate-400 uppercase tracking-wider hidden md:table-cell">ความคืบหน้า</th>
                    <th className="text-center px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allTeachers
                    .map(t => ({
                      ...t,
                      hours: meetings.reduce((s, m) => m.participants?.includes(t.id) ? s + Number(m.duration_hours) : s, 0),
                    }))
                    .sort((a, b) => b.hours - a.hours)
                    .map(t => {
                      const pct = Math.min((t.hours / targetHours) * 100, 100);
                      const status = pct >= 100
                        ? { label: "✅ ครบ", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" }
                        : pct >= 60
                        ? { label: "🔶 กำลังดำเนินการ", cls: "bg-amber-100 text-amber-700 border-amber-300" }
                        : { label: "🔴 ยังไม่ครบ", cls: "bg-red-100 text-red-700 border-red-300" };
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 font-bold text-slate-800">{fullName(t)}</td>
                          <td className="px-3 py-3 text-slate-400 text-xs hidden sm:table-cell">{t.position ?? "—"}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-black text-slate-800">{t.hours}</span>
                            <span className="text-slate-400 text-xs"> /{targetHours}</span>
                          </td>
                          <td className="px-3 py-3 hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-blue-400"}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-black text-slate-400 w-9 text-right">{Math.round(pct)}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-black border ${status.cls}`}>{status.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {allTeachers.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">ไม่พบข้อมูลครู</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <MeetingModal
          meeting={editMeeting}
          allTeachers={allTeachers}
          academicYears={academicYears}
          currentUserId={user.id}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditMeeting(null); }}
        />
      )}

      {showReports && (
        <AllReportsModal
          meetings={meetings}
          allTeachers={allTeachers}
          academicYears={academicYears}
          selectedYearId={selectedYearId}
          onClose={() => setShowReports(false)}
          onEdit={(m) => { setShowReports(false); setEditMeeting(m); setModalOpen(true); }}
          onDelete={handleDelete}
          canEdit={isAdmin}
        />
      )}
    </div>
  );
}