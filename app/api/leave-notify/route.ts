import { NextRequest, NextResponse } from "next/server";
import { admin, notifyLeaveTeams, APPROVER_EMAILS } from "@/lib/leave-server";

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt ?? "");
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const { leaveId, event, slot, reason } = await req.json();

  // ── ส่ง / แก้ไข / ยกเลิก: ต้องเป็นเจ้าของใบลาเท่านั้น ──
  if (["submitted", "edited", "cancelled"].includes(event)) {
    const { data: leave } = await admin.from("leave_requests").select("user_id").eq("id", leaveId).maybeSingle();
    const { data: me } = await admin.from("users").select("id").eq("email", user.email).maybeSingle();
    if (!leave || !me || leave.user_id !== me.id) return NextResponse.json({ ok: false }, { status: 403 });
    await notifyLeaveTeams(leaveId, event).catch(e => console.warn("[leave-notify]", e));
    return NextResponse.json({ ok: true });
  }

  // ── จัดสอนแทน: หัวหน้าสาย/หัวหน้าหมวด/admin/ผอ./รองผอ. ──
  if (event === "substituted") {
    const { data: me } = await admin.from("users").select("id,role,extra_roles").eq("email", user.email).maybeSingle();
    const roles: string[] = me?.extra_roles ?? [];
    const r = (me?.role ?? "").toLowerCase();
    const ok = !!me && (
      roles.includes("grade_head") || roles.includes("dept_head") ||
      r.includes("admin") || r === "director" || r === "deputy_director"
    );
    if (!ok) return NextResponse.json({ ok: false }, { status: 403 });
    await notifyLeaveTeams(leaveId, "substituted").catch(e => console.warn("[leave-notify]", e));
    return NextResponse.json({ ok: true });
  }

  // ── อนุมัติ / ไม่อนุมัติ ──
  if (event === "approved" || event === "rejected") {
    const s = Number(slot) as 1 | 2 | 3;
    if (![1, 2, 3].includes(s)) return NextResponse.json({ ok: false }, { status: 400 });
    if (user.email.toLowerCase() !== APPROVER_EMAILS[s].toLowerCase())
      return NextResponse.json({ ok: false, error: "ไม่ใช่ผู้อนุมัติลำดับนี้" }, { status: 403 });

    const { data: row } = await admin.from("leave_requests")
      .select(`approver_${s}_status`).eq("id", leaveId).maybeSingle();
    if (!row || (row as any)[`approver_${s}_status`] !== event)
      return NextResponse.json({ ok: false, error: "สถานะใน DB ไม่ตรง" }, { status: 409 });

    await notifyLeaveTeams(leaveId, event, s, reason).catch(e => console.warn("[leave-notify]", e));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}