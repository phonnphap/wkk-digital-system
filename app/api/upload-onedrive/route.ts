// app/api/upload-onedrive/route.ts
// อัพโหลดไฟล์ไปยัง OneDrive — ปลายทางขึ้นกับ field "account" ที่ frontend ส่งมา
// ถ้าไม่ส่ง account มา จะ fallback ไปที่ hr@khienkhet.ac.th (ค่า default เดิม)
//
// ตัวอย่างการใช้งานปัจจุบันในระบบ:
// - ระบบลา (เอกสารแนบ + PDF อนุมัติ) → hr@khienkhet.ac.th (ไม่ต้องส่ง account, ใช้ default)
// - ระบบ Event/Calendar (รูปภาพกิจกรรม) → academic@khienkhet.ac.th (ส่ง account มาตรงๆ)
// - ระบบคลังสื่อการสอน → academic@khienkhet.ac.th + ★ teacherFolder mode (โฟลเดอร์ต่อครู + เลขรันต่อเนื่อง)

import { NextRequest, NextResponse } from "next/server";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;
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

// ★ นับจำนวนไฟล์ที่มีอยู่แล้วในโฟลเดอร์ เพื่อคำนวณเลขรันถัดไป
// ถ้าโฟลเดอร์ยังไม่เคยถูกสร้าง (404) ถือว่ามี 0 ไฟล์ ไม่ใช่ error
async function countFilesInFolder(token: string, account: string, folderPath: string): Promise<number> {
  const encodedPath = folderPath.split("/").map(encodeURIComponent).join("/");
  const url = `https://graph.microsoft.com/v1.0/users/${account}/drive/root:/${encodedPath}:/children?$select=name`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return 0; // โฟลเดอร์ยังไม่มี = ยังไม่เคยอัปโหลด
  if (!res.ok) {
    console.warn("[upload-onedrive] countFilesInFolder failed:", res.status);
    return 0; // เผื่อพลาด ให้เริ่มจาก 0 (ดีกว่า block การอัปโหลด)
  }
  const json = await res.json();
  return Array.isArray(json.value) ? json.value.length : 0;
}

function sanitizeSegment(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function thaiDateStamp(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyyBE = d.getFullYear() + 543;
  return `${dd}-${mm}-${yyyyBE}`;
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

    const accountFromForm = formData.get("account") as string | null;
    const TARGET_UPN = accountFromForm?.trim() || DEFAULT_TARGET_UPN;

    // ★ โหมดใหม่: โฟลเดอร์ต่อครู + เลขรันต่อเนื่องอัตโนมัติ
    const teacherFolderBase = formData.get("teacherFolderBase") as string | null; // เช่น "คลังสื่อการสอน"
    const teacherName       = formData.get("teacherName") as string | null;       // ชื่อครูที่อัปโหลด

    const token  = await getAccessToken();
    const buffer = await file.arrayBuffer();

    let finalPath: string;

    if (teacherFolderBase && teacherName) {
      const folderPath = `${sanitizeSegment(teacherFolderBase)}/${sanitizeSegment(teacherName)}`;
      const existingCount = await countFilesInFolder(token, TARGET_UPN, folderPath);
      const seq = String(existingCount + 1).padStart(2, "0");
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const newFileName = `${thaiDateStamp()}_${seq}${ext ? "." + ext : ""}`;
      finalPath = `${folderPath}/${newFileName}`.split("/").map(encodeURIComponent).join("/");
      console.log("[upload-onedrive] teacherFolder mode → seq:", seq, "path:", finalPath);
    } else if (fixedPath) {
      finalPath = fixedPath.split("/").map(encodeURIComponent).join("/");
    } else {
      const targetFolder = folder || "ใบลา_เอกสารแนบ";
      const targetName   = fileName || file.name;
      finalPath = `${encodeURIComponent(targetFolder)}/${encodeURIComponent(targetName)}`;
    }

    console.log("[upload-onedrive] TARGET_UPN:", TARGET_UPN);
    console.log("[upload-onedrive] finalPath:", finalPath);
    console.log("[upload-onedrive] file size:", file.size, "bytes");

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

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
    const proxyUrl = `${baseUrl}/api/onedrive-file?account=${encodeURIComponent(TARGET_UPN)}&itemId=${encodeURIComponent(fileData.id)}`;

    return NextResponse.json({
      ok: true,
      url: proxyUrl,
      webUrl: fileData.webUrl,
      itemId: fileData.id,
      account: TARGET_UPN,
      fileName: fileData.name, // ★ เผื่อ frontend อยากโชว์ชื่อไฟล์จริงที่ตั้งให้ (เช่น "14-07-2569_01.png")
    });
  } catch (e: any) {
    console.error("[upload-onedrive] EXCEPTION:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}