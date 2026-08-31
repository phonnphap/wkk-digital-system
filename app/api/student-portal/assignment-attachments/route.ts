import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentSession } from "@/lib/studentAuth";

export async function GET(req: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assignmentId = searchParams.get("assignment_id");

  if (!assignmentId) {
    return NextResponse.json({ error: "ไม่ระบุ assignment_id" }, { status: 400 });
  }

  // ★ เช่นเดียวกับ /assignments: ตาราง assignments / assignment_attachments
  // มี RLS ที่รับเฉพาะ role "authenticated" (Supabase Auth) แต่หน้า student-portal
  // ใช้ custom session ไม่ได้ login ผ่าน Supabase Auth จึงวิ่งด้วย role "anon" เสมอ
  // ต้อง bypass RLS ด้วย service-role client เหมือนที่ทำไว้ใน /assignments
  const supabaseAdmin = createAdminClient();

  // เช็คก่อนว่างานนี้มีจริง และเป็นงานที่เผยแพร่แล้ว (กันดึงไฟล์แนบของงานที่เป็น draft)
  const { data: assignment } = await supabaseAdmin
    .from("assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .neq("status", "draft")
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "ไม่พบงานนี้ หรืองานยังไม่เปิดให้ดู" }, { status: 404 });
  }

  const { data: attachments, error } = await supabaseAdmin
    .from("assignment_attachments")
    .select("id, kind, url, file_name")
    .eq("assignment_id", assignmentId);

  if (error) {
    console.error("[student-portal/assignment-attachments] query error:", error);
    return NextResponse.json({ error: "ดึงไฟล์แนบไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ attachments: attachments ?? [] });
}