"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home, ArrowLeft, Calendar, Camera, CheckCircle2, Circle, X,
  Settings2, CalendarRange, ShieldCheck, Users, AlertTriangle,
  MapPin, BarChart3, Navigation,
} from "lucide-react";
import {
  THAI_DOW, jsDateToDow, todayISO, formatThaiDateFull, timeShort, teacherName,
  Teacher, DutyPoint, DutyTimeSlot, DutyAssignment, DutyLog, HeadSetting,
} from "@/lib/duty-helpers";
import { isExcludedTeacher } from "@/lib/duty-helpers";

const supabase = createClient();
const DASHBOARD_PATH = "/duty-report";

// ★ ฟิลด์ GPS เป็นของใหม่ที่ยังไม่มีใน DutyLog เดิม (lib/duty-helpers.ts) จึงต้องขยาย type ตรงนี้ไปก่อน
type DutyLogWithGps = DutyLog & {
  signer?: Teacher;
  gps_status?: "in_range" | "out_of_range" | "unavailable" | "no_point_coords" | null;
  distance_meters?: number | null;
  checkin_lat?: number | null;
  checkin_lng?: number | null;
  checkin_accuracy?: number | null;
};
type SlotView = DutyTimeSlot & { assignments: (DutyAssignment & { teacher?: Teacher })[]; log?: DutyLogWithGps };
type PointView = DutyPoint & {
  slots: SlotView[];
  latitude?: number | null;
  longitude?: number | null;
  radius_meters?: number | null;
};

type GpsResult = {
  lat: number;
  lng: number;
  accuracy: number;
  distance: number | null;
  status: "in_range" | "out_of_range" | "unavailable" | "no_point_coords";
};

// ★ คำนวณระยะห่างระหว่างพิกัด 2 จุด (เมตร) ด้วยสูตร Haversine
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DutyDailyReportPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dow = useMemo(() => jsDateToDow(new Date(date + "T00:00:00")), [date]);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [points, setPoints] = useState<PointView[]>([]);
  const [headToday, setHeadToday] = useState<{ head?: Teacher; deputy?: Teacher }>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [signModalTarget, setSignModalTarget] = useState<{ point: PointView; slot: SlotView } | null>(null);
  const [gpsPointTarget, setGpsPointTarget] = useState<PointView | null>(null);

  const [myUserId, setMyUserId] = useState<string>("");
  const [myRole, setMyRole] = useState<string>("");
  const [myEmail, setMyEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("users").select("id, role, email").eq("auth_id", user.id).maybeSingle();
      if (profile) {
        setMyUserId((profile as any).id ?? "");
        setMyRole((profile as any).role ?? "");
        setMyEmail((profile as any).email ?? "");
      }
    });
  }, []);

  // ★ แอดมิน/ผู้บริหาร: จัดการได้ + เห็นทุกจุด + เห็นแดชบอร์ดสรุป
  const canManageDuty = useMemo(() => {
    return (
      ["admin", "director", "deputy_director", "admin_general"].includes(myRole) ||
      myEmail === "chanidapa@khienkhet.ac.th"
    );
  }, [myRole, myEmail]);

  // ★ หัวหน้าเวร/รองหัวหน้าเวร "ของวันนี้" (มาจากตารางตั้งค่า ไม่ใช่ role ตายตัว)
  const isHeadToday = useMemo(() => {
    if (!myUserId) return false;
    return headToday.head?.id === myUserId || headToday.deputy?.id === myUserId;
  }, [myUserId, headToday]);

  // ★ ใครเห็นได้ทุกจุด: แอดมิน/ผู้บริหาร หรือ หัวหน้า/รองหัวหน้าเวรของวันนั้น
  const canViewAll = canManageDuty || isHeadToday;

  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof (el as any).showPicker === "function") (el as any).showPicker();
    else { el.focus(); el.click(); }
  }

  useEffect(() => {
    supabase.from("users").select("id, title, first_name, last_name, role").order("first_name").then(({ data, error }) => {
      if (error) { console.warn("[duty-report] โหลดรายชื่อครูไม่สำเร็จ:", error.message); return; }
      setTeachers((data ?? []).filter((t) => !isExcludedTeacher(t)));
    });
  }, []);

  async function loadAll() {
    setLoading(true);
    setErrorMsg("");

    const { data: headData, error: headErr } = await supabase
      .from("duty_head_settings")
      .select("role, teacher:users(id, title, first_name, last_name)")
      .eq("day_of_week", dow);
    if (headErr) console.warn("[duty-report] โหลดหัวหน้าเวรไม่สำเร็จ:", headErr.message);
    const headMap: { head?: Teacher; deputy?: Teacher } = {};
    (headData ?? []).forEach((r: any) => {
      if (r.role === "head") headMap.head = r.teacher;
      if (r.role === "deputy") headMap.deputy = r.teacher;
    });
    setHeadToday(headMap);

    // จุดเวร + ช่วงเวลาของวันนี้ + พิกัด/รัศมีของจุดเวร
    const { data: pointRows, error: pointErr } = await supabase
      .from("duty_points")
      .select(
        "id, point_number, title, location_note, sort_order, latitude, longitude, radius_meters, slots:duty_time_slots(id, duty_point_id, day_of_week, start_time, end_time, slot_label, sort_order, assignments:duty_slot_assignments(id, time_slot_id, teacher_id, sort_order, teacher:users(id, title, first_name, last_name)))"
      )
      .order("sort_order");

    if (pointErr) {
      setErrorMsg("โหลดข้อมูลจุดเวรไม่สำเร็จ: " + pointErr.message);
      setLoading(false);
      return;
    }

        const slotIds: string[] = [];
    const built: PointView[] = (pointRows ?? []).map((p: any) => {
      const slots: SlotView[] = (p.slots ?? [])
        .filter((s: any) => s.day_of_week === dow)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((s: any) => {
          slotIds.push(s.id);
          return { ...s, assignments: s.assignments ?? [] };
        });
      return {
        id: p.id, point_number: p.point_number, title: p.title, location_note: p.location_note, sort_order: p.sort_order,
        latitude: p.latitude, longitude: p.longitude, radius_meters: p.radius_meters,
        slots,
      };
    });

    let logs: any[] = [];
    if (slotIds.length > 0) {
      const { data: logData, error: logErr } = await supabase
        .from("duty_daily_logs")
        .select("id, log_date, time_slot_id, status, signed_by, signed_at, photo_url, note, gps_status, distance_meters, signer:users!duty_daily_logs_signed_by_fkey(id, title, first_name, last_name)")
        .eq("log_date", date)
        .in("time_slot_id", slotIds);
      if (logErr) console.warn("[duty-report] โหลดบันทึกการเซ็นไม่สำเร็จ:", logErr.message);
      logs = logData ?? [];
    }
    const logBySlot = new Map(logs.map((l: any) => [l.time_slot_id, l]));

    built.forEach((p) => p.slots.forEach((s) => { s.log = logBySlot.get(s.id); }));
    setPoints(built);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [date, dow]);

  // ★ กรองรายการที่แสดง: ครูทั่วไปเห็นเฉพาะจุดที่ตัวเองถูกมอบหมาย, หัวหน้าเวร/แอดมินเห็นทั้งหมด
  const visiblePoints = useMemo(() => {
    if (canViewAll) return points;
    if (!myUserId) return [];
    return points
      .map((p) => ({ ...p, slots: p.slots.filter((s) => s.assignments.some((a) => a.teacher_id === myUserId)) }))
      .filter((p) => p.slots.length > 0);
  }, [points, canViewAll, myUserId]);

  const totalSlots = visiblePoints.reduce((sum, p) => sum + p.slots.length, 0);
  const doneSlots = visiblePoints.reduce((sum, p) => sum + p.slots.filter((s) => s.log?.status === "done").length, 0);

  async function handleSaveSign(
    point: PointView, slot: SlotView, signerId: string, photoFile: File | null,
    note: string, existingPhotoUrl: string | null, gps: GpsResult | null
  ) {
    let photo_url = existingPhotoUrl;
    if (photoFile) {
      const fd = new FormData();
      fd.append("file", photoFile);
      fd.append("dayThai", THAI_DOW[dow]);
      fd.append("date", date);
      fd.append("pointLabel", `${point.point_number}-${point.title}`);
      const res = await fetch("/api/duty-photo-upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "อัปโหลดรูปไม่สำเร็จ");
      photo_url = json.webUrl;
    }

    const { error } = await supabase.from("duty_daily_logs").upsert(
      {
        log_date: date, time_slot_id: slot.id, status: "done", signed_by: signerId,
        signed_at: new Date().toISOString(), photo_url, note: note || null,
        checkin_lat: gps?.lat ?? null,
        checkin_lng: gps?.lng ?? null,
        checkin_accuracy: gps?.accuracy ?? null,
        distance_meters: gps?.distance ?? null,
        gps_status: gps?.status ?? null,
      },
      { onConflict: "log_date,time_slot_id" }
    );
    if (error) throw new Error("บันทึกไม่สำเร็จ: " + error.message);
  }

  async function handleUndo(slot: SlotView) {
    if (!slot.log) return;
    if (!confirm("ยกเลิกการบันทึกจุดนี้? (ต้องเซ็นชื่อ+แนบรูปใหม่)")) return;
    const { error } = await supabase.from("duty_daily_logs").delete().eq("id", slot.log.id);
    if (error) { alert("ยกเลิกไม่สำเร็จ: " + error.message); return; }
    loadAll();
  }

  async function handleSaveGpsPoint(pointId: string, latitude: number, longitude: number, radius: number) {
    const { error } = await supabase.from("duty_points").update({ latitude, longitude, radius_meters: radius }).eq("id", pointId);
    if (error) throw new Error("บันทึกพิกัดไม่สำเร็จ: " + error.message);
    loadAll();
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push(DASHBOARD_PATH)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
              <Home className="h-4.5 w-4.5" />
            </button>
            <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="flex gap-2">
            {canManageDuty && (
              <button onClick={() => router.push("/duty-report/report/summary")} className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
                <BarChart3 className="h-3.5 w-3.5" /> แดชบอร์ดสรุป
              </button>
            )}
            {canManageDuty && (
              <button onClick={() => router.push("/duty-report/report/settings")} className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
                <Settings2 className="h-3.5 w-3.5" /> ตั้งค่าหัวหน้าเวร
              </button>
            )}
            <button onClick={() => router.push("/duty-report/report/roster")} className="flex items-center gap-1.5 rounded-2xl border-2 border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50">
              <CalendarRange className="h-3.5 w-3.5" /> จัดตารางเวร 7 วัน
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">งานเวรประจำวัน</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">รายงานการปฏิบัติหน้าที่เวร</h1>
            {!canViewAll && myUserId && (
              <p className="mt-1 text-xs font-semibold text-indigo-500">แสดงเฉพาะจุดเวรที่คุณรับผิดชอบ</p>
            )}
          </div>
          <div>
            <button type="button" onClick={openDatePicker} className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300">
              <Calendar className="h-4 w-4 text-indigo-500" /> {formatThaiDateFull(date)}
            </button>
            <input ref={dateInputRef} type="date" value={date} onChange={(e) => setDate(e.target.value)} tabIndex={-1} aria-hidden className="sr-only" />
          </div>
        </div>

        {errorMsg && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}

        {/* หัวหน้าเวร/รองหัวหน้าเวร + progress */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-indigo-500" /> หัวหน้าเวร/รองหัวหน้าเวร วัน{THAI_DOW[dow]}</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-800">หัวหน้าเวร: {headToday.head ? teacherName(headToday.head) : "ยังไม่ได้ตั้งค่า"}</p>
            <p className="text-sm font-semibold text-slate-600">รองหัวหน้าเวร: {headToday.deputy ? teacherName(headToday.deputy) : "ยังไม่ได้ตั้งค่า"}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> ความคืบหน้าวันนี้</p>
            <p className="mt-1.5 text-2xl font-black text-slate-800">{doneSlots}/{totalSlots} <span className="text-sm font-semibold text-slate-400">จุด</span></p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: totalSlots ? `${(doneSlots / totalSlots) * 100}%` : "0%" }} />
            </div>
          </div>
        </div>

        {/* รายการจุดเวร */}
        <div className="mt-6 space-y-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
          ) : visiblePoints.every((p) => p.slots.length === 0) ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-500">
                {canViewAll ? `ยังไม่มีตารางเวรสำหรับวัน${THAI_DOW[dow]}` : "วันนี้คุณไม่มีจุดเวรที่ต้องรับผิดชอบ"}
              </p>
              {canViewAll && (
                <button onClick={() => router.push("/duty-report/report/roster")} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                  ไปตั้งค่าตารางเวร
                </button>
              )}
            </div>
          ) : (
            visiblePoints.map((p) =>
              p.slots.length === 0 ? null : (
                <div key={p.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-extrabold text-slate-800">
                      <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-xs text-indigo-600">{p.point_number}</span>
                      {p.title}
                      {p.latitude != null && p.longitude != null ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500"><MapPin className="h-3 w-3" /> ตั้งพิกัดแล้ว</span>
                      ) : (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-300"><MapPin className="h-3 w-3" /> ยังไม่ตั้งพิกัด</span>
                      )}
                    </p>
                    {canManageDuty && (
                      <button onClick={() => setGpsPointTarget(p)} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" title="ตั้งพิกัดจุดนี้">
                        <MapPin className="h-3.5 w-3.5" /> ตั้งพิกัด
                      </button>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {p.slots.map((s) => {
                      const done = s.log?.status === "done";
                      const names = s.assignments.map((a) => teacherName(a.teacher)).filter(Boolean).join(", ");
                      const gpsStatus = s.log?.gps_status as string | undefined;
                      return (
                        <div key={s.id} className={`flex flex-col gap-2 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${done ? "bg-emerald-50" : "bg-slate-50"}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-500">{timeShort(s.start_time)} - {timeShort(s.end_time)} น.</p>
                            <p className="truncate text-sm text-slate-700">{names || "ยังไม่มีผู้รับผิดชอบ"}</p>
                            {done && (
                              <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                                ✓ {s.log?.signer ? teacherName(s.log.signer) : ""} เซ็นแล้ว เวลา {s.log?.signed_at ? new Date(s.log.signed_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : ""} น.
                              </p>
                            )}
                            {done && gpsStatus === "out_of_range" && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-600">
                                <AlertTriangle className="h-3 w-3" /> เช็คอินนอกระยะจุดเวร ({Math.round(s.log?.distance_meters ?? 0)} ม.)
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {done && s.log?.photo_url && (
                              <a
                                href={s.log.photo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-200 hover:bg-indigo-100"
                                title="ดูรูปที่บันทึกไว้บน OneDrive"
                              >
                                <Camera className="h-4.5 w-4.5" />
                              </a>
                            )}
                            <button
                              onClick={() => setSignModalTarget({ point: p, slot: s })}
                              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                                done ? "border-2 border-emerald-300 text-emerald-600 hover:bg-emerald-100" : "bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-sm hover:-translate-y-0.5"
                              }`}
                            >
                              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                              {done ? "แก้ไข" : "เซ็นชื่อ + ถ่ายรูป"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )
          )}
        </div>

                {signModalTarget && (
          <SignModal
            point={signModalTarget.point}
            slot={signModalTarget.slot}
            teachers={teachers}
            myUserId={myUserId}
            canOverrideSigner={canManageDuty || isHeadToday}
            onClose={() => setSignModalTarget(null)}
            onSave={handleSaveSign}
            onUndo={handleUndo}
            onDone={loadAll}
          />
        )}

        {gpsPointTarget && (
          <PointGpsModal
            point={gpsPointTarget}
            onClose={() => setGpsPointTarget(null)}
            onSave={handleSaveGpsPoint}
          />
        )}
      </div>
    </div>
  );
}

function SignModal({
  point, slot, teachers, myUserId, canOverrideSigner, onClose, onSave, onUndo, onDone,
}: {
  point: PointView; slot: SlotView; teachers: Teacher[];
  myUserId: string;
  canOverrideSigner: boolean;
  onClose: () => void;
  onSave: (point: PointView, slot: SlotView, signerId: string, photoFile: File | null, note: string, existingPhotoUrl: string | null, gps: GpsResult | null) => Promise<void>;
  onUndo: (slot: SlotView) => Promise<void>;
  onDone: () => void;
}) {
  const assignedIds = new Set(slot.assignments.map((a) => a.teacher_id));
  // ★ ค่าเริ่มต้น: ถ้าเคยเซ็นแล้วใช้คนเดิม, ไม่งั้น auto-fill เป็นคนที่ล็อกอินอยู่, ถ้าไม่มีค่อย fallback ไปคนแรกที่ถูกมอบหมาย
  const [signerId, setSignerId] = useState(slot.log?.signed_by ?? myUserId ?? slot.assignments[0]?.teacher_id ?? "");
  const myTeacher = teachers.find((t) => t.id === myUserId) ?? slot.assignments.find((a) => a.teacher_id === myUserId)?.teacher ?? null;
  const [note, setNote] = useState(slot.log?.note ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(slot.log?.photo_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ★ ดึงตำแหน่ง GPS ทันทีที่เปิด modal แล้วเทียบระยะกับพิกัดจุดเวร
  const [gps, setGps] = useState<GpsResult | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState("");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        let distance: number | null = null;
        let status: GpsResult["status"] = "unavailable";
        if (point.latitude != null && point.longitude != null) {
          distance = haversineMeters(latitude, longitude, point.latitude, point.longitude);
          const radius = point.radius_meters ?? 50;
          status = distance <= radius ? "in_range" : "out_of_range";
        } else {
          status = "no_point_coords";
        }
        setGps({ lat: latitude, lng: longitude, accuracy, distance, status });
        setGpsLoading(false);
      },
      (err) => { setGpsError("ไม่สามารถดึงตำแหน่งได้: " + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, [point.latitude, point.longitude, point.radius_meters]);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submit() {
    if (!signerId) { setError("กรุณาเลือกผู้เซ็นชื่อ"); return; }
    if (!photoFile && !slot.log?.photo_url) { setError("กรุณาแนบรูปถ่ายหน้างาน"); return; }
    setSaving(true); setError("");
    try {
      await onSave(point, slot, signerId, photoFile, note, slot.log?.photo_url ?? null, gps);
      onDone(); onClose();
    } catch (e: any) {
      setError(e.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-slate-800">เซ็นชื่อปฏิบัติหน้าที่เวร</p>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <p className="mt-1 text-xs text-slate-400">{timeShort(slot.start_time)} - {timeShort(slot.end_time)} น.</p>

        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

        {/* สถานะ GPS */}
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="text-xs">
            {gpsLoading && <span className="text-slate-500">กำลังตรวจสอบตำแหน่งของคุณ...</span>}
            {!gpsLoading && gpsError && <span className="font-semibold text-amber-600">{gpsError}</span>}
            {!gpsLoading && !gpsError && gps?.status === "in_range" && (
              <span className="font-semibold text-emerald-600">อยู่ในระยะจุดเวร (ห่างประมาณ {Math.round(gps.distance ?? 0)} ม.)</span>
            )}
            {!gpsLoading && !gpsError && gps?.status === "out_of_range" && (
              <span className="font-semibold text-amber-600">อยู่นอกระยะจุดเวร (ห่างประมาณ {Math.round(gps.distance ?? 0)} ม.) ระบบจะบันทึกไว้ให้ผู้บริหารตรวจสอบ</span>
            )}
            {!gpsLoading && !gpsError && gps?.status === "no_point_coords" && (
              <span className="text-slate-400">ยังไม่ได้ตั้งพิกัดจุดนี้ ระบบจะบันทึกเฉพาะตำแหน่งของคุณไว้เฉยๆ</span>
            )}
          </div>
        </div>

                <div className="mt-4">
          <label className="text-xs font-bold text-slate-500">ผู้เซ็นชื่อ</label>
          {canOverrideSigner ? (
            <select value={signerId} onChange={(e) => setSignerId(e.target.value)} className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm">
              <option value="">-- เลือกครูผู้เซ็นชื่อ --</option>
              {slot.assignments.length > 0 && (
                <optgroup label="ผู้ถูกมอบหมายจุดนี้">
                  {slot.assignments.map((a) => (
                    <option key={a.teacher_id} value={a.teacher_id}>{teacherName(a.teacher)}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="ครูท่านอื่น (กรณีสับเปลี่ยน)">
                {teachers.filter((t) => !assignedIds.has(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{teacherName(t)}</option>
                ))}
              </optgroup>
            </select>
          ) : (
            <div className="mt-1 flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {myTeacher ? teacherName(myTeacher) : "ไม่พบชื่อผู้ใช้งาน — กรุณาติดต่อแอดมิน"}
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="text-xs font-bold text-slate-500">ถ่ายรูปหน้างาน *</label>
          <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-3 hover:border-indigo-300">
            <Camera className="h-5 w-5 text-indigo-500" />
            <span className="text-sm text-slate-500">แตะเพื่อถ่ายรูป/เลือกรูป</span>
            <input type="file" accept="image/*" capture="environment" onChange={onPickPhoto} className="hidden" />
          </label>
          {photoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="ตัวอย่างรูป" className="mt-2 h-40 w-full rounded-2xl object-cover" />
          )}
        </div>

        <div className="mt-4">
          <label className="text-xs font-bold text-slate-500">หมายเหตุ (ถ้ามี)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm" />
        </div>

        <div className="mt-6 flex gap-2">
          {slot.log && (
            <button onClick={() => { onUndo(slot); onClose(); }} className="rounded-xl border-2 border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50">
              ยกเลิกบันทึก
            </button>
          )}
          <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ★ โมดัลให้แอดมิน/ผู้บริหาร "ตั้งพิกัด" จุดเวร — ยืนที่จุดจริงแล้วกดใช้ตำแหน่งปัจจุบัน
function PointGpsModal({
  point, onClose, onSave,
}: {
  point: PointView;
  onClose: () => void;
  onSave: (pointId: string, latitude: number, longitude: number, radius: number) => Promise<void>;
}) {
  const [lat, setLat] = useState<number | null>(point.latitude ?? null);
  const [lng, setLng] = useState<number | null>(point.longitude ?? null);
  const [radius, setRadius] = useState<number>(point.radius_meters ?? 50);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) { setError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง"); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocating(false); },
      (err) => { setError("ดึงตำแหน่งไม่สำเร็จ: " + err.message); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function submit() {
    if (lat == null || lng == null) { setError("กรุณาดึงตำแหน่งปัจจุบัน หรือกรอกพิกัดก่อน"); return; }
    setSaving(true); setError("");
    try {
      await onSave(point.id, lat, lng, radius);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-slate-800">ตั้งพิกัดจุดเวร: {point.title}</p>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <p className="mt-1 text-xs text-slate-400">ยืนอยู่ที่จุดเวรจริง แล้วกดปุ่มด้านล่างเพื่อบันทึกพิกัด</p>

        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

        <button onClick={useCurrentLocation} disabled={locating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50">
          <Navigation className="h-4 w-4" /> {locating ? "กำลังดึงตำแหน่ง..." : "ใช้ตำแหน่งปัจจุบันของฉัน"}
        </button>

        {lat != null && lng != null && (
          <p className="mt-2 text-center text-xs text-slate-500">พิกัด: {lat.toFixed(6)}, {lng.toFixed(6)}</p>
        )}

        <div className="mt-4">
          <label className="text-xs font-bold text-slate-500">รัศมีที่ยอมรับได้ (เมตร)</label>
          <input
            type="number" min={10} max={500} value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <button onClick={submit} disabled={saving} className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">
          {saving ? "กำลังบันทึก..." : "บันทึกพิกัด"}
        </button>
      </div>
    </div>
  );
}