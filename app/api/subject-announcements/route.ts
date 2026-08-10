import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/subject-announcements?subject_section_id=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subject_announcements")
      .select("*")
      .eq("subject_section_id", subject_section_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ announcements: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/subject-announcements] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดประกาศไม่สำเร็จ" }, { status: 500 });
  }
}

// POST /api/subject-announcements
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, title, content, created_by } = body as {
      subject_section_id: string;
      title: string;
      content?: string;
      created_by?: string;
    };
    if (!subject_section_id || !title) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id และ title" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subject_announcements")
      .insert({
        subject_section_id,
        title,
        content: content || null,
        created_by: created_by || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ announcement: data });
  } catch (err: any) {
    console.error("[POST /api/subject-announcements] error:", err);
    return NextResponse.json({ error: err?.message ?? "โพสต์ประกาศไม่สำเร็จ" }, { status: 500 });
  }
}