import { NextRequest, NextResponse } from "next/server";
import {
  admin, notifyRepairCreated, notifyRepairAssigned, notifyRepairStatusChanged,
} from "@/lib/repair-notify";

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user: au } } = await admin.auth.getUser(token ?? "");
  if (!au?.email) return NextResponse.json({ ok: false, error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const body = await req.json();
  const requestId: string = body.requestId;
  const event: string = body.event ?? "submitted";            // รุ่นเก่าไม่ส่ง event → ถือเป็น submitted
  const note: string | undefined = typeof body.note === "string" ? body.note.trim().slice(0, 200) || undefined : undefined;

  const { data: me } = await admin.from("users").select("id,title,first_name,last_name,role")
    .eq("email", au.email).maybeSingle();
  const { data: r } = await admin.from("repair_requests")
    .select("reporter_id,assigned_to,assigned_user_ids").eq("id", requestId).maybeSingle();
  if (!me || !r) return NextResponse.json({ ok: false, error: "ไม่พบรายการ" }, { status: 404 });

  const byName = `${me.title ?? ""}${me.first_name} ${me.last_name}`.trim();

  // ── แจ้งซ่อมใหม่: เฉพาะเจ้าของรายการ ──
  if (event === "submitted") {
    if (r.reporter_id !== me.id) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    await notifyRepairCreated(requestId);
    return NextResponse.json({ ok: true });
  }

  // ── edited / acknowledged: ไม่ส่ง (ack แจ้งเองใน /api/repair-ack, แก้ไขไม่ต้องแจ้ง) ──
  if (event === "edited" || event === "acknowledged") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // ── assigned / status_changed / completed: แอดมิน, ผู้ดูแลโครงการ หรือผู้ที่ได้รับมอบหมาย ──
  if (["assigned", "status_changed", "completed"].includes(event)) {
    const { data: pm } = await admin.from("repair_project_managers").select("user_id").eq("user_id", me.id);
    const assignedIds: string[] = (r.assigned_user_ids as string[] | null) ?? (r.assigned_to ? [r.assigned_to] : []);
    const allowed = ADMIN_ROLES.includes(me.role) || (pm?.length ?? 0) > 0 || assignedIds.includes(me.id);
    if (!allowed) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    // ข้อมูลที่แจ้งอ่านจาก DB เสมอ ไม่เชื่อสถานะที่ client ส่งมา
    if (event === "assigned") await notifyRepairAssigned(requestId, byName, note);
    else await notifyRepairStatusChanged(requestId, byName, note);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown event" }, { status: 400 });
}