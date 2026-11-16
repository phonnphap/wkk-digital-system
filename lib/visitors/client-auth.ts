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