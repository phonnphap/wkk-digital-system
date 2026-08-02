import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/students/[id]/credentials — ตั้ง/เปลี่ยน username+password สำหรับล็อกอินของนักเรียน
// แยกจาก endpoint แก้ข้อมูลทั่วไป เพื่อไม่ชนกับ logic เดิมของหน้า students/page.tsx ที่ update ตรงผ่าน supabase client อยู่แล้ว
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { username, password } = await req.json();
    if (!username?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "กรุณากรอก Username และรหัสผ่านให้ครบ" }, { status: 400 });
    }

    const admin = createAdminClient();
    const password_hash = await bcrypt.hash(password, 10);

    const { data: existing } = await admin
      .from("student_credentials")
      .select("student_id")
      .eq("student_id", params.id)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("student_credentials")
        .update({ username: username.trim(), password_hash, password_reset_at: new Date().toISOString() })
        .eq("student_id", params.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("student_credentials")
        .insert([{ student_id: params.id, username: username.trim(), password_hash }]);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "Username นี้มีคนใช้แล้ว กรุณาตั้งชื่ออื่น" }, { status: 409 });
    }
    console.error("[POST /api/students/[id]/credentials] error:", err);
    return NextResponse.json({ error: err?.message ?? "ตั้งรหัสผ่านไม่สำเร็จ" }, { status: 500 });
  }
}