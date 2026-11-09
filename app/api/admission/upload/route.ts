import { NextResponse } from "next/server";
import { db, graphToken, odUrl, safe, limited, clientIp } from "@/lib/admission-server";
import { DOCS, folderFor } from "@/lib/admission-config";

export const runtime = "nodejs";
const out = (ok: boolean, error?: string, status = ok ? 200 : 400) =>
  NextResponse.json(ok ? { ok } : { ok, error }, { status });

export async function POST(req: Request) {
  if (limited("up:" + clientIp(req), 60)) return out(false, "อัปโหลดบ่อยเกินไป กรุณารอสักครู่", 429);

  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  const id = String(fd.get("applicationId") || "");
  const token = String(fd.get("token") || "");
  const docType = String(fd.get("docType") || "");

  if (!file || !id || !token) return out(false, "ข้อมูลไม่ครบ");
  if (!DOCS.some((d) => d.key === docType)) return out(false, "ประเภทเอกสารไม่ถูกต้อง");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) return out(false, "รองรับเฉพาะ PDF, JPG, PNG");
  if (file.size > 4 * 1024 * 1024) return out(false, "ไฟล์ใหญ่เกิน 4MB");

  const { data: app } = await db.from("admission_applications").select("*")
    .eq("id", id).eq("edit_token", token).maybeSingle();
  if (!app) return out(false, "ไม่พบใบสมัคร", 404);
  if (["approved", "rejected"].includes(app.status)) return out(false, "ใบสมัครนี้ปิดการแก้ไขแล้ว", 403);

  const path = `${folderFor(app.level, app.program, app.zone)}/${app.application_no}_${safe(app.first_name)}_${safe(app.last_name)}/${docType}.${ext}`;

  try {
    const res = await fetch(odUrl(path, ":/content?@microsoft.graph.conflictBehavior=replace"), {
      method: "PUT",
      headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": file.type || "application/octet-stream" },
      body: new Uint8Array(await file.arrayBuffer()),
    });
    if (!res.ok) {
      console.error("[admission upload]", res.status, await res.text());
      return out(false, "อัปโหลดไป OneDrive ไม่สำเร็จ", 502);
    }
  } catch (e) {
    console.error("[admission upload]", e);
    return out(false, "ระบบจัดเก็บไฟล์ขัดข้อง กรุณาลองใหม่", 502);
  }

  const { error } = await db.from("admission_documents").upsert({
    application_id: id, doc_type: docType, file_name: file.name, onedrive_path: path,
    status: "pending", note: null, uploaded_at: new Date().toISOString(),
  }, { onConflict: "application_id,doc_type" });
  if (error) return out(false, "บันทึกรายการเอกสารไม่สำเร็จ", 500);

  return out(true);
}