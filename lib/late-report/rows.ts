// ใช้ร่วมกันได้ทั้ง client และ server (ห้าม import node:*)
export const STAGE = {
  KG: "อนุบาล",
  PRI: "ประถมศึกษา",
  MID: "มัธยมศึกษาตอนต้น",
  HIGH: "มัธยมศึกษาตอนปลาย",
} as const;

// Supabase Storage ไม่รับ key ที่เป็นภาษาไทย → เก็บจริงเป็น prefix อังกฤษ แล้วโชว์ชื่อโฟลเดอร์ไทยใน UI/ชื่อไฟล์ดาวน์โหลด
export const FOLDERS = {
  signed: { label: "รายงานจับสาย", prefix: "signed" },
  unsigned: { label: "รายงานจับสาย_ไม่มีลายเซน", prefix: "unsigned" },
} as const;
export type Variant = keyof typeof FOLDERS;

export type RoomRef = { room_name: string; grade_group: string | null };
export type ReportRow = { label: string; count: number };

export function parseRoomName(roomName: string | null | undefined) {
  if (!roomName) return { level: 999, room: 999 };
  const m = roomName.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return { level: Number(m[1]), room: Number(m[2]) };
  const nums = roomName.match(/\d+/g);
  if (nums && nums.length >= 2) return { level: Number(nums[0]), room: Number(nums[1]) };
  if (nums && nums.length === 1) return { level: Number(nums[0]), room: 0 };
  return { level: 999, room: 999 };
}

/** รวมเป็นตารางใบเดียว: อนุบาลรายห้อง → ป.1-6 → ม.1-3 → ม.4-6 */
export function buildReportRows(allRooms: RoomRef[], late: RoomRef[]) {
  const byRoom = new Map<string, number>();
  late.forEach((l) => byRoom.set(l.room_name, (byRoom.get(l.room_name) ?? 0) + 1));
  const lateIn = (stage: string, pred: (lvl: number) => boolean) =>
    late.filter((l) => l.grade_group === stage && pred(parseRoomName(l.room_name).level)).length;

  const rows: ReportRow[] = [];
  allRooms
    .filter((r) => r.grade_group === STAGE.KG)
    .sort((a, b) => {
      const pa = parseRoomName(a.room_name), pb = parseRoomName(b.room_name);
      return pa.level - pb.level || pa.room - pb.room;
    })
    .forEach((r) => rows.push({ label: r.room_name, count: byRoom.get(r.room_name) ?? 0 }));
  for (let n = 1; n <= 6; n++) rows.push({ label: `ประถมศึกษาปีที่ ${n}`, count: lateIn(STAGE.PRI, (l) => l === n) });
  for (let n = 1; n <= 3; n++) rows.push({ label: `มัธยมศึกษาปีที่ ${n}`, count: lateIn(STAGE.MID, (l) => l === n) });
  rows.push({ label: "มัธยมศึกษาปีที่ 4-6", count: lateIn(STAGE.HIGH, () => true) });

  // กันยอดตกหล่น (เช่นห้องที่ไม่มี grade_group หรือไม่ตรงแถวใด)
  const sum = rows.reduce((s, r) => s + r.count, 0);
  if (sum < late.length) rows.push({ label: "อื่น ๆ (ไม่ระบุชั้น)", count: late.length - sum });

  return { rows, total: rows.reduce((s, r) => s + r.count, 0) };
}

// ★ วันที่ตามเวลาไทย (todayISO เดิมใช้ UTC → ช่วง 00:00–07:00 น. จะได้ "เมื่อวาน")
export function bangkokToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

const MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
export function thaiDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}
export const toThaiDigits = (s: string | number) => String(s).replace(/\d/g, (d) => "๐๑๒๓๔๕๖๗๘๙"[Number(d)]);