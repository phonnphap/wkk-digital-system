import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }
    const admin = createAdminClient();

    // ★ join ไฟล์แนบมาด้วยในคำสั่งเดียว (ต้องมี FK: subject_announcement_attachments.announcement_id -> subject_announcements.id)
    const { data, error } = await admin
      .from("subject_announcements")
      .select("*, attachments:subject_announcement_attachments(*)")
      .eq("subject_section_id", subject_section_id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // ★ แนบชื่อครูผู้โพสต์ (join เองเพราะ created_by อ้างถึง profiles)
    const creatorIds = Array.from(new Set((data ?? []).map((a: any) => a.created_by).filter(Boolean)));
    let profileMap: Record<string, { full_name: string | null; email: string }> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await admin.from("profiles").select("id, email, full_name").in("id", creatorIds);
      profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
    }
    const announcements = (data ?? []).map((a: any) => ({
      ...a,
      creator: profileMap[a.created_by] ?? null,
    }));

    return NextResponse.json({ announcements });
  } catch (err: any) {
    console.error("[GET /api/subject-announcements] error:", err);
    return NextResponse.json({ error: err?.message ?? "โหลดประกาศไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, title, content, created_by, attachments } = body as {
      subject_section_id: string;
      title: string;
      content?: string;
      created_by?: string;
      attachments?: { kind: "file" | "link"; url: string; file_name?: string }[];
    };
    if (!subject_section_id || !title) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id และ title" }, { status: 400 });
    }
    const admin = createAdminClient();

    const { data: ann, error } = await admin
      .from("subject_announcements")
      .insert({ subject_section_id, title, content: content || null, created_by: created_by || null })
      .select("*")
      .single();
    if (error) throw error;

    if (attachments && attachments.length > 0) {
      const { error: attErr } = await admin.from("subject_announcement_attachments").insert(
        attachments.map(a => ({ announcement_id: ann.id, kind: a.kind, url: a.url, file_name: a.file_name || null }))
      );
      if (attErr) console.error("[POST /api/subject-announcements] attachment error:", attErr);
    }

    return NextResponse.json({ announcement: ann });
  } catch (err: any) {
    console.error("[POST /api/subject-announcements] error:", err);
    return NextResponse.json({ error: err?.message ?? "โพสต์ประกาศไม่สำเร็จ" }, { status: 500 });
  }
}
// ★ ใหม่ — ใช้ตอนกดแก้ไขประกาศ
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json();
    const { id: bodyId, title, content, attachments } = body as {
      id?: string;
      title?: string;
      content?: string;
      attachments?: { kind: "file" | "link"; url: string; file_name?: string }[];
    };

    const id = searchParams.get("id") || bodyId;
    if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

    const admin = createAdminClient();

    const updatePayload: Record<string, any> = {};
    if (title !== undefined) updatePayload.title = title;
    if (content !== undefined) updatePayload.content = content;

    const { data: ann, error } = await admin
      .from("subject_announcements")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    if (attachments) {
      await admin.from("subject_announcement_attachments").delete().eq("announcement_id", id);
      if (attachments.length > 0) {
        const { error: attErr } = await admin.from("subject_announcement_attachments").insert(
          attachments.map(a => ({ announcement_id: id, kind: a.kind, url: a.url, file_name: a.file_name || null }))
        );
        if (attErr) console.error("[PATCH /api/subject-announcements] attachment error:", attErr);
      }
    }

    return NextResponse.json({ announcement: ann });
  } catch (err: any) {
    console.error("[PATCH /api/subject-announcements] error:", err);
    return NextResponse.json({ error: err?.message ?? "แก้ไขประกาศไม่สำเร็จ" }, { status: 500 });
  }
}

// ★ ใหม่ — ใช้ตอนกดลบประกาศ
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
    const admin = createAdminClient();
    await admin.from("subject_announcement_attachments").delete().eq("announcement_id", id);
    const { error } = await admin.from("subject_announcements").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[DELETE /api/subject-announcements] error:", err);
    return NextResponse.json({ error: err?.message ?? "ลบประกาศไม่สำเร็จ" }, { status: 500 });
  }
}