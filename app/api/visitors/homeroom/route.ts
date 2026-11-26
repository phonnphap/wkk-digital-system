import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js"; // TODO: ใช้ client เดียวกับ route อื่นของคุณ

export async function GET(req: NextRequest) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const isGuard = req.headers.get("x-guard-key") === process.env.GUARD_PIN; // TODO: ใช้วิธีตรวจรหัสเดิมของคุณ

  // TODO: ปรับชื่อตาราง/คอลัมน์ให้ตรง
  const { data, error } = await sb
    .from("classrooms")
    .select("id, name, grade, homeroom:classroom_teachers(teacher:teachers(full_name, phone))")
    .order("grade").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = new Map<string, any[]>();
  for (const c of data ?? []) {
    const list = map.get(c.grade) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      teachers: (c.homeroom ?? []).map((h: any) => ({
        name: h.teacher.full_name,
        phone: isGuard ? h.teacher.phone : null,
      })),
    });
    map.set(c.grade, list);
  }
  return NextResponse.json({ grades: [...map].map(([grade, classrooms]) => ({ grade, classrooms })) });
}