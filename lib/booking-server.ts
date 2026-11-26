import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

// ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น — ต้องตั้ง SUPABASE_SERVICE_ROLE_KEY ใน .env (ชุดเดียวกับ route ระบบลา)
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// ตรวจ Bearer token จาก session ของผู้ใช้ (รูปแบบเดียวกับ /api/leave-notify)
export async function requireUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin.from("users").select("id,email,role").eq("auth_id", data.user.id).maybeSingle();
  return profile ?? null;
}

export const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://system.khienkhet.ac.th";
