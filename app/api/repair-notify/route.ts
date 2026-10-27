import { NextRequest, NextResponse } from "next/server";
import { admin, notifyRepairCreated } from "@/lib/repair-notify";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user: au } } = await admin.auth.getUser(token ?? "");
if (!au?.email) return NextResponse.json({ ok: false, error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  const { requestId } = await req.json();
  const { data: me } = await admin.from("users").select("id,title,first_name,last_name,role")
  .eq("email", au.email).maybeSingle();
  const { data: r } = await admin.from("repair_requests").select("reporter_id").eq("id", requestId).maybeSingle();
  if (!me || !r || r.reporter_id !== me.id)  // ส่งได้เฉพาะเจ้าของรายการ
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  await notifyRepairCreated(requestId);
  return NextResponse.json({ ok: true });
}