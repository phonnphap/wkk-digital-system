import { NextRequest, NextResponse } from "next/server";
import { admin, applyApproval, APPROVER_EMAILS } from "@/lib/leave-server";

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt ?? "");
  const { leaveId, slot, action, reason } = await req.json();
  // ต้องเป็นผู้อนุมัติลำดับนั้นจริงเท่านั้น
  if (!user?.email || user.email.toLowerCase() !== APPROVER_EMAILS[slot as 1 | 2]?.toLowerCase())
    return NextResponse.json({ ok: false, error: "บัญชีนี้ไม่ใช่ผู้อนุมัติลำดับนี้" }, { status: 403 });
  if (action === "rejected" && !reason?.trim())
    return NextResponse.json({ ok: false, error: "กรุณาระบุเหตุผล" }, { status: 400 });
  try {
    const r = await applyApproval(leaveId, slot, action, reason);
    return NextResponse.json({ ok: true, fullyApproved: r.fullyApproved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}