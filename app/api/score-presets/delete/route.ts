// app/api/score-presets/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/score-presets/delete   body: { preset_id: string }
// - ถ้าไม่มี score_events อ้างถึงการ์ดนี้เลย (ว่างเปล่า) -> ลบแถวออกจากตารางได้ตรง ๆ
// - ถ้ามี score_events อ้างถึงอยู่ -> ปลด preset_id ของ events เหล่านั้นเป็น null ก่อน
//   (กันชน FK + ทำให้คะแนนเก่าจากการ์ดนี้ไม่ถูกนับรวมในหน้าคะแนนรวมอีกต่อไป) แล้วค่อยลบการ์ด
export async function POST(req: NextRequest) {
  try {
    const { preset_id } = await req.json();
    if (!preset_id) {
      return NextResponse.json({ error: "ต้องระบุ preset_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { count, error: countErr } = await admin
      .from("score_events")
      .select("id", { count: "exact", head: true })
      .eq("preset_id", preset_id);
    if (countErr) throw countErr;

    if (count && count > 0) {
      const { error: detachErr } = await admin
        .from("score_events")
        .update({ preset_id: null })
        .eq("preset_id", preset_id);
      if (detachErr) throw detachErr;
    }

    const { error: delErr } = await admin.from("score_presets").delete().eq("id", preset_id);
    if (delErr) throw delErr;

    return NextResponse.json({ success: true, detachedEvents: count ?? 0 });
  } catch (err: any) {
    console.error("[POST /api/score-presets/delete] error:", err);
    return NextResponse.json({ error: err?.message ?? "ลบการ์ดคะแนนไม่สำเร็จ" }, { status: 500 });
  }
}