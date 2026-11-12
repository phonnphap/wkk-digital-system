"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase, inputCls } from "@/lib/assets";

type G = { code: string; name: string };
type C = { code: string; name: string; group_code: string | null; kind: string };
type S = { group_code: string; name: string };

// เลือกรายการครุภัณฑ์: เลือกประเภท → พิมพ์ค้นหา → กดเลือก (รายการที่ยังไม่มีเลขชนิด ระบบออกให้เอง)
export default function ItemPicker({ value, onChange }: { value: string; onChange: (code: string, name: string) => void }) {
  const [groups, setGroups] = useState<G[]>([]); const [cats, setCats] = useState<C[]>([]); const [sugs, setSugs] = useState<S[]>([]);
  const [g, setG] = useState(""); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  const load = async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("asset_groups").select("code,name").order("sort"),
      supabase.from("asset_categories").select("code,name,group_code,kind").order("code"),
      supabase.from("asset_suggestions").select("group_code,name"),
    ]);
    setGroups((a.data as G[]) ?? []); setCats((b.data as C[]) ?? []); setSugs((c.data as S[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const t = q.trim().toLowerCase();
  const { named, sug } = useMemo(() => {
    const taken = new Set(cats.map((c) => `${c.group_code}|${c.name}`));
    return {
      named: cats.filter((c) => (!g || c.group_code === g) && (!t || c.name.toLowerCase().includes(t) || c.code.includes(t))),
      sug: sugs.filter((s) => (!g || s.group_code === g) && (!t || s.name.toLowerCase().includes(t)) && !taken.has(`${s.group_code}|${s.name}`)),
    };
  }, [cats, sugs, g, t]);

  async function claim(group: string, name: string) {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("claim_asset_type", { p_group: group, p_name: name });
    setBusy(false); if (error) return setErr(error.message);
    await load(); setQ(""); onChange(data as string, name);
  }

  const selected = cats.find((c) => c.code === value);
  if (value && selected) return (
    <div className="flex items-center justify-between rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
      <span><b className="font-mono">{selected.code}</b> {selected.name} <span className="text-xs text-slate-500">· {groups.find((x) => x.code === selected.group_code)?.name}</span></span>
      <button type="button" onClick={() => onChange("", "")} className="text-xs font-bold text-red-600">เปลี่ยน</button>
    </div>
  );
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`;
  const row = "block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-blue-50";
  const exact = named.some((c) => c.name.toLowerCase() === t) || sug.some((s) => s.name.toLowerCase() === t);
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button type="button" onClick={() => setG("")} className={chip(!g)}>ทุกประเภท</button>
        {groups.map((x) => <button type="button" key={x.code} onClick={() => setG(x.code)} className={chip(g === x.code)}>{x.code} {x.name.replace("ครุภัณฑ์", "")}</button>)}
      </div>
      <input className={`${inputCls} mt-2`} placeholder="🔍 พิมพ์ชื่อรายการ เช่น โต๊ะ, เครื่องพิมพ์, ตู้เย็น" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {named.slice(0, 40).map((c) => (
          <button type="button" key={c.code} onClick={() => onChange(c.code, c.name)} className={row}>
            <b className="font-mono text-blue-700">{c.code}</b> {c.name} <span className="text-xs text-slate-400">· {groups.find((x) => x.code === c.group_code)?.name}</span>
          </button>))}
        {sug.slice(0, 40).map((s) => (
          <button type="button" key={s.group_code + s.name} disabled={busy} onClick={() => claim(s.group_code, s.name)} className={row}>
            <span className="text-slate-400">＋</span> {s.name} <span className="text-xs text-amber-600">· ใหม่ ระบบออกเลขชนิดให้</span>
          </button>))}
        {g && g !== "V" && t && !exact && (
          <button type="button" disabled={busy} onClick={() => claim(g, q.trim())} className={`${row} font-semibold text-emerald-700`}>＋ เพิ่ม “{q.trim()}” เป็นรายการใหม่ในประเภทนี้</button>)}
        {!named.length && !sug.length && !(g && t) && <p className="px-3 py-3 text-sm text-slate-400">ไม่พบ — เลือกประเภทด้านบนแล้วพิมพ์ชื่อเพื่อเพิ่มรายการใหม่</p>}
      </div>
      {err && <p className="mt-1 text-xs font-semibold text-red-600">{err}</p>}
      <p className="mt-1 text-xs text-slate-400">ครุภัณฑ์ = ราคาตั้งแต่ 5,000 บาท และใช้งานเกิน 1 ปี ถ้าต่ำกว่านี้ให้เลือกหมวด “วัสดุคงทนถาวร” (ว.xx)</p>
    </div>
  );
}
