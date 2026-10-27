import { createClient } from "@supabase/supabase-js";

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://system.khienkhet.ac.th";
const BULB_CATEGORY = "เปลี่ยนหลอดไฟ";
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

export async function notifyRepairAcknowledged(requestId: string, actorName: string) {
  const { data: req } = await admin.from("repair_requests")
    .select("id,title,reporter:users!reporter_id(email)").eq("id", requestId).maybeSingle();
  const to = (req as any)?.reporter?.email;
  if (!to) return;
  await post(to, wrapCard([
    tb("✅ มีผู้รับเรื่องแจ้งซ่อมของคุณแล้ว", { weight: "Bolder", size: "Large", color: "Good" }),
    tb(`${req!.title}\nผู้รับผิดชอบ: ${actorName}`),
  ], [openUrl("เปิดในระบบ", `${SITE}/repair`)]));
}