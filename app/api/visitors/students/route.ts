// path: app/api/visitors/students/route.ts
// รายชื่อนักเรียน + ชื่อเล่นของห้องที่เลือก — รปภ. (ใส่ PIN แล้ว) หรือผู้ใช้ที่ล็อกอินเท่านั้น
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/visitor-server";
import { guardOrUser } from "@/lib/visitors/guard-auth";

export async function GET(req: Request) {
  if (!(await guardOrUser(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classroomId = new URL(req.url).searchParams.get("classroom_id");
  if (!classroomId) return NextResponse.json({ students: [] });

  const { data, error } = await adminClient()
    .from("students")
    .select("id, seat_number, prefix, first_name, last_name, nick_name, gender, birth_date")
    .eq("classroom_id", classroomId)
    .is("moved_out_at", null)
    .order("seat_number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ students: data ?? [] });
}