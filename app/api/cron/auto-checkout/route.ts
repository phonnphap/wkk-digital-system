// path: app/api/cron/auto-checkout/route.ts
// Vercel Cron เรียกทุกวัน 10:00 UTC = 17:00 เวลาไทย (ดู vercel.json)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bkkDate, cutoff1700, dayRange, monthRange } from "@/lib/visitors/time";
import { summarize, Row } from "@/lib/visitors/summarize";
import { postTeams, summaryCard } from "@/lib/visitors/teams";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const today = bkkDate();
  const cutoff = cutoff1700(today).toISOString();

  // เช็คเอาท์คนที่ยังค้าง "inside" และเข้ามาก่อน 17:00 — บันทึกเวลาออก = 17:00 และติดธงว่าอัตโนมัติ
  // (คนที่เข้าหลัง 17:00 จะถูกปิดในรอบวันถัดไป)
  const { data: closed, error } = await db
    .from("visitors")
    .update({ status: "left", check_out_at: cutoff, auto_checked_out: true })
    .eq("status", "inside")
    .lte("check_in_at", cutoff)
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // สรุปรายวัน (และสรุปรายเดือนถ้าวันนี้เป็นวันสุดท้ายของเดือน) ส่งเข้า Teams ฝ่ายบริหาร
  const adminHook = process.env.TEAMS_ADMIN_WEBHOOK_URL;
  if (adminHook) {
    const d = dayRange(today);
    const { data: rows } = await db.from("visitors").select("*").gte("check_in_at", d.from).lt("check_in_at", d.to);
    await postTeams(adminHook, summaryCard(`📊 สรุปผู้มาติดต่อ ${today}`, summarize((rows ?? []) as Row[])));

    const tomorrow = bkkDate(new Date(Date.now() + 86400000));
    if (tomorrow.endsWith("-01")) {
      const ym = today.slice(0, 7);
      const m = monthRange(ym);
      const { data: mrows } = await db.from("visitors").select("*").gte("check_in_at", m.from).lt("check_in_at", m.to);
      await postTeams(adminHook, summaryCard(`📊 สรุปผู้มาติดต่อประจำเดือน ${ym}`, summarize((mrows ?? []) as Row[])));
    }
  }

  return NextResponse.json({ ok: true, autoCheckedOut: closed?.length ?? 0 });
}