import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ★ ใช้ pattern เดียวกับระบบลา — resolve OneDrive download URL ให้สดก่อนส่งออกไปนอกระบบ
// เพราะ @microsoft.graph.downloadUrl ที่เก็บไว้ตอนอัปโหลดจะหมดอายุหลังผ่านไประยะหนึ่ง
async function resolveAttachmentUrl(
  documentPath?: string | null,
  fallbackUrl?: string | null
): Promise<string | null> {
  if (!documentPath) return fallbackUrl ?? null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://system.khienkhet.ac.th";
    const res = await fetch(`${baseUrl}/api/resolve-onedrive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: documentPath }),
    });
    const json = await res.json();
    if (json.ok && json.downloadUrl) return json.downloadUrl as string;
  } catch {
    // เงียบไว้ ใช้ fallback
  }
  return fallbackUrl ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from")
    ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get("to")
    ?? new Date(Date.now() + 90*24*60*60*1000).toISOString().slice(0,10);

  // ★ เพิ่ม attachment_urls และ attachment_paths เข้าไปใน select
  // (ถ้า column attachment_paths ยังไม่มีใน DB ให้ลบออกจาก select ชั่วคราว แล้วใช้แค่ attachment_urls)
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, description, start_date, end_date, start_time, end_time, is_all_day, location, categories, target_roles, color_override, attachment_urls, attachment_paths")
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

  // ★ resolve รูปภาพแรกของแต่ละ event ให้เป็น URL ที่สดใช้งานได้จริง ก่อนส่งให้ Wix
  const withFreshImages = await Promise.all(
    filtered.map(async (ev: any) => {
      const path = ev.attachment_paths?.[0] ?? null;
      const fallback = ev.attachment_urls?.[0] ?? null;

      let image_url: string | null = null;
      if (path || fallback) {
        image_url = await resolveAttachmentUrl(path, fallback);
      }

      // ส่ง field เดิมทั้งหมดกลับไปเหมือนเดิม + เพิ่ม image_url ที่ Wix ใช้อยู่แล้ว
      const { attachment_paths, attachment_urls, ...rest } = ev;
      return {
        ...rest,
        image_url,
      };
    })
  );

  return NextResponse.json(withFreshImages, {
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