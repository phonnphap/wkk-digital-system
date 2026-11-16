// path: app/api/visitors/students/route.ts
// รปภ. (ต้องล็อกอิน) ดึงรายชื่อนักเรียน + ชื่อเล่นของห้องที่เลือก
import { NextResponse } from "next/server";
import { createClient as createSb } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classroomId = new URL(req.url).searchParams.get("classroom_id");
  if (!classroomId) return NextResponse.json({ students: [] });

  // ใช้ service role เพราะ role รปภ. อาจไม่มีสิทธิ์อ่านตาราง students ผ่าน RLS — คืนเฉพาะฟิลด์ที่จำเป็น
  const db = createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from("students")
    .select("id, seat_number, prefix, first_name, last_name, nick_name, gender, birth_date")
    .eq("classroom_id", classroomId)
    .is("moved_out_at", null)
    .order("seat_number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ students: data ?? [] });
}