// path: lib/visitors/guard-auth.ts
// อนุญาต 2 แบบ: (1) รปภ. ส่งหัว x-guard-key (PIN ไม่ต้อง login)  (2) ผู้ใช้ที่ล็อกอิน
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/parcels/server";

function keyOk(given: string | null) {
  // ★ ใช้ชื่อ env เดียวกับที่ app/api/visitors/guard/route.ts ใช้เช็ก x-guard-key (ถ้าไม่ใช่ GUARD_KEY ให้แก้ตรงนี้)
  const expected = process.env.GUARD_KEY ?? process.env.GUARD_PIN ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** คืน { id } (id = users.id ถ้าล็อกอิน, null ถ้าเป็น รปภ. ที่ใช้ PIN) หรือ null ถ้าไม่มีสิทธิ์ */
export async function guardOrUser(req: Request): Promise<{ id: string | null } | null> {
  if (keyOk(req.headers.get("x-guard-key"))) return { id: null };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: me } = await adminDb().from("users").select("id").eq("auth_id", user.id).maybeSingle();
  return me ? { id: me.id } : null;
}