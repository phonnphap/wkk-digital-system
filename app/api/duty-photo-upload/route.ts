import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TENANT_ID = process.env.MS_TENANT_ID!;
const CLIENT_ID = process.env.MS_CLIENT_ID!;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET!;
const ONEDRIVE_UPN = process.env.ONEDRIVE_USER_UPN || "general@khienkhet.ac.th";

async function getAccessToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("ขอ access token ไม่สำเร็จ: " + JSON.stringify(data));
  return data.access_token as string;
}

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dayThai = String(formData.get("dayThai") ?? "");
    const date = String(formData.get("date") ?? "");
    const pointLabel = String(formData.get("pointLabel") ?? "จุดเวร");

    if (!file || !dayThai || !date) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบสำหรับอัปโหลด" }, { status: 400 });
    }

    const token = await getAccessToken();
    const buffer = Buffer.from(await file.arrayBuffer());

    const fileName = sanitizeName(`${pointLabel}-${Date.now()}.jpg`);
    const path = `รายงานเวรประจำวัน/${sanitizeName(dayThai)}/${sanitizeName(date)}/${fileName}`;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");

    const uploadRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_UPN}/drive/root:/${encodedPath}:/content`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "image/jpeg" }, body: buffer }
    );
    const uploaded = await uploadRes.json();
    if (!uploadRes.ok) {
      return NextResponse.json({ error: "อัปโหลดขึ้น OneDrive ไม่สำเร็จ: " + JSON.stringify(uploaded) }, { status: 500 });
    }

    // สร้างลิงก์ดูรูป (ใช้ได้เฉพาะคนในองค์กร ไม่ต้องเปิด anonymous share)
    const linkRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_UPN}/drive/items/${uploaded.id}/createLink`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "view", scope: "organization" }) }
    );
    const linkData = await linkRes.json();

    return NextResponse.json({ webUrl: linkRes.ok ? linkData.link.webUrl : uploaded.webUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}