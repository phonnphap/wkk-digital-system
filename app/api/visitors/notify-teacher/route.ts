import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js"; // TODO: ใช้ client เดียวกับ route อื่นของคุณ
import { loadClassrooms } from "@/lib/homeroom";

const ipHits = new Map<string, number[]>();
const roomLast = new Map<string, number>();

function limited(ip: string, roomId: string) {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter(t => now - t < 10 * 60_000);
  if (hits.length >= 3) return "ส่งบ่อยเกินไป กรุณารอสักครู่ หรือแจ้ง รปภ.";
  if (now - (roomLast.get(roomId) ?? 0) < 60_000) return "ห้องนี้เพิ่งถูกแจ้งไปแล้ว กรุณารอครูสักครู่";
  hits.push(now); ipHits.set(ip, hits); roomLast.set(roomId, now);
  return null;
}

// TODO: ถ้าคุณมีฟังก์ชันส่ง Teams อยู่แล้ว (ตัวที่ route /api/visitors ใช้) ให้เรียกตัวนั้นแทนฟังก์ชันนี้
async function sendTeams(card: any): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env.TEAMS_WEBHOOK_URL; // TODO: ใช้ชื่อ env เดิมของคุณ
  if (!url) return { ok: false, reason: "ยังไม่ได้ตั้งค่า Teams webhook" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }],
    }),
  });
  return res.ok ? { ok: true } : { ok: false, reason: `Teams ตอบ ${res.status}` };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const classroomId = String(body?.classroom_id ?? "");
  const visitor = String(body?.visitor_name ?? "").trim().slice(0, 100);
  const purpose = String(body?.purpose ?? "").trim().slice(0, 300);
  const student = String(body?.student_name ?? "").trim().slice(0, 100);
  if (!classroomId || !visitor || !purpose) {
    return NextResponse.json({ ok: false, error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  const isGuard = req.headers.get("x-guard-key") === process.env.GUARD_PIN; // TODO: ใช้วิธีตรวจรหัสเดิม
  if (!isGuard) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const lim = limited(ip, classroomId);
    if (lim) return NextResponse.json({ ok: false, error: lim }, { status: 429 });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let c: { name: string; teachers: { name: string }[] };
  try {
    const [room] = await loadClassrooms(sb, { id: classroomId });
    if (!room) return NextResponse.json({ ok: false, error: "ไม่พบห้องเรียน" }, { status: 404 });
    c = room;
  } catch {
    return NextResponse.json({ ok: false, error: "โหลดข้อมูลห้องไม่สำเร็จ" }, { status: 500 });
  }

  const teacherNames = c.teachers.map(t => t.name).join(", ") || "-";
  const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  const facts = [
    { title: "ผู้มาติดต่อ", value: visitor },
    ...(student ? [{ title: "มาพบนักเรียน", value: student }] : []),
    { title: "เรื่อง", value: purpose },
    { title: "แจ้งโดย", value: isGuard ? "รปภ. (ป้อมยาม)" : "ผู้มาติดต่อ (สแกน QR)" },
    { title: "เวลา", value: `${time} น.` },
  ];

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", size: "Large", weight: "Bolder", text: `🔔 มีผู้มาติดต่อ ${c.name}` },
      { type: "TextBlock", text: `ครูประจำชั้น: ${teacherNames}`, wrap: true },
      { type: "FactSet", facts },
    ],
  };

  const n = await sendTeams(card);
  if (!n.ok) return NextResponse.json({ ok: false, error: n.reason ?? "ส่ง Teams ไม่สำเร็จ" }, { status: 502 });
  return NextResponse.json({ ok: true });
}