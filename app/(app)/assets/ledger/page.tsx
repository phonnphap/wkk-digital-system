"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, SCHOOL } from "@/lib/assets";

type G = { code: string; name: string }; type C = { code: string; name: string; group_code: string | null };

// พิมพ์สารบัญ ประเภท/ชนิด ในรูปแบบหน้าสมุด "ทะเบียนคุมทรัพย์สิน" (ไว้เติมในสมุดเล่มจริงเมื่อมีรายการใหม่)
export default function LedgerPage() {
  const [groups, setGroups] = useState<G[]>([]); const [cats, setCats] = useState<C[]>([]);
  useEffect(() => {
    supabase.from("asset_groups").select("code,name").order("sort").then(({ data }: { data: G[] | null }) => setGroups(data ?? []));
    supabase.from("asset_categories").select("code,name,group_code").order("code").then(({ data }: { data: C[] | null }) => setCats(data ?? []));
  }, []);
  return (
    <div className="p-4">
      <style>{`@media print{.no-print{display:none!important}.pg{break-after:page}@page{size:A4 landscape;margin:12mm}}`}</style>
      <div className="no-print mb-4 flex items-center gap-3"><Link href="/assets/categories" className="text-sm text-slate-500">←</Link>
        <button onClick={() => window.print()} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white">🖨️ พิมพ์สารบัญ</button></div>
      {groups.map((g) => {
        const items = cats.filter((c) => c.group_code === g.code);
        return (
          <section key={g.code} className="pg mb-8">
            <p className="text-center text-xs">{SCHOOL}</p>
            <h2 className="mb-2 text-center text-lg font-bold">ทะเบียนคุมทรัพย์สิน {g.code === "V" ? "" : g.code} {g.name}</h2>
            <ol className="border border-slate-600 p-2 text-sm" style={{ columnCount: 3, columnGap: "1.5rem", minHeight: "6rem" }}>
              {items.map((c) => <li key={c.code} className="flex gap-3 border-b border-slate-300 py-1" style={{ breakInside: "avoid" }}><span className="w-12 font-mono">{g.code === "V" ? c.code : c.code.split("-")[1]}</span><span>{c.name}</span></li>)}
              {items.length === 0 && <li className="text-slate-400">— ยังไม่มีรายการ —</li>}
            </ol>
          </section>);
      })}
    </div>
  );
}
