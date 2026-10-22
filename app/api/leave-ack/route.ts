import { NextRequest, NextResponse } from "next/server";
import { admin, notifyLeaveTeams } from "@/lib/leave-server";

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt ?? "");
  if (!user?.email) return NextResponse.json({ ok: false, error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  const { leaveId } = await req.json();
  const { data: me } = await admin.from("users").select("id").eq("email", user.email).maybeSingle();
  if (!me) return NextResponse.json({ ok: false, error: "ไม่พบผู้ใช้" }, { status: 403 });

  const { data, error } = await admin.from("substitution_records")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("leave_request_id", leaveId).eq("substitute_teacher_id", me.id)
    .neq("status", "cancelled").is("acknowledged_at", null).select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ ok: false, error: "ไม่พบรายการที่ต้องรับทราบ (อาจรับทราบไปแล้ว)" }, { status: 404 });
    await notifyLeaveTeams(leaveId, "acknowledged", undefined, undefined, me.id).catch(e => console.warn("[leave-ack notify]", e));
  return NextResponse.json({ ok: true, count: data.length });
}