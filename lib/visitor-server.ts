// path: lib/visitor-server.ts  (ใช้ฝั่ง server เท่านั้น)
import { createClient } from "@supabase/supabase-js";
import { signAck } from "@/lib/visitors/ackToken";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** ตรวจว่าเป็นผู้ใช้ที่ล็อกอิน (Bearer token) — ถ้าอยากจำกัดเฉพาะ role รปภ. ให้เช็ค role เพิ่มตรงนี้ */
export async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  return error ? null : data.user;
}

function fmtTime(iso?: string | null) {
  return new Date(iso ?? Date.now()).toLocaleString("th-TH", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}

/** ส่งแจ้งเตือน Teams ผ่าน Workflows/Power Automate webhook (TEAMS_VISITOR_WEBHOOK_URL) */
export async function notifyVisitor(visitorId: string): Promise<boolean> {
  const url = process.env.TEAMS_VISITOR_WEBHOOK_URL;
  if (!url) { console.warn("[notifyVisitor] missing TEAMS_VISITOR_WEBHOOK_URL"); return false; }

  const db = adminClient();
  const { data: v } = await db.from("visitors").select("*").eq("id", visitorId).maybeSingle();
  if (!v) return false;

  // หาครูประจำชั้น "ทุกคน" ของห้องที่มาติดต่อ เพื่อ @mention
  const mentions: { name: string; email: string }[] = [];
  if (v.target_classroom_id) {
    const { data: room } = await db.from("classrooms").select("*").eq("id", v.target_classroom_id).maybeSingle();
    const ids = Object.entries(room ?? {})
      .filter(([k, val]) => /^homeroom_teacher.*id/.test(k) && typeof val === "string" && val)
      .map(([, val]) => val as string);
    const uniq = [...new Set(ids)];
    if (uniq.length) {
      const { data: ts } = await db.from("users")
        .select("id,title,first_name,last_name,email").in("id", uniq);
      for (const t of ts ?? []) {
        if (t.email) mentions.push({
          name: `${t.title ?? ""}${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
          email: t.email,
        });
      }
    }
  }

  const facts = [
    { title: "ชื่อ", value: v.full_name ?? "-" },
    { title: "มาติดต่อ", value: v.target_label ?? v.contact_person ?? "-" },
    { title: "เรื่อง", value: v.purpose || "-" },
    { title: "ทะเบียนรถ", value: v.car_plate || "-" },
    { title: "เวลาเข้า", value: fmtTime(v.check_in_at) },
  ];
  const body: any[] = [
    { type: "TextBlock", text: "🚪 มีผู้มาติดต่อที่โรงเรียน", weight: "Bolder", size: "Large", wrap: true },
    { type: "FactSet", facts },
  ];
  if (mentions.length) {
    body.push({
      type: "TextBlock",
      text: `${mentions.map(m => `<at>${m.name}</at>`).join(" ")} กรุณาทราบ`,
      wrap: true,
    });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const ackUrl = `${base}/api/visitors/ack?id=${v.id}&t=${signAck(v.id)}`;

  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        type: "AdaptiveCard", version: "1.4",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        body,
        actions: [{ type: "Action.OpenUrl", title: "✅ รับทราบ", url: ackUrl }],
        msteams: mentions.length ? {
          entities: mentions.map(m => ({
            type: "mention", text: `<at>${m.name}</at>`,
            mentioned: { id: m.email, name: m.name },
          })),
        } : undefined,
      },
    }],
  };

  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) });
    if (!res.ok) { console.warn("[notifyVisitor] HTTP", res.status); return false; }
    await db.from("visitors").update({ notified_at: new Date().toISOString() }).eq("id", visitorId);
    return true;
  } catch (e) { console.warn("[notifyVisitor]", e); return false; }
}