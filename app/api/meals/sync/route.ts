// app/api/meals/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { canEditRoom, getActor, syncMonth } from "@/lib/meals/server";
import type { CellStatus, MealType } from "@/lib/meals/shared";

// POST { classroomId, month, type, override?: { studentId, date, status: 'present'|'leave'|'absent'|null } }
// override.status = null → ยกเลิกการแก้มือ กลับไปใช้ค่าจากเช็คชื่อ
export async function POST(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      classroomId: string;
      month: string;
      type: MealType;
      override?: { studentId: string; date: string; status: CellStatus | null };
      clearManual?: boolean;
    };
    if (!body.classroomId || !/^\d{4}-\d{2}$/.test(body.month) || !["lunch", "milk"].includes(body.type)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (!canEditRoom(a, body.classroomId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.override && !/^\d{4}-\d{2}-\d{2}$/.test(body.override.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await syncMonth(a, body.classroomId, body.month, body.type, body.override, { clearManual: !!body.clearManual });
    if (result.locked) {
      return NextResponse.json({ error: "รายงานเดือนนี้ยืนยันแล้ว ต้องปลดล็อกก่อนจึงจะแก้ไขได้" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}