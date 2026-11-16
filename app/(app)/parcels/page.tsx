// path: app/parcels/page.tsx  (หน้า รปภ. รับฝากของ — ต้องล็อกอิน)
"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Send, Loader2, CheckCircle2, Package, RotateCcw } from "lucide-react";
import TargetPicker, { Target, Targets } from "@/components/visitors/TargetPicker";
import StudentPicker, { PickedStudent } from "@/components/visitors/StudentPicker";

const CHIPS = ["อาหาร/ขนม", "เสื้อผ้า/ชุดพละ", "หนังสือ/อุปกรณ์การเรียน", "ยา", "กระเป๋า/ของใช้"];
const inputCls = "w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-xl outline-none focus:border-teal-400";

async function shrink(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("resize"))), "image/jpeg", 0.82));
}

type Parcel = {
  id: string; created_at: string; classroom_label: string; student_name: string;
  description: string | null; sender_name: string | null; photo_url: string | null; notify_error: string | null;
};

export default function ParcelsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [targets, setTargets] = useState<Targets>({ rooms: [], admins: [] });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [target, setTarget] = useState<Target>(null);
  const [student, setStudent] = useState<PickedStudent>(null);
  const [desc, setDesc] = useState("");
  const [sender, setSender] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<{ notified: number; teachers: number; warning: string | null } | null>(null);
  const [waiting, setWaiting] = useState<Parcel[]>([]);

  const loadWaiting = () =>
    fetch("/api/parcels").then((r) => r.json()).then((j) => setWaiting(j.parcels ?? [])).catch(() => {});

  useEffect(() => {
    fetch("/api/visitors").then((r) => r.json()).then(setTargets).catch(() => setErrorMsg("โหลดรายชื่อห้องไม่สำเร็จ"));
    loadWaiting();
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const b = await shrink(f);
      setPhoto(b); setPreview(URL.createObjectURL(b));
    } catch { setErrorMsg("อ่านรูปไม่สำเร็จ ลองถ่ายใหม่"); }
  }

  function reset() {
    setPhoto(null); setPreview(""); setTarget(null); setStudent(null);
    setDesc(""); setSender(""); setResult(null); setErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!photo) return setErrorMsg("กรุณาถ่ายรูปของที่ฝาก");
    if (!target || target.type !== "class" || !target.classroom_id) return setErrorMsg("กรุณาเลือกชั้น/ห้อง");
    if (!student) return setErrorMsg("กรุณาเลือกชื่อนักเรียน");
    setSending(true); setErrorMsg("");
    const fd = new FormData();
    fd.append("photo", photo, "parcel.jpg");
    fd.append("classroom_id", target.classroom_id);
    fd.append("classroom_label", target.label);
    fd.append("student_id", student.id);
    fd.append("student_name", student.name);
    fd.append("description", desc);
    fd.append("sender_name", sender);
    try {
      const res = await fetch("/api/parcels", { method: "POST", body: fd });
      const j = await res.json();
      if (!j.ok) setErrorMsg(j.error ?? "ส่งไม่สำเร็จ");
      else { setResult(j); loadWaiting(); }
    } catch { setErrorMsg("ส่งไม่สำเร็จ กรุณาลองใหม่"); }
    setSending(false);
  }

  async function handOver(id: string) {
    if (!confirm("ยืนยันว่าส่งมอบของให้นักเรียน/ผู้ปกครองแล้ว?")) return;
    await fetch("/api/parcels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadWaiting();
  }

  const bg = "min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4 py-6";

  if (result) {
    return (
      <div className={bg + " flex items-center justify-center"}>
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-800">บันทึกรับฝากของแล้ว</h1>
          <p className="mt-2 text-xl text-slate-600">{student?.name} · {target?.label}</p>
          <p className="mt-3 text-lg font-semibold text-slate-500">
            {result.notified > 0 ? `แจ้งครูประจำชั้นใน Teams แล้ว ${result.notified} ท่าน` : "ยังไม่ได้แจ้งครู"}
          </p>
          {result.warning && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-base font-semibold text-amber-700">{result.warning}</p>}
          <button onClick={reset} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 py-4 text-xl font-bold text-white">
            <RotateCcw className="h-5 w-5" /> รับฝากชิ้นต่อไป
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={bg}>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-800">
          <Package className="h-7 w-7 text-teal-500" /> รับฝากของให้นักเรียน
        </h1>

        {errorMsg && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-lg font-semibold text-rose-600">{errorMsg}</div>}

        <div className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
          {preview ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="ของที่ฝาก" className="max-h-72 w-full rounded-2xl object-contain bg-slate-50" />
              <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl bg-slate-100 py-3 text-lg font-semibold text-slate-600">ถ่ายใหม่</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 py-8 text-2xl font-extrabold text-white shadow-md">
              <Camera className="h-8 w-8" /> ถ่ายรูปของ
            </button>
          )}

          <p className="pt-2 text-xl font-bold text-slate-600">ชั้น / ห้อง <span className="text-rose-500">*</span></p>
          {/* classOnly = ซ่อนแท็บ "ฝ่ายบริหาร" (ดูแพตช์ TargetPicker) */}
          <TargetPicker big classOnly targets={targets} value={target} onChange={(t) => { setTarget(t); setStudent(null); }} />

          {target?.type === "class" && target.classroom_id && (
            <StudentPicker big classroomId={target.classroom_id} value={student} onChange={setStudent} />
          )}

          <p className="pt-2 text-xl font-bold text-slate-600">ของอะไร</p>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => setDesc(c)}
                className={`rounded-xl border-2 px-3 py-2 text-lg font-semibold ${desc === c ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}>{c}</button>
            ))}
          </div>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="รายละเอียดของ (พิมพ์เพิ่มได้)" className={inputCls} />
          <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="ชื่อผู้ฝาก (ถ้ามี)" className={inputCls} />

          <button type="button" onClick={submit} disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 py-5 text-2xl font-extrabold text-white shadow-md disabled:opacity-50">
            {sending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />} ส่งแจ้งครู
          </button>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <p className="text-xl font-extrabold text-slate-800">ของที่ยังรอรับ ({waiting.length})</p>
          <div className="mt-3 space-y-2">
            {waiting.length === 0 && <p className="py-3 text-lg text-slate-400">ไม่มีของค้าง</p>}
            {waiting.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.photo_url && <img src={p.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-slate-700">{p.student_name} · {p.classroom_label}</p>
                  <p className="truncate text-base text-slate-400">
                    {p.description ?? "-"} · {new Date(p.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} น.
                    {p.notify_error && <span className="text-amber-600"> · ยังไม่ได้แจ้งครู</span>}
                  </p>
                </div>
                <button onClick={() => handOver(p.id)} className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-base font-bold text-white">ส่งมอบแล้ว</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}