// path: lib/visitors/guard-auth.ts
// อนุญาต 2 แบบ: (1) รปภ. ส่งหัว x-guard-key (ตรวจด้วย requireGuard เดิมของระบบ)  (2) ผู้ใช้ที่ล็อกอิน
import { createClient } from "@/lib/supabase/server";
import { adminClient, requireGuard } from "@/lib/visitor-server";

/** คืน { id } (id = users.id ถ้าล็อกอิน, null ถ้าเป็น รปภ. ที่ใช้ PIN) หรือ null ถ้าไม่มีสิทธิ์ */
export async function guardOrUser(req: Request): Promise<{ id: string | null } | null> {
  if (await requireGuard(req)) return { id: null };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: me } = await adminClient().from("users").select("id").eq("auth_id", user.id).maybeSingle();
  return me ? { id: me.id } : null;
}