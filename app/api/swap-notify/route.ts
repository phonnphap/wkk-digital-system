import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/leave-server";
import { notifySwapTeams, SwapEvent } from "@/lib/swap-server";

const ADMIN_ROLES = ["admin", "director", "deputy_director"];

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt ?? "");
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const { swapId, event } = await req.json() as { swapId: string; event: SwapEvent };

  const { data: sw } = await admin.from("class_swap_requests")
    .select("requester_id,target_teacher_id,status").eq("id", swapId).maybeSingle();
  const { data: me } = await admin.from("users")
    .select("id,role,title,first_name,last_name").eq("email", user.email).maybeSingle();
  if (!sw || !me) return NextResponse.json({ ok: false }, { status: 404 });
  const isAdmin = ADMIN_ROLES.includes(me.role) || (me.role ?? "").toLowerCase().includes("admin");

  if (["requested", "edited", "cancelled"].includes(event)) {
    if (sw.requester_id !== me.id && !isAdmin) return NextResponse.json({ ok: false }, { status: 403 });
    if (event !== "cancelled" && sw.status !== "pending") return NextResponse.json({ ok: false }, { status: 409 });
    await notifySwapTeams(swapId, event).catch(console.warn);
    return NextResponse.json({ ok: true });
  }

  if (event === "accepted" || event === "rejected") {
    const isTarget = sw.target_teacher_id === me.id;
    if (!isTarget && !isAdmin) return NextResponse.json({ ok: false }, { status: 403 });
    if (sw.status !== event) return NextResponse.json({ ok: false, error: "สถานะใน DB ไม่ตรง" }, { status: 409 });
    const byAdmin = !isTarget ? `${me.title ?? ""}${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() : undefined;
    await notifySwapTeams(swapId, event, byAdmin).catch(console.warn);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}