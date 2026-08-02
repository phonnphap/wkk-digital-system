import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/students/[id]/avatar — อัปโหลดรูป avatar ของนักเรียน
// ★ ต้องสร้าง Storage bucket ชื่อ "avatars" (public) ใน Supabase ก่อนใช้งาน:
//   Supabase Dashboard > Storage > New bucket > name: avatars, Public bucket: ON
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "ไม่พบไฟล์รูปภาพ" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PNG, JPG, WEBP, GIF" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 3MB กรุณาเลือกไฟล์ที่เล็กกว่านี้" }, { status: 400 });
    }

    const admin = createAdminClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `students/${params.id}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage.from("avatars").upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadErr) throw uploadErr;

    const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
    const avatar_url = pub.publicUrl;

    const { error: updErr } = await admin.from("students").update({ avatar_url }).eq("id", params.id);
    if (updErr) throw updErr;

    return NextResponse.json({ avatar_url });
  } catch (err: any) {
    console.error("[POST /api/students/[id]/avatar] error:", err);
    return NextResponse.json({ error: err?.message ?? "อัปโหลดรูปไม่สำเร็จ" }, { status: 500 });
  }
}