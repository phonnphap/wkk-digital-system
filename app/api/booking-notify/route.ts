import { NextRequest, NextResponse } from "next/server";
import { adminClient, APP_URL, requireUser } from "@/lib/booking-server";

// แจ้ง Teams ตามรูปแบบเดียวกับระบบลา: การ์ด + ปุ่มลิงก์ → เปิดหน้าคำขอ (ต้องล็อกอิน) แล้วกดดำเนินการ
// client ส่งมาแค่ { kind, event, id } — เซิร์ฟเวอร์โหลดข้อมูลจริงจากฐานข้อมูลเอง
// ส่งทีละคนแบบ { to: อีเมล, card } ไปที่ webhook เดียวกับระบบลา/แจ้งซ่อม (TEAMS_LEAVE_WEBHOOK_URL) — รูปแบบเดียวกับ lib/repair-notify.ts
export const runtime = "nodejs";

type Person = { email: string; name: string };
const P: Record<string, Person> = {
  head:     { email: process.env.BOOKING_HEAD_EMAIL     ?? "chanidapa@khienkhet.ac.th", name: "หัวหน้ากลุ่มบริหารทั่วไป" },
  deputy:   { email: process.env.BOOKING_DEPUTY_EMAIL   ?? "jariya@khienkhet.ac.th",    name: "รองผอ.กลุ่มบริหารทั่วไป" },
  director: { email: process.env.BOOKING_DIRECTOR_EMAIL ?? "thananut@khienkhet.ac.th",  name: "ผู้อำนวยการ" },
  clerk:    { email: process.env.BOOKING_CLERK_EMAIL    ?? "supattra@khienkhet.ac.th",  name: "ธุรการทั่วไป" },
  building: { email: process.env.BOOKING_BUILDING_EMAIL ?? "choedchu@khienkhet.ac.th",  name: "หัวหน้างานอาคารสถานที่" },
};
const nameOf = (u: any) => `${u?.title ?? ""}${u?.first_name ?? ""} ${u?.last_name ?? ""}`.replace(/\s+/g, " ").trim();
const hhmm = (t?: string) => (t ?? "").slice(0, 5);

const TITLES: Record<string, string> = {
  "room:new": "📩 มีคำขอใช้ห้องประชุมใหม่ — รอหัวหน้ากลุ่มฯ ตรวจเสนอ",
  "room:edited": "✏️ คำขอใช้ห้องประชุมถูกแก้ไข — รอหัวหน้ากลุ่มฯ ตรวจเสนอใหม่",
  "room:head_done": "⏳ คำขอใช้ห้องประชุม — รอรองผอ. ตรวจเสนอ (ผอ.อนุมัติพร้อมกัน)",
  "room:approved": "✅ อนุมัติการใช้ห้องประชุมแล้ว — โปรดจัดเตรียมห้อง",
  "room:rejected": "❌ คำขอใช้ห้องประชุมไม่ผ่านการพิจารณา",
  "vehicle:new": "🚐 มีคำขอใช้รถราชการใหม่ — โปรดเลือกรถและคนขับ",
  "vehicle:edited": "✏️ คำขอใช้รถราชการถูกแก้ไข — โปรดเลือกรถและคนขับใหม่",
  "vehicle:wait_director": "⏳ คำขอใช้รถราชการ — รอ ผอ. อนุญาต",
  "vehicle:approved": "✅ อนุญาตการใช้รถราชการแล้ว",
  "vehicle:rejected": "❌ คำขอใช้รถราชการไม่ผ่านการพิจารณา",
};
const ACTION_EVENTS = new Set(["room:new", "room:edited", "room:head_done", "vehicle:new", "vehicle:edited", "vehicle:wait_director"]);

export async function POST(req: NextRequest) {
  const hook = process.env.TEAMS_BOOKING_WEBHOOK_URL ?? process.env.TEAMS_LEAVE_WEBHOOK_URL ?? process.env.TEAMS_REPAIR_WEBHOOK_URL;
  try {
    if (!(await requireUser(req))) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
    if (!hook) return NextResponse.json({ skipped: true });
    const { kind, event, id } = await req.json();
    if (!["room", "vehicle"].includes(kind) || !id) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const key = `${kind}:${event}`;
    if (!TITLES[key]) return NextResponse.json({ error: "unknown event" }, { status: 400 });

    const db = adminClient();
    let facts: { title: string; value: string }[] = [];
    let requester: Person | null = null;
    let driver: Person | null = null;
    let pdfUrl: string | null = null;
    let layouts: string[] = [];
    let reason: string | null = null;

    if (kind === "room") {
      const { data: b } = await db.from("room_bookings")
        .select("*, room:meeting_rooms(name), requester:users!room_bookings_requester_id_fkey(title,first_name,last_name,email)")
        .eq("id", id).maybeSingle();
      if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });
      const rq: any = (b as any).requester;
      requester = rq?.email ? { email: rq.email, name: nameOf(rq) } : null;
      facts = [
        { title: "ห้อง", value: (b as any).room?.name ?? "-" },
        { title: "วันที่", value: ((b as any).booking_dates?.length ? (b as any).booking_dates : [(b as any).booking_date]).join(", ") },
        { title: "เวลา", value: `${hhmm((b as any).start_time)} - ${hhmm((b as any).end_time)} น.` },
        { title: "กิจกรรม", value: (b as any).purpose },
        { title: "ผู้ขอใช้", value: nameOf(rq) },
      ];
      pdfUrl = (b as any).pdf_signed_url; layouts = (b as any).layout_urls ?? []; reason = (b as any).reject_reason;
    } else {
      const { data: b } = await db.from("vehicle_bookings")
        .select("*, vehicle:vehicles(vehicle_type,plate), driver:drivers(name,user:users(email)), requester:users!vehicle_bookings_requester_id_fkey(title,first_name,last_name,email)")
        .eq("id", id).maybeSingle();
      if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });
      const x: any = b;
      requester = x.requester?.email ? { email: x.requester.email, name: nameOf(x.requester) } : null;
      driver = x.driver?.user?.email ? { email: x.driver.user.email, name: x.driver_name ?? x.driver.name } : null;
      facts = [
        { title: "ปลายทาง", value: x.destination },
        { title: "เพื่อ", value: x.purpose },
        { title: "เดินทาง", value: `${x.start_date} ${hhmm(x.start_time)} → ${x.end_date} ${hhmm(x.end_time)} น.` },
        { title: "ผู้โดยสาร", value: `${x.passengers} คน` },
        { title: "ผู้ขอใช้", value: nameOf(x.requester) },
        ...(x.vehicle ? [{ title: "รถ", value: `${x.vehicle.vehicle_type} ทะเบียน ${x.vehicle.plate}` }] : []),
        ...(x.driver_name ? [{ title: "คนขับ", value: x.driver_name }] : []),
        ...(x.leave_request_id ? [{ title: "หมายเหตุ", value: "ผูกกับคำขอไปราชการ (ใช้รถโรงเรียน)" }] : []),
      ];
      pdfUrl = x.pdf_signed_url; reason = x.reject_reason;
    }
    if (reason) facts.push({ title: "เหตุผล", value: reason });

    const who: Person[] =
      (key === "room:new" || key === "room:edited") ? [P.head, P.clerk]
      : key === "room:head_done" ? [P.deputy]
      : key === "room:approved" ? [P.clerk, P.building, ...(requester ? [requester] : [])]
      : key === "room:rejected" ? [P.clerk, ...(requester ? [requester] : [])]
      : (key === "vehicle:new" || key === "vehicle:edited") ? [P.head, P.clerk]
      : key === "vehicle:wait_director" ? [P.director]
      : key === "vehicle:approved" ? [...(requester ? [requester] : []), ...(driver ? [driver] : []), P.clerk]
      : [...(requester ? [requester] : []), P.clerk];
    const seen = new Set<string>();
    const mentions = who.filter((p) => !seen.has(p.email.toLowerCase()) && seen.add(p.email.toLowerCase()));

    const page = kind === "room" ? "room-booking" : "vehicle-booking";
    const needsAction = ACTION_EVENTS.has(key);
    const card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
      msteams: { width: "Full" },
      body: [
        { type: "TextBlock", text: TITLES[key], weight: "Bolder", size: "Large", wrap: true, color: needsAction ? "Accent" : key.endsWith("rejected") ? "Warning" : "Good" },
        { type: "FactSet", facts },
        ...(layouts.length ? [{ type: "TextBlock", text: "🪑 มีภาพผังการจัดห้อง/โต๊ะเก้าอี้แนบมา", wrap: true, size: "Small" }] : []),
      ],
      actions: [
        { type: "Action.OpenUrl", title: needsAction ? "✋ เปิดเพื่อดำเนินการ" : "เปิดดูคำขอ", url: `${APP_URL}/${page}?open=${id}`, ...(needsAction ? { style: "positive" } : {}) },
        ...(pdfUrl ? [{ type: "Action.OpenUrl", title: "เปิดแบบฟอร์ม (OneDrive)", url: pdfUrl }] : []),
        ...layouts.slice(0, 3).map((u, i) => ({ type: "Action.OpenUrl", title: `ผังห้อง ${i + 1}`, url: u })),
      ],
    };
    // ส่งทีละคน { to, card } (1 คน = 1 การ์ด)
    const results = await Promise.allSettled(mentions.map((p) =>
      fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.email, card }) })
    ));
    const failed = results.filter((r) => r.status === "rejected" || !(r as PromiseFulfilledResult<Response>).value.ok).length;
    if (mentions.length > 0 && failed === mentions.length) return NextResponse.json({ error: "ส่ง Teams ไม่สำเร็จ" }, { status: 502 });
    return NextResponse.json({ ok: true, sent: mentions.length - failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
