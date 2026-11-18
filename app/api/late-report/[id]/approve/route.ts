import { NextResponse } from "next/server";
import { getMe } from "@/lib/visitors/admin-auth";
import { admin, finalizeReport } from "@/lib/late-report/server";

export const maxDuration = 60;
const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, comment } = await req.json();
  if (action !== "approve" && action !== "reject") return err("action ไม่ถูกต้อง", 400);

  const who = await getMe(req);
  if (!who) return err("ยังไม่ได้เข้าสู่ระบบ", 401);

  const db = admin();
  const { data: me } = await db.from("users").select("*").eq("id", who.id).maybeSingle();
  if (!me) return err("ไม่พบข้อมูลผู้ใช้", 403);

  const { data: steps } = await db.from("late_report_steps").select("*").eq("report_id", id).order("step");
  const cur = steps?.find((s: any) => s.status === "pending");
  if (!cur) return err("รายงานนี้ไม่อยู่ในขั้นรออนุมัติ", 409);
  if (cur.approver_id !== me.id) return err("ยังไม่ถึงคิวของคุณ หรือคุณไม่ใช่ผู้อนุมัติขั้นนี้", 403);
  if (action === "approve" && !me.signature_url) return err("ยังไม่มีลายเซนของคุณในระบบ", 400);
  if (action === "reject" && !String(comment ?? "").trim()) return err("กรุณาระบุเหตุผลที่ไม่อนุมัติ", 400);

  // อัปเดตแบบมีเงื่อนไข status=pending กันกดซ้ำ/ชนกัน
  const { data: upd } = await db.from("late_report_steps").update({
    status: action === "approve" ? "approved" : "rejected",
    comment: String(comment ?? "").trim() || null,
    signature_path: action === "approve" ? me.signature_url : null,
    acted_at: new Date().toISOString(),
  }).eq("id", cur.id).eq("status", "pending").select();
  if (!upd?.length) return err("รายการนี้ถูกดำเนินการไปแล้ว", 409);

  if (action === "reject") {
    await db.from("late_reports").update({ status: "rejected", reject_reason: String(comment).trim() }).eq("id", id);
    return NextResponse.json({ status: "rejected" });
  }

  // ขั้นที่ตั้ง auto_follow (ก่อนหรือหลังขั้นนี้) → อนุมัติให้ทันทีด้วยลายเซนของผู้อนุมัติขั้นนั้น
  const remaining: any[] = steps!.filter((s: any) => s.id !== cur.id && s.status === "waiting");
  for (const s of remaining) {
    if (!s.auto_follow) continue;
    const { data: u } = await db.from("users").select("signature_url").eq("id", s.approver_id).maybeSingle();
    if (!u?.signature_url) continue; // ไม่มีลายเซนในระบบ → ปล่อยให้ผู้นั้นกดอนุมัติเอง
    await db.from("late_report_steps").update({
      status: "approved", signature_path: u.signature_url, acted_at: new Date().toISOString(),
    }).eq("id", s.id);
    s.status = "approved";
  }
  const next = remaining.find((s: any) => s.status === "waiting");
  if (next) {
    await db.from("late_report_steps").update({ status: "pending" }).eq("id", next.id);
    // TODO: แจ้งเตือน next.approver_id
    return NextResponse.json({ status: "pending", next_step: next.step });
  }

  await db.from("late_reports").update({ status: "approved" }).eq("id", id);
  let upload_warning: string | null = null;
  try {
    const r = await finalizeReport(db, id); // สร้าง PDF 2 แบบ + ส่งขึ้น OneDrive
    if (r.onedriveErrors.length) upload_warning = r.onedriveErrors.join("; ");
  } catch (e: any) {
    upload_warning = String(e?.message ?? e);
    // อนุมัติสำเร็จแล้ว แต่สร้างไฟล์พลาด → route pdf จะสร้างให้ใหม่อัตโนมัติตอนมีคนเปิด
    console.error("[late-report] finalize failed:", e);
  }
  return NextResponse.json({ status: "approved", upload_warning });
}