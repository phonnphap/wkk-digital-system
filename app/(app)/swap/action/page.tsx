"use client";
export const dynamic = "force-dynamic";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Content() {
  const sp = useSearchParams();
  const id = sp.get("id")!;
  const action = sp.get("action") as "accepted" | "rejected";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) {
      window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }
    const res = await fetch("/api/swap-action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ swapId: id, action }),
    });
    const j = await res.json();
    setMsg({
      ok: j.ok,
      text: j.ok ? (action === "accepted" ? "✅ ตอบรับการแลกคาบแล้ว" : "❌ ปฏิเสธคำขอแล้ว") : j.error,
    });
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h1 className="font-black text-lg">
          {action === "accepted" ? "✅ ยืนยันตอบรับการแลกคาบ" : "❌ ยืนยันปฏิเสธการแลกคาบ"}
        </h1>
        {msg ? (
          <p className={`font-bold ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        ) : (
          <button onClick={run} disabled={busy}
            className={`w-full py-3 rounded-xl text-white font-black ${action === "accepted" ? "bg-green-500" : "bg-red-500"} disabled:opacity-50`}>
            {busy ? "กำลังบันทึก..." : "ยืนยัน"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SwapActionPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}