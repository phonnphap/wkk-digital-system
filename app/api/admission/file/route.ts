// 📁 วางที่: app/api/admission/file/route.ts  [ไฟล์เดิมจากรอบก่อน (ไม่เปลี่ยน)]
import { NextResponse } from "next/server";
import { requireAdmin, graphToken, odUrl } from "@/lib/admission-server";
import { ODRIVE_ROOT } from "@/lib/admission-config";

export const runtime = "nodejs";

/** เจ้าหน้าที่ขอลิงก์ดูไฟล์เอกสารผู้สมัคร (ลิงก์ชั่วคราวจาก OneDrive) */
export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ ok: false, error: "ไม่มีสิทธิ์" }, { status: 401 });
  const { path } = await req.json().catch(() => ({}));
  if (typeof path !== "string" || !path.startsWith(ODRIVE_ROOT + "/") || path.includes(".."))
    return NextResponse.json({ ok: false, error: "path ไม่ถูกต้อง" }, { status: 400 });

  const r = await fetch(odUrl(path), { headers: { Authorization: `Bearer ${await graphToken()}` } });
  const j = await r.json().catch(() => ({}));
  const url = j["@microsoft.graph.downloadUrl"];
  return NextResponse.json(url ? { ok: true, url, name: j.name } : { ok: false, error: "ไม่พบไฟล์" }, { status: url ? 200 : 404 });
}
