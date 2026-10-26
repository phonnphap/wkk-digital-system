// app/api/meals/measurements/route.ts
import { NextRequest, NextResponse } from "next/server";
import { canEditRoom, getActor } from "@/lib/meals/server";

// POST { classroomId, month, studentId, weight: number|null, height: number|null }
export async function POST(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const b = (await req.json()) as {
      classroomId: string; month: string; studentId: string;
      weight: number | null; height: number | null;
    };
    if (!b.classroomId || !b.studentId || !/^\d{4}-\d{2}$/.test(b.month)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (!canEditRoom(a, b.classroomId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ต้องเป็นนักเรียนในห้องนี้จริง
    const { data: st } = await a.service
      .from("students").select("student_id")
      .eq("student_id", b.studentId).eq("classroom_id", b.classroomId).maybeSingle();
    if (!st) return NextResponse.json({ error: "ไม่พบนักเรียนในห้องนี้" }, { status: 404 });

    const clean = (v: number | null, lo: number, hi: number) =>
      v == null || Number.isNaN(Number(v)) ? null : Math.min(hi, Math.max(lo, Math.round(Number(v) * 10) / 10));

    const { error } = await a.service.from("meal_month_measures").upsert(
      { student_id: b.studentId, month: b.month, weight_kg: clean(b.weight, 3, 200), height_cm: clean(b.height, 40, 230) },
      { onConflict: "student_id,month" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}