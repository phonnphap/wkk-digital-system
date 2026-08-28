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

  const { data: existing } = await supabase
    .from("assignment_submissions")
    .select("id, status, submitted_at")
    .eq("assignment_id", assignment_id)
    .eq("student_id", student_id)
    .maybeSingle();

  // ★ กำหนด type ของแถวที่จะ upsert ให้ตายตัว shape เดียว
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
    // ★ ยืนยันครั้งแรก (ยังไม่เคยมี submitted_at) ให้ประทับเวลาไว้
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