// app/late-checkin/council/page.tsx
import { Suspense } from "react";
import CouncilLateCheckinContent from "./council-content";

export default function CouncilLateCheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50">
          <p className="text-sm text-slate-400">กำลังโหลด...</p>
        </div>
      }
    >
      <CouncilLateCheckinContent />
    </Suspense>
  );
}