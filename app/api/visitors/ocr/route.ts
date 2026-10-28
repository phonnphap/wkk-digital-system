// path: app/api/visitors/ocr/route.ts — อ่านชื่อ/ทะเบียนรถจากรูป แล้วทิ้งรูปทันที (ไม่เก็บ)
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/visitor-server";

const PROMPT = `รูปนี้คือบัตรประชาชน/ใบขับขี่ หรือป้ายทะเบียนรถ/เล่มทะเบียนรถของไทย
อ่านเฉพาะ "ชื่อ-นามสกุล" (ไม่ต้องมีคำนำหน้าก็ได้) และ "ทะเบียนรถ" (พร้อมจังหวัดถ้าเห็น)
ห้ามส่งเลขบัตรประชาชน ที่อยู่ หรือข้อมูลอื่นกลับมาเด็ดขาด
ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น: {"full_name": string|null, "car_plate": string|null}
ถ้าอ่านไม่ออกให้ใส่ null`;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "no file" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, error: "ไฟล์ใหญ่เกินไป" }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: json?.error?.message ?? `HTTP ${res.status}` }, { status: 502 });
    const text = (json.content ?? []).map((c: any) => c.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
const parsed = m ? JSON.parse(m[0]) : {};
const full_name = typeof parsed.full_name === "string"
  ? parsed.full_name.replace(/[0-9๐-๙]/g, "").trim() || null
  : null;
let car_plate = typeof parsed.car_plate === "string" ? parsed.car_plate.trim() || null : null;
if (car_plate && /\d{13}/.test(car_plate.replace(/[\s-]/g, ""))) car_plate = null;
return NextResponse.json({ ok: true, full_name, car_plate });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "อ่านภาพไม่สำเร็จ: " + e.message }, { status: 500 });
  }
}