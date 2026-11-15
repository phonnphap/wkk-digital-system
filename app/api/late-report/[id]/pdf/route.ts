import { createClient } from "@/lib/supabase/server";
import { admin, loadMemoData, finalizeReport } from "@/lib/late-report/server";
import { renderMemo } from "@/lib/late-report/pdf";
import { FOLDERS } from "@/lib/late-report/rows";

// GET /api/late-report/:id/pdf?variant=unsigned|signed
//  - unsigned: ปริ้นท์ได้ทุกเมื่อ (มีเฉพาะลายเซนครูผู้รายงาน) สำหรับธุรการ
//  - signed  : ต้องอนุมัติครบแล้วเท่านั้น
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const variant = new URL(req.url).searchParams.get("variant") === "signed" ? "signed" : "unsigned";
  const db = admin();
  const { report, data } = await loadMemoData(db, id);

  let bytes: Uint8Array;
  if (variant === "signed") {
    if (report.status !== "approved") return new Response("ยังอนุมัติไม่ครบ", { status: 409 });
    if (!report.signed_pdf_path) await finalizeReport(db, id);
    const key = report.signed_pdf_path ?? `${FOLDERS.signed.prefix}/${report.report_date}.pdf`;
    const { data: file, error } = await db.storage.from("late-reports").download(key);
    if (error || !file) return new Response("ไม่พบไฟล์", { status: 404 });
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = await renderMemo(data, "unsigned");
  }

  const name = `${FOLDERS[variant].label}_${report.report_date}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}