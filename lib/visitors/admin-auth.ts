// path: lib/visitors/admin-auth.ts  (ฝั่ง server)
import { adminClient, requireUser } from "@/lib/visitor-server";
import { createClient } from "@/lib/supabase/server";

/** ผู้ใช้ที่ล็อกอิน (รับทั้ง Bearer token และ cookie) พร้อม role จากตาราง users */
export async function getMe(req: Request): Promise<{ id: string; role: string } | null> {
  let authId: string | null = (await requireUser(req))?.id ?? null;
  if (!authId) {
    try {
      const sb = await createClient();
      const { data: { user } } = await sb.auth.getUser();
      authId = user?.id ?? null;
    } catch { /* ไม่มี cookie session */ }
  }
  if (!authId) return null;
  const { data } = await adminClient().from("users").select("id, role").eq("auth_id", authId).maybeSingle();
  return data ? { id: data.id, role: data.role ?? "" } : null;
}