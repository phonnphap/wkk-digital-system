"use client";

import { useEffect, useRef, useState } from "react";

// ช่องเซ็นสดด้วยนิ้ว/เมาส์/ปากกา — ส่งค่ากลับเป็น data URL (PNG พื้นโปร่งใส)
export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  function setup() {
    const c = ref.current;
    if (!c) return;
    const r = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * r;
    c.height = rect.height * r;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }
  useEffect(() => { setup(); }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(last.current.x + 0.01, last.current.y + 0.01);
    ctx.stroke();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setHasInk(true);
    if (ref.current) onChange(ref.current.toDataURL("image/png"));
  }
  function clear() {
    setup();
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-white">
        <canvas
          ref={ref}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ touchAction: "none" }}
          className="h-32 w-full cursor-crosshair"
        />
        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            เซ็นชื่อตรงนี้
          </p>
        )}
      </div>
      <div className="mt-1 text-right">
        <button type="button" onClick={clear} className="text-xs font-semibold text-slate-500 hover:text-rose-500">
          ล้างลายเซ็น
        </button>
      </div>
    </div>
  );
}