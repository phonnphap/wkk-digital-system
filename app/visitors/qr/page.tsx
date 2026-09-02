// path ในโปรเจกต์: app/visitors/qr/page.tsx
// หน้านี้ไว้เปิดแล้วกด "พิมพ์" เพื่อปริ้น QR ไปแปะหน้าป้อม/ประตูโรงเรียน
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, ArrowLeft, Printer, QrCode } from "lucide-react";

export default function VisitorQrPosterPage() {
  const router = useRouter();
  const [checkinUrl, setCheckinUrl] = useState("");

  useEffect(() => {
    // ใช้ origin ปัจจุบันเสมอ กันพลาดเรื่องโดเมน (dev/prod ต่างกัน)
    setCheckinUrl(`${window.location.origin}/visitors/checkin`);
  }, []);

  const qrImageSrc = checkinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(checkinUrl)}`
    : "";

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

      {/* ตัวโปสเตอร์ที่จะถูกพิมพ์ */}
      <div className="mx-auto max-w-md px-4 pb-10 print:max-w-none print:px-0 print:pb-0">
        <div className="flex flex-col items-center rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100 print:rounded-none print:shadow-none print:ring-0 print:p-0 print:min-h-screen print:justify-center">
          <QrCode className="h-8 w-8 text-teal-500 print:hidden" />
          <h2 className="mt-3 text-2xl font-extrabold text-slate-800 print:text-4xl">สแกนเพื่อลงทะเบียน</h2>
          <p className="mt-1 text-base text-slate-500 print:text-2xl">ก่อนเข้าโรงเรียน</p>

          {qrImageSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrImageSrc}
              alt="QR Code สำหรับลงทะเบียนเข้าโรงเรียน"
              className="mt-6 h-72 w-72 rounded-2xl border-4 border-slate-100 print:h-96 print:w-96 print:border-8"
            />
          )}

          <p className="mt-6 text-sm text-slate-400 break-all print:text-lg">{checkinUrl}</p>
          <p className="mt-4 text-sm font-semibold text-slate-600 print:text-xl">
            กรอกชื่อ-นามสกุล และเรื่องที่มาติดต่อ แล้วรอ รปภ. ตรวจสอบ
          </p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}