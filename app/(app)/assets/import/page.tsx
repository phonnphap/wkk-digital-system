"use client";
import { useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabase, useAssetRole, STATUSES, CONDITIONS } from "@/lib/assets";

const COLS: Record<string, string> = { "รหัสเดิม": "code", "ชื่อครุภัณฑ์": "name", "รหัสหมวด": "category", "ห้อง/สถานที่": "location", "ยี่ห้อ": "brand", "รุ่น": "model", "เลขเครื่อง": "serial", "ราคา": "price", "วันที่ได้มา": "acquired", "แหล่งที่มา": "source", "จำนวน": "qty", "ปีงบ(2หลัก)": "fy", "สถานะ": "status", "สภาพ": "condition" };
const rev = (o: Record<string, { text: string } | string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [typeof v === "string" ? v : v.text, k]));
const STATUS_TH = rev(STATUSES); const COND_TH = rev(CONDITIONS);

export default function ImportPage() {
  const role = useAssetRole();
  const [rows, setRows] = useState<Record<string, string>[]>([]); const [res, setRes] = useState<{ row_no: number; ok: boolean; msg: string }[]>([]); const [busy, setBusy] = useState(false);

  function template() {
    const ws = XLSX.utils.aoa_to_sheet([Object.keys(COLS), ["", "โต๊ะนักเรียน", "02-01", "ป.1/1", "", "", "", "850", "2024-05-20", "เงินอุดหนุน", "15", "", "ใช้งานอยู่", "ดี"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "นำเข้า"); XLSX.writeFile(wb, "แม่แบบนำเข้าครุภัณฑ์.xlsx");
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setRes([]);
    const wb = XLSX.read(await f.arrayBuffer()); const raw = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
    setRows(raw.map((r) => { const o: Record<string, string> = {}; for (const [th, k] of Object.entries(COLS)) o[k] = String(r[th] ?? "").trim(); o.status = STATUS_TH[o.status] ?? o.status; o.condition = COND_TH[o.condition] ?? o.condition; return o; }).filter((o) => o.name));
  }
  async function run() {
    setBusy(true); const out: typeof res = [];
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await supabase.rpc("import_assets", { p_rows: rows.slice(i, i + 200) });
      if (error) { out.push({ row_no: i + 1, ok: false, msg: error.message }); break; }
      (data as typeof res).forEach((r) => out.push({ ...r, row_no: r.row_no + i }));
    }
    setRes(out); setBusy(false);
  }
  if (role && role !== "admin" && role !== "manager") return <p className="p-6 text-sm text-slate-500">เฉพาะแอดมินและผู้ดูแลโครงการ</p>;
  const bad = res.filter((r) => !r.ok);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/assets/admin" className="text-sm text-slate-500">← ภาพรวม</Link>
      <h1 className="mt-2 text-lg font-bold text-slate-800">นำเข้าครุภัณฑ์จาก Excel</h1>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li><button onClick={template} className="font-semibold text-blue-600">ดาวน์โหลดแม่แบบ</button> แล้วกรอกข้อมูล</li>
        <li>ชื่อห้องต้องตรงกับในระบบ เช่น ป.1/1 และรหัสหมวดต้องมีอยู่แล้ว (เพิ่มที่หน้าภาพรวม)</li>
        <li>ถ้ามี “รหัสเดิม” ระบบใช้รหัสนั้น ถ้าเว้นว่างระบบสร้างรหัสใหม่ให้ (ใส่ “จำนวน” ได้ เช่น 15 ชุดที่ยังไม่มีเลข) รับเลขเดิมหลายรูปแบบ เช่น ขข 010564/69</li>
        <li>วันที่ใช้รูปแบบ 2024-05-20 (ปี ค.ศ.-เดือน-วัน) สถานะ/สภาพเว้นว่างได้</li>
      </ol>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="mt-4 block text-sm" />
      {rows.length > 0 && !res.length && <div className="mt-4"><p className="text-sm font-bold">พบ {rows.length} แถว</p><button onClick={run} disabled={busy} className="mt-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}</button></div>}
      {res.length > 0 && <div className="mt-4"><p className="text-sm font-bold text-emerald-700">สำเร็จ {res.length - bad.length} แถว</p>
        {bad.length > 0 && <><p className="mt-1 text-sm font-bold text-rose-600">ไม่สำเร็จ {bad.length} แถว (แก้ไฟล์แล้วนำเข้าเฉพาะแถวเหล่านี้)</p>
        <ul className="mt-1 space-y-1 text-sm">{bad.map((b) => <li key={b.row_no} className="rounded-lg bg-rose-50 px-3 py-1.5">แถวที่ {b.row_no + 1}: {b.msg}</li>)}</ul></>}</div>}
    </div>
  );
}
