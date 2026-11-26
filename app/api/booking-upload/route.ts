import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/booking-server";

// อัปโหลดไฟล์จองห้อง/รถ ขึ้น OneDrive/SharePoint โฟลเดอร์ General (ต้องล็อกอิน)
//   signed          -> General/แบบขอใช้ห้อง/<yyyy-mm>/
//   unsigned        -> General/แบบขอใช้ห้องไม่มีลายเซ็น/<yyyy-mm>/
//   layout          -> General/ผังการจัดห้อง/<yyyy-mm>/
//   vehicle_signed  -> General/แบบขอใช้รถ/<yyyy-mm>/
//   vehicle_unsigned-> General/แบบขอใช้รถไม่มีลายเซ็น/<yyyy-mm>/
// Graph สร้างโฟลเดอร์ที่ยังไม่มีให้อัตโนมัติเมื่ออัปโหลดด้วย path
// ⚠️ getGraphToken เป็นตัวอย่าง client-credentials — ถ้า /api/upload-onedrive ของระบบลามีโค้ดขอ token อยู่แล้วให้ใช้ชุดเดียวกัน
export const runtime = "nodejs";

const FOLDERS = {
  signed: "แบบขอใช้ห้อง",
  unsigned: "แบบขอใช้ห้องไม่มีลายเซ็น",
  layout: "ผังการจัดห้อง",
  vehicle_signed: "แบบขอใช้รถ",
  vehicle_unsigned: "แบบขอใช้รถไม่มีลายเซ็น",
} as const;
const ROOT = process.env.ONEDRIVE_ROOT_FOLDER ?? "General";

async function getGraphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? "ขอ token ไม่สำเร็จ");
  return json.access_token as string;
}
const safe = (s: string) => s.replace(/[\\/:*?"<>|#%]/g, "-").trim().slice(0, 120);

export async function POST(req: NextRequest) {
  try {
    if (!(await requireUser(req))) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    const kind = String(fd.get("kind") ?? "") as keyof typeof FOLDERS;
    const date = String(fd.get("date") ?? "");
    const label = safe(String(fd.get("label") ?? "แบบขอใช้"));
    if (!file) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    if (!(kind in FOLDERS)) return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 4MB" }, { status: 400 });

    const path = [ROOT, FOLDERS[kind], date.slice(0, 7), `${date}_${label}.${kind === "layout" ? "jpg" : "pdf"}`]
      .map((p) => encodeURIComponent(p)).join("/");
    const token = await getGraphToken();
    const up = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${process.env.ONEDRIVE_DRIVE_ID}/root:/${path}:/content?@microsoft.graph.conflictBehavior=replace`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": kind === "layout" ? "image/jpeg" : "application/pdf" }, body: Buffer.from(await file.arrayBuffer()) }
    );
    const json = await up.json();
    if (!up.ok) return NextResponse.json({ error: json?.error?.message ?? "อัปโหลดขึ้น OneDrive ไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ webUrl: json.webUrl as string });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "อัปโหลดไม่สำเร็จ" }, { status: 500 });
  }
}
