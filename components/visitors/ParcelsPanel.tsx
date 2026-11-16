// path: components/visitors/ParcelsPanel.tsx — การ์ด "รับฝากของ" ในหน้าแดชบอร์ดบุคคลภายนอก
"use client";
import { useCallback, useEffect, useState } from "react";
import { Package, Loader2, X, Bell, BellOff } from "lucide-react";
import { authHeaders } from "@/lib/visitors/client-auth";

type P = {
  id: string; created_at: string; student_name: string; classroom_label: string;
  description: string | null; sender_name: string | null; status: "waiting" | "picked_up";
  picked_up_at: string | null; notified_at: string | null; notify_error: string | null; photo_url: string | null;
};
const timeTH = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) + " น.";

export default function ParcelsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/parcels/list", { headers: await authHeaders() });
    if (res.ok) setRows((await res.json()).parcels ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  async function handOver(id: string) {
    if (!confirm("ยืนยันว่าส่งมอบของแล้ว?")) return;
    setBusy(id);
    await fetch("/api/parcels", {
      method: "PATCH", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    setBusy(""); load();
  }

  const waiting = rows.filter((r) => r.status === "waiting");
  const done = rows.filter((r) => r.status === "picked_up");

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <p className="flex items-center gap-2 text-base font-extrabold text-slate-800">
        <Package className="h-5 w-5 text-amber-500" /> รับฝากของ (รอรับ {waiting.length} ชิ้น)
      </p>
      {!isAdmin && <p className="mt-1 text-xs text-slate-400">รูปของที่ฝากเห็นได้เฉพาะแอดมิน</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีรายการฝากของ</p>
      ) : (
        <div className="mt-4 space-y-3">
          {[...waiting, ...done].map((r) => (
            <div key={r.id} className={`flex items-center gap-3 rounded-2xl p-3 ${r.status === "waiting" ? "bg-amber-50" : "bg-slate-50 opacity-70"}`}>
              {r.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="ของที่ฝาก" onClick={() => setZoom(r.photo_url)}
                  className="h-16 w-16 shrink-0 cursor-pointer rounded-xl object-cover" />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white text-slate-300"><Package className="h-7 w-7" /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{r.student_name} · {r.classroom_label}</p>
                <p className="truncate text-xs text-slate-500">
                  {r.description ?? "ไม่ระบุ"}{r.sender_name ? ` · ผู้ฝาก ${r.sender_name}` : ""} · {timeTH(r.created_at)}
                </p>
                <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${r.notified_at ? "text-emerald-600" : "text-rose-500"}`}>
                  {r.notified_at ? <><Bell className="h-3 w-3" /> แจ้งครูแล้ว</> : <><BellOff className="h-3 w-3" /> ยังไม่ได้แจ้งครู{r.notify_error ? `: ${r.notify_error}` : ""}</>}
                </p>
              </div>
              {r.status === "waiting" ? (
                <button onClick={() => handOver(r.id)} disabled={busy === r.id}
                  className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">ส่งมอบแล้ว</button>
              ) : (
                <span className="shrink-0 text-xs font-semibold text-slate-400">รับแล้ว {r.picked_up_at ? timeTH(r.picked_up_at) : ""}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setZoom(null)}>
          <button className="absolute right-4 top-4 rounded-full bg-white p-2"><X className="h-5 w-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-[85vh] max-w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}