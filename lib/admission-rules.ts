// 📁 วางที่: lib/admission-rules.ts  [ใหม่]
// กฎตรวจสอบที่ใช้ร่วมกันทั้งหน้าเว็บ (เตือนทันที) และ API (ตรวจซ้ำก่อนบันทึก) — ห้าม import โค้ดฝั่ง server ที่นี่

// ═══ เลขบัตรประชาชน ═══
export function validThaiId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
}
export type IdState = "empty" | "short" | "bad" | "ok";
export const thaiIdState = (v: string): IdState =>
  !v ? "empty" : v.length < 13 ? "short" : validThaiId(v) ? "ok" : "bad";

// ═══ วันที่/อายุ ═══
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const thaiDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${TH_MON[m - 1]} ${y + 543}`;
};

type RoundRule = {
  academic_year: number; min_age?: number | null; max_age?: number | null; age_ref_date?: string | null;
  min_gpa?: number | null; enforce_rules?: boolean;
};

/** วันที่ใช้นับอายุ: ถ้าไม่ได้ตั้งไว้ใช้ 16 พ.ค. ของปีที่เปิดภาคเรียน (พ.ศ. ปีการศึกษา − 543) */
export const ageRefOf = (r: RoundRule) => r.age_ref_date || `${r.academic_year - 543}-05-16`;

export function calcAge(birthISO: string, refISO: string) {
  const [by, bm, bd] = birthISO.split("-").map(Number);
  const [ry, rm, rd] = refISO.split("-").map(Number);
  let months = (ry - by) * 12 + (rm - bm);
  if (rd < bd) months--;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** คืนข้อความเตือน ถ้าอายุไม่ผ่านเกณฑ์ (null = ผ่าน/ไม่มีเกณฑ์) */
export function ageProblem(birthISO: string, r: RoundRule): string | null {
  if (!birthISO || (r.min_age == null && r.max_age == null)) return null;
  const ref = ageRefOf(r);
  const a = calcAge(birthISO, ref);
  const txt = `อายุ ณ วันที่ ${thaiDate(ref)} = ${a.years} ปี ${a.months} เดือน`;
  const exact = a.years + a.months / 12;
  if (r.min_age != null && exact < Number(r.min_age)) return `${txt} — ยังไม่ถึงเกณฑ์ขั้นต่ำ ${r.min_age} ปีบริบูรณ์`;
  if (r.max_age != null && exact >= Number(r.max_age) + 1) return `${txt} — เกินเกณฑ์สูงสุด ${r.max_age} ปี`;
  return null;
}

export function gpaProblem(gpa: string | number, r: RoundRule): string | null {
  if (r.min_gpa == null || gpa === "" || gpa == null) return null;
  const g = Number(gpa);
  if (isNaN(g)) return null;
  return g < Number(r.min_gpa) ? `เกรดเฉลี่ย ${g.toFixed(2)} ต่ำกว่าเกณฑ์ขั้นต่ำ ${Number(r.min_gpa).toFixed(2)}` : null;
}

// ═══ คำนำหน้าชื่อ ═══
const MALE = ["นาย", "ด.ช.", "เด็กชาย", "นพ.", "ทพ.", "สพ.ก.", "ว่าที่ ร.ต.", "ว่าที่ร้อยตรี", "ว่าที่ ร.ท.", "ว่าที่ ร.อ."];
const FEMALE = ["นาง", "นางสาว", "น.ส.", "ด.ญ.", "เด็กหญิง", "พญ.", "ทพญ.", "สพ.ญ.", "ว่าที่ ร.ต.หญิง"];
const NEUTRAL = ["ดร.", "ผศ.", "รศ.", "ศ.", "ผศ.ดร.", "รศ.ดร.", "ศ.ดร.", "ร.ต.", "ร.ท.", "ร.อ.", "พ.ต.", "พ.ท.", "พ.อ.", "พล.ต.", "พล.ท.", "พล.อ.",
  "จ.ส.ต.", "จ.ส.ท.", "จ.ส.อ.", "ส.ต.", "ส.ท.", "ส.อ.", "พ.จ.ต.", "พ.จ.ท.", "พ.จ.อ.", "ด.ต.", "ส.ต.ต.", "ส.ต.ท.", "ส.ต.อ.",
  "ร.ต.ต.", "ร.ต.ท.", "ร.ต.อ.", "พ.ต.ต.", "พ.ต.ท.", "พ.ต.อ.", "พล.ต.ต.", "พล.ต.ท.", "พล.ต.อ.", "ว่าที่", "พระ", "หม่อม", "ม.ร.ว.", "ม.ล.", "คุณ"];
const ALL_TITLES = [...MALE, ...FEMALE, ...NEUTRAL].sort((a, b) => b.length - a.length);

/** แยกคำนำหน้าออกจากชื่อ (ไม่สนช่องว่างหลังคำนำหน้า) */
export function splitTitle(name: string): { title: string | null; rest: string } {
  const n = (name ?? "").trim();
  const t = ALL_TITLES.find((x) => n.startsWith(x));
  return t ? { title: t, rest: n.slice(t.length).trim() } : { title: null, rest: n };
}
const genderOf = (title: string | null): "m" | "f" | null =>
  !title ? null : MALE.includes(title) ? "m" : FEMALE.includes(title) ? "f" : null;

/** ชื่อบิดา/มารดา/ผู้ปกครอง ต้องมีคำนำหน้า และสอดคล้องกับบทบาท */
export function parentNameProblem(name: string, role: "father" | "mother" | "guardian"): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  const { title, rest } = splitTitle(n);
  if (!title) return "ไม่พบคำนำหน้าชื่อ (เช่น นาย นาง นางสาว ดร. ร.ต.อ.) กรุณาพิมพ์คำนำหน้าไว้หน้าชื่อ";
  if (!rest || !rest.includes(" ")) return "กรุณาพิมพ์ ชื่อ และ นามสกุล โดยเว้นวรรคระหว่างกัน";
  const g = genderOf(title);
  if (role === "father" && g === "f") return `คำนำหน้า “${title}” เป็นของผู้หญิง แต่ช่องนี้คือบิดา`;
  if (role === "mother" && g === "m") return `คำนำหน้า “${title}” เป็นของผู้ชาย แต่ช่องนี้คือมารดา`;
  return null;
}

/** คำนำหน้านักเรียน: error = ขัดกับเพศ (ห้ามส่ง) · warn = ไม่ตรงธรรมเนียมของระดับชั้น (เตือน) */
export function studentPrefixProblem(prefix: string, sex: string, level: string): { error?: string; warn?: string } {
  if (!prefix) return {};
  const g = prefix === "เด็กชาย" || prefix === "นาย" ? "m" : "f";
  if (sex && ((sex === "ชาย" && g === "f") || (sex === "หญิง" && g === "m")))
    return { error: `คำนำหน้า “${prefix}” ไม่ตรงกับเพศที่เลือก (${sex})` };
  const child = prefix.startsWith("เด็ก");
  if (level === "m4" && child) return { warn: "นักเรียนระดับ ม.4 มักใช้คำนำหน้า นาย/นางสาว — ตรวจสอบให้ตรงกับสูติบัตร/บัตรประชาชน" };
  if (level !== "m4" && !child) return { warn: "นักเรียนระดับนี้มักใช้คำนำหน้า เด็กชาย/เด็กหญิง — ตรวจสอบให้ตรงกับสูติบัตร" };
  return {};
}

// ═══ เขตพื้นที่บริการ ═══
export type ZoneArea = { province: string; amphoe: string; district: string; village_nos?: string | null };
const norm = (s: string) => (s ?? "").replace(/^(ต\.|อ\.|จ\.|ตำบล|อำเภอ|จังหวัด|แขวง|เขต)\s*/, "").trim();

/** คืน true/false · คืน null เมื่อยังไม่ได้ตั้งเขตพื้นที่ (ไม่ตรวจ) */
export function inZone(addr: { province?: string; amphoe?: string; district?: string; village_no?: string }, areas: ZoneArea[]): boolean | null {
  if (!areas?.length) return null;
  const a = areas.find((z) => norm(z.province) === norm(addr.province ?? "") && norm(z.amphoe) === norm(addr.amphoe ?? "") && norm(z.district) === norm(addr.district ?? ""));
  if (!a) return false;
  const only = (a.village_nos ?? "").split(/[,\s]+/).filter(Boolean);
  if (only.length === 0) return true;
  return only.includes(String(addr.village_no ?? "").trim());
}

// ═══ ผู้ปกครองเสียชีวิต / ติดต่อไม่ได้ ═══
export type ParentStatus = "alive" | "dead" | "lost" | "unknown";
export const PARENT_STATUS: Record<ParentStatus, string> = {
  alive: "ยังมีชีวิต / ติดต่อได้",
  dead: "เสียชีวิต (แนบมรณบัตร)",
  lost: "ติดต่อไม่ได้ / ทอดทิ้ง (แนบทะเบียนราษฎร์)",
  unknown: "ไม่ปรากฏข้อมูล",
};
