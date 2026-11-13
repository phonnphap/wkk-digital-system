"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, useAssetRole, ASSET_SELECT, STATUSES, CONDITIONS, inputCls, locLabel, type Asset } from "@/lib/assets";
import PhotoUploader from "../_components/PhotoUploader";

type Log = { id: number; status: string; condition: string; note: string | null; at: string };
const ALERT = new Set(["broken", "lost", "pending_disposal"]);

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = useAssetRole();
  const [a, setA] = useState<Asset | null>(null); const [logs, setLogs] = useState<Log[]>([]);
  const [status, setStatus] = useState("active"); const [cond, setCond] = useState("good"); const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await supabase.from("assets").select(ASSET_SELECT).eq("id", id).maybeSingle();
    if (data) { setA(data as Asset); setStatus(data.status); setCond(data.condition); }
    const r = await supabase.from("asset_logs").select("id,status,condition,note,at").eq("asset_id", id).order("at", { ascending: false });
    setLogs((r.data as Log[]) ?? []);
  }
  useEffect(() => { load(); }, [id]);

  async function save() {
    const changedToAlert = ALERT.has(status) && a?.status !== status;
    const { error } = await supabase.rpc("update_asset_status", { p_asset: id, p_status: status, p_condition: cond, p_note: note || null });
    if (error) return setMsg(error.message);
    if (changedToAlert) { // แจ้งผู้ดูแลโครงการทาง LINE (ล้มเหลวก็ไม่บล็อกครู)
      const { data: { session } } = await supabase.auth.getSession();
      fetch("/api/assets/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ assetId: id, status, note }) }).catch(() => {});
    }
    setNote(""); setMsg("บันทึกแล้ว ✅"); load();
  }
  if (!a) return <p className="p-6 text-sm text-slate-400">กำลังโหลด... (หากนานผิดปกติ ตรวจสอบว่าเข้าสู่ระบบแล้ว)</p>;

  const staff = role === "admin" || role === "manager";
  const rows: [string, string | number | null | undefined][] = [
    ["ห้อง/สถานที่", locLabel(a.asset_locations)], ["หมวดหมู่", `${a.category_code} ${a.asset_categories?.name ?? ""}`],
    ["ยี่ห้อ / รุ่น", [a.brand, a.model].filter(Boolean).join(" / ")], ["เลขเครื่อง", a.serial_no],
    ["วันที่ได้มา", a.acquired_date], ["ราคา", a.price ? `${a.price.toLocaleString()} บาท` : null], ["แหล่งที่มา", a.source], ["หมายเหตุ", a.note],
  ];
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button onClick={() => router.push("/assets")} className="text-sm text-slate-500">← รายการครุภัณฑ์</button>
      <h1 className="mt-2 text-xl font-bold text-slate-800">{a.name}</h1>
      <p className="font-mono text-lg font-black tracking-wide text-blue-700">{a.asset_code}</p>
      <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUSES[a.status]?.cls}`}>{STATUSES[a.status]?.text} · สภาพ{CONDITIONS[a.condition]}</span>

      {a.photo_url && <img src={a.photo_url} alt={a.name} className="mt-3 max-h-64 w-full rounded-2xl border border-slate-200 object-cover" />}
      {role && role !== "executive" && <div className="mt-2 flex flex-wrap gap-2"><PhotoUploader assetId={a.id} onDone={load} />
        <Link href={`/repair?asset=${a.id}`} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">🔧 แจ้งซ่อมชิ้นนี้</Link>
        {staff && <Link href={`/assets/${a.id}/edit`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">✏️ แก้ไข / ย้ายห้อง</Link>}</div>}

      <dl className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right font-semibold text-slate-800">{v}</dd></div>)}
      </dl>

      {role && role !== "executive" && (
        <div className="mt-4 space-y-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-sm font-bold text-slate-700">อัปเดตสถานะ</p>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}</select>
          <select className={inputCls} value={cond} onChange={(e) => setCond(e.target.value)}>{Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>สภาพ: {v}</option>)}</select>
          <input className={inputCls} placeholder="หมายเหตุ (เช่น ขาโต๊ะหัก)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={save} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white">บันทึกสถานะ</button>
          {msg && <p className="text-sm font-semibold text-slate-600">{msg}</p>}
        </div>
      )}
      {role && role !== "executive" && <Link href={`/assets/print?ids=${a.id}`} className="mt-3 block text-center text-sm font-semibold text-blue-600">พิมพ์สติกเกอร์ชิ้นนี้</Link>}

      <h2 className="mt-6 text-sm font-bold text-slate-700">ประวัติ</h2>
      <ul className="mt-2 space-y-2">
        {logs.map((l) => (
          <li key={l.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="font-semibold">{STATUSES[l.status]?.text}</span> · {CONDITIONS[l.condition]}{l.note && <span className="text-slate-500"> — {l.note}</span>}
            <p className="text-xs text-slate-400">{new Date(l.at).toLocaleString("th-TH")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
