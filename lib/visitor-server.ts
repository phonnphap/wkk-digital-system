// path: lib/visitor-server.ts  (ใช้ฝั่ง server เท่านั้น)
import { createClient } from "@supabase/supabase-js";
import { signAck } from "@/lib/visitors/ackToken";
import { SITE, wrapCard, tb, facts, openUrl } from "@/lib/leave-server";
import { timingSafeEqual } from "crypto";

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
export type NotifyResult = { ok: boolean; reason?: string; sent?: number };

// ชื่อฝ่ายต้องตรงกับรายการ ADMIN_TARGETS ใน app/api/visitors/route.ts
const ADMIN_TARGET_EMAILS: Record<string, string[]> = {
  "ผู้อำนวยการ": ["thananut@khienkhet.ac.th"],
  "ฝ่ายวิชาการ": ["sattapol@khienkhet.ac.th"],
  "ฝ่ายบุคคล": ["titima@khienkhet.ac.th"],
  "ฝ่ายงบประมาณ/การเงิน": ["kamolphron@khienkhet.ac.th"],
  "ฝ่ายบริหารทั่วไป": ["jariya@khienkhet.ac.th"],
  "ห้องพยาบาล": ["maneewan@khienkhet.ac.th"],
};

const dash = (s?: string | null) => (s && s.trim() ? s : "ไม่ระบุ");   // อย่าใช้ "-" เพราะ Teams แสดงเป็นจุด •

/** รูปหน้า (เฉพาะโหมดไม่มีบัตร) เป็นลิงก์ชั่วคราว 24 ชม. — bucket ยังเป็น private */
async function photoUrlOf(v: any): Promise<string | null> {
  if (!v.photo_path) return null;
  const { data } = await adminClient().storage.from("visitor-photos").createSignedUrl(v.photo_path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

function visitorCard(v: any, o: { ackUrl: string; photoUrl: string | null }) {
  const acked = !!v.acknowledged_at;
  const body: any[] = [
    tb(acked ? "✅ รับทราบแล้ว" : "🚪 มีผู้มาติดต่อที่โรงเรียน",
      { weight: "Bolder", size: "Large", color: acked ? "Good" : "Accent" }),
  ];
  if (o.photoUrl) {
    body.push({ type: "Image", url: o.photoUrl, size: "Large", altText: "รูปผู้มาติดต่อ", horizontalAlignment: "Center" });
  }
  body.push(facts([
    ["ชื่อ", dash(v.full_name)],
    ["มาติดต่อ", dash(v.target_label ?? v.contact_person)],
    ["เรื่อง", dash(v.purpose)],
    ["ทะเบียนรถ", dash(v.car_plate)],
    ["เวลาเข้า", fmtTime(v.check_in_at)],
  ]));
  if (acked) body.push(tb(`รับทราบเมื่อ ${fmtTime(v.acknowledged_at)}`, { isSubtle: true, size: "Small" }));
  // รับทราบแล้ว → ไม่มีปุ่มอีก
  return wrapCard(body, !acked && o.ackUrl ? [openUrl("✅ รับทราบ", o.ackUrl, "positive")] : [],
    "ผู้มาติดต่อ · โรงเรียนวัดเขียนเขต");
}

export async function notifyVisitor(visitorId: string): Promise<NotifyResult> {
  // ใช้ Flow ตัวเดียวกับระบบลาได้เลย ถ้าไม่ได้สร้าง Flow แยก
  const url = process.env.TEAMS_VISITOR_WEBHOOK_URL || process.env.TEAMS_LEAVE_WEBHOOK_URL;
  if (!url) return { ok: false, reason: "ยังไม่ได้ตั้ง TEAMS_VISITOR_WEBHOOK_URL หรือ TEAMS_LEAVE_WEBHOOK_URL" };

  const db = adminClient();
  const { data: v } = await db.from("visitors").select("*").eq("id", visitorId).maybeSingle();
  if (!v) return { ok: false, reason: "ไม่พบข้อมูลผู้มาติดต่อ" };

  // ผู้รับ: ครูประจำชั้นทุกคนของห้อง
  const recipients: { name: string; email: string }[] = [];
  if (v.target_classroom_id) {
    const { data: room } = await db.from("classrooms").select("*").eq("id", v.target_classroom_id).maybeSingle();
    const ids = Object.entries(room ?? {})
      .filter(([k, val]) => /^homeroom_teacher.*id/.test(k) && typeof val === "string" && val)
      .map(([, val]) => val as string);
    const uniq = [...new Set(ids)];
    if (uniq.length) {
      const { data: ts } = await db.from("users").select("id,title,first_name,last_name,email").in("id", uniq);
      for (const t of ts ?? []) if (t.email)
        recipients.push({ name: `${t.title ?? ""}${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(), email: t.email });
    }
  }
    // ติดต่อฝ่ายบริหาร → ส่งหาอีเมลของฝ่ายนั้น (ตาม ADMIN_TARGET_EMAILS)
  if (recipients.length === 0 && v.target_type === "admin") {
    (ADMIN_TARGET_EMAILS[v.target_label ?? ""] ?? []).forEach(e => recipients.push({ name: e, email: e }));
  }
  // ยังไม่มีผู้รับ (ฝ่ายที่ไม่ได้ตั้ง หรือห้องที่ไม่มีครูประจำชั้น) → อีเมลสำรอง
  if (recipients.length === 0) {
    (process.env.VISITOR_FALLBACK_EMAILS ?? "").split(",").map(s => s.trim()).filter(Boolean)
      .forEach(e => recipients.push({ name: e, email: e }));
  }
  if (recipients.length === 0)
    return { ok: false, reason: "ไม่พบอีเมลครูประจำชั้น และยังไม่ได้ตั้ง VISITOR_FALLBACK_EMAILS" };

  // ปุ่มรับทราบ — ถ้า ACK_SECRET ไม่ได้ตั้ง ให้ส่งการ์ดโดยไม่มีปุ่มแทนที่จะล้มทั้งงาน
  let ackUrl = "";
  try { ackUrl = `${SITE}/api/visitors/ack?id=${v.id}&t=${signAck(v.id)}`; }
  catch (e) { console.warn("[notifyVisitor] signAck:", e); }

    const card = visitorCard(v, { ackUrl, photoUrl: await photoUrlOf(v) });

  const errors = (await Promise.all(recipients.map(async r => {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", to: r.email, card }),
      });
      if (!res.ok) return `${r.email}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 100)}`;
      const j = await res.json().catch(() => null);
      if (j?.messageId) {
        await db.from("visitor_teams_messages").upsert({
          visitor_id: v.id, email: r.email.toLowerCase(), message_id: j.messageId, updated_at: new Date().toISOString(),
        });
      } else console.warn("[notifyVisitor] Flow ไม่ส่ง messageId กลับมา — จะอัปเดตการ์ดไม่ได้", r.email);
      return null;
    } catch (e: any) { return `${r.email}: ${e.message}`; }
  }))).filter(Boolean) as string[];

  if (errors.length === recipients.length) return { ok: false, reason: "Teams ตอบผิดพลาด — " + errors.join("; ") };
  await db.from("visitors").update({ notified_at: new Date().toISOString() }).eq("id", visitorId);
  return {
    ok: true, sent: recipients.length - errors.length,
    reason: errors.length ? "ส่งไม่ถึงบางคน: " + errors.join("; ") : undefined,
  };
}

/** ครูกดรับทราบแล้ว → แก้การ์ดเดิมของครูทุกคนให้เป็น "รับทราบแล้ว" และเอาปุ่มออก */
export async function refreshVisitorCards(visitorId: string) {
  const url = process.env.TEAMS_VISITOR_WEBHOOK_URL || process.env.TEAMS_LEAVE_WEBHOOK_URL;
  if (!url) return;
  const db = adminClient();
  const { data: v } = await db.from("visitors").select("*").eq("id", visitorId).maybeSingle();
  if (!v) return;
  const { data: msgs } = await db.from("visitor_teams_messages").select("email,message_id").eq("visitor_id", visitorId);
  if (!msgs?.length) return;
  const card = visitorCard(v, { ackUrl: "", photoUrl: await photoUrlOf(v) });
  await Promise.allSettled(msgs.map(async (m: any) => {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", to: m.email, messageId: m.message_id, card }),
    });
    if (!res.ok) console.warn("[refreshVisitorCards]", m.email, res.status);
  }));
}

/** ผ่านถ้าส่งรหัส รปภ. ถูก (x-guard-key) หรือเป็นผู้ใช้ที่ล็อกอิน */
export async function requireGuard(req: Request): Promise<boolean> {
  const expected = process.env.GUARD_KEY ?? "";
  const given = req.headers.get("x-guard-key") ?? "";
  if (expected && given.length === expected.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return true;
  return !!(await requireUser(req));
}