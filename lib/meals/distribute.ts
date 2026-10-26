// lib/meals/distribute.ts — จัดแจกอาหาร/นมเพิ่มให้ครบ "จำนวนเต็มห้อง"
//
// กติกา (ต่อวัน):
//  1. k = จำนวนนักเรียนที่ไม่มา (ลา + ขาด) → มีอาหาร/นมเหลือ k ที่
//  2. เรียงนักเรียนที่มา ตามเกณฑ์น้อยไปมาก (อาหาร = น้ำหนัก, นม = ส่วนสูง; ไม่มีข้อมูลไว้ท้ายสุด)
//  3. เอากลุ่มน้ำหนัก/ส่วนสูงน้อย (≥ 1/3 ของคนที่มา และอย่างน้อย 2k คน) เป็น "กลุ่มเป้าหมาย"
//  4. สุ่มเลือก k คนจากกลุ่มเป้าหมาย โดยให้คนที่ได้รับเพิ่มมาน้อยที่สุดในเดือนนี้ก่อน (หมุนเวียนไปเรื่อยๆ)
//  5. ใช้ seed คงที่ (ห้อง+ประเภท+เดือน+วันที่) → ผลเหมือนเดิมทุกครั้งที่คำนวณซ้ำ ไม่สลับคนไปมา

import type { CellStatus } from "./shared";

export type DayInput = { date: string; students: { id: string; status: CellStatus }[] };
/** date → studentId → จำนวนที่ได้เพิ่ม */
export type ExtraPlan = Record<string, Record<string, number>>;

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planExtras(
  days: DayInput[],
  metric: Record<string, number | null | undefined>,
  seedBase: string,
): ExtraPlan {
  const plan: ExtraPlan = {};
  const received: Record<string, number> = {};
  const val = (id: string) => metric[id] ?? 1e9;

  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const present = day.students.filter((s) => s.status === "present");
    const k = day.students.length - present.length;
    plan[day.date] = {};
    if (k <= 0 || present.length === 0) continue;

    const sorted = [...present].sort((a, b) => val(a.id) - val(b.id) || a.id.localeCompare(b.id));
    const poolSize = Math.min(sorted.length, Math.max(k * 2, Math.ceil(sorted.length / 3)));
    const pool = sorted.slice(0, poolSize);
    const rand = mulberry32(hashSeed(`${seedBase}|${day.date}`));

    let remaining = k;
    while (remaining > 0) {
      const order = pool
        .map((s) => ({ id: s.id, r: rand() }))
        .sort((a, b) => (received[a.id] ?? 0) - (received[b.id] ?? 0) || a.r - b.r);
      for (const o of order.slice(0, Math.min(remaining, order.length))) {
        plan[day.date][o.id] = (plan[day.date][o.id] ?? 0) + 1;
        received[o.id] = (received[o.id] ?? 0) + 1;
        remaining--;
      }
    }
  }
  return plan;
}