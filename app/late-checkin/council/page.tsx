"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ScanLine, Camera, Search, CheckCircle2, AlertTriangle, X, Loader2 } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const supabase = createClient();
const CAMERA_REGION_ID = "council-camera-region";

type MarkedResult = {
  first_name: string; last_name: string; nick_name: string | null;
  seat_number: number | null; room_label: string; already_marked: boolean;
};

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว กรุณาขอลิงก์ใหม่จากครูเวร",
  COUNCIL_DISABLED: "ระบบปิดใช้งานชั่วคราวโดยแอดมิน",
  OUTSIDE_TIME_WINDOW: "ขณะนี้อยู่นอกช่วงเวลาที่อนุญาตให้บันทึก",
  STUDENT_NOT_FOUND: "ไม่พบนักเรียนรหัส/เลขบัตรนี้ในระบบ",
};

export default function CouncilLateCheckinPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [scanValue, setScanValue] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<MarkedResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionLog, setSessionLog] = useState<MarkedResult[]>([]); // ★ log ในเครื่อง ไม่ query จากฐานข้อมูลตรง ๆ (กันสิทธิ์อ่านข้อมูลทั้งโรงเรียน)

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);

  useEffect(() => {
    if (!scannerOpen) return;
    scanHandledRef.current = false;
    setCameraError("");
    setCameraStarting(true);

    const qr = new Html5Qrcode(CAMERA_REGION_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.ITF,
      ],
      verbose: false,
    });

    html5QrRef.current = qr;
    qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      (text) => { if (!scanHandledRef.current) { scanHandledRef.current = true; setScannerOpen(false); submitCode(text.replace(/\D/g, "") || text); } },
      () => {}
    ).then(() => setCameraStarting(false))
     .catch((err) => { setCameraStarting(false); setCameraError("เปิดกล้องไม่สำเร็จ: " + String(err)); });

    return () => {
      const cur = html5QrRef.current; html5QrRef.current = null;
      if (cur) cur.stop().then(() => cur.clear()).catch(() => {});
    };
  }, [scannerOpen]);

  async function submitCode(code: string) {
    if (!code.trim()) return;
    setErrorMsg(""); setSaving(true);
    const { data, error } = await supabase.rpc("mark_late_via_share_link", { p_token: token, p_code: code.trim() });
    setSaving(false); setScanValue("");
    if (error) {
      const key = error.message as keyof typeof ERROR_MESSAGES;
      setErrorMsg(ERROR_MESSAGES[key] ?? "บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { setErrorMsg("ไม่พบข้อมูลนักเรียน"); return; }
    const entry: MarkedResult = {
      first_name: row.out_first_name, last_name: row.out_last_name, nick_name: row.out_nick_name,
      seat_number: row.out_seat_number, room_label: row.out_room_label, already_marked: row.out_already_marked,
    };
    setResult(entry);
    setSessionLog((prev) => [entry, ...prev]);
  }

  useEffect(() => { if (!scannerOpen) scanInputRef.current?.focus(); }, [scannerOpen, result]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">สภานักเรียน</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-800">บันทึกนักเรียนมาสาย</h1>
        <p className="mt-1 text-sm text-slate-500">สแกนบัตรหรือพิมพ์รหัสนักเรียน</p>

        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); submitCode(scanValue); }}
          className="mt-4 flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
            <ScanLine className="h-5 w-5" />
          </span>
          <input
            ref={scanInputRef}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            placeholder="รหัสนักเรียน/เลขบัตร แล้วกด Enter"
            className="w-full border-none bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
          />
        </form>

        <button
          onClick={() => setScannerOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-4 text-sm font-semibold text-white shadow-md"
        >
          <Camera className="h-5 w-5" /> เปิดกล้องสแกน
        </button>

        {sessionLog.length > 0 && (
          <div className="mt-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-bold text-slate-500">บันทึกโดยคุณในรอบนี้ ({sessionLog.length} คน)</p>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {sessionLog.map((e, i) => (
                <div key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  {e.first_name} {e.last_name} {e.nick_name && `(${e.nick_name})`} — {e.room_label} เลขที่ {e.seat_number}
                  {e.already_marked && <span className="ml-2 text-[10px] text-amber-600">(บันทึกซ้ำ)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {scannerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-800">สแกนบัตรนักเรียน</p>
                <button onClick={() => setScannerOpen(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="relative mt-4 overflow-hidden rounded-2xl bg-slate-900">
                <div id={CAMERA_REGION_ID} className="w-full" />
                {cameraStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              {cameraError && <p className="mt-2 text-xs text-rose-500">{cameraError}</p>}
            </div>
          </div>
        )}

        {result && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <p className="mt-3 text-lg font-extrabold text-slate-800">{result.first_name} {result.last_name}</p>
              <p className="text-sm text-slate-500">{result.room_label} · เลขที่ {result.seat_number}</p>
              {result.already_marked && <p className="mt-1 text-xs font-bold text-amber-600">บันทึกไว้อยู่แล้ววันนี้</p>}
              <button
                onClick={() => setResult(null)}
                className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                ตกลง สแกนคนต่อไป
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}