"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();
export const SCHOOL = "โรงเรียนวัดเขียนเขต";
export type Role = "admin" | "executive" | "manager" | "teacher";
export type Asset = {
  id: string; asset_code: string; name: string; category_code: string; location_id: number;
  brand?: string | null; model?: string | null; serial_no?: string | null; acquired_date?: string | null;
  price?: number | null; source?: string | null; status: string; condition: string; note?: string | null; photo_url?: string | null; sticker_attached?: boolean;
  created_at: string; asset_locations?: { name: string; zone: string } | null; asset_categories?: { name: string } | null;
};
export const ASSET_SELECT = "*, asset_locations(name,zone), asset_categories(name)";
export const STATUSES: Record<string, { text: string; cls: string }> = {
  active: { text: "ใช้งานอยู่", cls: "bg-emerald-100 text-emerald-700" },
  broken: { text: "ชำรุดรอซ่อม", cls: "bg-amber-100 text-amber-700" },
  repairing: { text: "ส่งซ่อม", cls: "bg-sky-100 text-sky-700" },
  pending_disposal: { text: "รอจำหน่าย", cls: "bg-orange-100 text-orange-700" },
  disposed: { text: "จำหน่ายแล้ว", cls: "bg-slate-200 text-slate-600" },
  lost: { text: "สูญหาย", cls: "bg-rose-100 text-rose-700" },
};
export const CONDITIONS: Record<string, string> = { good: "ดี", fair: "พอใช้", poor: "ควรปรับปรุง" };
export const ZONES: Record<string, string> = {
  kindergarten: "ระดับอนุบาล", primary: "ระดับประถมศึกษา", secondary: "ระดับมัธยมศึกษา",
  lab: "ห้องปฏิบัติการพิเศษ", office: "สำนักงาน / อาคารสถานที่",
};
export const assetUrl = (id: string) => `${window.location.origin}/assets/${id}`;
export const ROLE_LABEL: Record<Role, string> = { admin: "แอดมิน", executive: "ผู้บริหาร (ดูอย่างเดียว)", manager: "ผู้ดูแลโครงการ", teacher: "ครู" };

export function useAssetRole() {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    supabase.rpc("asset_role").then(({ data }: { data: unknown }) => setRole((data as Role) ?? "teacher"));
  }, []);
  return role;
}
export const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

// ห้องที่ผู้ใช้เป็นครูประจำชั้น (จาก get_my_classrooms ของระบบโฮมรูม)
export const roomKey = (s: string) => s.replace(/\s|ห้อง/g, "");
export function useMyRooms() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data }: { data: { room_name: string }[] | null }) => setNames((data ?? []).map((r) => r.room_name)));
  }, []);
  return names;
}

// ย่อรหัสเป็นช่วง: ขข-04-06-01,02,03,07/69 → "ขข-04-06-01–03, 07/69"
export function codeRanges(codes: string[]): string {
  const g = new Map<string, number[]>(); const w = new Map<string, number>(); const out: string[] = [];
  for (const c of codes) {
    const m = c.match(/^(.*)-(\d+)\/(\d{2})$/);
    if (!m) { out.push(c); continue; }
    const k = `${m[1]}|${m[3]}`; g.set(k, [...(g.get(k) ?? []), Number(m[2])]); w.set(k, Math.max(w.get(k) ?? 0, m[2].length));
  }
  g.forEach((nums, k) => {
    const [pre, fy] = k.split("|"); const pad = (n: number) => String(n).padStart(w.get(k)!, "0");
    nums.sort((a, b) => a - b);
    const parts: string[] = []; let s = nums[0], p = s;
    for (let i = 1; i <= nums.length; i++) {
      if (nums[i] === p + 1) { p = nums[i]; continue; }
      parts.push(s === p ? pad(s) : `${pad(s)}–${pad(p)}`); s = nums[i]; p = nums[i];
    }
    out.push(`${pre}-${parts.join(", ")}/${fy}`);
  });
  return out.join("\n");
}
