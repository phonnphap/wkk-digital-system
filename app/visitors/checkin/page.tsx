// path: app/visitors/checkin/page.tsx — หน้านี้ "ไม่ต้อง login" ให้ QR ชี้มาที่ /visitors/checkin
"use client";

import { useEffect, useState } from "react";
import { UserCheck, CheckCircle2 } from "lucide-react";
import TargetPicker, { Target, Targets } from "@/components/visitors/TargetPicker";

const EMPTY = { full_name: "", phone: "", car_plate: "", purpose: "", website: "" };
const inputCls = "w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-teal-400";

export default function VisitorCheckinPage() {
  const [targets, setTargets] = useState<Targets>({ rooms: [], admins: [] });
  const [target, setTarget] = useState<Target>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/visitors").then(r => r.json()).then(setTargets).catch(() => setErrorMsg("โหลดรายชื่อห้องไม่สำเร็จ กรุณาแจ้ง รปภ."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return setErrorMsg("กรุณากรอกชื่อ-นามสกุล");
    if (!target) return setErrorMsg("กรุณาเลือกชั้นเรียนหรือฝ่ายที่มาติดต่อ");
    setSaving(true); setErrorMsg("");
    try {
      const res = await fetch("/api/visitors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, target_type: target.type, target_classroom_id: target.classroom_id, target_label: target.label }),
      });
      const json = await res.json();
      if (!json.ok) { setErrorMsg(json.error ?? "ส่งข้อมูลไม่สำเร็จ"); setSaving(false); return; }
      setDone(true);
    } catch { setErrorMsg("ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่"); }
    setSaving(false);
  }

  const bg = "flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4";

  if (done) {
    return (
      <div className={bg}>
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-800">ส่งข้อมูลเรียบร้อย</h1>
          <p className="mt-2 text-sm text-slate-500">กรุณาแสดงหน้านี้ให้ รปภ. ที่ป้อมยาม เพื่อยืนยันการเข้า</p>
          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm">
            <p className="font-semibold text-slate-700">{form.full_name}</p>
            <p className="text-slate-400">ติดต่อ: {target?.label}</p>
          </div>
          <button onClick={() => { setForm(EMPTY); setTarget(null); setDone(false); }}
            className="mt-6 w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600">กรอกข้อมูลใหม่</button>
        </div>
      </div>
    );
  }

  return (
    <div className={bg + " py-8"}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <p className="flex items-center gap-1.5 text-base font-extrabold text-slate-800">
          <UserCheck className="h-5 w-5 text-teal-500" /> ลงทะเบียนเข้าโรงเรียน
        </p>
        <p className="text-xs text-slate-400">กรอกข้อมูลแล้วนำมือถือให้ รปภ. ดูที่ป้อมยาม</p>

        {errorMsg && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{errorMsg}</div>}

        <input required autoFocus value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="ชื่อ-นามสกุล *" className={inputCls} />
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="เบอร์โทรศัพท์" inputMode="tel" className={inputCls} />
        <input value={form.car_plate} onChange={e => setForm(f => ({ ...f, car_plate: e.target.value }))} placeholder="ทะเบียนรถ (ถ้ามี)" className={inputCls} />

        <p className="pt-1 text-sm font-bold text-slate-600">มาติดต่อ <span className="text-rose-500">*</span></p>
        <TargetPicker targets={targets} value={target} onChange={setTarget} />

        <textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="เรื่องที่มาติดต่อ" rows={2} className={inputCls} />
        {/* honeypot กันบอท — คนจริงจะไม่เห็น */}
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="hidden" aria-hidden />

        <button type="submit" disabled={saving}
          className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-md disabled:opacity-50">
          {saving ? "กำลังส่งข้อมูล..." : "ส่งข้อมูล"}
        </button>
      </form>
    </div>
  );
}