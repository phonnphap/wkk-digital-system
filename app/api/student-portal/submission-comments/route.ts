import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assignment_id = searchParams.get("assignment_id");
  const student_id = searchParams.get("student_id");
  if (!assignment_id || !student_id) {
    return NextResponse.json({ error: "missing assignment_id or student_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("assignment_submission_comments")
    .select("*")
    .eq("assignment_id", assignment_id)
    .eq("student_id", student_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { assignment_id, student_id, content, student_name } = body as {
    assignment_id: string;
    student_id: string;
    content: string;
    student_name: string;
  };
  if (!assignment_id || !student_id || !content?.trim()) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ★ เช็คว่าวิชานี้ปิดรับงาน/คอมเมนต์หรือยัง (เงื่อนไขเดียวกับ submission-confirm)
  const { data: assignmentRow } = await supabase
    .from("assignments")
    .select("due_date, subject_section_id")
    .eq("id", assignment_id)
    .maybeSingle();

  const { data: sectionRow } = await supabase
    .from("subject_sections")
    .select("student_submit_enabled, allow_late_submission")
    .eq("id", assignmentRow?.subject_section_id)
    .maybeSingle();

  const submitEnabled = sectionRow?.student_submit_enabled ?? true;
  const allowLate = sectionRow?.allow_late_submission ?? true;
  const isOverdue = assignmentRow?.due_date
    ? new Date(assignmentRow.due_date).getTime() < Date.now()
    : false;

  if (!submitEnabled || (isOverdue && !allowLate)) {
    return NextResponse.json({ error: "ปิดการคอมเมนต์งานนี้แล้ว" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("assignment_submission_comments")
    .insert({
      assignment_id,
      student_id,
      author_role: "student",
      author_id: student_id,
      author_name: student_name || "นักเรียน",
      content: content.trim(),
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}