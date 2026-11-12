// 📁 วางที่: lib/thai-address.ts  [ใหม่]
"use client";
import { useEffect, useState } from "react";

/** [ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์] — ไฟล์ public/data/thai-address.json (ที่มา: earthchie/jquery.Thailand.js) */
export type AddrRow = [string, string, string, number];

let cache: AddrRow[] | null = null;
let pending: Promise<AddrRow[]> | null = null;

export function loadAddresses(): Promise<AddrRow[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch("/data/thai-address.json").then((r) => r.json()).then((d) => (cache = d));
  return pending;
}

export function useAddresses() {
  const [rows, setRows] = useState<AddrRow[]>(cache ?? []);
  useEffect(() => { if (!cache) loadAddresses().then(setRows); }, []);
  return rows;
}

export type AddrField = "district" | "amphoe" | "province" | "zipcode";
const IDX: Record<AddrField, number> = { district: 0, amphoe: 1, province: 2, zipcode: 3 };

/** ค้นหาตามช่องที่กำลังพิมพ์ — ขึ้นต้นด้วยคำที่พิมพ์ก่อน แล้วค่อยแบบมีคำอยู่ข้างใน */
export function searchAddr(rows: AddrRow[], field: AddrField, q: string, limit = 8): AddrRow[] {
  const t = q.trim().replace(/^(ต\.|อ\.|จ\.|ตำบล|อำเภอ|จังหวัด|แขวง|เขต)\s*/, "");
  if (!t) return [];
  const i = IDX[field];
  const starts: AddrRow[] = [], has: AddrRow[] = [];
  for (const r of rows) {
    const v = String(r[i]);
    if (v.startsWith(t)) starts.push(r);
    else if (field !== "zipcode" && v.includes(t)) has.push(r);
    if (starts.length >= limit) break;
  }
  return [...starts, ...has].slice(0, limit);
}

/** ตรวจว่าชุด ตำบล/อำเภอ/จังหวัด ที่กรอกมีอยู่จริงในฐานข้อมูล */
export const addrExists = (rows: AddrRow[], d: string, a: string, p: string) =>
  rows.some((r) => r[0] === d.trim() && r[1] === a.trim() && r[2] === p.trim());
