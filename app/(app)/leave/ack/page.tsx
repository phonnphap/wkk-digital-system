"use client";
export const dynamic = "force-dynamic";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AckContent() {
  const id = useSearchParams().get("id")!;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    const res = await fetch("/api/leave-ack", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ leaveId: id }),
    });
    const j = await res.json();
    setMsg({ ok: j.ok, text: j.ok ? `✅ รับทราบแล้ว ${j.count} คาบ ขอบคุณครับ/ค่ะ` : j.error });
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h1 className="font-black text-lg">🔄 ยืนยันรับทราบการสอนแทน</h1>
        <p className="text-sm text-slate-500">กดยืนยันเพื่อแจ้งว่าคุณทราบคาบสอนแทนที่ได้รับมอบหมายแล้ว</p>
        {msg ? <p className={`font-bold ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p> : (
          <button onClick={run} disabled={busy} className="w-full py-3 rounded-xl bg-green-500 text-white font-black disabled:opacity-50">
            {busy ? "กำลังบันทึก..." : "✅ รับทราบ"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LeaveAckPage() {
  return <Suspense fallback={null}><AckContent /></Suspense>;
}