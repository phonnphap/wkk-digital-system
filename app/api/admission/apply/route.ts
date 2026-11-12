// 📁 วางที่: app/api/admission/apply/route.ts  [ทับของเดิม]
import { NextResponse } from "next/server";
import { db, limited, clientIp } from "@/lib/admission-server";
import { LEVELS, PROGRAMS, ZONES } from "@/lib/admission-config";
import { validThaiId, ageProblem, gpaProblem, parentNameProblem, studentPrefixProblem, inZone, PARENT_STATUS } from "@/lib/admission-rules";

export const runtime = "nodejs";
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  if (limited("apply:" + clientIp(req), 10)) return bad("ส่งคำขอบ่อยเกินไป กรุณารอสักครู่", 429);
  const b = await req.json().catch(() => null);
  if (!b) return bad("ข้อมูลไม่ถูกต้อง");

  const need = ["level", "program", "zone", "idcard", "prefix", "first_name", "last_name", "birthdate", "sex", "student_phone", "gpa"];
  if (need.some((k) => !String(b[k] ?? "").trim())) return bad("กรอกข้อมูลไม่ครบ");
  if (!(b.level in LEVELS) || !(b.program in PROGRAMS) || !(b.zone in ZONES)) return bad("ข้อมูลระดับชั้น/ห้อง/เขตไม่ถูกต้อง");
  if (!validThaiId(b.idcard)) return bad("เลขประจำตัวประชาชนไม่ถูกต้อง");
  if (!/^0\d{9}$/.test(b.student_phone) || !/^0\d{9}$/.test(b.guardian?.phone ?? "")) return bad("เบอร์โทรไม่ถูกต้อง");
  const gpa = Number(b.gpa);
  if (!(gpa >= 0 && gpa <= 4)) return bad("เกรดเฉลี่ยต้องอยู่ระหว่าง 0.00 – 4.00");

  // ── รอบรับสมัครของ ระดับ+ห้อง นี้ ──
  const { data: round } = await db.from("admission_rounds").select("*")
    .eq("level", b.level).eq("program", b.program).order("academic_year", { ascending: false }).limit(1).maybeSingle();
  const now = Date.now();
  if (!round || !round.is_open
    || (round.open_at && now < +new Date(round.open_at))
    || (round.close_at && now > +new Date(round.close_at)))
    return bad(`ขณะนี้ไม่ได้เปิดรับสมัคร ${LEVELS[b.level as keyof typeof LEVELS].label} ${PROGRAMS[b.program as keyof typeof PROGRAMS]}`);

  // ── เกณฑ์อายุ/เกรด ──
  if (round.enforce_rules !== false) {
    const p = ageProblem(b.birthdate, round) || gpaProblem(gpa, round);
    if (p) return bad(`ไม่ผ่านเกณฑ์การรับสมัคร: ${p}`);
  }

  // ── คำนำหน้า ──
  const pe = studentPrefixProblem(b.prefix, b.sex, b.level).error;
  if (pe) return bad(pe);
  const f = b.father ?? {}, m = b.mother ?? {}, g = b.guardian ?? {};
  for (const [who, x] of [["บิดา", f], ["มารดา", m]] as const) {
    if (x.status && !(x.status in PARENT_STATUS)) return bad(`สถานะ${who}ไม่ถูกต้อง`);
  }
  const fe = parentNameProblem(f.name, "father");
  const me = parentNameProblem(m.name, "mother");
  const ge = !g.name?.trim() ? "ไม่ได้กรอก" : parentNameProblem(g.name, "guardian");
  if (fe) return bad(`ชื่อบิดา: ${fe}`);
  if (me) return bad(`ชื่อมารดา: ${me}`);
  if (ge) return bad(`ชื่อผู้ปกครอง: ${ge}`);

  // ── เขตพื้นที่บริการ ──
  if (b.zone === "in") {
    const { data: areas } = await db.from("admission_zone_areas").select("province,amphoe,district,village_nos");
    if (inZone(b.address ?? {}, areas ?? []) === false)
      return bad("ที่อยู่ตามทะเบียนบ้านไม่อยู่ในเขตบริการของโรงเรียน กรุณาเลือกสมัครแบบ “นอกเขต”");
  }

  const { data, error } = await db.from("admission_applications").insert({
    academic_year: round.academic_year,
    level: b.level, program: b.program, zone: b.zone,
    idcard: b.idcard, prefix: b.prefix, first_name: b.first_name.trim(), last_name: b.last_name.trim(),
    birthdate: b.birthdate, sex: b.sex, race: b.race, nationality: b.nationality, religion: b.religion,
    address: b.address ?? {}, student_phone: b.student_phone,
    prev_school: b.prev_school, gpa,
    disability: b.disability, congenital_disease: b.congenital_disease, food_allergy: b.food_allergy,
    father: { ...f, status: f.status || "alive" }, mother: { ...m, status: m.status || "alive" }, guardian: g,
  }).select("id,application_no,edit_token").single();

  if (error) {
    if (error.code === "23505") return bad("เลขประจำตัวประชาชนนี้สมัครไว้แล้ว กรุณาตรวจสอบที่แท็บ “ตรวจสอบสถานะ”", 409);
    console.error("[apply]", error.message);
    return bad("บันทึกไม่สำเร็จ กรุณาลองใหม่", 500);
  }
  return NextResponse.json({ ok: true, ...data });
}
