// 📁 วางที่: app/api/admission/myfile/route.ts  [ใหม่]
import { NextResponse } from "next/server";
import { db, graphToken, odUrl, limited, clientIp } from "@/lib/admission-server";

export const runtime = "nodejs";

/** ผู้สมัครขอดูไฟล์ของตัวเองที่เคยอัปโหลด (ยืนยันด้วย applicationId + edit_token) → ลิงก์ชั่วคราวจาก OneDrive */
export async function POST(req: Request) {
  if (limited("my:" + clientIp(req), 60)) return NextResponse.json({ ok: false, error: "บ่อยเกินไป" }, { status: 429 });
  const { applicationId, token, docType } = await req.json().catch(() => ({}));
  if (!applicationId || !token || !docType) return NextResponse.json({ ok: false, error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: app } = await db.from("admission_applications").select("id")
    .eq("id", applicationId).eq("edit_token", token).maybeSingle();
  if (!app) return NextResponse.json({ ok: false, error: "ไม่พบใบสมัคร" }, { status: 404 });

  const { data: doc } = await db.from("admission_documents").select("onedrive_path")
    .eq("application_id", applicationId).eq("doc_type", docType).maybeSingle();
  if (!doc?.onedrive_path) return NextResponse.json({ ok: false, error: "ไม่พบไฟล์" }, { status: 404 });

  const r = await fetch(odUrl(doc.onedrive_path), { headers: { Authorization: `Bearer ${await graphToken()}` } });
  const j = await r.json().catch(() => ({}));
  const url = j["@microsoft.graph.downloadUrl"];
  return NextResponse.json(url ? { ok: true, url, name: j.name } : { ok: false, error: "เปิดไฟล์ไม่สำเร็จ" }, { status: url ? 200 : 502 });
}
