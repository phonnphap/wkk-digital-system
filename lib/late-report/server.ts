import { createClient as createSb, SupabaseClient } from "@supabase/supabase-js";
import { renderMemo, MemoData } from "./pdf";
import { FOLDERS } from "./rows";
import { uploadToDrive } from "./drive";

export const admin = () =>
  createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

// ★ ปรับให้ตรงกับคอลัมน์ชื่อใน users ของคุณ
export const personName = (u: any) =>
  (u.full_name ?? `${u.prefix ?? u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`).trim() || u.email || "";

export async function getSig(db: SupabaseClient, p?: string | null) {
  if (!p) return null;
  // ★ ลายเซนจากระบบลาเก็บเป็น data URL ใน users.signature_url — ถอดรหัสใช้ตรง ๆ
  if (p.startsWith("data:image")) {
    const b64 = p.split(",")[1] ?? "";
    return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
  }
  const { data } = await db.storage.from("signatures").download(p);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

export async function loadMemoData(db: SupabaseClient, id: string) {
  const { data: report, error } = await db
    .from("late_reports").select("*, late_report_steps(*)").eq("id", id).single();
  if (error || !report) throw new Error("ไม่พบรายงาน");
  const steps = [...report.late_report_steps].sort((a: any, b: any) => a.step - b.step);
  const data: MemoData = {
    reportDate: report.report_date,
    rows: report.rows,
    total: report.total,
    reporter: { name: report.reporter_name, signature: await getSig(db, report.reporter_signature_path) },
    steps: await Promise.all(
      steps.map(async (s: any) => ({
        label: s.step_label, name: s.approver_name, position: s.approver_position,
        status: s.status, comment: s.comment, actedAt: s.acted_at,
        signature: s.status === "approved" ? await getSig(db, s.signature_path) : null,
      }))
    ),
  };
  return { report, data };
}

/** อนุมัติครบ → สร้าง PDF 2 แบบ เก็บใน bucket late-reports (signed/ และ unsigned/) */
export async function finalizeReport(db: SupabaseClient, id: string) {
  const { report, data } = await loadMemoData(db, id);
  const paths: Record<string, string> = {};
  for (const v of ["signed", "unsigned"] as const) {
    const bytes = await renderMemo(data, v);
    const key = `${FOLDERS[v].prefix}/${report.report_date}.pdf`;
    const { error } = await db.storage.from("late-reports").upload(key, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    paths[v] = key;
    // สำรองขึ้น Google Drive ของ general@khienkhet.ac.th (ถ้าตั้งค่า env ไว้) — พลาดก็ไม่ทำให้การอนุมัติล้ม
    uploadToDrive(FOLDERS[v].label, `${FOLDERS[v].label}_${report.report_date}.pdf`, bytes)
      .catch((e) => console.error("[late-report] drive upload failed:", e));
  }
  await db.from("late_reports")
    .update({ signed_pdf_path: paths.signed, unsigned_pdf_path: paths.unsigned, finalized_at: new Date().toISOString() })
    .eq("id", id);
}