// app/api/assignments/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/assignments/reorder
// body: { subject_section_id: string, ordered_ids: string[] }
// บันทึกลำดับคอลัมน์ชิ้นงานที่ครูลากสลับ ลง sort_order ใน DB
// เพื่อให้ทุกคน (ครู/นักเรียน/ทุกเบราว์เซอร์) เห็นลำดับคอลัมน์เดียวกันเสมอ
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_section_id, ordered_ids } = body as {
      subject_section_id?: string;
      ordered_ids?: string[];
    };

    if (!subject_section_id || !Array.isArray(ordered_ids) || ordered_ids.length === 0) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบถ้วน" }, { status: 400 });
    }

    // ★ เฉพาะครู/staff เท่านั้นที่สลับลำดับได้ (นักเรียนไม่ควรเรียก endpoint นี้ได้เลย)
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("id")
      .eq("auth_id", authUser.id)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
    }

    // ★ กันไม่ให้ id ของ assignment จาก section อื่นหลุดเข้ามาปนใน ordered_ids
    const { data: validAssignments, error: checkErr } = await admin
      .from("assignments")
      .select("id")
      .eq("subject_section_id", subject_section_id)
      .in("id", ordered_ids);
    if (checkErr) throw checkErr;

    const validIds = new Set((validAssignments ?? []).map((a: any) => a.id));
    const safeOrderedIds = ordered_ids.filter((id) => validIds.has(id));
    if (safeOrderedIds.length === 0) {
      return NextResponse.json({ error: "ไม่พบชิ้นงานที่ตรงกับวิชานี้" }, { status: 400 });
    }

    // ★ อัปเดต sort_order ทีละชิ้นตามตำแหน่งใน array
    const updates = safeOrderedIds.map((id, index) =>
      admin.from("assignments").update({ sort_order: index }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/assignments/reorder] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกลำดับไม่สำเร็จ" }, { status: 500 });
  }
}