"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveRosterClassroomIds } from "@/lib/smartclass/rosterClassroom";

const supabase = createClient();

export type AuditRoom = { classroom_id: string; room_name: string; split?: boolean };

type Status = "none" | "partial" | "complete" | "na";
type Prog = { filled: number; expected: number; status: Status };
type IssueType = "assign_over" | "exam_over" | "collect_over" | "total_over" | "pct_over" | "grade_missing" | "no_criteria" | "negative" | "config_sum";
type Issue = { type: IssueType; student: string; detail: string; final?: boolean }; // final = ขึ้นกับคะแนนปลายภาค
type MaxSet = { assign: number; mid: number; fin: number; collect: number; full: number };
type SecAudit = {
  room: string; level: string; subjectCode: string; subjectName: string;
  studentCount: number; assignmentCount: number; emptyAssignments: number;
  assign: Prog; mid: Prog; fin: Prog; max: MaxSet; issues: Issue[]; failed?: boolean;
};

const ISSUE_LABEL: Record<IssueType, string> = {
  assign_over: "คะแนนชิ้นงานเกินคะแนนเต็ม",
  exam_over: "คะแนนสอบเกินคะแนนเต็ม",
  collect_over: "คะแนนเก็บเกินคะแนนเต็มเก็บ",
  total_over: "คะแนนรวมหลังสอบเกินคะแนนเต็ม",
  pct_over: "คะแนนรวมเกิน 100",
  grade_missing: "มีคะแนนแต่ไม่ได้เกรด",
  no_criteria: "ยังไม่ตั้งเกณฑ์เกรด",
  negative: "คะแนนติดลบ",
  config_sum: "คะแนนเต็มที่ตั้งไว้รวมไม่เท่ากับ 100",
};

const TONE: Record<Status, string> = {
  complete: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  none: "bg-red-50 text-red-600",
  na: "bg-slate-50 text-slate-300",
};

// นร.ที่ย้ายออกอยู่ตอนนี้จะไม่ถูกนับในรายงาน (กติกาเดียวกับ isCurrentlyMovedOut ในหน้า students-overview)
// moved_out_at มีค่า และ (ยังไม่เคยกลับเข้า หรือ returned_at < moved_out_at) = ย้ายออก · กลับเข้าเรียนแล้ว = นับตามปกติ
export function isActiveStudent(s: { moved_out_at?: string | null; returned_at?: string | null }): boolean {
  if (!s.moved_out_at) return true;
  if (!s.returned_at) return false;
  return s.returned_at >= s.moved_out_at; // yyyy-mm-dd เทียบเป็นสตริงได้
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const prog = (filled: number, expected: number): Prog => ({
  filled, expected,
  status: expected === 0 ? "na" : filled === 0 ? "none" : filled < expected ? "partial" : "complete",
});
const levelKey = (room: string) => room.split("/")[0].trim();
const levelRank = (k: string) => (k.startsWith("อ") ? 0 : k.startsWith("ป") ? 1 : k.startsWith("ม") ? 2 : 3);
const incomplete = (a: SecAudit) => [a.assign, a.mid, a.fin].some(p => p.status === "none" || p.status === "partial");

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  }));
}

const MAXF = [["assign", "ชิ้นงาน"], ["mid", "กลางภาค"], ["fin", "ปลายภาค"]] as const;
function compareMax(list: SecAudit[]) {
  const devs: { room: string; field: string; val: number; base: number }[] = [];
  if (list.length < 2) return devs;
  MAXF.forEach(([k, label]) => {
    const cnt = new Map<number, number>();
    list.forEach(a => cnt.set(a.max[k], (cnt.get(a.max[k]) ?? 0) + 1));
    let base = list[0].max[k], best = 0;
    cnt.forEach((c, v) => { if (c > best || (c === best && v > base)) { best = c; base = v; } });
    list.forEach(a => { if (a.max[k] !== base) devs.push({ room: a.room, field: label, val: a.max[k], base }); });
  });
  return devs;
}

function Chip({ text, p }: { text: string; p: Prog }) {
  return <div className={`audit-chip rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap ${TONE[p.status]}`}>{text}</div>;
}

export default function AuditReport({
  rooms, semester, yearName, schoolName = "",
}: { rooms: AuditRoom[]; semester: number; yearName: string; schoolName?: string }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [data, setData] = useState<SecAudit[] | null>(null);
  const [ranAt, setRanAt] = useState("");
  const [view, setView] = useState<"missing" | "max" | "issues">("missing");
  const [levelFilter, setLevelFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [skipFinal, setSkipFinal] = useState(false); // ไม่นับปลายภาค (เช่น ตรวจช่วงกลางภาค)
  const [excludeActivity, setExcludeActivity] = useState(true); // ไม่รวมวิชากิจกรรม (รหัส ก)
  const [hideIssues, setHideIssues] = useState(false); // ซ่อนแท็บ/ส่วน 3. คะแนนผิดปกติ (เช่น เทอม 1 ที่ยังไม่มีปลายภาค)

  const levels = useMemo(() => {
    const m = new Map<string, AuditRoom[]>();
    rooms.forEach(r => { const k = levelKey(r.room_name); m.set(k, [...(m.get(k) ?? []), r]); });
    return Array.from(m.entries())
      .sort((a, b) => levelRank(a[0]) - levelRank(b[0]) || a[0].localeCompare(b[0], "th", { numeric: true }))
      .map(([key, rs]) => ({ key, rooms: rs.sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true })) }));
  }, [rooms]);

  async function run() {
    setRunning(true); setError(""); setData(null);
    try {
      const out: SecAudit[] = [];
      const roomInfo = new Map<string, { students: any[]; secs: any[] }>();
      // ห้องมัธยม/ห้องแยกเทอมอาจดึงรายชื่อจากห้อง roster อื่น (เหมือนหน้า Smart Class)
      const rosterMap = await resolveRosterClassroomIds(supabase, rooms.map(r => r.classroom_id));

      // 1) นักเรียน + วิชาของทุกห้อง (แยกทีละห้อง กันชน limit 1000 แถว)
      await pool(rooms, 6, async (r) => {
        const [{ data: stu }, { data: secs }] = await Promise.all([
          supabase.from("students").select("*").eq("classroom_id", rosterMap[r.classroom_id] ?? r.classroom_id).order("seat_number"),
          supabase.from("subject_sections")
            .select("id, subject_id, formative_max_score, midterm_max_score, final_max_score, show_special_scores, subjects(subject_code, name_th, grading_mode, grade_rounding_mode)")
            .eq("classroom_id", r.classroom_id).eq("is_active", true),
        ]);
        let list = secs ?? [];
        if (r.split || r.room_name.trim().startsWith("ม")) {
          const { data: tt } = await supabase.from("timetable_entries").select("subject_id").eq("classroom_id", r.classroom_id);
          const ids = new Set((tt ?? []).map((e: any) => e.subject_id));
          if (ids.size > 0) list = list.filter((s: any) => ids.has(s.subject_id) || /^ก/.test(s.subjects?.subject_code ?? ""));
        }
        roomInfo.set(r.classroom_id, { students: (stu ?? []).filter(isActiveStudent), secs: list });
      });

      const jobs: { room: AuditRoom; sec: any }[] = [];
      rooms.forEach(r => (roomInfo.get(r.classroom_id)?.secs ?? []).forEach((s: any) => jobs.push({ room: r, sec: s })));
      setProgress({ done: 0, total: jobs.length });

      // 2) ดึงสรุปคะแนนของทุกวิชา แล้วตรวจ
      await pool(jobs, 6, async ({ room, sec }) => {
        const students: any[] = roomInfo.get(room.classroom_id)!.students;
        const code = sec.subjects?.subject_code ?? "";
        const base = {
          room: room.room_name, level: levelKey(room.room_name),
          subjectCode: code, subjectName: sec.subjects?.name_th ?? "ไม่ทราบชื่อวิชา", studentCount: students.length,
        };
        try {
          const res = await fetch(`/api/subject-grades/summary?subject_section_id=${sec.id}`);
          const json = await res.json();
          const assignments = (json.assignments ?? []).filter((a: any) => a.status !== "draft");
          const submissions: any[] = json.submissions ?? [];
          const events: any[] = json.scoreEvents ?? [];
          const criteria: any[] = json.criteria ?? [];
          const exams: any[] = json.examScores ?? [];
          const component = sec.subjects?.grading_mode !== "pass_fail";
          const formCfg = sec.formative_max_score ?? 70;
          const midMax = sec.midterm_max_score ?? 0;
          const finMax = sec.final_max_score ?? 30;
          // Smart Class เก็บค่าเป็น "round_up" | "truncate" (ยอมรับ "up" ด้วย)
          const roundUp = ["round_up", "up"].includes(sec.subjects?.grade_rounding_mode);
          const round = (v: number) => (roundUp ? Math.ceil(v - 1e-9) : Math.floor(v + 1e-9)); // กัน float error เช่น 70.0000001
          const weighted = (a: any) => !!(a.allow_weight && a.weight_percent != null && (a.max_score ?? 0) > 0);
          const contrib = (a: any) => (weighted(a) ? a.weight_percent : (a.max_score ?? 0));
          const wScore = (a: any, raw: number | null | undefined) => (raw == null ? 0 : weighted(a) ? (raw / (a.max_score || 1)) * a.weight_percent : raw);
          const examW = (raw: number | null | undefined, rawMax: number | null | undefined, max: number) =>
            raw == null ? 0 : rawMax && rawMax > 0 ? (raw / rawMax) * max : raw;
          const totalMax = assignments.reduce((s: number, a: any) => s + contrib(a), 0);
          // ตรงกับ Smart Class: โหมดตัวเลขบวกกลางภาค+ปลายภาคเสมอ (ถ้าเต็ม 0 ก็บวก 0)
          const useMid = component && midMax > 0;   // ใช้เฉพาะ "ต้องกรอกหรือไม่" ในตารางความครบถ้วน
          const useFin = component && finMax > 0;
          const fullMax = component ? totalMax + midMax + finMax : totalMax;
          const countSpecial = sec.show_special_scores !== false;
          const presetIds = new Set((json.presets ?? []).map((p: any) => p.id));
          const sorted = [...criteria].sort((a, b) => b.min_percent - a.min_percent);
          const issues: Issue[] = [];
          const sid = new Set(students.map(s => s.id));
          const nameOf = (s: any) => `${s.seat_number}. ${s.prefix ?? ""}${s.first_name} ${s.last_name}`;
          const aName = (a: any) => a.title ?? a.name ?? a.assignment_name ?? "ชิ้นงาน";

          if (component && Math.abs(formCfg + midMax + finMax - 100) > 0.001)
            issues.push({ type: "config_sum", student: "ทั้งห้อง", detail: `เก็บ ${formCfg} + กลางภาค ${midMax} + ปลายภาค ${finMax} = ${r2(formCfg + midMax + finMax)}` });
          if (criteria.length === 0 && component)
            issues.push({ type: "no_criteria", student: "ทั้งห้อง", detail: "ไม่มีเกณฑ์เกรด จึงตัดเกรดไม่ได้" });

          // ชิ้นงาน: ช่องที่กรอกแล้ว / ชิ้นงานที่ว่างทั้งชิ้น
          const mine = submissions.filter(x => sid.has(x.student_id));
          let filledCells = 0, emptyAssignments = 0;
          assignments.forEach((a: any) => {
            const n = mine.filter(x => x.assignment_id === a.id && x.score != null).length;
            filledCells += n; if (n === 0) emptyAssignments++;
          });
          mine.forEach(x => {
            const a = assignments.find((y: any) => y.id === x.assignment_id);
            const st = students.find(s => s.id === x.student_id);
            if (!a || !st || x.score == null) return;
            if (x.score < 0) issues.push({ type: "negative", student: nameOf(st), detail: `${aName(a)} = ${x.score}` });
            else if (a.max_score != null && x.score > a.max_score)
              issues.push({ type: "assign_over", student: nameOf(st), detail: `${aName(a)} ได้ ${x.score}/${a.max_score}` });
          });

          let midFilled = 0, finFilled = 0;
          students.forEach(s => {
            const mRow = exams.find(e => e.student_id === s.id && e.exam_type === "midterm");
            const fRow = exams.find(e => e.student_id === s.id && e.exam_type === "final");
            const mRaw = mRow?.raw_score ?? mRow?.score ?? null;
            const fRaw = fRow?.raw_score ?? fRow?.score ?? null;
            if (mRaw != null) midFilled++;
            if (fRaw != null) finFilled++;
            ([["กลางภาค", mRaw, mRow?.raw_max_score ?? json.rawMidtermMaxScore, midMax], ["ปลายภาค", fRaw, fRow?.raw_max_score ?? json.rawFinalMaxScore, finMax]] as const)
              .forEach(([label, raw, rawMax, cfg]) => {
                if (raw == null) return;
                const lim = rawMax && rawMax > 0 ? rawMax : cfg;
                if (raw < 0) issues.push({ type: "negative", student: nameOf(s), detail: `${label} = ${raw}`, final: label === "ปลายภาค" });
                else if (lim > 0 && raw > lim) issues.push({ type: "exam_over", student: nameOf(s), detail: `${label} ได้ ${raw}/${lim}`, final: label === "ปลายภาค" });
              });

            const subMap: Record<string, any> = {};
            mine.filter(x => x.student_id === s.id).forEach(x => { subMap[x.assignment_id] = x; });
            // ★ สูตรเดียวกับ GradeOverviewTool (Smart Class): คะแนนงานบวกตรงๆ ไม่ยืด/หดตามคะแนนเก็บที่ตั้งไว้
            const assignTotal = assignments.reduce((t: number, a: any) => t + wScore(a, subMap[a.id]?.score), 0);
            const special = countSpecial
              ? events.filter(ev => ev.student_id === s.id && presetIds.has(ev.preset_id)).reduce((t, ev) => t + ev.points, 0)
              : 0;
            const mS = examW(mRaw, mRow?.raw_max_score ?? json.rawMidtermMaxScore, midMax);
            const fS = examW(fRaw, fRow?.raw_max_score ?? json.rawFinalMaxScore, finMax);
            const collect = component ? assignTotal + mS + special : assignTotal;
            const collectMax = component ? totalMax + midMax : totalMax;
            const beforeRound = component ? collect + fS : assignTotal + special;
            const raw2 = Math.round(beforeRound * 100) / 100;
            const grandTotal = raw2 % 1 !== 0 ? round(raw2) : raw2;      // คะแนนรวมหลังปัดตามตั้งค่าวิชา
            const pct = fullMax > 0 ? (grandTotal / fullMax) * 100 : 0;  // ไม่ปัดร้อยละ (เหมือน Smart Class)

            if (collect > collectMax + 0.001)
              issues.push({ type: "collect_over", student: nameOf(s), detail: `คะแนนเก็บ ${r2(collect)}/${r2(collectMax)}` });
            if (grandTotal > fullMax + 0.001)
              issues.push({ type: "total_over", student: nameOf(s), detail: `รวม ${r2(grandTotal)}/${r2(fullMax)}`, final: true });
            if (pct > 100) issues.push({ type: "pct_over", student: nameOf(s), detail: `ร้อยละ ${r2(pct)}`, final: true });
            if (grandTotal > 0 && sorted.length > 0 && !sorted.some(c => pct >= c.min_percent && pct <= c.max_percent))
              issues.push({ type: "grade_missing", student: nameOf(s), detail: `ร้อยละ ${r2(pct)} ไม่ตรงช่วงเกรดใด`, final: true });
          });

          const n = students.length;
          out.push({
            ...base, assignmentCount: assignments.length, emptyAssignments,
            assign: assignments.length === 0 ? { filled: 0, expected: 0, status: "none" } : prog(filledCells, assignments.length * n),
            mid: useMid ? prog(midFilled, n) : prog(0, 0),
            fin: useFin ? prog(finFilled, n) : prog(0, 0),
            max: { assign: r2(totalMax), mid: r2(useMid ? midMax : 0), fin: r2(useFin ? finMax : 0), collect: r2(totalMax + (useMid ? midMax : 0)), full: r2(fullMax) },
            issues,
          });
        } catch {
          out.push({
            ...base, assignmentCount: 0, emptyAssignments: 0, failed: true,
            assign: prog(0, 0), mid: prog(0, 0), fin: prog(0, 0), max: { assign: 0, mid: 0, fin: 0, collect: 0, full: 0 }, issues: [],
          });
        }
        setProgress(p => ({ ...p, done: p.done + 1 }));
      });

      setData(out);
      setRanAt(new Date().toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" }));
    } catch (e: any) {
      setError(e?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setRunning(false);
    }
  }

  // ── ไม่นับปลายภาค: ตัดปลายภาคออกจากความครบถ้วน คะแนนเต็ม และรายการผิดปกติที่ขึ้นกับปลายภาค ──
    const adjusted = useMemo(() => {
    // ตัดวิชากิจกรรม (รหัสขึ้นต้นด้วย ก) ออกก่อน
    const d = (data ?? []).filter(a => !(excludeActivity && /^ก/.test(a.subjectCode ?? "")));
    if (!skipFinal) return d;
    return d.map(a => ({
      ...a,
      fin: prog(0, 0),
      max: { ...a.max, fin: 0, full: r2(a.max.full - a.max.fin) },
      issues: a.issues.filter(i => !i.final),
    }));
  }, [data, skipFinal, excludeActivity]);

  // ── กรอง + จัดกลุ่ม ──
  const subjectOptions = useMemo(() => {
    const m = new Map<string, string>();
    adjusted.forEach(a => m.set(a.subjectCode, a.subjectName));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [adjusted]);

  const filtered = useMemo(() => adjusted.filter(a =>
    (levelFilter === "all" || a.level === levelFilter) && (subjectFilter === "all" || a.subjectCode === subjectFilter)), [adjusted, levelFilter, subjectFilter]);

  const groups = useMemo(() => levels
    .filter(l => levelFilter === "all" || l.key === levelFilter)
    .map(l => {
      const secs = filtered.filter(a => a.level === l.key);
      const subjects = new Map<string, SecAudit[]>();
      secs.forEach(a => subjects.set(a.subjectCode, [...(subjects.get(a.subjectCode) ?? []), a]));
      const subjectList = Array.from(subjects.entries())
        .map(([code, list]) => ({ code, name: list[0].subjectName, list, devs: compareMax(list) }))
        .sort((a, b) => a.name.localeCompare(b.name, "th"));
      // รวมรายการผิดปกติเป็นกลุ่ม ห้อง+วิชา+ประเภท
      const issueRows: { room: string; subject: string; type: IssueType; items: Issue[] }[] = [];
      secs.forEach(a => {
        const byType = new Map<IssueType, Issue[]>();
        a.issues.forEach(i => byType.set(i.type, [...(byType.get(i.type) ?? []), i]));
        byType.forEach((items, type) => issueRows.push({ room: a.room, subject: `${a.subjectCode} ${a.subjectName}`, type, items }));
      });
      return { ...l, subjectList, issueRows };
    }).filter(g => g.subjectList.length > 0 || levelFilter !== "all"), [levels, filtered, levelFilter]);

  const kpi = useMemo(() => ({
    total: filtered.length,
    incomplete: filtered.filter(incomplete).length,
    maxMismatch: groups.reduce((n, g) => n + g.subjectList.filter(s => s.devs.length > 0).length, 0),
    issues: filtered.reduce((n, a) => n + a.issues.length, 0),
    failed: filtered.filter(a => a.failed).length,
  }), [filtered, groups]);

  const show = (v: typeof view) => (view === v ? "" : "hidden print:block");
  const tab = (v: typeof view, label: string) => (
    <button onClick={() => setView(v)}
      className={`px-4 py-2 rounded-xl font-black text-sm ${view === v ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>{label}</button>
  );

  return (
    <div className="audit-root space-y-4">
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          /* ซ่อนทุกอย่างของระบบ (เมนู/แถบนำทาง) แล้วโชว์เฉพาะรายงาน */
          body * { visibility: hidden !important; }
          .audit-root, .audit-root * { visibility: visible !important; }
          .audit-root { position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; padding: 0 !important; }
          /* ให้ตารางพอดีความกว้างกระดาษ ไม่ต้องเลื่อนข้าง */
          .audit-scroll { overflow: visible !important; border-radius: 0 !important; }
          .audit-root table { width: 100% !important; table-layout: auto; font-size: 10px !important; }
          .audit-root th, .audit-root td { min-width: 0 !important; padding: 2px 4px !important; line-height: 1.25; }
          .audit-root .whitespace-nowrap { white-space: normal !important; }
          .audit-chip { font-size: 9px !important; padding: 1px 3px !important; margin-bottom: 1px; }
          .audit-root tr { break-inside: avoid; page-break-inside: avoid; }
          .audit-root thead { display: table-header-group; }
        }
      `}</style>
      {/* ── แถบควบคุม (ไม่พิมพ์) ── */}
      <div className="print:hidden flex flex-wrap items-center gap-2">
        <button onClick={run} disabled={running}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:opacity-50">
          {running ? `⏳ กำลังตรวจ ${progress.done}/${progress.total}` : data ? "🔄 ตรวจสอบใหม่" : "▶️ เริ่มตรวจสอบทุกห้อง"}
        </button>
        {data && (
          <>
            <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
              <option value="all">ทุกสายชั้น</option>
              {levels.map(l => <option key={l.key} value={l.key}>{l.key}</option>)}
            </select>
            <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold max-w-[260px]">
              <option value="all">ทุกวิชา</option>
              {subjectOptions.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> แสดงเฉพาะที่มีปัญหา
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={skipFinal} onChange={e => setSkipFinal(e.target.checked)} /> ไม่นับปลายภาค
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
  <input type="checkbox" checked={excludeActivity} onChange={e => setExcludeActivity(e.target.checked)} /> ไม่รวมวิชากิจกรรม (รหัส ก)
</label>
<label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
  <input type="checkbox" checked={hideIssues}
  onChange={e => { setHideIssues(e.target.checked); if (e.target.checked && view === "issues") setView("missing"); }} />ไม่แสดงคะแนนผิดปกติ
</label>
            <button onClick={() => window.print()} className="ml-auto px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm">
              🖨️ พิมพ์รายงาน
            </button>
          </>
        )}
      </div>
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      {!data && !running && (
        <p className="text-sm text-slate-500 font-bold print:hidden">
          ระบบจะดึงคะแนนของทุกวิชาในทุกห้อง ({rooms.length} ห้อง) ของปีการศึกษา {yearName} เทอม {semester} มาตรวจ ใช้เวลาสักครู่ ข้อมูลที่แสดงเป็นคะแนนปัจจุบัน (ไม่ใช่ snapshot ที่ล็อกไว้)
        </p>
      )}
      {running && (
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden print:hidden">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
        </div>
      )}

      {data && (
        <>
          {/* ── หัวรายงาน (ขึ้นเฉพาะตอนพิมพ์) ── */}
          <div className="hidden print:block text-center mb-4">
            <p className="font-black text-lg">รายงานตรวจสอบการกรอกคะแนน {schoolName}</p>
            <p className="text-sm font-bold">ปีการศึกษา {yearName} เทอม {semester} · {levelFilter === "all" ? "ทุกสายชั้น" : `สายชั้น ${levelFilter}`}
              {subjectFilter !== "all" ? ` · วิชา ${subjectOptions.find(s => s[0] === subjectFilter)?.[1] ?? ""}` : ""}{skipFinal ? " · ไม่นับปลายภาค" : ""} {excludeActivity ? " · ไม่รวมวิชากิจกรรม" : ""}· ตรวจเมื่อ {ranAt}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
  ["วิชา-ห้องที่ตรวจ", kpi.total, "text-slate-700"],
  ["กรอกคะแนนยังไม่ครบ", kpi.incomplete, kpi.incomplete ? "text-amber-600" : "text-emerald-600"],
  ["วิชาที่คะแนนเต็มไม่เท่ากันทุกห้อง", kpi.maxMismatch, kpi.maxMismatch ? "text-red-600" : "text-emerald-600"],
  ...(hideIssues ? [] : [["รายการคะแนนผิดปกติ", kpi.issues, kpi.issues ? "text-red-600" : "text-emerald-600"]]),
].map(([l, v, c]) => (
              <div key={l as string} className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold text-slate-500">{l}</p>
                <p className={`text-2xl font-black ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          {kpi.failed > 0 && <p className="text-xs font-bold text-amber-600">⚠️ ดึงข้อมูลไม่สำเร็จ {kpi.failed} วิชา (แสดงเป็น "ดึงข้อมูลไม่ได้") ลองกดตรวจสอบใหม่</p>}

          <div className="print:hidden flex gap-2 flex-wrap">
  {tab("missing", "📝 คะแนนที่ยังไม่กรอก")}
  {tab("max", "⚖️ คะแนนเต็มแต่ละห้อง")}
  {!hideIssues && tab("issues", "🚨 คะแนนผิดปกติ")}
</div>

          {groups.map((g, gi) => (
            <section key={g.key} className={`space-y-4 ${gi > 0 ? "print:break-before-page" : ""}`}>
              <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-1">สายชั้น {g.key} <span className="text-sm text-slate-400">({g.rooms.length} ห้อง)</span></h2>

              {/* 1) ยังไม่กรอก */}
              <div className={show("missing")}>
                <h3 className="text-sm font-black text-slate-600 mb-2">1. การกรอกคะแนน — {skipFinal ? "ชิ้นงาน / กลางภาค" : "ชิ้นงาน / กลางภาค / ปลายภาค"}</h3>
                <div className="audit-scroll overflow-auto rounded-2xl border border-slate-200 bg-white print:overflow-visible">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-black text-slate-500">วิชา</th>
                        {g.rooms.map(r => <th key={r.classroom_id} className="px-2 py-2 font-black text-slate-500 min-w-[130px]">{r.room_name}</th>)}
                        <th className="text-left px-3 py-2 font-black text-slate-500">ห้องที่ยังไม่ครบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.subjectList
                        .filter(s => !onlyProblems || s.list.some(incomplete) || s.list.some(a => a.failed))
                        .map(s => {
                          const lacking = g.rooms.filter(r => !s.list.some(a => a.room === r.room_name));
                          const bad = s.list.filter(a => incomplete(a)).map(a => a.room);
                          return (
                            <tr key={s.code} className="border-t border-slate-100 align-top">
                              <td className="px-3 py-2 font-bold text-slate-700 min-w-[160px]">{s.name}<span className="block text-[10px] text-slate-400">{s.code}</span></td>
                              {g.rooms.map(r => {
                                const a = s.list.find(x => x.room === r.room_name);
                                if (!a) return <td key={r.classroom_id} className="px-2 py-2 text-center text-slate-300 font-bold">ไม่มีวิชา</td>;
                                if (a.failed) return <td key={r.classroom_id} className="px-2 py-2 text-center text-amber-600 font-bold">ดึงข้อมูลไม่ได้</td>;
                                const pct = a.assign.expected ? Math.round((a.assign.filled / a.assign.expected) * 100) : 0;
                                return (
                                  <td key={r.classroom_id} className="px-2 py-2 space-y-1">
                                    <Chip p={a.assign} text={a.assignmentCount === 0 ? "ยังไม่มีชิ้นงาน" : `ชิ้นงาน ${a.assignmentCount} · กรอก ${pct}%${a.emptyAssignments ? ` · ว่าง ${a.emptyAssignments}` : ""}`} />
                                    <Chip p={a.mid} text={a.mid.status === "na" ? "กลางภาค -" : `กลางภาค ${a.mid.filled}/${a.mid.expected}`} />
                                    {!skipFinal && <Chip p={a.fin} text={a.fin.status === "na" ? "ปลายภาค -" : `ปลายภาค ${a.fin.filled}/${a.fin.expected}`} />}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-red-600 font-bold">
                                {bad.length ? bad.join(", ") : <span className="text-emerald-600">ครบทุกห้อง</span>}
                                {lacking.length > 0 && <span className="block text-slate-500">ไม่มีวิชานี้: {lacking.map(r => r.room_name).join(", ")}</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 font-bold">กลางภาค/ปลายภาค = จำนวนนักเรียนที่มีคะแนน/ทั้งห้อง · ชิ้นงานไม่นับฉบับร่าง · "-" คือวิชานั้นไม่ได้ตั้งคะแนนสอบ</p>
              </div>

              {/* 2) คะแนนเต็ม */}
              <div className={show("max")}>
                <h3 className="text-sm font-black text-slate-600 mb-2">2. คะแนนเต็มของแต่ละห้อง ({skipFinal ? "ชิ้นงาน / กลางภาค" : "ชิ้นงาน / กลางภาค / ปลายภาค"})</h3>
                <div className="audit-scroll overflow-auto rounded-2xl border border-slate-200 bg-white print:overflow-visible">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-black text-slate-500">วิชา</th>
                        {g.rooms.map(r => <th key={r.classroom_id} className="px-2 py-2 font-black text-slate-500">{r.room_name}</th>)}
                        <th className="text-left px-3 py-2 font-black text-slate-500">ห้องที่ไม่ตรงกับส่วนใหญ่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.subjectList.filter(s => !onlyProblems || s.devs.length > 0).map(s => (
                        <tr key={s.code} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-bold text-slate-700 min-w-[160px]">{s.name}<span className="block text-[10px] text-slate-400">{s.code}</span></td>
                          {g.rooms.map(r => {
                            const a = s.list.find(x => x.room === r.room_name);
                            if (!a) return <td key={r.classroom_id} className="px-2 py-2 text-center text-slate-300">-</td>;
                            const off = s.devs.some(d => d.room === a.room);
                            return (
                              <td key={r.classroom_id} className={`px-2 py-2 text-center font-bold whitespace-nowrap ${off ? "bg-red-50 text-red-600" : "text-slate-600"}`}>
                                {a.max.assign} / {a.max.mid}{skipFinal ? "" : ` / ${a.max.fin}`}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-bold">
                            {s.list.length < 2 ? <span className="text-slate-400">มีห้องเดียว เทียบไม่ได้</span>
                              : s.devs.length === 0 ? <span className="text-emerald-600">เท่ากันทุกห้อง</span>
                              : s.devs.map((d, i) => (
                                <span key={i} className="block text-red-600">
                                  {d.room}: {d.field} {d.val} (ส่วนใหญ่ {d.base}, ต่าง {d.val - d.base > 0 ? "+" : "−"}{Math.abs(r2(d.val - d.base))})
                                </span>
                              ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 font-bold">ชิ้นงาน = ผลรวมคะแนนเต็มของชิ้นงานที่เปิดใช้ (ตามน้ำหนัก) · เทียบกับค่าที่พบมากที่สุดในสายชั้นเดียวกัน</p>
              </div>

                 {!hideIssues && (
  <div className={show("issues")}>     
              {/* 3) ผิดปกติ */}
              <div className={show("issues")}>
                <h3 className="text-sm font-black text-slate-600 mb-2">3. คะแนนที่ผิดปกติ (เกินคะแนนเต็ม / ไม่ได้เกรด / ตั้งค่าผิด)</h3>
                {g.issueRows.length === 0 ? (
                  <p className="text-sm font-bold text-emerald-600">ไม่พบความผิดปกติ ✓</p>
                ) : (
                  <div className="audit-scroll overflow-auto rounded-2xl border border-slate-200 bg-white print:overflow-visible">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          {["ห้อง", "วิชา", "ประเภท", "จำนวน", "รายละเอียด"].map(h => <th key={h} className="text-left px-3 py-2 font-black text-slate-500">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {g.issueRows.sort((a, b) => a.room.localeCompare(b.room, "th", { numeric: true }) || a.subject.localeCompare(b.subject, "th")).map((r, i) => (
                          <tr key={i} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2 font-bold whitespace-nowrap">{r.room}</td>
                            <td className="px-3 py-2 font-bold text-slate-700">{r.subject}</td>
                            <td className="px-3 py-2 font-bold text-red-600">{ISSUE_LABEL[r.type]}</td>
                            <td className="px-3 py-2 font-black">{r.items.length}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {r.items.map((it, j) => <span key={j} className="block">{it.student === "ทั้งห้อง" ? it.detail : `${it.student} — ${it.detail}`}</span>)}
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
            </section>
          ))}
        </>
      )}
    </div>
  );
}