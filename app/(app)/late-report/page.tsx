"use client";

import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import LateReportApprovals from "@/components/LateReportApprovals";

// หน้าเดี่ยว /late-report (ยังเปิดตรงได้ เผื่อส่งลิงก์ให้ผู้อนุมัติ)
export default function LateReportPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4 py-6 sm:px-6 lg:px-8">
      <button onClick={() => router.push("/dashboard")}
        className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
        <Home className="h-4 w-4" />
      </button>
      <LateReportApprovals />
    </div>
  );
}