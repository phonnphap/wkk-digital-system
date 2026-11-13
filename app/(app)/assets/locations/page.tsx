"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, useAssetRole, ZONES, roomKey, inputCls } from "@/lib/assets";

type Loc = { id: number; zone: string; name: string; floor: number | null; building_id: string | null; classroom_id: string | null };
type B = { id: string; name: string }; type Cr = { id: string; room_name: string };
const CLASS_ZONES = ["kindergarten", "primary", "secondary"];

// จัดการสถานที่: เพิ่ม/แก้ชื่อ, ผูกอาคาร + ชั้น (buildings), ผูกห้องเรียน (classrooms) เพื่อให้ "ห้องของฉัน" ตรงกับครูประจำชั้น
export default function LocationsPage() {
  const role = useAssetRole();
  const [rows, setRows] = useState<Loc[]>([]); const [blds, setBlds] = useState<B[]>([]); const [crs, setCrs] = useState<Cr[]>([]);
  const [q, setQ] = useState(""); const [zone, setZone] = useState(""); const [msg, setMsg] = useState(""); const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [nf, setNf] = useState({ name: "", zone: "lab", building_id: "", floor: "" });
  const load = async () => {
    const a = await supabase.from("asset_locations").select("id,zone,name,floor,building_id,classroom_id").order("sort").limit(1000);
    setRows((a.data as Loc[]) ?? []); setDirty(new Set());
    setBlds(((await supabase.from("buildings").select("id,name").order("name")).data as B[]) ?? []);
    setCrs(((await supabase.from("classrooms").select("id,room_name").order("room_name")).data as Cr[]) ?? []);
  };
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => rows.filter((r) => (!zone || r.zone === zone) && (!q || r.name.toLowerCase().includes(q.toLowerCase()))), [rows, zone, q]);
  if (role && role !== "admin" && role !== "manager") return <p className="p-6 text-sm text-slate-500">เฉพาะแอดมินและผู้ดูแลโครงการ</p>;

  const edit = (id: number, p: Partial<Loc>) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))); setDirty((d) => new Set(d).add(id)); };
  async function save(r: Loc) {
    const { error } = await supabase.from("asset_locations").update({ name: r.name.trim(), zone: r.zone, floor: r.floor, building_id: r.building_id, classroom_id: r.classroom_id }).eq("id", r.id);
    if (error) return setMsg(error.message);
    setDirty((d) => { const n = new Set(d); n.delete(r.id); return n; }); setMsg("บันทึกแล้ว ✅");
  }
  async function add() {
    if (!nf.name.trim()) return;
    const { error } = await supabase.from("asset_locations").insert({ name: nf.name.trim(), zone: nf.zone, building_id: nf.building_id || null, floor: nf.floor ? Number(nf.floor) : null });
    if (error) return setMsg(error.message);
    setNf({ ...nf, name: "", floor: "" }); setMsg("เพิ่มแล้ว — กด “เรียงลำดับใหม่” เพื่อจัดตำแหน่ง"); load();
  }
  async function del(r: Loc) {
    if (!confirm(`ลบสถานที่ ${r.name} ?`)) return;
    const { error } = await supabase.from("asset_locations").delete().eq("id", r.id);
    setMsg(error ? `ลบไม่ได้ (อาจมีครุภัณฑ์อยู่ในห้องนี้): ${error.message}` : "ลบแล้ว"); load();
  }
  async function run(fn: string, label: string) {
    const { data, error } = await supabase.rpc(fn); setMsg(error ? error.message : `${label}${typeof data === "number" ? ` ${data} ห้อง` : " เสร็จแล้ว"}`); load();
  }
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700";
  return (
    <div className="w-full px-4 py-6 lg:px-8">
      <Link href="/assets/admin" className="text-sm text-slate-500">← ภาพรวม</Link>
      <h1 className="mt-2 text-lg font-bold text-slate-800">สถานที่ / ห้อง ({rows.length})</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => run("link_location_classrooms", "ผูกห้องเรียนอัตโนมัติ")} className={btn}>🔗 ผูกห้องเรียนอัตโนมัติ</button>
        <button onClick={() => run("guess_location_buildings", "เดาอาคาร/ชั้นจากเลขห้อง")} className={btn}>🏢 เดาอาคาร/ชั้นจากเลขห้อง</button>
        <button onClick={() => run("resort_asset_locations", "เรียงลำดับใหม่")} className={btn}>↕️ เรียงลำดับใหม่</button>
      </div>
      <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_150px_1fr_80px_auto]">
        <input className={inputCls} placeholder="ชื่อสถานที่ใหม่ เช่น ห้องคอมพิวเตอร์ 4401" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
        <select className={inputCls} value={nf.zone} onChange={(e) => setNf({ ...nf, zone: e.target.value })}>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={inputCls} value={nf.building_id} onChange={(e) => setNf({ ...nf, building_id: e.target.value })}><option value="">อาคาร (ไม่ระบุ)</option>{blds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <input className={inputCls} placeholder="ชั้น" inputMode="numeric" value={nf.floor} onChange={(e) => setNf({ ...nf, floor: e.target.value })} />
        <button onClick={add} className="rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">เพิ่ม</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className={`${inputCls} !w-56`} placeholder="ค้นหาชื่อ" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputCls} !w-auto`} value={zone} onChange={(e) => setZone(e.target.value)}><option value="">ทุกพื้นที่</option>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {msg && <span className="self-center text-sm font-semibold text-slate-600">{msg}</span>}
      </div>
      <div className="mt-3 space-y-1.5">
        {shown.map((r) => (
          <div key={r.id} className={`grid items-center gap-2 rounded-xl border px-3 py-2 sm:grid-cols-[1fr_140px_1fr_70px_1fr_auto] ${dirty.has(r.id) ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <input className={inputCls} value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} />
            <select className={inputCls} value={r.zone} onChange={(e) => edit(r.id, { zone: e.target.value })}>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select className={inputCls} value={r.building_id ?? ""} onChange={(e) => edit(r.id, { building_id: e.target.value || null })}><option value="">— อาคาร —</option>{blds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <input className={inputCls} placeholder="ชั้น" inputMode="numeric" value={r.floor ?? ""} onChange={(e) => edit(r.id, { floor: e.target.value ? Number(e.target.value) : null })} />
            {CLASS_ZONES.includes(r.zone)
              ? <select className={inputCls} value={r.classroom_id ?? ""} onChange={(e) => edit(r.id, { classroom_id: e.target.value || null })}><option value="">— ห้องเรียน (ครูประจำชั้น) —</option>
                  {crs.filter((c) => c.id === r.classroom_id || roomKey(c.room_name) === roomKey(r.name)).map((c) => <option key={c.id} value={c.id}>{c.room_name} ({c.id.slice(0, 4)})</option>)}</select>
              : <span className="text-xs text-slate-300">—</span>}
            <div className="flex gap-2"><button onClick={() => save(r)} disabled={!dirty.has(r.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30">บันทึก</button>
              <button onClick={() => del(r)} className="text-xs font-bold text-red-600">ลบ</button></div>
          </div>))}
      </div>
    </div>
  );
}
