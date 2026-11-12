"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, useAssetRole } from "@/lib/assets";

type Loc = { id: number; zone: string; name: string };
type Res = { name: string; state: "wait" | "ok" | "err"; url?: string; msg?: string };
const ACCOUNT = "finance@khienkhet.ac.th", FOLDER = "WKK_Asset_Rooms";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// สร้างไฟล์เช็กลิสต์ทุกห้องแล้วอัปโหลดเข้า OneDrive ของ finance@ ผ่าน /api/upload-onedrive เดิม (รันครั้งเดียวพอ)
export default function RoomFilesPage() {
  const role = useAssetRole(); const [locs, setLocs] = useState<Loc[]>([]); const [res, setRes] = useState<Res[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("asset_locations").select("id,zone,name").order("sort").then(({ data }: { data: Loc[] | null }) => setLocs(data ?? [])); }, []);
  if (role && role !== "admin" && role !== "manager") return <p className="p-6 text-sm text-slate-500">เฉพาะแอดมินและผู้ดูแลโครงการ</p>;

  async function run() {
    if (!confirm(`สร้างและอัปโหลด ${locs.length} ไฟล์ไปที่ OneDrive ของ ${ACCOUNT} โฟลเดอร์ ${FOLDER} ?`)) return;
    setBusy(true);
    const { buildRoomWorkbook } = await import("@/lib/roomChecklist");
    const out: Res[] = locs.map((l) => ({ name: l.name, state: "wait" })); setRes([...out]);
    for (let i = 0; i < locs.length; i++) {
      const l = locs[i];
      try {
        const wb = await buildRoomWorkbook(l.name, ["kindergarten", "primary", "secondary"].includes(l.zone) ? "classroom" : "other");
        const fileName = `${l.name.replace(/\//g, "-")}.xlsx`;
        const fd = new FormData();
        fd.append("file", new File([await wb.xlsx.writeBuffer()], fileName, { type: MIME }));
        fd.append("account", ACCOUNT); fd.append("folder", FOLDER); fd.append("fileName", fileName);
        const r = await fetch("/api/upload-onedrive", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(JSON.stringify(j.error ?? j));
        out[i] = { name: l.name, state: "ok", url: j.url };
      } catch (e) { out[i] = { name: l.name, state: "err", msg: (e as Error).message }; }
      setRes([...out]);
    }
    setBusy(false);
  }
  function csv() {
    const body = "ห้อง,ลิงก์\n" + res.filter((r) => r.url).map((r) => `"${r.name}","${r.url}"`).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" })); a.download = "ลิงก์ไฟล์เช็กลิสต์ห้อง.csv"; a.click();
  }
  const ok = res.filter((r) => r.state === "ok").length;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/assets/admin" className="text-sm text-slate-500">← ภาพรวม</Link>
      <h1 className="mt-2 text-lg font-bold text-slate-800">สร้างไฟล์เช็กลิสต์ครุภัณฑ์ทุกห้อง → OneDrive</h1>
      <p className="mt-1 text-sm text-slate-500">สร้าง {locs.length} ไฟล์ (1 ห้อง = 1 ไฟล์) ใน OneDrive ของ {ACCOUNT} โฟลเดอร์ {FOLDER} ให้ครูกรอกใน Excel Online แล้วนำเข้าที่หน้า “นำเข้าจาก Excel” ใช้เมื่อยังไม่เคยอัปโหลด เพราะรันซ้ำอาจได้ไฟล์ซ้ำ</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy || !locs.length} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "กำลังสร้าง/อัปโหลด..." : "☁️ สร้างและอัปโหลดทุกห้อง"}</button>
        {ok > 0 && <button onClick={csv} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">⬇️ ลิงก์ทุกห้อง (CSV)</button>}
        {res.length > 0 && <span className="text-sm text-slate-500">สำเร็จ {ok}/{res.length}</span>}
      </div>
      <ul className="mt-3 space-y-1 text-sm">{res.map((r) => (
        <li key={r.name} className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5"><span className="w-28 font-semibold">{r.name}</span>
          <span className={r.state === "err" ? "text-red-600" : r.state === "ok" ? "text-emerald-600" : "text-slate-400"}>{r.state === "ok" ? "✅" : r.state === "err" ? `❌ ${r.msg}` : "⏳"}</span>
          {r.url && <a href={r.url} target="_blank" className="ml-auto text-blue-600">เปิด</a>}</li>))}</ul>
    </div>
  );
}
