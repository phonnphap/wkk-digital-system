import type { Summary } from "./summarize";

const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";

export async function postTeams(webhook: string | undefined, card: object) {
  if (!webhook) return false;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[teams]", e);
    return false;
  }
}

/** การ์ดแจ้งครู พร้อมปุ่ม "รับทราบ" (เปิดลิงก์ยืนยัน) */
export function visitorCard(v: { full_name: string; car_plate?: string | null; target_label?: string | null; purpose?: string | null }, timeText: string, ackUrl: string) {
  const facts = [
    { title: "ติดต่อ", value: v.target_label || "-" },
    { title: "เข้าเมื่อ", value: `${timeText} น.` },
    ...(v.car_plate ? [{ title: "ทะเบียนรถ", value: v.car_plate }] : []),
    ...(v.purpose ? [{ title: "เรื่อง", value: v.purpose }] : []),
  ];
  return {
    $schema: SCHEMA,
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", text: "🔔 มีผู้มาติดต่อ", weight: "Bolder", size: "Medium" },
      { type: "TextBlock", text: v.full_name, size: "Large", weight: "Bolder", wrap: true },
      { type: "FactSet", facts },
    ],
    actions: [{ type: "Action.OpenUrl", title: "✅ รับทราบ", url: ackUrl }],
  };
}

export function summaryCard(title: string, s: Summary) {
  const top = s.targets.slice(0, 5).map(([k, n]) => `${k}: ${n}`).join(" · ") || "-";
  return {
    $schema: SCHEMA,
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
      {
        type: "FactSet",
        facts: [
          { title: "ผู้มาติดต่อทั้งหมด", value: `${s.total} คน` },
          { title: "เวลาอยู่เฉลี่ย", value: s.avgStayMin == null ? "-" : `${s.avgStayMin} นาที` },
          { title: "ถ่ายบัตร / ไม่มีบัตร / QR", value: `${s.bySource.id} / ${s.bySource.face} / ${s.bySource.qr}` },
          { title: "ครูรับทราบ", value: `${s.acked}/${s.total}` },
          { title: "รปภ. ลืมกดออก", value: `${s.auto} คน` },
          { title: "ติดต่อมากสุด", value: top },
        ],
      },
    ],
  };
}