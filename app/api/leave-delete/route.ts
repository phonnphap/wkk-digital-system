import { NextRequest, NextResponse } from "next/server";
import { admin, notifyLeaveTeams } from "@/lib/leave-server";

const SUPER_ADMIN_EMAIL = "admin@khienkhet.ac.th";

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt ?? "");
  if (!user?.email) return NextResponse.json({ ok: false, error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const { leaveId } = await req.json();
  const { data: leave } = await admin.from("leave_requests")
    .select("id,user_id,status").eq("id", leaveId).maybeSingle();
  if (!leave) return NextResponse.json({ ok: false, error: "ไม่พบใบลา" }, { status: 404 });

  const isSuper = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
  if (!isSuper) {
    const { data: me } = await admin.from("users").select("id").eq("email", user.email).maybeSingle();
    if (!me || me.id !== leave.user_id)
      return NextResponse.json({ ok: false, error: "ไม่มีสิทธิ์ลบใบลานี้" }, { status: 403 });
    // เจ้าของลบได้เฉพาะร่าง/รออนุมัติ (ใบที่อนุมัติครบแล้วต้องให้แอดมินลบ)
    if (!["draft", "pending"].includes(leave.status))
      return NextResponse.json({ ok: false, error: "ใบลานี้ลบเองไม่ได้ กรุณาติดต่อผู้ดูแลระบบ" }, { status: 403 });
  }

  // 1) แก้การ์ดทุกใบเป็น "ยกเลิกแล้ว" ก่อนลบ (เพราะต้องอ่านข้อมูลใบลาจาก DB) — เฉพาะใบที่ส่งแล้ว
  if (leave.status !== "draft") {
    await notifyLeaveTeams(leaveId, "cancelled").catch(e => console.warn("[leave-delete notify]", e));
  }

  // 2) ลบข้อมูลจริง
  const { error: e1 } = await admin.from("substitution_records").delete().eq("leave_request_id", leaveId);
  if (e1) return NextResponse.json({ ok: false, error: "ลบรายการสอนแทนไม่สำเร็จ: " + e1.message }, { status: 400 });
  const { error: e2 } = await admin.from("leave_requests").delete().eq("id", leaveId);
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 400 });

  // 3) ล้าง messageId หลังลบสำเร็จแล้วเท่านั้น
  await admin.from("leave_teams_messages").delete().eq("leave_id", leaveId);

  return NextResponse.json({ ok: true });
}