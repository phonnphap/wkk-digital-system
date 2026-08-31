import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ★ นร. ลบงานได้เฉพาะตอนที่ครูยังไม่ได้ตรวจ (status = pending_review หรือ not_submitted)
//   ถ้าครูตรวจ/ให้คะแนน/คอมเมนต์ไปแล้ว (reviewed / needs_revision / failed) ลบไม่ได้
//   เพื่อกันไม่ให้ นร. ลบหลักฐานทิ้งหลังเห็นผลตรวจที่ไม่ถูกใจ
const LOCKED_STATUSES = ["reviewed", "needs_revision", "failed"];

export async function POST(req: Request) {
  const body = await req.json();
  const { assignment_id, student_id } = body as { assignment_id: string; student_id: string };
  if (!assignment_id || !student_id) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: sub } = await supabase
    .from("assignment_submissions")
    .select("id, status")
    .eq("assignment_id", assignment_id)
    .eq("student_id", student_id)
    .maybeSingle();

  if (!sub) return NextResponse.json({ ok: true }); // ไม่มีอะไรให้ลบอยู่แล้ว

  if (LOCKED_STATUSES.includes(sub.status)) {
    return NextResponse.json(
      { error: "ครูตรวจงานนี้แล้ว ไม่สามารถลบได้ กรุณาติดต่อครูผู้สอนหากต้องการแก้ไข" },
      { status: 403 }
    );
  }

  // ลบไฟล์แนบ + คอมเมนต์ + แถวส่งงาน ทั้งหมดของนักเรียนคนนี้ในชิ้นงานนี้
  await supabase.from("assignment_submission_attachments").delete().eq("assignment_id", assignment_id).eq("student_id", student_id);
  await supabase.from("assignment_submission_comments").delete().eq("assignment_id", assignment_id).eq("student_id", student_id);
  const { error } = await supabase.from("assignment_submissions").delete().eq("id", sub.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}