"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home, ArrowLeft, Calendar, Camera, CheckCircle2, Circle, X,
  Settings2, CalendarRange, ShieldCheck, Users, AlertTriangle,
} from "lucide-react";
import {
  THAI_DOW, jsDateToDow, todayISO, formatThaiDateFull, timeShort, teacherName,
  Teacher, DutyPoint, DutyTimeSlot, DutyAssignment, DutyLog, HeadSetting,
} from "@/lib/duty-helpers";
import { isExcludedTeacher } from "@/lib/duty-helpers";

const supabase = createClient();
const DASHBOARD_PATH = "/duty-report";

type SlotView = DutyTimeSlot & { assignments: (DutyAssignment & { teacher?: Teacher })[]; log?: DutyLog & { signer?: Teacher } };
type PointView = DutyPoint & { slots: SlotView[] };

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

  const [myRole, setMyRole] = useState<string>("");
const [myEmail, setMyEmail] = useState<string>("");

useEffect(() => {
  supabase.auth.getUser().then(async ({ data }) => {
    const user = data.user;
    if (!user) return;
    const { data: profile } = await supabase
      .from("users").select("role, email").eq("auth_id", user.id).maybeSingle();
    if (profile) { setMyRole(profile.role ?? ""); setMyEmail(profile.email ?? ""); }
  });
}, []);

const canManageDuty = useMemo(() => {
  return (
    ["admin", "director", "deputy_director", "admin_general"].includes(myRole) ||
    myEmail === "chanidapa@khienkhet.ac.th"
  );
}, [myRole, myEmail]);

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

  // จุดเวร + ช่วงเวลาของวันนี้ (ไม่ embed assignments แล้ว)
  const { data: pointRows, error: pointErr } = await supabase
    .from("duty_points")
    .select(
  "id, point_number, title, location_note, sort_order, slots:duty_time_slots(id, duty_point_id, day_of_week, start_time, end_time, slot_label, sort_order, assignments:duty_slot_assignments(id, time_slot_id, teacher_id, sort_order, teacher:users(id, title, first_name, last_name)))"
)
    .order("sort_order");

  if (pointErr) {
    setErrorMsg("โหลดข้อมูลจุดเวรไม่สำเร็จ: " + pointErr.message);
    setLoading(false);
    return;
  }

  // แยกดึงครูเวรของวันที่เลือก (เช้า/บ่าย ต่อจุดเวร) — คนละ query เพราะไม่มี FK เชื่อมกับ time_slots
  const pointIds = (pointRows ?? []).map((p: any) => p.id);
  let assignmentByPoint = new Map<string, { morning: string[]; afternoon: string[] }>();
  if (pointIds.length > 0) {
    const { data: assignRows, error: assignErr } = await supabase
      .from("duty_assignments")
      .select("duty_point_id, morning_teachers, afternoon_teachers")
      .eq("duty_date", date)
      .in("duty_point_id", pointIds);
    if (assignErr) console.warn("[duty-report] โหลดผู้รับผิดชอบไม่สำเร็จ:", assignErr.message);
    (assignRows ?? []).forEach((r: any) => {
      assignmentByPoint.set(r.duty_point_id, {
        morning: r.morning_teachers ?? [],
        afternoon: r.afternoon_teachers ?? [],
      });
    });
  }

  // ดึงชื่อครูทั้งหมดที่ถูกอ้างถึง มาแปะให้ id -> full_name
  const allTeacherIds = new Set<string>();
  assignmentByPoint.forEach((v) => { v.morning.forEach((id) => allTeacherIds.add(id)); v.afternoon.forEach((id) => allTeacherIds.add(id)); });
  let teacherNameMap = new Map<string, string>();
  if (allTeacherIds.size > 0) {
    const { data: teacherRows } = await supabase
      .from("users").select("id, full_name").in("id", Array.from(allTeacherIds));
    (teacherRows ?? []).forEach((t: any) => teacherNameMap.set(t.id, t.full_name));
  }

  const AFTERNOON_CUTOFF = "13:00:00"; // ★ เส้นแบ่งเช้า/บ่าย

  const slotIds: string[] = [];
  const built: PointView[] = (pointRows ?? []).map((p: any) => {
    const assign = assignmentByPoint.get(p.id) ?? { morning: [], afternoon: [] };
    const slots: SlotView[] = (p.slots ?? [])
      .filter((s: any) => s.day_of_week === dow)
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((s: any) => {
        slotIds.push(s.id);
        const isAfternoon = s.start_time >= AFTERNOON_CUTOFF;
        const teacherIds = isAfternoon ? assign.afternoon : assign.morning;
        const assignments = teacherIds.map((tid: string) => ({
          id: tid, time_slot_id: s.id, teacher_id: tid,
          teacher: { id: tid, full_name: teacherNameMap.get(tid) ?? "ไม่ทราบชื่อ" },
        }));
        return { ...s, assignments };
      });
    return { id: p.id, point_number: p.point_number, title: p.title, location_note: p.location_note, sort_order: p.sort_order, slots };
  });

  // บันทึกการเซ็น/ถ่ายรูป (เหมือนเดิม ไม่เปลี่ยน)
  let logs: any[] = [];
  if (slotIds.length > 0) {
    const { data: logData, error: logErr } = await supabase
      .from("duty_daily_logs")
      .select("id, log_date, time_slot_id, status, signed_by, signed_at, photo_url, note, signer:users!duty_daily_logs_signed_by_fkey(id, title, first_name, last_name)")
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

  const totalSlots = points.reduce((sum, p) => sum + p.slots.length, 0);
  const doneSlots = points.reduce((sum, p) => sum + p.slots.filter((s) => s.log?.status === "done").length, 0);

  async function handleSaveSign(point: PointView, slot: SlotView, signerId: string, photoFile: File | null, note: string, existingPhotoUrl: string | null) {
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
    { log_date: date, time_slot_id: slot.id, status: "done", signed_by: signerId, signed_at: new Date().toISOString(), photo_url, note: note || null },
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
          ) : points.every((p) => p.slots.length === 0) ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-500">ยังไม่มีตารางเวรสำหรับวัน{THAI_DOW[dow]}</p>
              <button onClick={() => router.push("/duty-report/report/roster")} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                ไปตั้งค่าตารางเวร
              </button>
            </div>
          ) : (
            points.map((p) =>
              p.slots.length === 0 ? null : (
                <div key={p.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm font-extrabold text-slate-800">
                    <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-xs text-indigo-600">{p.point_number}</span>
                    {p.title}
                  </p>
                  <div className="mt-3 space-y-2">
                    {p.slots.map((s) => {
                      const done = s.log?.status === "done";
                      const names = s.assignments.map((a) => teacherName(a.teacher)).filter(Boolean).join(", ");
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
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {done && s.log?.photo_url && ( <a
  
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
    onClose={() => setSignModalTarget(null)}
    onSave={handleSaveSign}
    onUndo={handleUndo}
    onDone={loadAll}
  />
)}
      </div>
    </div>
  );
}

function SignModal({
  point, slot, teachers, onClose, onSave, onUndo, onDone,
}: {
  point: PointView; slot: SlotView; teachers: Teacher[];
  onClose: () => void;
  onSave: (point: PointView, slot: SlotView, signerId: string, photoFile: File | null, note: string, existingPhotoUrl: string | null) => Promise<void>;
  onUndo: (slot: SlotView) => Promise<void>;
  onDone: () => void;
}) {
  const assignedIds = new Set(slot.assignments.map((a) => a.teacher_id));
  const [signerId, setSignerId] = useState(slot.log?.signed_by ?? slot.assignments[0]?.teacher_id ?? "");
  const [note, setNote] = useState(slot.log?.note ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(slot.log?.photo_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      await onSave(point, slot, signerId, photoFile, note, slot.log?.photo_url ?? null);
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

        <div className="mt-4">
          <label className="text-xs font-bold text-slate-500">ผู้เซ็นชื่อ</label>
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