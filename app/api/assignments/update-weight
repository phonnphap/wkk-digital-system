import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";


export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
    }

    const { assignment_id, allow_weight, weight_percent } = body ?? {};

    if (!assignment_id || typeof assignment_id !== "string") {
      return NextResponse.json({ error: "ต้องระบุ assignment_id" }, { status: 400 });
    }

    // แปลง weight_percent ให้ปลอดภัยก่อน (กันเคส "" หรือ string ที่ไม่ใช่ตัวเลข)
    const parsedWeight =
      weight_percent === null || weight_percent === undefined || weight_percent === ""
        ? null
        : Number(weight_percent);

    if (allow_weight && (parsedWeight === null || Number.isNaN(parsedWeight))) {
      return NextResponse.json({ error: "ต้องระบุ % น้ำหนักคะแนนเมื่อเปิดใช้งาน" }, { status: 400 });
    }
    if (allow_weight && (parsedWeight! < 0 || parsedWeight! > 100)) {
      return NextResponse.json({ error: "% น้ำหนักคะแนนต้องอยู่ระหว่าง 0 - 100" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("assignments")
      .update({
        allow_weight: !!allow_weight,
        weight_percent: allow_weight ? parsedWeight : null,
      })
      .eq("id", assignment_id)
      .select("id, allow_weight, weight_percent")
      .maybeSingle();

    if (error) throw error;
    if (!updated) {
      return NextResponse.json({ error: "ไม่พบงานที่มอบหมายนี้" }, { status: 404 });
    }

    return NextResponse.json({ assignment: updated });
  } catch (err: any) {
    console.error("[POST /api/assignments/update-weight] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "บันทึกน้ำหนักคะแนนไม่สำเร็จ" },
      { status: 500 }
    );
  }
}