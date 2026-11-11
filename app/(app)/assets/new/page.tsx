"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, ZONES, CONDITIONS, inputCls } from "@/lib/assets";

type Loc = { id: number; zone: string; name: string };
type Cat = { code: string; name: string };
const empty = { name: "", category: "", location: "", brand: "", model: "", serial: "", acquired: "", price: "", source: "", condition: "good", qty: "1" };

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-slate-600">{t}<div className="mt-1 font-normal">{children}</div></label>;
}

export default function NewAssetPage() {
  const router = useRouter();
  const [locs, setLocs] = useState<Loc[]>([]); const [cats, setCats] = useState<Cat[]>([]);
  const [zone, setZone] = useState(""); const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    supabase.from("asset_locations").select("id,zone,name").order("sort").then(({ data }: { data: Loc[] | null }) => setLocs(data ?? []));
    supabase.from("asset_categories").select("code,name").order("code").then(({ data }: { data: Cat[] | null }) => setCats(data ?? []));
  }, []);
  const roomOptions = useMemo(() => locs.filter((l) => l.zone === zone), [locs, zone]);

  async function save() {
    if (!f.name.trim() || !f.category || !f.location) return setErr("กรอกชื่อ เลือกหมวดหมู่ และสถานที่ให้ครบ");
    setSaving(true); setErr("");
    const { data, error } = await supabase.rpc("create_assets", {
      p_name: f.name.trim(), p_category: f.category, p_location: Number(f.location),
      p_brand: f.brand || null, p_model: f.model || null, p_serial: f.serial || null,
      p_acquired: f.acquired || null, p_price: f.price ? Number(f.price) : null, p_source: f.source || null,
      p_condition: f.condition, p_qty: Number(f.qty) || 1,
    });
    setSaving(false);
    if (error) return setErr(error.message);
    router.push(`/assets/print?ids=${(data as { id: string }[]).map((r) => r.id).join(",")}`); // บันทึกเสร็จ → หน้าพิมพ์สติกเกอร์ทันที
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-lg font-bold text-slate-800">เพิ่มครุภัณฑ์</h1>
      <p className="mt-1 text-sm text-slate-500">ไม่ต้องกรอกรหัส ระบบสร้างให้อัตโนมัติเมื่อกดบันทึก</p>
      <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><L t="ชื่อครุภัณฑ์ *"><input className={inputCls} value={f.name} onChange={set("name")} placeholder="เช่น โต๊ะนักเรียน" /></L></div>
        <L t="หมวดหมู่ *"><select className={inputCls} value={f.category} onChange={set("category")}><option value="">เลือก</option>{cats.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}</select></L>
        <L t="จำนวนที่ลงทะเบียน (ชิ้น)"><input type="number" min={1} max={100} className={inputCls} value={f.qty} onChange={set("qty")} /></L>
        <L t="พื้นที่ *"><select className={inputCls} value={zone} onChange={(e) => { setZone(e.target.value); setF({ ...f, location: "" }); }}><option value="">เลือก</option>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <L t="ห้อง / สถานที่ *"><select className={inputCls} value={f.location} onChange={set("location")} disabled={!zone}><option value="">เลือก</option>{roomOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></L>
        <L t="ยี่ห้อ"><input className={inputCls} value={f.brand} onChange={set("brand")} /></L>
        <L t="รุ่น"><input className={inputCls} value={f.model} onChange={set("model")} /></L>
        <L t="เลขเครื่อง (ถ้ามี)"><input className={inputCls} value={f.serial} onChange={set("serial")} /></L>
        <L t="สภาพ"><select className={inputCls} value={f.condition} onChange={set("condition")}>{Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <L t="วันที่ได้มา"><input type="date" className={inputCls} value={f.acquired} onChange={set("acquired")} /></L>
        <L t="ราคา (บาท)"><input type="number" className={inputCls} value={f.price} onChange={set("price")} /></L>
        <div className="sm:col-span-2"><L t="แหล่งที่มา / งบประมาณ"><input className={inputCls} value={f.source} onChange={set("source")} placeholder="เช่น เงินอุดหนุน, บริจาค" /></L></div>
      </div>
      {err && <p className="mt-3 text-sm font-semibold text-rose-600">{err}</p>}
      <button onClick={save} disabled={saving} className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึกและพิมพ์สติกเกอร์"}</button>
    </div>
  );
}
