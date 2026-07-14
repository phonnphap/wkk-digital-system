// app/api/onedrive-file/route.ts
// Proxy ดึงไฟล์จาก OneDrive ผ่าน Graph API แล้ว stream กลับมาตรงๆ
// ใช้แทน anonymous sharing link เพื่อให้ <img src> แสดงผลได้เสมอ ไม่มีวันหมดอายุ

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;

async function getAccessToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SEC,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  const json = await res.json();
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get("account");
    const itemId  = searchParams.get("itemId");

    if (!account || !itemId) {
      return NextResponse.json({ error: "missing account or itemId" }, { status: 400 });
    }

    const token = await getAccessToken();

    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(account)}/drive/items/${encodeURIComponent(itemId)}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!graphRes.ok) {
      console.error("[onedrive-file] graph error", graphRes.status);
      return NextResponse.json({ error: `Graph error ${graphRes.status}` }, { status: graphRes.status });
    }

    const contentType = graphRes.headers.get("content-type") || "application/octet-stream";
    const buffer = await graphRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // cache ยาว เพราะไฟล์เดิมไม่เปลี่ยน (itemId เดิม = ไฟล์เดิมเสมอ)
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e: any) {
    console.error("[onedrive-file] EXCEPTION:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}