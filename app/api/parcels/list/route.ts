// path: app/api/parcels/list/route.ts — รายการของฝาก 7 วันล่าสุดสำหรับหน้าแดชบอร์ด (รูปเห็นเฉพาะแอดมิน)
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/visitor-server";
import { getMe } from "@/lib/visitors/admin-auth";

export async function GET(req: Request) {
  const me = await getMe(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isAdmin = me.role === "admin";

  const db = adminClient();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await db.from("parcels")
    .select("id, created_at, student_name, classroom_label, description, sender_name, status, picked_up_at, notified_at, notify_error, photo_path")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(50);
  const rows = data ?? [];

  // ลิงก์รูปสร้างเฉพาะแอดมิน — คนอื่นไม่ได้ลิงก์ไปเลย (ไม่ใช่แค่ซ่อนใน UI)
  let urls: any[] = [];
  if (isAdmin && rows.length) {
    const r = await db.storage.from("parcels").createSignedUrls(rows.map((x: any) => x.photo_path), 600);
    urls = r.data ?? [];
  }
  return NextResponse.json({
    is_admin: isAdmin,
    parcels: rows.map(({ photo_path, ...r }: any, i: number) => ({ ...r, photo_url: isAdmin ? urls[i]?.signedUrl ?? null : null })),
  });
}