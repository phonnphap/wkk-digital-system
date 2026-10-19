// components/LeavePDFPreview.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { buildLeaveHTML, LeaveFormData } from "@/lib/pdf-generator";

interface Props {
  data: LeaveFormData;
  signatureUrl: string;
  savedSignature?: string;
  onConfirm: (sigUrl: string) => void;
  onCancel: () => void;
  onUpdateSignature: () => void;
}

export default function LeavePDFPreview({
  data, signatureUrl, savedSignature, onConfirm, onCancel, onUpdateSignature,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const html = buildLeaveHTML({ ...data, signatureUrl });
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => setReady(true), 500);
      }
    }
  }, [data, signatureUrl]);

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex flex-col items-center justify-start overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden mb-4">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-black text-slate-800 text-base">📄 ตรวจสอบใบลาก่อนส่ง</h3>
            <p className="text-xs text-slate-400">กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-xl bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600 text-lg">✕</button>
        </div>

        {/* PDF Preview */}
        <div className="p-4 bg-slate-100">
          {!ready && (
            <div className="text-center py-8 text-slate-400 font-bold">⏳ กำลังสร้างใบลา...</div>
          )}
          <iframe
            ref={iframeRef}
            style={{
              width: "100%",
              height: 700,
              border: "none",
              borderRadius: 12,
              background: "white",
              display: ready ? "block" : "none",
              boxShadow: "0 2px 20px rgba(0,0,0,0.15)",
            }}
            title="ใบลา"
          />
        </div>

        {/* Signature section */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-slate-700 text-sm">✍️ ลายเซ็นของคุณ</p>
              <p className="text-xs text-slate-400">
                {signatureUrl ? "ใช้ลายเซ็นที่บันทึกไว้" : "ยังไม่มีลายเซ็น"}
              </p>
            </div>
            <button onClick={onUpdateSignature}
              className="px-4 py-2 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-600 text-sm font-bold hover:bg-blue-100 transition-all">
              {signatureUrl ? "✏️ เซ็นใหม่" : "✍️ เพิ่มลายเซ็น"}
            </button>
          </div>
          {signatureUrl && (
            <div className="border-2 border-slate-200 rounded-xl p-3 bg-slate-50 inline-block">
              <img src={signatureUrl} alt="ลายเซ็น" style={{ height: 60, maxWidth: 200, objectFit: "contain" }} />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50">
            ← แก้ไข
          </button>
          <button onClick={() => onConfirm(signatureUrl)}
            className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
            📤 ยืนยันส่งใบลา
          </button>
        </div>
      </div>
    </div>
  );
}