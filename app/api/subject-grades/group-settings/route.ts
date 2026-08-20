import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/subject-grades/group-settings
// body: { group_code: string, display_name?: string, weights: { subject_id: string, weight_percent: number }[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { group_code, display_name, weights } = body ?? {};
    if (!group_code) {
      return NextResponse.json({ error: "ต้องระบุ group_code" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { error: upsertErr } = await admin
      .from("subject_score_groups")
      .upsert({ group_code, display_name: display_name ?? null, updated_at: new Date().toISOString() }, { onConflict: "group_code" });
    if (upsertErr) throw upsertErr;

    if (Array.isArray(weights) && weights.length > 0) {
      const results = await Promise.all(
        weights.map((w: any) =>
          admin.from("subjects").update({ score_group_weight_percent: w.weight_percent }).eq("id", w.subject_id)
        )
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[POST /api/subject-grades/group-settings] error:", err);
    return NextResponse.json({ error: err?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}