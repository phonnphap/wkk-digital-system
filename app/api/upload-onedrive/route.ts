// app/api/upload-onedrive/route.ts
// อัพโหลดไฟล์ไปยัง OneDrive — ปลายทางขึ้นกับ field "account" ที่ frontend ส่งมา
// ถ้าไม่ส่ง account มา จะ fallback ไปที่ hr@khienkhet.ac.th (ค่า default เดิม)
//
// ตัวอย่างการใช้งานปัจจุบันในระบบ:
// - ระบบลา (เอกสารแนบ + PDF อนุมัติ) → hr@khienkhet.ac.th (ไม่ต้องส่ง account, ใช้ default)
// - ระบบ Event/Calendar (รูปภาพกิจกรรม) → academic@khienkhet.ac.th (ส่ง account มาตรงๆ)

import { NextRequest, NextResponse } from "next/server";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;
// ★ ค่า default เมื่อไม่มีการส่ง account มา — คงไว้ที่ hr ตามระบบลาเดิม
const DEFAULT_TARGET_UPN = process.env.MICROSOFT_HR_EMAIL || "hr@khienkhet.ac.th";

async function getAccessToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SEC,
        scope:         "https://graph.microsoft.com/.default",
      }),
    }
  );
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`Token error: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const fixedPath = formData.get("path") as string | null;
    const folder    = formData.get("folder") as string | null;
    const fileName  = formData.get("fileName") as string | null;

    // ★ อ่าน account ที่ frontend ส่งมา — ถ้าไม่มีให้ fallback เป็น hr (ค่า default เดิม)
    const accountFromForm = formData.get("account") as string | null;
    const TARGET_UPN = accountFromForm?.trim() || DEFAULT_TARGET_UPN;

    // ── สร้าง path ──────────────────────────────────────────────────
    // ถ้าส่ง path มาตรงๆ → ใช้เลย (encode แต่ละ segment)
    // ถ้าไม่มี → ใช้ folder + fileName
    let finalPath: string;
    if (fixedPath) {
      finalPath = fixedPath.split("/").map(encodeURIComponent).join("/");
    } else {
      const targetFolder = folder || "ใบลา_เอกสารแนบ";
      const targetName   = fileName || file.name;
      finalPath = `${encodeURIComponent(targetFolder)}/${encodeURIComponent(targetName)}`;
    }

    console.log("[upload-onedrive] TARGET_UPN:", TARGET_UPN);
    console.log("[upload-onedrive] finalPath:", finalPath);
    console.log("[upload-onedrive] file size:", file.size, "bytes");

    const token  = await getAccessToken();
    const buffer = await file.arrayBuffer();

    // Graph API simple upload (≤4MB)
    const uploadUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/root:/${finalPath}:/content`;
    console.log("[upload-onedrive] uploadUrl:", uploadUrl);

    const upRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
    });

    console.log("[upload-onedrive] status:", upRes.status);

    if (!upRes.ok) {
      const err = await upRes.json().catch(() => ({ message: upRes.statusText }));
      console.error("[upload-onedrive] FAILED:", err);
      return NextResponse.json({ ok: false, error: err }, { status: 500 });
    }

    const fileData = await upRes.json();

    // ★ สร้าง URL ผ่าน proxy ของเราเอง แทน anonymous sharing link
    //    ข้อดี: ใช้ใน <img src> ได้ตรงๆ, ไม่มีวันหมดอายุ, ไม่ต้องเปิด public sharing
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
const proxyUrl = `${baseUrl}/api/onedrive-file?account=${encodeURIComponent(TARGET_UPN)}&itemId=${encodeURIComponent(fileData.id)}`;

return NextResponse.json({
  ok: true,
  url: proxyUrl,
  webUrl: fileData.webUrl,
  itemId: fileData.id,
  account: TARGET_UPN,
});

    // พยายามสร้าง sharing link (ไม่บังคับ)
    let publicUrl: string = fileData.webUrl;
    try {
      const shareRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/items/${fileData.id}/createLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: "view", scope: "anonymous" }),
        }
      );
      if (shareRes.ok) {
        const shareData = await shareRes.json();
        publicUrl = shareData.link?.webUrl ?? fileData.webUrl;
      }
    } catch {
      console.warn("[upload-onedrive] createLink failed, using webUrl");
    }

    return NextResponse.json({
  ok: true,
  url: publicUrl,           // sharing link (anonymous view)
  webUrl: fileData.webUrl,  // SharePoint page
  downloadUrl: fileData["@microsoft.graph.downloadUrl"] ?? publicUrl,
  itemId: fileData.id,
  account: TARGET_UPN,
});
  } catch (e: any) {
    console.error("[upload-onedrive] EXCEPTION:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}