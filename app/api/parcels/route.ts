// path: app/api/parcels/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/visitor-server";
import { notifyParcel } from "@/lib/parcel-server";
import { guardOrUser } from "@/lib/visitors/guard-auth";

const err = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const auth = (req: Request) => guardOrUser(req); // รปภ. (PIN) หรือผู้ใช้ที่ล็อกอิน

// รับฝากของ: รูป + ห้อง + นักเรียน → เก็บ → แจ้งครูประจำชั้นใน Teams (วิธีเดียวกับผู้มาติดต่อ)
export async function POST(req: Request) {
  const me = await auth(req);
  if (!me) return err("Unauthorized", 401);

  const fd = await req.formData();
  const photo = fd.get("photo");
  const classroomId = String(fd.get("classroom_id") ?? "");
  const classroomLabel = String(fd.get("classroom_label") ?? "");
  const studentId = String(fd.get("student_id") ?? "") || null;
  const studentName = String(fd.get("student_name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const senderName = String(fd.get("sender_name") ?? "").trim() || null;

  if (!(photo instanceof File) || photo.size === 0) return err("กรุณาถ่ายรูปของที่ฝาก");
  if (photo.size > 8 * 1024 * 1024) return err("รูปใหญ่เกินไป (เกิน 8 MB)");
  if (!classroomId || !classroomLabel) return err("กรุณาเลือกชั้น/ห้อง");
  if (!studentName) return err("กรุณาเลือกชื่อนักเรียน");

  const db = adminClient();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const key = `${day}/${randomUUID()}.jpg`;
  const { error: upErr } = await db.storage.from("parcels").upload(key, Buffer.from(await photo.arrayBuffer()), {
    contentType: photo.type || "image/jpeg",
  });
  if (upErr) return err("อัปโหลดรูปไม่สำเร็จ: " + upErr.message, 500);

  const { data: parcel, error } = await db.from("parcels").insert({
    created_by: me.id, classroom_id: classroomId, classroom_label: classroomLabel,
    student_id: studentId, student_name: studentName, sender_name: senderName,
    description, photo_path: key,
  }).select("id").single();
  if (error || !parcel) return err("บันทึกไม่สำเร็จ: " + error?.message, 500);

  // แจ้งครูประจำชั้น (พลาดก็ไม่ทำให้การบันทึกล้ม — เก็บเหตุผลไว้ให้ รปภ. เห็น)
  const notify = await notifyParcel(parcel.id);
  await db.from("parcels").update({
    notified_at: notify.ok ? new Date().toISOString() : null,
    notify_error: notify.ok ? (notify.reason ?? null) : (notify.reason ?? "แจ้งไม่สำเร็จ"),
  }).eq("id", parcel.id);

  return NextResponse.json({
    ok: true,
    teachers: notify.sent ?? 0,
    notified: notify.ok ? (notify.sent ?? 0) : 0,
    warning: notify.reason ?? null,
  });
}

// รายการของที่ยังรอรับ
export async function GET(req: Request) {
  if (!(await auth(req))) return err("Unauthorized", 401);
  const db = adminClient();
  const { data } = await db.from("parcels").select("*").eq("status", "waiting")
    .order("created_at", { ascending: false }).limit(30);
  const rows = data ?? [];
  const { data: urls } = rows.length
    ? await db.storage.from("parcels").createSignedUrls(rows.map((r: any) => r.photo_path), 3600)
    : { data: [] as any[] };
  return NextResponse.json({
    parcels: rows.map((r: any, i: number) => ({ ...r, photo_url: urls?.[i]?.signedUrl ?? null })),
  });
}

// ส่งมอบแล้ว
export async function PATCH(req: Request) {
  if (!(await auth(req))) return err("Unauthorized", 401);
  const { id } = await req.json();
  if (!id) return err("ไม่พบรายการ");
  await adminClient().from("parcels").update({ status: "picked_up", picked_up_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}