// ══════════════════════════════════════════════════════════
// app/api/resolve-onedrive/route.ts
// ══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";

const TENANT_ID  = process.env.MICROSOFT_TENANT_ID!;
const CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SEC = process.env.MICROSOFT_CLIENT_SECRET!;
const TARGET_UPN = process.env.MICROSOFT_TARGET_EMAIL!;

// ── Cache access token ไว้ในหน่วยความจำ server กันขอใหม่ถี่เกินไปจน Azure AD บล็อก (429) ──
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  // เผื่อเวลา 60 วิ ก่อนหมดอายุจริง กันขอบเวลาเฉียดฉิว
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

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

  if (!res.ok || !json.access_token) {
    console.error("getAccessToken failed:", res.status, json);
    cachedToken = null;
    throw new Error(`ไม่สามารถขอ access token ได้: ${json.error_description ?? res.status}`);
  }

  // expires_in มีหน่วยเป็นวินาที (ปกติ 3600 = 1 ชม.)
  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

async function resolveOne(token: string, path: string): Promise<string | null> {
  try {
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/root:/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?select=id,name,webUrl,@microsoft.graph.downloadUrl`;
    const res = await fetch(graphUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`resolveOne failed [${res.status}] path="${path}":`, errBody);
      return null;
    }
    const data = await res.json();
    return data["@microsoft.graph.downloadUrl"] ?? null;
  } catch (err) {
    console.error(`resolveOne exception path="${path}":`, err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { path, paths, itemId } = await req.json();

    // ── โหมด batch: resolve หลาย path พร้อมกัน (ใช้กับรูป PLC สูงสุด 4 รูป) ──
    if (Array.isArray(paths)) {
      const token = await getAccessToken();
      const downloadUrls = await Promise.all(
        paths.map((p: string | null) => (p ? resolveOne(token, p) : Promise.resolve(null)))
      );
      return NextResponse.json({ ok: true, downloadUrls });
    }

    // ── โหมดเดี่ยว: resolve path เดียว (ใช้กับเอกสารแนบใบลา) ──
    if (!path && !itemId) {
      return NextResponse.json({ ok: false, error: "No path, paths, or itemId provided" }, { status: 400 });
    }

    const token = await getAccessToken();

    if (itemId) {
      const graphUrl = `https://graph.microsoft.com/v1.0/users/${TARGET_UPN}/drive/items/${itemId}?select=id,name,webUrl,@microsoft.graph.downloadUrl`;
      const res = await fetch(graphUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("resolve-onedrive itemId failed:", res.status, err);
        return NextResponse.json({ ok: false, error: err }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json({
        ok: true, itemId: data.id,
        downloadUrl: data["@microsoft.graph.downloadUrl"],
        webUrl: data.webUrl, name: data.name,
      });
    }

    const downloadUrl = await resolveOne(token, path);
    return NextResponse.json({ ok: !!downloadUrl, downloadUrl });
  } catch (e: any) {
    console.error("resolve-onedrive error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}