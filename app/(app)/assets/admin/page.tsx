"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, useAssetRole, ASSET_SELECT, STATUSES, ZONES, inputCls, type Asset } from "@/lib/assets";

type U = { auth_id: string; first_name: string | null; last_name: string | null; title?: string | null; role: string | null };
const USER_COLS = "auth_id,first_name,last_name,title,role";
const nm = (u: U) => `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();

export default function AssetAdminPage() {
  const router = useRouter();
  const role = useAssetRole();
  const [rows, setRows] = useState<Asset[]>([]);
  const [cat, setCat] = useState({ code: "", name: "" });
  const [mgrs, setMgrs] = useState<U[]>([]); const [q, setQ] = useState(""); const [found, setFound] = useState<U[]>([]);

  useEffect(() => { if (role === "teacher") router.replace("/assets"); }, [role, router]);
  useEffect(() => {
    supabase.from("assets").select(ASSET_SELECT).limit(5000).then(({ data }: { data: Asset[] | null }) => setRows(data ?? []));
    loadMgrs();
  }, []);

  async function loadMgrs() {
    const { data } = await supabase.from("asset_managers").select("auth_id");
    const ids = (data ?? []).map((r: { auth_id: string }) => r.auth_id);
    if (!ids.length) return setMgrs([]);
    const u = await supabase.from("users").select(USER_COLS).in("auth_id", ids);
    setMgrs((u.data as U[]) ?? []);
  }
  async function search() {
    const parts = q.trim().replace(/[,()]/g, " ").split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    // ครูที่ยังไม่เคยล็อกอินจะไม่มี auth_id จึงเพิ่มเป็นผู้ดูแลไม่ได้
    let qb: any = supabase.from("users").select(USER_COLS).not("auth_id", "is", null).limit(8);
    qb = parts.length > 1
      ? qb.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts[1]}%`)
      : qb.or(`first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[0]}%`);
    const { data, error } = await qb;
    if (error) return alert("ค้นหาไม่สำเร็จ: " + error.message);
    if (!data?.length) alert("ไม่พบชื่อนี้ (ครูต้องเคยล็อกอินเข้าระบบอย่างน้อย 1 ครั้ง)");
    setFound((data as U[]) ?? []);
  }
  const addMgr = async (id: string) => {
    const { error } = await supabase.from("asset_managers").insert({ auth_id: id });
    if (error) return alert("เพิ่มไม่สำเร็จ: " + error.message + "\n(ต้องล็อกอินด้วยบัญชีที่ role = admin ในตาราง users)");
    setFound([]); setQ(""); loadMgrs();
  };
  const delMgr = async (id: string) => { await supabase.from("asset_managers").delete().eq("auth_id", id); loadMgrs(); };
  async function addCat() {
    if (!cat.code || !cat.name) return;
    const { error } = await supabase.from("asset_categories").insert(cat);
    if (error) alert(error.message); else { alert("เพิ่มหมวดหมู่แล้ว"); setCat({ code: "", name: "" }); }
  }

  const problems = useMemo(() => {
    const m = new Map<string, number>();
    rows.filter((a) => ["broken", "repairing", "pending_disposal", "lost"].includes(a.status)).forEach((a) => { const n = a.asset_locations?.name ?? "-"; m.set(n, (m.get(n) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);
  const total = rows.reduce((s, a) => s + (a.price ?? 0), 0);

  function exportCsv() {
    const head = ["รหัส", "ชื่อ", "หมวด", "สถานที่", "สถานะ", "สภาพ", "ราคา", "วันที่ได้มา"];
    const lines = rows.map((a) => [a.asset_code, a.name, a.category_code, a.asset_locations?.name, STATUSES[a.status]?.text, a.condition, a.price ?? "", a.acquired_date ?? ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "ทะเบียนครุภัณฑ์.csv"; el.click();
  }
  const canManage = role === "admin" || role === "manager";

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      <Link href="/assets" className="text-sm text-slate-500">← รายการครุภัณฑ์</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-lg font-bold text-slate-800">ภาพรวมครุภัณฑ์</h1>
        <button onClick={exportCsv} className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">⬇️ ส่งออก CSV (เปิดใน Excel)</button>
        <Link href="/assets/report" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">ทะเบียนคุม / PDF</Link>
        {canManage && <Link href="/assets/import" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">นำเข้าจาก Excel</Link>}
        {canManage && <Link href="/assets/categories" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">หมวดหมู่</Link>}
        {canManage && <Link href="/assets/room-files" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">ไฟล์เช็กลิสต์ห้อง</Link>}
        {canManage && <Link href="/assets/locations" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">สถานที่ / อาคาร</Link>}</div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-3xl font-black">{rows.length}</p><p className="text-sm text-slate-500">ครุภัณฑ์ทั้งหมด</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-3xl font-black">{total.toLocaleString()}</p><p className="text-sm text-slate-500">มูลค่ารวม (บาท)</p></div>
        {Object.entries(ZONES).slice(0, 2).map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-3xl font-black">{rows.filter((a) => a.asset_locations?.zone === k).length}</p><p className="text-sm text-slate-500">{v}</p></div>)}
      </div>

      <h2 className="mt-6 text-sm font-bold text-slate-700">ห้องที่มีครุภัณฑ์ต้องดูแลมากที่สุด (ชำรุด/ส่งซ่อม/รอจำหน่าย/สูญหาย)</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {problems.length === 0 ? <li className="text-sm text-slate-400">ยังไม่มีรายการ</li> : problems.map(([n, c]) => <li key={n} className="flex justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm"><span className="font-semibold">{n}</span><span className="font-black text-amber-700">{c}</span></li>)}
      </ul>

      {canManage && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-700">เพิ่มหมวดหมู่ (ตามคู่มือพัสดุ)</h2>
            <div className="mt-2 flex gap-2"><input className={`${inputCls} !w-28`} placeholder="04-06" value={cat.code} onChange={(e) => setCat({ ...cat, code: e.target.value })} />
              <input className={inputCls} placeholder="ชื่อหมวด" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
              <button onClick={addCat} className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">เพิ่ม</button></div>
          </div>
          {role === "admin" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-700">ผู้ดูแลโครงการ</h2>
              <ul className="mt-2 space-y-1">{mgrs.map((m) => <li key={m.auth_id} className="flex justify-between text-sm"><span>{nm(m)}</span><button onClick={() => delMgr(m.auth_id)} className="text-rose-600">ลบ</button></li>)}</ul>
              <div className="mt-2 flex gap-2"><input className={inputCls} placeholder="ค้นชื่อครู" value={q} onChange={(e) => setQ(e.target.value)} /><button onClick={search} className="shrink-0 rounded-xl border border-slate-200 px-4 text-sm font-semibold">ค้นหา</button></div>
              {found.map((u) => <button key={u.auth_id} onClick={() => addMgr(u.auth_id)} className="mt-1 block w-full rounded-lg bg-slate-50 px-3 py-1.5 text-left text-sm hover:bg-blue-50">＋ {nm(u)}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
