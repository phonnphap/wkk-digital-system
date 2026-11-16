// path: app/api/signature/route.ts — ลายเซนของตัวเอง ใช้ที่เดียวกับระบบลา (users.signature_url เป็น data URL)
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/visitor-server";
import { getMe } from "@/lib/visitors/admin-auth";

const err = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: Request) {
  const me = await getMe(req);
  if (!me) return err("unauthorized", 401);
  const { data: u } = await adminClient().from("users").select("signature_url").eq("id", me.id).maybeSingle();
  if (!u?.signature_url) return NextResponse.json({ has: false });
  return NextResponse.json({ has: true, url: u.signature_url });
}

export async function POST(req: Request) {
  const me = await getMe(req);
  if (!me) return err("unauthorized", 401);

  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return err("ไม่พบไฟล์ลายเซน");
  if (file.size > 1024 * 1024) return err("ไฟล์ใหญ่เกิน 1 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50)) return err("ต้องเป็นไฟล์ PNG");

  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const { error } = await adminClient().from("users").update({ signature_url: dataUrl }).eq("id", me.id);
  if (error) return err("บันทึกไม่สำเร็จ: " + error.message, 500);
  return NextResponse.json({ ok: true });
}