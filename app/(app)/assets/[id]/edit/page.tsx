"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, useAssetRole, ZONES, inputCls, type Asset } from "@/lib/assets";

type Loc = { id: number; zone: string; name: string };
const FIELDS: [string, string, string][] = [["name", "ชื่อครุภัณฑ์", "text"], ["brand", "ยี่ห้อ", "text"], ["model", "รุ่น", "text"], ["serial_no", "เลขเครื่อง", "text"], ["acquired_date", "วันที่ได้มา", "date"], ["price", "ราคา (บาท)", "number"], ["source", "แหล่งที่มา", "text"], ["note", "หมายเหตุ", "text"]];

export default function EditAssetPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const role = useAssetRole();
  const [f, setF] = useState<Record<string, string>>({}); const [a, setA] = useState<Asset | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]); const [zone, setZone] = useState(""); const [loc, setLoc] = useState(""); const [why, setWhy] = useState(""); const [msg, setMsg] = useState("");

  useEffect(() => { if (role && role !== "admin" && role !== "manager") router.replace(`/assets/${id}`); }, [role, id, router]);
  useEffect(() => {
    supabase.from("assets").select("*, asset_locations(name,zone)").eq("id", id).maybeSingle().then(({ data }: { data: Asset | null }) => {
      if (!data) return; setA(data);
      setF(Object.fromEntries(FIELDS.map(([k]) => [k, String((data as unknown as Record<string, unknown>)[k] ?? "")])));
    });
    supabase.from("asset_locations").select("id,zone,name").order("sort").then(({ data }: { data: Loc[] | null }) => setLocs(data ?? []));
  }, [id]);
  const rooms = useMemo(() => locs.filter((l) => l.zone === zone), [locs, zone]);

  async function save() {
    if (!f.name?.trim()) return setMsg("กรอกชื่อครุภัณฑ์");
    const { error } = await supabase.from("assets").update({
      name: f.name.trim(), brand: f.brand || null, model: f.model || null, serial_no: f.serial_no || null,
      acquired_date: f.acquired_date || null, price: f.price ? Number(f.price) : null, source: f.source || null, note: f.note || null, updated_at: new Date().toISOString(),
    }).eq("id", id);
    setMsg(error ? error.message : "บันทึกแล้ว ✅");
  }
  async function move() {
    if (!loc) return setMsg("เลือกห้องปลายทาง");
    const { error } = await supabase.rpc("move_asset", { p_asset: id, p_location: Number(loc), p_note: why });
    if (error) return setMsg(error.message);
    router.push(`/assets/${id}`);
  }
  if (!a) return <p className="p-6 text-sm text-slate-400">กำลังโหลด...</p>;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button onClick={() => router.push(`/assets/${id}`)} className="text-sm text-slate-500">← กลับ</button>
      <h1 className="mt-2 text-lg font-bold text-slate-800">แก้ไข {a.asset_code}</h1>
      <p className="text-xs text-slate-500">รหัสและหมวดหมู่แก้ไม่ได้ เพื่อให้รหัสตรงกับสติกเกอร์ที่ติดแล้ว</p>
      <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        {FIELDS.map(([k, label, type]) => <label key={k} className="text-xs font-bold text-slate-600">{label}<input type={type} className={`${inputCls} mt-1 font-normal`} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
        <button onClick={save} className="rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white">บันทึกการแก้ไข</button>
      </div>
      <div className="mt-4 grid gap-2 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
        <p className="text-sm font-bold text-slate-700">ย้ายห้อง (ปัจจุบัน: {a.asset_locations?.name})</p>
        <select className={inputCls} value={zone} onChange={(e) => { setZone(e.target.value); setLoc(""); }}><option value="">เลือกพื้นที่</option>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={inputCls} value={loc} onChange={(e) => setLoc(e.target.value)} disabled={!zone}><option value="">เลือกห้อง</option>{rooms.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <input className={inputCls} placeholder="เหตุผล (ไม่บังคับ)" value={why} onChange={(e) => setWhy(e.target.value)} />
        <button onClick={move} className="rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white">ย้าย และบันทึกประวัติ</button>
      </div>
      {msg && <p className="mt-3 text-sm font-semibold text-slate-600">{msg}</p>}
    </div>
  );
}
