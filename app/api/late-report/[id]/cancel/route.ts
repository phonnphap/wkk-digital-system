// path: app/api/late-report/[id]/cancel/route.ts — แอดมินยกเลิก (ลบ) รายงานจับสาย
import { NextResponse } from "next/server";
import { getMe } from "@/lib/visitors/admin-auth";
import { admin } from "@/lib/late-report/server";
import { deleteFromOneDrive, oneDriveFileName } from "@/lib/late-report/onedrive";
import { FOLDERS } from "@/lib/late-report/rows";

const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe(req);
  if (!me) return err("ยังไม่ได้เข้าสู่ระบบ", 401);
  if (me.role !== "admin") return err("เฉพาะแอดมินเท่านั้นที่ยกเลิกรายงานได้", 403);

  const db = admin();
  const { data: report } = await db.from("late_reports").select("id, report_date, signed_pdf_path, unsigned_pdf_path").eq("id", id).maybeSingle();
  if (!report) return err("ไม่พบรายงาน", 404);

  // ลบไฟล์ PDF ที่สร้างไว้ (ถ้ามี) แล้วลบรายงาน — ขั้นอนุมัติถูกลบตามอัตโนมัติ (on delete cascade)
  const files = [report.signed_pdf_path, report.unsigned_pdf_path].filter(Boolean) as string[];
  if (files.length) await db.storage.from("late-reports").remove(files);

  // ลบไฟล์ใน OneDrive (ถ้ามี/ตั้งค่าไว้) — พลาดก็ไม่เป็นไร
  if (files.length) {
    for (const v of ["signed", "unsigned"] as const) {
      try { await deleteFromOneDrive(FOLDERS[v].label, oneDriveFileName(report.report_date)); } catch (e) { console.warn("[late-report] onedrive delete:", e); }
    }
  }

  const { error } = await db.from("late_reports").delete().eq("id", id);
  if (error) return err("ยกเลิกไม่สำเร็จ: " + error.message, 500);
  return NextResponse.json({ ok: true });
}