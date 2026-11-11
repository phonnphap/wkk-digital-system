"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();
export const SCHOOL = "โรงเรียนวัดเขียนเขต";
export type Role = "admin" | "executive" | "manager" | "teacher";
export type Asset = {
  id: string; asset_code: string; name: string; category_code: string; location_id: number;
  brand?: string | null; model?: string | null; serial_no?: string | null; acquired_date?: string | null;
  price?: number | null; source?: string | null; status: string; condition: string; note?: string | null; photo_url?: string | null;
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
