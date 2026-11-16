// path: lib/parcel-server.ts  (ฝั่ง server) — แจ้งครูประจำชั้นเรื่องของฝาก ใช้ Flow/Teams + วิธีหาครูเดียวกับ notifyVisitor
import { adminClient, type NotifyResult } from "@/lib/visitor-server";
import { wrapCard, tb, facts } from "@/lib/leave-server";

const dash = (s?: string | null) => (s && s.trim() ? s : "ไม่ระบุ");
const fmtTime = (iso?: string | null) =>
  new Date(iso ?? Date.now()).toLocaleString("th-TH", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });

export async function notifyParcel(parcelId: string): Promise<NotifyResult> {
  const url = process.env.TEAMS_VISITOR_WEBHOOK_URL || process.env.TEAMS_LEAVE_WEBHOOK_URL;
  if (!url) return { ok: false, reason: "ยังไม่ได้ตั้ง TEAMS_VISITOR_WEBHOOK_URL หรือ TEAMS_LEAVE_WEBHOOK_URL" };

  const db = adminClient();
  const { data: p } = await db.from("parcels").select("*").eq("id", parcelId).maybeSingle();
  if (!p) return { ok: false, reason: "ไม่พบรายการฝากของ" };

  // ผู้รับ: ครูประจำชั้นทุกคนของห้อง (วิธีเดียวกับ notifyVisitor)
  const recipients: { name: string; email: string }[] = [];
  const { data: room } = await db.from("classrooms").select("*").eq("id", p.classroom_id).maybeSingle();
  const ids = Object.entries(room ?? {})
    .filter(([k, val]) => /^homeroom_teacher.*id/.test(k) && typeof val === "string" && val)
    .map(([, val]) => val as string);
  const uniq = [...new Set(ids)];
  if (uniq.length) {
    const { data: ts } = await db.from("users").select("id,title,first_name,last_name,email").in("id", uniq);
    for (const t of ts ?? []) if (t.email)
      recipients.push({ name: `${t.title ?? ""}${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(), email: t.email });
  }
  if (recipients.length === 0) {
    (process.env.VISITOR_FALLBACK_EMAILS ?? "").split(",").map(s => s.trim()).filter(Boolean)
      .forEach(e => recipients.push({ name: e, email: e }));
  }
  if (recipients.length === 0)
    return { ok: false, reason: "ไม่พบอีเมลครูประจำชั้น และยังไม่ได้ตั้ง VISITOR_FALLBACK_EMAILS" };

  // รูปของ (ลิงก์ชั่วคราว 7 วัน — bucket ยังเป็น private)
  const { data: signed } = await db.storage.from("parcels").createSignedUrl(p.photo_path, 60 * 60 * 24 * 7);

  const body: any[] = [tb("📦 มีของฝากให้นักเรียน", { weight: "Bolder", size: "Large", color: "Accent" })];
  if (signed?.signedUrl)
    body.push({ type: "Image", url: signed.signedUrl, size: "Large", altText: "รูปของที่ฝาก", horizontalAlignment: "Center" });
  body.push(facts([
    ["นักเรียน", dash(p.student_name)],
    ["ชั้น/ห้อง", dash(p.classroom_label)],
    ["ของที่ฝาก", dash(p.description)],
    ["ผู้ฝาก", dash(p.sender_name)],
    ["เวลารับฝาก", fmtTime(p.created_at)],
  ]));
  body.push(tb("กรุณาให้นักเรียนมารับของที่ป้อม รปภ.", { isSubtle: true, size: "Small" }));
  const card = wrapCard(body, [], "ของฝากนักเรียน · โรงเรียนวัดเขียนเขต");

  const errors = (await Promise.all(recipients.map(async r => {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", to: r.email, card }),
      });
      if (!res.ok) return `${r.email}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 100)}`;
      return null;
    } catch (e: any) { return `${r.email}: ${e.message}`; }
  }))).filter(Boolean) as string[];

  if (errors.length === recipients.length) return { ok: false, reason: "Teams ตอบผิดพลาด — " + errors.join("; ") };
  return {
    ok: true, sent: recipients.length - errors.length,
    reason: errors.length ? "ส่งไม่ถึงบางคน: " + errors.join("; ") : undefined,
  };
}