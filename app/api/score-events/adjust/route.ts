// app/api/score-events/adjust/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/score-events/adjust
// ใช้ตอนครูแก้ไขคะแนนพิเศษ inline ในตาราง "คะแนนรวม"
// วิธีทำ: คำนวณส่วนต่าง (delta) ระหว่างค่าที่เห็นอยู่กับค่าใหม่ที่ครูพิมพ์ แล้วสร้าง score_event ใหม่
// (ไม่แก้ไข event เก่าตรง ๆ เพื่อให้ยังเห็นประวัติการให้/หักคะแนนทั้งหมดได้)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, student_id, preset_id, delta, created_by } = body as {
      subject_section_id: string;
      student_id: string;
      preset_id: string;
      delta: number;
      created_by?: string | null;
    };
    if (!subject_section_id || !student_id || !preset_id || typeof delta !== "number" || delta === 0) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ หรือค่าคะแนนไม่เปลี่ยนแปลง" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("score_events")
      .insert({
        subject_section_id,
        student_id,
        preset_id,
        points: delta,
        note: "ครูแก้ไขคะแนนจากตารางคะแนนรวม",
        created_by: created_by ?? null,
      })
      .select("*")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ event: data });
  } catch (err: any) {
    console.error("[POST /api/score-events/adjust] error:", err);
    return NextResponse.json({ error: err?.message ?? "แก้ไขคะแนนไม่สำเร็จ" }, { status: 500 });
  }
}