// path: app/visitors/guard/page.tsx — หน้า รปภ. (ใช้รหัส PIN ไม่ต้อง login)
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TargetPicker, { Target, Targets } from "@/components/visitors/TargetPicker";

type Visitor = {
  id: string; full_name: string; phone?: string | null; car_plate?: string | null;
  target_label?: string | null; purpose?: string | null; source?: string | null;
  status: string; check_in_at?: string | null; created_at?: string;
  acknowledged_at?: string | null;
};
type Mode = "home" | "id" | "face";

const timeTH = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";

async function downscale(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise(res => c.toBlob(b => res(b!), "image/jpeg", 0.85));
}

const KEY = "guard_key";
const gKey = () => (typeof window === "undefined" ? "" : localStorage.getItem(KEY) ?? "");

function notifyMsg(j: any): string {
  const n = j?.notify;
  if (!n) return "";
  if (!n.ok) return "⚠️ ส่ง Teams ไม่สำเร็จ: " + (n.reason ?? "ไม่ทราบสาเหตุ");
  if (n.reason) return "⚠️ " + n.reason;
  return "";
}

async function api(body?: any, form?: FormData) {
  const headers: Record<string, string> = { "x-guard-key": gKey() };
  let init: RequestInit = { headers };
  if (form) init = { method: "POST", headers, body: form };
  else if (body) init = { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch("/api/visitors/guard", init);
  if (res.status === 401) throw new Error("401");
  return res.json();
}

const bigBtn = "w-full rounded-3xl font-black shadow-lg active:scale-[0.98] disabled:opacity-40";

export default function GuardPage() {
  const [mode, setMode] = useState<Mode>("home");
  const [targets, setTargets] = useState<Targets>({ rooms: [], admins: [] });
  const [target, setTarget] = useState<Target>(null);
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Visitor[]>([]);
  const [inside, setInside] = useState<Visitor[]>([]);
  const [pin, setPin] = useState("");
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const j = await api();
      setPending(j.pending ?? []); setInside(j.inside ?? []); setAuthed(true);
    } catch (e: any) { if (e.message === "401") setAuthed(false); }
  }, []);

 useEffect(() => {
  // ถ้าเปิดผ่านลิงก์ที่มี ?k=รหัส ให้จำรหัสไว้ แล้วลบรหัสออกจากแถบที่อยู่
  const k = new URLSearchParams(window.location.search).get("k");
  if (k) {
    localStorage.setItem(KEY, k);
    window.history.replaceState({}, "", window.location.pathname);
  }
  fetch("/api/visitors").then(r => r.json()).then(setTargets).catch(() => {});
  load();
  const t = setInterval(load, 15_000);
  return () => clearInterval(t);
}, [load]);

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setMode("home"); setTarget(null); setName(""); setPlate("");
    setPhoto(null); setPreview(""); setMsg("");
  }
  function flash(m: string, ms = 3000) { setMsg(m); setTimeout(() => setMsg(""), ms); }

  async function confirmPending(v: Visitor) {
  const j = await api({ action: "confirm", id: v.id });
  const w = notifyMsg(j);
reset();
flash(w || "✅ บันทึกเข้าเรียบร้อย", w ? 10000 : 3000);
load();
}
  async function rejectPending(v: Visitor) { await api({ action: "reject", id: v.id }); load(); }
  async function checkout(v: Visitor) { await api({ action: "checkout", id: v.id }); flash(`🚪 ออกแล้ว: ${v.full_name}`); load(); }

  async function onPickPhoto(file: File | undefined) {
    if (camRef.current) camRef.current.value = "";
    if (!file) return;
    const blob = await downscale(file);

    if (mode === "face") {
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(blob); setPreview(URL.createObjectURL(blob));
      return;
    }

    setOcrBusy(true); setMsg("");
    try {
      const fd = new FormData(); fd.append("file", blob, "p.jpg");
      const res = await fetch("/api/visitors/ocr", { method: "POST", headers: { "x-guard-key": gKey() }, body: fd });
      const j = await res.json();
      if (j.ok) {
        if (j.full_name) setName(j.full_name);
        if (j.car_plate) setPlate(j.car_plate);
        setMsg(j.full_name || j.car_plate ? "🗑️ อ่านแล้ว ลบภาพทิ้งทันที (ไม่เก็บรูปบัตร)" : "⚠️ อ่านไม่ออก กรุณาพิมพ์เอง หรือถ่ายใหม่");
      } else setMsg("⚠️ " + (j.error ?? "อ่านภาพไม่สำเร็จ"));
    } catch { setMsg("⚠️ อ่านภาพไม่สำเร็จ"); }
    setOcrBusy(false);
  }

  async function saveWalkin() {
    if (!target) return setMsg("⚠️ กรุณาเลือกห้อง/ฝ่ายที่มาติดต่อ");
    if (mode === "id" && !name.trim() && !plate.trim()) return setMsg("⚠️ กรุณาถ่ายบัตร/ทะเบียน หรือพิมพ์ชื่อ");
    if (mode === "face" && !photo) return setMsg("⚠️ กรุณาถ่ายรูปหน้าผู้ปกครอง");
    setBusy(true); setMsg("");
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify({ name, plate, mode, target }));
      if (mode === "face" && photo) fd.append("photo", photo, "p.jpg");
      const j = await api(undefined, fd);
      if (!j.ok) { setBusy(false); return setMsg("❌ " + (j.error ?? "บันทึกไม่สำเร็จ")); }
      flash("✅ บันทึกเข้าเรียบร้อย"); reset(); load();
    } catch { setMsg("❌ บันทึกไม่สำเร็จ"); }
    setBusy(false);
  }

  if (authed === false) return (
    <div className="space-y-5 p-8 text-center">
      <h1 className="text-3xl font-black">🛡️ ป้อมยาม</h1>
      <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="รหัส รปภ."
        className="w-full rounded-2xl border-4 border-slate-300 px-5 py-5 text-center text-2xl" />
      <button className={`${bigBtn} bg-teal-700 py-6 text-3xl text-white`}
        onClick={() => { localStorage.setItem(KEY, pin); setPin(""); setAuthed(null); load(); }}>เข้าใช้งาน</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="bg-teal-700 px-5 py-5 text-white">
        <h1 className="text-3xl font-black">🛡️ ป้อมยาม — ผู้มาติดต่อ</h1>
        <p className="mt-1 text-xl">อยู่ในโรงเรียนตอนนี้ {inside.length} คน · เช็คเอาท์อัตโนมัติ 17:00 น.</p>
      </div>

      {msg && <div className="mx-4 mt-4 rounded-2xl bg-yellow-100 px-5 py-4 text-2xl font-black text-yellow-900">{msg}</div>}

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        {mode === "home" && (
          <>
            <button onClick={() => setMode("id")} className={`${bigBtn} bg-sky-600 py-8 text-3xl text-white`}>📷 ถ่ายบัตร / ทะเบียนรถ</button>
            <button onClick={() => setMode("face")} className={`${bigBtn} bg-violet-600 py-8 text-3xl text-white`}>🧑 ไม่มีบัตร — เลือกห้อง + ถ่ายหน้า</button>

            {pending.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-3xl font-black text-amber-700">⏳ รอยืนยัน ({pending.length})</h2>
                {pending.map(v => (
                  <div key={v.id} className="rounded-3xl border-4 border-amber-300 bg-white p-5">
                    <p className="text-3xl font-black text-slate-800">{v.full_name}</p>
                    <p className="mt-1 text-2xl font-bold text-teal-700">ติดต่อ: {v.target_label}</p>
                    {v.car_plate && <p className="text-2xl text-slate-600">🚗 {v.car_plate}</p>}
                    {v.purpose && <p className="text-xl text-slate-500">{v.purpose}</p>}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <button onClick={() => confirmPending(v)} className={`${bigBtn} col-span-2 bg-green-600 py-7 text-3xl text-white`}>✅ ให้เข้า</button>
                      <button onClick={() => rejectPending(v)} className={`${bigBtn} bg-red-500 py-7 text-2xl text-white`}>✖ ไม่</button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-4">
              <h2 className="text-3xl font-black text-slate-800">🏫 อยู่ในโรงเรียน ({inside.length})</h2>
              {inside.length === 0 && <p className="text-2xl text-slate-400">ไม่มีผู้มาติดต่อ</p>}
              {inside.map(v => (
                <div key={v.id} className="rounded-3xl border-4 border-green-300 bg-white p-5">
                  <p className="text-3xl font-black text-slate-800">{v.full_name}</p>
                  <p className="text-2xl font-bold text-teal-700">ติดต่อ: {v.target_label} · เข้า {timeTH(v.check_in_at)}</p>
                  {v.car_plate && <p className="text-2xl text-slate-600">🚗 {v.car_plate}</p>}
                  <p className={`mt-1 text-xl font-bold ${v.acknowledged_at ? "text-green-600" : "text-slate-400"}`}>
                    {v.acknowledged_at ? `✔ ครูรับทราบแล้ว ${timeTH(v.acknowledged_at)}` : "⏳ รอครูรับทราบ"}
                  </p>
                  <button onClick={() => checkout(v)} className={`${bigBtn} mt-4 bg-orange-500 py-7 text-3xl text-white`}>🚪 ออกแล้ว (เช็คเอาท์)</button>
                </div>
              ))}
            </section>
          </>
        )}

        {mode !== "home" && (
          <div className="space-y-5">
            <button onClick={reset} className="rounded-2xl bg-white px-6 py-4 text-2xl font-black text-slate-700 shadow">← กลับ</button>
            <h2 className="text-3xl font-black">{mode === "id" ? "📷 ถ่ายบัตร / ทะเบียนรถ" : "🧑 ถ่ายรูปหน้าผู้ปกครอง"}</h2>

            <input ref={camRef} type="file" accept="image/*" capture={mode === "face" ? "user" : "environment"} className="hidden"
              onChange={e => onPickPhoto(e.target.files?.[0])} />
            <button onClick={() => camRef.current?.click()} disabled={ocrBusy}
              className={`${bigBtn} bg-sky-600 py-8 text-3xl text-white`}>
              {ocrBusy ? "⏳ กำลังอ่าน..." : preview || name || plate ? "📷 ถ่ายใหม่" : "📷 เปิดกล้อง"}
            </button>
            {mode === "face" && preview && <img src={preview} alt="" className="max-h-64 w-full rounded-2xl object-contain bg-white" />}

            {mode === "id" && (
              <div className="space-y-3">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ-นามสกุล (AI กรอกให้ แก้ได้)" className="w-full rounded-2xl border-4 border-slate-300 px-5 py-5 text-2xl" />
                <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="ทะเบียนรถ (AI กรอกให้ แก้ได้)" className="w-full rounded-2xl border-4 border-slate-300 px-5 py-5 text-2xl" />
                <p className="text-lg text-slate-500">ระบบอ่านเฉพาะชื่อและทะเบียน แล้วลบภาพทิ้งทันที — ไม่เก็บรูปบัตรและไม่เก็บเลขบัตรประชาชน</p>
              </div>
            )}

            <h3 className="text-2xl font-black">มาติดต่อ</h3>
            <TargetPicker targets={targets} value={target} onChange={setTarget} big />

            <button onClick={saveWalkin} disabled={busy} className={`${bigBtn} bg-green-600 py-9 text-4xl text-white`}>
              {busy ? "⏳ กำลังบันทึก..." : "✅ บันทึก — ให้เข้า"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}