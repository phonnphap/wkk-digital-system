"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentFiscalYear, isInFiscalYear } from "@/lib/leave-config";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  HR_EMAIL, ADMIN_EMAIL, APPROVER_2_EMAIL, APPROVER_3_EMAIL, MAX_HOURS, MAX_MINUTES, SUB_LOAD_WARN_AT,
  type OutStatus, type UserProfile, type OutDuty, type SubMeta,
  fullName, displayName, bangkokToday, toThaiDate, toThaiDateLong, toThaiDateTime, toClock, clockToIso,
  fiscalYearLabel, fiscalYearRange, calcHours, fmtHours, fmtMinutes, addMinutesToClock, toMin,
  gradeHeadsOf, mySlotFor, canActOn,
  loadTimetableBundle, findAffectedEntries, buildDuties, isCovered, normalizeDuties,
  loadSubMeta, candidatesForDuty, autoAssign, syncSubstitutions, dutyRows,
  notifySubmitted, notifyApproved, notifyRejected, notifyCancelled, notifySubstitutes, pushOutTeams,
  buildGooutHTML, preloadLogo, LOGO,
} from "@/lib/goout-core";

const supabase = createClient();

// ═══════════════════════════════════════════════════════════
// Small UI atoms
// ═══════════════════════════════════════════════════════════
const inp = (err?: boolean) =>
  `w-full bg-white border-2 ${err ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "border-slate-200 focus:border-teal-500 focus:ring-teal-100"} rounded-xl px-4 py-3 text-slate-800 text-sm font-medium focus:outline-none focus:ring-4 transition`;

const STATUS: Record<OutStatus, { label: string; icon: string; cls: string }> = {
  draft:     { label: "ร่าง",        icon: "📝", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  pending:   { label: "รออนุมัติ",   icon: "⏳", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  approved:  { label: "อนุญาตแล้ว",  icon: "✅", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejected:  { label: "ไม่อนุญาต",   icon: "❌", cls: "bg-red-100 text-red-700 border-red-300" },
  cancelled: { label: "ยกเลิก",      icon: "🚫", cls: "bg-slate-100 text-slate-500 border-slate-300" },
};
function StatusBadge({ status }: { status: OutStatus }) {
  const s = STATUS[status] ?? STATUS.pending;
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border ${s.cls}`}>{s.icon} {s.label}</span>;
}

function ApprovalSteps({ r }: { r: any }) {
  const steps = [
    { label: "หน.สายชั้น", st: r.approver_1_status },
    { label: "รอง ผอ.บุคคล", st: r.approver_2_status },
    { label: "ผอ.", st: r.approver_3_status },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${
            s.st === "approved" ? "bg-emerald-100 border-emerald-300 text-emerald-700"
            : s.st === "rejected" ? "bg-red-100 border-red-300 text-red-700"
            : "bg-slate-100 border-slate-200 text-slate-500"}`}>
            {s.st === "approved" ? "✓" : s.st === "rejected" ? "✕" : i + 1} {s.label}
          </span>
          {i < 2 && <span className="text-slate-300 text-xs">›</span>}
        </div>
      ))}
    </div>
  );
}

function HoursMeter({ hours }: { hours: number | null }) {
  const pct = hours ? Math.min((hours / MAX_HOURS) * 100, 100) : 0;
  const over = hours !== null && hours > MAX_HOURS;
  const tone = over ? "bg-red-500" : hours && hours > 2 ? "bg-amber-400" : "bg-teal-500";
  return (
    <div className={`rounded-2xl border-2 p-4 ${over ? "bg-red-50 border-red-200" : "bg-teal-50 border-teal-100"}`}>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-xs font-bold text-slate-500">รวมเวลาที่ขอออก</p>
          <p className={`text-3xl font-black ${over ? "text-red-600" : "text-teal-700"}`}>
            {hours === null ? "–" : fmtHours(hours)} <span className="text-base font-bold">ชั่วโมง</span>
          </p>
        </div>
        <p className="text-xs font-black text-slate-400">สูงสุด {MAX_HOURS} ชม.</p>
      </div>
      <div className="h-2.5 bg-white rounded-full overflow-hidden border border-slate-100">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${over ? 100 : pct}%` }} />
      </div>
    </div>
  );
}

function SectionCard({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-teal-50/70 to-white">
        <span className="w-8 h-8 rounded-xl bg-teal-600 text-white font-black text-sm flex items-center justify-center shadow">{n}</span>
        <div>
          <h3 className="font-black text-slate-800 leading-tight">{title}</h3>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// SignaturePad
// ═══════════════════════════════════════════════════════════
function SignaturePad({ initialUrl, onSave, onClose, title = "✍️ ลายเซ็น" }: {
  initialUrl: string; onSave: (d: string) => void; onClose: () => void; title?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!initialUrl);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [preview, setPreview] = useState(initialUrl || "");

  useEffect(() => {
    if (mode !== "draw") return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    c.width = c.offsetWidth * devicePixelRatio; c.height = c.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 9999, 9999);
    ctx.strokeStyle = "#1e3a8a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, [mode]);

  function xy(e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: (e as React.MouseEvent).clientX - r.left, y: (e as React.MouseEvent).clientY - r.top };
  }
  function start(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); const c = canvasRef.current!; const ctx = c.getContext("2d")!; const p = xy(e, c); ctx.beginPath(); ctx.moveTo(p.x, p.y); setDrawing(true); setIsEmpty(false); }
  function move(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); if (!drawing) return; const c = canvasRef.current!; const ctx = c.getContext("2d")!; const p = xy(e, c); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function end(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); setDrawing(false); }
  function clear() { const c = canvasRef.current!; const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.offsetWidth, c.offsetHeight); setIsEmpty(true); setPreview(""); }
  function save() {
    if (mode === "upload") { if (!preview) { alert("กรุณาเลือกรูป"); return; } onSave(preview); return; }
    if (isEmpty) { alert("กรุณาวาดลายเซ็น"); return; }
    onSave(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div><h3 className="font-black text-slate-800">{title}</h3><p className="text-xs text-slate-400">วาดเอง หรือแนบไฟล์ PNG พื้นหลังโปร่งใส</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 font-bold">✕</button>
        </div>
        <div className="flex border-b border-slate-100">
          {([["draw", "✏️ วาดเอง"], ["upload", "📁 แนบไฟล์ PNG"]] as const).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 py-3 text-sm font-black border-b-2 ${mode === m ? "border-teal-500 text-teal-600" : "border-transparent text-slate-400"}`}>{l}</button>
          ))}
        </div>
        <div className="p-4">
          {mode === "draw" ? (
            <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white" style={{ touchAction: "none" }}>
              <canvas ref={canvasRef} style={{ width: "100%", height: 200, display: "block", cursor: "crosshair" }}
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
            </div>
          ) : (
            <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-xl p-6 text-center cursor-pointer hover:bg-teal-50">
              {preview ? <img src={preview} alt="sig" className="max-h-28 mx-auto object-contain" /> : <><div className="text-4xl mb-2">📁</div><p className="text-sm font-bold text-slate-500">คลิกเพื่อเลือก PNG</p></>}
              <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                const r = new FileReader(); r.onload = ev => { setPreview(ev.target?.result as string); setIsEmpty(false); }; r.readAsDataURL(f);
              }} />
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex gap-3">
          {mode === "draw" && <button onClick={clear} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">🗑️ ล้าง</button>}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">ยกเลิก</button>
          <button onClick={save} className="flex-[2] py-2.5 rounded-xl bg-teal-600 text-white font-black text-sm">💾 บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Hooks: timetable (lazy + cached) / substitute meta
// ═══════════════════════════════════════════════════════════
let TT_CACHE: { entries: any[]; academicYearId: string | null } | null = null;

function useTimetable() {
  const [state, setState] = useState(TT_CACHE);
  const [loading, setLoading] = useState(false);
  const ensure = useCallback(async () => {
    if (TT_CACHE) { setState(TT_CACHE); return; }
    setLoading(true);
    try { TT_CACHE = await loadTimetableBundle(supabase); setState(TT_CACHE); }
    catch (e) { console.error("[goout timetable]", e); }
    setLoading(false);
  }, []);
  return { entries: state?.entries ?? [], academicYearId: state?.academicYearId ?? null, loading, ensure };
}

/** โหลดตราโรงเรียนเป็น data URI (ใช้ในพรีวิว/พิมพ์ ซึ่งเป็น about:blank) แล้วคืนค่าเพื่อให้ฟอร์มสร้างใหม่ */
function useLogo() {
  const [logo, setLogo] = useState<string | undefined>(LOGO.data);
  useEffect(() => { if (!LOGO.data) preloadLogo().then(setLogo); }, []);
  return logo;
}

const EMPTY_META: SubMeta = { onLeave: new Set(), busy: [] };
function useSubMeta(date: string, excludeOutId: string | null, entries: any[], enabled: boolean) {
  const [meta, setMeta] = useState<SubMeta>(EMPTY_META);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !date) { setMeta(EMPTY_META); return; }
    let cancel = false;
    setLoading(true);
    loadSubMeta(supabase, date, excludeOutId, entries)
      .then(m => { if (!cancel) { setMeta(m); setLoading(false); } })
      .catch(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [date, excludeOutId, enabled, entries]);
  return { meta, loading };
}

// ═══════════════════════════════════════════════════════════
// TeacherPicker + DutyPanel (ภาระงาน/จัดครูสอนแทน) — ใช้ทั้งฝั่งผู้ขอและหัวหน้าสาย
// ═══════════════════════════════════════════════════════════
function TeacherPicker({ options, value, onChange, loadMap, placeholder }: {
  options: UserProfile[]; value: string | null; onChange: (id: string | null) => void;
  loadMap: Record<string, number>; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const sel = options.find(t => t.id === value);
  const list = options.filter(t => displayName(t).toLowerCase().includes(q.toLowerCase()));
  const badge = (id: string) => {
    const n = loadMap[id] ?? 0;
    return <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${n >= SUB_LOAD_WARN_AT ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>{n >= SUB_LOAD_WARN_AT ? "⚠️ " : ""}รวม {n} คาบ</span>;
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full text-left border-2 border-slate-200 hover:border-teal-300 rounded-xl px-3 py-2.5 text-sm bg-white flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${sel ? "font-bold text-slate-800" : "text-slate-400"}`}>{sel ? displayName(sel) : placeholder}</span>
          {sel && badge(sel.id)}
        </span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-teal-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 พิมพ์ชื่อ..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="w-full px-4 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50">✕ ล้างการเลือก (ให้หัวหน้าสายจัดให้)</button>}
            {list.length === 0 ? <div className="px-4 py-3 text-slate-400 text-sm text-center">ไม่พบครูที่ว่าง</div> : list.map(t => (
              <button key={t.id} type="button" onClick={() => { onChange(t.id); setOpen(false); setQ(""); }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-teal-50 flex items-center justify-between gap-2 ${t.id === value ? "bg-teal-50" : ""}`}>
                <span className="truncate"><span className="font-bold text-slate-800">{displayName(t)}</span>{t.position && <span className="text-slate-400 text-xs ml-2">{t.position}</span>}</span>
                {badge(t.id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DutyPanel({ requester, date, duties, setDuties, meta, metaLoading, entries, teachers, readOnly, audience }: {
  requester: UserProfile; date: string; duties: OutDuty[]; setDuties: (d: OutDuty[]) => void;
  meta: SubMeta | null; metaLoading: boolean; entries: any[]; teachers: UserProfile[];
  readOnly: boolean; audience: "requester" | "head";
}) {
  const ctx = { date, entries, teachers, requester, meta: meta ?? EMPTY_META };
  const byId = useMemo(() => Object.fromEntries(teachers.map(t => [t.id, t])), [teachers]);
  const needing = duties.filter(d => !isCovered(d, meta));
  const unassigned = needing.filter(d => !d.substitute_teacher_id).length;
  const upd = (i: number, patch: Partial<OutDuty>) => setDuties(duties.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  if (duties.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-4 py-4 flex items-center gap-3">
        <span className="text-2xl">🎉</span>
        <div><p className="font-black text-emerald-700 text-sm">ภาระงาน: ไม่มี</p><p className="text-emerald-600 text-xs">ช่วงเวลาที่ขอออกไม่ตรงกับคาบสอนของคุณ</p></div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 px-4 py-3">
        <p className="font-black text-amber-800 text-sm">📚 ภาระงาน: มี {duties.length} คาบที่ตรงกับเวลาที่ออก</p>
        <p className="text-amber-700 text-xs mt-0.5">
          {audience === "requester"
            ? "กรอกงานที่มอบหมาย แล้วเลือกครูสอนแทนเองหรือกดจัดอัตโนมัติ — ถ้าไม่เลือก หัวหน้าสายชั้นจะเป็นผู้จัดให้"
            : "จัดครูสอนแทนในคาบที่ยังว่าง แล้วกดบันทึก"}
        </p>
      </div>

      {!readOnly && needing.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button type="button" disabled={metaLoading} onClick={() => setDuties(autoAssign(duties, ctx))}
            className="flex-1 min-w-[160px] py-2.5 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-black text-sm hover:bg-emerald-100 disabled:opacity-50">
            🤖 จัดครูสอนแทนอัตโนมัติ
          </button>
          <button type="button" disabled={metaLoading} onClick={() => setDuties(autoAssign(duties, ctx, true))}
            className="py-2.5 px-4 rounded-xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 font-black text-sm hover:bg-indigo-100 disabled:opacity-50">
            🎲 สุ่มใหม่
          </button>
        </div>
      )}
      {metaLoading && <p className="text-xs text-slate-400 animate-pulse">⏳ กำลังตรวจสอบความว่างของครู...</p>}

      <div className="space-y-2.5">
        {duties.map((d, i) => {
          const covered = isCovered(d, meta);
          const co = d.co_teacher_id ? byId[d.co_teacher_id] : null;
          const coLeave = !!d.co_teacher_id && !covered;
          const head = (
            <div className="w-32 shrink-0 text-xs">
              <p className="font-black text-slate-700">คาบ {d.slot_number ?? "-"} · {(d.start_time ?? "").slice(0, 5)}–{(d.end_time ?? "").slice(0, 5)}</p>
              <p className="text-slate-500 font-bold truncate">{d.subject_name ?? "ไม่ระบุวิชา"}</p>
              <p className="text-slate-400 truncate">{d.grade_group ?? ""} {d.room_name ?? ""}</p>
            </div>
          );
          if (covered) return (
            <div key={d.entry_id} className="border-2 border-emerald-200 bg-emerald-50 rounded-2xl p-3 flex items-center gap-3 flex-wrap">
              {head}<p className="text-xs font-bold text-emerald-700">👥 {co ? displayName(co) : "ครูอีกท่าน"} สอนคู่อยู่แล้ว — ไม่ต้องจัดครูสอนแทน</p>
            </div>
          );
          const pool = readOnly ? [] : candidatesForDuty(d, ctx, duties);
          const loadMap = Object.fromEntries(pool.map(c => [c.teacher.id, c.load]));
          const subT = d.substitute_teacher_id ? byId[d.substitute_teacher_id] : null;
          return (
            <div key={d.entry_id} className={`border-2 rounded-2xl p-3 flex items-start gap-3 flex-wrap ${d.substitute_teacher_id ? "border-slate-100 bg-white" : "border-amber-200 bg-amber-50/40"}`}>
              {head}
              <div className="flex-1 min-w-[230px] space-y-2">
                {coLeave && <p className="text-[11px] font-bold text-red-600">⚠️ ครูคู่สอนไม่ว่างในเวลานี้ — ต้องจัดครูสอนแทน</p>}
                {readOnly ? (
                  <>
                    <p className="text-xs text-slate-600"><span className="text-slate-400 font-bold">งานที่มอบหมาย:</span> {d.task || "-"}</p>
                    <p className={`text-xs font-black ${subT ? "text-slate-700" : "text-amber-600"}`}>{subT ? `🔄 ครูสอนแทน: ${displayName(subT)}` : "⏳ ยังไม่ได้จัดครูสอนแทน (รอหัวหน้าสายชั้น)"}</p>
                  </>
                ) : (
                  <>
                    <input value={d.task} onChange={e => upd(i, { task: e.target.value })} placeholder="งานที่มอบหมาย เช่น ให้นักเรียนทำใบงานหน้า 12"
                      className={inp(!d.task.trim())} />
                    <TeacherPicker options={pool.map(c => c.teacher)} value={d.substitute_teacher_id} loadMap={loadMap}
                      onChange={id => upd(i, { substitute_teacher_id: id })} placeholder="— เลือกครูสอนแทน (หรือปล่อยว่างให้หัวหน้าสายจัด) —" />
                    {!d.substitute_teacher_id && <p className="text-[11px] font-bold text-amber-600">⏳ ยังไม่เลือก → หัวหน้าสายชั้นจะจัดให้</p>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {unassigned > 0 && audience === "head" && <p className="text-xs font-black text-red-600">⚠️ ยังมี {unassigned} คาบที่ยังไม่ได้จัดครูสอนแทน</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Preview: อ่านและกดยืนยันก่อนส่ง
// ═══════════════════════════════════════════════════════════
function printHTML(html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("⚠️ เบราว์เซอร์บล็อก popup กรุณาอนุญาตแล้วลองใหม่"); return; }
  win.document.open(); win.document.write(html); win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

function GooutPreview({ html, signatureUrl, onConfirm, onBack, onEditSignature, sending }: {
  html: string; signatureUrl: string; onConfirm: () => void; onBack: () => void; onEditSignature: () => void; sending: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [read, setRead] = useState(false);
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    const doc = ref.current?.contentDocument; if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, [html]);
  const can = read && agree && !!signatureUrl && !sending;

  return (
    <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[94vh] sm:rounded-3xl sm:max-w-4xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-600 to-cyan-600 text-white flex items-center justify-between shrink-0">
          <div><h3 className="font-black text-lg">📄 ตรวจสอบแบบฟอร์มก่อนส่ง</h3><p className="text-xs text-teal-100">อ่านให้ครบถ้วน แล้วติ๊กยืนยันด้านล่าง</p></div>
          <div className="flex gap-2">
            <button onClick={() => printHTML(html)} className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold">🖨️ พิมพ์</button>
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 font-bold">✕</button>
          </div>
        </div>
        <div className="flex-1 bg-slate-200 p-2 sm:p-4 overflow-y-auto min-h-0">
          {!ready && <div className="flex items-center justify-center h-64 text-slate-500 font-bold animate-pulse">⏳ กำลังสร้างแบบฟอร์ม...</div>}
          <iframe ref={ref} title="แบบฟอร์ม" className={`w-full border-none rounded-lg bg-white shadow-lg h-[56vh] sm:h-[62vh] ${ready ? "block" : "hidden"}`} />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div><p className="font-bold text-slate-700 text-sm">✍️ ลายเซ็นผู้ขออนุญาต</p><p className={`text-xs font-semibold ${signatureUrl ? "text-slate-400" : "text-amber-500 animate-pulse"}`}>{signatureUrl ? "พร้อมแล้ว" : "⚠️ ยังไม่มีลายเซ็น"}</p></div>
            <div className="flex items-center gap-2">
              {signatureUrl && <img src={signatureUrl} alt="sig" className="h-9 max-w-[110px] object-contain border border-slate-200 rounded-lg" />}
              <button onClick={onEditSignature} className="px-3 py-2 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-700 text-xs font-bold">{signatureUrl ? "✏️ เซ็นใหม่" : "✍️ เพิ่มลายเซ็น"}</button>
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} className="mt-1 w-4 h-4 accent-teal-600" />
            <span>ข้าพเจ้าได้อ่านและตรวจสอบข้อมูลในแบบฟอร์มข้างต้นครบถ้วนแล้ว ข้อมูลถูกต้องเป็นความจริง</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 w-4 h-4 accent-teal-600" />
            <span>รับทราบว่าต้องได้รับอนุญาตก่อนออกนอกบริเวณโรงเรียน และต้องกดบันทึกเวลา <b>ออก / กลับ</b> จริงในระบบทุกครั้ง</span>
          </label>
          <div className="flex gap-3">
            <button onClick={onBack} className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-black">← แก้ไข</button>
            <button onClick={onConfirm} disabled={!can}
              className={`flex-[2] py-3 rounded-2xl font-black flex items-center justify-center gap-2 ${can ? "bg-teal-600 hover:bg-teal-700 text-white shadow-lg" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
              {sending ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังส่ง...</> : "📤 ยืนยันและส่งคำขอ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OutForm — แบบฟอร์มขอออกนอกบริเวณโรงเรียน
// ═══════════════════════════════════════════════════════════
function OutForm({ user, allTeachers, heads, savedSignature, editData, entries, loadingTimetable, onSubmit, onCancel, onGoLeave }: {
  user: UserProfile; allTeachers: UserProfile[]; heads: UserProfile[]; savedSignature: string; editData?: any;
  entries: any[]; loadingTimetable: boolean;
  onSubmit: (payload: any, duties: OutDuty[]) => Promise<boolean>;
  onCancel: () => void; onGoLeave: () => void;
}) {
  const today = bangkokToday();
  const isEdit = !!editData?.id;
  const [date, setDate] = useState<string>(editData?.request_date ?? today);
  const [start, setStart] = useState<string>(editData?.planned_start?.slice(0, 5) ?? "");
  const [end, setEnd] = useState<string>(editData?.planned_end?.slice(0, 5) ?? "");
  const [purpose, setPurpose] = useState<string>(editData?.purpose ?? "");
  const [destination, setDestination] = useState<string>(editData?.destination ?? "");
  const [duties, setDuties] = useState<OutDuty[]>(editData?.duties ?? []);
  const [sigUrl, setSigUrl] = useState(editData?.signature_url || savedSignature || "");
  const [showSig, setShowSig] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));
  const logo = useLogo();

  const hours = start && end ? calcHours(start, end) : null;
  const over = hours !== null && hours > MAX_HOURS;
  const badRange = !!start && !!end && hours === null;
  const pastDate = !!date && date < today;

  const affected = useMemo(
    () => (date && hours !== null && !loadingTimetable ? findAffectedEntries(entries, user.id, date, start, end) : []),
    [entries, user.id, date, start, end, hours, loadingTimetable]
  );
  const affectedKey = affected.map(e => e.id).join(",");
  useEffect(() => {
    if (loadingTimetable) return;
    setDuties(prev => buildDuties(affected, user.id, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectedKey, loadingTimetable]);

  const { meta, loading: metaLoading } = useSubMeta(date, editData?.id ?? null, entries, affected.length > 0);

  const dutiesOk = duties.every(d => isCovered(d, meta) || d.task.trim());
  const canSubmit = !!date && hours !== null && !over && !pastDate && !!purpose.trim() && !!destination.trim()
    && dutiesOk && !loadingTimetable && !metaLoading;

  const previewHtml = useMemo(() => buildGooutHTML({
    fullName: fullName(user), position: user.position ?? user.role,
    createdAt: editData?.created_at ?? new Date().toISOString(),
    purpose, destination, start, end, hours: hours ?? 0,
    rows: dutyRows(normalizeDuties(duties, meta), allTeachers, meta),
    requesterSig: sigUrl,
    op1: { name: heads.map(displayName).join(" / "), position: "หัวหน้าสายชั้น" },
  }), [user, editData, purpose, destination, start, end, hours, duties, meta, allTeachers, sigUrl, heads, logo]);

  function payload(status: "draft" | "pending") {
    return {
      request_date: date, purpose: purpose.trim(), destination: destination.trim(),
      planned_start: start, planned_end: end, planned_hours: hours ?? 0,
      signature_url: sigUrl || null, status,
    };
  }
  async function saveDraft() {
    if (!date || hours === null || over) { setTouched({ start: true, end: true }); alert("กรุณาระบุวันที่และเวลาให้ถูกต้อง (ไม่เกิน 3 ชั่วโมง) ก่อนบันทึกร่าง"); return; }
    setSending(true);
    await onSubmit({ ...payload("draft"), purpose: purpose.trim() || "-", destination: destination.trim() || "-" }, normalizeDuties(duties, meta));
    setSending(false);
  }
  function review() {
    setTouched({ date: true, start: true, end: true, purpose: true, destination: true });
    if (!canSubmit) { alert("กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง"); return; }
    setShowPreview(true);
  }
  async function confirm() {
    setSending(true);
    const ok = await onSubmit(payload("pending"), normalizeDuties(duties, meta));
    setSending(false);
    if (!ok) return;
    setShowPreview(false);
  }

  const err = {
    date: touched.date && (!date || pastDate), start: touched.start && !start, end: touched.end && (!end || badRange),
    purpose: touched.purpose && !purpose.trim(), destination: touched.destination && !destination.trim(),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/60 to-slate-50 flex flex-col">
      {showSig && <SignaturePad initialUrl={sigUrl} onSave={async d => { setSigUrl(d); setShowSig(false); await (supabase.from("users") as any).update({ signature_url: d }).eq("id", user.id); }} onClose={() => setShowSig(false)} />}
      {showPreview && (
        <GooutPreview html={previewHtml} signatureUrl={sigUrl} sending={sending} onConfirm={confirm}
          onBack={() => setShowPreview(false)} onEditSignature={() => { setShowPreview(false); setShowSig(true); }} />
      )}

      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onCancel} className="w-10 h-10 rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-100 text-slate-600 text-xl">←</button>
        <div className="flex-1"><h2 className="text-lg font-black text-slate-800">{isEdit ? "แก้ไขคำขอออกนอกโรงเรียน" : "ขออนุญาตออกนอกบริเวณโรงเรียน"}</h2>
          <p className="text-slate-500 text-xs">{fullName(user)} · {user.position}</p></div>
        <span className="hidden sm:inline-block px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-xs font-black">กรณีไม่เกิน 3 ชั่วโมง</span>
      </div>

      <div className="flex-1 px-4 py-6 max-w-3xl w-full mx-auto space-y-5">
        <SectionCard n={1} title="วัน–เวลาที่ขอออก" hint="เลือกวันที่และช่วงเวลาที่จะออกจากโรงเรียน (รวมไม่เกิน 3 ชั่วโมง)">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">วันที่ <span className="text-red-500">*</span></label>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} onBlur={() => touch("date")} className={inp(err.date)} />
            {date && <p className="text-xs text-teal-600 mt-1 font-medium">{toThaiDateLong(date)}</p>}
            {pastDate && <p className="text-xs text-red-500 mt-1 font-bold">ไม่สามารถขอย้อนหลังได้</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">ออกเวลา <span className="text-red-500">*</span></label>
              <input type="time" value={start} onChange={e => { setStart(e.target.value); }} onBlur={() => touch("start")} className={inp(err.start)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">กลับเวลา <span className="text-red-500">*</span></label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} onBlur={() => touch("end")} className={inp(err.end)} />
            </div>
          </div>
          {start && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400">เลือกเร็ว:</span>
              {[30, 60, 90, 120, 180].map(m => (
                <button key={m} type="button" onClick={() => setEnd(addMinutesToClock(start, m))}
                  className="px-3 py-1.5 rounded-full border-2 border-teal-100 bg-white text-teal-700 text-xs font-black hover:bg-teal-50">
                  +{m >= 60 ? `${m / 60} ชม.` : `${m} นาที`}
                </button>
              ))}
            </div>
          )}
          {badRange && <p className="text-xs font-bold text-red-500">เวลากลับต้องมากกว่าเวลาออก</p>}
          <HoursMeter hours={hours} />
          {over && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
              <p className="font-black text-red-700 text-sm">⛔ ขออนุญาตออกนอกโรงเรียนได้ไม่เกิน {MAX_HOURS} ชั่วโมง</p>
              <p className="text-red-600 text-xs font-bold">หากต้องใช้เวลามากกว่านี้ กรุณายื่น <u>ใบลาครึ่งวัน</u> ในระบบลาแทน</p>
              <button type="button" onClick={onGoLeave} className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm">🗓️ ไปยื่นใบลาครึ่งวัน →</button>
            </div>
          )}
        </SectionCard>

        <SectionCard n={2} title="เหตุผลและสถานที่">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">ขออนุญาตออกนอกบริเวณโรงเรียนเพื่อ <span className="text-red-500">*</span>
              <span className="text-slate-400 font-normal ml-2">({purpose.length}/150)</span></label>
            <textarea rows={3} value={purpose} onChange={e => e.target.value.length <= 150 && setPurpose(e.target.value)} onBlur={() => touch("purpose")}
              placeholder="เช่น ไปธนาคาร / พบแพทย์ / ติดต่อราชการ" className={inp(err.purpose) + " resize-none"} />
            {err.purpose && <p className="text-red-500 text-xs mt-1">กรุณาระบุเหตุผล</p>}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">สถานที่ไป <span className="text-red-500">*</span>
              <span className="text-slate-400 font-normal ml-2">({destination.length}/150)</span></label>
            <input value={destination} maxLength={150} onChange={e => setDestination(e.target.value.slice(0, 150))} onBlur={() => touch("destination")} placeholder="เช่น ธนาคารกรุงไทย สาขาธัญบุรี" className={inp(err.destination)} />
            {err.destination && <p className="text-red-500 text-xs mt-1">กรุณาระบุสถานที่</p>}
          </div>
        </SectionCard>

        <SectionCard n={3} title="ภาระงาน / คาบสอนที่ทับเวลา" hint="ระบบตรวจตารางสอนให้อัตโนมัติ">
          {loadingTimetable ? <p className="text-sm text-slate-400 animate-pulse">⏳ กำลังโหลดตารางสอน...</p>
            : hours === null || !date ? <p className="text-sm text-slate-400">เลือกวันและเวลาก่อน ระบบจะแสดงคาบสอนของคุณที่ทับกับช่วงเวลานี้</p>
            : <DutyPanel requester={user} date={date} duties={duties} setDuties={setDuties} meta={meta} metaLoading={metaLoading}
                entries={entries} teachers={allTeachers} readOnly={false} audience="requester" />}
        </SectionCard>

        <SectionCard n={4} title="ลำดับการอนุมัติ" hint="ส่งคำขอแล้ว ระบบแจ้งเตือนหัวหน้าสายชั้นและรองฝ่ายบุคคลทันที">
          <div className="flex items-stretch gap-2 flex-wrap">
            {[
              { n: 1, t: "หัวหน้าสายชั้น", s: heads.length ? heads.map(displayName).join(", ") : "ไม่มีหัวหน้าสายชั้น — ข้ามขั้นตอนนี้" },
              { n: 2, t: "รอง ผอ.ฝ่ายบุคคล", s: "น.ส.ฐิติมา กาบแก้ว" },
              { n: 3, t: "ผู้อำนวยการ", s: "นายธนณัฐ ศิระวงษ์ (อนุมัติอัตโนมัติพร้อมรอง ผอ.)" },
            ].map((a, i) => (
              <div key={a.n} className="flex items-center gap-2 flex-1 min-w-[170px]">
                <div className="flex-1 bg-teal-50 border border-teal-100 rounded-2xl px-3 py-2.5">
                  <p className="text-[11px] font-black text-teal-600">ขั้นที่ {a.n}</p>
                  <p className="text-sm font-black text-slate-700">{a.t}</p>
                  <p className="text-[11px] text-slate-500">{a.s}</p>
                </div>
                {i < 2 && <span className="text-teal-300 font-black">›</span>}
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between">
          <div><p className="font-bold text-slate-700">✍️ ลายเซ็น</p><p className="text-xs text-slate-400">{sigUrl ? "พร้อมแล้ว" : "ต้องเพิ่มก่อนส่งคำขอ"}</p></div>
          <div className="flex items-center gap-3">
            {sigUrl && <img src={sigUrl} alt="sig" className="h-10 max-w-[110px] object-contain border border-slate-200 rounded" />}
            <button onClick={() => setShowSig(true)} className="px-4 py-2.5 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-700 text-sm font-black hover:bg-teal-100">{sigUrl ? "✏️ เซ็นใหม่" : "✍️ เพิ่มลายเซ็น"}</button>
          </div>
        </div>

        <div className="flex gap-3 pb-10">
          <button onClick={saveDraft} disabled={sending} className="flex-1 py-4 rounded-2xl border-2 border-slate-300 bg-white text-slate-700 font-black hover:bg-slate-50 disabled:opacity-50">💾 บันทึกร่าง</button>
          <button onClick={review} disabled={sending || !canSubmit} className="flex-[2] py-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-black shadow-lg disabled:opacity-50">📄 ตรวจสอบแบบฟอร์มและส่ง</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RequestModal — รายละเอียด / อนุมัติ / จัดครูสอนแทน / บันทึกเวลาจริง
// ═══════════════════════════════════════════════════════════
function buildFormFromRequest(r: any, teachers: UserProfile[], usersMap: Record<string, any>, meta?: SubMeta | null) {
  const u = r.user;
  const nm = (id?: string | null) => (id ? fullName(usersMap[id] ?? teachers.find(t => t.id === id)) : "");
  // ยังไม่มีใครอนุมัติ → แสดงชื่อหัวหน้าสายชั้นของผู้ขอ (approver_1_id จะถูกบันทึกตอนกดอนุมัติ)
  const headNames = gradeHeadsOf({ id: r.user_id, grade_level: u?.grade_level }, teachers).map(displayName).join(" / ");
  return buildGooutHTML({
    fullName: fullName(u), position: u?.position ?? "", createdAt: r.created_at,
    purpose: r.purpose, destination: r.destination,
    start: String(r.planned_start).slice(0, 5), end: String(r.planned_end).slice(0, 5), hours: Number(r.planned_hours),
    rows: dutyRows(r.duties ?? [], teachers, meta),
    requesterSig: r.signature_url || u?.signature_url || "",
    op3: { status: r.approver_3_status, signature: r.approver_3_signature, at: r.approver_3_at, note: r.approver_3_note },
    op1: { status: r.approver_1_status, name: nm(r.approver_1_id) || headNames, position: "หัวหน้าสายชั้น", signature: r.approver_1_signature, at: r.approver_1_at, note: r.approver_1_note?.startsWith("ไม่มีหัวหน้า") ? "" : r.approver_1_note },
    op2: { status: r.approver_2_status, signature: r.approver_2_signature, at: r.approver_2_at, note: r.approver_2_note },
    actualOut: r.actual_out_at, actualBack: r.actual_back_at, actualMinutes: r.actual_minutes,
  });
}

function RequestModal({ r, viewer, allTeachers, usersMap, slot, canManage, canFixTimes, isSuperAdmin, approverSigUrl, onClose, onApprove, onReject, onChanged }: {
  r: any; viewer: UserProfile; allTeachers: UserProfile[]; usersMap: Record<string, any>;
  slot: 1 | 2 | 3 | null; canManage: boolean; canFixTimes: boolean; isSuperAdmin: boolean; approverSigUrl: string;
  onClose: () => void; onApprove: (r: any, slot: 1 | 2 | 3) => void; onReject: (r: any, slot: 1 | 2 | 3) => void; onChanged: () => void;
}) {
  const requester: UserProfile = { ...(r.user ?? {}), id: r.user_id, email: r.user?.email ?? "", role: r.user?.role ?? "" };
  const editable = canManage && ["pending", "approved"].includes(r.status) && !r.actual_out_at && r.request_date >= bangkokToday();
  const tt = useTimetable();
  useEffect(() => { if (editable) tt.ensure(); /* eslint-disable-next-line */ }, [editable]);

  const [duties, setDuties] = useState<OutDuty[]>(r.duties ?? []);
  useEffect(() => setDuties(r.duties ?? []), [r.id, r.duties]);
  const { meta, loading: metaLoading } = useSubMeta(r.request_date, r.id, tt.entries, editable && tt.entries.length > 0);
  const dirty = JSON.stringify(duties) !== JSON.stringify(r.duties ?? []);
  const [saving, setSaving] = useState(false);
  const [fixOut, setFixOut] = useState(r.actual_out_at ? toClock(r.actual_out_at) : "");
  const [fixBack, setFixBack] = useState(r.actual_back_at ? toClock(r.actual_back_at) : "");

  const canAct = canActOn(r, slot);
  const unassigned = duties.filter(d => !isCovered(d, editable ? meta : null) && !d.substitute_teacher_id).length;

  async function saveDuties() {
    setSaving(true);
    try {
      const normalized = normalizeDuties(duties, meta);
      const { error } = await (supabase.from("out_requests") as any).update({ duties: normalized, has_duties: normalized.length > 0 }).eq("id", r.id);
      if (error) throw error;
      await syncSubstitutions(supabase, r.id, r.user_id, r.request_date, normalized, viewer.id, tt.academicYearId, true);
      await notifySubstitutes(r, requester, normalized, allTeachers, r.duties ?? []);
      await pushOutTeams(supabase, r.id, "substituted");
      alert("✅ บันทึกการจัดครูสอนแทนเรียบร้อย");
      onChanged();
    } catch (e: any) { alert("❌ บันทึกไม่สำเร็จ: " + (e?.message ?? e)); }
    setSaving(false);
  }
  async function saveTimes() {
    const patch: any = {};
    patch.actual_out_at = fixOut ? clockToIso(r.request_date, fixOut) : null;
    patch.actual_back_at = fixBack ? clockToIso(r.request_date, fixBack) : null;
    patch.actual_minutes = fixOut && fixBack ? Math.max(0, toMin(fixBack) - toMin(fixOut)) : null;
    const { error } = await (supabase.from("out_requests") as any).update(patch).eq("id", r.id);
    if (error) { alert("❌ " + error.message); return; }
    alert("✅ แก้ไขเวลาจริงแล้ว"); onChanged();
  }
  async function superDelete() {
    if (!confirm("⚠️ ลบคำขอนี้ถาวร? (รวมรายการสอนแทนที่ผูกไว้)")) return;
    await supabase.from("substitution_records").delete().eq("out_request_id", r.id);
    const { error } = await supabase.from("out_requests").delete().eq("id", r.id);
    if (error) { alert("❌ " + error.message); return; }
    onClose(); onChanged();
  }

  const overActual = r.actual_minutes != null && r.actual_minutes > MAX_MINUTES;
  return (
    <div className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white px-6 py-4 flex items-center justify-between">
          <div><p className="font-black text-lg">🚪 ขอออกนอกโรงเรียน</p><p className="text-teal-100 text-sm">{fullName(r.user)} · {r.user?.position}</p></div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 font-bold">✕</button>
        </div>
        <div className="p-6 space-y-3 text-sm max-h-[68vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-2 flex-wrap"><StatusBadge status={r.status} /><ApprovalSteps r={r} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-2xl p-3"><p className="text-slate-400 text-xs font-bold">วันที่</p><p className="font-black text-slate-800">{toThaiDateLong(r.request_date)}</p></div>
            <div className="bg-slate-50 rounded-2xl p-3"><p className="text-slate-400 text-xs font-bold">เวลาที่ขอ</p>
              <p className="font-black text-slate-800">{String(r.planned_start).slice(0, 5)}–{String(r.planned_end).slice(0, 5)} น.</p>
              <p className="text-teal-600 text-xs font-bold">{fmtHours(Number(r.planned_hours))} ชั่วโมง</p></div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3"><p className="text-slate-400 text-xs font-bold">เพื่อ</p><p className="text-slate-700">{r.purpose}</p></div>
          <div className="bg-slate-50 rounded-2xl p-3"><p className="text-slate-400 text-xs font-bold">สถานที่ไป</p><p className="font-bold text-slate-800">📍 {r.destination}</p></div>

          <div className={`rounded-2xl border-2 p-3 ${overActual ? "border-red-300 bg-red-50" : "border-slate-100 bg-white"}`}>
            <p className="text-slate-400 text-xs font-bold mb-1">เวลาไป–กลับจริง</p>
            {r.actual_out_at ? (
              <p className="font-black text-slate-800">ออก {toClock(r.actual_out_at)} น. → {r.actual_back_at ? `กลับ ${toClock(r.actual_back_at)} น. (${fmtMinutes(r.actual_minutes ?? 0)})` : <span className="text-amber-600">ยังไม่กลับ</span>}</p>
            ) : <p className="text-slate-400">ยังไม่มีการบันทึก</p>}
            {overActual && <p className="text-xs font-black text-red-600 mt-1">⚠️ เกิน {MAX_HOURS} ชั่วโมงจริง</p>}
            {canFixTimes && (
              <div className="flex items-end gap-2 mt-2 flex-wrap">
                <label className="text-[11px] font-bold text-slate-500">ออก<input type="time" value={fixOut} onChange={e => setFixOut(e.target.value)} className="block border-2 border-slate-200 rounded-lg px-2 py-1 text-sm" /></label>
                <label className="text-[11px] font-bold text-slate-500">กลับ<input type="time" value={fixBack} onChange={e => setFixBack(e.target.value)} className="block border-2 border-slate-200 rounded-lg px-2 py-1 text-sm" /></label>
                <button onClick={saveTimes} className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-black">แก้เวลาจริง</button>
              </div>
            )}
          </div>

          {(duties.length > 0 || editable) && (
            <div className="pt-1">
              <p className="font-black text-slate-700 mb-2">ภาระงาน / ครูสอนแทน</p>
              {editable && tt.loading ? <p className="text-xs text-slate-400 animate-pulse">⏳ กำลังโหลดตารางสอน...</p> : (
                <DutyPanel requester={requester} date={r.request_date} duties={duties} setDuties={setDuties}
                  meta={editable ? meta : null} metaLoading={metaLoading} entries={tt.entries} teachers={allTeachers}
                  readOnly={!editable} audience="head" />
              )}
              {editable && dirty && (
                <button onClick={saveDuties} disabled={saving} className="w-full mt-3 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:opacity-50">
                  {saving ? "กำลังบันทึก..." : "💾 บันทึกการจัดครูสอนแทน"}
                </button>
              )}
            </div>
          )}

          {r.status === "rejected" && r.reject_reason && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3"><p className="text-red-500 text-xs font-bold">❌ เหตุผลที่ไม่อนุญาต</p><p className="text-red-700 font-bold">{r.reject_reason}</p></div>
          )}

          {slot !== null && (
            <div className="pt-1">
              {canAct ? (
                !approverSigUrl && slot !== 3 ? (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 text-center"><p className="text-amber-700 font-black text-sm">⚠️ กรุณาเพิ่มลายเซ็นก่อนอนุมัติ (ปุ่มลายเซ็นด้านบนของหน้า)</p></div>
                ) : (
                  <>
                    {slot === 1 && unassigned > 0 && <p className="text-xs font-black text-amber-700 mb-2">⚠️ ยังมี {unassigned} คาบที่ยังไม่ได้จัดครูสอนแทน — ควรจัดก่อนอนุมัติ</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { if (dirty && !confirm("มีการจัดครูสอนแทนที่ยังไม่ได้บันทึก ต้องการอนุมัติต่อโดยไม่บันทึกหรือไม่?")) return; onApprove(r, slot); onClose(); }}
                        className="flex-1 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-lg">✅ อนุญาต</button>
                      <button onClick={() => { onReject(r, slot); onClose(); }} className="flex-1 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black shadow-lg">❌ ไม่อนุญาต</button>
                    </div>
                  </>
                )
              ) : (
                <div className="text-center py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm">
                  {r.status !== "pending" ? "รายการนี้ไม่อยู่ในสถานะรออนุมัติ"
                    : r[`approver_${slot}_status`] !== "pending" ? "คุณดำเนินการรายการนี้แล้ว" : "ยังไม่ถึงลำดับการอนุมัติของคุณ"}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={() => printHTML(buildFormFromRequest(r, allTeachers, usersMap))} className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-slate-700 font-black text-sm hover:bg-slate-50">🖨️ พิมพ์แบบฟอร์ม</button>
          {isSuperAdmin && <button onClick={superDelete} className="px-4 py-3 rounded-2xl border-2 border-red-300 bg-red-50 text-red-600 font-black text-sm">🗑️</button>}
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-800 text-white font-black text-sm">ปิด</button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ onConfirm, onClose }: { onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-black text-slate-800 text-lg mb-2">❌ ระบุเหตุผลที่ไม่อนุญาต</h3>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="กรุณาระบุเหตุผล..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-red-400 focus:outline-none mb-4" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={() => { if (!reason.trim()) { alert("กรุณาระบุเหตุผล"); return; } onConfirm(reason.trim()); }} className="flex-[2] py-3 rounded-xl bg-red-500 text-white font-black text-sm">ยืนยันไม่อนุญาต</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// สถิติ
// ═══════════════════════════════════════════════════════════
function calcStats(reqs: any[]) {
  const ok = reqs.filter(r => r.status === "approved");
  const planned = ok.reduce((s, r) => s + Number(r.planned_hours), 0);
  const done = ok.filter(r => r.actual_minutes != null);
  const actualMin = done.reduce((s, r) => s + Number(r.actual_minutes), 0);
  const over = done.filter(r => r.actual_minutes > MAX_MINUTES).length;
  const open = ok.filter(r => r.actual_out_at && !r.actual_back_at).length;
  return { times: ok.length, planned, actualHours: actualMin / 60, over, open };
}
function StatCards({ s }: { s: ReturnType<typeof calcStats> }) {
  const items = [
    { icon: "🚪", label: "จำนวนครั้ง", val: s.times, unit: "ครั้ง", tone: "text-teal-700 bg-teal-50 border-teal-200" },
    { icon: "🕐", label: "ชั่วโมงที่ขอรวม", val: fmtHours(Math.round(s.planned * 100) / 100), unit: "ชม.", tone: "text-sky-700 bg-sky-50 border-sky-200" },
    { icon: "⏱️", label: "ชั่วโมงจริงรวม", val: fmtHours(Math.round(s.actualHours * 100) / 100), unit: "ชม.", tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    { icon: "⚠️", label: "เกินกำหนด / ยังไม่กลับ", val: `${s.over} / ${s.open}`, unit: "ครั้ง", tone: s.over + s.open > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-slate-600 bg-slate-50 border-slate-200" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(i => (
        <div key={i.label} className={`rounded-2xl border-2 p-4 ${i.tone}`}>
          <div className="text-2xl mb-1">{i.icon}</div>
          <div className="text-2xl font-black">{i.val}<span className="text-xs font-bold ml-1 opacity-70">{i.unit}</span></div>
          <div className="text-[11px] font-bold opacity-80 leading-tight">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TeacherDashboard
// ═══════════════════════════════════════════════════════════
function TeacherDashboard({ user, allTeachers, savedSignature, onGoLeave }: {
  user: UserProfile; allTeachers: UserProfile[]; savedSignature: string; onGoLeave: () => void;
}) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [viewReq, setViewReq] = useState<any>(null);
  const [filterFY, setFilterFY] = useState(getCurrentFiscalYear());
  const tt = useTimetable();
  const heads = useMemo(() => gradeHeadsOf(user, allTeachers), [user, allTeachers]);
  const approvers = useMemo(() => [APPROVER_2_EMAIL, APPROVER_3_EMAIL].map(e => allTeachers.find(t => t.email?.toLowerCase() === e)), [allTeachers]);
  const today = bangkokToday();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("out_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setRequests((data || []).map((r: any) => ({ ...r, user })));
    setLoading(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  function openForm(r?: any) { tt.ensure(); if (r) setEditReq(r); setShowForm(true); }

  async function submitOut(p: any, duties: OutDuty[]): Promise<boolean> {
    const isDraft = p.status === "draft";
    const noHead = heads.length === 0;
    const now = new Date().toISOString();
    const rec = {
      ...p, user_id: user.id, duties, has_duties: duties.length > 0, reject_reason: null,
      approver_1_id: null, approver_1_status: noHead ? "approved" : "pending", approver_1_signature: null,
      approver_1_at: noHead ? now : null, approver_1_note: noHead ? "ไม่มีหัวหน้าสายชั้น (ข้ามขั้นตอน)" : null,
      approver_2_id: approvers[0]?.id ?? null, approver_2_status: "pending", approver_2_signature: null, approver_2_at: null, approver_2_note: null,
      approver_3_id: approvers[1]?.id ?? null, approver_3_status: "pending", approver_3_signature: null, approver_3_at: null, approver_3_note: null,
    };
    try {
      let id = editReq?.id as string | undefined;
      if (id) {
        const { error } = await (supabase.from("out_requests") as any).update(rec).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from("out_requests") as any).insert([rec]).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (isDraft) {
        await supabase.from("substitution_records").delete().eq("out_request_id", id!);
      } else {
        await syncSubstitutions(supabase, id!, user.id, p.request_date, duties, user.id, tt.academicYearId);
        const full = { ...rec, id };
        await notifySubmitted(full, user, allTeachers, !!editReq?.id);
        await notifySubstitutes(full, user, duties, allTeachers);
        await pushOutTeams(supabase, id!, editReq?.id ? "edited" : "submitted");
      }
      alert(isDraft ? "✅ บันทึกร่างเรียบร้อย" : "✅ ส่งคำขอแล้ว ระบบแจ้งหัวหน้าสายชั้นและรองฝ่ายบุคคลเรียบร้อย");
      setShowForm(false); setEditReq(null); await load();
      return true;
    } catch (e: any) { alert("❌ " + (e?.message ?? e)); return false; }
  }

  async function removeOrCancel(r: any) {
    const approved = r.status === "approved";
    if (!confirm(approved ? "ยืนยันยกเลิกคำขอนี้?" : "ยืนยันลบคำขอนี้?")) return;
    if (approved) {
      await (supabase.from("out_requests") as any).update({ status: "cancelled" }).eq("id", r.id);
      await (supabase.from("substitution_records") as any).update({ status: "cancelled" }).eq("out_request_id", r.id);
      await notifyCancelled(r, user, allTeachers);
      await pushOutTeams(supabase, r.id, "cancelled");
    } else {
      await supabase.from("substitution_records").delete().eq("out_request_id", r.id);
      const { error } = await supabase.from("out_requests").delete().eq("id", r.id);
      if (error) { alert("❌ " + error.message); return; }
    }
    await load();
  }

  async function recordOut(r: any) {
    if (!confirm("ยืนยันบันทึกเวลา \"ออกจากโรงเรียน\" ตอนนี้?")) return;
    const { error } = await (supabase.from("out_requests") as any).update({ actual_out_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { alert("❌ " + error.message); return; }
    await load();
  }
  async function recordBack(r: any) {
    if (!confirm("ยืนยันบันทึกเวลา \"กลับถึงโรงเรียน\" ตอนนี้?")) return;
    const now = new Date();
    const mins = Math.max(0, Math.round((now.getTime() - new Date(r.actual_out_at).getTime()) / 60000));
    const { error } = await (supabase.from("out_requests") as any).update({ actual_back_at: now.toISOString(), actual_minutes: mins }).eq("id", r.id);
    if (error) { alert("❌ " + error.message); return; }
    if (mins > MAX_MINUTES) alert(`⚠️ คุณอยู่นอกโรงเรียน ${fmtMinutes(mins)} เกิน ${MAX_HOURS} ชั่วโมง\nกรุณาติดต่อฝ่ายบุคคล/ยื่นใบลาครึ่งวันเพิ่มเติม`);
    await load();
  }

  if (showForm) return (
    <OutForm user={user} allTeachers={allTeachers} heads={heads} savedSignature={savedSignature} editData={editReq}
      entries={tt.entries} loadingTimetable={tt.loading || (tt.entries.length === 0 && !TT_CACHE)}
      onSubmit={submitOut} onCancel={() => { setShowForm(false); setEditReq(null); }} onGoLeave={onGoLeave} />
  );

  const fyReqs = requests.filter(r => isInFiscalYear(r.request_date, filterFY));
  const stats = calcStats(fyReqs);
  const outNow = requests.find(r => r.status === "approved" && r.actual_out_at && !r.actual_back_at);

  return (
    <div className="w-full min-h-screen">
      <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-600 px-6 py-6 text-white flex items-center justify-between gap-6 flex-wrap">
        <div>
          <p className="text-teal-100 font-bold">ยินดีต้อนรับ</p>
          <h2 className="text-2xl font-black">{fullName(user)}</h2>
          <p className="text-teal-100 font-bold">{user.position}</p>
        </div>
        <button onClick={() => openForm()} className="shrink-0 px-6 py-4 bg-white text-teal-700 rounded-2xl font-black shadow-xl hover:bg-teal-50 active:scale-95 flex items-center gap-3">
          <span className="text-3xl">🚪</span><span className="text-lg leading-tight">ขออนุญาต<br /><span className="text-sm opacity-70">ออกนอกโรงเรียน</span></span>
        </button>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-5xl mx-auto">
        {outNow && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <div><p className="font-black text-amber-800">🚶 คุณกำลังอยู่นอกโรงเรียน</p><p className="text-amber-700 text-sm">ออกเมื่อ {toClock(outNow.actual_out_at)} น. · กำหนดกลับ {String(outNow.planned_end).slice(0, 5)} น.</p></div>
            <button onClick={() => recordBack(outNow)} className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black">🏫 กลับถึงโรงเรียนแล้ว</button>
          </div>
        )}

        <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sky-800 text-sm font-bold">ℹ️ ขอออกนอกโรงเรียนได้ไม่เกิน <b>{MAX_HOURS} ชั่วโมง</b> ต่อครั้ง หากเกินให้ยื่น <b>ใบลาครึ่งวัน</b> แทน</p>
          <button onClick={onGoLeave} className="px-4 py-2 rounded-xl bg-white border-2 border-sky-200 text-sky-700 text-xs font-black hover:bg-sky-100">🗓️ ไปหน้าระบบลา</button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {[0, 1, 2].map(i => { const fy = getCurrentFiscalYear() - i; return (
            <button key={fy} onClick={() => setFilterFY(fy)} className={`px-3 py-2 rounded-xl text-sm font-black border-2 ${filterFY === fy ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>{fiscalYearLabel(fy)}</button>
          ); })}
        </div>
        <StatCards s={stats} />

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <h3 className="font-black text-slate-700">📋 ประวัติการขอออกนอกโรงเรียน</h3><span className="text-xs text-slate-400">{fyReqs.length} รายการ</span>
          </div>
          {loading ? <div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
            : fyReqs.length === 0 ? <div className="text-center py-10 text-slate-400">ยังไม่มีรายการ</div>
            : <div className="divide-y divide-slate-100">
              {fyReqs.map(r => {
                const canEdit = r.status === "draft" || (r.status === "pending" && r.approver_2_status === "pending" && (r.approver_1_status !== "approved" || !r.approver_1_id));
                const isToday = r.request_date === today;
                const over = r.actual_minutes != null && r.actual_minutes > MAX_MINUTES;
                return (
                  <div key={r.id} className="px-5 py-4 hover:bg-slate-50 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={r.status} />
                          <span className="text-slate-700 font-black text-sm">{toThaiDate(r.request_date)}</span>
                          <span className="text-teal-600 text-xs font-black">{String(r.planned_start).slice(0, 5)}–{String(r.planned_end).slice(0, 5)} น. ({fmtHours(Number(r.planned_hours))} ชม.)</span>
                        </div>
                        <p className="text-slate-500 text-xs line-clamp-1">📍 {r.destination} · {r.purpose}</p>
                        {r.actual_out_at && (
                          <p className={`text-xs font-bold ${over ? "text-red-600" : "text-slate-500"}`}>
                            ⏱️ จริง: ออก {toClock(r.actual_out_at)} น. {r.actual_back_at ? `→ กลับ ${toClock(r.actual_back_at)} น. (${fmtMinutes(r.actual_minutes ?? 0)})${over ? " ⚠️ เกินกำหนด" : ""}` : "→ ยังไม่ได้บันทึกกลับ"}
                          </p>
                        )}
                        <p className="text-slate-400 text-[11px]">🕐 ยื่นเมื่อ {toThaiDateTime(r.created_at)}</p>
                      </div>
                      <ApprovalSteps r={r} />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setViewReq(r)} className="text-xs font-bold text-teal-700 px-2.5 py-1.5 rounded-lg border border-teal-200 hover:bg-teal-50">👁️ ดู</button>
                      <button onClick={() => printHTML(buildFormFromRequest(r, allTeachers, {}))} className="text-xs font-bold text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">🖨️ พิมพ์</button>
                      {r.status === "approved" && isToday && !r.actual_out_at && (
                        <button onClick={() => recordOut(r)} className="text-xs font-black text-white px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700">🚶 ออกจากโรงเรียนแล้ว</button>
                      )}
                      {r.status === "approved" && r.actual_out_at && !r.actual_back_at && (
                        <button onClick={() => recordBack(r)} className="text-xs font-black text-white px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600">🏫 กลับถึงโรงเรียนแล้ว</button>
                      )}
                      {r.status === "approved" && !isToday && !r.actual_out_at && r.request_date > today && <span className="text-[11px] text-slate-400 self-center">กดบันทึกเวลาออกได้ในวันที่ขอ</span>}
                      {canEdit && <button onClick={() => openForm(r)} className="text-xs font-bold text-amber-600 px-2.5 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-50">✏️ แก้ไข</button>}
                      {(canEdit || (r.status === "approved" && !r.actual_out_at)) && (
                        <button onClick={() => removeOrCancel(r)} className="text-xs font-bold text-red-500 px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50">{r.status === "approved" ? "🚫 ยกเลิก" : "🗑️ ลบ"}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>
      </div>

      {viewReq && (
        <RequestModal r={viewReq} viewer={user} allTeachers={allTeachers} usersMap={{}} slot={null} canManage={false} canFixTimes={false}
          isSuperAdmin={false} approverSigUrl="" onClose={() => setViewReq(null)} onApprove={() => {}} onReject={() => {}} onChanged={load} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ApproverDashboard — หน.สายชั้น / รอง ผอ. / ผอ. / HR / Admin
// ═══════════════════════════════════════════════════════════
const TH_MONTHS = ["ต.ค.", "พ.ย.", "ธ.ค.", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย."];

function ApproverDashboard({ user, allTeachers, canApprove }: { user: UserProfile; allTeachers: UserProfile[]; canApprove: boolean }) {
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFY, setFilterFY] = useState(getCurrentFiscalYear());
  const [tab, setTab] = useState<"pending" | "today" | "history" | "summary" | "graph">("pending");
  const [filterStatus, setFilterStatus] = useState<OutStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<{ r: any; slot: 1 | 2 | 3 } | null>(null);
  const [sigUrl, setSigUrl] = useState(user.signature_url || "");
  const [showSig, setShowSig] = useState(false);
  const pendingAction = useRef<{ r: any; slot: 1 | 2 | 3 } | null>(null);

  const email = user.email?.toLowerCase();
  const isSuper = email === ADMIN_EMAIL;
  const isHRorAdmin = email === ADMIN_EMAIL || email === HR_EMAIL;
  const isHead = (user.extra_roles ?? []).includes("grade_head");
  const seesAll = [APPROVER_2_EMAIL, APPROVER_3_EMAIL, ADMIN_EMAIL, HR_EMAIL].includes(email);
  const today = bangkokToday();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: us } = await supabase.from("users").select("id,title,first_name,last_name,position,email,grade_level,phone,signature_url,role");
    const map: Record<string, any> = {}; (us || []).forEach((u: any) => { map[u.id] = u; });
    setUsersMap(map);
    const { start, end } = fiscalYearRange(filterFY);
    let all: any[] = []; let from = 0;
    while (true) {
      const { data, error } = await supabase.from("out_requests").select("*").gte("request_date", start).lte("request_date", end)
        .order("created_at", { ascending: false }).range(from, from + 999);
      if (error || !data?.length) break;
      all = all.concat(data); if (data.length < 1000) break; from += 1000;
    }
    setRequests(all.map(r => ({ ...r, user: map[r.user_id] ?? null })));
    setLoading(false);
  }, [filterFY]);
  useEffect(() => { load(); }, [load]);

  // หัวหน้าสายเห็นเฉพาะครูสายชั้นตัวเอง
  const scoped = useMemo(
    () => (seesAll ? requests : requests.filter(r => r.user?.grade_level && r.user.grade_level === user.grade_level)),
    [requests, seesAll, user.grade_level]
  );
  const visible = scoped.filter(r => r.status !== "draft");
  const pendingList = visible.filter(r => r.status === "pending");
  const todayList = visible.filter(r => r.request_date === today && r.status === "approved");
  const viewReq = requests.find(r => r.id === viewId) ?? null;
  const stats = calcStats(visible);

  async function handleApprove(r: any, slot: 1 | 2 | 3, action: "approved" | "rejected", reason?: string) {
    const now = new Date().toISOString();
    const upd: any = { [`approver_${slot}_status`]: action, [`approver_${slot}_id`]: user.id, [`approver_${slot}_at`]: now };
    let final = false;
    if (action === "approved") {
      upd[`approver_${slot}_signature`] = sigUrl;
      let s3ok = slot === 3 || r.approver_3_status === "approved" || !r.approver_3_id;
      if (slot === 2 && r.approver_3_id) { // รอง ผอ.อนุมัติ → ผอ.อนุมัติอัตโนมัติ (เหมือนระบบลา)
        upd.approver_3_status = "approved"; upd.approver_3_signature = usersMap[r.approver_3_id]?.signature_url || ""; upd.approver_3_at = now; s3ok = true;
      }
      const s1 = slot === 1 || r.approver_1_status === "approved";
      const s2 = slot === 2 || r.approver_2_status === "approved";
      if (s1 && s2 && s3ok) { upd.status = "approved"; final = true; }
    } else {
      upd[`approver_${slot}_note`] = reason; upd.reject_reason = reason; upd.status = "rejected";
    }
    const { error } = await (supabase.from("out_requests") as any).update(upd).eq("id", r.id);
    if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return; }

    const requester: UserProfile = { ...(r.user ?? {}), id: r.user_id };
    if (action === "rejected") {
      await (supabase.from("substitution_records") as any).update({ status: "cancelled" }).eq("out_request_id", r.id);
      await notifyRejected(r, requester, allTeachers, reason ?? "");
      await pushOutTeams(supabase, r.id, "rejected", { slot, reason });
    } else if (final) {
      await notifyApproved(r, requester, allTeachers); // → ผู้ขอ + หัวหน้าสายชั้น
      await pushOutTeams(supabase, r.id, "approved", { slot });
    }
    await load();
  }

  function tryApprove(r: any, slot: 1 | 2 | 3) {
    if (!sigUrl && slot !== 3) { pendingAction.current = { r, slot }; setShowSig(true); return; }
    handleApprove(r, slot, "approved");
  }
  async function saveSig(d: string) {
    setSigUrl(d); setShowSig(false);
    const { error } = await (supabase.from("users") as any).update({ signature_url: d }).eq("id", user.id);
    if (error) { alert("⚠️ บันทึกลายเซ็นไม่สำเร็จ: " + error.message); return; }
    const p = pendingAction.current; pendingAction.current = null;
    if (p) { // ใช้ลายเซ็นที่เพิ่งเซ็นทันที
      const { r, slot } = p;
      const now = new Date().toISOString();
      const upd: any = { [`approver_${slot}_status`]: "approved", [`approver_${slot}_id`]: user.id, [`approver_${slot}_at`]: now, [`approver_${slot}_signature`]: d };
      let s3ok = r.approver_3_status === "approved" || !r.approver_3_id;
      if (slot === 2 && r.approver_3_id) { upd.approver_3_status = "approved"; upd.approver_3_signature = usersMap[r.approver_3_id]?.signature_url || ""; upd.approver_3_at = now; s3ok = true; }
      const final = (slot === 1 || r.approver_1_status === "approved") && (slot === 2 || r.approver_2_status === "approved") && s3ok;
      if (final) upd.status = "approved";
      const { error: e2 } = await (supabase.from("out_requests") as any).update(upd).eq("id", r.id);
      if (e2) { alert("❌ " + e2.message); return; }
      if (final) { await notifyApproved(r, { ...(r.user ?? {}), id: r.user_id }, allTeachers); await pushOutTeams(supabase, r.id, "approved", { slot }); }
      await load();
    }
  }

  // ── รายบุคคล / กราฟ ──
  const byUser = useMemo(() => {
    const m = new Map<string, any[]>();
    visible.filter(r => r.status === "approved").forEach(r => m.set(r.user_id, [...(m.get(r.user_id) ?? []), r]));
    return Array.from(m.entries()).map(([id, rs]) => ({ user: usersMap[id], ...calcStats(rs) })).sort((a, b) => b.times - a.times);
  }, [visible, usersMap]);
  const graphData = TH_MONTHS.map((month, i) => {
    const cm = i < 3 ? i + 10 : i - 2; const cy = i < 3 ? filterFY - 1 : filterFY;
    const rs = visible.filter(r => r.status === "approved" && Number(r.request_date.slice(0, 4)) === cy && Number(r.request_date.slice(5, 7)) === cm);
    const s = calcStats(rs);
    return { month, "จำนวนครั้ง": s.times, "ชั่วโมงจริง": Math.round(s.actualHours * 10) / 10 };
  });
  const filteredHistory = visible.filter(r => (filterStatus === "all" || r.status === filterStatus)
    && (!search.trim() || fullName(r.user).toLowerCase().includes(search.trim().toLowerCase())));

  const roleText = email === APPROVER_2_EMAIL ? "👤 ผู้อนุมัติลำดับที่ 2 · รอง ผอ.ฝ่ายบุคคล" : email === APPROVER_3_EMAIL ? "👤 ผู้อนุมัติลำดับที่ 3 · ผู้อำนวยการ"
    : isHead ? "👥 ผู้อนุมัติลำดับที่ 1 · หัวหน้าสายชั้น" : email === HR_EMAIL ? "📋 ฝ่ายบุคคล (HR)" : "🔧 ผู้ดูแลระบบ";

  const Row = ({ r }: { r: any }) => {
    const sl = mySlotFor(user, r); const act = canApprove && canActOn(r, sl);
    return (
      <div className="px-5 py-4 hover:bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="font-black text-slate-800 text-sm">{fullName(r.user)} <span className="text-slate-400 font-bold text-xs">{r.user?.position}</span></p>
          <p className="text-xs text-teal-700 font-black">{toThaiDate(r.request_date)} · {String(r.planned_start).slice(0, 5)}–{String(r.planned_end).slice(0, 5)} น. ({fmtHours(Number(r.planned_hours))} ชม.)</p>
          <p className="text-xs text-slate-500">📍 {r.destination} · {r.purpose}</p>
          {(r.duties ?? []).length > 0 && (() => {
            const un = (r.duties as OutDuty[]).filter(d => !d.substitute_teacher_id && !d.co_teacher_id).length;
            return <p className={`text-[11px] font-black ${un ? "text-amber-600" : "text-emerald-600"}`}>📚 {r.duties.length} คาบ · {un ? `รอจัดครูสอนแทน ${un} คาบ` : "จัดครบแล้ว"}</p>;
          })()}
          {r.actual_out_at && <p className="text-[11px] font-bold text-slate-500">⏱️ ออก {toClock(r.actual_out_at)} {r.actual_back_at ? `→ กลับ ${toClock(r.actual_back_at)} (${fmtMinutes(r.actual_minutes ?? 0)})` : "→ ยังไม่กลับ"}</p>}
          <ApprovalSteps r={r} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={r.status} />
          <div className="flex gap-1.5">
            <button onClick={() => setViewId(r.id)} className={`text-xs font-black px-3 py-1.5 rounded-lg border ${act ? "bg-teal-600 text-white border-teal-600" : "text-teal-700 border-teal-200 hover:bg-teal-50"}`}>{act ? "👁️ ดู / อนุมัติ" : "👁️ ดู"}</button>
            {act && sl && <button onClick={() => tryApprove(r, sl)} className="text-xs font-black px-3 py-1.5 rounded-lg bg-emerald-500 text-white">✅</button>}
            {act && sl && <button onClick={() => setRejectFor({ r, slot: sl })} className="text-xs font-black px-3 py-1.5 rounded-lg bg-red-500 text-white">❌</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      {showSig && <SignaturePad initialUrl={sigUrl} title="✍️ ลายเซ็นผู้อนุมัติ" onSave={saveSig} onClose={() => { setShowSig(false); pendingAction.current = null; }} />}
      {rejectFor && <RejectModal onClose={() => setRejectFor(null)} onConfirm={reason => { handleApprove(rejectFor.r, rejectFor.slot, "rejected", reason); setRejectFor(null); }} />}
      {viewReq && (
        <RequestModal r={viewReq} viewer={user} allTeachers={allTeachers} usersMap={usersMap}
          slot={mySlotFor(user, viewReq)} canManage={canApprove && !!mySlotFor(user, viewReq)} canFixTimes={isHRorAdmin || email === APPROVER_2_EMAIL}
          isSuperAdmin={isSuper} approverSigUrl={sigUrl} onClose={() => setViewId(null)}
          onApprove={tryApprove} onReject={(r, slot) => setRejectFor({ r, slot })} onChanged={load} />
      )}

      <div className="bg-gradient-to-br from-teal-600 to-cyan-700 px-6 py-7 text-white flex items-center justify-between flex-wrap gap-4">
        <div><p className="text-teal-100 text-sm font-bold">{roleText}</p><h2 className="text-3xl font-black">{fullName(user)}</h2><p className="text-teal-100 text-sm">{user.email}</p></div>
        <div className="flex flex-col items-end gap-2">
          <select value={filterFY} onChange={e => setFilterFY(Number(e.target.value))} className="bg-white/20 border border-white/30 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:outline-none">
            {[0, 1, 2].map(i => { const fy = getCurrentFiscalYear() - i; return <option key={fy} value={fy} className="text-slate-800">{fiscalYearLabel(fy)}</option>; })}
          </select>
          {canApprove && <button onClick={() => setShowSig(true)} className={`px-4 py-2 rounded-xl text-sm font-black border-2 ${sigUrl ? "bg-white/20 border-white/40" : "bg-amber-400 border-amber-300 text-amber-900 animate-pulse"}`}>{sigUrl ? "✅ ลายเซ็นพร้อมแล้ว — คลิกเปลี่ยน" : "⚠️ เพิ่มลายเซ็นก่อนอนุมัติ"}</button>}
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-5xl mx-auto">
        <StatCards s={stats} />
        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 overflow-x-auto">
          {([["pending", "⏳ รออนุมัติ"], ["today", "🚶 วันนี้"], ["history", "📋 ทั้งหมด"], ["summary", "👥 รายบุคคล"], ["graph", "📊 กราฟ"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 min-w-[96px] py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-1 ${tab === k ? "bg-white text-slate-800 shadow border border-slate-200" : "text-slate-500"}`}>
              {l}{k === "pending" && pendingList.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingList.length}</span>}
              {k === "today" && todayList.length > 0 && <span className="bg-teal-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{todayList.length}</span>}
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-10 text-slate-400">กำลังโหลด...</div> : (
          <>
            {tab === "pending" && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                {!canApprove && <div className="px-5 py-3 bg-slate-50 text-slate-600 text-sm font-bold">👁️ คุณมีสิทธิ์ดู/พิมพ์เท่านั้น ไม่สามารถกดอนุมัติได้</div>}
                {pendingList.length === 0 ? <div className="text-center py-10 text-slate-400">✅ ไม่มีรายการรออนุมัติ</div> : pendingList.map(r => <Row key={r.id} r={r} />)}
              </div>
            )}
            {tab === "today" && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                <div className="px-5 py-3 bg-teal-50 text-teal-800 text-sm font-black">
                  🚶 ขณะนี้อยู่นอกโรงเรียน: {todayList.filter(r => r.actual_out_at && !r.actual_back_at).map(r => fullName(r.user)).join(", ") || "ไม่มี"}
                </div>
                {todayList.length === 0 ? <div className="text-center py-10 text-slate-400">วันนี้ไม่มีผู้ได้รับอนุญาตออกนอกโรงเรียน</div> : todayList.map(r => <Row key={r.id} r={r} />)}
              </div>
            )}
            {tab === "history" && (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อครู..." className="flex-1 min-w-[180px] bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
                    <option value="all">ทุกสถานะ</option>{(Object.keys(STATUS) as OutStatus[]).filter(s => s !== "draft").map(s => <option key={s} value={s}>{STATUS[s].icon} {STATUS[s].label}</option>)}
                  </select>
                </div>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                  {filteredHistory.length === 0 ? <div className="text-center py-10 text-slate-400">ไม่พบข้อมูล</div> : filteredHistory.map(r => <Row key={r.id} r={r} />)}
                </div>
              </div>
            )}
            {tab === "summary" && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b px-5 py-3"><h3 className="font-black text-slate-700">👥 สรุปรายบุคคล {fiscalYearLabel(filterFY)} (เฉพาะที่อนุญาตแล้ว)</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead><tr className="bg-slate-50 border-b text-slate-600">
                      <th className="text-left px-4 py-3 font-black">ชื่อ-สกุล</th><th className="px-3 py-3 font-black">ครั้ง</th>
                      <th className="px-3 py-3 font-black">ชม.ที่ขอ</th><th className="px-3 py-3 font-black">ชม.จริง</th>
                      <th className="px-3 py-3 font-black text-red-600">เกินกำหนด</th><th className="px-3 py-3 font-black text-amber-600">ยังไม่กลับ</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {byUser.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">ไม่มีข้อมูล</td></tr> : byUser.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 text-center">
                          <td className="px-4 py-3 text-left font-bold text-slate-800">{fullName(row.user)}</td>
                          <td className="px-3 py-3 font-black text-teal-700">{row.times}</td>
                          <td className="px-3 py-3">{fmtHours(Math.round(row.planned * 100) / 100)}</td>
                          <td className="px-3 py-3">{fmtHours(Math.round(row.actualHours * 100) / 100)}</td>
                          <td className={`px-3 py-3 font-black ${row.over ? "text-red-600" : "text-slate-300"}`}>{row.over || "-"}</td>
                          <td className={`px-3 py-3 font-black ${row.open ? "text-amber-600" : "text-slate-300"}`}>{row.open || "-"}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {tab === "graph" && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                <h4 className="font-black text-slate-700 mb-4">📊 สถิติรายเดือน {fiscalYearLabel(filterFY)}</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={graphData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontFamily: "Sarabun", fontSize: 13, borderRadius: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="จำนวนครั้ง" fill="#14b8a6" radius={[4, 4, 0, 0]} /><Bar dataKey="ชั่วโมงจริง" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════
export default function GooutPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allTeachers, setAllTeachers] = useState<UserProfile[]>([]);
  const [savedSignature, setSavedSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"approve" | "my">("my");

  useEffect(() => { preloadLogo(); }, []);
  useEffect(() => {
    (async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) { setLoading(false); return; }
      const cols = "id,title,first_name,last_name,email,role,position,signature_url,grade_level,phone,extra_roles";
      let { data } = await supabase.from("users").select(cols).eq("auth_id", au.id).maybeSingle();
      if (!data && au.email) {
        const res = await supabase.from("users").select(cols).eq("email", au.email).maybeSingle();
        data = res.data;
        if (data) await supabase.from("users").update({ auth_id: au.id }).eq("id", (data as any).id);
      }
      if (data) {
        const d: any = data;
        setUser({ ...d, full_name: `${d.title ?? ""}${d.first_name ?? ""} ${d.last_name ?? ""}`.replace(/\s+/g, " ").trim() });
        if (d.signature_url) setSavedSignature(d.signature_url);
        const e = (d.email ?? "").toLowerCase();
        if ([APPROVER_2_EMAIL, APPROVER_3_EMAIL, ADMIN_EMAIL, HR_EMAIL].includes(e)) setMode("approve");
      }
      const { data: ts } = await supabase.from("users").select(cols).order("first_name");
      setAllTeachers((ts as UserProfile[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-teal-600 font-black text-lg animate-pulse">กำลังโหลดระบบ...</div></div>;
  if (!user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</div></div>;

  const email = user.email.toLowerCase();
  const isHead = (user.extra_roles ?? []).includes("grade_head");
  const isApproverTop = [APPROVER_2_EMAIL, APPROVER_3_EMAIL].includes(email);
  const isViewAdmin = [ADMIN_EMAIL, HR_EMAIL].includes(email);
  const hasApproveView = isHead || isApproverTop || isViewAdmin;
  const canTeach = !isViewAdmin; // HR/Admin ดูอย่างเดียว เหมือนระบบลา
  const canApprove = isHead || isApproverTop;
  const showApprove = hasApproveView && (mode === "approve" || !canTeach);

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Sarabun','IBM Plex Sans Thai',sans-serif" }}>
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg">🏠</button>
          <div><h1 className="text-base font-black text-slate-800 leading-none">ขออนุญาตออกนอกโรงเรียน</h1><p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต</p></div>
        </div>
        <div className="flex items-center gap-2">
          {hasApproveView && canTeach && (
            <>
              <button onClick={() => setMode("approve")} className={`px-3 py-2 rounded-xl text-xs font-black border-2 ${mode === "approve" ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>🏛️ อนุมัติ/จัดการ</button>
              <button onClick={() => setMode("my")} className={`px-3 py-2 rounded-xl text-xs font-black border-2 ${mode === "my" ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>✍️ คำขอของฉัน</button>
            </>
          )}
          <button onClick={() => router.push("/leave")} className="px-3 py-2 rounded-xl text-xs font-black border-2 border-sky-200 bg-sky-50 text-sky-700">🗓️ ระบบลา</button>
        </div>
      </div>
      <div suppressHydrationWarning>
        {showApprove
          ? <ApproverDashboard user={user} allTeachers={allTeachers} canApprove={canApprove} />
          : <TeacherDashboard user={user} allTeachers={allTeachers} savedSignature={savedSignature} onGoLeave={() => router.push("/leave")} />}
      </div>
    </div>
  );
}