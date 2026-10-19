import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaller } from "@/lib/auth/getCaller";

export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) {
      return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    const student_id = searchParams.get("student_id");
    if (!subject_section_id || !student_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id และ student_id" }, { status: 400 });
    }
    // นักเรียนอ่านได้เฉพาะของตัวเอง
    if (caller.kind === "student" && caller.studentId !== student_id) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("student_subject_comments")
      .select("comment")
      .eq("subject_section_id", subject_section_id)
      .eq("student_id", student_id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ comment: data?.comment ?? "" });
  } catch (err: any) {
    console.error("[GET /api/student-subject-comments] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดคอมเมนต์ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller || caller.kind !== "staff") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
    }
    const body = await req.json();
    const { subject_section_id, student_id, comment, updated_by } = body as {
      subject_section_id: string; student_id: string; comment: string; updated_by?: string | null;
    };
    if (!subject_section_id || !student_id) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("student_subject_comments")
      .upsert(
        { subject_section_id, student_id, comment, updated_by: updated_by ?? null, updated_at: new Date().toISOString() },
        { onConflict: "subject_section_id,student_id" }
      )
      .select("comment")
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ comment: data?.comment ?? comment });
  } catch (err: any) {
    console.error("[POST /api/student-subject-comments] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกคอมเมนต์ไม่สำเร็จ" }, { status: 500 });
  }
}