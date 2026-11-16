// path: components/visitors/SignatureCard.tsx — เซ็นลายเซนด้วยนิ้ว/เมาส์ บันทึกเป็น PNG พื้นใส
"use client";
import { useEffect, useRef, useState } from "react";
import { PenLine, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { authHeaders } from "@/lib/visitors/client-auth";

export default function SignatureCard() {
  const [has, setHas] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);

  async function load() {
    const res = await fetch("/api/signature", { headers: await authHeaders() });
    if (!res.ok) { setHas(false); return; }
    const j = await res.json();
    setHas(!!j.has); setUrl(j.url ?? null);
  }
  useEffect(() => { load(); }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current!.getContext("2d")!;
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.strokeStyle = "#1e3a8a"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke(); drawn.current = true;
  }
  const up = () => { drawing.current = false; };
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drawn.current = false; setMsg("");
  }

  async function save() {
    if (!drawn.current) return setMsg("กรุณาเซ็นชื่อในกรอบก่อน");
    setSaving(true); setMsg("");
    const blob: Blob | null = await new Promise((res) => canvasRef.current!.toBlob(res, "image/png"));
    if (!blob) { setSaving(false); return setMsg("สร้างไฟล์ไม่สำเร็จ"); }
    const fd = new FormData();
    fd.append("file", blob, "signature.png");
    const res = await fetch("/api/signature", { method: "POST", headers: await authHeaders(), body: fd });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMsg(j.error ?? "บันทึกไม่สำเร็จ");
    setOpen(false); load();
  }

  if (has === null) return null;

  return (
    <div className={`mt-4 rounded-2xl p-3 ${has ? "bg-slate-50" : "bg-amber-50 ring-1 ring-amber-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-[16px] font-bold ${has ? "text-slate-600" : "text-amber-700"}`}>
          {has ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <PenLine className="h-4 w-4" />}
          {has ? "มีลายเซนในระบบแล้ว" : "ยังไม่มีลายเซน — ต้องเซ็นก่อนจึงสร้าง/อนุมัติรายงานได้"}
        </p>
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-[16px] font-semibold text-indigo-600 ring-1 ring-indigo-200">
          {open ? "ปิด" : has ? "เปลี่ยน" : "เซ็นลายเซน"}
        </button>
      </div>

      {has && url && !open && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="ลายเซน" className="mt-2 h-14 rounded-lg bg-white object-contain px-2" />
      )}

      {open && (
        <div className="mt-3 space-y-2">
          <canvas
            ref={canvasRef} width={600} height={220}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            style={{ touchAction: "none" }}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white"
          />
          <p className="text-[14px] text-slate-400">เซ็นด้วยนิ้ว (มือถือ) หรือเมาส์ ในกรอบด้านบน</p>
          {msg && <p className="text-[16px] font-semibold text-rose-600">{msg}</p>}
          <div className="flex gap-2">
            <button onClick={clear} className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-[16px] font-semibold text-slate-600 ring-1 ring-slate-200">
              <Trash2 className="h-4 w-4" /> ล้าง
            </button>
            <button onClick={save} disabled={saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[16px] font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} บันทึกลายเซน
            </button>
          </div>
        </div>
      )}
    </div>
  );
}