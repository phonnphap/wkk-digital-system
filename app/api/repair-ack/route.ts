import { NextRequest, NextResponse } from "next/server";
import { admin, resolveRecipientUsers, notifyRepairAcknowledged } from "@/lib/repair-notify";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user: au } } = await admin.auth.getUser(token ?? "");
if (!au?.email) return NextResponse.json({ ok: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
const { requestId } = await req.json();

const { data: me } = await admin.from("users").select("id,title,first_name,last_name,role")
  .eq("email", au.email).maybeSingle();
  const { data: r } = await admin.from("repair_requests").select("*").eq("id", requestId).maybeSingle();
  if (!me || !r) return NextResponse.json({ ok: false, error: "ไม่พบรายการ" }, { status: 404 });

  const recipients = await resolveRecipientUsers(r);
  const { data: pm } = await admin.from("repair_project_managers").select("user_id").eq("user_id", me.id);
  const allowed = recipients.some(u => u.id === me.id) || (pm?.length ?? 0) > 0 ||
    ["admin","director","deputy_director","dept_head","grade_head"].includes(me.role);
  if (!allowed) return NextResponse.json({ ok: false, error: "คุณไม่ใช่ผู้รับผิดชอบเรื่องนี้" }, { status: 403 });

  const { data: upd, error } = await admin.from("repair_requests").update({
    assigned_user_ids: [me.id], assigned_to: me.id, status: "in_progress", updated_at: new Date().toISOString(),
  }).eq("id", requestId).is("assigned_to", null).select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!upd?.length) return NextResponse.json({ ok: false, error: "มีผู้รับเรื่องนี้ไปแล้ว" }, { status: 409 });

  const name = `${me.title ?? ""}${me.first_name} ${me.last_name}`.trim();
  await notifyRepairAcknowledged(requestId, name);
  return NextResponse.json({ ok: true });
}