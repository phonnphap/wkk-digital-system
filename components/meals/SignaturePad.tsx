// components/meals/SignaturePad.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { toTransparentPng } from "@/lib/meals/signature";

const CHECKER = {
  backgroundImage:
    "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
} as const;

export default function SignaturePad({
  title, onSave, onClose,
}: {
  title: string;
  onSave: (pngDataUrl: string) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function resetCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b1f66";
    setHasInk(false);
  }
  useEffect(() => { if (tab === "draw") resetCanvas(); }, [tab]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
    setHasInk(true);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y); ctx.stroke();
  }

  async function save(dataUrl: string) {
    setBusy(true); setErr("");
    try { await onSave(dataUrl); onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveDrawn() {
    setErr("");
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        canvasRef.current!.toBlob((b) => (b ? res(b) : rej(new Error("สร้างภาพไม่สำเร็จ"))), "image/png"));
      await save(await toTransparentPng(blob));
    } catch (e) { setErr((e as Error).message); }
  }
  async function pickFile(f: File | undefined) {
    if (!f) return;
    setErr(""); setPreview(null);
    try { setPreview(await toTransparentPng(f)); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-black text-slate-800">ลายมือชื่อ: {title}</h3>

        <div className="mb-3 flex gap-2">
          {(["draw", "upload"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setErr(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-black ${tab === t ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {t === "draw" ? "เขียนเอง" : "อัปโหลดภาพ"}
            </button>
          ))}
        </div>

        {tab === "draw" ? (
          <>
            <canvas ref={canvasRef} width={600} height={220}
              className="w-full touch-none rounded-xl border-2 border-dashed border-slate-300"
              onPointerDown={down} onPointerMove={move}
              onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} />
            <div className="mt-3 flex gap-2">
              <button onClick={resetCanvas} className="rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-black text-slate-600">ล้าง</button>
              <button onClick={saveDrawn} disabled={!hasInk || busy}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-black text-white disabled:opacity-40">
                {busy ? "กำลังบันทึก..." : "บันทึกลายมือชื่อ"}
              </button>
            </div>
          </>
        ) : (
          <>
            <input type="file" accept="image/*" onChange={(e) => pickFile(e.target.files?.[0])}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-black file:text-blue-700" />
            <p className="mt-2 text-[11px] text-slate-400">ระบบจะลบพื้นหลังสีขาวและตัดขอบให้อัตโนมัติ (ผลลัพธ์เป็น .png โปร่งใส)</p>
            {preview && (
              <div className="mt-3 grid h-32 place-items-center rounded-xl border border-slate-200" style={CHECKER}>
                <img src={preview} alt="ตัวอย่างลายมือชื่อ" className="max-h-28 max-w-full" />
              </div>
            )}
            <button onClick={() => preview && save(preview)} disabled={!preview || busy}
              className="mt-3 w-full rounded-xl bg-blue-600 py-2 text-xs font-black text-white disabled:opacity-40">
              {busy ? "กำลังบันทึก..." : "บันทึกลายมือชื่อ"}
            </button>
          </>
        )}

        {err && <p className="mt-2 text-xs font-bold text-rose-600">{err}</p>}
        <button onClick={onClose} className="mt-3 w-full rounded-xl border-2 border-slate-200 py-2 text-xs font-black text-slate-600">ปิด</button>
      </div>
    </div>
  );
}