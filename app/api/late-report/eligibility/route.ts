// path: app/api/late-report/eligibility/route.ts — ใครสร้างรายงานวันไหนได้ + ครูเวรของวันนั้น
import { NextResponse } from "next/server";
import { getMe } from "@/lib/visitors/admin-auth";
import { admin, personName } from "@/lib/late-report/server";
import { lateDutyTeacherIds } from "@/lib/late-report/duty";
import { bangkokToday } from "@/lib/late-report/rows";

export async function GET(req: Request) {
  const who = await getMe(req);
  if (!who) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = bangkokToday();
  const isAdmin = who.role === "admin";
  let date = new URL(req.url).searchParams.get("date") || today;
  if (!isAdmin || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) date = today;   // เฉพาะแอดมินเลือกวันย้อนหลังได้

  const db = admin();
  const dutyIds = await lateDutyTeacherIds(db, date);
  const { data: ts } = dutyIds.length ? await db.from("users").select("*").in("id", dutyIds) : { data: [] as any[] };
  const teachers = dutyIds
    .map((id) => (ts ?? []).find((t: any) => t.id === id))
    .filter(Boolean)
    .map((t: any) => ({ id: t.id as string, name: personName(t), hasSignature: !!t.signature_url }));

  const isDuty = dutyIds.includes(who.id);
  return NextResponse.json({ date, isAdmin, isDuty, canCreate: isAdmin || isDuty, teachers });
}