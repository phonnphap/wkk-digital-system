"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type SyncResult = { created: number; skipped?: number; failed?: any[]; message?: string };

export default function AdminSyncSubjectsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

useEffect(() => {
  (async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setChecking(false); return; }
    const { data: profile } = await supabase
      .from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
    if (profile) {
      setCurrentUserId(profile.id);
      if (profile.role && ["admin", "executive"].includes(profile.role)) {
        setAuthorized(true);
      }
    }
    setChecking(false);
  })();
}, []);

  async function handleSync() {
  setSyncing(true);
  setError("");
  setResult(null);
  try {
    const res = await fetch("/api/subject-sections/sync-from-timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ created_by: currentUserId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "ซิงค์ไม่สำเร็จ");
    setResult(json);
  } catch (err: any) {
    setError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
  } finally {
    setSyncing(false);
  }
}

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-blue-500 font-black text-lg animate-pulse">กำลังตรวจสอบสิทธิ์...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-sm">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-black text-slate-700">หน้านี้สำหรับแอดมิน/ผู้บริหารเท่านั้น</p>
          <button onClick={() => router.push("/dashboard")}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
            กลับหน้าแดชบอร์ด
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
        <div>
          <h1 className="text-base font-black text-slate-800 leading-none">🔄 ซิงค์รายวิชาจากตารางสอน</h1>
          <p className="text-slate-400 text-xs">สำหรับแอดมิน/ผู้บริหาร — กดได้หลายครั้ง ระบบสร้างเฉพาะวิชาใหม่ที่ยังไม่มี</p>
        </div>
      </div>

      <main className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <p className="text-sm text-slate-500 leading-relaxed mb-4">
            ระบบจะดึงข้อมูลจากตารางสอน (Timetable) ทั้งหมด แล้วสร้าง "รายวิชาที่เปิดสอน" (Subject Section)
            อัตโนมัติสำหรับทุก (ห้อง + วิชา) ที่ยังไม่เคยเปิดมาก่อน — วิชาที่มีอยู่แล้วจะไม่ถูกสร้างซ้ำหรือแก้ไข
          </p>

          <button onClick={handleSync} disabled={syncing}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-50">
            {syncing ? "⏳ กำลังซิงค์..." : "🔄 เริ่มซิงค์ตอนนี้"}
          </button>

          {error && (
            <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2 mt-4">
              ❌ {error}
            </p>
          )}

          {result && (
            <div className="mt-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl px-4 py-3">
              <p className="text-emerald-700 font-black text-sm">
                ✅ สร้างวิชาใหม่ {result.created} วิชา
              </p>
              {typeof result.skipped === "number" && (
                <p className="text-emerald-600 text-xs mt-1">ข้าม (มีอยู่แล้ว) {result.skipped} วิชา</p>
              )}
              {result.message && <p className="text-emerald-600 text-xs mt-1">{result.message}</p>}
              {result.failed && result.failed.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200">
                  <p className="text-red-600 text-xs font-bold">⚠️ สร้างไม่สำเร็จ {result.failed.length} รายการ</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}