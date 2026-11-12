"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "react-barcode";
import { supabase, ASSET_SELECT, SCHOOL, assetUrl, type Asset } from "@/lib/assets";

// Code128 รองรับเฉพาะ ASCII → แปลง "ขข" เป็น "KK" เฉพาะแท่งบาร์โค้ด (ตัวหนังสือบนสติกเกอร์ยังเป็น ขข)
const barValue = (c: string) => c.replace("ขข", "KK");

function PrintInner() {
  const sp = useSearchParams();
  const [items, setItems] = useState<Asset[]>([]);
  const [mode, setMode] = useState<"qr" | "both">("both");

  useEffect(() => {
    const ids = sp.get("ids")?.split(",").filter(Boolean); const loc = sp.get("location");
    let q = supabase.from("assets").select(ASSET_SELECT).order("asset_code");
    if (ids?.length) q = q.in("id", ids); else if (loc) q = q.eq("location_id", Number(loc)); else return;
    q.then(({ data }: { data: Asset[] | null }) => setItems(data ?? []));
  }, [sp]);

  async function markAttached() {
    const { error } = await supabase.rpc("mark_stickers", { p_ids: items.map((i) => i.id), p_val: true });
    alert(error ? error.message : "บันทึกแล้วว่าติดสติกเกอร์ครบ ✅");
  }
  return (
    <div className="p-4">
      <style>{`@media print{.no-print{display:none!important}@page{size:A4;margin:8mm}}`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-slate-800">พิมพ์สติกเกอร์ ({items.length} ชิ้น)</h1>
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "qr" | "both")}>
          <option value="both">QR + บาร์โค้ด</option><option value="qr">QR อย่างเดียว</option>
        </select>
        <button onClick={() => window.print()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">🖨️ พิมพ์</button>
        <button onClick={markAttached} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">✅ ติดสติกเกอร์แล้ว</button>
      </div>
      <div className="flex flex-wrap gap-[2mm]">
        {items.map((a) => (
          <div key={a.id} style={{ width: "64mm", height: "38mm", breakInside: "avoid" }} className="flex flex-col border border-dashed border-slate-400 bg-white p-[2mm]">
            <p className="text-center text-[8pt] font-bold leading-none">{SCHOOL}</p>
            <div className="mt-[1.5mm] flex flex-1 items-center gap-[2mm] overflow-hidden">
              <QRCodeSVG value={assetUrl(a.id)} size={78} level="M" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9pt] font-bold leading-tight">{a.name}</p>
                <p className="font-mono text-[10pt] font-black leading-tight">{a.asset_code}</p>
                <p className="truncate text-[7pt] text-slate-600">{a.asset_locations?.name}</p>
                {mode === "both" && <Barcode value={barValue(a.asset_code)} height={20} width={1} margin={0} displayValue={false} />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default function PrintPage() { return <Suspense><PrintInner /></Suspense>; }
