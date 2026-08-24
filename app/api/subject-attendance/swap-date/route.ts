import { NextRequest, NextResponse } from "next/server";
// สมมติว่ามี server-side supabase client แบบเดียวกับที่ใช้ในเราท์อื่น ๆ ของโปรเจกต์
// ปรับ path ให้ตรงกับของจริง เช่น "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server";

const REASONS = ["makeup", "emergency", "other"] as const;
type Reason = (typeof REASONS)[number];

// POST /api/subject-attendance/swap-date
// body: { timetable_entry_id, from_date, to_date, reason?, reason_note?, created_by? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      timetable_entry_id,
      from_date,
      to_date,
      reason,
      reason_note,
      created_by,
    } = body ?? {};

    if (!timetable_entry_id || !from_date || !to_date) {
      return NextResponse.json(
        { error: "กรุณาระบุ timetable_entry_id, from_date และ to_date" },
        { status: 400 }
      );
    }
    if (from_date === to_date) {
      return NextResponse.json(
        { error: "วันที่ใหม่ต้องไม่ตรงกับวันเดิม" },
        { status: 400 }
      );
    }

    const finalReason: Reason = REASONS.includes(reason) ? reason : "other";

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("class_reschedules")
      .upsert(
        {
          timetable_entry_id,
          original_date: from_date,
          new_date: to_date,
          reason: finalReason,
          reason_note: reason_note || null,
          created_by: created_by || null,
        },
        { onConflict: "timetable_entry_id,original_date" }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ reschedule: data });
  } catch (err: any) {
    console.error("swap-date POST error:", err);
    return NextResponse.json(
      { error: err?.message ?? "สลับวันไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

// GET /api/subject-attendance/swap-date?timetable_entry_id=...&date=YYYY-MM-DD
// ถ้าใส่ date จะได้เฉพาะรายการที่ date นี้เป็น original_date หรือ new_date (ใช้เช็กว่าคาบวันนี้ถูกย้ายหรือย้ายมา)
// ถ้าไม่ใส่ date จะได้ประวัติการสลับทั้งหมดของคาบนี้
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timetable_entry_id = searchParams.get("timetable_entry_id");
    const date = searchParams.get("date");

    if (!timetable_entry_id) {
      return NextResponse.json(
        { error: "กรุณาระบุ timetable_entry_id" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    let query = supabase
      .from("class_reschedules")
      .select("*")
      .eq("timetable_entry_id", timetable_entry_id);

    if (date) {
      query = query.or(`original_date.eq.${date},new_date.eq.${date}`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ reschedules: data ?? [] });
  } catch (err: any) {
    console.error("swap-date GET error:", err);
    return NextResponse.json(
      { error: err?.message ?? "โหลดข้อมูลไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

// DELETE /api/subject-attendance/swap-date?id=...
// ยกเลิกการสลับวัน (คาบกลับไปเป็นวันเดิมตามตารางปกติ)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "กรุณาระบุ id" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from("class_reschedules").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("swap-date DELETE error:", err);
    return NextResponse.json(
      { error: err?.message ?? "ยกเลิกการสลับวันไม่สำเร็จ" },
      { status: 500 }
    );
  }
}