import { NextRequest, NextResponse } from "next/server";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;
const TARGET_UPN = process.env.MICROSOFT_TARGET_EMAIL!;

async function getAccessToken() {
  console.log("TENANT_ID:", TENANT_ID);
  console.log("CLIENT_ID:", CLIENT_ID);
  console.log("CLIENT_SEC exists:", !!CLIENT_SEC);

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
  console.log("Token response:", json);
  return json.access_token as string;
}

// ← มีแค่อันเดียว
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const folder    = formData.get("folder") as string;
    const fileName  = formData.get("fileName") as string;
    const fixedPath = formData.get("path") as string;

    let finalPath = "";
    if (fixedPath) {
      finalPath = fixedPath.split("/").map(encodeURIComponent).join("/");
    } else {
      const targetFolder = folder || "WKK_Repair_System";
      const targetName   = fileName || file.name;
      finalPath = `${encodeURIComponent(targetFolder)}/${encodeURIComponent(targetName)}`;
    }

    console.log("TARGET_UPN:", TARGET_UPN);
    console.log("finalPath:", finalPath);

    const token  = await getAccessToken();
    const buffer = await file.arrayBuffer();

    const uploadUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/root:/${finalPath}:/content`;
    const upRes = await fetch(uploadUrl, {
      method:  "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
    });

    console.log("upRes status:", upRes.status);

    if (!upRes.ok) {
      const err = await upRes.json();
      console.error("Upload failed:", err);
      return NextResponse.json({ ok: false, error: err }, { status: 500 });
    }

    const fileData = await upRes.json();

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

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      webUrl: fileData.webUrl,
      downloadUrl: fileData["@microsoft.graph.downloadUrl"],
    });

  } catch (e: any) {
    console.error("OneDrive upload error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}