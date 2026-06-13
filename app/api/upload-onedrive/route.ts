import { NextRequest, NextResponse } from "next/server";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;
const TARGET_UPN = process.env.MICROSOFT_TARGET_EMAIL!; // admin@khienkhet.ac.th

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
    const folder   = (formData.get("folder") as string) || "WKK_Repair_System";
    const fileName = (formData.get("fileName") as string) || file.name;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const token   = await getAccessToken();
    const buffer  = await file.arrayBuffer();

    // Upload to OneDrive of admin@khienkhet.ac.th
    const uploadUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/root:/${folder}/${fileName}:/content`;

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
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const fileData = await upRes.json();
    // สร้าง sharing link
    const shareRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/items/${fileData.id}/createLink`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "view", scope: "organization" }),
      }
    );
    const shareData = await shareRes.json();
    const publicUrl = shareData.link?.webUrl ?? fileData.webUrl;

    return NextResponse.json({ url: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}