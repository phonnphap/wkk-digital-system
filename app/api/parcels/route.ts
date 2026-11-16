// path: app/api/parcels/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminDb, getHomeroomTeachers, notifyTeams } from "@/lib/parcels/server";
import { guardOrUser } from "@/lib/visitors/guard-auth";

const err = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const WEEK = 60 * 60 * 24 * 7;

const auth = (req: Request) => guardOrUser(req); // รปภ. (PIN) หรือผู้ใช้ที่ล็อกอิน

// รับฝากของ: รูป + ห้อง + นักเรียน → เก็บ → แจ้งครูประจำชั้นใน Teams
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

  const db = adminDb();
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
  }).select("id, created_at").single();
  if (error || !parcel) return err("บันทึกไม่สำเร็จ: " + error?.message, 500);

  // แจ้งครูประจำชั้น (พลาดก็ไม่ทำให้การบันทึกล้ม — เก็บ error ไว้ให้ รปภ. เห็น)
  const teachers = await getHomeroomTeachers(db, classroomId);
  const { data: signed } = await db.storage.from("parcels").createSignedUrl(key, WEEK);
  const time = new Date(parcel.created_at).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) + " น.";

  let sent = 0;
  const errors: string[] = [];
  for (const t of teachers) {
    try {
      await notifyTeams({
        teacher_email: t.email, teacher_name: t.name,
        student_name: studentName, classroom: classroomLabel,
        description: description ?? "(ดูรูปแนบ)", sender_name: senderName ?? "-",
        photo_url: signed?.signedUrl ?? "", time,
      });
      sent++;
    } catch (e: any) { errors.push(`${t.email}: ${e.message}`); }
  }
  await db.from("parcels").update({
    notified_at: sent ? new Date().toISOString() : null,
    notify_error: teachers.length === 0 ? "ไม่พบครูประจำชั้น/อีเมล" : errors.join("; ") || null,
  }).eq("id", parcel.id);

  return NextResponse.json({ ok: true, teachers: teachers.length, notified: sent,
    warning: teachers.length === 0 ? "ไม่พบครูประจำชั้นของห้องนี้ ระบบบันทึกแล้วแต่ยังไม่ได้แจ้ง" :
             sent < teachers.length ? "แจ้งครูได้ไม่ครบทุกคน" : null });
}

// รายการของที่ยังรอรับ
export async function GET(req: Request) {
  if (!(await auth(req))) return err("Unauthorized", 401);
  const db = adminDb();
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
  await adminDb().from("parcels").update({ status: "picked_up", picked_up_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}