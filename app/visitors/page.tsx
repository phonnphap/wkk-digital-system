"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, UserCheck, Camera, LogOut, Phone } from "lucide-react";

const supabase = createClient();
const DASHBOARD_PATH = "/dashboard";

type Visitor = {
  id: string; full_name: string; phone: string | null; contact_person: string | null;
  purpose: string | null; photo_url: string | null; check_in_at: string; check_out_at: string | null;
};

function timeThai(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export default function VisitorsPage() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", phone: "", contact_person: "", purpose: "" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [inside, setInside] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadInside() {
    setLoading(true);
    const { data, error } = await supabase
      .from("visitors").select("*").is("check_out_at", null).order("check_in_at", { ascending: false });
    if (!error) setInside(data ?? []);
    setLoading(false);
  }
  useEffect(() => { loadInside(); }, []);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) { setErrorMsg("กรุณากรอกชื่อ-นามสกุล"); return; }
    setSaving(true); setErrorMsg("");

    let photo_url: string | null = null;
    if (photoFile) {
      const path = `${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("visitor-photos").upload(path, photoFile);
      if (uploadError) { setSaving(false); setErrorMsg("อัปโหลดรูปไม่สำเร็จ: " + uploadError.message); return; }
      photo_url = path;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = userData.user
      ? await supabase.from("users").select("id").eq("auth_id", userData.user.id).maybeSingle()
      : { data: null };

    const { error } = await supabase.from("visitors").insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      contact_person: form.contact_person.trim() || null,
      purpose: form.purpose.trim() || null,
      photo_url,
      recorded_by: profile?.id ?? null,
    });

    setSaving(false);
    if (error) { setErrorMsg("บันทึกไม่สำเร็จ: " + error.message); return; }

    setForm({ full_name: "", phone: "", contact_person: "", purpose: "" });
    setPhotoFile(null); setPhotoPreview("");
    loadInside();
  }

  async function handleCheckOut(id: string) {
    if (!confirm("ยืนยันเช็คเอาท์บุคคลนี้?")) return;
    const { error } = await supabase.from("visitors").update({ check_out_at: new Date().toISOString() }).eq("id", id);
    if (error) { alert("ทำไม่สำเร็จ: " + error.message); return; }
    loadInside();
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(DASHBOARD_PATH)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <Home className="h-4.5 w-4.5" />
          </button>
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-500">งานรักษาความปลอดภัย</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-800 sm:text-3xl">บุคคลภายนอกเข้า-ออก</h1>
          <p className="mt-1 text-sm text-slate-500">บันทึกผู้มาติดต่อโรงเรียน เพื่อความปลอดภัยของสถานศึกษา</p>
        </div>

        {errorMsg && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {errorMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ฟอร์มเช็คอิน */}
          <form onSubmit={handleCheckIn} className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
              <UserCheck className="h-4 w-4 text-teal-500" /> บันทึกผู้มาติดต่อใหม่
            </p>

            <input
              required
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="ชื่อ-นามสกุล *"
              className="w-full rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="เบอร์โทรศัพท์"
              className="w-full rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            />
            <input
              value={form.contact_person}
              onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              placeholder="ติดต่อใคร (ชื่อครู/แผนก)"
              className="w-full rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            />
            <textarea
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="เรื่องที่มาติดต่อ"
              rows={2}
              className="w-full rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            />

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-3 hover:border-teal-300">
              <Camera className="h-5 w-5 text-teal-500" />
              <span className="text-sm text-slate-500">ถ่ายรูปบัตรประชาชน / ทะเบียนรถ</span>
              <input type="file" accept="image/*" capture="environment" onChange={onPickPhoto} className="hidden" />
            </label>
            {photoPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="ตัวอย่างรูป" className="h-32 w-full rounded-2xl object-cover" />
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกเข้าโรงเรียน"}
            </button>
          </form>

          {/* รายชื่อคนที่อยู่ในโรงเรียนตอนนี้ */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-sm font-extrabold text-slate-800">อยู่ในโรงเรียนตอนนี้ ({inside.length} คน)</p>
            <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
              ) : inside.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">ไม่มีบุคคลภายนอกอยู่ในโรงเรียนขณะนี้</p>
              ) : (
                inside.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{v.full_name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {v.contact_person && `ติดต่อ ${v.contact_person} · `}
                        เข้า {timeThai(v.check_in_at)} น.
                        {v.phone && (
                          <span className="ml-1 inline-flex items-center gap-0.5"><Phone className="h-3 w-3" />{v.phone}</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCheckOut(v.id)}
                      className="flex shrink-0 items-center gap-1 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                    >
                      <LogOut className="h-3.5 w-3.5" /> เช็คเอาท์
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}