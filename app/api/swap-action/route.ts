import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/leave-server";
import { notifySwapTeams } from "@/lib/swap-server";

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt ?? "");
  if (!user?.email) return NextResponse.json({ ok: false, error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const { swapId, action } = await req.json();
  if (!["accepted", "rejected"].includes(action)) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: sw } = await admin.from("class_swap_requests")
    .select("target_teacher_id,status").eq("id", swapId).maybeSingle();
  if (!sw) return NextResponse.json({ ok: false, error: "ไม่พบคำขอ (อาจถูกยกเลิกแล้ว)" }, { status: 404 });

  const { data: me } = await admin.from("users").select("id").eq("email", user.email).maybeSingle();
  if (!me || me.id !== sw.target_teacher_id)
    return NextResponse.json({ ok: false, error: "บัญชีนี้ไม่ใช่ครูที่ถูกขอแลกคาบ" }, { status: 403 });
  if (sw.status !== "pending")
    return NextResponse.json({ ok: false, error: "คำขอนี้ตอบไปแล้วหรือไม่อยู่ในสถานะรอตอบรับ" }, { status: 409 });

  const { error } = await admin.from("class_swap_requests")
    .update({ status: action, responded_at: new Date().toISOString() }).eq("id", swapId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await notifySwapTeams(swapId, action).catch(console.warn);
  return NextResponse.json({ ok: true });
}