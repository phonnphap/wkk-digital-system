"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabase, useAssetRole, inputCls } from "@/lib/assets";

type Cat = { code: string; name: string; kind: string };

// จัดการหมวดหมู่ (สารบัญรายชื่อทรัพย์สิน): เพิ่มทีละรายการ หรือนำเข้าจาก Excel (คอลัมน์: รหัส | ชื่อหมวด | ประเภท = ครุภัณฑ์/วัสดุ)
export default function CategoriesPage() {
  const role = useAssetRole(); const [cats, setCats] = useState<Cat[]>([]); const [f, setF] = useState({ code: "", name: "", kind: "durable" }); const [msg, setMsg] = useState("");
  const load = () => supabase.from("asset_categories").select("code,name,kind").order("kind").order("code").then(({ data }: { data: Cat[] | null }) => setCats(data ?? []));
  useEffect(() => { load(); }, []);
  if (role && role !== "admin" && role !== "manager") return <p className="p-6 text-sm text-slate-500">เฉพาะแอดมินและผู้ดูแลโครงการ</p>;

  async function save(rows: Cat[]) {
    const { error } = await supabase.from("asset_categories").upsert(rows, { onConflict: "code" });
    setMsg(error ? error.message : `บันทึกแล้ว ${rows.length} รายการ ✅`); if (!error) load();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const wb = XLSX.read(await file.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
    save(raw.map((r) => ({ code: String(r["รหัส"]).trim(), name: String(r["ชื่อหมวด"]).trim(), kind: String(r["ประเภท"]).includes("วัสดุ") ? "supply" : "durable" })).filter((r) => r.code && r.name));
  }
  function template() {
    const ws = XLSX.utils.aoa_to_sheet([["รหัส", "ชื่อหมวด", "ประเภท"], ["04-06", "โต๊ะทำงาน", "ครุภัณฑ์"], ["ว.สน", "วัสดุสำนักงาน", "วัสดุ"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "หมวดหมู่"); XLSX.writeFile(wb, "แม่แบบหมวดหมู่.xlsx");
  }
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/assets/admin" className="text-sm text-slate-500">← ภาพรวม</Link>
      <h1 className="mt-2 text-lg font-bold text-slate-800">หมวดหมู่ครุภัณฑ์ / วัสดุ</h1>
      <p className="mt-1 text-sm text-slate-500">ครุภัณฑ์ใช้รหัส “ประเภท-ชนิด” เช่น 04-06 (ได้เลข ขข-04-06-01/69) ส่วนวัสดุใช้รหัส เช่น ว.สน (ได้เลข ว.สน-001/69)</p>
      <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[100px_1fr_110px_auto]">
        <input className={inputCls} placeholder="04-06" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <input className={inputCls} placeholder="ชื่อหมวด" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="durable">ครุภัณฑ์</option><option value="supply">วัสดุ</option></select>
        <button onClick={() => f.code && f.name && save([{ code: f.code.trim(), name: f.name.trim(), kind: f.kind }])} className="rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">บันทึก</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><button onClick={template} className="font-semibold text-blue-600">ดาวน์โหลดแม่แบบ Excel</button><input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} /></div>
      {msg && <p className="mt-2 text-sm font-semibold text-slate-600">{msg}</p>}
      <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
        {cats.map((c) => <li key={c.code} className="flex gap-3 px-4 py-2"><span className="w-20 font-mono font-bold">{c.code}</span><span className="flex-1">{c.name}</span><span className="text-xs text-slate-400">{c.kind === "supply" ? "วัสดุ" : "ครุภัณฑ์"}</span></li>)}
      </ul>
    </div>
  );
}
