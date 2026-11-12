"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabase, ASSET_SELECT, STATUSES, CONDITIONS, ZONES, SCHOOL, inputCls, type Asset } from "@/lib/assets";

export default function ReportPage() {
  const [rows, setRows] = useState<Asset[]>([]); const [zone, setZone] = useState(""); const [loc, setLoc] = useState("");
  useEffect(() => { supabase.from("assets").select(ASSET_SELECT).order("asset_code").limit(5000).then(({ data }: { data: Asset[] | null }) => setRows(data ?? [])); }, []);
  const locNames = useMemo(() => [...new Set(rows.filter((a) => !zone || a.asset_locations?.zone === zone).map((a) => a.asset_locations?.name ?? ""))], [rows, zone]);
  const shown = rows.filter((a) => (!zone || a.asset_locations?.zone === zone) && (!loc || a.asset_locations?.name === loc));
  const total = shown.reduce((s, a) => s + (a.price ?? 0), 0);
  const line = (a: Asset, i: number) => [i + 1, a.acquired_date ?? "", a.asset_code, [a.name, a.brand, a.model].filter(Boolean).join(" "), a.price ?? "", a.asset_locations?.name ?? "", STATUSES[a.status]?.text, CONDITIONS[a.condition], a.note ?? ""];
  const head = ["ลำดับ", "วันที่ได้มา", "รหัสครุภัณฑ์", "รายการ / ยี่ห้อ / รุ่น", "ราคา (บาท)", "สถานที่", "สถานะ", "สภาพ", "หมายเหตุ"];

  function buildWb() {
    const ws = XLSX.utils.aoa_to_sheet([[`ทะเบียนคุมครุภัณฑ์ ${SCHOOL}${loc ? ` (${loc})` : ""}`], [], head, ...shown.map(line), [], ["", "", "", "รวม", total]]);
    ws["!cols"] = [{ wch: 7 }, { wch: 12 }, { wch: 18 }, { wch: 36 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "ทะเบียนคุม"); return wb;
  }
  const [cloud, setCloud] = useState("");
  const exportXlsx = () => XLSX.writeFile(buildWb(), "ทะเบียนคุมครุภัณฑ์.xlsx");
  async function toOneDrive() { // อัปโหลดเข้า OneDrive ของ finance@ ผ่าน /api/upload-onedrive เดิม แล้วเปิดใน Excel Online
    setCloud("กำลังอัปโหลด...");
    try {
      const buf = XLSX.write(buildWb(), { type: "array", bookType: "xlsx" });
      const fd = new FormData();
      fd.append("file", new File([buf], "ทะเบียนคุมครุภัณฑ์.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      fd.append("account", "finance@khienkhet.ac.th"); fd.append("folder", "WKK_Asset_Registry"); fd.append("fileName", "ทะเบียนคุมครุภัณฑ์.xlsx");
      const res = await fetch("/api/upload-onedrive", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(j.error ?? j));
      setCloud("✅ อัปโหลดแล้ว"); if (j.url) window.open(j.url, "_blank");
    } catch (e) { setCloud("❌ " + (e as Error).message); }
  }
  return (
    <div className="p-4">
      <style>{`@media print{.no-print{display:none!important}@page{size:A4 landscape;margin:10mm}}`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href="/assets" className="text-sm text-slate-500">←</Link><h1 className="text-lg font-bold text-slate-800">รายงานทะเบียนคุมครุภัณฑ์</h1>
        <select className={`${inputCls} !w-auto`} value={zone} onChange={(e) => { setZone(e.target.value); setLoc(""); }}><option value="">ทุกพื้นที่</option>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={`${inputCls} !w-auto`} value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">ทุกห้อง</option>{locNames.map((n) => <option key={n}>{n}</option>)}</select>
        <button onClick={exportXlsx} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white">⬇️ Excel</button>
        <button onClick={toOneDrive} className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white">☁️ บันทึกลง OneDrive (finance@)</button><span className="text-xs">{cloud}</span>
        <button onClick={() => window.print()} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white">🖨️ พิมพ์ / บันทึก PDF</button>
      </div>
      <h2 className="mb-2 text-center text-base font-bold">ทะเบียนคุมครุภัณฑ์ {SCHOOL}{loc ? ` — ${loc}` : ""}</h2>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-xs">
        <thead><tr>{head.map((h) => <th key={h} className="border border-slate-400 bg-slate-100 px-2 py-1">{h}</th>)}</tr></thead>
        <tbody>{shown.map((a, i) => <tr key={a.id}>{line(a, i).map((c, j) => <td key={j} className="border border-slate-400 px-2 py-1">{c}</td>)}</tr>)}
          <tr><td colSpan={4} className="border border-slate-400 px-2 py-1 text-right font-bold">รวม {shown.length} รายการ</td><td className="border border-slate-400 px-2 py-1 font-bold">{total.toLocaleString()}</td><td colSpan={4} className="border border-slate-400" /></tr></tbody>
      </table></div>
    </div>
  );
}
