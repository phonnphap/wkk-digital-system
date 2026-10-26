// app/api/meals/sheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildSheet, canAccessRoom, canEditRoom, getActor, listClassrooms, syncMonth } from "@/lib/meals/server";
import { currentMonth, type MealType } from "@/lib/meals/shared";

// GET /api/meals/sheet?month=2026-10                       → รายชื่อห้องที่เปิดดูได้
// GET /api/meals/sheet?classroomId=..&month=..&type=lunch  → ตารางรายเดือน (&sync=1 = ดึงจากเช็คชื่อก่อน)
export async function GET(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams;
    const classroomId = q.get("classroomId");
    const month = q.get("month") ?? currentMonth();
    const type: MealType = q.get("type") === "milk" ? "milk" : "lunch";

    if (!classroomId) {
      return NextResponse.json({ classrooms: await listClassrooms(a, false) });
    }
    if (!canAccessRoom(a, classroomId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
    if (q.get("sync") === "1" && canEditRoom(a, classroomId)) {
      await syncMonth(a, classroomId, month, type);
    }
    return NextResponse.json({ sheet: await buildSheet(a, classroomId, month, type) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}