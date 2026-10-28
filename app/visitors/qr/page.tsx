// path: app/visitors/qr/page.tsx (แทนที่ไฟล์เดิม)
// มี 2 ส่วน: (1) ป้าย QR สำหรับผู้มาติดต่อ (พิมพ์ได้)  (2) QR/ลิงก์สำหรับ รปภ. เปิดหน้าถ่ายบัตร/ทะเบียน (ไม่พิมพ์)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, ArrowLeft, Printer, QrCode, Copy, Shield } from "lucide-react";

const qrSrc = (url: string, size = 600) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(url)}`;

export default function VisitorQrPosterPage() {
  const router = useRouter();
  const [checkinUrl, setCheckinUrl] = useState("");
  const [guardUrl, setGuardUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCheckinUrl(`${window.location.origin}/visitors/checkin`);
    setGuardUrl(`${window.location.origin}/visitors/guard`);
  }, []);

  async function copyGuard() {
    try { await navigator.clipboard.writeText(guardUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8 print:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <Home className="h-4.5 w-4.5" />
          </button>
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-500">QR สำหรับผู้มาติดต่อ</p>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-800 sm:text-3xl">ป้าย QR ลงทะเบียนเข้าโรงเรียน</h1>
            <p className="mt-1 text-sm text-slate-500">ปริ้นแล้วนำไปแปะหน้าป้อมยาม / ประตูทางเข้า</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-md"
          >
            <Printer className="h-4.5 w-4.5" /> พิมพ์ป้าย
          </button>
        </div>
      </div>

      {/* (1) โปสเตอร์ที่จะถูกพิมพ์ */}
      <div className="mx-auto max-w-md px-4 pb-6 print:max-w-none print:px-0 print:pb-0">
        <div className="flex flex-col items-center rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100 print:rounded-none print:shadow-none print:ring-0 print:p-0 print:min-h-screen print:justify-center">
          <QrCode className="h-8 w-8 text-teal-500 print:hidden" />
          <h2 className="mt-3 text-2xl font-extrabold text-slate-800 print:text-4xl">สแกนเพื่อลงทะเบียน</h2>
          <p className="mt-1 text-base text-slate-500 print:text-2xl">ก่อนเข้าโรงเรียน</p>

          {checkinUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc(checkinUrl)} alt="QR Code สำหรับลงทะเบียนเข้าโรงเรียน"
              className="mt-6 h-72 w-72 rounded-2xl border-4 border-slate-100 print:h-96 print:w-96 print:border-8" />
          )}

          <p className="mt-6 text-sm text-slate-400 break-all print:text-lg">{checkinUrl}</p>
          <p className="mt-4 text-sm font-semibold text-slate-600 print:text-xl">
            กรอกชื่อ-นามสกุล และเรื่องที่มาติดต่อ แล้วรอ รปภ. ตรวจสอบ
          </p>
        </div>
      </div>

      {/* (2) สำหรับ รปภ. — ไม่พิมพ์ ห้ามแปะให้บุคคลทั่วไปเห็น */}
      <div className="mx-auto max-w-md px-4 pb-10 print:hidden">
        <div className="flex flex-col items-center rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-teal-200">
          <Shield className="h-7 w-7 text-teal-600" />
          <h2 className="mt-2 text-lg font-extrabold text-slate-800">QR / ลิงก์สำหรับ รปภ.</h2>
          <p className="mt-1 text-sm text-slate-500">
            เปิดบนมือถือป้อมยาม เพื่อถ่ายบัตร/ทะเบียนให้ AI อ่านชื่อกับทะเบียนรถ
            <br />อ่านแล้วลบภาพทิ้งทันที ไม่เก็บรูปบัตรและเลขบัตรประชาชน (PDPA)
          </p>
          {guardUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc(guardUrl, 400)} alt="QR หน้าป้อมยาม" className="mt-4 h-52 w-52 rounded-2xl border-4 border-slate-100" />
          )}
          <p className="mt-3 break-all text-xs text-slate-400">{guardUrl}</p>
          <button onClick={copyGuard} className="mt-3 flex items-center gap-2 rounded-2xl bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 ring-1 ring-teal-200">
            <Copy className="h-4 w-4" /> {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>
          <p className="mt-3 text-xs text-slate-400">ต้องล็อกอินก่อนใช้งาน · แนะนำให้ "เพิ่มลงหน้าจอหลัก" บนมือถือ</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}