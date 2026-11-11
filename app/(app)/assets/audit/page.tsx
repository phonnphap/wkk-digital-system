"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Scanner } from "@yudiel/react-qr-scanner";
import { supabase, useAssetRole, ASSET_SELECT, inputCls, type Asset } from "@/lib/assets";

type Audit = { id: string; name: string; closed_at: string | null };
type Loc = { id: number; name: string };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function AuditPage() {
  const role = useAssetRole(); const staff = role === "admin" || role === "manager";
  const [audits, setAudits] = useState<Audit[]>([]); const [auditId, setAuditId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]); const [locs, setLocs] = useState<Loc[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set()); const [locId, setLocId] = useState("");
  const [name, setName] = useState(""); const [msg, setMsg] = useState(""); const [cam, setCam] = useState(false);

  const loadAudits = () => supabase.from("asset_audits").select("id,name,closed_at").order("started_at", { ascending: false }).then(({ data }: { data: Audit[] | null }) => { setAudits(data ?? []); if (data?.[0] && !auditId) setAuditId(data[0].id); });
  useEffect(() => {
    loadAudits();
    supabase.from("assets").select(ASSET_SELECT).neq("status", "disposed").limit(5000).then(({ data }: { data: Asset[] | null }) => setAssets(data ?? []));
    supabase.from("asset_locations").select("id,name").order("sort").then(({ data }: { data: Loc[] | null }) => setLocs(data ?? []));
  }, []);
  useEffect(() => {
    if (!auditId) return;
    supabase.from("asset_audit_scans").select("asset_id").eq("audit_id", auditId).limit(10000)
      .then(({ data }: { data: { asset_id: string }[] | null }) => setChecked(new Set((data ?? []).map((r) => r.asset_id))));
  }, [auditId]);

  const audit = audits.find((x) => x.id === auditId); const open = !!audit && !audit.closed_at;
  const room = useMemo(() => assets.filter((a) => String(a.location_id) === locId), [assets, locId]);
  const missing = useMemo(() => {
    const m = new Map<string, number>();
    assets.filter((a) => !checked.has(a.id)).forEach((a) => { const n = a.asset_locations?.name ?? "-"; m.set(n, (m.get(n) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets, checked]);

  async function mark(a: Asset) {
    if (!open || checked.has(a.id)) return;
    const { error } = await supabase.from("asset_audit_scans").upsert({ audit_id: auditId, asset_id: a.id }, { onConflict: "audit_id,asset_id", ignoreDuplicates: true });
    if (error) return setMsg(error.message);
    setChecked((p) => new Set(p).add(a.id));
  }
  function onScan(raw?: string) {
    const m = raw?.match(UUID); if (!m) return;
    const a = assets.find((x) => x.id === m[0]); if (!a) return setMsg("ไม่พบครุภัณฑ์นี้ในระบบ");
    mark(a); setMsg(`✅ ${a.name} (${a.asset_code})${String(a.location_id) !== locId ? ` — ลงทะเบียนอยู่ที่ ${a.asset_locations?.name}` : ""}`);
  }
  async function create() { if (!name.trim()) return; const { data } = await supabase.from("asset_audits").insert({ name: name.trim() }).select("id").single(); setName(""); if (data) setAuditId(data.id); loadAudits(); }
  async function close() { await supabase.from("asset_audits").update({ closed_at: new Date().toISOString() }).eq("id", auditId); loadAudits(); }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/assets" className="text-sm text-slate-500">← รายการครุภัณฑ์</Link>
      <h1 className="mt-2 text-lg font-bold text-slate-800">ตรวจนับครุภัณฑ์</h1>
      {staff && <div className="mt-3 flex gap-2"><input className={inputCls} placeholder="เปิดรอบใหม่ เช่น ตรวจนับปีงบประมาณ 2570" value={name} onChange={(e) => setName(e.target.value)} /><button onClick={create} className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">เปิดรอบ</button></div>}
      <div className="mt-3 flex gap-2">
        <select className={inputCls} value={auditId} onChange={(e) => setAuditId(e.target.value)}><option value="">เลือกรอบตรวจนับ</option>{audits.map((x) => <option key={x.id} value={x.id}>{x.name}{x.closed_at ? " (ปิดแล้ว)" : ""}</option>)}</select>
        {staff && open && <button onClick={close} className="shrink-0 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-600">ปิดรอบ</button>}
      </div>
      {audit && (<>
        <select className={`${inputCls} mt-3`} value={locId} onChange={(e) => setLocId(e.target.value)}><option value="">เลือกห้องที่กำลังตรวจ</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        {locId && <>
          <p className="mt-3 text-sm font-bold text-slate-700">ตรวจแล้ว {room.filter((a) => checked.has(a.id)).length} / {room.length} ชิ้น</p>
          {open && <button onClick={() => setCam(!cam)} className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">{cam ? "ปิดกล้อง" : "📷 เปิดกล้องสแกน"}</button>}
          {cam && <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200"><Scanner onScan={(r) => onScan(r?.[0]?.rawValue)} constraints={{ facingMode: "environment" }} /></div>}
          {msg && <p className="mt-2 text-sm font-semibold text-slate-600">{msg}</p>}
          <ul className="mt-3 space-y-1.5">{room.map((a) => (
            <li key={a.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${checked.has(a.id) ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
              <input type="checkbox" className="h-4 w-4" checked={checked.has(a.id)} disabled={!open || checked.has(a.id)} onChange={() => mark(a)} />
              <span className="font-semibold">{a.name}</span><span className="ml-auto font-mono text-xs text-slate-500">{a.asset_code}</span>
            </li>))}</ul>
        </>}
        {staff && <>
          <h2 className="mt-6 text-sm font-bold text-slate-700">ยังไม่พบ แยกตามห้อง (รวม {assets.length - checked.size} ชิ้น)</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{missing.map(([n, c]) => <li key={n} className="flex justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm"><span className="font-semibold">{n}</span><span className="font-black text-amber-700">{c}</span></li>)}</ul>
        </>}
      </>)}
    </div>
  );
}
