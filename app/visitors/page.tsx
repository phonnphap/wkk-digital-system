// path ในโปรเจกต์: app/visitors/page.tsx (แทนที่ไฟล์เดิม)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, UserCheck, Camera, LogOut, Phone, Clock, QrCode } from "lucide-react";
import Link from "next/link";

const supabase = createClient();
const DASHBOARD_PATH = "/dashboard";

type Visitor = {
  id: string;
  full_name: string;
  phone: string | null;
  contact_person: string | null;
  purpose: string | null;
  photo_url: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  created_at: string;
};

function timeThai(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

// ---- แก้ปัญหาอัปโหลดไฟล์ชื่อไทย/มีเว้นวรรค: สร้างชื่อไฟล์ใหม่แทนการใช้ชื่อเดิม ----
function safeFileName(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

export default function VisitorsPage() {
  const router = useRouter();
  const [pending, setPending] = useState<Visitor[]>([]);
  const [inside, setInside] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  // เก็บไฟล์รูปที่เลือกไว้ต่อคน (id -> File) ก่อนกดยืนยัน
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: pendingData }, { data: insideData }] = await Promise.all([
      supabase.from("visitors").select("*").is("check_in_at", null).order("created_at", { ascending: true }),
      supabase.from("visitors").select("*").not("check_in_at", "is", null).is("check_out_at", null).order("check_in_at", { ascending: false }),
    ]);
    setPending(pendingData ?? []);
    setInside(insideData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // อัปเดตแบบเรียลไทม์เมื่อมีผู้ปกครองส่งฟอร์มใหม่ หรือมีการยืนยัน/เช็คเอาท์
    const channel = supabase
      .channel("visitors-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitors" }, () => loadAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function onPickPhoto(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFiles((m) => ({ ...m, [id]: file }));
    setPhotoPreviews((m) => ({ ...m, [id]: URL.createObjectURL(file) }));
  }

  // รปภ. กดปุ่มเดียว: อัปโหลดรูป (ถ้ามี) + ยืนยันเข้า
  async function handleConfirm(v: Visitor) {
    setConfirmingId(v.id);
    setErrorMsg("");

    let photo_url: string | null = null;
    const file = photoFiles[v.id];
    if (file) {
      const path = safeFileName(file); // <-- จุดที่แก้บั๊กอัปโหลด
      const { error: uploadError } = await supabase.storage.from("visitor-photos").upload(path, file);
      if (uploadError) {
        setConfirmingId(null);
        setErrorMsg("อัปโหลดรูปไม่สำเร็จ: " + uploadError.message);
        return;
      }
      photo_url = path;
    }

    const { error } = await supabase
      .from("visitors")
      .update({ check_in_at: new Date().toISOString(), photo_url })
      .eq("id", v.id);

    setConfirmingId(null);
    if (error) {
      setErrorMsg("ยืนยันไม่สำเร็จ: " + error.message);
      return;
    }
    setPhotoFiles((m) => {
      const { [v.id]: _, ...rest } = m;
      return rest;
    });
    setPhotoPreviews((m) => {
      const { [v.id]: _, ...rest } = m;
      return rest;
    });
    loadAll();
  }

  async function handleCheckOut(id: string) {
    if (!confirm("ยืนยันเช็คเอาท์บุคคลนี้?")) return;
    const { error } = await supabase.from("visitors").update({ check_out_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      alert("ทำไม่สำเร็จ: " + error.message);
      return;
    }
    loadAll();
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

        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-500">งานรักษาความปลอดภัย</p>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-800 sm:text-3xl">บุคคลภายนอกเข้า-ออก</h1>
            <p className="mt-1 text-sm text-slate-500">ผู้มาติดต่อสแกน QR กรอกเอง — รปภ. แค่ถ่ายรูปบัตรแล้วกดยืนยัน</p>
          </div>
          <Link
            href="/visitors/qr"
            className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-teal-600 shadow-sm ring-1 ring-teal-200 hover:bg-teal-50"
          >
            <QrCode className="h-4.5 w-4.5" /> ดู/พิมพ์ QR
          </Link>
        </div>

        {errorMsg && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {errorMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* คิวรอ รปภ. ยืนยัน */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
              <Clock className="h-4 w-4 text-amber-500" /> รอ รปภ. ยืนยัน ({pending.length} คน)
            </p>
            <div className="mt-3 max-h-[34rem] space-y-3 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
              ) : pending.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">ไม่มีคนรอยืนยัน</p>
              ) : (
                pending.map((v) => (
                  <div key={v.id} className="space-y-2 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
                    <p className="text-base font-bold text-slate-800">{v.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {v.contact_person && `ติดต่อ ${v.contact_person} · `}
                      ยื่นเมื่อ {timeThai(v.created_at)} น.
                      {v.phone && (
                        <span className="ml-1 inline-flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />
                          {v.phone}
                        </span>
                      )}
                    </p>
                    {v.purpose && <p className="text-xs text-slate-500">เรื่อง: {v.purpose}</p>}

                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-amber-300 bg-white px-4 py-3">
                      <Camera className="h-5 w-5 text-amber-500" />
                      <span className="text-sm text-slate-500">ถ่ายรูปบัตรประชาชน / ทะเบียนรถ</span>
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => onPickPhoto(v.id, e)} className="hidden" />
                    </label>
                    {photoPreviews[v.id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoPreviews[v.id]} alt="ตัวอย่างรูป" className="h-28 w-full rounded-2xl object-cover" />
                    )}

                    <button
                      onClick={() => handleConfirm(v)}
                      disabled={confirmingId === v.id}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-3 text-base font-bold text-white shadow-md disabled:opacity-50"
                    >
                      <UserCheck className="h-5 w-5" />
                      {confirmingId === v.id ? "กำลังยืนยัน..." : "ยืนยันเข้า"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* รายชื่อคนที่อยู่ในโรงเรียนตอนนี้ */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-sm font-extrabold text-slate-800">อยู่ในโรงเรียนตอนนี้ ({inside.length} คน)</p>
            <div className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto">
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
                        เข้า {v.check_in_at ? timeThai(v.check_in_at) : "-"} น.
                        {v.phone && (
                          <span className="ml-1 inline-flex items-center gap-0.5">
                            <Phone className="h-3 w-3" />
                            {v.phone}
                          </span>
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