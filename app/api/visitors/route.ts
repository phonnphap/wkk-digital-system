// path: app/api/visitors/route.ts  — GET รายชื่อห้อง/ฝ่าย, POST ผู้ปกครองลงทะเบียน (ไม่ต้อง login)
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/visitor-server";

const ADMIN_TARGETS = [
  "ผู้อำนวยการ", "รองผู้อำนวยการ", "ฝ่ายวิชาการ", "ฝ่ายบุคคล",
  "ฝ่ายงบประมาณ/การเงิน", "ฝ่ายบริหารทั่วไป", "ธุรการ", "ห้องพยาบาล",
];
const GRADE_ORDER = ["อ.2","อ.3","ป.1","ป.2","ป.3","ป.4","ป.5","ป.6","ม.1","ม.2","ม.3","ม.4","ม.5","ม.6"];
const gi = (g: string) => { const i = GRADE_ORDER.indexOf(g); return i === -1 ? 999 : i; };

export async function GET() {
  const db = adminClient();
  const { data: years } = await db.from("academic_years").select("id,year_name,is_current");
  const cur = (years ?? []).find((y: any) => y.is_current);
  const yearIds = cur ? (years ?? []).filter((y: any) => y.year_name === cur.year_name).map((y: any) => y.id) : [];

  let q = db.from("classrooms").select("id,grade_group,room_name");
  if (yearIds.length) q = q.in("academic_year_id", yearIds);
  const { data } = await q;

  const seen = new Set<string>();
  const rooms: { id: string; label: string; grade: string }[] = [];
  (data ?? []).forEach((c: any) => {
    const grade = (c.grade_group ?? "").split("/")[0].trim();
    const rn = (c.room_name ?? "").trim();
    const label = rn.includes(grade) ? rn : `${grade} ${rn}`.trim();
    if (!label || seen.has(label)) return;   // ห้องที่แยกเทอมจะซ้ำ — เอาอันเดียว
    seen.add(label);
    rooms.push({ id: c.id, label, grade });
  });
  rooms.sort((a, b) => gi(a.grade) - gi(b.grade) || a.label.localeCompare(b.label, "th"));
  return NextResponse.json({ rooms, admins: ADMIN_TARGETS });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  if (b.website) return NextResponse.json({ ok: true });            // honeypot กันบอท

  const full_name = String(b.full_name ?? "").trim().slice(0, 100);
  if (!full_name) return NextResponse.json({ ok: false, error: "กรุณากรอกชื่อ-นามสกุล" }, { status: 400 });
  if (b.target_type !== "class" && b.target_type !== "admin")
    return NextResponse.json({ ok: false, error: "กรุณาเลือกชั้นเรียนหรือฝ่ายที่มาติดต่อ" }, { status: 400 });

  const db = adminClient();

  // กันสแปม: pending เกิน 30 รายการใน 10 นาที → ปฏิเสธ
  const since10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("visitors").select("id", { count: "exact", head: true })
    .eq("status", "pending").gte("created_at", since10);
  if ((count ?? 0) > 30) return NextResponse.json({ ok: false, error: "ระบบกำลังคับคั่ง กรุณาแจ้ง รปภ." }, { status: 429 });

  // ตั้ง label ฝั่ง server ไม่เชื่อค่าจาก client
  let target_label = "";
  let target_classroom_id: string | null = null;
  if (b.target_type === "class") {
    const { data: c } = await db.from("classrooms").select("id,grade_group,room_name").eq("id", b.target_classroom_id).maybeSingle();
    if (!c) return NextResponse.json({ ok: false, error: "ไม่พบห้องเรียน" }, { status: 400 });
    const grade = (c.grade_group ?? "").split("/")[0].trim();
    const rn = (c.room_name ?? "").trim();
    target_label = rn.includes(grade) ? rn : `${grade} ${rn}`.trim();
    target_classroom_id = c.id;
  } else {
    target_label = ADMIN_TARGETS.includes(b.target_label) ? b.target_label : "ฝ่ายบริหาร";
  }

  const { error } = await db.from("visitors").insert({
    full_name,
    phone: String(b.phone ?? "").trim().slice(0, 20) || null,
    car_plate: String(b.car_plate ?? "").trim().slice(0, 30) || null,
    purpose: String(b.purpose ?? "").trim().slice(0, 300) || null,
    contact_person: target_label,
    target_type: b.target_type, target_classroom_id, target_label,
    source: "self", status: "pending",
    photo_url: null, check_in_at: null, check_out_at: null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, target_label });
}