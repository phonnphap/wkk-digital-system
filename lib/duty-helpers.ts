export const THAI_DOW = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
export const WORKING_DOW = [1, 2, 3, 4, 5]; // จันทร์-ศุกร์ (ค่าเริ่มต้นที่แสดงในแท็บ)

export function jsDateToDow(d: Date) {
  const g = d.getDay(); // 0=อาทิตย์
  return g === 0 ? 7 : g;
}

export function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatThaiDateFull(iso: string) {
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const dt = parseISODateLocal(iso);
  const dow = THAI_DOW[jsDateToDow(dt)];
  return `วัน${dow}ที่ ${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}

export function timeShort(t: string) {
  return t?.slice(0, 5) ?? "";
}

export type Teacher = { id: string; title: string | null; first_name: string; last_name: string; role?: string | null };
export function teacherName(t?: Teacher | null) {
  if (!t) return "";
  return `${t.title ?? ""}${t.first_name} ${t.last_name}`.trim();
}
export type DutyPoint = { id: string; point_number: number; title: string; location_note: string | null; sort_order: number };
export type DutyTimeSlot = { id: string; duty_point_id: string; day_of_week: number; start_time: string; end_time: string; slot_label: string | null; sort_order: number };
export type DutyAssignment = { id: string; time_slot_id: string; teacher_id: string; sort_order: number };
export type DutyLog = {
  id: string; log_date: string; time_slot_id: string; status: "pending" | "done";
  signed_by: string | null; signed_at: string | null; photo_url: string | null; note: string | null;
};
export type HeadSetting = { id: string; day_of_week: number; role: "head" | "deputy"; teacher_id: string | null };