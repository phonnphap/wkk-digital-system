import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: ดึงหน่วยการเรียนรู้ทั้งหมดของ "วิชา" (ไม่ใช่ห้อง) — ครูทุกคนที่สอนวิชานี้เห็นชุดเดียวกัน
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subject_id = searchParams.get("subject_id");
  const academic_year_id = searchParams.get("academic_year_id");
  if (!subject_id) return NextResponse.json({ error: "missing subject_id" }, { status: 400 });

  const supabase = await createClient(); // ★ เพิ่ม await

  let query = supabase
    .from("subject_teaching_units")
    .select("*")
    .eq("subject_id", subject_id)
    .order("sort_order");
  if (academic_year_id) query = query.eq("academic_year_id", academic_year_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ units: data ?? [] });
}

// POST: บันทึกทั้งชุด (ลบของเดิมแล้วใส่ใหม่ทั้งหมดของวิชา+ปีนี้)
export async function POST(req: Request) {
  const supabase = await createClient(); // ★ เพิ่ม await
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  console.log("DEBUG current user:", user?.id, "error:", authErr?.message);
  const body = await req.json();
  const { subject_id, academic_year_id, rows, updated_by } = body as {
    subject_id: string;
    academic_year_id: string | null;
    rows: any[];
    updated_by: string | null;
  };
  if (!subject_id) return NextResponse.json({ error: "missing subject_id" }, { status: 400 });
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });

  const delQuery = supabase.from("subject_teaching_units").delete().eq("subject_id", subject_id);
  const { error: delErr } = academic_year_id
    ? await delQuery.eq("academic_year_id", academic_year_id)
    : await delQuery;
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  if (rows.length > 0) {
    const insertRows = rows.map((r, i) => ({
      subject_id,
      academic_year_id: academic_year_id ?? null,
      unit_no: r.unit_no ?? i + 1,
      unit_name: r.unit_name ?? "",
      indicators: r.indicators ?? "",
      learning_hours: r.learning_hours ?? null,
      score_points: r.score_points ?? null,
      note: r.note ?? null,
      sort_order: i,
      updated_by: updated_by ?? null,
    }));
    const { error: insErr } = await supabase.from("subject_teaching_units").insert(insertRows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}