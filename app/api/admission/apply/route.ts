import { NextResponse } from "next/server";
import { db, limited, clientIp } from "@/lib/admission-server";
import { LEVELS, PROGRAMS, ZONES } from "@/lib/admission-config";

export const runtime = "nodejs";
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

function validThaiId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
}

export async function POST(req: Request) {
  if (limited("apply:" + clientIp(req), 10)) return bad("ส่งคำขอบ่อยเกินไป กรุณารอสักครู่", 429);
  const b = await req.json().catch(() => null);
  if (!b) return bad("ข้อมูลไม่ถูกต้อง");

  const need = ["level", "program", "zone", "idcard", "first_name", "last_name", "birthdate", "student_phone", "gpa"];
  if (need.some((k) => !String(b[k] ?? "").trim())) return bad("กรอกข้อมูลไม่ครบ");
  if (!(b.level in LEVELS) || !(b.program in PROGRAMS) || !(b.zone in ZONES)) return bad("ข้อมูลระดับชั้น/ห้อง/เขตไม่ถูกต้อง");
  if (!validThaiId(b.idcard)) return bad("เลขประจำตัวประชาชนไม่ถูกต้อง");
  if (!/^0\d{9}$/.test(b.student_phone)) return bad("เบอร์โทรไม่ถูกต้อง");
  const gpa = Number(b.gpa);
  if (!(gpa >= 0 && gpa <= 4)) return bad("เกรดเฉลี่ยต้องอยู่ระหว่าง 0.00 – 4.00");

  const { data: round } = await db.from("admission_rounds").select("*")
    .eq("level", b.level).order("academic_year", { ascending: false }).limit(1).maybeSingle();
  const now = Date.now();
  if (!round || !round.is_open
    || (round.open_at && now < +new Date(round.open_at))
    || (round.close_at && now > +new Date(round.close_at)))
    return bad("ขณะนี้ไม่ได้เปิดรับสมัครระดับชั้นนี้");

  const { data, error } = await db.from("admission_applications").insert({
    academic_year: round.academic_year,
    level: b.level, program: b.program, zone: b.zone,
    idcard: b.idcard, prefix: b.prefix, first_name: b.first_name.trim(), last_name: b.last_name.trim(),
    birthdate: b.birthdate, sex: b.sex, race: b.race, nationality: b.nationality, religion: b.religion,
    address: b.address ?? {}, student_phone: b.student_phone,
    prev_school: b.prev_school, gpa,
    disability: b.disability, congenital_disease: b.congenital_disease, food_allergy: b.food_allergy,
    father: b.father ?? {}, mother: b.mother ?? {}, guardian: b.guardian ?? {},
  }).select("id,application_no,edit_token").single();

  if (error) {
    if (error.code === "23505") return bad("เลขประจำตัวประชาชนนี้สมัครไว้แล้ว กรุณาตรวจสอบที่แท็บ “ตรวจสอบสถานะ”", 409);
    console.error("[apply]", error.message);
    return bad("บันทึกไม่สำเร็จ กรุณาลองใหม่", 500);
  }
  return NextResponse.json({ ok: true, ...data });
}