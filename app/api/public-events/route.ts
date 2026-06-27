import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ใช้ service role เพื่อดึงข้อมูลโดยไม่ต้อง login
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? new Date().toISOString().slice(0,10);
  const to   = searchParams.get("to")   ?? 
    new Date(Date.now() + 90*24*60*60*1000).toISOString().slice(0,10);

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, description, start_date, end_date, start_time, end_time, is_all_day, location, categories, target_roles")
    .eq("status", "approved")  // ✅ เฉพาะที่อนุมัติแล้ว
    // ✅ เฉพาะกิจกรรมที่กลุ่มเป้าหมายเป็น all / student / parent
    .or("target_roles.cs.{all},target_roles.cs.{student},target_roles.cs.{parent}")
    .gte("end_date", from)
    .lte("start_date", to)
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ✅ อนุญาต Wix เรียกได้ (CORS)
  return NextResponse.json(data, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, s-maxage=300", // cache 5 นาที
    },
  });
}

// รองรับ preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}