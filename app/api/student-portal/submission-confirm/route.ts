import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST: toggle is_submitted (ยืนยัน = true / ยกเลิก = false)
// ★ ถ้ายังไม่เคยมีแถวใน assignment_submissions เลย (นร. ยังไม่เคยส่งงานชิ้นนี้มาก่อน)
//   ต้อง upsert สร้างแถวใหม่ก่อน โดยสถานะตรวจงานเริ่มต้นเป็น "pending_review"
export async function POST(req: Request) {
  const body = await req.json();
  const { assignment_id, student_id, confirm } = body as {
    assignment_id: string;
    student_id: string;
    confirm: boolean;
  };
  if (!assignment_id || !student_id || typeof confirm !== "boolean") {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (confirm) {
    // ★ ดึง due_date ของงาน + subject_section_id เพื่อไปเช็คการตั้งค่าปิดรับส่ง
    const { data: assignmentRow, error: aErr } = await supabase
      .from("assignments")
      .select("due_date, subject_section_id")
      .eq("id", assignment_id)
      .maybeSingle();
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

    // ★ ดึงค่า student_submit_enabled / allow_late_submission จากตาราง section (ปรับชื่อ table/column ให้ตรงจริง)
    const { data: sectionRow, error: sErr } = await supabase
      .from("subject_sections")
      .select("student_submit_enabled, allow_late_submission")
      .eq("id", assignmentRow?.subject_section_id)
      .maybeSingle();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const submitEnabled = sectionRow?.student_submit_enabled ?? true;
    const allowLate = sectionRow?.allow_late_submission ?? true;
    const isOverdue = assignmentRow?.due_date
      ? new Date(assignmentRow.due_date).getTime() < Date.now()
      : false;

    if (!submitEnabled) {
      return NextResponse.json(
        { error: "ครูปิดการส่งงานผ่านระบบไว้สำหรับวิชานี้" },
        { status: 403 }
      );
    }
    if (isOverdue && !allowLate) {
      return NextResponse.json(
        { error: "เลยกำหนดส่งงานแล้ว และครูปิดการส่งงานย้อนหลังไว้" },
        { status: 403 }
      );
    }
  }

  const { data: existing } = await supabase
    .from("assignment_submissions")
    .select("id, status, submitted_at")
    .eq("assignment_id", assignment_id)
    .eq("student_id", student_id)
    .maybeSingle();

  type SubmissionUpsertRow = {
    id?: string;
    assignment_id: string;
    student_id: string;
    status: string;
    is_submitted: boolean;
    submitted_at: string | null;
  };

  const payload: SubmissionUpsertRow = {
    ...(existing ? { id: existing.id } : {}),
    assignment_id,
    student_id,
    status: existing?.status ?? "pending_review",
    submitted_at:
      confirm && !existing?.submitted_at
        ? new Date().toISOString()
        : existing?.submitted_at ?? null,
    is_submitted: confirm,
  };

  const { data, error } = await supabase
    .from("assignment_submissions")
    .upsert(payload, { onConflict: "assignment_id,student_id" })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submission: data });
}

  