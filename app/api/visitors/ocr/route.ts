// path: app/api/visitors/ocr/route.ts — อ่านชื่อ/ทะเบียนรถด้วย Gemini (retry + โมเดลสำรอง) แล้วทิ้งรูปทันที
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/visitor-server";

export const maxDuration = 30;

// รุ่นหลัก + รุ่นสำรอง (แก้ได้ที่ Vercel โดยไม่ต้องแก้โค้ด)
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash-lite",
];

const PROMPT = `รูปนี้คือบัตรประชาชน/ใบขับขี่ หรือป้ายทะเบียนรถ/เล่มทะเบียนรถของไทย
อ่านเฉพาะ "ชื่อ-นามสกุล" (ไม่ต้องมีคำนำหน้าก็ได้) และ "ทะเบียนรถ" (พร้อมจังหวัดถ้าเห็น)
ห้ามส่งเลขบัตรประชาชน ที่อยู่ วันเกิด หรือข้อมูลอื่นกลับมาเด็ดขาด
ถ้าอ่านไม่ออกให้ใส่ null`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ลองแต่ละโมเดลสูงสุด 2 ครั้ง ถ้าเจอ 503/429 รอแล้วลองใหม่ หมดแล้วค่อยไปโมเดลถัดไป
async function callGemini(body: string): Promise<Response> {
  let last: Response | null = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY!,
          },
          body,
        }
      );
      if (last.ok) return last;
      if (last.status !== 503 && last.status !== 429) break; // error แบบอื่น ลองซ้ำก็ไม่หาย ข้ามไปรุ่นถัดไป
      await sleep(800 * (attempt + 1));
    }
  }
  return last!;
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ ok: false, error: "ยังไม่ได้ตั้ง GEMINI_API_KEY" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "no file" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, error: "ไฟล์ใหญ่เกินไป" }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: "image/jpeg", data } },
        { text: PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          full_name: { type: "STRING", nullable: true },
          car_plate: { type: "STRING", nullable: true },
        },
      },
    },
  });

  try {
    const res = await callGemini(body);
    const json = await res.json();
    if (!res.ok)
      return NextResponse.json({ ok: false, error: json?.error?.message ?? `HTTP ${res.status}` }, { status: 502 });

    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
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