import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSectionTeacherEmail } from "@/lib/student-portal/get-section-teacher-email";

// GET: ดึงไฟล์แนบทั้งหมดของงานชิ้นนี้ + คอมเมนต์ล่าสุด (ใช้แสดงในหน้า detail)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assignment_id = searchParams.get("assignment_id");
  const student_id = searchParams.get("student_id");
  if (!assignment_id || !student_id) {
    return NextResponse.json({ error: "missing assignment_id or student_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("assignment_submission_attachments")
    .select("*")
    .eq("assignment_id", assignment_id)
    .eq("student_id", student_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attachments: data ?? [] });
}

// POST: นักเรียนแนบไฟล์ / ลิงก์ / ข้อความ (multipart/form-data สำหรับไฟล์, JSON สำหรับลิงก์/ข้อความ)
export async function POST(req: Request) {
  const supabase = createAdminClient();
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      // ---- kind = 'file' ----
      const form = await req.formData();
      const assignment_id = form.get("assignment_id") as string;
      const student_id = form.get("student_id") as string;
      const subject_section_id = form.get("subject_section_id") as string;
      const file = form.get("file") as File | null;
      if (!assignment_id || !student_id || !subject_section_id || !file) {
        return NextResponse.json({ error: "missing required fields" }, { status: 400 });
      }

      const teacherEmail = await getSectionTeacherEmail(subject_section_id);
      if (!teacherEmail) {
        return NextResponse.json({ error: "ไม่พบครูผู้สอนของวิชานี้ จึงอัปโหลดไฟล์ไม่ได้" }, { status: 400 });
      }

      // ★ อัปโหลดขึ้น OneDrive ของครู ใช้ endpoint เดียวกับฝั่งครู
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("account", teacherEmail);
      uploadForm.append("path", `งานที่ส่ง/${assignment_id}/${student_id}/${Date.now()}-${file.name}`);

      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/upload-onedrive`, {
        method: "POST",
        body: uploadForm,
      });
      const uploadResult = await uploadRes.json();
      if (!uploadResult.ok || !uploadResult.url) {
        return NextResponse.json({ error: uploadResult.error ?? "อัปโหลดไฟล์ไม่สำเร็จ" }, { status: 500 });
      }

      const { data, error } = await supabase
        .from("assignment_submission_attachments")
        .insert({
          assignment_id,
          student_id,
          kind: "file",
          url: uploadResult.url,
          file_name: uploadResult.fileName || file.name,
        })
        .select()
        .maybeSingle();
      if (error) throw error;

      return NextResponse.json({ attachment: data });
    } else {
      // ---- kind = 'link' | 'text' ----
      const body = await req.json();
      const { assignment_id, student_id, kind, url, content } = body;
      if (!assignment_id || !student_id || !kind) {
        return NextResponse.json({ error: "missing required fields" }, { status: 400 });
      }
      if (kind === "link" && !url?.trim()) {
        return NextResponse.json({ error: "กรุณาใส่ลิงก์" }, { status: 400 });
      }
      if (kind === "text" && !content?.trim()) {
        return NextResponse.json({ error: "กรุณาใส่ข้อความ" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("assignment_submission_attachments")
        .insert({
          assignment_id,
          student_id,
          kind,
          url: kind === "link" ? url.trim() : null,
          content: kind === "text" ? content.trim() : null,
        })
        .select()
        .maybeSingle();
      if (error) throw error;

      return NextResponse.json({ attachment: data });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

// DELETE: ลบไฟล์/ลิงก์/ข้อความที่แนบไว้ (นร. ลบของตัวเองได้เสมอ ไม่ผูกกับสถานะยืนยันส่งงาน)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const student_id = searchParams.get("student_id"); // ★ กันลบข้าม account
  if (!id || !student_id) return NextResponse.json({ error: "missing id or student_id" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("assignment_submission_attachments")
    .delete()
    .eq("id", id)
    .eq("student_id", student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}