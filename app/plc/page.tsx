"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

function toThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
function toThaiDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
function fullName(u: any) {
  if (!u) return "—";
  if (u.full_name) return u.full_name;
  return `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "—";
}

const ADMIN_ROLES_SET = new Set(["admin", "director", "deputy_director"]);
const DEPUTY_EMAIL   = "titima@khienkhet.ac.th";
const DIRECTOR_EMAIL = "thananut@khienkhet.ac.th";

async function resolveOneDriveUrl(path?: string | null, fallbackUrl?: string | null): Promise<string | null> {
  if (!path) return fallbackUrl ?? null;
  try {
    const res = await fetch("/api/resolve-onedrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const json = await res.json();
    if (json.ok && json.downloadUrl) return json.downloadUrl as string;
  } catch {}
  return fallbackUrl ?? null;
}

async function resolveOneDriveUrls(paths: (string | null | undefined)[], fallbackUrls: (string | null | undefined)[]): Promise<string[]> {
  const cleanPaths = paths.map(p => p ?? null);
  if (cleanPaths.every(p => !p)) return fallbackUrls.map(u => u ?? "").filter(Boolean);
  try {
    const res = await fetch("/api/resolve-onedrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: cleanPaths }),
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.downloadUrls)) {
      return json.downloadUrls.map((u: string | null, i: number) => u || fallbackUrls[i] || "").filter(Boolean);
    }
  } catch {}
  return fallbackUrls.map(u => u ?? "").filter(Boolean);
}

type UserProfile = {
  id: string; title?:string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string; academic_level?: string;
  department_id?: string; grade_level?: string;
};
type Teacher = UserProfile & { department_id?: string; grade_level?: string; signature_url?: string; };
type AcademicYear = { id: string; year_name: string; semester: number; is_current?: boolean };
type MeetingScope = "subject" | "grade";
type PLCMeeting = {
  id: string; meeting_number?: number; meeting_date: string; start_time?: string; end_time?: string;
  title: string; topic?: string; duration_hours: number; facilitator_id: string;
  participants: string[]; academic_year_id: string; location?: string;
  problem_description?: string; objectives?: string; methods?: string; results?: string;
  solutions?: string; reflections?: string; future_development?: string;
  image_urls?: string[]; image_paths?: string[]; status?: "draft" | "submitted"; created_at?: string;
  meeting_scope?: MeetingScope; grade_level?: string;
};

type DeptGroup = {
  key: string;
  label: string;
  scope: MeetingScope;
  teachers: Teacher[];
  meetings: PLCMeeting[];
  totalHours: number;
};

const PLC_ONEDRIVE_FOLDER = "Plc";

const GROUP_META: Record<string, { icon: string; color: string; textColor: string; borderColor: string; bgLight: string }> = {
  "ไทย ประถมต้น":            { icon:"📖", color:"bg-rose-500",    textColor:"text-rose-700",    borderColor:"border-rose-300",    bgLight:"bg-rose-50"    },
  "ไทย ประถมปลาย":            { icon:"📖", color:"bg-rose-500",    textColor:"text-rose-700",    borderColor:"border-rose-300",    bgLight:"bg-rose-50"    },
  "ไทย มัธยม":            { icon:"📖", color:"bg-rose-500",    textColor:"text-rose-700",    borderColor:"border-rose-300",    bgLight:"bg-rose-50"    },
  "คณิตฯ ประถมต้น":         { icon:"🔢", color:"bg-blue-500",    textColor:"text-blue-700",    borderColor:"border-blue-300",    bgLight:"bg-blue-50"    },
  "คณิตฯ ประถมปลาย":         { icon:"🔢", color:"bg-blue-500",    textColor:"text-blue-700",    borderColor:"border-blue-300",    bgLight:"bg-blue-50"    },
  "คณิตฯ มัธยม":         { icon:"🔢", color:"bg-blue-500",    textColor:"text-blue-700",    borderColor:"border-blue-300",    bgLight:"bg-blue-50"    },
  "วิทย์ ประถม":        { icon:"🔬", color:"bg-emerald-500", textColor:"text-emerald-700", borderColor:"border-emerald-300", bgLight:"bg-emerald-50" },
  "วิทย์ ม.ต้น":        { icon:"🔬", color:"bg-emerald-500", textColor:"text-emerald-700", borderColor:"border-emerald-300", bgLight:"bg-emerald-50" },
  "วิทย์ ม.ปลาย":        { icon:"🔬", color:"bg-emerald-500", textColor:"text-emerald-700", borderColor:"border-emerald-300", bgLight:"bg-emerald-50" },
  "สังคม ประถม":         { icon:"🌏", color:"bg-amber-500",   textColor:"text-amber-700",   borderColor:"border-amber-300",   bgLight:"bg-amber-50"   },
  "สังคม มัธยม":         { icon:"🌏", color:"bg-amber-500",   textColor:"text-amber-700",   borderColor:"border-amber-300",   bgLight:"bg-amber-50"   },
  "อังกฤษ ประถมต้น":     { icon:"🌐", color:"bg-sky-500",     textColor:"text-sky-700",     borderColor:"border-sky-300",     bgLight:"bg-sky-50"     },
  "อังกฤษ ประถมปลาย":     { icon:"🌐", color:"bg-sky-500",     textColor:"text-sky-700",     borderColor:"border-sky-300",     bgLight:"bg-sky-50"     },
  "อังกฤษ มัธยม":     { icon:"🌐", color:"bg-sky-500",     textColor:"text-sky-700",     borderColor:"border-sky-300",     bgLight:"bg-sky-50"     },
  "สุขศึกษา": { icon:"⚽", color:"bg-orange-500",  textColor:"text-orange-700",  borderColor:"border-orange-300",  bgLight:"bg-orange-50"  },
  "ศิลปะ":              { icon:"🎨", color:"bg-purple-500",  textColor:"text-purple-700",  borderColor:"border-purple-300",  bgLight:"bg-purple-50"  },
  "การงาน + พัฒนาผู้เรียน":        { icon:"🔧", color:"bg-teal-500",    textColor:"text-teal-700",    borderColor:"border-teal-300",    bgLight:"bg-teal-50"    },
  "คอมพิวเตอร์":        { icon:"💻", color:"bg-indigo-500",  textColor:"text-indigo-700",  borderColor:"border-indigo-300",  bgLight:"bg-indigo-50"  },
};
const DEFAULT_META = { icon:"📚", color:"bg-slate-500", textColor:"text-slate-700", borderColor:"border-slate-300", bgLight:"bg-slate-50" };

function getGroupMeta(label: string) {
  const exact = GROUP_META[label];
  if (exact) return exact;
  for (const [k, v] of Object.entries(GROUP_META)) {
    if (label.includes(k) || k.includes(label)) return v;
  }
  return DEFAULT_META;
}

const GRADE_LABEL: Record<string, string> = {
  "k2":"อ.2","k3":"อ.3",
  "p1":"ป.1","p2":"ป.2","p3":"ป.3","p4":"ป.4","p5":"ป.5","p6":"ป.6",
  "m1":"ม.1","m2":"ม.2","m3":"ม.3","m4":"ม.4","m5":"ม.5","m6":"ม.6",
  "อ.2":"อ.2","อ.3":"อ.3",
  "ป.1":"ป.1","ป.2":"ป.2","ป.3":"ป.3","ป.4":"ป.4","ป.5":"ป.5","ป.6":"ป.6",
  "ม.1":"ม.1","ม.2":"ม.2","ม.3":"ม.3","ม.4":"ม.4","ม.5":"ม.5","ม.6":"ม.6",
};
const GRADE_META: { icon: string; textColor: string; borderColor: string; bgLight: string } =
  { icon:"🎓", textColor:"text-cyan-700", borderColor:"border-cyan-300", bgLight:"bg-cyan-50" };

// ── Resolve label helpers ──────────────────────────────────────────────────────
function gradeLabel(id: string, glMap?: Record<string, string>): string {
  if (!id) return "—";
  if (glMap && glMap[id]) return glMap[id];
  return GRADE_LABEL[id] ?? id;
}

function subjectLabel(id: string, sMap?: Record<string, string>): string {
  if (!id) return "—";
  if (sMap && sMap[id]) return sMap[id];
  return id;
}

const inp = (err?: boolean) =>
  `w-full bg-white border-2 ${err ? "border-red-400 animate-pulse" : "border-blue-200"} rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-500 focus:outline-none transition-colors`;
const textareaCls = (err?: boolean) =>
  `w-full bg-white border-2 ${err ? "border-red-400 animate-pulse" : "border-blue-200"} rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:border-blue-500 focus:outline-none resize-none transition-colors`;
const labelCls = "block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider";
const reqStar = <span className="text-red-500 ml-0.5">*</span>;

// ══════════════════════════════════════════════════════════
// Print Report Builder
// ══════════════════════════════════════════════════════════
function buildPLCReportHTML(
  meeting: PLCMeeting,
  facilitator: Teacher | undefined,
  participants: Teacher[],
  resolvedImageUrls: string[],
  facilitatorSignatureUrl?: string,
  deputySignatureUrl?: string,   // ← เพิ่ม
  directorSignatureUrl?: string,  // ← เพิ่ม
  gradeLevelMap?: Record<string, string>,
  subjectMap?: Record<string, string>
): string {
  const isGrade = meeting.meeting_scope === "grade";
  const scopeLabel = isGrade
    ? `ประชุมสายชั้น ${gradeLabel(meeting.grade_level ?? "", gradeLevelMap)}`
    : "ประชุมกลุ่มสาระการเรียนรู้ (PLC)";
  const now = new Date();
  const printedDate = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

  const sections = [
    { label: "สภาพปัญหา", icon: "⚠️", value: meeting.problem_description },
    { label: "วัตถุประสงค์", icon: "🎯", value: meeting.objectives },
    { label: "วิธีการดำเนินการ", icon: "📋", value: meeting.methods },
    { label: "ผลที่เกิดขึ้น", icon: "✨", value: meeting.results },
    { label: "แนวทางแก้ไขปัญหา", icon: "🔧", value: meeting.solutions },
    { label: "การสะท้อนผล", icon: "🪞", value: meeting.reflections },
    { label: "แนวทางการพัฒนาต่อ", icon: "🚀", value: meeting.future_development },
  ];

  const sectionsHTML = sections.map(s => s.value ? `
    <div style="margin-bottom:9px">
      <div style="font-weight:700;font-size:11pt;margin-bottom:2px">${s.icon} ${s.label}</div>
      <div style="font-size:10.5pt;line-height:1.6;white-space:pre-wrap;padding-left:8px;border-left:2px solid #cbd5e1">${(s.value || "").replace(/</g,"&lt;")}</div>
    </div>` : "").join("");

  const participantsHTML = participants.length
    ? participants.map(t => `<span style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;padding:2px 8px;margin:2px;font-size:9.5pt">${fullName(t)}</span>`).join("")
    : "<span style='color:#94a3b8'>—</span>";

  const imagesHTML = resolvedImageUrls.length ? `
    <div style="page-break-before:always;padding-top:10mm">
      <div style="font-size:13pt;font-weight:900;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:6px">📷 ภาพประกอบการประชุม</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${resolvedImageUrls.map(url => `<img src="${url}" style="width:100%;height:85mm;object-fit:cover;border-radius:6px;border:1px solid #ccc"/>`).join("")}
      </div>
    </div>` : "";

  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:210mm;font-family:'Sarabun',Arial,sans-serif;font-size:11pt;color:#000;background:#fff}
.page{padding:14mm 16mm 10mm}
table.meta{border-collapse:collapse;width:100%;font-size:10.5pt;margin-bottom:10px}
table.meta td{padding:3px 6px;vertical-align:top}
table.meta td.k{color:#64748b;font-weight:700;white-space:nowrap;width:110px}
@page{size:A4;margin:0}
</style></head><body><div class="page">
<div style="text-align:center;margin-bottom:6px">
  <img src="/school-logo.png" style="width:54px;height:54px;object-fit:contain" onerror="this.style.display='none'"/>
</div>
<div style="font-size:15pt;font-weight:900;text-align:center;margin-bottom:2px">แบบรายงานผลการดำเนินกิจกรรม${isGrade ? "ประชุมสายชั้น" : "ชุมชนแห่งการเรียนรู้ทางวิชาชีพ (PLC)"}</div>
<div style="text-align:center;font-size:10.5pt;color:#475569;margin-bottom:10px">โรงเรียนวัดเขียนเขต ตำบลบึงยี่โถ อำเภอธัญบุรี จังหวัดปทุมธานี</div>
<table class="meta">
  <tr><td class="k">ประเภทการประชุม</td><td>${scopeLabel}</td></tr>
  <tr><td class="k">ครั้งที่</td><td>${meeting.meeting_number ?? "—"}</td></tr>
  <tr><td class="k">ชื่อกิจกรรม</td><td style="font-weight:700">${meeting.title}</td></tr>
  ${meeting.topic ? `<tr><td class="k">หัวข้อ/ประเด็น</td><td>${meeting.topic}</td></tr>` : ""}
  <tr><td class="k">วันที่</td><td>${toThaiDateLong(meeting.meeting_date)}</td></tr>
  <tr><td class="k">เวลา</td><td>${meeting.start_time ?? "—"} – ${meeting.end_time ?? "—"} น. (รวม ${meeting.duration_hours} ชั่วโมง)</td></tr>
  <tr><td class="k">สถานที่</td><td>${meeting.location ?? "—"}</td></tr>
  <tr><td class="k">วิทยากร/ผู้นำ</td><td>${facilitator ? fullName(facilitator) : "—"}</td></tr>
  <tr><td class="k">ผู้เข้าร่วม (${participants.length} คน)</td><td>${participantsHTML}</td></tr>
</table>
<div style="border-top:1px solid #cbd5e1;padding-top:8px;margin-top:4px">
  ${sectionsHTML || "<p style='color:#94a3b8;font-size:10.5pt'>ไม่มีข้อมูลรายงานเพิ่มเติม</p>"}
</div>
<div style="margin-top:28px;display:flex;justify-content:space-between;gap:10px">
  <div style="text-align:center;flex:1">
    ${facilitatorSignatureUrl ? `<img src="${facilitatorSignatureUrl}" style="max-height:55px;max-width:150px;object-fit:contain;margin:0 auto;display:block"/>` : `<div style="height:55px"></div>`}
    <div style="border-bottom:1px solid #000;width:170px;margin:0 auto"></div>
    <div style="font-size:10pt;margin-top:4px">(${facilitator ? fullName(facilitator) : "............................"})</div>
    <div style="font-size:9pt;color:#64748b">ผู้บันทึก/วิทยากร</div>
  </div>
  <div style="text-align:center;flex:1">
    ${deputySignatureUrl ? `<img src="${deputySignatureUrl}" style="max-height:55px;max-width:150px;object-fit:contain;margin:0 auto;display:block"/>` : `<div style="height:55px"></div>`}
    <div style="border-bottom:1px solid #000;width:170px;margin:0 auto"></div>
    <div style="font-size:10pt;margin-top:4px">(นางสาวฐิติมา กาบแก้ว)</div>
    <div style="font-size:9pt;color:#64748b">รองผู้อำนวยการโรงเรียนกลุ่มบริหารงานบุคคล</div>
  </div>
  <div style="text-align:center;flex:1">
    ${directorSignatureUrl ? `<img src="${directorSignatureUrl}" style="max-height:55px;max-width:150px;object-fit:contain;margin:0 auto;display:block"/>` : `<div style="height:55px"></div>`}
    <div style="border-bottom:1px solid #000;width:170px;margin:0 auto"></div>
    <div style="font-size:10pt;margin-top:4px">(นายธนณัฐ ศิระวงษ์)</div>
    <div style="font-size:9pt;color:#64748b">ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
  </div>
</div>
<div style="margin-top:20px;font-size:9pt;color:#94a3b8;text-align:right">พิมพ์เมื่อ ${printedDate}</div>
</div>${imagesHTML}</body></html>`;
}

function printPLCReport(
  meeting: PLCMeeting,
  facilitator: Teacher | undefined,
  participants: Teacher[],
  resolvedImageUrls: string[],
  facilitatorSignatureUrl?: string,
  deputySignatureUrl?: string,
  directorSignatureUrl?: string,
  gradeLevelMap?: Record<string, string>,
  subjectMap?: Record<string, string>
) {
  const html = buildPLCReportHTML(meeting, facilitator, participants, resolvedImageUrls, facilitatorSignatureUrl, deputySignatureUrl, directorSignatureUrl, gradeLevelMap, subjectMap);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.open(); win.document.write(html); win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

async function printPLCReportAsync(
  meeting: PLCMeeting,
  facilitator: Teacher | undefined,
  participants: Teacher[],
  facilitatorSignatureUrl?: string,
  deputySignatureUrl?: string,
  directorSignatureUrl?: string,
  gradeLevelMap?: Record<string, string>,
  subjectMap?: Record<string, string>
) {
  const freshUrls = await resolveOneDriveUrls(meeting.image_paths ?? [], meeting.image_urls ?? []);
  printPLCReport(meeting, facilitator, participants, freshUrls, facilitatorSignatureUrl, deputySignatureUrl, directorSignatureUrl, gradeLevelMap, subjectMap);
}

// ══════════════════════════════════════════════════════════
// ResolvedImage
// ══════════════════════════════════════════════════════════
function ResolvedImage({ url, path, alt, className, onClick }: {
  url?: string | null; path?: string | null; alt: string; className?: string; onClick?: () => void;
}) {
  const [liveUrl, setLiveUrl] = useState<string | null>(url ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      const fresh = await resolveOneDriveUrl(path, url);
      if (!cancelled) setLiveUrl(fresh);
    })();
    return () => { cancelled = true; };
  }, [url, path]);

  if (!liveUrl || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100 text-slate-300 text-2xl`}>
        🖼️
      </div>
    );
  }
  return (
    <img src={liveUrl} alt={alt} className={className} onClick={onClick} onError={() => setFailed(true)} />
  );
}

// ── Progress ring ──────────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════
// Report Detail Modal
// ══════════════════════════════════════════════════════════
function ReportDetailModal({ meeting, allTeachers, onClose, onEdit, onDelete, canEdit, gradeLevelMap, subjectMap, deputySignatureUrl, directorSignatureUrl }: {
  meeting: PLCMeeting; allTeachers: Teacher[]; onClose: () => void;
  onEdit: (m: PLCMeeting) => void; onDelete: (id: string) => void; canEdit: boolean;
  gradeLevelMap: Record<string, string>; subjectMap: Record<string, string>;
  deputySignatureUrl?: string; directorSignatureUrl?: string;
}) {
  const participants = allTeachers.filter(t => meeting.participants?.includes(t.id));
  const facilitator  = allTeachers.find(t => t.id === meeting.facilitator_id);
  const isGrade = meeting.meeting_scope === "grade";
  const [printing, setPrinting] = useState(false);

  const sections = [
    { label:"สภาพปัญหา", value:meeting.problem_description, icon:"⚠️" },
    { label:"วัตถุประสงค์", value:meeting.objectives, icon:"🎯" },
    { label:"วิธีการดำเนินการ", value:meeting.methods, icon:"📋" },
    { label:"ผลที่เกิดขึ้น", value:meeting.results, icon:"✨" },
    { label:"แนวทางแก้ไขปัญหา", value:meeting.solutions, icon:"🔧" },
    { label:"การสะท้อนผล", value:meeting.reflections, icon:"🪞" },
    { label:"แนวทางการพัฒนาต่อ", value:meeting.future_development, icon:"🚀" },
  ];

  async function handlePrint() {
    setPrinting(true);
    try {
      await printPLCReportAsync(meeting, facilitator, participants, facilitator?.signature_url, deputySignatureUrl, directorSignatureUrl, gradeLevelMap, subjectMap);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-black px-2 py-1 rounded-lg border ${meeting.status === "submitted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                {meeting.status === "submitted" ? "✅ ส่งแล้ว" : "📝 ร่าง"}
              </span>
              <span className={`text-xs font-black px-2 py-1 rounded-lg border ${isGrade ? `${GRADE_META.bgLight} ${GRADE_META.textColor} ${GRADE_META.borderColor}` : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                {isGrade ? `${GRADE_META.icon} สายชั้น ${gradeLabel(meeting.grade_level ?? "", gradeLevelMap)}` : "📚 กลุ่มสาระ"}
              </span>
              {meeting.meeting_number && <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">ครั้งที่ {meeting.meeting_number}</span>}
            </div>
            <h3 className="font-black text-slate-800 text-lg leading-tight">{meeting.title}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              <span>📅 {toThaiDate(meeting.meeting_date)}</span>
              {meeting.start_time && meeting.end_time && <span>🕐 {meeting.start_time} – {meeting.end_time}</span>}
              {meeting.location && <span>📍 {meeting.location}</span>}
              <span>⏱️ {meeting.duration_hours} ชม.</span>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg shrink-0">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-blue-500 mb-1">วิทยากร / ผู้นำ</p>
              <p className="font-bold text-slate-800 text-sm">{facilitator ? fullName(facilitator) : "—"}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-slate-500 mb-1">ผู้เข้าร่วม ({participants.length} คน)</p>
              <div className="flex flex-wrap gap-1">
                {participants.slice(0,5).map(t => <span key={t.id} className="text-xs bg-white border border-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded-lg">{fullName(t)}</span>)}
                {participants.length > 5 && <span className="text-xs text-slate-400">+{participants.length - 5}</span>}
              </div>
            </div>
          </div>
          {sections.map(s => s.value ? (
            <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-slate-500 mb-1.5 flex items-center gap-1.5"><span>{s.icon}</span>{s.label}</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{s.value}</p>
            </div>
          ) : null)}
          {((meeting.image_urls && meeting.image_urls.length > 0) || (meeting.image_paths && meeting.image_paths.length > 0)) && (
            <div>
              <p className="text-xs font-black text-slate-500 mb-2">
                📷 รูปภาพการประชุม ({Math.max(meeting.image_urls?.length ?? 0, meeting.image_paths?.length ?? 0)} รูป)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(meeting.image_paths && meeting.image_paths.length > 0 ? meeting.image_paths : (meeting.image_urls ?? [])).map((_, i) => (
                  <ResolvedImage
                    key={i}
                    path={meeting.image_paths?.[i]}
                    url={meeting.image_urls?.[i]}
                    alt={`meeting-${i+1}`}
                    className="w-full h-24 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-90"
                    onClick={() => { const u = meeting.image_urls?.[i]; if (u) window.open(u, "_blank"); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-6 py-4 flex gap-2 shrink-0 bg-slate-50 rounded-b-3xl">
          <button onClick={handlePrint} disabled={printing}
            className="px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-700 font-black text-sm hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1.5">
            {printing ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/> : "🖨️"} พิมพ์รายงาน
          </button>
          {canEdit && (
            <>
              <button onClick={() => { onClose(); onEdit(meeting); }} className="px-4 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-black text-sm hover:bg-blue-100">✏️ แก้ไข</button>
              <button onClick={() => { if (confirm("ยืนยันการลบ?")) { onDelete(meeting.id); onClose(); } }} className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm hover:bg-red-100">🗑️ ลบ</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Meeting Modal
// ══════════════════════════════════════════════════════════
function MeetingModal({ meeting, allTeachers, academicYears, currentUserId, currentUser, gradeLevelMap, subjectMap, onSave, onClose }: {
  meeting: Partial<PLCMeeting> | null;
  allTeachers: Teacher[];
  academicYears: AcademicYear[];
  currentUserId: string;
  currentUser: UserProfile;
  gradeLevelMap: Record<string, string>;
  subjectMap: Record<string, string>;
  onSave: (data: any, isDraft: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!meeting?.id;
  const defaultYear = academicYears.find(y => y.is_current) ?? academicYears[0];

  const [scope, setScope] = useState<MeetingScope>(meeting?.meeting_scope ?? "subject");
  const [gradeLevelSel, setGradeLevelSel] = useState<string>(meeting?.grade_level ?? currentUser.grade_level ?? "");

  const [yearId,      setYearId]      = useState(meeting?.academic_year_id ?? defaultYear?.id ?? "");
  const [date,        setDate]        = useState(meeting?.meeting_date ?? new Date().toISOString().slice(0, 10));
  const [startTime,   setStartTime]   = useState(meeting?.start_time ?? "08:30");
  const [endTime,     setEndTime]     = useState(meeting?.end_time ?? "12:30");
  const [meetingNo,   setMeetingNo]   = useState<number | "">("");
  const [title,       setTitle]       = useState(meeting?.title ?? "");
  const [topic,       setTopic]       = useState(meeting?.topic ?? "");
  const [hours,       setHours]       = useState<number>(meeting?.duration_hours ?? 4);
  const [location,    setLocation]    = useState(meeting?.location ?? "");
  const [problem,     setProblem]     = useState(meeting?.problem_description ?? "");
  const [objectives,  setObjectives]  = useState(meeting?.objectives ?? "");
  const [methods,     setMethods]     = useState(meeting?.methods ?? "");
  const [results,     setResults]     = useState(meeting?.results ?? "");
  const [solutions,   setSolutions]   = useState(meeting?.solutions ?? "");
  const [reflections, setReflections] = useState(meeting?.reflections ?? "");
  const [futuredev,   setFuturedev]   = useState(meeting?.future_development ?? "");
  const [images,      setImages]      = useState<{ url: string; path: string; preview: string }[]>(
    (meeting?.image_urls ?? []).map((u, i) => ({ url: u, path: meeting?.image_paths?.[i] ?? "", preview: u }))
  );
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [tab,         setTab]         = useState<"basic" | "report">("basic");
  const [submitted,   setSubmitted]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const GRADE_ORDER = [
    "k2","k3","p1","p2","p3","p4","p5","p6",
    "m1","m2","m3","m4","m5","m6",
    "อ.2","อ.3","ป.1","ป.2","ป.3","ป.4","ป.5","ป.6",
    "ม.1","ม.2","ม.3","ม.4","ม.5","ม.6",
  ];

  const availableGrades = useMemo(() => {
    const set = new Set<string>();
    allTeachers.forEach(t => { if (t.grade_level) set.add(t.grade_level); });
    return Array.from(set).sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a);
      const bi = GRADE_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b, "th");
    });
  }, [allTeachers]);

  const myDeptId = (currentUser as Teacher).department_id ?? null;
  const sameGroupTeachers = useMemo(() => {
    if (!myDeptId) return allTeachers;
    const filtered = allTeachers.filter(t => t.department_id === myDeptId);
    return filtered.length > 0 ? filtered : allTeachers;
  }, [allTeachers, myDeptId]);

  const sameGradeTeachers = useMemo(() => {
    if (!gradeLevelSel) return allTeachers;
    const filtered = allTeachers.filter(t => t.grade_level === gradeLevelSel);
    return filtered.length > 0 ? filtered : allTeachers;
  }, [allTeachers, gradeLevelSel]);

  const candidateTeachers = scope === "grade" ? sameGradeTeachers : sameGroupTeachers;

  const [selected, setSelected] = useState<string[]>(
    meeting?.participants ?? candidateTeachers.map(t => t.id)
  );

  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) { didInitRef.current = true; return; }
    setSelected(candidateTeachers.map(t => t.id));
  }, [scope, gradeLevelSel]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedYear = academicYears.find(y => y.id === yearId);
  const yearLabel = selectedYear ? `ปีการศึกษา ${selectedYear.year_name} ภาคเรียนที่ ${selectedYear.semester}` : "";

  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const diff = (eh * 60 + em - sh * 60 - sm) / 60;
      if (diff > 0) setHours(Math.round(diff * 10) / 10);
    }
  }, [startTime, endTime]);

  const filtered = candidateTeachers.filter(t =>
    fullName(t).toLowerCase().includes(search.toLowerCase()) ||
    (t.position ?? "").toLowerCase().includes(search.toLowerCase()) ||
    subjectLabel(t.academic_level ?? "", subjectMap).toLowerCase().includes(search.toLowerCase()) ||
    gradeLabel(t.grade_level ?? "", gradeLevelMap).toLowerCase().includes(search.toLowerCase())
  );

  function toggleTeacher(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = 4 - images.length;
    if (remaining <= 0) { alert("แนบได้สูงสุด 4 รูปเท่านั้น"); return; }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) alert(`แนบได้อีก ${remaining} รูป`);
    setUploading(true);
    setUploadError("");
    for (const file of toUpload) {
      if (file.size > 5 * 1024 * 1024) { alert(`"${file.name}" ใหญ่เกิน 5MB`); continue; }
      const previewUrl = URL.createObjectURL(file);
      setImages(prev => [...prev, { url: "", path: "", preview: previewUrl }]);
      try {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
        const now = new Date();
        const dd = String(now.getDate()).padStart(2,"0");
        const mm = String(now.getMonth()+1).padStart(2,"0");
        const yyyyBE = now.getFullYear()+543;
        const finalFileName = `PLC_${dd}${mm}${yyyyBE}_${Date.now()}.${ext}`;
        const relPath = `${PLC_ONEDRIVE_FOLDER}/${finalFileName}`;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", relPath);
        const res = await fetch("/api/upload-onedrive", { method: "POST", body: formData });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error ? JSON.stringify(json.error) : `HTTP ${res.status}`);
        const fileUrl = json.downloadUrl || json.url || json.webUrl || previewUrl;
        setImages(prev => prev.map(img => img.preview === previewUrl ? { url: fileUrl, path: relPath, preview: previewUrl } : img));
      } catch (err: any) {
        setUploadError(`อัพโหลดไม่สำเร็จ: ${err.message}`);
        setImages(prev => prev.filter(img => img.preview !== previewUrl));
        URL.revokeObjectURL(previewUrl);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const gradeRequired = scope === "grade" ? !!gradeLevelSel : true;
  const basicRequired = !!(date && title.trim() && meetingNo !== null) && gradeRequired;
  const allBasicFilled = !!(date && title.trim() && topic.trim() && location.trim()
    && selected.length > 0 && meetingNo !== null) && gradeRequired;
  const allReportFilled = !!(problem.trim() && objectives.trim() && methods.trim() && results.trim() && solutions.trim() && reflections.trim() && futuredev.trim() && images.length > 0);
  const canSubmit = allBasicFilled && allReportFilled;

  const errors = {
    date: submitted && !date, title: submitted && !title.trim(),
    topic: submitted && !topic.trim(), location: submitted && !location.trim(),
    selected: submitted && selected.length === 0,
    gradeLevel: submitted && scope === "grade" && !gradeLevelSel,
    problem: submitted && !problem.trim(), objectives: submitted && !objectives.trim(),
    methods: submitted && !methods.trim(), results: submitted && !results.trim(),
    solutions: submitted && !solutions.trim(), reflections: submitted && !reflections.trim(),
    futuredev: submitted && !futuredev.trim(), images: submitted && images.length === 0,
    meetingNo: submitted && meetingNo === null,
  };

  async function handleSave(isDraft: boolean) {
    setSubmitted(!isDraft);
    if (isDraft) {
      if (!basicRequired) { setTab("basic"); alert(scope === "grade" && !gradeLevelSel ? "กรุณาเลือกสายชั้นก่อนบันทึกร่าง" : "กรุณากรอกวันที่และชื่อกิจกรรมก่อนบันทึกร่าง"); return; }
    } else {
      if (!canSubmit) {
        if (!allBasicFilled) setTab("basic"); else setTab("report");
        alert("กรุณากรอกข้อมูลให้ครบทุกช่อง"); return;
      }
      if (images.some(img => !img.url)) { alert("กรุณารอให้รูปอัพโหลดเสร็จก่อนส่ง"); return; }
    }
    setLoading(true);
    await onSave({
      meeting_scope: scope,
      grade_level: scope === "grade" ? gradeLevelSel : null,
      meeting_date: date, start_time: startTime, end_time: endTime,
      meeting_number: meetingNo,
      title, topic, duration_hours: hours, location,
      facilitator_id: currentUserId,
      participants: selected,
      academic_year_id: yearId,
      problem_description: problem, objectives, methods, results, solutions,
      reflections, future_development: futuredev,
      image_urls: images.map(i => i.url).filter(Boolean),
      image_paths: images.map(i => i.path).filter(Boolean),
      status: isDraft ? "draft" : "submitted",
    }, isDraft);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-lg">{isEdit ? "✏️ แก้ไขการประชุม" : "➕ บันทึกชั่วโมง PLC"}</h3>
            {yearLabel && <p className="text-blue-600 text-xs font-black mt-0.5">{yearLabel}</p>}
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">✕</button>
        </div>

        <div className="flex border-b border-slate-100 shrink-0 px-6">
          {[
            { key:"basic",  label:"📋 ข้อมูลพื้นฐาน",  hasError: submitted && !allBasicFilled  },
            { key:"report", label:"📝 รายงาน PLC",       hasError: submitted && !allReportFilled },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-3 text-sm font-black border-b-2 transition-all relative ${tab === t.key ? "border-blue-500 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
              {t.hasError && <span className="absolute top-2 right-1 w-2 h-2 bg-red-500 rounded-full" />}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {tab === "basic" && (
            <>
              <div>
                <label className={labelCls}>ประเภทการประชุม {reqStar}</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => setScope("subject")}
                    className={`p-3 rounded-xl border-2 font-bold text-sm flex items-center gap-2 transition-all ${scope === "subject" ? "bg-indigo-100 border-indigo-400 text-indigo-700 ring-2 ring-indigo-300" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <span className="text-xl">📚</span> ประชุมกลุ่มสาระ
                  </button>
                  <button type="button" onClick={() => setScope("grade")}
                    className={`p-3 rounded-xl border-2 font-bold text-sm flex items-center gap-2 transition-all ${scope === "grade" ? `${GRADE_META.bgLight} ${GRADE_META.borderColor} ${GRADE_META.textColor} ring-2 ring-cyan-300` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <span className="text-xl">{GRADE_META.icon}</span> ประชุมสายชั้น
                  </button>
                </div>
              </div>

              {scope === "grade" && (
                <div>
                  <label className={labelCls}>เลือกสายชั้น {reqStar}</label>
                  <select value={gradeLevelSel} onChange={e => setGradeLevelSel(e.target.value)} className={inp(errors.gradeLevel)}>
                    <option value="">— เลือกสายชั้น —</option>
                    {availableGrades.map(g => (
                      <option key={g} value={g}>{gradeLabel(g, gradeLevelMap)}</option>
                    ))}
                  </select>
                  {errors.gradeLevel && <p className="text-red-500 text-xs mt-1">กรุณาเลือกสายชั้น</p>}
                  {gradeLevelSel && (
                    <p className="text-cyan-600 text-xs font-bold mt-1.5">
                      🎓 สายชั้น {gradeLabel(gradeLevelSel, gradeLevelMap)} · {sameGradeTeachers.length} คน
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls}>ปีการศึกษา {reqStar}</label>
                <select value={yearId} onChange={e => setYearId(e.target.value)} className={inp()}>
                  {academicYears.map(y => (
                    <option key={y.id} value={y.id}>ปีการศึกษา {y.year_name} ภาคเรียนที่ {y.semester}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>วันที่ประชุม {reqStar}</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp(errors.date)} />
                  {errors.date && <p className="text-red-500 text-xs mt-1">กรุณาเลือกวันที่</p>}
                </div>
                <div>
                  <label className={labelCls}>ครั้งที่ {reqStar}</label>
                  <input type="number" min="1" value={meetingNo}
                    onChange={e => setMeetingNo(e.target.value === "" ? "" : +e.target.value)}
                    placeholder="1" className={inp(errors.meetingNo)} />
                  {errors.meetingNo && <p className="text-red-500 text-xs mt-1">กรุณากรอกครั้งที่</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>เวลาเริ่ม {reqStar}</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp()} />
                </div>
                <div>
                  <label className={labelCls}>เวลาสิ้นสุด {reqStar}</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp()} />
                </div>
                <div>
                  <label className={labelCls}>ชั่วโมง (อัตโนมัติ)</label>
                  <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-xl px-3 py-2.5 text-blue-600 font-black text-sm text-center">{hours} ชม.</div>
                </div>
              </div>
              <div>
                <label className={labelCls}>ชื่อการประชุม / กิจกรรม {reqStar}</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={scope === "grade" ? "เช่น ประชุมสายชั้น ป.1 ครั้งที่ 1" : "เช่น PLC กลุ่มสาระภาษาไทย ครั้งที่ 1"} className={inp(errors.title)} />
                {errors.title && <p className="text-red-500 text-xs mt-1">กรุณากรอกชื่อกิจกรรม</p>}
              </div>
              <div>
                <label className={labelCls}>หัวข้อ / ประเด็น {reqStar}</label>
                <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="เช่น การออกแบบกิจกรรมการเรียนรู้เชิงรุก" className={inp(errors.topic)} />
                {errors.topic && <p className="text-red-500 text-xs mt-1">กรุณากรอกหัวข้อ</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>สถานที่ {reqStar}</label>
                  <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="ห้องประชุม..." className={inp(errors.location)} />
                  {errors.location && <p className="text-red-500 text-xs mt-1">กรุณากรอกสถานที่</p>}
                </div>
                <div>
                  <label className={labelCls}>วิทยากร / ผู้นำ</label>
                  <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-xl px-3 py-2.5 text-blue-700 font-black text-sm flex items-center gap-2">
                    <span>👤</span><span>{fullName(currentUser)}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls}>ผู้เข้าร่วม ({selected.length} คน) {reqStar}</label>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setSelected(candidateTeachers.map(t => t.id))}
                      className="text-xs font-black text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50">เลือกทั้งหมด</button>
                    <button type="button" onClick={() => setSelected([])}
                      className="text-xs font-black text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100">ล้าง</button>
                  </div>
                </div>
                {scope === "subject" && myDeptId && (
                  <div className="mb-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span>🏷️</span>
                    <p className="text-blue-700 text-xs font-bold">
                      กลุ่ม: <strong>{subjectLabel(currentUser.academic_level ?? "", subjectMap) || "—"}</strong> · {sameGroupTeachers.length} คน
                    </p>
                  </div>
                )}
                {scope === "grade" && gradeLevelSel && (
                  <div className="mb-2 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span>{GRADE_META.icon}</span>
                    <p className="text-cyan-700 text-xs font-bold">
                      สายชั้น: <strong>{gradeLabel(gradeLevelSel, gradeLevelMap)}</strong> · {sameGradeTeachers.length} คน
                    </p>
                  </div>
                )}
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="🔍 ค้นหาชื่อครู..." className={`${inp(errors.selected)} mb-2`} />
                {errors.selected && <p className="text-red-500 text-xs mb-1">กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน</p>}
                <div className={`border-2 ${errors.selected ? "border-red-400" : "border-slate-200"} rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100`}>
                  {filtered.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-sm">ไม่พบชื่อที่ค้นหา</div>
                  ) : filtered.map(t => {
                    const checked = selected.includes(t.id);
                    return (
                      <button key={t.id} type="button" onClick={() => toggleTeacher(t.id)}
                        className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition-colors ${checked ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"}`}>
                          {checked && <span className="text-white text-xs font-black">✓</span>}
                        </div>
                        <span className={`font-bold flex-1 ${checked ? "text-blue-700" : "text-slate-700"}`}>{fullName(t)}</span>
                        {t.academic_level && (
                          <span className="text-xs bg-blue-50 border border-blue-200 text-blue-600 px-1.5 py-0.5 rounded-lg shrink-0 font-bold">
                            {subjectLabel(t.academic_level, subjectMap)}
                          </span>
                        )}
                        {t.grade_level && (
                          <span className="text-xs bg-cyan-50 border border-cyan-200 text-cyan-600 px-1.5 py-0.5 rounded-lg shrink-0 font-bold">
                            {gradeLabel(t.grade_level, gradeLevelMap)}
                          </span>
                        )}
                        {t.position && (
                          <span className="text-slate-400 text-xs hidden sm:inline shrink-0">{t.position}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "report" && (
            <>
              {[
                { label:"⚠️ สภาพปัญหา", ph:"ระบุปัญหาหรือความท้าทายที่พบในการจัดการเรียนการสอน...", val:problem, set:setProblem, err:errors.problem },
                { label:"🎯 วัตถุประสงค์", ph:"ระบุวัตถุประสงค์ของการประชุม PLC ครั้งนี้...", val:objectives, set:setObjectives, err:errors.objectives },
                { label:"📋 วิธีการดำเนินการ", ph:"อธิบายกระบวนการ/กิจกรรมที่ดำเนินการ...", val:methods, set:setMethods, err:errors.methods },
                { label:"✨ ผลที่เกิดขึ้น", ph:"ระบุผลลัพธ์ที่เกิดขึ้นจากการประชุม...", val:results, set:setResults, err:errors.results },
                { label:"🔧 แนวทางแก้ไขปัญหา", ph:"แนวทางหรือมาตรการที่ตกลงร่วมกัน...", val:solutions, set:setSolutions, err:errors.solutions },
                { label:"🪞 การสะท้อนผล", ph:"สะท้อนสิ่งที่ได้เรียนรู้และข้อค้นพบ...", val:reflections, set:setReflections, err:errors.reflections },
                { label:"🚀 แนวทางการพัฒนาต่อ", ph:"แผนหรือแนวทางที่จะนำไปพัฒนาต่อ...", val:futuredev, set:setFuturedev, err:errors.futuredev },
              ].map(f => (
                <div key={f.label}>
                  <label className={labelCls}>{f.label} {reqStar}</label>
                  <textarea value={f.val} onChange={e => f.set(e.target.value)} rows={3}
                    placeholder={f.ph} className={textareaCls(f.err)} />
                  {f.err && <p className="text-red-500 text-xs mt-1">กรุณากรอกข้อมูล</p>}
                </div>
              ))}
              <div>
                <label className={labelCls}>📷 แนบรูปการประชุม {reqStar} <span className="text-slate-400 font-normal normal-case">(สูงสุด 4 รูป)</span></label>
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative group aspect-square">
                        <img src={img.preview} alt={`รูป ${i+1}`}
                          className={`w-full h-full object-cover rounded-xl border-2 ${img.url ? "border-blue-200" : "border-amber-300 opacity-70"}`}
                          onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23f1f5f9' width='80' height='80' rx='8'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' fill='%2394a3b8' font-size='24'%3E🖼%3C/text%3E%3C/svg%3E"; }} />
                        {!img.url && <div className="absolute inset-0 bg-amber-50/70 rounded-xl flex items-center justify-center"><span className="text-amber-600 text-xs font-black animate-pulse">⏳</span></div>}
                        {img.url && <div className="absolute bottom-1 left-1 bg-emerald-500/80 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">✓</div>}
                        <button type="button" onClick={() => setImages(prev => prev.filter((_,j) => j !== i))}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center font-black shadow-md">×</button>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - images.length) }).map((_,i) => (
                      <div key={`e-${i}`} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-2xl">+</div>
                    ))}
                  </div>
                )}
                {uploadError && (
                  <div className="mb-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2">
                    <p className="text-red-600 text-xs font-bold flex-1">⚠️ {uploadError}</p>
                    <button onClick={() => setUploadError("")} className="text-red-400 text-xs font-black">✕</button>
                  </div>
                )}
                {images.length < 4 ? (
                  <label className={`flex items-center gap-3 cursor-pointer bg-white border-2 border-dashed ${errors.images ? "border-red-400" : uploading ? "border-amber-300" : "border-blue-200 hover:border-blue-400"} rounded-xl px-4 py-3 transition-colors ${uploading ? "opacity-70 pointer-events-none" : ""}`}>
                    <span className="text-2xl">{uploading ? "⏳" : "📷"}</span>
                    <div>
                      <p className="font-bold text-slate-600 text-sm">{uploading ? "กำลังอัพโหลด..." : `เพิ่มรูป (เหลือได้อีก ${4-images.length} รูป)`}</p>
                      <p className="text-slate-400 text-xs">JPG, PNG ขนาดไม่เกิน 5MB</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple disabled={uploading} onChange={handleImageUpload} className="hidden" />
                  </label>
                ) : (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <span>✅</span><p className="text-emerald-700 text-sm font-bold">แนบครบ 4 รูปแล้ว</p>
                  </div>
                )}
                {errors.images && <p className="text-red-500 text-xs mt-1">กรุณาแนบรูปอย่างน้อย 1 รูป</p>}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0 bg-white rounded-b-3xl">
          <button onClick={onClose} className="px-4 py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => handleSave(true)} disabled={loading || uploading}
            className="flex-1 py-3 rounded-2xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> : "📝 ร่างรายงาน"}
          </button>
          <button onClick={() => handleSave(false)} disabled={loading || uploading}
            className="flex-[2] py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : uploading ? "⏳ รอรูปอัพโหลด..."
              : isEdit ? "💾 บันทึกการแก้ไข" : "✅ บันทึกและส่ง"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// DeptGroupPanel
// ══════════════════════════════════════════════════════════
function DeptGroupPanel({ group, allTeachers, onEdit, onDelete, gradeLevelMap, subjectMap, deputySignatureUrl, directorSignatureUrl }: {
  group: DeptGroup;
  allTeachers: Teacher[];
  onEdit: (m: PLCMeeting) => void;
  onDelete: (id: string) => void;
  gradeLevelMap: Record<string, string>;
  subjectMap: Record<string, string>;
  deputySignatureUrl?: string;
  directorSignatureUrl?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewMeeting, setViewMeeting] = useState<PLCMeeting | null>(null);

  const meta = group.scope === "grade" ? GRADE_META : getGroupMeta(group.label);

  return (
    <>
      {viewMeeting && (
        <ReportDetailModal
          meeting={viewMeeting}
          allTeachers={allTeachers}
          onClose={() => setViewMeeting(null)}
          onEdit={m => { setViewMeeting(null); onEdit(m); }}
          onDelete={id => { onDelete(id); setViewMeeting(null); }}
          canEdit={false}
          gradeLevelMap={gradeLevelMap}
          subjectMap={subjectMap}
          deputySignatureUrl={deputySignatureUrl}
          directorSignatureUrl={directorSignatureUrl}
        />
      )}
      <div className={`border-2 ${meta.borderColor} ${meta.bgLight} rounded-2xl overflow-hidden`}>
        <button className="w-full px-5 py-4 flex items-center gap-4 text-left hover:brightness-95 transition-all" onClick={() => setExpanded(!expanded)}>
          <div className="text-3xl shrink-0">{meta.icon}</div>
          <div className="flex-1 min-w-0">
            <p className={`font-black text-sm ${meta.textColor}`}>{group.label}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-slate-500 text-xs font-bold">{group.teachers.length} คน · {group.meetings.length} ครั้ง</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black border ${meta.textColor} bg-white ${meta.borderColor}`}>
                {group.totalHours} ชม.
              </span>
            </div>
          </div>
          <span className={`${meta.textColor} text-sm shrink-0`}>{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="border-t border-white/60">
            {group.teachers.length > 0 && (
              <div className="px-5 py-3 border-b border-white/50">
                <p className="text-xs font-black text-slate-500 mb-2">สมาชิกในกลุ่ม ({group.teachers.length} คน)</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.teachers.map(t => {
                    const tHours = group.meetings.reduce((s, m) =>
                      m.participants?.includes(t.id) ? s + Number(m.duration_hours) : s, 0
                    );
                    return (
                      <div key={t.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
                        <span className="text-slate-700 font-bold text-xs">{fullName(t)}</span>
                        <span className="text-xs font-black px-1.5 py-0.5 rounded-lg border text-blue-600 bg-blue-50 border-blue-200">{tHours} ชม.</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="px-5 py-4">
              {group.meetings.length === 0 ? (
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
                        <th className="text-center pb-2 text-xs font-black text-slate-400">ดูรายงาน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/60">
                      {group.meetings.map(m => (
                        <tr key={m.id} className="hover:bg-white/50">
                          <td className="py-2.5 pr-3 text-center">
                            <span className="text-xs font-black text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-0.5">{m.meeting_number ?? "—"}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-slate-600 font-bold whitespace-nowrap">{toThaiDate(m.meeting_date)}</td>
                          <td className="py-2.5 pr-3">
                            <p className="font-bold text-slate-700 text-xs line-clamp-1">{m.title}</p>
                            {m.topic && <p className="text-slate-400 text-[10px]">{m.topic}</p>}
                          </td>
                          <td className="py-2.5 pr-3 text-center"><span className="font-black text-blue-600 text-xs">{m.duration_hours}</span></td>
                          <td className="py-2.5 pr-3 text-center">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${m.status === "submitted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                              {m.status === "submitted" ? "✅ ส่งแล้ว" : "📝 ร่าง"}
                            </span>
                          </td>
                          <td className="py-2.5 text-center">
                            <button onClick={() => setViewMeeting(m)} className="text-[10px] font-black text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50">👁️ ดูรายงาน</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// AllReportsModal
// ══════════════════════════════════════════════════════════
function AllReportsModal({ meetings, allTeachers, academicYears, selectedYearId, onClose, onEdit, onDelete, canEdit, gradeLevelMap, subjectMap, deputySignatureUrl, directorSignatureUrl }: {
  meetings: PLCMeeting[]; allTeachers: Teacher[]; academicYears: AcademicYear[];
  selectedYearId: string; onClose: () => void; onEdit: (m: PLCMeeting) => void;
  onDelete: (id: string) => void; canEdit: boolean;
  gradeLevelMap: Record<string, string>; subjectMap: Record<string, string>;
  deputySignatureUrl?: string; directorSignatureUrl?: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"draft"|"submitted">("all");
  const [scopeFilter, setScopeFilter] = useState<"all"|MeetingScope>("all");
  const [viewMeeting, setViewMeeting] = useState<PLCMeeting | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const selectedYear = academicYears.find(y => y.id === selectedYearId);
  const yearLabel = selectedYear ? `ปีการศึกษา ${selectedYear.year_name} ภาคเรียนที่ ${selectedYear.semester}` : "";
  const filtered = meetings.filter(m => {
    const ms = m.title.toLowerCase().includes(search.toLowerCase()) || (m.topic ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || m.status === statusFilter;
    const matchesScope = scopeFilter === "all" || (m.meeting_scope ?? "subject") === scopeFilter;
    return ms && matchesStatus && matchesScope;
  });
  const submitted  = meetings.filter(m => m.status === "submitted").length;
  const draft      = meetings.filter(m => m.status === "draft").length;
  const totalHours = meetings.reduce((s,m) => s + Number(m.duration_hours), 0);

  async function handlePrintRow(m: PLCMeeting) {
    setPrintingId(m.id);
    try {
      const facilitator = allTeachers.find(t => t.id === m.facilitator_id);
      const participants = allTeachers.filter(t => m.participants?.includes(t.id));
      await printPLCReportAsync(m, facilitator, participants, facilitator?.signature_url, deputySignatureUrl, directorSignatureUrl, gradeLevelMap, subjectMap);
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <>
      {viewMeeting && (
        <ReportDetailModal meeting={viewMeeting} allTeachers={allTeachers} onClose={() => setViewMeeting(null)}
          onEdit={m => { setViewMeeting(null); onClose(); onEdit(m); }}
          onDelete={id => { onDelete(id); setViewMeeting(null); }}
          canEdit={canEdit}
          gradeLevelMap={gradeLevelMap}
          subjectMap={subjectMap}
        />
      )}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div><h3 className="font-black text-slate-800 text-lg">📊 รายงานทั้งหมด</h3><p className="text-blue-600 text-xs font-black mt-0.5">{yearLabel}</p></div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">✕</button>
          </div>
          <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-3 gap-3 shrink-0">
            {[
              { label:"ชั่วโมงรวม", value:totalHours, unit:"ชม.", color:"text-blue-600", bg:"bg-blue-50", border:"border-blue-200" },
              { label:"ส่งแล้ว", value:submitted, unit:"ครั้ง", color:"text-emerald-600", bg:"bg-emerald-50", border:"border-emerald-200" },
              { label:"ร่าง", value:draft, unit:"ครั้ง", color:"text-amber-600", bg:"bg-amber-50", border:"border-amber-200" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl px-4 py-3 text-center`}>
                <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
                <div className="text-xs text-slate-400 font-bold">{c.unit} · {c.label}</div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 border-b border-slate-100 flex gap-3 shrink-0 flex-wrap">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหา..."
              className="flex-1 min-w-[180px] bg-white border-2 border-blue-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-500 focus:outline-none" />
            <div className="flex gap-1.5">
              {(["all","subject","grade"] as const).map(s => (
                <button key={s} onClick={() => setScopeFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-black border-2 ${scopeFilter===s?"bg-indigo-600 border-indigo-600 text-white":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {s==="all"?"ทุกประเภท":s==="subject"?"📚 กลุ่มสาระ":`${GRADE_META.icon} สายชั้น`}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {(["all","submitted","draft"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-black border-2 ${statusFilter===s?"bg-slate-800 border-slate-800 text-white":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {s==="all"?"ทั้งหมด":s==="submitted"?"✅ ส่งแล้ว":"📝 ร่าง"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-y-auto flex-1 px-6 py-4">
            {filtered.length === 0 ? <div className="text-center py-16 text-slate-400">ไม่พบรายการ</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100">
                    <th className="text-left pb-3 text-xs font-black text-slate-400">ครั้งที่</th>
                    <th className="text-left pb-3 text-xs font-black text-slate-400">ประเภท</th>
                    <th className="text-left pb-3 text-xs font-black text-slate-400">วันที่</th>
                    <th className="text-left pb-3 text-xs font-black text-slate-400">ชื่อ / หัวข้อ</th>
                    <th className="text-center pb-3 text-xs font-black text-slate-400">ชม.</th>
                    <th className="text-center pb-3 text-xs font-black text-slate-400">สถานะ</th>
                    <th className="text-center pb-3 text-xs font-black text-slate-400">จัดการ</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(m => {
                      const isGrade = (m.meeting_scope ?? "subject") === "grade";
                      return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="py-3 pr-3 text-center"><span className="text-xs font-black text-slate-500 bg-slate-100 rounded-lg px-2 py-0.5">{m.meeting_number ?? "—"}</span></td>
                          <td className="py-3 pr-3">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border whitespace-nowrap ${isGrade ? `${GRADE_META.bgLight} ${GRADE_META.textColor} ${GRADE_META.borderColor}` : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                              {isGrade ? `${GRADE_META.icon} ${gradeLabel(m.grade_level ?? "", gradeLevelMap)}` : "📚 กลุ่มสาระ"}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-xs text-slate-600 font-bold whitespace-nowrap">{toThaiDate(m.meeting_date)}</td>
                          <td className="py-3 pr-3"><p className="font-bold text-slate-800 text-sm line-clamp-1">{m.title}</p>{m.topic&&<p className="text-slate-400 text-xs">{m.topic}</p>}</td>
                          <td className="py-3 pr-3 text-center"><span className="font-black text-blue-600">{m.duration_hours}</span></td>
                          <td className="py-3 pr-3 text-center"><span className={`text-xs font-black px-2 py-1 rounded-lg border ${m.status==="submitted"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200"}`}>{m.status==="submitted"?"✅ ส่งแล้ว":"📝 ร่าง"}</span></td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setViewMeeting(m)} className="text-xs font-black text-blue-500 px-2 py-1.5 rounded-lg hover:bg-blue-50">👁️ ดู</button>
                              <button onClick={() => handlePrintRow(m)} disabled={printingId === m.id} className="text-xs font-black text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                                {printingId === m.id ? "⏳" : "🖨️"}
                              </button>
                              {canEdit && <>
                                <button onClick={() => { onClose(); onEdit(m); }} className="text-xs font-black text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100">✏️</button>
                                <button onClick={() => { if(confirm("ยืนยันลบ?")) onDelete(m.id); }} className="text-xs font-black text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-50">🗑️</button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

// ══════════════════════════════════════════════════════════
// TeacherHistorySection
// ══════════════════════════════════════════════════════════
function TeacherHistorySection({ meetings, userId, allTeachers, onEdit, onDelete, onView, gradeLevelMap, subjectMap, deputySignatureUrl, directorSignatureUrl }: {
  meetings: PLCMeeting[]; userId: string; allTeachers: Teacher[];
  onEdit: (m: PLCMeeting) => void; onDelete: (id: string) => void; onView: (m: PLCMeeting) => void;
  gradeLevelMap: Record<string, string>; subjectMap: Record<string, string>;
  deputySignatureUrl?: string; directorSignatureUrl?: string;
}) {
  const [printingId, setPrintingId] = useState<string | null>(null);
  const myMeetings = meetings
    .filter(m => m.participants?.includes(userId))
    .sort((a,b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
  const totalHours = myMeetings.reduce((s,m) => s + Number(m.duration_hours), 0);

  async function handlePrint(m: PLCMeeting) {
    setPrintingId(m.id);
    try {
      const facilitator = allTeachers.find(t => t.id === m.facilitator_id);
      const participants = allTeachers.filter(t => m.participants?.includes(t.id));
      await printPLCReportAsync(m, facilitator, participants, facilitator?.signature_url, deputySignatureUrl, directorSignatureUrl, gradeLevelMap, subjectMap);
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 px-6 py-5 flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border-2 border-blue-200 flex flex-col items-center justify-center shrink-0">
          <span className="text-2xl font-black text-blue-600 leading-none">{totalHours}</span>
          <span className="text-[10px] text-blue-400 font-bold">ชม.</span>
        </div>
        <div className="flex-1">
          <p className="font-black text-slate-700 text-base">ชั่วโมง PLC ของฉัน</p>
          <p className="text-slate-400 text-sm">{myMeetings.length} ครั้ง · รวม {totalHours} ชั่วโมง</p>
        </div>
        <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">📊 สะสมอยู่</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-700 text-sm">📋 ประวัติการบันทึก PLC</h3>
          <span className="text-xs text-slate-400 font-bold">{myMeetings.length} รายการ</span>
        </div>
        {myMeetings.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-sm font-bold">ยังไม่มีรายการบันทึก</p>
            <p className="text-xs mt-1">กดปุ่มด้านบนเพื่อเริ่มบันทึกชั่วโมง PLC</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {myMeetings.map(m => {
              const isGrade = (m.meeting_scope ?? "subject") === "grade";
              const hasImages = (m.image_urls && m.image_urls.length > 0) || (m.image_paths && m.image_paths.length > 0);
              return (
                <div key={m.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {m.meeting_number && <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ครั้งที่ {m.meeting_number}</span>}
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${isGrade ? `${GRADE_META.bgLight} ${GRADE_META.textColor} ${GRADE_META.borderColor}` : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                          {isGrade ? `${GRADE_META.icon} ${gradeLabel(m.grade_level ?? "", gradeLevelMap)}` : "📚 กลุ่มสาระ"}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${m.status==="submitted"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {m.status==="submitted"?"✅ ส่งแล้ว":"📝 ร่าง"}
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 text-sm line-clamp-1">{m.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        <span>📅 {toThaiDate(m.meeting_date)}</span>
                        {m.start_time && m.end_time && <span>🕐 {m.start_time}–{m.end_time}</span>}
                        <span className="font-black text-blue-600">⏱️ {m.duration_hours} ชม.</span>
                        {m.location && <span>📍 {m.location}</span>}
                      </div>
                      {hasImages && (
                        <div className="flex gap-1.5 mt-2">
                          {(m.image_paths && m.image_paths.length > 0 ? m.image_paths : (m.image_urls ?? [])).slice(0,4).map((_, i) => (
                            <ResolvedImage
                              key={i}
                              path={m.image_paths?.[i]}
                              url={m.image_urls?.[i]}
                              alt={`thumb-${i}`}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 cursor-pointer"
                              onClick={() => onView(m)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handlePrint(m)} disabled={printingId === m.id} className="text-xs font-black text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                        {printingId === m.id ? "⏳" : "🖨️"}
                      </button>
                      <button onClick={() => onView(m)} className="text-xs font-black text-blue-500 px-2 py-1.5 rounded-lg hover:bg-blue-50">👁️</button>
                      <button onClick={() => onEdit(m)} className="text-xs font-black text-slate-400 px-2 py-1.5 rounded-lg hover:bg-slate-100">✏️</button>
                      <button onClick={() => { if(confirm("ยืนยันลบ?")) onDelete(m.id); }} className="text-xs font-black text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-50">🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════
export default function PLCHoursPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<UserProfile | null>(null);
  const [allTeachers,    setAllTeachers]    = useState<Teacher[]>([]);
  const [academicYears,  setAcademicYears]  = useState<AcademicYear[]>([]);
  const [gradeLevelMap,  setGradeLevelMap]  = useState<Record<string, string>>({});
  const [subjectMap,     setSubjectMap]     = useState<Record<string, string>>({});
  const [meetings,       setMeetings]       = useState<PLCMeeting[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [loading,        setLoading]        = useState(true);
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editMeeting,    setEditMeeting]    = useState<Partial<PLCMeeting> | null>(null);
  const [viewScope,      setViewScope]      = useState<MeetingScope>("subject");
  const [activeGroupKey, setActiveGroupKey] = useState<string>("all");
  const [showReports,    setShowReports]    = useState(false);
  const [viewMeeting,    setViewMeeting]    = useState<PLCMeeting | null>(null);
  const [deputySignature, setDeputySignature] = useState<string>("");
  const [directorSignature, setDirectorSignature] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const email = authUser.email || authUser.user_metadata?.email || "";

      let profileData: any = null;
      const { data: byAuthId } = await supabase.from("users")
        .select("id, title, first_name, last_name, full_name, email, role, position, academic_level, department_id, grade_level")
        .eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;
      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id, title, first_name, last_name, full_name, email, role, position, academic_level, department_id, grade_level")
          .eq("email", email).maybeSingle();
        profileData = byEmail;
        if (profileData) await (supabase.from("users") as any).update({ auth_id: authUser.id }).eq("id", profileData.id);
      }
      if (profileData) {
        setUser({
          ...profileData,
          full_name: profileData.full_name || `${profileData.title ?? ""}${profileData.first_name ?? ""} ${profileData.last_name ?? ""}`.trim(),
        });
      }

      // โหลดปีการศึกษา
      const { data: years } = await supabase.from("academic_years")
        .select("id, year_name, semester, is_current")
        .order("year_name", { ascending: false })
        .order("semester", { ascending: false });
      const ys = (years as AcademicYear[]) || [];
      setAcademicYears(ys);
      const currentYear = ys.find(y => y.is_current) ?? ys[0];
      if (currentYear) setSelectedYearId(currentYear.id);

      // โหลด grade_levels map: id → name
      const { data: gradeLevelsData } = await supabase.from("grade_levels").select("id, name");
      const glMap: Record<string, string> = {};
      (gradeLevelsData || []).forEach((g: any) => { glMap[g.id] = g.name; });
      setGradeLevelMap(glMap);

      // โหลด departments map: id → name (สำหรับ academic_level ที่เป็น UUID)
      const { data: deptData } = await supabase.from("departments").select("id, name");
      const sMap: Record<string, string> = {};
      (deptData || []).forEach((d: any) => { sMap[d.id] = d.name; });
      setSubjectMap(sMap);

      // โหลด users (ครู)
      const { data: allUsersData } = await supabase
        .from("users")
        .select("id, title, first_name, last_name, full_name, email, role, position, academic_level, department_id, grade_level, signature_url")
        .order("first_name");
      
      // ใน useEffect init หลังโหลด allUsersData เสร็จ เพิ่ม:
      const { data: approversData } = await supabase
        .from("users")
        .select("email, signature_url")
        .in("email", [DEPUTY_EMAIL, DIRECTOR_EMAIL]);

      const deputy = (approversData || []).find((u: any) => u.email === DEPUTY_EMAIL);
      const director = (approversData || []).find((u: any) => u.email === DIRECTOR_EMAIL);
      setDeputySignature(deputy?.signature_url || "");
      setDirectorSignature(director?.signature_url || "");

      const teachers: Teacher[] = (allUsersData || [])
        .filter((t: any) => !ADMIN_ROLES_SET.has(t.role ?? ""))
        .map((t: any) => ({
          ...t,
          full_name: t.full_name || `${t.title ?? ""}${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
        }));

      setAllTeachers(teachers);
      setLoading(false);
    })();
  }, []);

  const isAdmin   = !!(user?.role && ADMIN_ROLES_SET.has(user.role));
  const isTeacher = !isAdmin;

  const loadMeetings = useCallback(async () => {
    if (!selectedYearId) return;
    const { data } = await supabase.from("plc_meetings").select("*")
      .eq("academic_year_id", selectedYearId)
      .order("meeting_date", { ascending: false });
    setMeetings((data as PLCMeeting[]) || []);
  }, [selectedYearId]);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  const meetingsInScope = useMemo(
    () => meetings.filter(m => (m.meeting_scope ?? "subject") === viewScope),
    [meetings, viewScope]
  );

  // สร้าง deptGroups — ใช้ label ที่ resolve แล้ว
  const deptGroups = useMemo((): DeptGroup[] => {
    if (viewScope === "grade") {
      const levelMap = new Map<string, Teacher[]>();
      for (const t of allTeachers) {
        const lv = (t.grade_level ?? "").trim();
        if (!lv) continue;
        if (!levelMap.has(lv)) levelMap.set(lv, []);
        levelMap.get(lv)!.push(t);
      }
      return Array.from(levelMap.entries()).map(([lv, teachers]) => {
        const teacherIds = new Set(teachers.map(t => t.id));
        const groupMeetings = meetingsInScope.filter(m =>
          m.grade_level === lv || m.participants?.some(pid => teacherIds.has(pid))
        );
        const totalHours = groupMeetings.reduce((s, m) => s + Number(m.duration_hours), 0);
        return { key: lv, label: gradeLabel(lv, gradeLevelMap), scope: "grade" as MeetingScope, teachers, meetings: groupMeetings, totalHours };
      }).sort((a, b) => a.key.localeCompare(b.key, "th"));
    }

    const levelMap = new Map<string, Teacher[]>();
    for (const t of allTeachers) {
      const lv = (t.academic_level ?? "").trim();
      if (!lv) continue;
      if (!levelMap.has(lv)) levelMap.set(lv, []);
      levelMap.get(lv)!.push(t);
    }
    return Array.from(levelMap.entries()).map(([lv, teachers]) => {
      const teacherIds = new Set(teachers.map(t => t.id));
      const groupMeetings = meetingsInScope.filter(m =>
        m.participants?.some(pid => teacherIds.has(pid))
      );
      const totalHours = groupMeetings.reduce((s, m) => s + Number(m.duration_hours), 0);
      return { key: lv, label: subjectLabel(lv, subjectMap), scope: "subject" as MeetingScope, teachers, meetings: groupMeetings, totalHours };
    }).sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [allTeachers, meetingsInScope, viewScope, gradeLevelMap, subjectMap]);

  const uniqueGroupKeys = useMemo(() => deptGroups.map(g => g.key), [deptGroups]);

  const filteredGroups = useMemo(() => {
    if (activeGroupKey === "all") return deptGroups;
    return deptGroups.filter(g => g.key === activeGroupKey);
  }, [deptGroups, activeGroupKey]);

  useEffect(() => { setActiveGroupKey("all"); }, [viewScope]);

  const totalHoursAll = meetings.reduce((s, m) => s + Number(m.duration_hours), 0);
  const totalMeetings = meetings.length;
  const totalTeachers = allTeachers.length;

  async function handleSave(data: any, isDraft: boolean) {
    const payload = { ...data, status: isDraft ? "draft" : "submitted" };
    if (editMeeting?.id) {
      const { error } = await (supabase.from("plc_meetings") as any).update(payload).eq("id", editMeeting.id);
      if (error) { alert("❌ " + error.message); return; }
    } else {
      const { error } = await (supabase.from("plc_meetings") as any)
        .insert([{ ...payload, academic_year_id: selectedYearId }]);
      if (error) { alert("❌ " + error.message); return; }
    }
    setModalOpen(false); setEditMeeting(null);
    await loadMeetings();
  }

  async function handleDelete(id: string) {
    await supabase.from("plc_meetings").delete().eq("id", id);
    await loadMeetings();
  }

  function openAdd() {
    setEditMeeting({ academic_year_id: selectedYearId, meeting_scope: viewScope === "grade" ? "grade" : "subject" });
    setModalOpen(true);
  }

  const currentYearObj   = academicYears.find(y => y.id === selectedYearId);
  const currentYearLabel = currentYearObj ? `ปีการศึกษา ${currentYearObj.year_name} ภาคเรียนที่ ${currentYearObj.semester}` : "";

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลด...</div></div>;
  if (!user)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</div></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">บันทึกชั่วโมง PLC</h1>
            <p className="text-blue-600 text-xs font-bold truncate">
              {isTeacher ? fullName(user) + " · " : "ผู้บริหาร · "}{currentYearLabel}
            </p>
          </div>
          {academicYears.length > 1 && (
            <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)}
              className="shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 text-xs font-bold focus:outline-none focus:border-blue-400">
              {academicYears.map(y => <option key={y.id} value={y.id}>ปี {y.year_name} เทอม {y.semester}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 py-6 space-y-6">

        {/* TEACHER VIEW */}
        {isTeacher && (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex gap-2 bg-white border-2 border-slate-200 rounded-2xl p-1.5">
                <button onClick={() => setViewScope("subject")}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${viewScope === "subject" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                  📚 กลุ่มสาระ
                </button>
                <button onClick={() => setViewScope("grade")}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${viewScope === "grade" ? "bg-cyan-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                  {GRADE_META.icon} สายชั้น
                </button>
              </div>
              <button onClick={openAdd}
                className="flex items-center gap-3 px-10 py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-lg shadow-lg transition-all">
                <span className="text-3xl">➕</span>
                <div className="text-left">
                  <div>บันทึกชั่วโมง PLC</div>
                  <div className="text-blue-200 text-xs font-bold mt-0.5">คลิกเพื่อเพิ่มรายการประชุมใหม่</div>
                </div>
              </button>
            </div>
            <TeacherHistorySection
              meetings={meetings} userId={user.id} allTeachers={allTeachers}
              onEdit={m => { setEditMeeting(m); setModalOpen(true); }}
              onDelete={handleDelete}
              onView={m => setViewMeeting(m)}
              gradeLevelMap={gradeLevelMap}
              subjectMap={subjectMap}
              deputySignatureUrl={deputySignature}
              directorSignatureUrl={directorSignature}
            />
          </>
        )}

        {/* ADMIN VIEW */}
        {isAdmin && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:"จำนวนครั้ง", value:totalMeetings, unit:"ครั้ง", color:"text-emerald-600", bg:"bg-emerald-50", border:"border-emerald-200", icon:"📅" },
                { label:"ครูทั้งหมด", value:totalTeachers, unit:"คน",   color:"text-amber-600",   bg:"bg-amber-50",   border:"border-amber-200",   icon:"👩‍🏫" },
                { label:"ชั่วโมงรวม", value:totalHoursAll, unit:"ชม.",  color:"text-blue-600",    bg:"bg-blue-50",    border:"border-blue-200",    icon:"⏱️"  },
              ].map(card => (
                <div key={card.label} className={`${card.bg} border-2 ${card.border} rounded-2xl p-4 text-center`}>
                  <div className="text-2xl mb-1">{card.icon}</div>
                  <div className={`text-3xl font-black ${card.color} leading-none`}>{card.value}</div>
                  <div className="text-slate-500 text-xs font-bold mt-1">{card.unit}</div>
                  <div className="text-slate-400 text-[10px] font-bold mt-0.5">{card.label}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setShowReports(true)}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl px-6 py-4 flex items-center justify-between transition-all shadow-sm group">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📊</span>
                <div className="text-left">
                  <p className="font-black text-base">รายงานทั้งหมด</p>
                  <p className="text-indigo-200 text-xs">{totalMeetings} รายการ · {totalHoursAll} ชั่วโมง</p>
                </div>
              </div>
              <span className="text-white/60 group-hover:text-white text-xl">→</span>
            </button>

            <div className="flex gap-2 bg-white border-2 border-slate-200 rounded-2xl p-1.5 w-fit">
              <button onClick={() => setViewScope("subject")}
                className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-1.5 ${viewScope === "subject" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                📚 ดูตามกลุ่มสาระ
              </button>
              <button onClick={() => setViewScope("grade")}
                className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-1.5 ${viewScope === "grade" ? "bg-cyan-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                {GRADE_META.icon} ดูตามสายชั้น
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setActiveGroupKey("all")}
                className={`px-4 py-2 rounded-xl text-sm font-black border-2 whitespace-nowrap ${activeGroupKey === "all" ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {viewScope === "grade" ? "🏫 ทุกสายชั้น" : "🏫 ทุกกลุ่มสาระ"}
              </button>
              {uniqueGroupKeys.map(key => {
                const grp = deptGroups.find(g => g.key === key);
                const meta = viewScope === "grade" ? GRADE_META : getGroupMeta(grp?.label ?? key);
                return (
                  <button key={key} onClick={() => setActiveGroupKey(key)}
                    className={`px-4 py-2 rounded-xl text-sm font-black border-2 whitespace-nowrap flex items-center gap-1.5 ${activeGroupKey === key ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {meta.icon} {grp?.label ?? key}
                    {grp && grp.totalHours > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeGroupKey === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                        {grp.totalHours}ชม.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {filteredGroups.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">
                  <div className="text-4xl mb-2">📭</div>
                  <p className="text-sm font-bold">{viewScope === "grade" ? "ไม่พบข้อมูลสายชั้น" : "ไม่พบข้อมูลกลุ่มสาระ"}</p>
                </div>
              ) : filteredGroups.map(group => (
                <DeptGroupPanel
                  key={group.key}
                  group={group}
                  allTeachers={allTeachers}
                  onEdit={m => { setEditMeeting(m); setModalOpen(true); }}
                  onDelete={handleDelete}
                  gradeLevelMap={gradeLevelMap}
                  subjectMap={subjectMap}
                  deputySignatureUrl={deputySignature}
                  directorSignatureUrl={directorSignature}
                />
              ))}
            </div>

            {/* ตารางสรุปรายบุคคล */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                <h3 className="font-black text-slate-700 text-sm">👩‍🏫 สรุปชั่วโมงรายบุคคล</h3>
                <span className="text-xs text-slate-400 font-bold">รวมชั่วโมง PLC ทั้งหมด</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-xs font-black text-slate-400">ชื่อ–สกุล</th>
                      <th className="text-left px-3 py-3 text-xs font-black text-slate-400 hidden sm:table-cell">{viewScope === "grade" ? "สายชั้น" : "กลุ่มสาระ"}</th>
                      <th className="text-center px-3 py-3 text-xs font-black text-slate-400">ชั่วโมง</th>
                      <th className="text-center px-3 py-3 text-xs font-black text-slate-400">จำนวนครั้ง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(viewScope === "grade"
                      ? (activeGroupKey === "all" ? allTeachers : allTeachers.filter(t => (t.grade_level ?? "").trim() === activeGroupKey))
                      : (activeGroupKey === "all" ? allTeachers : allTeachers.filter(t => (t.academic_level ?? "").trim() === activeGroupKey))
                    )
                      .map(t => ({
                        ...t,
                        hours: meetingsInScope.reduce((s,m) => m.participants?.includes(t.id) ? s+Number(m.duration_hours) : s, 0),
                        count: meetingsInScope.filter(m => m.participants?.includes(t.id)).length,
                      }))
                      .sort((a,b) => b.hours - a.hours)
                      .map(t => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-bold text-slate-800">{fullName(t)}</td>
                          <td className="px-3 py-3 text-slate-500 text-xs hidden sm:table-cell">
                            {viewScope === "grade"
                              ? gradeLabel(t.grade_level ?? "", gradeLevelMap) || "—"
                              : subjectLabel(t.academic_level ?? "", subjectMap) || t.position || "—"
                            }
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-black text-blue-600 text-base">{t.hours}</span>
                            <span className="text-slate-400 text-xs"> ชม.</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-black text-slate-600">{t.count}</span>
                            <span className="text-slate-400 text-xs"> ครั้ง</span>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
                {allTeachers.length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-sm">ไม่พบข้อมูลครู</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {modalOpen && user && (
        <MeetingModal
          meeting={editMeeting}
          allTeachers={allTeachers}
          academicYears={academicYears}
          currentUserId={user.id}
          currentUser={user}
          gradeLevelMap={gradeLevelMap}
          subjectMap={subjectMap}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditMeeting(null); }}
        />
      )}
      {showReports && (
        <AllReportsModal
          meetings={meetings} allTeachers={allTeachers} academicYears={academicYears}
          selectedYearId={selectedYearId} onClose={() => setShowReports(false)}
          onEdit={m => { setShowReports(false); setEditMeeting(m); setModalOpen(true); }}
          onDelete={handleDelete} canEdit={isAdmin}
          gradeLevelMap={gradeLevelMap}
          subjectMap={subjectMap}
          deputySignatureUrl={deputySignature}
          directorSignatureUrl={directorSignature}
        />
      )}
      {viewMeeting && user && (
        <ReportDetailModal
          meeting={viewMeeting} allTeachers={allTeachers}
          onClose={() => setViewMeeting(null)}
          onEdit={m => { setViewMeeting(null); setEditMeeting(m); setModalOpen(true); }}
          onDelete={id => { handleDelete(id); setViewMeeting(null); }}
          canEdit={true}
          gradeLevelMap={gradeLevelMap}
          subjectMap={subjectMap}
          deputySignatureUrl={deputySignature}
          directorSignatureUrl={directorSignature}
        />
      )}
    </div>
  );
}