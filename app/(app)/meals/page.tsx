// app/meals/page.tsx — แบบบันทึกอาหารกลางวัน / นม รายเดือน (ครูประจำชั้น)
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Lock, PenLine, Printer, Unlock } from "lucide-react";
import SignaturePad from "@/components/meals/SignaturePad";
import {
  FORM_TITLE, currentMonth, dateOf, monthLabel, shiftMonth,
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
  const [signFor, setSignFor] = useState<{ type: "student" | "user"; id: string; name: string } | null>(null);

  // อ่านค่าเริ่มต้นจาก URL (?classroomId=&month=&type=) + โหลดรายชื่อห้อง
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("month")) setMonth(q.get("month")!);
    if (q.get("type") === "milk") setType("milk");
    api<{ classrooms: ClassroomLite[] }>("/api/meals/sheet")
      .then(({ classrooms }) => {
        setClassrooms(classrooms);
        const want = q.get("classroomId");
        setClassroomId(classrooms.find((c) => c.id === want)?.id ?? classrooms[0]?.id ?? "");
        if (!classrooms.length) setLoading(false);
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
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
  async function saveSignature(png: string) {
    if (!signFor) return;
    await post("/api/meals/signature", { subjectType: signFor.type, subjectId: signFor.id, dataUrl: png });
    await load(false);
  }

  const sumAll = useMemo(() => {
    const t = { present: 0, leave: 0, absent: 0, extra: 0 };
    sheet?.students.forEach((s) => { t.present += s.present; t.leave += s.leave; t.absent += s.absent; t.extra += s.extra; });
    return t;
  }, [sheet]);

  const days = Array.from({ length: sheet?.days ?? 0 }, (_, i) => i + 1);
  const school = new Set(sheet?.schoolDays ?? []);
  const th = "border border-slate-400 px-1 py-1 text-center font-bold";
  const td = "border border-slate-300 px-1 py-0.5 text-center";

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <style>{`@media print{@page{size:A4 landscape;margin:8mm}}`}</style>
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
          <Link href="/meals/report" className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
            <BarChart3 className="h-3.5 w-3.5" /> รายงานรวม
          </Link>
          <button onClick={() => setSignFor({ type: "user", id: sheet!.me.id, name: sheet!.me.name })} disabled={!sheet}
            className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
            <PenLine className="h-3.5 w-3.5" /> ลายมือชื่อของฉัน{sheet?.me.hasSignature ? " ✓" : ""}
          </button>
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
          {sheet.schoolDays.length === 0 && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 print:hidden">
              ยังไม่มีข้อมูลเช็คชื่อโฮมรูมของเดือนนี้ — เมื่อครูเช็คชื่อแล้ว เปิดหน้านี้ใหม่ ระบบจะเติมให้อัตโนมัติ
            </p>
          )}
          {canEdit && (
            <p className="mb-2 text-[11px] text-slate-400 print:hidden">
              กดที่ช่องวันที่เพื่อแก้ ✓ → ล → ข → (กลับค่าอัตโนมัติ) · ตัวเลข <b>+n</b> คือได้รับแจกเพิ่ม · กรอก นน./สส. ปลายเดือนได้ในตาราง (ใช้จัดลำดับผู้ได้รับเพิ่มด้วย)
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white p-3 print:border-0 print:p-0">
            <h2 className="text-center text-sm font-bold text-slate-800">
              {FORM_TITLE[sheet.type]} ชั้น {sheet.classroom.name}
            </h2>
            <p className="mb-2 text-center text-xs text-slate-600">ประจำเดือน {monthLabel(sheet.month)}</p>

            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  <th rowSpan={2} className={th}>ที่</th>
                  <th rowSpan={2} className={`${th} min-w-[11rem] text-left`}>ชื่อ - สกุล</th>
                  <th colSpan={days.length} className={th}>วันที่</th>
                  <th colSpan={4} className={th}>สรุปรายเดือน</th>
                  <th colSpan={2} className={th}>ข้อมูลปลายเดือน</th>
                  <th rowSpan={2} className={`${th} min-w-[6rem]`}>ลายมือชื่อ นร.</th>
                </tr>
                <tr className="bg-slate-100">
                  {days.map((d) => <th key={d} className={`${th} w-6 font-semibold ${school.has(d) ? "" : "text-slate-400"}`}>{d}</th>)}
                  <th className={th}>รวมวัน</th><th className={th}>ล</th><th className={th}>ข</th><th className={th}>เพิ่ม</th>
                  <th className={th}>นน.</th><th className={th}>สส.</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((st, i) => (
                  <tr key={st.id}>
                    <td className={td}>{st.no ?? i + 1}</td>
                    <td className={`${td} whitespace-nowrap text-left`}>{st.name}</td>
                    {days.map((d) => {
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
                            className="w-12 rounded border border-slate-200 px-1 text-center print:border-0" />
                        ) : (st[f] ?? "")}
                      </td>
                    ))}
                    <td className={`${td} h-8`}>
                      {st.signatureUrl ? (
                        <img src={st.signatureUrl} alt="" className="mx-auto max-h-7 max-w-[5.5rem]" />
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

            {/* ── ลงนามท้ายรายงาน ── */}
            <div className="mt-6 grid grid-cols-2 gap-6 text-center text-xs text-slate-700">
              {[
                { who: "ครูประจำชั้น", name: sheet.report.teacherName, sig: sheet.report.teacherSignatureUrl, on: sheet.report.confirmed, at: sheet.report.confirmedAt },
                { who: "เจ้าของโครงการอาหาร (ผู้รับรอง)", name: sheet.report.ownerName, sig: sheet.report.ownerSignatureUrl, on: sheet.report.approved, at: sheet.report.approvedAt },
              ].map((b) => (
                <div key={b.who}>
                  <div className="mx-auto grid h-12 place-items-end">{b.sig && <img src={b.sig} alt="" className="max-h-11" />}</div>
                  <p>ลงชื่อ ................................................</p>
                  <p className="font-bold">({b.name ?? "........................................"})</p>
                  <p>{b.who}</p>
                  <p className="text-[10px] text-slate-400">
                    {b.on && b.at ? `ลงวันที่ ${new Date(b.at).toLocaleDateString("th-TH", { dateStyle: "long" })}` : "รอดำเนินการ"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}