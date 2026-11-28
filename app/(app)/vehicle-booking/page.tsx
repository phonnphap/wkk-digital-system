"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Calendar, ChevronLeft, ChevronRight, Plus, X, FileText, AlertTriangle, Settings2 } from "lucide-react";
import { todayISO, formatThaiDateFull, timeShort, teacherName } from "@/lib/duty-helpers";
import SignatureField from "@/components/room-booking/SignatureField";
import VehicleRequestForm, { VehicleFormData } from "@/components/room-booking/VehicleRequestForm";
import { authFetch, getStoredSignature, renderToPdf, uploadBookingFile } from "@/lib/booking-client";
import { VEHICLE_DIRECTOR_AUTO, isAdminRole } from "@/lib/booking-config";

const supabase = createClient() as any;

// ---------- ค่าคงที่ ----------
const START_H = 6, END_H = 20;
const TOTAL_MIN = (END_H - START_H) * 60;
const HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
const TIME_OPTIONS = Array.from({ length: 35 }, (_, i) => { const m = 5 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`; });
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ts = (d: string, t: string) => new Date(`${d}T${t.slice(0, 5)}:00`).getTime();

const NAME_SEL = "id, title, first_name, last_name, email, position";
const SEL = `*, vehicle:vehicles(*), driver:drivers(id,name,phone,user_id,user:users(email)),
  requester:users!vehicle_bookings_requester_id_fkey(${NAME_SEL}),
  assigner:users!vehicle_bookings_assigned_by_fkey(${NAME_SEL}),
  director:users!vehicle_bookings_director_id_fkey(${NAME_SEL})`;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_assign: { label: "รอจัดรถ/คนขับ", cls: "bg-amber-100 text-amber-700" },
  pending_director: { label: "รอ ผอ. อนุญาต", cls: "bg-sky-100 text-sky-700" },
  approved: { label: "อนุญาตแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "ไม่อนุญาต", cls: "bg-rose-100 text-rose-600" },
  cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

type Booking = Record<string, any>;
type Vehicle = { id: string; vehicle_type: string; plate: string; seats: number; is_hired: boolean; hire_note?: string | null; available_from?: string | null; available_to?: string | null; is_active: boolean };
type Driver = { id: string; name: string; phone?: string | null; is_active: boolean };

const vLabel = (v: { vehicle_type: string; plate: string }) => `${v.vehicle_type} ทะเบียน ${v.plate}`;
const range = (b: Booking) => b.start_date === b.end_date
  ? `${formatThaiDateFull(b.start_date)} ${timeShort(b.start_time)}–${timeShort(b.end_time)} น.`
  : `${formatThaiDateFull(b.start_date)} ${timeShort(b.start_time)} – ${formatThaiDateFull(b.end_date)} ${timeShort(b.end_time)} น.`;
const pdfLabel = (b: Booking) => `${b.destination}-${teacherName(b.requester)}-${timeShort(b.start_time).replace(":", ".")}`;

function toFormData(b: Booking, vehicles: Vehicle[]): VehicleFormData {
  return {
    created_at: b.created_at, start_date: b.start_date, start_time: b.start_time, end_date: b.end_date, end_time: b.end_time,
    vehicles: vehicles.filter((v) => !v.is_hired && v.is_active).map((v) => ({ id: v.id, label: vLabel(v) })),
    vehicle_id: b.vehicle_id, vehicle_label: b.vehicle ? vLabel(b.vehicle) : null, vehicle_hired: !!b.vehicle?.is_hired,
    requester_name: b.requester ? teacherName(b.requester) : "", requester_position: b.requester_position ?? "",
    purpose: b.purpose, destination: b.destination, distance_km: b.distance_km, passengers: b.passengers,
    requester_signature: b.requester_signature,
    driver_name: b.driver_name, assign_note: b.assign_note,
    assigner_name: b.assigner ? teacherName(b.assigner) : null, assigner_position: b.assigner?.position ?? null, assigner_signature: b.assign_signature,
    director_decision: b.director_decision, director_name: b.director ? teacherName(b.director) : null, director_signature: b.director_signature,
  };
}

async function fetchBooking(id: string): Promise<Booking> {
  const { data, error } = await supabase.from("vehicle_bookings").select(SEL).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}
function notifyVehicle(event: "new" | "edited" | "wait_director" | "approved" | "rejected", id: string) {
  authFetch("/api/booking-notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "vehicle", event, id }) }).catch(() => {});
}
// อนุญาตแล้ว → สร้าง PDF ฉบับลายเซ็นครบ เก็บ OneDrive แล้วแจ้ง Teams
async function finalizeApproved(id: string, vehicles: Vehicle[]) {
  try {
    const full = await fetchBooking(id);
    const pdf = await renderToPdf(<VehicleRequestForm data={toFormData(full, vehicles)} withSignatures />);
    const url = await uploadBookingFile(pdf, "vehicle_signed", full.start_date, pdfLabel(full));
    await supabase.from("vehicle_bookings").update({ pdf_signed_url: url }).eq("id", id);
  } catch (e) { console.warn("[vehicle-booking] สร้าง/อัปโหลดฉบับลายเซ็นไม่สำเร็จ:", e); }
  notifyVehicle("approved", id);
}

// ---------- หน้าหลัก ----------
export default function VehicleBookingPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);
  const [pending, setPending] = useState<Booking[]>([]);
  const [mine, setMine] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [mySteps, setMySteps] = useState<Set<string>>(new Set());
  const [newTarget, setNewTarget] = useState<{ start: string; end: string } | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null);
  const [directorTarget, setDirectorTarget] = useState<Booking | null>(null);
  const [editTarget, setEditTarget] = useState<Booking | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }: any) => {
      if (!data.user) { window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      const { data: p } = await supabase.from("users").select("id, role, email").eq("auth_id", data.user.id).maybeSingle();
      if (p) { setMyUserId(p.id ?? ""); setMyRole(p.role ?? ""); setMyEmail(p.email ?? ""); }
    });
    supabase.from("vehicles").select("*").eq("is_active", true).order("sort_order").then(({ data }: any) => setVehicles(data ?? []));
    supabase.from("drivers").select("*").eq("is_active", true).order("sort_order").then(({ data }: any) => setDrivers(data ?? []));
  }, []);
  useEffect(() => {
    if (!myUserId) return;
    supabase.from("room_approvers").select("step").eq("user_id", myUserId)
      .then(({ data }: any) => setMySteps(new Set((data ?? []).map((r: any) => r.step))));
  }, [myUserId]);

  const isAdmin = isAdminRole(myRole, myEmail);
  const canAssign = mySteps.has("vehicle_assign") || isAdmin;
  const canDirector = mySteps.has("director") || isAdmin;

  const loadDay = useCallback(async () => {
    setLoading(true); setErrorMsg("");
    const { data, error } = await supabase.from("vehicle_bookings").select(SEL)
      .lte("start_date", date).gte("end_date", date).not("status", "in", "(rejected,cancelled)").order("start_time");
    if (error) setErrorMsg("โหลดข้อมูลการจองรถไม่สำเร็จ: " + error.message);
    setDayBookings(data ?? []); setLoading(false);
  }, [date]);
  const loadWork = useCallback(async () => {
    if (!myUserId) return;
    const [a, b] = await Promise.all([
      supabase.from("vehicle_bookings").select(SEL).in("status", ["pending_assign", "pending_director"]).order("start_date"),
      supabase.from("vehicle_bookings").select(SEL).eq("requester_id", myUserId).gte("end_date", todayISO()).order("start_date"),
    ]);
    setPending(a.data ?? []);
    setMine((b.data ?? []).filter((x: Booking) => x.status !== "cancelled"));
  }, [myUserId]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { loadWork(); }, [loadWork]);
  const reload = () => { loadDay(); loadWork(); };

  // ลิงก์จาก Teams: /vehicle-booking?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id || !myUserId) return;
    fetchBooking(id).then((b) => { setDetail(b); window.history.replaceState(null, "", "/vehicle-booking"); }).catch(() => {});
  }, [myUserId]);

  const actionOf = (b: Booking): "assign" | "director" | null =>
    b.status === "pending_assign" && canAssign ? "assign" : b.status === "pending_director" && canDirector ? "director" : null;
  const todo = useMemo(() => pending.filter((b) => actionOf(b)), [pending, canAssign, canDirector]); // eslint-disable-line react-hooks/exhaustive-deps

  const strip = useMemo(() => { const base = new Date(todayISO() + "T00:00:00"); return Array.from({ length: 21 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d; }); }, []);
  const shift = (n: number) => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + n); setDate(isoOf(d)); };
  function openPicker() { const el = dateInputRef.current as any; if (!el) return; if (typeof el.showPicker === "function") el.showPicker(); else { el.focus(); el.click(); } }
  const openNew = (hour: number) => {
    const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
    setNewTarget({ start: hh(hour), end: hh(Math.min(hour + 2, 22)) });
  };

  async function cancelBooking(b: Booking) {
    if (!confirm("ยกเลิกคำขอนี้?")) return;
    const { error } = await supabase.from("vehicle_bookings").update({ status: "cancelled" }).eq("id", b.id);
    if (error) { alert("ยกเลิกไม่สำเร็จ: " + error.message); return; }
    setDetail(null); reload();
  }

  const gridVehicles = useMemo(() => vehicles.filter((v) =>
    !v.is_hired || ((!v.available_from || v.available_from <= date) && (!v.available_to || v.available_to >= date)) || dayBookings.some((b) => b.vehicle_id === v.id)
  ), [vehicles, date, dayBookings]);
  const unassigned = dayBookings.filter((b) => !b.vehicle_id);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600"><Home className="h-4 w-4" /></button>
            <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600"><ArrowLeft className="h-4 w-4" /></button>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <button onClick={() => router.push("/booking-settings")} className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
                <Settings2 className="h-3.5 w-3.5" /> ตั้งค่ารถ/ห้อง
              </button>
            )}
            <button onClick={() => openNew(8)} className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md">
              <Plus className="h-3.5 w-3.5" /> ขอใช้รถราชการ
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images1.jpg" alt="ตราโรงเรียน" className="h-14 w-14 object-contain" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">รถราชการ</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">ตารางการใช้รถ</h1>
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

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {strip.map((d) => {
            const iso = isoOf(d); const on = iso === date; const wk = d.getDay() === 0 || d.getDay() === 6;
            return (
              <button key={iso} onClick={() => setDate(iso)} className={`flex w-12 shrink-0 flex-col items-center rounded-2xl py-2 text-xs font-bold transition ${on ? "bg-indigo-600 text-white shadow-md" : wk ? "bg-slate-100 text-slate-400" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`}>
                <span className="text-[10px]">{DOW_SHORT[d.getDay()]}</span><span className="text-base">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}</div>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {gridVehicles.map((v) => {
            const n = dayBookings.filter((b) => b.vehicle_id === v.id).length;
            return (
              <span key={v.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${n === 0 ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200" : "bg-slate-200 text-slate-600"}`}>
                🚐 {v.vehicle_type} {v.plate}{v.is_hired ? " (จ้าง)" : ""}: {n === 0 ? "ว่างทั้งวัน" : `ใช้งาน ${n} ช่วง`}
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded border border-slate-200 bg-white" /> ว่าง (แตะเพื่อขอใช้)</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-slate-300" /> ไม่ว่าง (อนุญาตแล้ว)</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded border-2 border-dashed border-slate-300 bg-slate-100" /> รออนุญาต (ถือว่าจองไว้)</span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div style={{ minWidth: 880 }}>
            <div className="flex">
              <div className="w-36 shrink-0" />
              <div className="flex flex-1">{HOURS.map((h) => <div key={h} className="flex-1 border-l border-slate-100 pb-1 pl-1 text-[10px] font-bold text-slate-400">{String(h).padStart(2, "0")}:00</div>)}</div>
            </div>
            {loading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
            {gridVehicles.length === 0 && !loading && <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีรถในระบบ — แอดมินเพิ่มได้ที่ “ตั้งค่ารถ/ห้อง”</p>}
            {gridVehicles.map((v) => (
              <div key={v.id} className="flex border-t border-slate-100">
                <div className="flex w-36 shrink-0 flex-col justify-center pr-2">
                  <span className="text-xs font-extrabold text-slate-700">{v.vehicle_type} {v.plate}</span>
                  <span className="text-[10px] text-slate-400">{v.seats} ที่นั่ง{v.is_hired ? " · รถจ้าง" : ""}</span>
                </div>
                <div className="relative flex h-16 flex-1">
                  {HOURS.map((h) => <button key={h} onClick={() => openNew(h)} aria-label={`ขอใช้รถ เวลา ${h}:00`} className="flex-1 border-l border-slate-100 hover:bg-emerald-50" />)}
                  {dayBookings.filter((b) => b.vehicle_id === v.id).map((b) => {
                    const s = Math.max(b.start_date < date ? 0 : toMin(b.start_time) - START_H * 60, 0);
                    const e = Math.min(b.end_date > date ? TOTAL_MIN : toMin(b.end_time) - START_H * 60, TOTAL_MIN);
                    if (e <= s) return null;
                    const ok = b.status === "approved";
                    return (
                      <button key={b.id} onClick={() => setDetail(b)} style={{ left: `${(s / TOTAL_MIN) * 100}%`, width: `${((e - s) / TOTAL_MIN) * 100}%` }}
                        className={`absolute inset-y-1 overflow-hidden rounded-xl px-2 py-1 text-left text-[11px] leading-tight ${ok ? "bg-slate-300 text-slate-700" : "border-2 border-dashed border-slate-300 bg-slate-100 text-slate-500"}`}>
                        <span className="block truncate font-bold">{b.destination}</span>
                        <span className="block truncate">{teacherName(b.requester)}{b.driver_name ? ` · ขับ: ${b.driver_name}` : ""}{ok ? "" : " · รออนุญาต"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {unassigned.length > 0 && (
          <Section title={`คำขอที่ยังไม่ได้จัดรถวันนี้ (${unassigned.length})`}>
            {unassigned.map((b) => <Row key={b.id} b={b} onClick={() => setDetail(b)} />)}
          </Section>
        )}
        {todo.length > 0 && <Section title={`รอคุณดำเนินการ (${todo.length})`}>{todo.map((b) => <Row key={b.id} b={b} onClick={() => setDetail(b)} />)}</Section>}
        {mine.length > 0 && <Section title="คำขอของฉัน">{mine.map((b) => <Row key={b.id} b={b} onClick={() => setDetail(b)} />)}</Section>}
        <Section title={`รายการใช้รถวันที่ ${formatThaiDateFull(date)}`}>
          {dayBookings.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีการจองรถในวันนี้</p> : dayBookings.map((b) => <Row key={b.id} b={b} onClick={() => setDetail(b)} />)}
        </Section>
      </div>

      {newTarget && (
        <RequestModal defaultDate={date} init={newTarget} myUserId={myUserId} vehicles={vehicles} onClose={() => setNewTarget(null)}
          onCreated={async (id) => {
            setNewTarget(null); reload();
            // แอดมิน: เปิดหน้าจัดรถ+คนขับต่อทันที (ผ่านทันที ไม่ต้องรอ)
            if (isAdmin) { try { setAssignTarget(await fetchBooking(id)); } catch { /* ignore */ } }
          }} />
      )}
      {editTarget && (
        <RequestModal defaultDate={date} init={{ start: editTarget.start_time.slice(0, 5), end: editTarget.end_time.slice(0, 5) }} myUserId={myUserId} vehicles={vehicles}
          editing={editTarget} onClose={() => setEditTarget(null)} onCreated={() => { setEditTarget(null); reload(); }} />
      )}
      {detail && (
        <DetailModal b={detail} vehicles={vehicles} action={actionOf(detail)}
          canCancel={(detail.requester_id === myUserId || isAdmin) && !["cancelled", "rejected"].includes(detail.status)}
          canEdit={(detail.requester_id === myUserId || isAdmin) && ["pending_assign", "pending_director"].includes(detail.status) && !detail.leave_request_id}
          onEdit={() => { setEditTarget(detail); setDetail(null); }}
          onClose={() => setDetail(null)} onCancel={() => cancelBooking(detail)}
          onAct={() => { if (actionOf(detail) === "assign") setAssignTarget(detail); else setDirectorTarget(detail); setDetail(null); }} />
      )}
      {assignTarget && <AssignModal b={assignTarget} vehicles={vehicles} drivers={drivers} myUserId={myUserId} onClose={() => setAssignTarget(null)} onDone={() => { setAssignTarget(null); reload(); }} />}
      {directorTarget && <DirectorModal b={directorTarget} vehicles={vehicles} myUserId={myUserId} onClose={() => setDirectorTarget(null)} onDone={() => { setDirectorTarget(null); reload(); }} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-6"><p className="mb-2 text-sm font-extrabold text-slate-700">{title}</p><div className="space-y-2">{children}</div></div>;
}
function Row({ b, onClick }: { b: Booking; onClick: () => void }) {
  const st = STATUS[b.status];
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-100 hover:ring-indigo-200">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{range(b)}</p>
        <p className="truncate text-sm font-semibold text-slate-800">{b.destination} · {b.purpose}</p>
        <p className="truncate text-xs text-slate-400">
          {teacherName(b.requester)} · {b.passengers} คน · {b.vehicle ? vLabel(b.vehicle) : "ยังไม่จัดรถ"}{b.driver_name ? ` · ขับ: ${b.driver_name}` : ""}{b.leave_request_id ? " · 🏛️ จากคำขอไปราชการ" : ""}
        </p>
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
  <div className="flex items-center justify-between"><p className="text-sm font-extrabold text-slate-800">{title}</p><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
);
const inputCls = "mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm";
const labelCls = "text-xs font-bold text-slate-500";

// ---------- ขอใช้รถ (ผู้ขอไม่ต้องเลือกรถ — ผู้จัดรถเลือกให้) ----------
function RequestModal({ defaultDate, init, myUserId, vehicles, editing, onClose, onCreated }: {
  defaultDate: string; init: { start: string; end: string }; myUserId: string; vehicles: Vehicle[]; editing?: Booking | null; onClose: () => void; onCreated: (id: string) => void;
}) {
  const edt = editing ?? null;
  const [sd, setSd] = useState<string>(edt?.start_date ?? defaultDate), [st, setSt] = useState<string>(edt ? edt.start_time.slice(0, 5) : init.start);
  const [ed, setEd] = useState<string>(edt?.end_date ?? defaultDate), [et, setEt] = useState<string>(edt ? edt.end_time.slice(0, 5) : init.end);
  const [position, setPosition] = useState<string>(edt?.requester_position ?? ""), [purpose, setPurpose] = useState<string>(edt?.purpose ?? ""), [destination, setDestination] = useState<string>(edt?.destination ?? "");
  const [distance, setDistance] = useState<string>(edt?.distance_km != null ? String(edt.distance_km) : ""), [passengers, setPassengers] = useState<string>(edt ? String(edt.passengers) : "1");
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");

  async function submit() {
    if (!myUserId) { setError("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่"); return; }
    if (!purpose.trim() || !destination.trim()) { setError("กรุณากรอกวัตถุประสงค์และสถานที่ไป"); return; }
    if (!position.trim()) { setError("กรุณากรอกตำแหน่ง"); return; }
    if (!(Number(passengers) >= 1)) { setError("กรุณาระบุจำนวนผู้โดยสาร"); return; }
    if (ts(ed, et) <= ts(sd, st)) { setError("เวลากลับต้องหลังเวลาเริ่มเดินทาง"); return; }
    if (!sig) { setError("กรุณาลงลายเซ็น"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        requester_position: position.trim(), purpose: purpose.trim(), destination: destination.trim(),
        distance_km: distance ? Number(distance) : null, passengers: Number(passengers),
        start_date: sd, start_time: st, end_date: ed, end_time: et,
        requester_signature: sig, requester_signed_at: new Date().toISOString(),
      };
      let id: string;
      if (edt) {
        // แก้ไขได้ตราบที่ยังไม่อนุญาต — เริ่มขั้นตอนใหม่ (ล้างรถ/คนขับที่จัดไว้)
        const { data: upd, error: err } = await supabase.from("vehicle_bookings").update({
          ...payload, status: "pending_assign",
          vehicle_id: null, driver_id: null, driver_name: null, assigned_by: null, assigned_at: null, assign_note: null, assign_signature: null,
          director_id: null, director_decision: null, director_signature: null, director_signed_at: null,
        }).eq("id", edt.id).in("status", ["pending_assign", "pending_director"]).select("id");
        if (err) throw new Error(err.message);
        if (!upd?.length) throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว แก้ไขไม่ได้");
        id = edt.id;
      } else {
        const { data, error: err } = await supabase.from("vehicle_bookings").insert({ requester_id: myUserId, ...payload }).select("id").single();
        if (err) throw new Error(err.message);
        id = data.id;
      }
      const full = await fetchBooking(id);
      notifyVehicle(edt ? "edited" : "new", id);
      try {
        const pdf = await renderToPdf(<VehicleRequestForm data={toFormData(full, vehicles)} withSignatures={false} />);
        const url = await uploadBookingFile(pdf, "vehicle_unsigned", full.start_date, pdfLabel(full));
        await supabase.from("vehicle_bookings").update({ pdf_unsigned_url: url }).eq("id", id);
      } catch (e) { console.warn("[vehicle-booking] อัปโหลดฉบับไม่มีลายเซ็นไม่สำเร็จ:", e); }
      onCreated(id);
    } catch (e: any) { setError(e.message ?? "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }

  return (
    <Shell wide>
      <Head title={edt ? "แก้ไขคำขอใช้รถ" : "หนังสือขออนุญาตใช้รถยนต์ทางราชการ"} onClose={onClose} />
      {edt && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">เมื่อบันทึก ระบบจะให้ผู้จัดรถเลือกรถ/คนขับใหม่อีกครั้ง</p>}
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}
      <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-600">ไม่ต้องเลือกรถ — หัวหน้ากลุ่มบริหารทั่วไป/ธุรการทั่วไปจะจัดรถและคนขับให้ แล้วแจ้งกลับทาง Teams</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><label className={labelCls}>เดินทางวันที่</label><input type="date" value={sd} min={todayISO()} onChange={(e) => { setSd(e.target.value); if (ed < e.target.value) setEd(e.target.value); }} className={inputCls} /></div>
        <div><label className={labelCls}>เวลาเริ่ม (โดยประมาณ)</label><select value={st} onChange={(e) => setSt(e.target.value)} className={inputCls}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className={labelCls}>ถึงวันที่</label><input type="date" value={ed} min={sd} onChange={(e) => setEd(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>เวลากลับ (โดยประมาณ)</label><select value={et} onChange={(e) => setEt(e.target.value)} className={inputCls}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="col-span-2"><label className={labelCls}>ตำแหน่งผู้ขอใช้ *</label><input value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2"><label className={labelCls}>ขออนุญาตใช้รถเพื่อ *</label><input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2"><label className={labelCls}>สถานที่ไป *</label><input value={destination} onChange={(e) => setDestination(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>ระยะทางโดยประมาณ (กม.)</label><input type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>จำนวนผู้โดยสาร (คน) *</label><input type="number" min={1} value={passengers} onChange={(e) => setPassengers(e.target.value)} className={inputCls} /></div>
      </div>
      <div className="mt-4"><label className={labelCls}>ลายเซ็นผู้ขออนุญาต *</label><div className="mt-1"><SignatureField userId={myUserId} onChange={setSig} /></div></div>
      <button onClick={submit} disabled={saving} className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">{saving ? "กำลังบันทึก..." : edt ? "บันทึกการแก้ไข" : "ส่งคำขอใช้รถ"}</button>
    </Shell>
  );
}

// ---------- รายละเอียด ----------
function DetailModal({ b, vehicles, action, canCancel, canEdit, onClose, onCancel, onEdit, onAct }: {
  b: Booking; vehicles: Vehicle[]; action: "assign" | "director" | null; canCancel: boolean; canEdit: boolean; onClose: () => void; onCancel: () => void; onEdit: () => void; onAct: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const st = STATUS[b.status];
  return (
    <Shell wide>
      <Head title="รายละเอียดคำขอใช้รถ" onClose={onClose} />
      <span className={`mt-3 inline-block rounded-lg px-2 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
      <div className="mt-3 space-y-1 text-sm text-slate-700">
        <p className="font-extrabold">{range(b)}</p>
        <p>ปลายทาง: {b.destination}{b.distance_km ? ` (${b.distance_km} กม.)` : ""}</p>
        <p>เพื่อ: {b.purpose} · ผู้โดยสาร {b.passengers} คน</p>
        <p>ผู้ขอใช้: {teacherName(b.requester)}{b.requester_position ? ` (${b.requester_position})` : ""}</p>
        {b.leave_request_id && <p className="font-semibold text-sky-600">🏛️ ผูกกับคำขอไปราชการ (เลือกใช้รถโรงเรียน){["pending_assign", "pending_director"].includes(b.status) ? " — แก้ไขได้ที่หน้าใบลา/ไปราชการ" : ""}</p>}
        <p className="font-bold">🚐 รถ: {b.vehicle ? `${vLabel(b.vehicle)} (${b.vehicle.seats} ที่นั่ง${b.vehicle.is_hired ? " · รถจ้าง" : ""})` : "ยังไม่ได้จัดรถ"}</p>
        <p className="font-bold">👤 คนขับ: {b.driver_name ?? "ยังไม่ได้จัดคนขับ"}{b.driver?.phone ? ` · ${b.driver.phone}` : ""}</p>
        {b.assign_note && <p>ความเห็นผู้จัดรถ: {b.assign_note}</p>}
        {b.reject_reason && <p className="font-semibold text-rose-600">เหตุผล: {b.reject_reason}</p>}
      </div>
      <ul className="mt-3 space-y-0.5 text-xs text-emerald-700">
        {b.requester_signed_at && <li>✓ ผู้ขอใช้เซ็นแล้ว · {teacherName(b.requester)}</li>}
        {b.assigned_at && b.assigner && <li>✓ จัดรถ/คนขับโดย {teacherName(b.assigner)}</li>}
        {b.director_signed_at && b.director && <li>✓ ผอ. {b.director_decision === "approved" ? "อนุญาต" : "ไม่อนุญาต"} · {teacherName(b.director)}</li>}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {b.pdf_signed_url && <a href={b.pdf_signed_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><FileText className="h-3.5 w-3.5" /> แบบที่มีลายเซ็น (OneDrive)</a>}
        {b.pdf_unsigned_url && <a href={b.pdf_unsigned_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"><FileText className="h-3.5 w-3.5" /> แบบไม่มีลายเซ็น (พิมพ์ได้)</a>}
        <button onClick={() => setPreview((p) => !p)} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600">{preview ? "ซ่อนแบบฟอร์ม" : "ดูแบบฟอร์ม"}</button>
      </div>
      {preview && (
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200" style={{ width: 794 * 0.5, height: 1123 * 0.5 }}>
          <div style={{ transform: "scale(0.5)", transformOrigin: "top left" }}><VehicleRequestForm data={toFormData(b, vehicles)} withSignatures /></div>
        </div>
      )}
      <div className="mt-6 flex gap-2">
        {canEdit && <button onClick={onEdit} className="rounded-xl border-2 border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">✏️ แก้ไขคำขอ</button>}
        {canCancel && <button onClick={onCancel} className="rounded-xl border-2 border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50">ยกเลิกคำขอ</button>}
        {action && <button onClick={onAct} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md">{action === "assign" ? "เลือกรถ + คนขับ" : "ผอ. พิจารณา"}</button>}
      </div>
    </Shell>
  );
}

// ---------- จัดรถ + คนขับ (หัวหน้ากลุ่มบริหารทั่วไป / ธุรการทั่วไป) ----------
function AssignModal({ b, vehicles, drivers, myUserId, onClose, onDone }: {
  b: Booking; vehicles: Vehicle[]; drivers: Driver[]; myUserId: string; onClose: () => void; onDone: () => void;
}) {
  const [busyRows, setBusyRows] = useState<Booking[]>([]);
  const [vehicleId, setVehicleId] = useState(""), [driverId, setDriverId] = useState(""), [driverOther, setDriverOther] = useState("");
  const [note, setNote] = useState("เห็นควรอนุญาต");
  const [sig, setSig] = useState<string | null>(null);
  const [reject, setReject] = useState(false), [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");

  useEffect(() => {
    supabase.from("vehicle_bookings").select("id,vehicle_id,driver_id,driver_name,start_date,start_time,end_date,end_time,destination,status")
      .neq("id", b.id).not("status", "in", "(rejected,cancelled)").not("vehicle_id", "is", null)
      .lte("start_date", b.end_date).gte("end_date", b.start_date).then(({ data }: any) => setBusyRows(data ?? []));
  }, [b.id, b.start_date, b.end_date]);

  const overlap = (x: Booking) => ts(x.start_date, x.start_time) < ts(b.end_date, b.end_time) && ts(b.start_date, b.start_time) < ts(x.end_date, x.end_time);
  const cands = useMemo(() => vehicles
    .filter((v) => v.is_active && (!v.available_from || v.available_from <= b.start_date) && (!v.available_to || v.available_to >= b.end_date))
    .map((v) => ({ v, busy: busyRows.find((x) => x.vehicle_id === v.id && overlap(x)), seatOk: v.seats >= b.passengers + 1 }))
    .sort((a, c) => (Number(!!a.busy) - Number(!!c.busy)) || (Number(!a.seatOk) - Number(!c.seatOk)) || (a.v.seats - c.v.seats)),
  [vehicles, busyRows, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const driverBusy = (id: string) => busyRows.find((x) => x.driver_id === id && overlap(x));

  async function submit() {
    setError("");
    if (!sig) { setError("กรุณาลงลายเซ็น"); return; }
    const now = new Date().toISOString();
    setSaving(true);
    try {
      if (reject) {
        if (!reason.trim()) throw new Error("กรุณาระบุเหตุผล (เช่น ไม่มีรถว่าง)");
        const { data, error: err } = await supabase.from("vehicle_bookings")
          .update({ status: "rejected", reject_reason: reason.trim(), assigned_by: myUserId, assigned_at: now, assign_signature: sig })
          .eq("id", b.id).eq("status", "pending_assign").select("id");
        if (err) throw new Error(err.message);
        if (!data?.length) throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรช");
        notifyVehicle("rejected", b.id);
        onDone(); return;
      }
      if (!vehicleId) throw new Error("กรุณาเลือกรถ");
      const driver = drivers.find((d) => d.id === driverId);
      const driverName = driver?.name ?? driverOther.trim();
      if (!driverName) throw new Error("กรุณาเลือกหรือระบุชื่อคนขับ");

      const base = { vehicle_id: vehicleId, driver_id: driverId || null, driver_name: driverName, assigned_by: myUserId, assigned_at: now, assign_note: note.trim() || null, assign_signature: sig };
      let patch: Record<string, any>;
      if (VEHICLE_DIRECTOR_AUTO) {
        // จัดรถเสร็จ = ผอ. อนุญาตพร้อมกัน (ดึงลายเซ็น ผอ. จาก users)
        const { data: ap } = await supabase.from("room_approvers").select("user_id").eq("step", "director");
        const directorId = ap?.[0]?.user_id;
        if (!directorId) throw new Error("ยังไม่ได้กำหนดผู้อำนวยการในตาราง room_approvers");
        const dSig = await getStoredSignature(directorId);
        if (!dSig) throw new Error("ผู้อำนวยการยังไม่มีลายเซ็นในระบบ จึงอนุญาตพร้อมกันไม่ได้");
        patch = { ...base, status: "approved", director_id: directorId, director_decision: "approved", director_signature: dSig, director_signed_at: now };
      } else patch = { ...base, status: "pending_director" };

      const { data, error: err } = await supabase.from("vehicle_bookings").update(patch).eq("id", b.id).eq("status", "pending_assign").select("id");
      if (err) throw new Error(err.code === "23P01" ? (err.message.includes("driver") ? "คนขับคนนี้มีงานในช่วงเวลาเดียวกันแล้ว" : "รถคันนี้ถูกใช้ในช่วงเวลาเดียวกันแล้ว") : err.message);
      if (!data?.length) throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรช");
      if (VEHICLE_DIRECTOR_AUTO) await finalizeApproved(b.id, vehicles); else notifyVehicle("wait_director", b.id);
      onDone();
    } catch (e: any) { setError(e.message ?? "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }

  return (
    <Shell wide>
      <Head title="จัดรถและคนขับ" onClose={onClose} />
      <p className="mt-1 text-xs text-slate-500">{range(b)} · {b.destination} · ผู้โดยสาร {b.passengers} คน (ต้องการที่นั่ง ≥ {b.passengers + 1} รวมคนขับ)</p>
      <p className="text-xs text-slate-400">ผู้ขอ: {teacherName(b.requester)} — {b.purpose}</p>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button onClick={() => setReject(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${!reject ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>จัดรถ + คนขับ</button>
        <button onClick={() => setReject(true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${reject ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"}`}>ไม่มีรถ / ไม่อนุมัติ</button>
      </div>

      {reject ? (
        <div className="mt-3"><label className={labelCls}>เนื่องจาก *</label><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></div>
      ) : (
        <>
          <div className="mt-4">
            <label className={labelCls}>เลือกรถ *</label>
            <div className="mt-1 space-y-2">
              {cands.length === 0 && <p className="text-xs text-rose-500">ไม่มีรถที่ใช้ได้ในช่วงนี้ — แอดมินเพิ่มรถ/รถจ้างได้ที่ตั้งค่า</p>}
              {cands.map(({ v, busy, seatOk }) => (
                <button type="button" key={v.id} disabled={!!busy} onClick={() => setVehicleId(v.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm ${vehicleId === v.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200"} ${busy ? "cursor-not-allowed opacity-50" : "hover:border-indigo-300"}`}>
                  <span><span className="font-bold text-slate-800">{vLabel(v)}</span><span className="ml-2 text-xs text-slate-400">{v.seats} ที่นั่ง{v.is_hired ? " · รถจ้างชั่วคราว" : ""}</span></span>
                  <span className="shrink-0 text-[11px] font-bold">
                    {busy ? <span className="text-rose-500">ไม่ว่าง ({busy.destination})</span> : seatOk ? <span className="text-emerald-600">ว่าง · ที่นั่งพอ</span> : <span className="text-amber-600">ว่าง · ที่นั่งไม่พอ</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>เลือกคนขับ *</label>
            <select value={driverId} onChange={(e) => { setDriverId(e.target.value); if (e.target.value) setDriverOther(""); }} className={inputCls}>
              <option value="">— เลือกคนขับ —</option>
              {drivers.map((d) => { const bz = driverBusy(d.id); return <option key={d.id} value={d.id} disabled={!!bz}>{d.name}{bz ? ` (ไม่ว่าง: ${bz.destination})` : ""}</option>; })}
            </select>
            <input value={driverOther} onChange={(e) => { setDriverOther(e.target.value); if (e.target.value) setDriverId(""); }} placeholder="หรือพิมพ์ชื่อคนขับอื่น (เช่น คนขับรถจ้าง)" className={inputCls} />
          </div>
          <div className="mt-4"><label className={labelCls}>ความเห็น (แสดงในแบบฟอร์ม)</label><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></div>
          {VEHICLE_DIRECTOR_AUTO && <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700">เมื่อยืนยัน ระบบจะบันทึกการอนุญาตของ ผอ. พร้อมกัน สร้างแบบฟอร์มลายเซ็นครบ แล้วแจ้ง Teams ผู้ขอและคนขับ</p>}
        </>
      )}
      <div className="mt-4"><label className={labelCls}>ลายเซ็นผู้จัดรถ *</label><div className="mt-1"><SignatureField userId={myUserId} onChange={setSig} /></div></div>
      <button onClick={submit} disabled={saving} className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">{saving ? "กำลังบันทึก..." : "ยืนยันและเซ็นชื่อ"}</button>
    </Shell>
  );
}

// ---------- ผอ. พิจารณา (ใช้เมื่อ VEHICLE_DIRECTOR_AUTO = false) ----------
function DirectorModal({ b, vehicles, myUserId, onClose, onDone }: { b: Booking; vehicles: Vehicle[]; myUserId: string; onClose: () => void; onDone: () => void }) {
  const [ok, setOk] = useState(true), [reason, setReason] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function submit() {
    if (!ok && !reason.trim()) { setError("กรุณาระบุเหตุผล"); return; }
    if (!sig) { setError("กรุณาลงลายเซ็น"); return; }
    setSaving(true); setError("");
    try {
      const { data, error: err } = await supabase.from("vehicle_bookings").update({
        director_id: myUserId, director_decision: ok ? "approved" : "rejected", director_signature: sig, director_signed_at: new Date().toISOString(),
        status: ok ? "approved" : "rejected", reject_reason: ok ? null : reason.trim(),
      }).eq("id", b.id).eq("status", "pending_director").select("id");
      if (err) throw new Error(err.message);
      if (!data?.length) throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรช");
      if (ok) await finalizeApproved(b.id, vehicles); else notifyVehicle("rejected", b.id);
      onDone();
    } catch (e: any) { setError(e.message ?? "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }
  return (
    <Shell>
      <Head title="ผู้อำนวยการพิจารณา" onClose={onClose} />
      <p className="mt-1 text-xs text-slate-500">{range(b)} · {b.destination} · {b.vehicle ? vLabel(b.vehicle) : ""} · ขับ: {b.driver_name}</p>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={() => setOk(true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${ok ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>อนุญาต</button>
        <button onClick={() => setOk(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${!ok ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"}`}>ไม่อนุญาต</button>
      </div>
      {!ok && <div className="mt-3"><label className={labelCls}>เนื่องจาก *</label><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></div>}
      <div className="mt-4"><label className={labelCls}>ลายเซ็น *</label><div className="mt-1"><SignatureField userId={myUserId} onChange={setSig} /></div></div>
      <button onClick={submit} disabled={saving} className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">{saving ? "กำลังบันทึก..." : "ยืนยันและเซ็นชื่อ"}</button>
    </Shell>
  );
}
