"use client";
import { useState } from "react";
import { Camera } from "lucide-react";
import { supabase } from "@/lib/assets";

async function shrink(file: File, max = 1024): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.8));
}

export default function PhotoUploader({ assetId, onDone }: { assetId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setErr("");
    try {
      const path = `${assetId}.jpg`;
      const up = await supabase.storage.from("asset-photos").upload(path, await shrink(f), { upsert: true, contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const url = `${supabase.storage.from("asset-photos").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const r = await supabase.rpc("set_asset_photo", { p_asset: assetId, p_url: url });
      if (r.error) throw r.error;
      onDone();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
        <Camera className="h-4 w-4" />{busy ? "กำลังอัปโหลด..." : "ถ่าย / เลือกรูป"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} disabled={busy} />
      </label>
      {err && <p className="mt-1 text-xs font-semibold text-rose-600">{err}</p>}
    </div>
  );
}
