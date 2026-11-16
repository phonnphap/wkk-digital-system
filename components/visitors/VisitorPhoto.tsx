// path: components/visitors/VisitorPhoto.tsx — รูปหน้าผู้มาติดต่อ (แอดมินเท่านั้น)
"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { authHeaders } from "@/lib/visitors/client-auth";

export default function VisitorPhoto({ visitorId, isAdmin }: { visitorId: string; isAdmin: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/visitors/photo?id=${visitorId}`, { headers: await authHeaders() });
      if (!res.ok) return;
      const j = await res.json();
      if (alive) setUrl(j.url ?? null);
    })();
    return () => { alive = false; };
  }, [visitorId, isAdmin]);

  if (!isAdmin || !url) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="รูปผู้มาติดต่อ" onClick={() => setOpen(true)}
        className="h-14 w-14 shrink-0 cursor-pointer rounded-2xl object-cover ring-2 ring-white shadow" />
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setOpen(false)}>
          <button className="absolute right-4 top-4 rounded-full bg-white p-2"><X className="h-5 w-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-[85vh] max-w-full rounded-2xl" />
        </div>
      )}
    </>
  );
}