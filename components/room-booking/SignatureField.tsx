"use client";
import { useEffect, useState } from "react";
import SignaturePad from "@/components/room-booking/SignaturePad";
import { getStoredSignature } from "@/lib/booking-client";

// ใช้ลายเซ็นที่บันทึกไว้ใน users อัตโนมัติ — ไม่มีค่อยให้เซ็นสด
export default function SignatureField({ userId, onChange }: { userId: string; onChange: (s: string | null) => void }) {
  const [stored, setStored] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redo, setRedo] = useState(false);
  useEffect(() => {
    let cancel = false;
    if (!userId) { setLoading(false); return; }
    getStoredSignature(userId).then((s) => { if (cancel) return; setStored(s); setLoading(false); if (s) onChange(s); });
    return () => { cancel = true; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <p className="text-xs text-slate-400">กำลังโหลดลายเซ็น...</p>;
  if (stored && !redo) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={stored} alt="ลายเซ็น" className="h-14 max-w-[60%] object-contain" />
        <div className="text-right">
          <p className="text-[11px] font-semibold text-emerald-700">ใช้ลายเซ็นที่บันทึกไว้ในระบบ</p>
          <button type="button" onClick={() => { setRedo(true); onChange(null); }} className="text-xs font-semibold text-slate-500 hover:text-indigo-600">เซ็นใหม่</button>
        </div>
      </div>
    );
  }
  return <SignaturePad onChange={onChange} />;
}
