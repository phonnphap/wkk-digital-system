"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ScanLine, Printer, ShieldCheck, Search } from "lucide-react";
import { supabase, useAssetRole, ASSET_SELECT, STATUSES, ZONES, ROLE_LABEL, inputCls, useMyRooms, roomKey, type Asset } from "@/lib/assets";

export default function AssetsPage() {
  const router = useRouter();
  const role = useAssetRole();
  const [rows, setRows] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); const [zone, setZone] = useState(""); const [status, setStatus] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [noSticker, setNoSticker] = useState(false); const [onlyMine, setOnlyMine] = useState(false);
  const myRooms = useMyRooms(); const mineKeys = myRooms.map(roomKey);

  useEffect(() => {
    supabase.from("assets").select(ASSET_SELECT).order("created_at", { ascending: false }).limit(1000)
      .then(({ data }: { data: Asset[] | null }) => { setRows(data ?? []); setLoading(false); });
  }, []);

  const shown = useMemo(() => rows.filter((a) =>
    (!zone || a.asset_locations?.zone === zone) && (!status || a.status === status) &&
    (!noSticker || !a.sticker_attached) && (!onlyMine || mineKeys.includes(roomKey(a.asset_locations?.name ?? ""))) &&
    (!q || `${a.name} ${a.asset_code} ${a.asset_locations?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, zone, status, noSticker, onlyMine, myRooms]);
  const count = (s: string) => rows.filter((a) => a.status === s).length;
  const canEdit = role !== "executive";
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg">🏠</button>
        <h1 className="text-lg font-bold text-slate-800">ระบบครุภัณฑ์</h1>
        {role && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{ROLE_LABEL[role]}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/assets/scan" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><ScanLine className="h-4 w-4" />สแกน QR</Link>
          <Link href="/assets/room-sheet" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">ใบสรุปห้อง</Link>
          {canEdit && <Link href="/assets/audit" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">ตรวจนับ</Link>}
          <Link href="/assets/report" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">รายงาน</Link>
          {canEdit && <Link href="/assets/new" className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />เพิ่มครุภัณฑ์</Link>}
          {role && role !== "teacher" && <Link href="/assets/admin" className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"><ShieldCheck className="h-4 w-4" />ภาพรวม / จัดการ</Link>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Object.entries(STATUSES).map(([k, v]) => (
          <button key={k} onClick={() => setStatus(status === k ? "" : k)}
            className={`rounded-2xl border p-3 text-left ${status === k ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
            <p className="text-2xl font-black text-slate-800">{count(k)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.cls}`}>{v.text}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className={`${inputCls} pl-9`} placeholder="ค้นหาชื่อ / รหัส / ห้อง" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} !w-auto`} value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">ทุกพื้นที่</option>
          {Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {myRooms.length > 0 && <button onClick={() => setOnlyMine(!onlyMine)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${onlyMine ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>🏫 ห้องของฉัน</button>}
        <button onClick={() => setNoSticker(!noSticker)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${noSticker ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600"}`}>🏷️ ยังไม่ติดสติกเกอร์ ({rows.filter((a) => !a.sticker_attached).length})</button>
        {sel.size > 0 && (
          <button onClick={() => router.push(`/assets/print?ids=${[...sel].join(",")}`)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white"><Printer className="h-4 w-4" />พิมพ์สติกเกอร์ ({sel.size})</button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? <p className="text-sm text-slate-400">กำลังโหลด...</p> : shown.length === 0 ? <p className="text-sm text-slate-400">ไม่พบครุภัณฑ์ — กด “เพิ่มครุภัณฑ์” เพื่อเริ่มลงทะเบียน</p> :
          shown.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              {canEdit && <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4" />}
              <Link href={`/assets/${a.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-slate-800">{a.name}</p>
                  <p className="truncate text-xs text-slate-500"><span className="font-mono">{a.asset_code}</span> · {a.asset_locations?.name}{!a.sticker_attached && <span className="text-amber-600"> · ยังไม่ติดสติกเกอร์</span>}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUSES[a.status]?.cls}`}>{STATUSES[a.status]?.text}</span>
              </Link>
            </div>
          ))}
      </div>
    </div>
  );
}
