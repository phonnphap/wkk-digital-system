// app/admin/holidays/page.tsx
//
// ⚠️ สมมติฐานเรื่องฐานข้อมูล (โปรดตรวจสอบ/ปรับให้ตรงกับสคีมาจริงของคุณ):
//   - ตาราง "holidays": id (uuid, default gen_random_uuid()), holiday_date (date, UNIQUE),
//     name (text), holiday_type (text: 'national' | 'school' | 'term_break'), note (text, nullable),
//     created_at (timestamptz, default now())
//     ★ แนะนำให้ตั้ง UNIQUE constraint ที่ holiday_date เพื่อกันวันซ้ำ (ใช้ upsert ด้านล่างนี้)
//   - role admin/director/deputy_director มีสิทธิ์ SELECT/INSERT/DELETE ผ่าน RLS policy
//
//   🔗 หน้านี้คือ "แหล่งข้อมูลกลาง" ของวันหยุด — ระบบอื่นควรอ้างอิงตาราง holidays เดียวกันนี้ ได้แก่:
//     1) บันทึกเช็คชื่อ นร. (/attendance)        -> เช็คว่า attendance_date อยู่ใน holidays หรือไม่ ก่อนอนุญาตให้บันทึก/เตือนครู
//     2) บันทึกเช็คชื่อรายคาบ (period attendance) -> เช็คแบบเดียวกันก่อนเปิดให้เช็คชื่อรายคาบของวันนั้น
//     3) ประวัติแสกนนิ้วครู (fingerprint history)  -> ใช้ marker วันหยุดเพื่อไม่ต้องนับวันหยุดเป็น "ขาดสแกน"
//     4) สถิติมาเรียน (/admin/attendance-overview) -> ปัจจุบันคำนวณเฉพาะวันที่มี record จริงอยู่แล้ว
//        จึงไม่ถูกกระทบจากวันหยุดโดยอัตโนมัติ แต่ถ้าต้องการ "ไฮไลต์วันหยุด" ในกราฟ ให้ join กับตารางนี้เพิ่ม
//     5) ปฏิทินโรงเรียน (school calendar)          -> ดึงรายการจากตาราง holidays มาแสดงเป็นอีเวนต์ได้ตรง ๆ
//   ตัวอย่างเงื่อนไขที่ใช้ร่วมกันได้: `supabase.from("holidays").select("holiday_date").eq("holiday_date", date).maybeSingle()`
//
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, CalendarOff, Plus, Trash2, Loader2, CalendarRange } from "lucide-react";

const supabase = createClient();

const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";
const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);

type HolidayType = "national" | "school" | "term_break";
const TYPE_META: Record<HolidayType, { label: string; cls: string }> = {
  national: { label: "วันหยุดราชการ", cls: "bg-rose-50 text-rose-600" },
  school: { label: "วันหยุดของโรงเรียน", cls: "bg-amber-50 text-amber-600" },
  term_break: { label: "ปิดภาคเรียน", cls: "bg-sky-50 text-sky-600" },
};

type HolidayRow = {
  id: string;
  holiday_date: string; // ISO yyyy-mm-dd
  name: string;
  holiday_type: HolidayType;
  note: string | null;
};

const THAI_WEEKDAYS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toBuddhistYear(y: number) { return y + 543; }
function formatThaiDateShort(iso: string) {
  const dt = parseISODateLocal(iso);
  return `วัน${THAI_WEEKDAYS_FULL[dt.getDay()]}ที่ ${dt.getDate()} ${THAI_MONTHS_FULL[dt.getMonth()]} ${toBuddhistYear(dt.getFullYear())}`;
}
function toISO(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
// สร้างรายการวันที่ทั้งหมดตั้งแต่ start ถึง end (รวมปลายทาง) — ใช้ตอนเพิ่มวันหยุดเป็นช่วง เช่น ปิดภาคเรียน
function dateRangeISO(startISO: string, endISO: string): string[] {
  const start = parseISODateLocal(startISO);
  const end = parseISODateLocal(endISO);
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(toISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
function getTodayISO() { return toISO(new Date()); }

export default function HolidaysAdminPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // ฟอร์มเพิ่มวันหยุด
  const [mode, setMode] = useState<"single" | "range">("single");
  const [formDate, setFormDate] = useState(getTodayISO());
  const [formEndDate, setFormEndDate] = useState(getTodayISO());
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<HolidayType>("national");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [yearFilter, setYearFilter] = useState<number | "__all__">(new Date().getFullYear());

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("users").select("role").eq("auth_id", authUser.id).maybeSingle();
      if (profile?.role && ADMIN_ROLES.has(profile.role)) setAllowed(true);
      else router.push(HOMEROOM_PATH);
      setCheckingAuth(false);
    })();
  }, [router]);

  async function loadHolidays() {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase
      .from("holidays")
      .select("id, holiday_date, name, holiday_type, note")
      .order("holiday_date", { ascending: true });
    if (error) {
      console.error(error);
      setErrorMsg(
        "โหลดข้อมูลไม่สำเร็จ — อาจเป็นเพราะยังไม่มีตาราง holidays หรือ RLS policy ยังไม่อนุญาต กรุณาตรวจสอบคอมเมนต์ด้านบนของไฟล์นี้"
      );
      setLoading(false);
      return;
    }
    setHolidays((data ?? []) as HolidayRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!allowed) return;
    loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const years = useMemo(() => {
    const set = new Set(holidays.map((h) => parseISODateLocal(h.holiday_date).getFullYear()));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => a - b);
  }, [holidays]);

  const filteredHolidays = useMemo(() => {
    if (yearFilter === "__all__") return holidays;
    return holidays.filter((h) => parseISODateLocal(h.holiday_date).getFullYear() === yearFilter);
  }, [holidays, yearFilter]);

  // จัดกลุ่มตามเดือนเพื่อแสดงผล
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, HolidayRow[]>();
    filteredHolidays.forEach((h) => {
      const key = h.holiday_date.slice(0, 7); // YYYY-MM
      const arr = map.get(key) ?? [];
      arr.push(h);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredHolidays]);

  async function handleAdd() {
    setFormError("");
    if (!formName.trim()) { setFormError("กรุณาระบุชื่อวันหยุด"); return; }
    if (mode === "range" && formEndDate < formDate) { setFormError("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น"); return; }

    const dates = mode === "single" ? [formDate] : dateRangeISO(formDate, formEndDate);
    if (dates.length > 120) { setFormError("ช่วงวันที่ยาวเกินไป (สูงสุด 120 วันต่อครั้ง)"); return; }

    setSaving(true);
    const rows = dates.map((d) => ({
      holiday_date: d,
      name: formName.trim(),
      holiday_type: formType,
    }));
    // ★ upsert ทับวันที่ซ้ำ (ต้องมี UNIQUE constraint ที่ holiday_date) — ถ้ายังไม่มี ให้เปลี่ยนเป็น .insert(rows) แทน
    const { error } = await supabase.from("holidays").upsert(rows, { onConflict: "holiday_date" });
    setSaving(false);
    if (error) {
      console.error(error);
      setFormError("บันทึกไม่สำเร็จ — ตรวจสอบว่ามีตาราง holidays และ UNIQUE constraint ที่ holiday_date หรือยัง");
      return;
    }
    setFormName("");
    await loadHolidays();
  }

  async function handleDelete(id: string) {
    const prev = holidays;
    setHolidays((cur) => cur.filter((h) => h.id !== id)); // อัปเดต UI ทันที
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) {
      console.error(error);
      setHolidays(prev); // ย้อนกลับถ้าลบไม่สำเร็จ
      setErrorMsg("ลบวันหยุดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!allowed) return null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-amber-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-slate-700 hover:shadow-md">
            <Home className="h-4.5 w-4.5" />
          </button>
          <button onClick={() => router.push(HOMEROOM_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-slate-700 hover:shadow-md">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <CalendarOff className="h-3.5 w-3.5" /> สำหรับผู้ดูแลระบบ
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
            จัดการวันหยุดเรียน
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            เพิ่ม/ลบวันหยุด — ใช้เป็นข้อมูลกลางร่วมกับเช็คชื่อ นร., เช็คชื่อรายคาบ, สแกนนิ้วครู, สถิติมาเรียน และปฏิทินโรงเรียน
          </p>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
          {/* ฟอร์มเพิ่มวันหยุด */}
          <div className="h-fit rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-700">
              <Plus className="h-4 w-4 text-emerald-600" /> เพิ่มวันหยุดใหม่
            </h2>

            <div className="mt-4 inline-flex w-full rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setMode("single")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${mode === "single" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
              >
                วันเดียว
              </button>
              <button
                onClick={() => setMode("range")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${mode === "range" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
              >
                <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> ช่วงวันที่</span>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">{mode === "single" ? "วันที่" : "วันเริ่มต้น"}</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-medium text-slate-700" />
              </div>
              {mode === "range" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">วันสิ้นสุด</label>
                  <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-medium text-slate-700" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ชื่อวันหยุด</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="เช่น วันแม่แห่งชาติ"
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ประเภท</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value as HolidayType)}
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                  {(Object.keys(TYPE_META) as HolidayType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_META[t].label}</option>
                  ))}
                </select>
              </div>

              {formError && <p className="text-xs font-semibold text-rose-600">{formError}</p>}

              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {mode === "single" ? "เพิ่มวันหยุด" : "เพิ่มวันหยุดทั้งช่วง"}
              </button>
            </div>
          </div>

          {/* รายการวันหยุด */}
          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-black text-slate-700">รายการวันหยุดทั้งหมด</h2>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value === "__all__" ? "__all__" : Number(e.target.value))}
                className="rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                <option value="__all__">ทุกปี</option>
                {years.map((y) => (<option key={y} value={y}>ปี {toBuddhistYear(y)}</option>))}
              </select>
            </div>

            {loading ? (
              <p className="py-16 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
            ) : filteredHolidays.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">ยังไม่มีวันหยุดในช่วงที่เลือก</p>
            ) : (
              <div className="max-h-[65vh] divide-y divide-slate-50 overflow-auto">
                {groupedByMonth.map(([monthKey, items]) => {
                  const [y, m] = monthKey.split("-").map(Number);
                  return (
                    <div key={monthKey} className="px-5 py-3">
                      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                        {THAI_MONTHS_FULL[m - 1]} {toBuddhistYear(y)}
                      </p>
                      <div className="space-y-1.5">
                        {items.map((h) => (
                          <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/60 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-700">{h.name}</p>
                              <p className="text-xs text-slate-400">{formatThaiDateShort(h.holiday_date)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${TYPE_META[h.holiday_type]?.cls ?? "bg-slate-100 text-slate-500"}`}>
                                {TYPE_META[h.holiday_type]?.label ?? h.holiday_type}
                              </span>
                              <button
                                onClick={() => handleDelete(h.id)}
                                title="ลบวันหยุดนี้"
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}