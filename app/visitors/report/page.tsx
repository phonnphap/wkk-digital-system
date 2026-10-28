// path: app/visitors/report/page.tsx — สรุปรายงานผู้มาติดต่อ รายวัน/รายเดือน สำหรับฝ่ายบริหาร
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Printer, Download } from "lucide-react";
import { bkkDate, dayRange, monthRange, TZ } from "@/lib/visitors/time";
import { summarize, Row } from "@/lib/visitors/summarize";

const supabase = createClient();
const timeTH = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "-";
const dayTH = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: TZ });

function Bar({ label, n, max }: { label: string; n: number; max: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 truncate text-slate-600">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${(n / Math.max(max, 1)) * 100}%` }} />
      </div>
      <span className="w-8 text-right font-bold text-slate-700">{n}</span>
    </div>
  );
}

function downloadCsv(rows: Row[], name: string) {
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["วันที่", "ชื่อ-นามสกุล", "ติดต่อ", "ทะเบียนรถ", "เข้า", "ออก", "เช็คเอาท์อัตโนมัติ", "ครูรับทราบ"];
  const lines = rows.map(r => [
    r.check_in_at ? bkkDate(r.check_in_at) : "", r.full_name, r.target_label, r.car_plate,
    timeTH(r.check_in_at), timeTH(r.check_out_at), r.auto_checked_out ? "ใช่" : "", r.acknowledged_at ? timeTH(r.acknowledged_at) : "",
  ].map(q).join(","));
  const blob = new Blob(["\uFEFF" + [head.map(q).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

export default function VisitorReportPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(bkkDate());
  const [month, setMonth] = useState(bkkDate().slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      const { from, to } = mode === "day" ? dayRange(day) : monthRange(month);
      const { data, error } = await supabase.from("visitors").select("*")
        .gte("check_in_at", from).lt("check_in_at", to).order("check_in_at", { ascending: true });
      if (!alive) return;
      if (error) setErr(error.message);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [mode, day, month]);

  const s = useMemo(() => summarize(rows), [rows]);
  const maxT = s.targets[0]?.[1] ?? 1;
  const maxD = Math.max(1, ...s.days.map(d => d[1]));
  const title = mode === "day" ? `รายวัน ${day}` : `รายเดือน ${month}`;

  const stat = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100";

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 print:hidden">
          <button onClick={() => router.push("/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600"><Home className="h-4.5 w-4.5" /></button>
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600"><ArrowLeft className="h-4.5 w-4.5" /></button>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-500">รายงานสำหรับฝ่ายบริหาร</p>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-800 sm:text-3xl">สรุปผู้มาติดต่อ {title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              {(["day", "month"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} className={`px-4 py-2 text-sm font-semibold ${mode === m ? "bg-teal-600 text-white" : "text-slate-500"}`}>
                  {m === "day" ? "รายวัน" : "รายเดือน"}
                </button>
              ))}
            </div>
            {mode === "day"
              ? <input type="date" value={day} max={bkkDate()} onChange={e => e.target.value && setDay(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" />
              : <input type="month" value={month} max={bkkDate().slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" />}
            <button onClick={() => downloadCsv(rows, `visitors_${mode === "day" ? day : month}.csv`)} disabled={!rows.length}
              className="flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40"><Download className="h-4 w-4" /> CSV</button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"><Printer className="h-4 w-4" /> พิมพ์</button>
          </div>
        </div>

        {err && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{err}</div>}

        {loading ? <p className="py-16 text-center text-slate-400">กำลังโหลด...</p> : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className={stat}><p className="text-xs text-slate-400">ผู้มาติดต่อทั้งหมด</p><p className="text-3xl font-extrabold text-slate-800">{s.total}</p></div>
              <div className={stat}><p className="text-xs text-slate-400">เวลาอยู่เฉลี่ย</p><p className="text-3xl font-extrabold text-slate-800">{s.avgStayMin ?? "-"}<span className="ml-1 text-sm font-semibold text-slate-400">นาที</span></p></div>
              <div className={stat}><p className="text-xs text-slate-400">ครูรับทราบ</p><p className="text-3xl font-extrabold text-slate-800">{s.total ? Math.round((s.acked / s.total) * 100) : 0}<span className="ml-1 text-sm font-semibold text-slate-400">% ({s.acked}/{s.total})</span></p></div>
              <div className={stat}><p className="text-xs text-slate-400">รปภ. ลืมกดออก</p><p className="text-3xl font-extrabold text-amber-600">{s.auto}<span className="ml-1 text-sm font-semibold text-slate-400">คน</span></p></div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <p className="text-sm font-extrabold text-slate-800">มาติดต่อห้อง/ฝ่ายไหนมากที่สุด</p>
                <div className="mt-3 space-y-2">
                  {s.targets.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>}
                  {s.targets.slice(0, 10).map(([k, n]) => <Bar key={k} label={k} n={n} max={maxT} />)}
                </div>
                <p className="mt-4 text-sm font-extrabold text-slate-800">ช่องทางลงทะเบียน</p>
                <div className="mt-2 space-y-2">
                  <Bar label="รปภ. ถ่ายบัตร/ทะเบียน" n={s.bySource.id} max={s.total} />
                  <Bar label="ไม่มีบัตร (ถ่ายหน้า)" n={s.bySource.face} max={s.total} />
                  <Bar label="ผู้มาติดต่อสแกน QR" n={s.bySource.qr} max={s.total} />
                </div>
              </div>

              {mode === "month" ? (
                <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm font-extrabold text-slate-800">จำนวนรายวัน</p>
                  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                    {s.days.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>}
                    {s.days.map(([d, n]) => <Bar key={d} label={dayTH(d)} n={n} max={maxD} />)}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm font-extrabold text-slate-800">รายชื่อวันนี้</p>
                  <div className="mt-3 max-h-96 overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-slate-400"><tr><th className="py-1 pr-2">ชื่อ</th><th className="pr-2">ติดต่อ</th><th className="pr-2">เข้า</th><th className="pr-2">ออก</th><th>รับทราบ</th></tr></thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className="border-t border-slate-100 align-top">
                            <td className="py-1.5 pr-2 font-semibold text-slate-700">{r.full_name}{r.car_plate && <span className="block text-xs font-normal text-slate-400">🚗 {r.car_plate}</span>}</td>
                            <td className="pr-2 text-slate-500">{r.target_label ?? "-"}</td>
                            <td className="pr-2 text-slate-500">{timeTH(r.check_in_at)}</td>
                            <td className="pr-2 text-slate-500">{timeTH(r.check_out_at)}{r.auto_checked_out && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">อัตโนมัติ</span>}</td>
                            <td className="text-slate-500">{r.acknowledged_at ? "✔" : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}