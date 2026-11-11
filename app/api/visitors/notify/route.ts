// path: app/api/visitors/notify/route.ts — รปภ. ยืนยัน/บันทึกเข้าแล้วเรียกอันนี้ เพื่อส่ง Teams
import { NextResponse } from "next/server";
import { requireGuard, notifyVisitor, adminClient } from "@/lib/visitor-server";

export async function POST(req: Request) {
  if (!(await requireGuard(req))) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const { visitorId } = await req.json().catch(() => ({}));
  if (!visitorId) return NextResponse.json({ ok: false, reason: "missing visitorId" }, { status: 400 });

  const { data: v } = await adminClient().from("visitors").select("status,notified_at").eq("id", visitorId).maybeSingle();
  if (!v || v.status !== "inside") return NextResponse.json({ ok: false, reason: "สถานะไม่ใช่ 'อยู่ในโรงเรียน'" }, { status: 409 });
  if (v.notified_at) return NextResponse.json({ ok: true, already: true });

  return NextResponse.json(await notifyVisitor(visitorId));
}