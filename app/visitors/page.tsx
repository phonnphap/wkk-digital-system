// path ในโปรเจกต์: app/visitors/page.tsx (แทนที่ไฟล์เดิม)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, UserCheck, Camera, LogOut, Phone, Clock, QrCode, BarChart3, Loader2, CheckCircle2, Bell } from "lucide-react";
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
  id_name: string | null;
  plate: string | null;
  notified_at: string | null;
  ack_at: string | null;
  ack_by: string | null;
};

type Ocr = { status: "running" | "done" | "error"; name: string; plate: string };

function timeThai(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function safeFileName(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

// ย่อรูปก่อนส่ง (ลดขนาด/โควตา และไม่เกินลิมิต body ของเซิร์ฟเวอร์)
async function resizeToBase64(file: File, max = 1400): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

function startOfTodayBangkokISO() {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return new Date(`${d}T00:00:00+07:00`).toISOString();
}

export default function VisitorsPage() {
  const router = useRouter();
  const [pending, setPending] = useState<Visitor[]>([]);
  const [inside, setInside] = useState<Visitor[]>([]);
  const [today, setToday] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [ocr, setOcr] = useState<Record<string, Ocr>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function loadAll() {
    const [{ data: pendingData }, { data: insideData }, { data: todayData }] = await Promise.all([
      supabase.from("visitors").select("*").is("check_in_at", null).order("created_at", { ascending: true }),
      supabase.from("visitors").select("*").not("check_in_at", "is", null).is("check_out_at", null).order("check_in_at", { ascending: false }),
      supabase.from("visitors").select("*").gte("created_at", startOfTodayBangkokISO()),
    ]);
    setPending(pendingData ?? []);
    setInside(insideData ?? []);
    setToday(todayData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("visitors-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitors" }, () => loadAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function runOcr(id: string, file: File) {
    setOcr((m) => ({ ...m, [id]: { status: "running", name: "", plate: "" } }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const image = await resizeToBase64(file);
      const res = await fetch("/api/visitors/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        body: JSON.stringify({ image, mime: "image/jpeg" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.status);
      setOcr((m) => ({ ...m, [id]: { status: "done", name: j.name, plate: j.plate } }));
    } catch (e: any) {
      setErrorMsg("AI อ่านรูปไม่สำเร็จ: " + (e.message ?? e));
      setOcr((m) => ({ ...m, [id]: { status: "error", name: "", plate: "" } }));
    }
  }

  function onPickPhoto(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFiles((m) => ({ ...m, [id]: file }));
    setPhotoPreviews((m) => ({ ...m, [id]: URL.createObjectURL(file) }));
    runOcr(id, file);
  }

  async function handleConfirm(v: Visitor) {
    setConfirmingId(v.id);
    setErrorMsg("");

    let photo_url: string | null = null;
    const file = photoFiles[v.id];
    if (file) {
      const path = safeFileName(file);
      const { error: uploadError } = await supabase.storage.from("visitor-photos").upload(path, file);
      if (uploadError) {
        setConfirmingId(null);
        setErrorMsg("อัปโหลดรูปไม่สำเร็จ: " + uploadError.message);
        return;
      }
      photo_url = path;
    }

    const o = ocr[v.id];
    const { error } = await supabase
      .from("visitors")
      .update({
        check_in_at: new Date().toISOString(),
        photo_url,
        id_name: o?.name?.trim() || null,
        plate: o?.plate?.trim() || null,
      })
      .eq("id", v.id);

    if (error) {
      setConfirmingId(null);
      setErrorMsg("ยืนยันไม่สำเร็จ: " + error.message);
      return;
    }

    // แจ้งครูประจำชั้น 2 คนใน Teams
    try {
      const res = await fetch("/api/visitors/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErrorMsg("ยืนยันเข้าแล้ว แต่ส่ง Teams ไม่สำเร็จ: " + (j.error ?? res.status));
      }
    } catch (e: any) {
      setErrorMsg("ยืนยันเข้าแล้ว แต่ส่ง Teams ไม่สำเร็จ: " + e.message);
    }

    setConfirmingId(null);
    setPhotoFiles((m) => {
      const { [v.id]: _, ...rest } = m;
      return rest;
    });
    setPhotoPreviews((m) => {
      const { [v.id]: _, ...rest } = m;
      return rest;
    });
    setOcr((m) => {
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

  // ---- สรุปสำหรับผู้บริหาร (วันนี้) ----
  const checkedOutToday = today.filter((v) => v.check_in_at && v.check_out_at);
  const avgStay = checkedOutToday.length
    ? Math.round(
        checkedOutToday.reduce((s, v) => s + (new Date(v.check_out_at!).getTime() - new Date(v.check_in_at!).getTime()) / 60000, 0) /
          checkedOutToday.length
      )
    : 0;
  const notAcked = inside.filter((v) => v.notified_at && !v.ack_at).length;
  const stats = [
    { label: "ผู้มาติดต่อวันนี้", value: today.length, unit: "คน", color: "text-indigo-600" },
    { label: "อยู่ในโรงเรียนตอนนี้", value: inside.length, unit: "คน", color: "text-teal-600" },
    { label: "รอครูรับทราบ", value: notAcked, unit: "คน", color: "text-amber-600" },
    { label: "เวลาอยู่เฉลี่ย", value: avgStay, unit: "นาที", color: "text-violet-600" },
  ];

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
            <p className="mt-1 text-sm text-slate-500">ผู้มาติดต่อสแกน QR กรอกเอง — รปภ. ถ่ายรูปบัตร ระบบอ่านชื่อ/ทะเบียนให้ แล้วกดยืนยัน</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/visitors/guard" className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-sky-600 shadow-sm ring-1 ring-sky-200 hover:bg-sky-50">
              <UserCheck className="h-4.5 w-4.5" /> หน้าป้อมยาม
            </Link>
            <Link href="/visitors/report" className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-600 shadow-sm ring-1 ring-violet-200 hover:bg-violet-50">
              <BarChart3 className="h-4.5 w-4.5" /> รายงานผู้บริหาร
            </Link>
            <Link href="/visitors/qr" className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-teal-600 shadow-sm ring-1 ring-teal-200 hover:bg-teal-50">
              <QrCode className="h-4.5 w-4.5" /> ดู/พิมพ์ QR
            </Link>
          </div>
        </div>

        {/* สรุปผู้บริหาร */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-xs font-semibold text-slate-500">{s.label}</p>
              <p className={`mt-1 text-3xl font-extrabold ${s.color}`}>
                {s.value} <span className="text-sm font-semibold text-slate-400">{s.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{errorMsg}</div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* คิวรอ รปภ. ยืนยัน */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
              <Clock className="h-4 w-4 text-amber-500" /> รอ รปภ. ยืนยัน ({pending.length} คน)
            </p>
            <div className="mt-3 max-h-[40rem] space-y-3 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
              ) : pending.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">ไม่มีคนรอยืนยัน</p>
              ) : (
                pending.map((v) => {
                  const o = ocr[v.id];
                  return (
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

                      {o?.status === "running" && (
                        <p className="flex items-center gap-2 text-xs font-semibold text-indigo-600">
                          <Loader2 className="h-4 w-4 animate-spin" /> AI กำลังอ่านบัตร/ทะเบียน...
                        </p>
                      )}
                      {o?.status === "error" && <p className="text-xs font-semibold text-rose-600">อ่านรูปไม่สำเร็จ — กรอกเองได้</p>}
                      {(o?.status === "done" || o?.status === "error") && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-500">
                            ชื่อตามบัตร
                            <input
                              value={o.name}
                              onChange={(e) => setOcr((m) => ({ ...m, [v.id]: { ...m[v.id], name: e.target.value } }))}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                              placeholder="(อ่านไม่ได้ — พิมพ์เอง)"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-500">
                            ทะเบียนรถ
                            <input
                              value={o.plate}
                              onChange={(e) => setOcr((m) => ({ ...m, [v.id]: { ...m[v.id], plate: e.target.value } }))}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                              placeholder="เช่น 1กก 1234"
                            />
                          </label>
                        </div>
                      )}

                      <button
                        onClick={() => handleConfirm(v)}
                        disabled={confirmingId === v.id || o?.status === "running"}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-3 text-base font-bold text-white shadow-md disabled:opacity-50"
                      >
                        <UserCheck className="h-5 w-5" />
                        {confirmingId === v.id ? "กำลังยืนยัน..." : "ยืนยันเข้า + แจ้งครู"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* รายชื่อคนที่อยู่ในโรงเรียนตอนนี้ */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-sm font-extrabold text-slate-800">อยู่ในโรงเรียนตอนนี้ ({inside.length} คน)</p>
            <div className="mt-3 max-h-[40rem] space-y-2 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
              ) : inside.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">ไม่มีบุคคลภายนอกอยู่ในโรงเรียนขณะนี้</p>
              ) : (
                inside.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{v.id_name || v.full_name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {v.contact_person && `ติดต่อ ${v.contact_person} · `}
                        เข้า {v.check_in_at ? timeThai(v.check_in_at) : "-"} น.
                        {v.plate && ` · ทะเบียน ${v.plate}`}
                      </p>
                      {v.ack_at ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> ครู{v.ack_by} รับทราบแล้ว {timeThai(v.ack_at)} น.
                        </p>
                      ) : v.notified_at ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <Bell className="h-3.5 w-3.5" /> แจ้งครูแล้ว รอรับทราบ
                        </p>
                      ) : null}
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