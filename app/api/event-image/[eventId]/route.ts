// app/api/event-image/[eventId]/route.ts
// แก้สำหรับ Next.js 15: params เปลี่ยนเป็น Promise ต้อง await ก่อนใช้งาน
// (Next.js 14 เดิม params เป็น object ตรงๆ ไม่ต้อง await)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ★ ฟังก์ชันเดียวกับที่ใช้ในระบบลาและ /api/public-events —
// ขอลิงก์ดาวน์โหลดสดจาก OneDrive ผ่าน /api/resolve-onedrive
// เพราะ @microsoft.graph.downloadUrl ที่เก็บไว้ตอนอัปโหลดจะหมดอายุ
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  // ★ Next.js 15 — params เป็น Promise ต้อง await ก่อนดึงค่า
  const { eventId } = await params;

  if (!eventId) {
    return NextResponse.json({ error: "missing eventId" }, { status: 400 });
  }

  const { data: event, error } = await supabase
    .from("calendar_events")
    .select("attachment_paths, attachment_urls")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return NextResponse.json({ error: "event not found" }, { status: 404 });
  }

  const path     = event.attachment_paths?.[0] ?? null;
  const fallback = event.attachment_urls?.[0] ?? null;

  if (!path && !fallback) {
    return NextResponse.json({ error: "no attachment" }, { status: 404 });
  }

  const freshUrl = await resolveAttachmentUrl(path, fallback);

  if (!freshUrl) {
    return NextResponse.json({ error: "could not resolve url" }, { status: 404 });
  }

  return NextResponse.redirect(freshUrl);
}