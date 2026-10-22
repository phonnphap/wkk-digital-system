"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LeaveActionPage() {
  const sp = useSearchParams();
  const id = sp.get("id")!, slot = Number(sp.get("slot")), action = sp.get("action") as "approved" | "rejected";
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    const res = await fetch("/api/leave-action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ leaveId: id, slot, action, reason }),
    });
    const j = await res.json();
    setMsg({ ok: j.ok, text: j.ok ? (action === "approved" ? "✅ อนุมัติเรียบร้อย แจ้งใน Teams แล้ว" : "❌ บันทึกการไม่อนุมัติแล้ว") : j.error });
    setBusy(false);
        if (j.ok && j.fullyApproved) {
      setTimeout(() => { window.location.href = `/leave?finalize=${id}`; }, 1500);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h1 className="font-black text-lg">{action === "approved" ? "✅ ยืนยันการอนุมัติ" : "❌ ยืนยันการไม่อนุมัติ"} (ลำดับ {slot})</h1>
        {action === "rejected" && (
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="ระบุเหตุผล..."
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm" />
        )}
        {msg ? <p className={`font-bold ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p> : (
          <button onClick={run} disabled={busy}
            className={`w-full py-3 rounded-xl text-white font-black ${action === "approved" ? "bg-green-500" : "bg-red-500"} disabled:opacity-50`}>
            {busy ? "กำลังบันทึก..." : "ยืนยัน"}
          </button>
        )}
      </div>
    </div>
  );
}