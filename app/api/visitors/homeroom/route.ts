import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js"; // TODO: ใช้ client เดียวกับ route อื่นของคุณ
import { loadClassrooms } from "@/lib/homeroom";

export async function GET(req: NextRequest) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const isGuard = req.headers.get("x-guard-key") === process.env.GUARD_PIN; // TODO: ใช้วิธีตรวจรหัสเดิม

  try {
    const rooms = await loadClassrooms(sb);
    const map = new Map<string, any[]>();
    for (const c of rooms) {
      const list = map.get(c.grade) ?? [];
      list.push({
        id: c.id,
        name: c.name,
        teachers: c.teachers.map(t => ({ name: t.name, phone: isGuard ? t.phone : null })),
      });
      map.set(c.grade, list);
    }
    const grades = [...map].map(([grade, classrooms]) => ({ grade, classrooms }))
      .sort((a, b) => a.grade.localeCompare(b.grade, "th", { numeric: true }));
    return NextResponse.json({ grades });
  } catch (e: any) {
    console.error("homeroom:", e);
    return NextResponse.json({ error: e.message, hint: e.hint, details: e.details }, { status: 500 });
  }
}