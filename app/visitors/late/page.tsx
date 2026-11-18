// path: app/visitors/late/page.tsx — รปภ. แจ้งนักเรียนมาสาย (ใช้รหัส PIN เดียวกับหน้าป้อมยาม)
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import TargetPicker, { Target, Targets } from "@/components/visitors/TargetPicker";
import StudentPicker, { PickedStudent } from "@/components/visitors/StudentPicker";

const KEY = "guard_key";
const gKey = () => (typeof window === "undefined" ? "" : localStorage.getItem(KEY) ?? "");

async function downscale(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise(res => c.toBlob(b => res(b!), "image/jpeg", 0.8));
}

const bigBtn = "w-full rounded-3xl font-black shadow-lg active:scale-[0.98] disabled:opacity-40";

export default function GuardLatePage() {
  const [targets, setTargets] = useState<Targets>({ rooms: [], admins: [] });
  const [target, setTarget] = useState<Target>(null);
  const [student, setStudent] = useState<PickedStudent>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/visitors").then(r => r.json()).then(setTargets).catch(() => {});
    fetch("/api/visitors/guard", { headers: { "x-guard-key": gKey() } })
      .then(r => setAuthed(r.status !== 401)).catch(() => setAuthed(true));
  }, []);

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setTarget(null); setStudent(null); setPhoto(null); setPreview("");
  }

  async function onPickPhoto(file: File | undefined) {
    if (camRef.current) camRef.current.value = "";
    if (!file) return;
    const blob = await downscale(file);
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(blob); setPreview(URL.createObjectURL(blob));
  }

  async function save() {
    if (!photo) return setMsg({ ok: false, text: "⚠️ กรุณาถ่ายรูปนักเรียน" });
    if (!target?.classroom_id) return setMsg({ ok: false, text: "⚠️ กรุณาเลือกชั้น/ห้อง" });
    if (!student) return setMsg({ ok: false, text: "⚠️ กรุณากดเลือกชื่อนักเรียน" });
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("student_id", student.id);
      fd.append("photo", photo, "p.jpg");
      const res = await fetch("/api/visitors/late", { method: "POST", headers: { "x-guard-key": gKey() }, body: fd });
      const j = await res.json().catch(() => null);
      if (res.status === 401) setAuthed(false);
      else if (j?.ok) {
        setMsg({ ok: true, text: j.already ? `ℹ️ ${student.name} ถูกบันทึกมาสายไว้แล้ว` : `✅ บันทึกมาสายแล้ว: ${student.name} (${target.label})` });
        reset();
      } else setMsg({ ok: false, text: "❌ " + (j?.error ?? "บันทึกไม่สำเร็จ") });
    } catch { setMsg({ ok: false, text: "❌ บันทึกไม่สำเร็จ (เชื่อมต่อไม่ได้)" }); }
    setBusy(false);
  }

  if (authed === false) return (
    <div className="space-y-5 p-8 text-center">
      <h1 className="text-3xl font-black">⏰ นักเรียนมาสาย</h1>
      <p className="text-2xl text-slate-600">กรุณาใส่รหัส รปภ. ที่หน้าป้อมยามก่อน</p>
      <Link href="/visitors/guard" className={`${bigBtn} block bg-teal-700 py-6 text-3xl text-white`}>ไปหน้าป้อมยาม</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="bg-rose-600 px-5 py-5 text-white">
        <h1 className="text-3xl font-black">⏰ แจ้งนักเรียนมาสาย</h1>
        <p className="mt-1 text-xl">ถ่ายรูป → เลือกห้อง → เลือกชื่อ → บันทึก</p>
      </div>

      {msg && (
        <div className={`mx-4 mt-4 rounded-2xl px-5 py-4 text-2xl font-black ${msg.ok ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-900"}`}>
          {msg.text}
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <Link href="/visitors/guard" className="inline-block rounded-2xl bg-white px-6 py-4 text-2xl font-black text-slate-700 shadow">← กลับ</Link>

        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => onPickPhoto(e.target.files?.[0])} />
        <button onClick={() => camRef.current?.click()} className={`${bigBtn} bg-sky-600 py-8 text-3xl text-white`}>
          {preview ? "📷 ถ่ายใหม่" : "📷 ถ่ายรูปนักเรียน"}
        </button>
        {preview && <img src={preview} alt="" className="max-h-64 w-full rounded-2xl bg-white object-contain" />}

        <h3 className="text-2xl font-black">ชั้น/ห้อง <span className="text-rose-500">*</span></h3>
        <TargetPicker classOnly big targets={targets} value={target} onChange={t => { setTarget(t); setStudent(null); }} />

        {target?.classroom_id && (
          <StudentPicker big classroomId={target.classroom_id} value={student} onChange={setStudent} />
        )}

        <button onClick={save} disabled={busy} className={`${bigBtn} bg-green-600 py-9 text-4xl text-white`}>
          {busy ? "⏳ กำลังบันทึก..." : "✅ บันทึกมาสาย"}
        </button>
        <p className="text-center text-xl text-slate-500">บันทึกแล้วแก้ไขเองไม่ได้ ถ้าผิดพลาดให้แจ้งครูเวร</p>
      </div>
    </div>
  );
}