import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const LABEL: Record<string, string> = { broken: "ชำรุดรอซ่อม", lost: "สูญหาย", pending_disposal: "รอจำหน่าย" };

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { assetId, status, note } = await req.json();
  if (!token || !LABEL[status]) return NextResponse.json({ skipped: true });

  // ใช้ token ของผู้แจ้ง: ต้องล็อกอินจริง และอ่านครุภัณฑ์ได้ตามสิทธิ์ RLS
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: a } = await sb.from("assets").select("name,asset_code,asset_locations(name)").eq("id", assetId).maybeSingle();
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const room = (a.asset_locations as unknown as { name: string } | null)?.name ?? "-";
  const text = `🔧 ครุภัณฑ์${LABEL[status]}\n${a.name}\nรหัส ${a.asset_code}\nห้อง ${room}${note ? `\nหมายเหตุ: ${note}` : ""}\n${site}/assets/${assetId}`;
  if (!process.env.LINE_CHANNEL_TOKEN || !process.env.LINE_NOTIFY_TO) return NextResponse.json({ skipped: "line not configured" });

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}` },
    body: JSON.stringify({ to: process.env.LINE_NOTIFY_TO, messages: [{ type: "text", text }] }),
  });
  return NextResponse.json({ ok: r.ok });
}
