// app/meals/page.tsx — แบบบันทึกอาหารกลางวัน / นม รายเดือน (ครูประจำชั้น)
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Lock, Printer, Unlock } from "lucide-react";
import SignaturePad from "@/components/meals/SignaturePad";
import {
  FORM_TITLE, SCHOOL_LINE, currentMonth, dateOf, fullRoomName, monthLabel, shiftMonth,
  type CellStatus, type ClassroomLite, type MealType, type SheetData, type SheetStudent,
} from "@/lib/meals/shared";

const MARK: Record<CellStatus, string> = { present: "✓", leave: "ล", absent: "ข" };
const NEXT: Record<CellStatus, CellStatus | null> = { present: "leave", leave: "absent", absent: null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "เกิดข้อผิดพลาด");
  return json as T;
}
const post = (url: string, body: unknown) =>
  api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** "" → null (ลบค่า) · ตัวเลขถูกต้อง → number · ไม่ถูกต้อง → undefined */
function parseNum(raw: string): number | null | undefined {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

type Measure = { weight: number | null; height: number | null };
type SaveState = "idle" | "saving" | "saved" | "error";

/** ช่องกรอก นน./สส. — เก็บข้อความที่พิมพ์ไว้เองในช่อง (ไม่ถูกรีเฟรชทับ) แล้วบันทึกอัตโนมัติเมื่อหยุดพิมพ์ / ออกจากช่อง / กด Enter */
function MeasureInput({ col, value, onCommit }: { col: string; value: number | null; onCommit: (raw: string) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const lastCommitted = useRef(text.trim());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useRef(onCommit);
  cb.current = onCommit;

  const commit = (t: string) => {
    clearTimeout(timer.current);
    if (t.trim() === lastCommitted.current) return;
    lastCommitted.current = t.trim();
    cb.current(t);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <input
      data-col={col}
      value={text}
      inputMode="decimal"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(t), 700);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const els = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`));
        const next = els[els.indexOf(e.currentTarget) + 1];
        if (next) { next.focus(); next.select(); } else e.currentTarget.blur();
      }}
      className="w-full rounded border border-slate-200 px-0.5 text-center print:border-0"
    />
  );
}

export default function MealsPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<ClassroomLite[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [type, setType] = useState<MealType>("lunch");
  const [month, setMonth] = useState(currentMonth());
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState("");
  const [canReport, setCanReport] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [rev, setRev] = useState(0); // เพิ่มค่าเพื่อรีเซ็ตช่องกรอกเมื่อบันทึกไม่สำเร็จ
  const sheetRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  const [signFor, setSignFor] = useState<{ type: "student" | "user"; id: string; name: string } | null>(null);

  // ── ตัวช่วยกัน race: ผลโหลดเก่าที่ตอบกลับมาช้าจะถูกทิ้ง / ค่า นน.-สส. ที่ยังบันทึกไม่เสร็จจะถูกทับกลับไม่ได้ ──
  const reqId = useRef(0);
  const pending = useRef<Map<string, Measure>>(new Map());
  const chain = useRef<Map<string, Promise<void>>>(new Map());
  const inflight = useRef(0);
  const failed = useRef(false);
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pkey = (studentId: string) => `${classroomId}|${month}|${studentId}`;

  // อ่านค่าเริ่มต้นจาก URL (?classroomId=&month=&type=) + โหลดรายชื่อห้อง
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("month")) setMonth(q.get("month")!);
    if (q.get("type") === "milk") setType("milk");
    const want = q.get("classroomId");
    if (want) setClassroomId(want); // เริ่มโหลดตารางพร้อมกับรายชื่อห้องเลย (ไม่ต้องรอทีละขั้น)
    api<{ classrooms: ClassroomLite[]; canReport: boolean }>("/api/meals/sheet")
      .then(({ classrooms, canReport }) => {
        setCanReport(!!canReport);
        setClassrooms(classrooms);
        setClassroomId((prev) => classrooms.find((c) => c.id === prev)?.id ?? classrooms[0]?.id ?? "");
        if (!classrooms.length) setLoading(false);
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, []);

  // พิมพ์ให้พอดี 1 หน้า A4 แนวนอน: ประมาณความสูงจากจำนวนนักเรียน แล้วย่อ (scale) ถ้าเกิน
  useEffect(() => {
    const reset = () => {
      const el = sheetRef.current;
      if (el) { el.style.transform = ""; el.style.width = ""; el.style.transformOrigin = ""; }
    };
    const before = () => {
      const el = sheetRef.current;
      if (!el) return;
      const est = 170 + (countRef.current + 7) * 14; // ส่วนหัว+หมายเหตุ+ลายเซ็น + แถว (ตัวอักษร 9px)
      const z = Math.min(1, 735 / est);
      if (z < 1) {
        el.style.transformOrigin = "top left";
        el.style.transform = `scale(${z})`;
        el.style.width = `calc(100% / ${z})`;
      }
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", reset);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", reset); };
  }, []);

  const current = classrooms.find((c) => c.id === classroomId);
  useEffect(() => { if (current && !current.milk && type === "milk") setType("lunch"); }, [current, type]);

  // ทับค่า นน./สส. ที่ยังอยู่ระหว่างบันทึกลงบนข้อมูลที่เพิ่งโหลดมา
  const withPending = useCallback((s: SheetData): SheetData => {
    if (pending.current.size === 0) return s;
    return {
      ...s,
      students: s.students.map((st) => {
        const p = pending.current.get(`${classroomId}|${month}|${st.id}`);
        return p ? { ...st, weight: p.weight, height: p.height } : st;
      }),
    };
  }, [classroomId, month]);

  const load = useCallback(async (sync: boolean): Promise<SheetData | null> => {
    if (!classroomId) return null;
    const id = ++reqId.current;
    setErr("");
    if (sync) setSyncing(true);
    try {
      const qs = new URLSearchParams({ classroomId, month, type, ...(sync ? { sync: "1" } : {}) });
      const { sheet: s } = await api<{ sheet: SheetData }>(`/api/meals/sheet?${qs}`);
      if (id !== reqId.current) return null; // มีคำขอใหม่กว่าแล้ว
      setSheet(withPending(s));
      return s;
    } catch (e) {
      if (id === reqId.current) setErr((e as Error).message);
      return null;
    } finally {
      if (id === reqId.current) setSyncing(false);
    }
  }, [classroomId, month, type, withPending]);
  const loadRef = useRef(load);
  loadRef.current = load;

  // โหลดแบบ 2 จังหวะ: (1) ดึงข้อมูลที่บันทึกไว้มาแสดงทันที (2) ซิงค์กับเช็คชื่อโฮมรูมเบื้องหลัง
  useEffect(() => {
    if (!classroomId) return;
    clearTimeout(resyncTimer.current);
    let alive = true;
    setLoading(true);
    (async () => {
      const quick = await load(false);
      if (!alive) return;
      setLoading(false);
      if (quick && !quick.report.confirmed) await load(true); // เดือนที่ยืนยันแล้วไม่ต้องซิงค์ใหม่
    })();
    return () => { alive = false; };
  }, [classroomId, month, type, load]);

  useEffect(() => () => clearTimeout(resyncTimer.current), []);

  const locked = !!sheet?.report.confirmed;
  const canEdit = !!sheet?.editable && !locked && !loading;

  async function cycle(st: SheetStudent, day: number) {
    if (!sheet || !canEdit) return;
    const cur = st.cells[day]?.s;
    if (!cur) return;
    try {
      await post("/api/meals/sync", {
        classroomId, month, type,
        override: { studentId: st.id, date: dateOf(month, day), status: NEXT[cur] },
      });
      await load(false);
    } catch (e) { setErr((e as Error).message); }
  }

  /** บันทึก นน./สส. อัตโนมัติ: อัปเดตหน้าจอทันที → ส่งเข้าคิวต่อนักเรียน (เรียงลำดับ ไม่ทับกัน) → รวมผลคำนวณ "แจกเพิ่ม" ทีเดียวหลังหยุดแก้ */
  function saveMeasure(st: SheetStudent, field: "weight" | "height", raw: string) {
    if (!canEdit) return;
    const v = parseNum(raw);
    if (v === undefined) { setErr("กรอกน้ำหนัก/ส่วนสูงเป็นตัวเลขเท่านั้น"); setRev((r) => r + 1); return; }
    const k = pkey(st.id);
    const base: Measure = pending.current.get(k) ?? { weight: st.weight, height: st.height };
    if (base[field] === v) return;
    pending.current.set(k, { ...base, [field]: v });

    setErr("");
    reqId.current++; // ทิ้งผลโหลดเก่าที่ยังค้างอยู่ ไม่ให้ทับค่าที่เพิ่งกรอก
    clearTimeout(resyncTimer.current);
    setSheet((s) => s && { ...s, students: s.students.map((x) => (x.id === st.id ? { ...x, [field]: v } : x)) });
    if (inflight.current === 0) failed.current = false;
    inflight.current++;
    setSaveState("saving");

    const sentMonth = month, sentRoom = classroomId;
    const job: Promise<void> = (chain.current.get(k) ?? Promise.resolve())
      .then(async () => {
        const cur = pending.current.get(k) ?? { weight: v, height: base.height };
        await post("/api/meals/measurements", {
          classroomId: sentRoom, month: sentMonth, studentId: st.id, weight: cur.weight, height: cur.height,
        });
      })
      .catch((e) => { failed.current = true; setErr(`บันทึก ${st.name} ไม่สำเร็จ: ${(e as Error).message}`); });
    chain.current.set(k, job);

    job.finally(() => {
      inflight.current--;
      if (chain.current.get(k) === job) { chain.current.delete(k); pending.current.delete(k); }
      if (inflight.current > 0) return;
      if (failed.current) {
        setSaveState("error");
        setRev((r) => r + 1);
        loadRef.current(false); // แสดงค่าจริงจากเซิร์ฟเวอร์
      } else {
        setSaveState("saved");
        resyncTimer.current = setTimeout(() => loadRef.current(true), 1200); // คำนวณ "แจกเพิ่ม" ใหม่เบื้องหลัง
      }
    });
  }

  async function reportAction(action: "confirm" | "unconfirm") {
    if (action === "confirm" && !confirm("ยืนยันรายงานเดือนนี้? หลังยืนยันจะแก้ตารางไม่ได้จนกว่าจะปลดล็อก")) return;
    try { await post("/api/meals/report", { action, classroomId, month, type }); await load(false); }
    catch (e) { setErr((e as Error).message); }
  }
  async function resetSignature(st: SheetStudent) {
    if (!canEdit || !st.signatureUrl) return;
    if (!confirm(`รีเซ็ตลายมือชื่อของ ${st.name}?`)) return;
    try {
      await api("/api/meals/signature", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: st.id }),
      });
      await load(false);
    } catch (e) { setErr((e as Error).message); }
  }
  async function clearManual() {
    if (!confirm("ล้างช่องที่แก้ด้วยมือทั้งเดือน แล้วใช้ค่าตามเช็คชื่อโฮมรูมทั้งหมด?")) return;
    try {
      await post("/api/meals/sync", { classroomId, month, type, clearManual: true });
      await load(false);
    } catch (e) { setErr((e as Error).message); }
  }
  async function togglePack() {
    if (!sheet || !canEdit) return;
    try {
      await post("/api/meals/report", { action: "set_pack", pack: sheet.milkPack === "ถุง" ? "กล่อง" : "ถุง", classroomId, month, type });
      await load(false);
    } catch (e) { setErr((e as Error).message); }
  }
  async function saveSignature(png: string) {
    if (!signFor) return;
    await post("/api/meals/signature", { subjectType: signFor.type, subjectId: signFor.id, dataUrl: png });
    await load(false);
  }

  countRef.current = sheet?.students.length ?? 0;
  const manualCount = useMemo(
    () => (sheet?.students ?? []).reduce((n, st) => n + Object.values(st.cells).filter((c) => c.m).length, 0),
    [sheet],
  );
  const sumAll = useMemo(() => {
    const t = { present: 0, leave: 0, absent: 0, extra: 0 };
    sheet?.students.forEach((s) => { t.present += s.present; t.leave += s.leave; t.absent += s.absent; t.extra += s.extra; });
    return t;
  }, [sheet]);

  // คอลัมน์วัน: วันหยุด/ปิดภาคเรียน/เสาร์-อาทิตย์ แสดงเป็นช่องสีชมพูคลุมทุกแถว มีข้อความแนวตั้ง (เหมือนหน้าเช็คชื่อ)
  const segments = useMemo(() => {
    const out: { start: number; len: number; label?: string }[] = [];
    if (!sheet) return out;
    const sch = new Set(sheet.schoolDays);
    for (let d = 1; d <= sheet.days; d++) {
      const label = sch.has(d) ? undefined : sheet.dayLabels[d];
      out.push({ start: d, len: 1, label });
    }
    return out;
  }, [sheet]);

  const days = Array.from({ length: sheet?.days ?? 0 }, (_, i) => i + 1);
  const school = new Set(sheet?.schoolDays ?? []);
  const th = "border border-slate-400 px-1 py-1 text-center font-bold";
  const td = "border border-slate-300 px-0.5 py-0.5 text-center";
  const tdName = "border border-slate-300 px-1 py-0.5 text-left whitespace-nowrap overflow-hidden text-ellipsis";

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <style>{`@media print{
        @page{size:A4 landscape;margin:6mm}
        body *{visibility:hidden!important}
        .meal-print,.meal-print *{visibility:visible!important}
        .meal-print{position:fixed;left:0;top:0;width:100%}
        .meal-print table td,.meal-print table th{padding:1px 2px!important;font-size:9px!important;line-height:1.15!important}
        .meal-print input{font-size:9px!important}
      }`}</style>
      {signFor && <SignaturePad title={signFor.name} onSave={saveSignature} onClose={() => setSignFor(null)} />}

      {/* ── แถบควบคุม ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={() => router.push("/homeroom")} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-lg hover:bg-slate-200">←</button>
        <h1 className="mr-2 text-lg font-bold text-slate-800">บันทึกอาหารและนม</h1>

        <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          {classrooms.map((c) => <option key={c.id} value={c.id}>ห้อง {c.name}</option>)}
        </select>

        <div className="flex overflow-hidden rounded-xl border border-slate-200 text-sm font-bold">
          <button onClick={() => setType("lunch")} className={`px-3 py-2 ${type === "lunch" ? "bg-orange-500 text-white" : "bg-white text-slate-600"}`}>อาหารกลางวัน</button>
          <button onClick={() => current?.milk && setType("milk")} disabled={!current?.milk}
            title={current?.milk ? "" : "นมมีเฉพาะ อนุบาล 2 – ป.6"}
            className={`px-3 py-2 disabled:opacity-40 ${type === "milk" ? "bg-sky-500 text-white" : "bg-white text-slate-600"}`}>นม</button>
        </div>

        <div className="flex items-center gap-1 text-sm font-bold">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg bg-slate-100 px-2.5 py-1.5">‹</button>
          <span className="min-w-[8.5rem] text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg bg-slate-100 px-2.5 py-1.5">›</button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saveState !== "idle" && (
            <span className={`text-xs font-bold ${saveState === "error" ? "text-rose-600" : saveState === "saving" ? "text-slate-500" : "text-emerald-600"}`}>
              {saveState === "saving" ? "กำลังบันทึก…" : saveState === "saved" ? "✓ บันทึกอัตโนมัติแล้ว" : "บันทึกไม่สำเร็จ"}
            </span>
          )}
          {canReport && (
            <Link href="/meals/report" className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
              <BarChart3 className="h-3.5 w-3.5" /> รายงานรวม
            </Link>
          )}
          {canEdit && manualCount > 0 && (
            <button onClick={clearManual} className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
              ล้างช่องที่แก้เอง ({manualCount})
            </button>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
            <Printer className="h-3.5 w-3.5" /> พิมพ์
          </button>
          {sheet?.editable && (locked ? (
            <button onClick={() => reportAction("unconfirm")} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">
              <Unlock className="h-3.5 w-3.5" /> ปลดล็อก
            </button>
          ) : (
            <button onClick={() => reportAction("confirm")} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
              <Lock className="h-3.5 w-3.5" /> ยืนยันรายงานเดือนนี้
            </button>
          ))}
        </div>
      </div>

      {err && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 print:hidden">{err}</p>}
      {loading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}
      {!loading && !sheet && !err && <p className="text-sm text-slate-400">ไม่พบห้องที่เปิดดูได้</p>}
      {!loading && syncing && <p className="mb-2 text-xs text-slate-400 print:hidden">กำลังซิงค์กับเช็คชื่อโฮมรูม… (แก้ไขตารางได้ตามปกติ)</p>}

      {sheet && (
        <>
          {!syncing && (sheet.schoolDays.length === 0 || !!sheet.diag?.unmapped.length) && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 print:hidden">
              {sheet.diag?.unmapped.length
                ? `พบข้อมูลเช็คชื่อ ${sheet.diag.fetched} แถว (ตาราง ${sheet.diag.source}) แต่ไม่รู้จักค่าสถานะ: ${sheet.diag.unmapped.join(", ")} — แจ้งผู้พัฒนาเพื่อเพิ่มในฟังก์ชัน mapAttendance`
                : sheet.diag && sheet.diag.fetched === 0
                  ? "ไม่พบข้อมูลเช็คชื่อโฮมรูมของนักเรียนห้องนี้ในเดือนนี้ — ตรวจว่าครูเช็คชื่อโฮมรูมแล้ว จากนั้นเปิดหน้านี้ใหม่"
                  : "ยังไม่มีข้อมูลเช็คชื่อโฮมรูมของเดือนนี้ — เมื่อครูเช็คชื่อแล้ว เปิดหน้านี้ใหม่ ระบบจะเติมให้อัตโนมัติ"}
            </p>
          )}
          {canEdit && (
            <p className="mb-2 text-[11px] text-slate-400 print:hidden">
              กดที่ช่องวันที่เพื่อแก้ ✓ → ล → ข → (กลับค่าอัตโนมัติ) · ตัวเลข <b>+n</b> คือได้รับแจกเพิ่ม · กรอก นน./สส. ได้เลย ระบบบันทึกอัตโนมัติ (กด Enter เพื่อลงแถวถัดไป) · คลิกขวาที่ช่องลายมือชื่อ นร. เพื่อรีเซ็ต
            </p>
          )}

          <div className="meal-print">
          <div ref={sheetRef} className="overflow-x-auto rounded-xl border border-slate-300 bg-white p-3 print:overflow-visible print:border-0 print:p-0">
            <h2 className="text-center text-sm font-bold text-slate-800">
              {FORM_TITLE[sheet.type]}{fullRoomName(sheet.classroom.name)}
              {sheet.type === "milk" && (
                <button onClick={togglePack} disabled={!canEdit} title={canEdit ? "คลิกเพื่อสลับ ถุง / กล่อง" : ""}
                  className="ml-2 font-bold text-rose-600 disabled:cursor-default">
                  (*นม{sheet.milkPack})
                </button>
              )}
            </h2>
            <p className="mb-2 whitespace-pre-wrap text-center text-xs text-slate-700">
              {SCHOOL_LINE}{sheet.academicYear ? `  ปีการศึกษา  ${sheet.academicYear}` : ""}
            </p>

            <table className="w-full min-w-[860px] border-collapse text-[10px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "1.75rem" }} />
                <col style={{ width: "11rem" }} />
                {days.map((d) => <col key={d} />)}
                <col style={{ width: "2.6rem" }} /><col style={{ width: "1.6rem" }} /><col style={{ width: "1.6rem" }} /><col style={{ width: "2rem" }} />
                <col style={{ width: "3rem" }} /><col style={{ width: "3rem" }} />
                <col style={{ width: "5.5rem" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th rowSpan={2} className={th}>ที่</th>
                  <th rowSpan={2} className={th}>ชื่อ - สกุล</th>
                  <th colSpan={days.length} className={th}>เดือน {monthLabel(sheet.month).replace(" ", " พ.ศ. ")}</th>
                  <th colSpan={4} className={th}>สรุปรายเดือน</th>
                  <th colSpan={2} className={th}>ข้อมูลปลายเดือน</th>
                  <th rowSpan={2} className={th}>ลายมือชื่อ นร.</th>
                </tr>
                <tr className="bg-slate-100">
                  {days.map((d) => <th key={d} className={`${th} font-semibold ${school.has(d) ? "" : "text-slate-400"}`}>{d}</th>)}
                  <th className={th}>รวมวัน</th><th className={th}>ล</th><th className={th}>ข</th><th className={th}>เพิ่ม</th>
                  <th className={th}>น้ำหนัก</th><th className={th}>ส่วนสูง</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((st, i) => (
                  <tr key={st.id}>
                    <td className={td}>{st.no ?? i + 1}</td>
                    <td className={tdName} title={st.name}>{st.name}</td>
                    {segments.map((seg) => {
                      if (seg.label) {
                        return i === 0 ? (
                          <td key={seg.start} rowSpan={sheet.students.length} title={seg.label}
                            className="border border-rose-200 bg-rose-100 px-0 text-center align-middle text-[11px] font-bold text-rose-500"
                            style={{ writingMode: "vertical-rl", whiteSpace: "nowrap" }}>
                            {seg.label.startsWith("วัน") && /^วัน(เสาร์|อาทิตย์)$/.test(seg.label) ? seg.label : `วันหยุด ${seg.label}`}
                          </td>
                        ) : null;
                      }
                      const d = seg.start;
                      const c = st.cells[d];
                      return (
                        <td key={d} onClick={() => cycle(st, d)}
                          className={`${td} ${school.has(d) ? "" : "bg-slate-100"} ${c && canEdit ? "cursor-pointer hover:bg-blue-50 print:hover:bg-transparent" : ""} ${c?.m ? "bg-amber-100 ring-1 ring-inset ring-amber-400" : ""} ${c?.s === "absent" ? "font-bold text-rose-600" : c?.s === "leave" ? "font-bold text-amber-600" : ""}`}>
                          {c ? MARK[c.s] : ""}
                          {c && c.x > 0 && <sup className="font-bold text-emerald-600">+{c.x}</sup>}
                        </td>
                      );
                    })}
                    <td className={`${td} font-bold`}>{st.present}</td>
                    <td className={td}>{st.leave || ""}</td>
                    <td className={td}>{st.absent || ""}</td>
                    <td className={td}>{st.extra || ""}</td>
                    {(["weight", "height"] as const).map((f) => {
                      const prev = f === "weight" ? st.prevWeight : st.prevHeight;
                      return (
                        <td key={f} className={td}>
                          {canEdit ? (
                            <MeasureInput
                              key={`${classroomId}-${month}-${st.id}-${f}-${rev}`}
                              col={f}
                              value={st[f]}
                              onCommit={(raw) => saveMeasure(st, f, raw)}
                            />
                          ) : (st[f] ?? "")}
                          {prev != null && <div className="text-[8px] leading-none text-slate-400">ก่อน {prev}</div>}
                        </td>
                      );
                    })}
                    <td className={`${td} h-7`}
                      title={st.signatureUrl && canEdit ? "คลิกขวาเพื่อรีเซ็ตลายมือชื่อ" : undefined}
                      onContextMenu={(e) => { if (st.signatureUrl && canEdit) { e.preventDefault(); resetSignature(st); } }}>
                      {st.signatureUrl ? (
                        <img src={st.signatureUrl} alt="" className="mx-auto max-h-6 max-w-[5rem]" />
                      ) : sheet.editable ? (
                        <button onClick={() => setSignFor({ type: "student", id: st.id, name: st.name })}
                          className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 print:hidden">+ เพิ่ม</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {([
                  ["มา (✓)", "present"], ["ลา (ล)", "leave"], ["ขาด (ข)", "absent"], ["แจกเพิ่ม", "extra"],
                ] as const).map(([label, k]) => (
                  <tr key={k} className="bg-slate-50 font-bold">
                    <td colSpan={2} className={`${td} text-right`}>{label}</td>
                    {days.map((d) => <td key={d} className={td}>{sheet.dayTotals[d]?.[k] || ""}</td>)}
                    <td colSpan={4} className={td}>{k === "present" ? sumAll.present : k === "leave" ? sumAll.leave : k === "absent" ? sumAll.absent : sumAll.extra}</td>
                    <td colSpan={3} className={td} />
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold">
                  <td colSpan={2} className={`${td} text-right`}>รวมจำนวนที่แจกจริง</td>
                  {days.map((d) => {
                    const t = sheet.dayTotals[d];
                    return <td key={d} className={td}>{t ? t.present + t.extra : ""}</td>;
                  })}
                  <td colSpan={4} className={td}>{sumAll.present + sumAll.extra}</td>
                  <td colSpan={3} className={td} />
                </tr>
              </tfoot>
            </table>

            <p className="mt-3 text-[11px] leading-snug text-slate-700">
              <b>*+1</b> = ได้ทำการจัดสรร{sheet.type === "milk" ? "อาหารเสริม(นม)" : "อาหารกลางวัน"}ส่วนที่เหลือให้แก่นักเรียนที่มีเกณฑ์{sheet.type === "milk" ? "ส่วนสูง" : "น้ำหนัก"}ต่ำกว่าเกณฑ์ เพิ่มอีก 1 ชุด ตามเกณฑ์การช่วยเหลือนักเรียนโภชนาการต่ำ
            </p>

            {/* ── ลงนามท้ายรายงาน (ลายเซ็นจาก users.signature_url) ── */}
            <div className="mt-5 flex flex-wrap justify-around gap-x-6 gap-y-4 text-xs text-slate-800">
              {sheet.signers.map((p, i) => (
                <div key={i} className="min-w-[13rem] text-center">
                  <div className="flex items-end justify-center gap-1">
                    <span>ลงชื่อ</span>
                    <span className="relative inline-block h-11 w-44 border-b border-dotted border-slate-700">
                      {p.signatureUrl && (
                        <img src={p.signatureUrl} alt="" className="absolute bottom-0.5 left-1/2 max-h-10 max-w-[9rem] -translate-x-1/2" />
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5">({p.name ?? "..............................."})</p>
                  <p className="font-semibold">{p.role}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-slate-400 print:hidden">
              สถานะรายงาน: ครูยืนยัน {sheet.report.confirmed ? "แล้ว" : "ยัง"} · เจ้าของโครงการรับรอง {sheet.report.approved ? "แล้ว" : "ยัง"}
              {sheet.diag && ` · ค่าสถานะเช็คชื่อที่พบเดือนนี้: ${Object.entries(sheet.diag.statusCounts).map(([k, v]) => `${k}×${v}`).join(", ") || "-"} (ตาราง ${sheet.diag.source})`}
            </p>
          </div>
          </div>
        </>
      )}
    </div>
  );
}