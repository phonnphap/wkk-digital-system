import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subject_section_id = searchParams.get("subject_section_id");
  const assessment_type = searchParams.get("assessment_type");

  if (!subject_section_id || !assessment_type) {
    return NextResponse.json({ error: "missing subject_section_id or assessment_type" }, { status: 400 });
  }

  const supabase = await createClient(); // ★ เพิ่ม await

  const { data, error } = await supabase
    .from("student_assessments")
    .select("student_id, item_scores")
    .eq("subject_section_id", subject_section_id)
    .eq("assessment_type", assessment_type);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (!body?.subject_section_id || !body?.student_id || !body?.assessment_type) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const supabase = await createClient(); // ★ เพิ่ม await

  const { error } = await supabase
    .from("student_assessments")
    .upsert(
      {
        subject_section_id: body.subject_section_id,
        student_id: body.student_id,
        assessment_type: body.assessment_type,
        item_scores: body.item_scores ?? {},
        updated_by: body.updated_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subject_section_id,student_id,assessment_type" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}