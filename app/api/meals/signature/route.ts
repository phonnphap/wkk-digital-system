// app/api/meals/signature/route.ts
import { NextRequest, NextResponse } from "next/server";
import { BUCKET, STUDENTS, canEditRoom, getActor } from "@/lib/meals/server";

const PREFIX = "data:image/png;base64,";
const MAX_BYTES = 600 * 1024;

// POST { subjectType: 'student' | 'user', subjectId, dataUrl }
//  - student : ครูประจำชั้นของนักเรียนคนนั้น (หรือ admin) เพิ่ม/เปลี่ยนลายมือชื่อได้
//  - user    : เจ้าของบัญชีเพิ่มลายมือชื่อของตัวเองเท่านั้น (ใช้ตอนยืนยัน/รับรองรายงาน)
export async function POST(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { subjectType, subjectId, dataUrl } = (await req.json()) as {
      subjectType: "student" | "user";
      subjectId: string;
      dataUrl: string;
    };
    if (!["student", "user"].includes(subjectType) || !subjectId || !dataUrl?.startsWith(PREFIX)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const bytes = Buffer.from(dataUrl.slice(PREFIX.length), "base64");
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "ไฟล์ลายมือชื่อใหญ่เกินไป (สูงสุด 600 KB)" }, { status: 413 });
    }
    // เช็ค PNG signature
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      return NextResponse.json({ error: "ต้องเป็นไฟล์ PNG" }, { status: 400 });
    }

    if (subjectType === "user") {
      if (subjectId !== a.profile.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const { data: st } = await a.service
        .from(STUDENTS.table)
        .select(`classroom_id:${STUDENTS.classroom}`)
        .eq(STUDENTS.id, subjectId)
        .maybeSingle();
      if (!st || !canEditRoom(a, st.classroom_id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const path = `${subjectType}/${subjectId}.png`;
    const { error: upErr } = await a.service.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { error } = await a.service.from("meal_signatures").upsert(
      { subject_type: subjectType, subject_id: subjectId, storage_path: path, updated_at: new Date().toISOString() },
      { onConflict: "subject_type,subject_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE { subjectId } — รีเซ็ตลายมือชื่อนักเรียน (ครูประจำชั้นของห้องนั้น/แอดมิน)
export async function DELETE(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { subjectId } = (await req.json()) as { subjectId: string };
    if (!subjectId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { data: st } = await a.service
      .from(STUDENTS.table)
      .select(`classroom_id:${STUDENTS.classroom}`)
      .eq(STUDENTS.id, subjectId)
      .maybeSingle();
    if (!st || !canEditRoom(a, st.classroom_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await a.service.storage.from(BUCKET).remove([`student/${subjectId}.png`]);
    const { error } = await a.service.from("meal_signatures").delete().eq("subject_type", "student").eq("subject_id", subjectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}