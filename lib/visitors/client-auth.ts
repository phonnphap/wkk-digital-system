// path: lib/visitors/client-auth.ts  (ฝั่ง client)
"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** ใช้ซ่อน/แสดง UI เท่านั้น — การป้องกันจริงอยู่ที่ API (ฝั่ง server เช็ก role เอง) */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("users").select("role").eq("auth_id", data.user.id).maybeSingle();
      setIsAdmin(p?.role === "admin");
    });
  }, []);
  return isAdmin;
}

/** เปิด PDF จาก API ที่ต้องแนบ token (ลิงก์ <a> ธรรมดาส่ง Authorization ไม่ได้) */
export async function openAuthedPdf(url: string) {
  const w = window.open("", "_blank");            // เปิดทันที กัน popup blocker
  try {
    const res = await fetch(url, { headers: await authHeaders() });
    if (!res.ok) { w?.close(); alert("เปิดไฟล์ไม่สำเร็จ: " + (await res.text().catch(() => res.status))); return; }
    const blobUrl = URL.createObjectURL(await res.blob());
    if (w) w.location.href = blobUrl; else window.location.href = blobUrl;
  } catch (e: any) { w?.close(); alert("เปิดไฟล์ไม่สำเร็จ: " + (e?.message ?? e)); }
}