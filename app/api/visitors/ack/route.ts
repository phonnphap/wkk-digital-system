// path: app/api/visitors/ack/route.ts
// ครูกด "รับทราบ" ใน Teams -> เปิดหน้านี้ (GET แสดงปุ่มยืนยัน, POST บันทึก)
// ใช้ 2 ขั้นเพื่อกัน Teams/เบราว์เซอร์ prefetch ลิงก์แล้วบันทึกเองโดยไม่ได้กด
import { createClient } from "@supabase/supabase-js";
import { verifyAck } from "@/lib/visitors/ackToken";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f1f5f9;margin:0">
<div style="background:#fff;border-radius:24px;padding:32px;max-width:340px;text-align:center;box-shadow:0 1px 3px #0002">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function params(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const t = u.searchParams.get("t") ?? "";
  return { id, t, ok: !!id && verifyAck(id, t) };
}

export async function GET(req: Request) {
  const { id, ok } = params(req);
  if (!ok) return page("<h2>ลิงก์ไม่ถูกต้อง</h2>", 400);
  const { data: v } = await admin().from("visitors").select("full_name, acknowledged_at").eq("id", id).single();
  if (!v) return page("<h2>ไม่พบข้อมูล</h2>", 404);
  if (v.acknowledged_at) return page(`<div style="font-size:48px">✅</div><h2>รับทราบแล้ว</h2><p>${esc(v.full_name)}</p>`);
  return page(`<div style="font-size:48px">🔔</div><h2>มีผู้มาติดต่อ</h2><p style="font-size:20px;font-weight:700">${esc(v.full_name)}</p>
<form method="post"><button style="width:100%;padding:16px;border:0;border-radius:16px;background:#16a34a;color:#fff;font-size:20px;font-weight:700">✅ รับทราบ</button></form>`);
}

export async function POST(req: Request) {
  const { id, ok } = params(req);
  if (!ok) return page("<h2>ลิงก์ไม่ถูกต้อง</h2>", 400);
  await admin().from("visitors").update({ acknowledged_at: new Date().toISOString() }).eq("id", id).is("acknowledged_at", null);
  return page(`<div style="font-size:48px">✅</div><h2>บันทึกการรับทราบแล้ว</h2><p>ขอบคุณครับ/ค่ะ</p>`);
}