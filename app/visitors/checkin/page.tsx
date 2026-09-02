// path ในโปรเจกต์: app/visitors/checkin/page.tsx
// หน้านี้ "ไม่ต้อง login" — ให้ปริ้น QR ชี้มาที่ /visitors/checkin แปะหน้าป้อม/ประตู
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserCheck, CheckCircle2 } from "lucide-react";

const supabase = createClient();

export default function VisitorCheckinPage() {
  const [form, setForm] = useState({ full_name: "", phone: "", contact_person: "", purpose: "" });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setErrorMsg("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase.from("visitors").insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      contact_person: form.contact_person.trim() || null,
      purpose: form.purpose.trim() || null,
      photo_url: null,
      check_in_at: null, // ยังไม่นับว่าเข้า จนกว่า รปภ. จะยืนยัน
      check_out_at: null,
    });

    setSaving(false);
    if (error) {
      setErrorMsg("ส่งข้อมูลไม่สำเร็จ: " + error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-800">ส่งข้อมูลเรียบร้อย</h1>
          <p className="mt-2 text-sm text-slate-500">
            กรุณารอ รปภ. ตรวจสอบและถ่ายรูปบัตรประชาชน / ทะเบียนรถ ที่ป้อมยาม
          </p>
          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm">
            <p className="font-semibold text-slate-700">{form.full_name}</p>
            {form.contact_person && <p className="text-slate-400">ติดต่อ: {form.contact_person}</p>}
          </div>
          <button
            onClick={() => {
              setForm({ full_name: "", phone: "", contact_person: "", purpose: "" });
              setDone(false);
            }}
            className="mt-6 w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600"
          >
            กรอกข้อมูลใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
      >
        <p className="flex items-center gap-1.5 text-base font-extrabold text-slate-800">
          <UserCheck className="h-5 w-5 text-teal-500" /> ลงทะเบียนเข้าโรงเรียน
        </p>
        <p className="text-xs text-slate-400">กรอกข้อมูลแล้วนำมือถือให้ รปภ. ดูที่ป้อมยาม</p>

        {errorMsg && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {errorMsg}
          </div>
        )}

        <input
          required
          autoFocus
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          placeholder="ชื่อ-นามสกุล *"
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-teal-400"
        />
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="เบอร์โทรศัพท์"
          inputMode="tel"
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-teal-400"
        />
        <input
          value={form.contact_person}
          onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
          placeholder="ติดต่อใคร (ชื่อครู/แผนก)"
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-teal-400"
        />
        <textarea
          value={form.purpose}
          onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          placeholder="เรื่องที่มาติดต่อ"
          rows={2}
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-teal-400"
        />

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-md disabled:opacity-50"
        >
          {saving ? "กำลังส่งข้อมูล..." : "ส่งข้อมูล"}
        </button>
      </form>
    </div>
  );
}