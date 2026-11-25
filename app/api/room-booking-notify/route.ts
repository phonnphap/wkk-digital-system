import { NextRequest, NextResponse } from "next/server";

// แจ้งเตือนผ่าน Teams (ผู้รับแค่รับทราบ ไม่ต้องกดอะไร)
//   new / rejected -> ธุรการทั่วไป
//   approved       -> ธุรการทั่วไป + หัวหน้างานอาคารสถานที่ (แนบลิงก์ PDF + ภาพผังห้อง)
// ใช้ Teams Workflows (Power Automate) webhook ตั้งค่า TEAMS_WEBHOOK_URL ใน .env (ไม่ตั้ง = ข้ามเงียบๆ)
export const runtime = "nodejs";

const PEOPLE = {
  admin: { email: process.env.ROOM_NOTIFY_ADMIN_EMAIL ?? "supattra@khienkhet.ac.th", name: "ธุรการทั่วไป" },
  building: { email: process.env.ROOM_NOTIFY_BUILDING_EMAIL ?? "choedchu@khienkhet.ac.th", name: "หัวหน้างานอาคารสถานที่" },
};
const WHO: Record<string, (keyof typeof PEOPLE)[]> = {
  new: ["admin"], rejected: ["admin"], approved: ["admin", "building"],
};
const TITLES: Record<string, string> = {
  new: "📩 มีคำขอใช้ห้องประชุมใหม่",
  approved: "✅ อนุมัติการใช้ห้องประชุมแล้ว — โปรดจัดเตรียมห้อง",
  rejected: "❌ คำขอใช้ห้องประชุมไม่ผ่านการพิจารณา",
};

export async function POST(req: NextRequest) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return NextResponse.json({ skipped: true });
  try {
    const b = await req.json();
    const who = (WHO[b.event] ?? ["admin"]).map((k) => PEOPLE[k]);
    const facts = [
      { title: "ห้อง", value: b.room ?? "-" },
      { title: "วันที่", value: b.date ?? "-" },
      { title: "เวลา", value: `${b.start ?? ""} - ${b.end ?? ""} น.` },
      { title: "กิจกรรม", value: b.purpose ?? "-" },
      { title: "ผู้ขอใช้", value: b.requester ?? "-" },
      ...(b.reason ? [{ title: "เหตุผล", value: b.reason }] : []),
    ];
    const layouts: string[] = Array.isArray(b.layoutUrls) ? b.layoutUrls.slice(0, 3) : [];
    const actions = [
      ...(b.pdfUrl ? [{ type: "Action.OpenUrl", title: "เปิดแบบฟอร์ม (OneDrive)", url: b.pdfUrl }] : []),
      ...layouts.map((u, i) => ({ type: "Action.OpenUrl", title: `ผังห้อง ${i + 1}`, url: u })),
    ];
    const card = {
      type: "AdaptiveCard", version: "1.4",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      msteams: { entities: who.map((p) => ({ type: "mention", text: `<at>${p.name}</at>`, mentioned: { id: p.email, name: p.name } })) },
      body: [
        { type: "TextBlock", text: title(b.event), weight: "Bolder", size: "Medium", wrap: true },
        { type: "TextBlock", text: `${who.map((p) => `<at>${p.name}</at>`).join(" ")} โปรดรับทราบ`, wrap: true },
        { type: "FactSet", facts },
        ...(layouts.length ? [{ type: "TextBlock", text: "🪑 มีภาพผังการจัดห้อง/โต๊ะเก้าอี้แนบมา", wrap: true }] : []),
      ],
      actions,
    };
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }),
    });
    if (!res.ok) return NextResponse.json({ error: "ส่ง Teams ไม่สำเร็จ" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
function title(ev: string) { return TITLES[ev] ?? "แจ้งเตือนห้องประชุม"; }