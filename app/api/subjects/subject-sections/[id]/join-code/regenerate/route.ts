import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateJoinCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// POST /api/subject-sections/[id]/join-code/regenerate — สุ่มรหัสเข้าวิชาใหม่
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; // ★ Next.js 15+/16: ต้อง await params ก่อนใช้เสมอ
    const admin = createAdminClient();

    let updated: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 5 && !updated; attempt++) {
      const join_code = generateJoinCode();
      const { data, error } = await admin
        .from("subject_sections")
        .update({ join_code })
        .eq("id", id)
        .select("*")
        .single();
      if (!error) { updated = data; break; }
      lastErr = error;
      if (error.code !== "23505") break;
    }

    if (!updated) throw lastErr ?? new Error("สุ่มรหัสใหม่ไม่สำเร็จ กรุณาลองใหม่");

    return NextResponse.json({ section: updated });
  } catch (err: any) {
    console.error("[POST /api/subject-sections/[id]/join-code/regenerate] error:", err);
    return NextResponse.json({ error: err?.message ?? "สุ่มรหัสใหม่ไม่สำเร็จ" }, { status: 500 });
  }
}