// components/SignaturePad.tsx
"use client";
import { useRef, useEffect, useState } from "react";

interface Props {
  initialUrl?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

export default function SignaturePad({ initialUrl, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e3a8a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (initialUrl) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0); setIsEmpty(false); };
      img.src = initialUrl;
    }
  }, [initialUrl]);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setIsEmpty(false);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(false);
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  }

  function save() {
    if (isEmpty) { alert("กรุณาเซ็นชื่อก่อน"); return; }
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-800 text-base">✍️ เซ็นลายเซ็น</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-lg">✕</button>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-400 font-bold mb-3 text-center">วาดลายเซ็นของคุณในกล่องด้านล่าง</p>
          <div className="border-2 border-slate-300 rounded-xl overflow-hidden touch-none bg-white" style={{cursor:"crosshair"}}>
            <canvas
              ref={canvasRef}
              width={400} height={160}
              style={{ width: "100%", height: 160, display: "block" }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
            />
          </div>
          <p className="text-xs text-slate-300 text-center mt-2">— เซ็นชื่อในกล่อง —</p>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={clear} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm hover:bg-slate-50">
            🗑️ ล้าง
          </button>
          <button onClick={save} className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
            💾 บันทึกลายเซ็น
          </button>
        </div>
      </div>
    </div>
  );
}