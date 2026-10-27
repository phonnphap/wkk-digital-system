import { createClient } from "@supabase/supabase-js";

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://system.khienkhet.ac.th";
const BULB_CATEGORY = "เปลี่ยนหลอดไฟ";
const NOTIFY_MEMO_EMAIL = "general@khienkhet.ac.th";
const nm = (u: any) => u ? `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim() : "-";

const tb = (text: string, o: any = {}) => ({ type: "TextBlock", text, wrap: true, ...o });
const wrapCard = (body: any[], actions: any[] = []) => ({
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
  msteams: { width: "Full" }, body, actions,
});
const openUrl = (title: string, url: string, style?: string) =>
  ({ type: "Action.OpenUrl", title, url, ...(style ? { style } : {}) });

// ผู้รับเรื่อง: เส้นทางที่แอดมินตั้งไว้ต่อหมวด -> (หลอดไฟ) ครูประจำตึก -> หน.โครงการ
export async function resolveRecipientUsers(req: any): Promise<any[]> {
  const cols = "id,title,first_name,last_name,email";
  const { data: routes } = await admin.from("repair_category_routes").select("user_id").eq("category", req.category ?? "");
  let ids: string[] = (routes ?? []).map((r: any) => r.user_id);
  if (ids.length === 0 && req.category === BULB_CATEGORY && req.building_id) {
    const { data: b } = await admin.from("buildings").select("repair_user_ids").eq("id", req.building_id).maybeSingle();
    ids = b?.repair_user_ids ?? [];
  }
  if (ids.length === 0) {
    const { data: m } = await admin.from("repair_project_managers").select("user_id");
    ids = (m ?? []).map((x: any) => x.user_id);
  }
  if (ids.length === 0) return [];
  const { data } = await admin.from("users").select(cols).in("id", ids);
  return data ?? [];
}

async function post(to: string, card: any) {
  const url = process.env.TEAMS_REPAIR_WEBHOOK_URL ?? process.env.TEAMS_LEAVE_WEBHOOK_URL;
  if (!url) return;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, card }) });
  if (!r.ok) console.warn("[teams-repair] send failed", to, r.status);
}

export async function notifyRepairCreated(requestId: string) {
  const { data: req } = await admin.from("repair_requests")
    .select("*, reporter:users!reporter_id(title,first_name,last_name), building:buildings(name)")
    .eq("id", requestId).maybeSingle();
  if (!req) return;
  const recipients = await resolveRecipientUsers(req);
  const card = wrapCard([
    tb("🔧 มีแจ้งซ่อมใหม่รอรับทราบ", { weight: "Bolder", size: "Large", color: "Accent" }),
    { type: "FactSet", facts: [
      { title: "เรื่อง", value: req.title },
      { title: "หมวดหมู่", value: req.category ?? "-" },
      { title: "อาคาร", value: `${req.building?.name ?? "-"} ${req.room ?? ""}`.trim() },
      { title: "เร่งด่วน", value: req.priority ?? "-" },
      { title: "ผู้แจ้ง", value: nm(req.reporter) },
    ]},
    tb(req.description || "-", { size: "Small", isSubtle: true }),
    tb("คนที่กดรับทราบก่อนจะเป็นผู้รับผิดชอบเรื่องนี้", { size: "Small" }),
  ], [openUrl("✋ รับทราบ / รับเรื่อง", `${SITE}/repair/ack?id=${req.id}`, "positive"),
      openUrl("เปิดในระบบ", `${SITE}/repair`)]);
  await Promise.allSettled(recipients.filter(u => u.email).map(u => post(u.email, card)));
}

export async function notifyRepairAcknowledged(requestId: string, actorId: string, actorName: string) {
  const { data: req } = await admin.from("repair_requests")
    .select("*, reporter:users!reporter_id(email,title,first_name,last_name), building:buildings(name)")
    .eq("id", requestId).maybeSingle();
  if (!req) return;

  // 1 คน = 1 การ์ด (ลำดับก่อนมีสิทธิ์ก่อน)
  const sends = new Map<string, { to: string; card: any }>();
  const add = (to?: string | null, card?: any) => {
    if (!to || !card) return;
    const k = to.toLowerCase();
    if (!sends.has(k)) sends.set(k, { to, card });
  };
  const link = [openUrl("เปิดในระบบ", `${SITE}/repair`)];
  const where = `${req.building?.name ?? "-"} ${req.room ?? ""}`.trim();

  // ① ผู้แจ้ง
  add(req.reporter?.email, wrapCard([
    tb("✅ มีผู้รับเรื่องแจ้งซ่อมของคุณแล้ว", { weight: "Bolder", size: "Large", color: "Good" }),
    tb(`${req.title}\nผู้รับผิดชอบ: ${actorName}`),
  ], link));

  // ② staff ผู้ดูแลโครงการ + HR → ให้จัดทำบันทึกข้อความ
  const memoCard = wrapCard([
    tb("📄 มีรายการแจ้งซ่อมที่ต้องจัดทำบันทึกข้อความ", { weight: "Bolder", size: "Large", color: "Accent" }),
    { type: "FactSet", facts: [
      { title: "เรื่อง", value: req.title },
      { title: "หมวดหมู่", value: req.category ?? "-" },
      { title: "อาคาร", value: where },
      { title: "ผู้แจ้ง", value: nm(req.reporter) },
      { title: "ผู้รับเรื่อง", value: actorName },
      { title: "งบโดยประมาณ", value: req.estimated_cost ? `${Number(req.estimated_cost).toLocaleString("th-TH")} บาท` : "ยังไม่ระบุ" },
    ]},
    tb("เข้าระบบแจ้งซ่อม → ปุ่ม 📄 บันทึกข้อความ เพื่อรวมรายการและพิมพ์", { size: "Small", isSubtle: true }),
  ], link);

  const { data: mgrs } = await admin.from("repair_project_managers").select("user_id");
  const mgrIds = (mgrs ?? []).map((m: any) => m.user_id);
  if (mgrIds.length) {
    const { data: staff } = await admin.from("users").select("email").in("id", mgrIds).eq("role", "staff");
    (staff ?? []).forEach((u: any) => add(u.email, memoCard));
  }
  add(NOTIFY_MEMO_EMAIL, memoCard);

  // ③ ผู้รับเรื่องคนอื่นที่เคยได้การ์ดตอนแจ้งซ่อม → บอกว่ามีคนรับแล้ว
  const takenCard = wrapCard([
    tb("🔒 มีผู้รับเรื่องนี้แล้ว — ไม่ต้องกดรับซ้ำ", { weight: "Bolder", size: "Large", color: "Warning" }),
    tb(`${req.title}\nรับเรื่องโดย: ${actorName}`),
  ], link);
  const recipients = await resolveRecipientUsers(req);
  recipients.filter(u => u.id !== actorId).forEach(u => add(u.email, takenCard));

  await Promise.allSettled([...sends.values()].map(s => post(s.to, s.card)));
}