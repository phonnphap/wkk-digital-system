import { NextRequest, NextResponse } from "next/server";

// อัปโหลด PDF แบบขอใช้ห้องประชุมขึ้น OneDrive/SharePoint โฟลเดอร์ General
//   kind=signed   -> General/แบบขอใช้ห้อง/<yyyy-mm>/...
//   kind=unsigned -> General/แบบขอใช้ห้องไม่มีลายเซ็น/<yyyy-mm>/...
// Graph จะสร้างโฟลเดอร์ที่ยังไม่มีให้อัตโนมัติเมื่ออัปโหลดด้วย path
//
// ⚠️ ส่วนขอ token (getGraphToken) เป็นตัวอย่างแบบ client-credentials
//    ถ้า route /api/duty-photo-upload เดิมของคุณมีโค้ดขอ token + drive id อยู่แล้ว
//    ให้ก๊อปส่วนนั้นมาแทนได้เลย (env ด้านล่างเป็นชื่อสมมติ)

export const runtime = "nodejs";

const FOLDERS = {
  signed: "แบบขอใช้ห้อง",
  unsigned: "แบบขอใช้ห้องไม่มีลายเซ็น",
  layout: "ผังการจัดห้อง",           // ภาพผังโต๊ะ/เก้าอี้ที่ผู้ขอแนบ (JPEG)
} as const;
const ROOT = process.env.ONEDRIVE_ROOT_FOLDER ?? "General";

async function getGraphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? "ขอ token ไม่สำเร็จ");
  return json.access_token as string;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|#%]/g, "-").trim();

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    const kind = String(fd.get("kind") ?? "") as keyof typeof FOLDERS;
    const date = String(fd.get("date") ?? ""); // YYYY-MM-DD
    const label = safe(String(fd.get("label") ?? "แบบขอใช้ห้อง"));

    if (!file) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    if (!(kind in FOLDERS)) return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 4MB" }, { status: 400 });

    const path = [ROOT, FOLDERS[kind], date.slice(0, 7), `${date}_${label}.${kind === "layout" ? "jpg" : "pdf"}`]
      .map((p) => encodeURIComponent(p))
      .join("/");

    const token = await getGraphToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${process.env.ONEDRIVE_DRIVE_ID}/root:/${path}:/content?@microsoft.graph.conflictBehavior=replace`;
    const up = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": kind === "layout" ? "image/jpeg" : "application/pdf" },
      body: Buffer.from(await file.arrayBuffer()),
    });
    const json = await up.json();
    if (!up.ok) return NextResponse.json({ error: json?.error?.message ?? "อัปโหลดขึ้น OneDrive ไม่สำเร็จ" }, { status: 500 });

    return NextResponse.json({ webUrl: json.webUrl as string });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "อัปโหลดไม่สำเร็จ" }, { status: 500 });
  }
}