import { NextRequest, NextResponse } from "next/server";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;
const TARGET_UPN = process.env.MICROSOFT_TARGET_EMAIL!; // admin@khienkhet.ac.th

// ใช้ฟังก์ชันดึง Token ร่วมกัน
async function getAccessToken() {
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
  return json.access_token as string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // 🌟 ดึงค่าจากฟอร์มรองรับทั้ง 2 ระบบ (ระบบซ่อมเดิม และ ระบบลาใหม่)
    const folder    = formData.get("folder") as string;
    const fileName  = formData.get("fileName") as string;
    const fixedPath = formData.get("path") as string;

    let finalPath = "";

    // ถ้าระบบลาส่งค่า path ยาวมา เช่น "WKK_Leave_System/2569/ใบลา_xxx.pdf"
    if (fixedPath) {
      finalPath = fixedPath.split("/").map(encodeURIComponent).join("/");
    } else {
      // ถ้าระบบซ่อมเดิมส่งแยกโฟลเดอร์กับชื่อไฟล์มา
      const targetFolder = folder || "WKK_Repair_System";
      const targetName   = fileName || file.name;
      finalPath = `${encodeURIComponent(targetFolder)}/${encodeURIComponent(targetName)}`;
    }

    const token  = await getAccessToken();
    const buffer = await file.arrayBuffer();

    // 1. ส่งคำสั่ง Upload ไฟล์ไปยัง OneDrive
    const uploadUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/root:/${finalPath}:/content`;
    const upRes = await fetch(uploadUrl, {
      method:  "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
    });

    if (!upRes.ok) {
      const err = await upRes.json();
      return NextResponse.json({ ok: false, error: err }, { status: 500 });
    }

    const fileData = await upRes.json();

    // 2. สร้าง Sharing Link สำหรับแชร์ในองค์กร (ตามระบบซ่อมเดิม)
    let publicUrl = fileData.webUrl;
    try {
      const shareRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/items/${fileData.id}/createLink`,
        {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "view", scope: "organization" }),
        }
      );
      if (shareRes.ok) {
        const shareData = await shareRes.json();
        publicUrl = shareData.link?.webUrl ?? fileData.webUrl;
      }
    } catch (shareErr) {
      console.warn("Sharing link creation failed, using webUrl fallback.");
    }

    // 🌟 3. ส่งข้อมูลกลับแบบ Hybrid (ได้ทั้งค่า url เดิม และข้อมูลฝั่งระบบลาใหม่)
    return NextResponse.json({
      ok: true,
      url: publicUrl, // ระบบซ่อมเดิมดึงค่านี่ไปใช้งาน
      webUrl: fileData.webUrl,
      downloadUrl: fileData["@microsoft.graph.downloadUrl"], // ระบบลาใหม่เอาตัวนี้ไปเปิดไฟล์ตรง ๆ
    });

  } catch (e: any) {
    console.error("OneDrive upload error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}