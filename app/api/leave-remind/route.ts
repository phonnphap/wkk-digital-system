import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyLeaveTeams } from "@/lib/leave-server";
import { remindLeaveApprover } from "@/lib/leave-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function notifyTeamsApprover(leaveId: string, slot: 1 | 2 | 3) {
  await notifyLeaveTeams(leaveId, "submitted", slot);
}

const REMIND_EVERY_HOURS = 24;   // ส่งซ้ำได้ไม่เกินวันละครั้ง ต่อใบลา

function nextSlot(r: any): 1 | 2 | 3 | null {
  if (r.status !== "pending") return null;
  if (r.approver_1_id && r.approver_1_status === "pending") return 1;
  if (r.approver_1_status === "approved" && r.approver_2_id && r.approver_2_status === "pending") return 2;
  if (r.approver_2_status === "approved" && r.approver_3_id && r.approver_3_status === "pending") return 3;
  return null;
}

export async function GET(req: NextRequest) {
  // กันคนนอกเรียก
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const force = req.nextUrl.searchParams.get("force") === "1";   // ส่งทุกใบทันที (ใช้ตอนกู้ย้อนหลัง)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb.from("leave_requests")
    .select("id,status,created_at,last_reminded_at,approver_1_id,approver_2_id,approver_3_id,approver_1_status,approver_2_status,approver_3_status")
    .eq("status", "pending").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const now = Date.now();
  let sent = 0; const failed: string[] = [];

  for (const r of data ?? []) {
    const slot = nextSlot(r);
    if (!slot) continue;
    if (!force && r.last_reminded_at &&
        now - new Date(r.last_reminded_at).getTime() < REMIND_EVERY_HOURS * 3600_000) continue;

    try {
      // ★ เรียกตัวส่ง Teams เดียวกับที่ /api/leave-notify ใช้ (ดูหมายเหตุด้านล่าง)
            await remindLeaveApprover(r.id, slot);
      await sb.from("leave_requests")
        .update({ last_reminded_at: new Date().toISOString() }).eq("id", r.id);
      sent++;
    } catch (e) { failed.push(r.id); }
  }
  return NextResponse.json({ ok: failed.length === 0, sent, failed });
}