import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const HR_UPN = "hr@khienkhet.ac.th";
const ADMIN_EMAIL = "admin@khienkhet.ac.th";

async function getGraphToken(): Promise<string> {
  // ★ คัดลอกวิธีขอ token จาก /api/upload-onedrive (client credentials)
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  return (await res.json()).access_token;
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export async function POST(req: NextRequest) {
  // อนุญาตเฉพาะ super admin
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await sb.auth.getUser(token);
  if (user?.email?.toLowerCase() !== ADMIN_EMAIL) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { folder, extension } = await req.json();           // เช่น { folder: "ใบลา", extension: ".html" }
  if (!folder || !extension) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });

  const gt = await getGraphToken();
  const base = `https://graph.microsoft.com/v1.0/users/${HR_UPN}/drive/root:/Documents/${enc(folder)}`;
 let url: string | null = `${base}:/children?$select=id,name&$top=200`;
  let deleted = 0; const failed: string[] = [];

  while (url) {
  const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${gt}` } });
  if (r.status === 404) break;
  const j: any = await r.json();
    for (const it of j.value ?? []) {
      if (!String(it.name).toLowerCase().endsWith(String(extension).toLowerCase())) continue;
      const d = await fetch(`https://graph.microsoft.com/v1.0/users/${HR_UPN}/drive/items/${it.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${gt}` },
      });
      if (d.ok || d.status === 204) deleted++; else failed.push(it.name);
    }
    url = (j["@odata.nextLink"] as string | undefined) ?? null;
}
  return NextResponse.json({ ok: failed.length === 0, deleted, failed });
}