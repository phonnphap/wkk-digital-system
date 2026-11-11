"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/assets";

type P = { id: string; asset_code: string; name: string; asset_locations?: { name: string } | null };
const SEL = "id,asset_code,name,asset_locations(name)";

// ช่องค้นหา/เลือกครุภัณฑ์ ใช้ในฟอร์มแจ้งซ่อม
export default function AssetPicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: boolean }) {
  const [sel, setSel] = useState<P | null>(null); const [q, setQ] = useState(""); const [res, setRes] = useState<P[]>([]);

  useEffect(() => {
    if (!value) return setSel(null);
    if (sel?.id === value) return;
    supabase.from("assets").select(SEL).eq("id", value).maybeSingle().then(({ data }: { data: unknown }) => data && setSel(data as P));
  }, [value]);
  useEffect(() => {
    const t = q.trim().replace(/[,()]/g, ""); if (t.length < 2) return setRes([]);
    const h = setTimeout(() => {
      supabase.from("assets").select(SEL).or(`name.ilike.%${t}%,asset_code.ilike.%${t}%`).neq("status", "disposed").limit(6)
        .then(({ data }: { data: unknown }) => setRes((data as P[]) ?? []));
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  if (sel && value) return (
    <div className="flex items-center justify-between rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
      <span><b>{sel.name}</b> <span className="font-mono text-xs text-slate-500">{sel.asset_code}</span>{sel.asset_locations?.name && <span className="text-slate-500"> · {sel.asset_locations.name}</span>}</span>
      <button type="button" onClick={() => { setSel(null); onChange(""); }} className="text-xs font-bold text-red-600">เปลี่ยน</button>
    </div>
  );
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 พิมพ์ชื่อหรือรหัสครุภัณฑ์ เช่น ขข-04-06-01/69"
        className={`w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm focus:outline-none ${error ? "border-red-400 bg-red-50" : "border-blue-200 focus:border-blue-500"}`} />
      {res.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border-2 border-blue-200 bg-white shadow-lg">
          {res.map((a) => (
            <button type="button" key={a.id} onClick={() => { setSel(a); onChange(a.id); setQ(""); setRes([]); }}
              className="block w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-0 hover:bg-blue-50">
              <b>{a.name}</b> <span className="font-mono text-xs text-slate-500">{a.asset_code}</span>
              <span className="text-xs text-slate-400"> · {a.asset_locations?.name}</span>
            </button>))}
        </div>)}
      {error && <p className="mt-1 text-xs text-red-500">กรุณาเลือกครุภัณฑ์ที่ชำรุด</p>}
    </div>
  );
}
