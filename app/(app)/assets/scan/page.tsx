"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { supabase, inputCls } from "@/lib/assets";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function ScanPage() {
  const router = useRouter();
  const [msg, setMsg] = useState(""); const [code, setCode] = useState("");

  function onScan(raw?: string) {
    const m = raw?.match(UUID);
    if (m) router.push(`/assets/${m[0]}`); else if (raw) setMsg("QR นี้ไม่ใช่สติกเกอร์ครุภัณฑ์ของโรงเรียน");
  }
  async function byCode() {
    const { data } = await supabase.from("assets").select("id").eq("asset_code", code.trim()).maybeSingle();
    data ? router.push(`/assets/${data.id}`) : setMsg("ไม่พบรหัสนี้");
  }
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="text-lg font-bold text-slate-800">สแกน QR ครุภัณฑ์</h1>
      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
        <Scanner onScan={(r) => onScan(r?.[0]?.rawValue)} constraints={{ facingMode: "environment" }} />
      </div>
      {msg && <p className="mt-2 text-sm font-semibold text-rose-600">{msg}</p>}
      <div className="mt-4 flex gap-2">
        <input className={inputCls} placeholder="หรือพิมพ์รหัส เช่น ขข-04-06-01/69" value={code} onChange={(e) => setCode(e.target.value)} />
        <button onClick={byCode} className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">ค้นหา</button>
      </div>
    </div>
  );
}
