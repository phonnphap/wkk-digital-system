"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Calendar, ChevronLeft, ChevronRight, Plus, X, FileText, AlertTriangle, DoorOpen } from "lucide-react";
import { todayISO, formatThaiDateFull, timeShort, teacherName } from "@/lib/duty-helpers";
import SignaturePad from "@/components/room-booking/SignaturePad";
import { authFetch } from "@/lib/booking-client";
import RoomRequestForm, { RoomFormData, EQUIPMENT_OPTIONS, SEATING_OPTIONS } from "@/components/room-booking/RoomRequestForm";

const supabase = createClient();
const BACK_PATH = "/duty-report";

// ---------- ค่าคงที่ ----------
const START_H = 7, END_H = 18;
const TOTAL_MIN = (END_H - START_H) * 60;
const HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
const TIME_OPTIONS = Array.from({ length: (END_H - START_H) * 2 + 1 }, (_, i) => {
  const m = START_H * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`;
});
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const NAME_SEL = "id, title, first_name, last_name, email";
const BOOKING_SELECT = `*, room:meeting_rooms(id,name),
  requester:users!room_bookings_requester_id_fkey(${NAME_SEL}),
  staff:users!room_bookings_staff_id_fkey(${NAME_SEL}),
  head:users!room_bookings_head_id_fkey(${NAME_SEL}),
  deputy:users!room_bookings_deputy_id_fkey(${NAME_SEL}),
  director:users!room_bookings_director_id_fkey(${NAME_SEL})`;

type Step = "head" | "deputy";
const STEP_OF: Record<string, Step> = { pending_head: "head", pending_deputy: "deputy" };
const STEP_TITLE: Record<Step, string> = { head: "หัวหน้ากลุ่มบริหารทั่วไป · ตรวจเสนอ", deputy: "รองผอ.กลุ่มบริหารทั่วไป · ตรวจเสนอ + ผอ.อนุมัติ" };
const STATUS: Record<string, { label: string; cls: string }> = {
  pending_head: { label: "รอหัวหน้ากลุ่มบริหารทั่วไป", cls: "bg-amber-100 text-amber-700" },
  pending_deputy: { label: "รอรองผอ. (ผอ.อนุมัติพร้อมกัน)", cls: "bg-sky-100 text-sky-700" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "ไม่อนุมัติ", cls: "bg-rose-100 text-rose-600" },
  cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

type Room = { id: string; name: string; capacity?: number | null };
type Booking = Record<string, any>;

// ---------- ฟอร์ม / PDF ----------
function toFormData(b: Booking): RoomFormData {
  return {
    created_at: b.created_at, booking_date: b.booking_date, start_time: b.start_time, end_time: b.end_time,
    room_name: b.room?.name ?? "", requester_name: b.requester ? teacherName(b.requester) : "",
    requester_position: b.requester_position ?? "", purpose: b.purpose, attendees: b.attendees,
    equipment: b.equipment ?? [], equipment_other: b.equipment_other, seating: b.seating, seating_other: b.seating_other,
    requester_signature: b.requester_signature,
    staff_result: b.staff_result, staff_reason: b.staff_reason,
    staff_name: b.staff ? teacherName(b.staff) : null, staff_signature: b.staff_signature,
    head_name: b.head ? teacherName(b.head) : null, head_signature: b.head_signature,
    deputy_name: b.deputy ? teacherName(b.deputy) : null, deputy_signature: b.deputy_signature,
    director_decision: b.director_decision, director_name: b.director ? teacherName(b.director) : null,
    director_signature: b.director_signature,
  };
}

// สร้าง PDF จากคอมโพเนนต์ฟอร์ม (render นอกจอ -> html2canvas -> jsPDF)
async function makePdf(b: Booking, withSignatures: boolean, allRooms: string[]): Promise<File> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<RoomRequestForm data={toFormData(b)} withSignatures={withSignatures} allRooms={allRooms} />);
    await new Promise((r) => setTimeout(r, 300));
    const fonts = (document as any).fonts;
    await Promise.all([fonts?.load('20px "THSarabunNew"'), fonts?.load('700 20px "THSarabunNew"')]).catch(() => {});
    await fonts?.ready;
    await Promise.all(Array.from(host.querySelectorAll("img")).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = () => r(null); }))));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    return new File([pdf.output("blob")], "form.pdf", { type: "application/pdf" });
  } finally {
    root.unmount();
    host.remove();
  }
}

async function uploadPdf(file: File, kind: "signed" | "unsigned" | "layout", b: Booking, suffix = "") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  fd.append("date", b.booking_date);
  fd.append("label", `${b.room?.name ?? ""}-${timeShort(b.start_time).replace(":", ".")}-${teacherName(b.requester)}${suffix}`);
  const res = await authFetch("/api/booking-upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "อัปโหลดไม่สำเร็จ");
  return json.webUrl as string;
}

// ★ ชื่อคอลัมน์ลายเซ็นในตาราง users — แก้ให้ตรงกับของจริง (เก็บเป็น data URL หรือ URL รูปที่เปิดได้จากเบราว์เซอร์)
const SIGNATURE_COLUMN = "signature_url";

async function getStoredSignature(userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select(SIGNATURE_COLUMN).eq("id", userId).maybeSingle();
  const v = (data as any)?.[SIGNATURE_COLUMN] as string | undefined;
  if (!v) return null;
  if (v.startsWith("data:")) return v;
  try {
    const blob = await (await fetch(v)).blob();
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
  } catch { return null; }
}

// ย่อรูปผังห้องเป็น JPEG ไม่เกิน 1600px (ให้ไฟล์เล็กพอส่งขึ้น OneDrive)
async function compressImage(file: File, maxSide = 1600): Promise<File> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
  return new File([blob], "layout.jpg", { type: "image/jpeg" });
}
async function uploadLayouts(files: File[], b: Booking): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) urls.push(await uploadPdf(await compressImage(files[i]), "layout", b, `-ผัง${i + 1}`));
  return urls;
}

// แจ้ง Teams (ธุรการทั่วไป / หัวหน้างานอาคารสถานที่) — ผู้รับแค่รับทราบ ไม่ต้องกดอะไร (ไม่ให้ล้มทั้งงานถ้าส่งไม่สำเร็จ)
function notifyAdmin(event: "new" | "head_done" | "approved" | "rejected", b: Booking) {
  authFetch("/api/booking-notify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "room", event, id: b.id }),
  }).catch(() => {});
}

async function fetchBooking(id: string): Promise<Booking> {
  const { data, error } = await supabase.from("room_bookings").select(BOOKING_SELECT).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------- หน้าหลัก ----------
export default function RoomBookingPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);
  const [pending, setPending] = useState<Booking[]>([]);
  const [mine, setMine] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [mySteps, setMySteps] = useState<Set<string>>(new Set());

  const [newTarget, setNewTarget] = useState<{ roomId: string; start: string; end: string } | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [stepTarget, setStepTarget] = useState<{ b: Booking; step: Step } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      const { data: p } = await supabase.from("users").select("id, role").eq("auth_id", data.user.id).maybeSingle();
      if (p) { setMyUserId((p as any).id ?? ""); setMyRole((p as any).role ?? ""); }
    });
    supabase.from("meeting_rooms").select("id, name, capacity").eq("is_active", true).order("sort_order")
      .then(({ data }) => setRooms((data ?? []) as Room[]));
  }, []);

  useEffect(() => {
    if (!myUserId) return;
    supabase.from("room_approvers").select("step").eq("user_id", myUserId)
      .then(({ data }) => setMySteps(new Set((data ?? []).map((r: any) => r.step))));
  }, [myUserId]);

  const loadDay = useCallback(async () => {
    setLoading(true); setErrorMsg("");
    const { data, error } = await supabase.from("room_bookings").select(BOOKING_SELECT)
      .eq("booking_date", date).not("status", "in", "(rejected,cancelled)").order("start_time");
    if (error) setErrorMsg("โหลดข้อมูลการจองไม่สำเร็จ: " + error.message);
    setDayBookings(data ?? []);
    setLoading(false);
  }, [date]);

  const loadWork = useCallback(async () => {
    if (!myUserId) return;
    const [a, b] = await Promise.all([
      supabase.from("room_bookings").select(BOOKING_SELECT).in("status", ["pending_head", "pending_deputy"]).order("booking_date"),
      supabase.from("room_bookings").select(BOOKING_SELECT).eq("requester_id", myUserId).gte("booking_date", todayISO()).order("booking_date"),
    ]);
    setPending(a.data ?? []);
    setMine((b.data ?? []).filter((x: Booking) => x.status !== "cancelled"));
  }, [myUserId]);

  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { loadWork(); }, [loadWork]);
  const reload = () => { loadDay(); loadWork(); };

  // ลิงก์จาก Teams: /room-booking?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id || !myUserId) return;
    fetchBooking(id).then((b) => { setDetail(b); window.history.replaceState(null, "", "/room-booking"); }).catch(() => {});
  }, [myUserId]);

  const canAct = (b: Booking) => {
    const step = STEP_OF[b.status];
    return !!step && (mySteps.has(step) || myRole === "admin");
  };
  const todo = useMemo(() => pending.filter(canAct), [pending, mySteps, myRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const strip = useMemo(() => {
    const base = new Date(todayISO() + "T00:00:00");
    return Array.from({ length: 21 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d; });
  }, []);
  function shift(n: number) { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + n); setDate(isoOf(d)); }
  function openPicker() {
    const el = dateInputRef.current as any;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker(); else { el.focus(); el.click(); }
  }
  function openNew(roomId: string, hour: number) {
    const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
    setNewTarget({ roomId, start: hh(hour), end: hh(Math.min(hour + 1, END_H)) });
  }

  async function cancelBooking(b: Booking) {
    if (!confirm("ยกเลิกคำขอนี้?")) return;
    const { error } = await supabase.from("room_bookings").update({ status: "cancelled" }).eq("id", b.id);
    if (error) { alert("ยกเลิกไม่สำเร็จ: " + error.message); return; }
    setDetail(null); reload();
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push(BACK_PATH)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600"><Home className="h-4 w-4" /></button>
            <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600"><ArrowLeft className="h-4 w-4" /></button>
          </div>
          <button onClick={() => rooms[0] && openNew(rooms[0].id, 8)} className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md">
            <Plus className="h-3.5 w-3.5" /> ขอใช้ห้องประชุม
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images1.jpg" alt="ตราโรงเรียน" className="h-14 w-14 object-contain" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">ห้องประชุม</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">ตารางการใช้ห้องประชุม</h1>
          </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-500 ring-1 ring-slate-200"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={openPicker} className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300">
              <Calendar className="h-4 w-4 text-indigo-500" /> {formatThaiDateFull(date)}
            </button>
            <button onClick={() => shift(1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-500 ring-1 ring-slate-200"><ChevronRight className="h-4 w-4" /></button>
            <input ref={dateInputRef} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} tabIndex={-1} aria-hidden className="sr-only" />
          </div>
        </div>

        {/* แถบเลือกวัน 21 วันข้างหน้า */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {strip.map((d) => {
            const iso = isoOf(d); const on = iso === date; const wk = d.getDay() === 0 || d.getDay() === 6;
            return (
              <button key={iso} onClick={() => setDate(iso)}
                className={`flex w-12 shrink-0 flex-col items-center rounded-2xl py-2 text-xs font-bold transition ${on ? "bg-indigo-600 text-white shadow-md" : wk ? "bg-slate-100 text-slate-400" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`}>
                <span className="text-[10px]">{DOW_SHORT[d.getDay()]}</span>
                <span className="text-base">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}</div>}

        {/* สรุปห้องว่าง + คำอธิบายสี */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {rooms.map((r) => {
            const n = dayBookings.filter((b) => b.room_id === r.id).length;
            return (
              <span key={r.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${n === 0 ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200" : "bg-slate-200 text-slate-600"}`}>
                <DoorOpen className="h-3 w-3" /> {r.name}: {n === 0 ? "ว่างทั้งวัน" : `จองแล้ว ${n} ช่วง`}
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded border border-slate-200 bg-white" /> ว่าง (แตะเพื่อจอง)</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-slate-300" /> ไม่ว่าง (อนุมัติแล้ว)</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded border-2 border-dashed border-slate-300 bg-slate-100" /> รออนุมัติ (ถือว่าจองไว้)</span>
        </div>

        {/* ตารางห้อง x ชั่วโมง */}
        <div className="mt-3 overflow-x-auto rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div style={{ minWidth: 760 }}>
            <div className="flex">
              <div className="w-28 shrink-0" />
              <div className="flex flex-1">
                {HOURS.map((h) => <div key={h} className="flex-1 border-l border-slate-100 pb-1 pl-1 text-[10px] font-bold text-slate-400">{String(h).padStart(2, "0")}:00</div>)}
              </div>
            </div>
            {loading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
            {rooms.map((r) => (
              <div key={r.id} className="flex border-t border-slate-100">
                <div className="flex w-28 shrink-0 items-center pr-2 text-xs font-extrabold text-slate-700">{r.name}</div>
                <div className="relative flex h-16 flex-1">
                  {HOURS.map((h) => (
                    <button key={h} onClick={() => openNew(r.id, h)} aria-label={`จอง ${r.name} เวลา ${h}:00`} className="flex-1 border-l border-slate-100 hover:bg-emerald-50" />
                  ))}
                  {dayBookings.filter((b) => b.room_id === r.id).map((b) => {
                    const s = Math.max(toMin(b.start_time) - START_H * 60, 0);
                    const e = Math.min(toMin(b.end_time) - START_H * 60, TOTAL_MIN);
                    if (e <= s) return null;
                    const ok = b.status === "approved";
                    return (
                      <button key={b.id} onClick={() => setDetail(b)}
                        style={{ left: `${(s / TOTAL_MIN) * 100}%`, width: `${((e - s) / TOTAL_MIN) * 100}%` }}
                        className={`absolute inset-y-1 overflow-hidden rounded-xl px-2 py-1 text-left text-[11px] leading-tight ${ok ? "bg-slate-300 text-slate-700" : "border-2 border-dashed border-slate-300 bg-slate-100 text-slate-500"}`}>
                        <span className="block truncate font-bold">{b.purpose}</span>
                        <span className="block truncate">{teacherName(b.requester)}{ok ? "" : " · รออนุมัติ"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* งานของฉัน */}
        {todo.length > 0 && (
          <Section title={`รอคุณดำเนินการ (${todo.length})`}>
            {todo.map((b) => <Row key={b.id} b={b} showDate onClick={() => setDetail(b)} />)}
          </Section>
        )}
        {mine.length > 0 && (
          <Section title="คำขอของฉัน">
            {mine.map((b) => <Row key={b.id} b={b} showDate onClick={() => setDetail(b)} />)}
          </Section>
        )}
        <Section title={`รายการใช้ห้องวันที่ ${formatThaiDateFull(date)}`}>
          {dayBookings.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีการจองในวันนี้</p> : dayBookings.map((b) => <Row key={b.id} b={b} onClick={() => setDetail(b)} />)}
        </Section>
      </div>

      {newTarget && (
        <BookingModal rooms={rooms} defaultDate={date} init={newTarget} myUserId={myUserId}
          onClose={() => setNewTarget(null)} onCreated={() => { setNewTarget(null); reload(); }} />
      )}
      {detail && (
        <DetailModal b={detail} rooms={rooms} canAct={canAct(detail)}
          canCancel={(detail.requester_id === myUserId || myRole === "admin") && !["cancelled", "rejected"].includes(detail.status)}
          onClose={() => setDetail(null)} onCancel={() => cancelBooking(detail)}
          onAct={() => { setStepTarget({ b: detail, step: STEP_OF[detail.status] }); setDetail(null); }} />
      )}
      {stepTarget && (
        <StepModal b={stepTarget.b} step={stepTarget.step} myUserId={myUserId} rooms={rooms}
          onClose={() => setStepTarget(null)} onDone={() => { setStepTarget(null); reload(); }} />
      )}
    </div>
  );
}

// ใช้ลายเซ็นที่บันทึกไว้ใน users อัตโนมัติ (ไม่ต้องเซ็นใหม่) — ถ้าไม่มีค่อยให้เซ็นสด
function SignatureField({ userId, onChange }: { userId: string; onChange: (s: string | null) => void }) {
  const [stored, setStored] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redo, setRedo] = useState(false);
  useEffect(() => {
    let cancel = false;
    if (!userId) { setLoading(false); return; }
    getStoredSignature(userId).then((s) => { if (cancel) return; setStored(s); setLoading(false); if (s) onChange(s); });
    return () => { cancel = true; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <p className="text-xs text-slate-400">กำลังโหลดลายเซ็น...</p>;
  if (stored && !redo) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={stored} alt="ลายเซ็น" className="h-14 max-w-[60%] object-contain" />
        <div className="text-right">
          <p className="text-[11px] font-semibold text-emerald-700">ใช้ลายเซ็นที่บันทึกไว้ในระบบ</p>
          <button type="button" onClick={() => { setRedo(true); onChange(null); }} className="text-xs font-semibold text-slate-500 hover:text-indigo-600">เซ็นใหม่</button>
        </div>
      </div>
    );
  }
  return <SignaturePad onChange={onChange} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-extrabold text-slate-700">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ b, onClick, showDate }: { b: Booking; onClick: () => void; showDate?: boolean }) {
  const st = STATUS[b.status];
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-100 hover:ring-indigo-200">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">
          {showDate ? `${formatThaiDateFull(b.booking_date)} · ` : ""}{timeShort(b.start_time)} - {timeShort(b.end_time)} น. · {b.room?.name}
        </p>
        <p className="truncate text-sm font-semibold text-slate-800">{b.purpose}</p>
        <p className="truncate text-xs text-slate-400">{teacherName(b.requester)}{b.layout_urls?.length ? " · 🪑 มีผังห้อง" : ""}</p>
      </div>
      <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
    </button>
  );
}

const Shell = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
    <div className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ${wide ? "max-w-xl" : "max-w-md"}`}>{children}</div>
  </div>
);
const Head = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <div className="flex items-center justify-between">
    <p className="text-sm font-extrabold text-slate-800">{title}</p>
    <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
  </div>
);
const inputCls = "mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm";
const labelCls = "text-xs font-bold text-slate-500";

// ---------- ฟอร์มขอใช้ห้อง ----------
function BookingModal({ rooms, defaultDate, init, myUserId, onClose, onCreated }: {
  rooms: Room[]; defaultDate: string; init: { roomId: string; start: string; end: string };
  myUserId: string; onClose: () => void; onCreated: () => void;
}) {
  const [roomId, setRoomId] = useState(init.roomId);
  const [bdate, setBdate] = useState(defaultDate);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [position, setPosition] = useState("");
  const [purpose, setPurpose] = useState("");
  const [attendees, setAttendees] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipOther, setEquipOther] = useState("");
  const [seating, setSeating] = useState<string>("");
  const [seatingOther, setSeatingOther] = useState("");
  const [layoutFiles, setLayoutFiles] = useState<File[]>([]);
  const layoutPreviews = useMemo(() => layoutFiles.map((f) => URL.createObjectURL(f)), [layoutFiles]);
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (e: string) => setEquipment((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]));

  async function submit() {
    if (!myUserId) { setError("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่"); return; }
    if (!purpose.trim()) { setError("กรุณากรอกวัตถุประสงค์การใช้ห้อง"); return; }
    if (!position.trim()) { setError("กรุณากรอกตำแหน่ง"); return; }
    if (toMin(end) <= toMin(start)) { setError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม"); return; }
    if (!sig) { setError("กรุณาลงลายเซ็น"); return; }
    setSaving(true); setError("");
    try {
      const { data, error: err } = await supabase.from("room_bookings").insert({
        room_id: roomId, booking_date: bdate, start_time: start, end_time: end,
        requester_id: myUserId, requester_position: position.trim(), purpose: purpose.trim(),
        attendees: attendees ? Number(attendees) : null,
        equipment, equipment_other: equipOther.trim() || null,
        seating: seating || null, seating_other: seatingOther.trim() || null,
        requester_signature: sig, requester_signed_at: new Date().toISOString(),
      }).select("id").single();
      if (err) throw new Error(err.code === "23P01" ? "ช่วงเวลานี้ห้องนี้ถูกจองแล้ว กรุณาเลือกเวลาหรือห้องอื่น" : err.message);

      // ฉบับไม่มีลายเซ็น -> OneDrive (ไม่ให้ล้มทั้งคำขอถ้าอัปโหลดพลาด)
      try {
        const full = await fetchBooking(data.id);
        let layoutUrls: string[] = [];
        try {
          if (layoutFiles.length) {
            layoutUrls = await uploadLayouts(layoutFiles, full);
            await supabase.from("room_bookings").update({ layout_urls: layoutUrls }).eq("id", data.id);
          }
        } catch (e) { console.warn("[room-booking] อัปโหลดผังห้องไม่สำเร็จ:", e); }
        notifyAdmin("new", { ...full, layout_urls: layoutUrls });
        const pdf = await makePdf(full, false, rooms.map((r) => r.name));
        const url = await uploadPdf(pdf, "unsigned", full);
        await supabase.from("room_bookings").update({ pdf_unsigned_url: url }).eq("id", data.id);
      } catch (e) { console.warn("[room-booking] อัปโหลดฉบับไม่มีลายเซ็นไม่สำเร็จ:", e); }

      onCreated();
    } catch (e: any) {
      setError(e.message ?? "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  return (
    <Shell wide>
      <Head title="แบบคำขอใช้ห้องประชุม" onClose={onClose} />
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>ห้องประชุม</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inputCls}>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>วันที่ใช้ห้อง</label>
          <input type="date" value={bdate} min={todayISO()} onChange={(e) => setBdate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>เวลาเริ่ม</label>
          <select value={start} onChange={(e) => setStart(e.target.value)} className={inputCls}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div>
          <label className={labelCls}>เวลาสิ้นสุด</label>
          <select value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>ตำแหน่งผู้ขอใช้ *</label>
          <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="เช่น ครู / หัวหน้างาน..." className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>เพื่อใช้ในการประชุม / จัดกิจกรรม / โครงการ *</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>จำนวนผู้เข้าร่วม (คน)</label>
          <input type="number" min={1} value={attendees} onChange={(e) => setAttendees(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls}>อุปกรณ์ที่ขอให้จัดเตรียม</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((e) => (
            <button type="button" key={e} onClick={() => toggle(e)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${equipment.includes(e) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{e}</button>
          ))}
        </div>
        <input value={equipOther} onChange={(e) => setEquipOther(e.target.value)} placeholder="อื่นๆ (ถ้ามี)" className={inputCls} />
      </div>

      <div className="mt-4">
        <label className={labelCls}>การจัดที่นั่ง</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {SEATING_OPTIONS.map((e) => (
            <button type="button" key={e} onClick={() => setSeating(seating === e ? "" : e)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${seating === e ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{e}</button>
          ))}
        </div>
        <input value={seatingOther} onChange={(e) => setSeatingOther(e.target.value)} placeholder="อื่นๆ (ถ้ามี)" className={inputCls} />
      </div>

      <div className="mt-4">
        <label className={labelCls}>แนบภาพผังการจัดห้อง / โต๊ะ-เก้าอี้ (ไม่เกิน 3 รูป)</label>
        <p className="text-[11px] text-slate-400">ฝ่ายทั่วไปจะใช้ภาพนี้จัดเตรียมโต๊ะและเก้าอี้ให้ตรงตามต้องการ</p>
        <input type="file" accept="image/*" multiple
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); setLayoutFiles((p) => [...p, ...fs].slice(0, 3)); e.target.value = ""; }}
          className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-600" />
        {layoutPreviews.length > 0 && (
          <div className="mt-2 flex gap-2">
            {layoutPreviews.map((u, i) => (
              <div key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`ผัง ${i + 1}`} className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200" />
                <button type="button" onClick={() => setLayoutFiles((p) => p.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-rose-500 p-0.5 text-white"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className={labelCls}>ลายเซ็นผู้ขอใช้ *</label>
        <div className="mt-1"><SignatureField userId={myUserId} onChange={setSig} /></div>
      </div>

      <button onClick={submit} disabled={saving} className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">
        {saving ? "กำลังส่งคำขอ..." : "ส่งคำขอใช้ห้อง"}
      </button>
    </Shell>
  );
}

// ---------- รายละเอียดคำขอ ----------
function DetailModal({ b, rooms, canAct, canCancel, onClose, onAct, onCancel }: {
  b: Booking; rooms: Room[]; canAct: boolean; canCancel: boolean;
  onClose: () => void; onAct: () => void; onCancel: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const st = STATUS[b.status];
  const line = (label: string, who: any, at: string | null, extra?: string) =>
    who && at ? <li key={label}>✓ {label}: {teacherName(who)} · {new Date(at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}{extra ? ` (${extra})` : ""}</li> : null;
  return (
    <Shell wide>
      <Head title="รายละเอียดคำขอใช้ห้อง" onClose={onClose} />
      <span className={`mt-3 inline-block rounded-lg px-2 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
      <div className="mt-3 space-y-1 text-sm text-slate-700">
        <p className="font-extrabold">{b.room?.name} · {formatThaiDateFull(b.booking_date)}</p>
        <p>เวลา {timeShort(b.start_time)} - {timeShort(b.end_time)} น.{b.attendees ? ` · ${b.attendees} คน` : ""}</p>
        <p>กิจกรรม: {b.purpose}</p>
        <p>ผู้ขอใช้: {teacherName(b.requester)}{b.requester_position ? ` (${b.requester_position})` : ""}</p>
        {(b.equipment?.length > 0 || b.equipment_other) && <p>อุปกรณ์: {[...(b.equipment ?? []), b.equipment_other].filter(Boolean).join(", ")}</p>}
        {(b.seating || b.seating_other) && <p>การจัดที่นั่ง: {[b.seating, b.seating_other].filter(Boolean).join(", ")}</p>}
        {b.reject_reason && <p className="font-semibold text-rose-600">เหตุผล: {b.reject_reason}</p>}
      </div>
      <ul className="mt-3 space-y-0.5 text-xs text-emerald-700">
        {line("ผู้ขอใช้เซ็นแล้ว", b.requester, b.requester_signed_at)}
        {line("หัวหน้ากลุ่มบริหารทั่วไป", b.head, b.head_signed_at)}
        {line("รองผอ.กลุ่มบริหารทั่วไป", b.deputy, b.deputy_signed_at)}
        {line("ผอ. (อนุมัติพร้อมรองผอ.)", b.director, b.director_signed_at, b.director_decision === "approved" ? "อนุมัติ" : "")}
        {line("หัวหน้างานอาคารสถานที่ (ระบบตรวจห้องว่าง)", b.staff, b.staff_signed_at)}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        {b.pdf_signed_url && <a href={b.pdf_signed_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><FileText className="h-3.5 w-3.5" /> แบบที่มีลายเซ็น (OneDrive)</a>}
        {b.pdf_unsigned_url && <a href={b.pdf_unsigned_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"><FileText className="h-3.5 w-3.5" /> แบบไม่มีลายเซ็น (พิมพ์ได้)</a>}
        {(b.layout_urls ?? []).map((u: string, i: number) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">🪑 ผังห้อง {i + 1}</a>
        ))}
        <button onClick={() => setPreview((p) => !p)} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600">{preview ? "ซ่อนแบบฟอร์ม" : "ดูแบบฟอร์ม"}</button>
      </div>

      {preview && (
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200" style={{ width: 794 * 0.5, height: 1123 * 0.5 }}>
          <div style={{ transform: "scale(0.5)", transformOrigin: "top left" }}>
            <RoomRequestForm data={toFormData(b)} withSignatures allRooms={rooms.map((r) => r.name)} />
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {canCancel && <button onClick={onCancel} className="rounded-xl border-2 border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50">ยกเลิกคำขอ</button>}
        {canAct && <button onClick={onAct} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md">{STEP_TITLE[STEP_OF[b.status]]} · เซ็นชื่อ</button>}
      </div>
    </Shell>
  );
}

// ---------- ผู้พิจารณาเซ็นแต่ละขั้น ----------
function StepModal({ b, step, myUserId, rooms, onClose, onDone }: {
  b: Booking; step: Step; myUserId: string; rooms: Room[]; onClose: () => void; onDone: () => void;
}) {
  const [ok, setOk] = useState(true);
  const [reason, setReason] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const yes = step === "head" ? "เห็นควรเสนอ" : "เห็นควร / อนุมัติ";
  const no = "ไม่เห็นควร";

  async function submit() {
    if (!ok && !reason.trim()) { setError("กรุณาระบุเหตุผล"); return; }
    if (!sig) { setError("กรุณาลงลายเซ็น"); return; }
    setSaving(true); setError("");
    const now = new Date().toISOString();
    const rej = ok ? null : reason.trim();
    let patch: Record<string, any> = {};
    if (step === "head") patch = { head_id: myUserId, head_signature: sig, head_signed_at: now, reject_reason: rej, status: ok ? "pending_deputy" : "rejected" };

    try {
      if (step === "deputy") {
        const base = { deputy_id: myUserId, deputy_signature: sig, deputy_signed_at: now };
        if (!ok) patch = { ...base, reject_reason: rej, status: "rejected" };
        else {
          // รองผอ.กด = ผอ.อนุมัติพร้อมกัน + ระบบลงชื่อ "ว่าง" ของหัวหน้างานอาคารฯ อัตโนมัติ (ดึงลายเซ็นจาก users)
          const { data: ap } = await supabase.from("room_approvers").select("step, user_id").in("step", ["director", "staff"]);
          const directorId = ap?.find((r: any) => r.step === "director")?.user_id;
          const staffId = ap?.find((r: any) => r.step === "staff")?.user_id;
          if (!directorId) throw new Error("ยังไม่ได้กำหนดผู้อำนวยการในตาราง room_approvers");
          const [dSig, sSig] = await Promise.all([getStoredSignature(directorId), staffId ? getStoredSignature(staffId) : Promise.resolve(null)]);
          if (!dSig) throw new Error("ผู้อำนวยการยังไม่มีลายเซ็นในระบบ จึงอนุมัติพร้อมกันไม่ได้");
          patch = {
            ...base, status: "approved",
            director_id: directorId, director_signature: dSig, director_signed_at: now, director_decision: "approved",
            staff_id: staffId ?? null, staff_result: "available", staff_signature: sSig, staff_signed_at: now,
          };
        }
      }
      const { data, error: err } = await supabase.from("room_bookings").update(patch).eq("id", b.id).eq("status", b.status).select("id");
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรช");

      // ผอ.อนุมัติ -> สร้างฉบับลายเซ็นครบ แล้วเก็บลง OneDrive
      try {
        const full = await fetchBooking(b.id);
        if (step === "deputy" && ok) {
          let url: string | null = null;
          try {
            const pdf = await makePdf(full, true, rooms.map((r) => r.name));
            url = await uploadPdf(pdf, "signed", full);
            await supabase.from("room_bookings").update({ pdf_signed_url: url }).eq("id", b.id);
          } catch (e) { console.warn("[room-booking] อัปโหลดฉบับมีลายเซ็นไม่สำเร็จ:", e); }
          notifyAdmin("approved", { ...full, pdf_signed_url: url });
        } else if (!ok) {
          notifyAdmin("rejected", full);
        } else if (step === "head") {
          notifyAdmin("head_done", full);
        }
      } catch (e) { console.warn("[room-booking] แจ้งเตือนไม่สำเร็จ:", e); }
      onDone();
    } catch (e: any) {
      setError(e.message ?? "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  return (
    <Shell>
      <Head title={STEP_TITLE[step]} onClose={onClose} />
      <p className="mt-1 text-xs text-slate-400">{b.room?.name} · {formatThaiDateFull(b.booking_date)} · {timeShort(b.start_time)} - {timeShort(b.end_time)} น.</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{b.purpose} — {teacherName(b.requester)}</p>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button onClick={() => setOk(true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${ok ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>{yes}</button>
        <button onClick={() => setOk(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${!ok ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"}`}>{no}</button>
      </div>
      {step === "deputy" && ok && (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700">เมื่อยืนยัน ระบบจะบันทึกการอนุมัติของ ผอ. พร้อมกัน สร้างแบบฟอร์มที่มีลายเซ็นครบ และแจ้ง Teams ให้ธุรการทั่วไปและหัวหน้างานอาคารสถานที่รับทราบ</p>
      )}
      {!ok && (
        <div className="mt-3">
          <label className={labelCls}>เนื่องจาก *</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </div>
      )}
      <div className="mt-4">
        <label className={labelCls}>ลายเซ็น *</label>
        <div className="mt-1"><SignatureField userId={myUserId} onChange={setSig} /></div>
      </div>
      <button onClick={submit} disabled={saving} className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">
        {saving ? "กำลังบันทึก..." : "ยืนยันและเซ็นชื่อ"}
      </button>
    </Shell>
  );
}
