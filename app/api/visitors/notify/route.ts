// path: app/api/visitors/notify/route.ts — รปภ. ยืนยัน/บันทึกเข้าแล้วเรียกอันนี้ เพื่อส่ง Teams
import { NextResponse } from "next/server";
import { requireUser, notifyVisitor } from "@/lib/visitor-server";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { visitorId } = await req.json().catch(() => ({}));
  if (!visitorId) return NextResponse.json({ ok: false, error: "missing visitorId" }, { status: 400 });
  const ok = await notifyVisitor(visitorId);
  return NextResponse.json({ ok });
}