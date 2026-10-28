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

export default function MealsPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<ClassroomLite[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [type, setType] = useState<MealType>("lunch");
  const [month, setMonth] = useState(currentMonth());
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [canReport, setCanReport] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  const [signFor, setSignFor] = useState<{ type: "student" | "user"; id: string; name: string } | null>(null);

  // อ่านค่าเริ่มต้นจาก URL (?classroomId=&month=&type=) + โหลดรายชื่อห้อง
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("month")) setMonth(q.get("month")!);
    if (q.get("type") === "milk") setType("milk");
    api<{ classrooms: ClassroomLite[]; canReport: boolean }>("/api/meals/sheet")
      .then(({ classrooms, canReport }) => {
        setCanReport(!!canReport);
        setClassrooms(classrooms);
        const want = q.get("classroomId");
        setClassroomId(classrooms.find((c) => c.id === want)?.id ?? classrooms[0]?.id ?? "");
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

  const load = useCallback(async (sync: boolean) => {
    if (!classroomId) return;
    setErr("");
    try {
      const qs = new URLSearchParams({ classroomId, month, type, ...(sync ? { sync: "1" } : {}) });
      setSheet((await api<{ sheet: SheetData }>(`/api/meals/sheet?${qs}`)).sheet);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [classroomId, month, type]);

  useEffect(() => { if (classroomId) { setLoading(true); load(true); } }, [classroomId, month, type, load]);

  const locked = !!sheet?.report.confirmed;
  const canEdit = !!sheet?.editable && !locked;

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
  async function saveMeasure(st: SheetStudent, field: "weight" | "height", raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v === st[field]) return;
    try {
      await post("/api/meals/measurements", {
        classroomId, month, studentId: st.id,
        weight: field === "weight" ? v : st.weight, height: field === "height" ? v : st.height,
      });
      await load(true); // น้ำหนัก/ส่วนสูงเปลี่ยน → จัดแจกเพิ่มใหม่
    } catch (e) { setErr((e as Error).message); }
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

        <div className="ml-auto flex flex-wrap gap-2">
          {canReport && (
            <Link href="/meals/report" className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
              <BarChart3 className="h-3.5 w-3.5" /> รายงานรวม
            </Link>
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

      {sheet && (
        <>
          {(sheet.schoolDays.length === 0 || !!sheet.diag?.unmapped.length) && (
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
              กดที่ช่องวันที่เพื่อแก้ ✓ → ล → ข → (กลับค่าอัตโนมัติ) · ตัวเลข <b>+n</b> คือได้รับแจกเพิ่ม · กรอก นน./สส. ปลายเดือนได้ในตาราง · คลิกขวาที่ช่องลายมือชื่อ นร. เพื่อรีเซ็ต
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
                          className={`${td} ${school.has(d) ? "" : "bg-slate-100"} ${c && canEdit ? "cursor-pointer hover:bg-blue-50 print:hover:bg-transparent" : ""} ${c?.m ? "underline decoration-dotted" : ""} ${c?.s === "absent" ? "font-bold text-rose-600" : c?.s === "leave" ? "font-bold text-amber-600" : ""}`}>
                          {c ? MARK[c.s] : ""}
                          {c && c.x > 0 && <sup className="font-bold text-emerald-600">+{c.x}</sup>}
                        </td>
                      );
                    })}
                    <td className={`${td} font-bold`}>{st.present}</td>
                    <td className={td}>{st.leave || ""}</td>
                    <td className={td}>{st.absent || ""}</td>
                    <td className={td}>{st.extra || ""}</td>
                    {(["weight", "height"] as const).map((f) => (
                      <td key={f} className={td}>
                        {canEdit ? (
                          <input defaultValue={st[f] ?? ""} key={`${st.id}-${f}-${st[f]}`} inputMode="decimal"
                            onBlur={(e) => saveMeasure(st, f, e.target.value)}
                            className="w-full rounded border border-slate-200 px-0.5 text-center print:border-0" />
                        ) : (st[f] ?? "")}
                      </td>
                    ))}
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