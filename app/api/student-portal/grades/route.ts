import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStudentSession } from "@/lib/studentAuth";

export async function GET(req: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");

  if (!studentId || studentId !== session.student_id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  const supabase = await createClient();

  // หา classroom_id ของนักเรียน แล้วหา subject_section ที่ผูกอยู่
  const { data: student } = await supabase
    .from("students")
    .select("id, classroom_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
  }

  const sectionId = searchParams.get("subject_section_id");
if (!sectionId) {
  return NextResponse.json({ error: "ไม่ระบุวิชา" }, { status: 400 });
}
// เช็คว่า section นี้อยู่ใน classroom ของ นร. คนนี้จริง (กันดูวิชาห้องอื่น)
const { data: section } = await supabase
  .from("subject_sections")
  .select("id")
  .eq("id", sectionId)
  .eq("classroom_id", student.classroom_id)
  .maybeSingle();

  if (!section) {
    return NextResponse.json({ error: "ไม่พบวิชาของนักเรียนคนนี้" }, { status: 404 });
  }

  // ดึงคะแนนของนักเรียนคนนี้ พร้อมข้อมูล assignment ที่เกี่ยวข้อง (เฉพาะ published/closed ไม่เอา draft)
  const { data: rows, error } = await supabase
    .from("submissions")
    .select(
      `
      score,
      assignment:assignments!inner (
        id, title, max_score, allow_weight, weight_percent, status, subject_section_id
      )
    `
    )
    .eq("student_id", studentId)
    .eq("assignment.subject_section_id", section.id)
    .neq("assignment.status", "draft")
    .not("score", "is", null);

  if (error) {
    return NextResponse.json({ error: "ดึงข้อมูลคะแนนไม่สำเร็จ" }, { status: 500 });
  }

  // คำนวณคะแนนรวมแบบถ่วงน้ำหนัก: แต่ละชิ้น contribution = (score/max_score) * weight_percent
  // weight_percent รวมกันทั้งวิชา = 100 แต่ถ้ายังไม่ครบทุกชิ้น (บางชิ้นยังไม่ตรวจ)
  // ผลรวมที่ได้คือ "คะแนนสะสม ณ ปัจจุบัน" ไม่ใช่คะแนนเต็มร้อยจริง จนกว่าจะตรวจครบทุกชิ้น
  let weightedTotal = 0;
  let weightCounted = 0; // รวม weight_percent ของชิ้นที่มีคะแนนแล้ว (บอกว่าตรวจไปแล้วกี่ % ของทั้งหมด)

  const grades = (rows ?? []).map((r: any) => {
    const a = r.assignment;
    const pct = a.max_score > 0 ? (r.score / a.max_score) * 100 : 0;
    const contribution = a.allow_weight
      ? (pct / 100) * (a.weight_percent ?? 0)
      : 0; // ถ้าไม่มี allow_weight แต่ตามที่ตกลง ทุกชิ้นควรมี weight_percent อยู่แล้ว

    weightedTotal += contribution;
    weightCounted += a.weight_percent ?? 0;

    return {
      assignment_id: a.id,
      title: a.title,
      score: r.score,
      max_score: a.max_score,
      weight_percent: a.weight_percent,
      percentage: Math.round(pct * 100) / 100,
    };
  });

  return NextResponse.json({
    grades,
    summary: {
      // คะแนนรวมถ่วงน้ำหนัก ณ ตอนนี้ (จากชิ้นที่ตรวจแล้วเท่านั้น)
      weighted_score: Math.round(weightedTotal * 100) / 100,
      // ตรวจไปแล้วกี่ % ของน้ำหนักคะแนนทั้งหมด (ควรเข้าใกล้ 100 เมื่อตรวจครบ)
      weight_graded: Math.round(weightCounted * 100) / 100,
    },
  });
}