"use client";

import { Suspense } from "react";
import CouncilContent from "./CouncilContent";

export default function CouncilLateCheckinPage() {
  return (
    <Suspense fallback={<CouncilPageLoading />}>
      <CouncilContent />
    </Suspense>
  );
}

function CouncilPageLoading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <p className="text-sm text-slate-400">กำลังโหลด...</p>
    </div>
  );
}