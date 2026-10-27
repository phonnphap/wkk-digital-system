// app/meals/report/page.tsx — รายงานอาหารกลางวัน/นม สำหรับผู้บริหารและเจ้าของโครงการ
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { MEAL_LABEL, currentMonth, monthLabel, shiftMonth, type MealType, type ReportRow } from "@/lib/meals/shared";

type Scope = "school" | "level" | "grade" | "room";
type Opt = { key: string; label: string };
type Resp = {
  options: { levels: Opt[]; grades: Opt[]; rooms: Opt[] };
  rows: ReportRow[]; totals: ReportRow; isOwner: boolean;
};

const SCOPES: { key: Scope; label: string; unit: string }[] = [
  { key: "school", label: "ทั้งโรงเรียน", unit: "ระดับ" },
  { key: "level", label: "ทีละระดับ", unit: "สายชั้น" },
  { key: "grade", label: "ทีละสายชั้น", unit: "ห้อง" },
  { key: "room", label: "ทีละห้อง", unit: "ห้อง" },
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "เกิดข้อผิดพลาด");
  return json as T;
}

export default function MealsReportPage() {
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState<MealType>("lunch");
  const [scope, setScope] = useState<Scope>("school");
  const [key, setKey] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const keyOptions = scope === "level" ? data?.options.levels : scope === "grade" ? data?.options.grades : scope === "room" ? data?.options.rooms : [];

  // เปลี่ยนขอบเขต → เลือกตัวเลือกแรกให้อัตโนมัติ
  useEffect(() => {
    if (scope === "school") { setKey(""); return; }
    if (keyOptions?.length && !keyOptions.some((o) => o.key === key)) setKey(keyOptions[0].key);
  }, [scope, keyOptions, key]);

  const load = useCallback(async () => {
    if (scope !== "school" && !key) return;
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ month, type, scope, key });
      setData(await call<Resp>(`/api/meals/report?${qs}`));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [month, type, scope, key]);
  useEffect(() => { load(); }, [load]);

  async function act(action: "approve" | "unapprove", classroomId: string) {
    try {
      await call("/api/meals/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, classroomId, month, type }),
      });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  const unit = SCOPES.find((s) => s.key === scope)!.unit;
  const th = "border border-slate-300 bg-slate-100 px-2 py-2 text-center text-xs font-bold";
  const td = "border border-slate-200 px-2 py-1.5 text-center text-sm";
  const state = (r: ReportRow, n: number) => (r.rooms === 1 ? (n ? "✓" : "–") : `${n}/${r.rooms}`);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <style>{`@media print{@page{size:A4 landscape;margin:10mm}}`}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/meals" className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-lg hover:bg-slate-200">←</Link>
        <h1 className="mr-2 text-lg font-bold text-slate-800">รายงานอาหารกลางวัน / นม</h1>

        <div className="flex overflow-hidden rounded-xl border border-slate-200 text-sm font-bold">
          {(["lunch", "milk"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`px-3 py-2 ${type === t ? (t === "lunch" ? "bg-orange-500" : "bg-sky-500") + " text-white" : "bg-white text-slate-600"}`}>
              {MEAL_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-sm font-bold">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg bg-slate-100 px-2.5 py-1.5">‹</button>
          <span className="min-w-[8.5rem] text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg bg-slate-100 px-2.5 py-1.5">›</button>
        </div>

        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {scope !== "school" && (
          <select value={key} onChange={(e) => setKey(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            {(keyOptions ?? []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        )}
        <button onClick={() => window.print()} className="ml-auto flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
          <Printer className="h-3.5 w-3.5" /> พิมพ์
        </button>
      </div>

      {err && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{err}</p>}
      {loading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}

      {data && !loading && (
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white p-3 print:border-0">
          <h2 className="text-center text-sm font-bold text-slate-800">
            รายงานสรุป{MEAL_LABEL[type]} ประจำเดือน {monthLabel(month)}
          </h2>
          <p className="mb-3 text-center text-xs text-slate-500">
            {SCOPES.find((s) => s.key === scope)!.label}
            {scope !== "school" && keyOptions?.find((o) => o.key === key) ? ` · ${keyOptions.find((o) => o.key === key)!.label}` : ""}
            {type === "milk" ? " (อนุบาล 2 – ป.6)" : " (อนุบาล 2 – ม.3)"}
          </p>

          {data.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>{unit}</th>
                  <th className={th}>ห้อง</th><th className={th}>นร. (คน)</th><th className={th}>วันเรียน</th>
                  <th className={th}>มา (ครั้ง)</th><th className={th}>ลา</th><th className={th}>ขาด</th>
                  <th className={th}>แจกเพิ่ม</th><th className={th}>ร้อยละมา</th>
                  <th className={`${th} print:hidden`}>ครูยืนยัน</th><th className={th}>รับรองแล้ว</th>
                </tr>
              </thead>
              <tbody>
                {[...data.rows, data.totals].map((r) => {
                  const isTotal = r.key === "total";
                  return (
                    <tr key={r.key} className={isTotal ? "bg-slate-100 font-bold" : ""}>
                      <td className={`${td} text-left font-semibold`}>
                        {r.classroomId ? (
                          <Link className="text-blue-700 hover:underline" href={`/meals?classroomId=${r.classroomId}&month=${month}&type=${type}`}>{r.label}</Link>
                        ) : r.label}
                      </td>
                      <td className={td}>{r.rooms}</td><td className={td}>{r.headcount}</td><td className={td}>{r.schoolDays}</td>
                      <td className={td}>{r.present}</td><td className={td}>{r.leave}</td><td className={td}>{r.absent}</td>
                      <td className={td}>{r.extras}</td><td className={td}>{r.rate.toFixed(1)}</td>
                      <td className={`${td} print:hidden`}>{state(r, r.confirmed)}</td>
                      <td className={td}>
                        {state(r, r.approved)}
                        {data.isOwner && r.classroomId && r.confirmed > 0 && (
                          <button onClick={() => act(r.approved ? "unapprove" : "approve", r.classroomId!)}
                            className={`ml-2 rounded-lg px-2 py-0.5 text-[11px] font-black print:hidden ${r.approved ? "bg-amber-100 text-amber-700" : "bg-emerald-600 text-white"}`}>
                            {r.approved ? "ยกเลิกรับรอง" : "รับรอง"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            “มา/ลา/ขาด” นับเป็นจำนวนครั้ง (คน×วัน) · รับรองรายห้องได้ที่มุมมอง “ทีละสายชั้น” หรือ “ทีละห้อง”
          </p>
        </div>
      )}
    </div>
  );
}