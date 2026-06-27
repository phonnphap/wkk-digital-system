import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // ← ใช้ anon key แทนก่อน
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") 
    ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get("to") 
    ?? new Date(Date.now() + 90*24*60*60*1000).toISOString().slice(0,10);

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, description, start_date, end_date, start_time, end_time, is_all_day, location, categories, target_roles, color_override")
    .eq("status", "approved")
    .gte("end_date", from)
    .lte("start_date", to)
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // กรองเฉพาะ all / student / parent
  const filtered = (data ?? []).filter((ev: any) => {
    const roles: string[] = ev.target_roles ?? [];
    return roles.includes("all") || roles.includes("student") || roles.includes("parent");
  });

  return NextResponse.json(filtered, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=300",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}