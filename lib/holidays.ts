// lib/holidays.ts
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type HolidayType = "national" | "school" | "term_break";
export type HolidayInfo = { name: string; holiday_type: HolidayType };
export type HolidayMap = Map<string, HolidayInfo>; // key = "YYYY-MM-DD"

/** ดึงวันหยุดทั้งหมดในช่วง [startISO, endISO] แบบ inclusive */
export async function fetchHolidayMap(startISO: string, endISO: string): Promise<HolidayMap> {
  const map: HolidayMap = new Map();
  const { data, error } = await supabase
    .from("holidays")
    .select("holiday_date, name, holiday_type")
    .gte("holiday_date", startISO)
    .lte("holiday_date", endISO);
  if (error || !data) {
    console.error("fetchHolidayMap error:", error);
    return map;
  }
  data.forEach((h: any) => map.set(h.holiday_date, { name: h.name, holiday_type: h.holiday_type }));
  return map;
}

/** เช็คว่าวันนั้นเป็นวันหยุดจาก HolidayMap ที่โหลดไว้แล้วหรือไม่ */
export function isHoliday(dateISO: string, map: HolidayMap): HolidayInfo | null {
  return map.get(dateISO) ?? null;
}

/** ดึงข้อมูลวันหยุดของวันเดียว (ใช้ในหน้าที่ไม่ได้โหลดทั้งเดือนอยู่แล้ว) */
export async function fetchSingleHoliday(dateISO: string): Promise<HolidayInfo | null> {
  const { data } = await supabase
    .from("holidays")
    .select("name, holiday_type")
    .eq("holiday_date", dateISO)
    .maybeSingle();
  return data ? { name: data.name, holiday_type: data.holiday_type } : null;
}