// lib/meals/shared.ts  — ใช้ได้ทั้ง client และ server (ห้าม import ฝั่ง server เข้ามา)

export type MealType = "lunch" | "milk";
export type CellStatus = "present" | "leave" | "absent";

export const MEAL_LABEL: Record<MealType, string> = { lunch: "อาหารกลางวัน", milk: "นม" };
export const FORM_TITLE: Record<MealType, string> = {
  lunch: "แบบบันทึกการรับประทานอาหารกลางวันของนักเรียนชั้น",
  milk: "แบบบันทึกการแจกจ่ายอาหารเสริม(นม) ของนักเรียนชั้น",
};
export const SCHOOL_LINE = "โรงเรียนวัดเขียนเขต  สำนักงานเขตพื้นที่การศึกษาประถมศึกษาปทุมธานี  เขต 2";
/** หัวหน้าโครงการ / หัวหน้ากลุ่มงาน (users.id) ที่ลงนามท้ายรายงาน */
export const PROJECT_HEAD_USER_ID = "94e4ee5a-31b2-4d84-bf0c-3ca6ddc4dda7";
export const GROUP_HEAD_USER_ID = "df1ed51c-90c8-4fde-86ea-4478ea671923";
export const PROJECT_HEAD_LABEL: Record<MealType, string> = {
  lunch: "หัวหน้าโครงการอาหารกลางวัน",
  milk: "หัวหน้างานอาหารเสริม(นมโรงเรียน)",
};
export const GROUP_HEAD_LABEL = "หัวหน้างานกลุ่มบริหารทั่วไป";

/** ดูรายงานทุกห้องได้ */
export const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);
/** รับรองรายงานได้ (เจ้าของโครงการอาหาร) — ปรับ role ให้ตรงกับระบบของโรงเรียน */
export const OWNER_ROLES = new Set(["admin", "meal_owner"]);

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// ── วันที่ / เดือน (เขตเวลาไทย) ─────────────────────────────────────────────
export function todayBkk(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
export const currentMonth = () => todayBkk().slice(0, 7);
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const dateOf = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// ── แปลงสถานะจากตารางเช็คชื่อโฮมรูม → มา / ลา / ขาด ───────────────────────────
// ปรับ regex ตามค่าที่ตาราง attendance ของโรงเรียนใช้จริง
export function mapAttendance(raw?: string | null): CellStatus | null {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return null;
  if (/ขาด|absent/.test(s)) return "absent";
  if (/ลา|leave|sick|personal|excused/.test(s)) return "leave";
  if (/present|late|มา|สาย/.test(s)) return "present";
  return null;
}

// ── วันหยุดที่วันที่คงที่ทุกปี (วันหยุดที่เลื่อนตามปี/วันหยุดโรงเรียน ให้เพิ่มในตาราง school_holidays) ──
export const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "วันขึ้นปีใหม่", "04-06": "วันจักรี", "04-13": "วันสงกรานต์", "04-14": "วันสงกรานต์",
  "04-15": "วันสงกรานต์", "05-01": "วันแรงงานแห่งชาติ", "05-04": "วันฉัตรมงคล",
  "06-03": "วันเฉลิมฯ พระราชินี", "07-28": "วันเฉลิมฯ ร.10", "08-12": "วันแม่แห่งชาติ",
  "10-13": "วันนวมินทรมหาราช", "10-23": "วันปิยมหาราช", "12-05": "วันพ่อแห่งชาติ",
  "12-10": "วันรัฐธรรมนูญ", "12-31": "วันสิ้นปี",
};

// ── ระดับชั้น ───────────────────────────────────────────────────────────────
export type LevelKey = "kindergarten" | "primary" | "lower_secondary" | "unknown";
export type GradeInfo = { key: string; label: string; full: string; level: LevelKey; order: number };

export const LEVEL_LABEL: Record<LevelKey, string> = {
  kindergarten: "ระดับอนุบาล",
  primary: "ระดับประถมศึกษา",
  lower_secondary: "ระดับมัธยมศึกษาตอนต้น",
  unknown: "ไม่ระบุระดับ",
};
export const LEVEL_ORDER: LevelKey[] = ["kindergarten", "primary", "lower_secondary", "unknown"];

export const UNKNOWN_GRADE: GradeInfo = { key: "?", label: "ไม่ระบุชั้น", full: "", level: "unknown", order: 99 };

/** อ่านชั้นจากชื่อห้อง เช่น "อ.2/1", "อนุบาล 3/2", "ป.4/1", "ม.1/3" */
export function parseGrade(roomName: string): GradeInfo | null {
  const s = (roomName ?? "").replace(/\s+/g, "");
  let m = s.match(/^(?:อนุบาล|อ)\.?(\d)/);
  if (m) return { key: `K${m[1]}`, label: `อ.${m[1]}`, full: `อนุบาลปีที่ ${m[1]}`, level: "kindergarten", order: Number(m[1]) };
  m = s.match(/^(?:ประถมศึกษาปีที่|ประถม|ป)\.?(\d)/);
  if (m) return { key: `P${m[1]}`, label: `ป.${m[1]}`, full: `ประถมศึกษาปีที่ ${m[1]}`, level: "primary", order: 10 + Number(m[1]) };
  m = s.match(/^(?:มัธยมศึกษาปีที่|มัธยม|ม)\.?(\d)/);
  if (m) return { key: `M${m[1]}`, label: `ม.${m[1]}`, full: `มัธยมศึกษาปีที่ ${m[1]}`, level: "lower_secondary", order: 20 + Number(m[1]) };
  return null;
}
/** ชื่อห้องแบบเต็ม เช่น "ป.5/4" → "ประถมศึกษาปีที่ 5/4" */
export function fullRoomName(roomName: string): string {
  const g = parseGrade(roomName);
  if (!g) return roomName;
  const sub = (roomName ?? "").match(/\/\s*(\d+)/);
  return `${g.full}${sub ? `/${sub[1]}` : ""}`;
}
/** นมมีตั้งแต่ อนุบาล 2 – ป.6 */
export const milkEligible = (g: GradeInfo) => g.level === "kindergarten" || g.level === "primary" || g.level === "unknown";

// ── รูปแบบข้อมูลที่ API ส่งให้หน้าจอ ─────────────────────────────────────────
export type ClassroomLite = { id: string; name: string; milk: boolean };

export type SheetCell = { s: CellStatus; x: number; m: boolean };
export type SheetStudent = {
  id: string;
  no: number | null;
  name: string;
  cells: Record<number, SheetCell>;
  present: number;
  leave: number;
  absent: number;
  extra: number;
  weight: number | null;
  height: number | null;
  signatureUrl: string | null;
};
export type SheetData = {
  classroom: ClassroomLite;
  month: string;
  type: MealType;
  days: number;
  schoolDays: number[];
  /** ป้ายวันที่ไม่ใช่วันเรียน: ชื่อวันหยุด หรือ "วันเสาร์"/"วันอาทิตย์" */
  dayLabels: Record<number, string>;
  /** academic_years.year_name */
  academicYear: string | null;
  milkPack: "ถุง" | "กล่อง";
  /** ผู้ลงนามท้ายรายงาน: ครูที่ปรึกษา (1–2 คน) → หัวหน้าโครงการ → หัวหน้ากลุ่มงาน */
  signers: { role: string; name: string | null; signatureUrl: string | null }[];
  /** ข้อมูลวินิจฉัยการดึงเช็คชื่อ (มีเมื่อสั่ง sync) */
  diag?: { source: string; fetched: number; unmapped: string[] };
  students: SheetStudent[];
  dayTotals: Record<number, { present: number; leave: number; absent: number; extra: number }>;
  editable: boolean;
  me: { id: string; name: string; isOwner: boolean; hasSignature: boolean };
  report: {
    confirmed: boolean;
    confirmedAt: string | null;
    teacherName: string | null;
    teacherSignatureUrl: string | null;
    approved: boolean;
    approvedAt: string | null;
    ownerName: string | null;
    ownerSignatureUrl: string | null;
  };
};

export type ReportRow = {
  key: string;
  label: string;
  classroomId?: string;
  rooms: number;
  headcount: number;
  schoolDays: number;
  present: number;
  leave: number;
  absent: number;
  extras: number;
  rate: number;
  confirmed: number;
  approved: number;
};