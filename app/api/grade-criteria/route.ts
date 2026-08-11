// app/api/grade-criteria/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/grade-criteria?subject_section_id=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("grade_criteria")
      .select("id, max_percent, min_percent, grade, sort_order")
      .eq("subject_section_id", subject_section_id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ criteria: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/grade-criteria] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดเกณฑ์เกรดไม่สำเร็จ" }, { status: 500 });
  }
}

// POST /api/grade-criteria — บันทึกทั้งชุด (ลบของเก่าทิ้งแล้วใส่ใหม่ทั้งหมด ง่ายกว่าไล่ diff ทีละแถว)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, rows } = body as {
      subject_section_id: string;
      rows: { max_percent: number; min_percent: number; grade: string }[];
    };
    if (!subject_section_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { error: delErr } = await admin
      .from("grade_criteria")
      .delete()
      .eq("subject_section_id", subject_section_id);
    if (delErr) throw delErr;

    if (rows.length === 0) {
      return NextResponse.json({ criteria: [] });
    }

    const insertRows = rows.map((r, i) => ({
      subject_section_id,
      max_percent: r.max_percent,
      min_percent: r.min_percent,
      grade: r.grade,
      sort_order: i,
    }));

    const { data, error } = await admin.from("grade_criteria").insert(insertRows).select("*");
    if (error) throw error;

    return NextResponse.json({ criteria: data ?? [] });
  } catch (err: any) {
    console.error("[POST /api/grade-criteria] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกเกณฑ์เกรดไม่สำเร็จ" }, { status: 500 });
  }
}