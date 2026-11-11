import { NextResponse } from "next/server";
import { adminClient, requireGuard, notifyVisitor } from "@/lib/visitor-server";

export const maxDuration = 30;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: Request) {
  if (!(await requireGuard(req))) return bad("unauthorized", 401);
  const db = adminClient();
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const [p, i] = await Promise.all([
    db.from("visitors").select("*").eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }),
    db.from("visitors").select("*").eq("status", "inside").order("check_in_at", { ascending: false }),
  ]);
  return NextResponse.json({ pending: p.data ?? [], inside: i.data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireGuard(req))) return bad("unauthorized", 401);
  const db = adminClient();
  const now = new Date().toISOString();

  // บันทึกผู้มาติดต่อที่ รปภ. กรอกเอง (multipart: data + photo)
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    let d: any;
    try { d = JSON.parse(String(form.get("data") ?? "{}")); } catch { return bad("ข้อมูลไม่ถูกต้อง"); }
    const { name, plate, mode, target } = d;
    if (!target?.label) return bad("กรุณาเลือกห้อง/ฝ่าย");
    if (mode !== "id" && mode !== "face") return bad("โหมดไม่ถูกต้อง");

    let photo_path: string | null = null;
    const photo = form.get("photo") as File | null;
    if (mode === "face" && photo) {
      if (photo.size > 4 * 1024 * 1024) return bad("รูปใหญ่เกินไป");
      const path = `${now.slice(0, 10)}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await db.storage.from("visitor-photos")
        .upload(path, Buffer.from(await photo.arrayBuffer()), { contentType: "image/jpeg" });
      if (error) return bad("อัปโหลดรูปไม่สำเร็จ: " + error.message, 500);
      photo_path = path;
    }

    const { data, error } = await db.from("visitors").insert({
      full_name: String(name ?? "").trim() || "ผู้ปกครอง (ไม่ระบุชื่อ)",
      car_plate: String(plate ?? "").trim() || null,
      contact_person: target.label,
      target_type: target.type, target_classroom_id: target.classroom_id ?? null, target_label: target.label,
      source: mode === "id" ? "guard_id" : "guard_face",
      status: "inside", check_in_at: now,
      photo_path, photo_url: null, check_out_at: null,
    }).select("id").single();
    if (error || !data) return bad("บันทึกไม่สำเร็จ: " + (error?.message ?? ""), 500);
    const notify = await notifyVisitor(data.id);
return NextResponse.json({ ok: true, notify });
  }

  // ปุ่มต่าง ๆ: confirm / reject / checkout
  const { action, id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return bad("ไม่พบ id");
  let notifyResult: any = null;
  if (action === "confirm") {
    const { error } = await db.from("visitors").update({ status: "inside", check_in_at: now }).eq("id", id);
    if (error) return bad(error.message, 500);
    notifyResult = await notifyVisitor(id);
  } else if (action === "reject") {
    await db.from("visitors").update({ status: "rejected" }).eq("id", id);
  } else if (action === "checkout") {
    await db.from("visitors").update({ status: "left", check_out_at: now }).eq("id", id);
  } else return bad("action ไม่ถูกต้อง");
  return NextResponse.json({ ok: true });
}