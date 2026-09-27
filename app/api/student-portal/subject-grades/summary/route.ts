import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentSession } from "@/lib/studentAuth";

// GET /api/student-portal/subject-attendance/summary?subject_section_id=xxx&student_id=xxx
// เวอร์ชันฝั่งนักเรียนของ /api/subject-attendance/summary (ของครู)
// ต่างกันตรงที่: ต้องผ่าน getStudentSession() แทน Supabase Auth ของครู
// และกรองผลลัพธ์ (records) ให้เหลือเฉพาะแถวของนักเรียนคนที่ล็อกอินอยู่เท่านั้น
// ส่วน "dates" (รายชื่อวันที่ทั้งหมดที่มีคาบเรียนวิชานี้) ยังคงคืนแบบไม่กรอง
// เพราะ GradeOverviewTool ใช้ dates.length เป็นตัวหาร "จำนวนวันที่ต้องเรียนทั้งหมด"
// ถ้ากรองตาม student ไปด้วยจะทำให้ตัวหารผิด (นับได้แค่วันที่มีบันทึกของนักเรียนคนนั้นเอง)
export async function GET(req: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "ไม่พบ session กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subject_section_id = searchParams.get("subject_section_id");
    const studentId = searchParams.get("student_id");

    if (!subject_section_id) {
      return NextResponse.json({ error: "ต้องระบุ subject_section_id" }, { status: 400 });
    }
    if (!studentId || studentId !== session.student_id) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
    }

    // เช็คสิทธิ์: นักเรียนคนนี้ต้องอยู่ห้องเดียวกับ subject_section ที่ขอดู
    // ใช้ client ปกติ (RLS ปกติของตาราง students เปิดให้อ่านข้อมูลพื้นฐานของตัวเองอยู่แล้ว
    // ถ้าไม่ผ่านก็ไม่เป็นไร เพราะ maybeSingle() จะได้ null แล้วเช็คด้านล่างอยู่ดี)
    const supabase = await createClient();
    const { data: student } = await supabase
      .from("students")
      .select("id, classroom_id")
      .eq("id", studentId)
      .is("moved_out_at", null)
      .maybeSingle();

    if (!student) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
    }

    // ★ ตาราง subject_sections / timetable_entries / subject_attendance ติด RLS
    // แบบเดียวกับที่คอมเมนต์ไว้ในไฟล์อื่น ๆ ของ student-portal — custom session ไม่ใช่
    // Supabase Auth เลยต้อง bypass ด้วย service-role client (สิทธิ์เช็คไว้แล้วด้านบน)
    const admin = createAdminClient();

    const { data: section, error: sectionErr } = await admin
      .from("subject_sections")
      .select("id, classroom_id, subject_id")
      .eq("id", subject_section_id)
      .maybeSingle();
    if (sectionErr) throw sectionErr;
    if (!section) {
      return NextResponse.json({ error: "ไม่พบข้อมูล subject_section" }, { status: 404 });
    }

    // ★ กันนักเรียนสวม subject_section_id ของห้องอื่นที่ตัวเองไม่ได้เรียน
    if (section.classroom_id !== student.classroom_id) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
    }

    // หา timetable_entry ทั้งหมดของห้อง+วิชานี้ (เหมือนฝั่งครูทุกประการ)
    const { data: entries, error: entriesErr } = await admin
      .from("timetable_entries")
      .select("id")
      .eq("classroom_id", section.classroom_id)
      .eq("subject_id", section.subject_id);
    if (entriesErr) throw entriesErr;

    const entryIds = (entries ?? []).map((e: any) => e.id);
    if (entryIds.length === 0) {
      return NextResponse.json({ dates: [], records: [] });
    }

    // ดึงทุกแถวของวิชานี้ (ทุกคนในห้อง) เพื่อคำนวณ "dates" ทั้งหมดให้ครบ
    const { data: rows, error } = await admin
      .from("subject_attendance")
      .select("student_id, attendance_date, status")
      .in("timetable_entry_id", entryIds)
      .order("attendance_date", { ascending: true });
    if (error) throw error;

    const allRows = rows ?? [];
    const dates = Array.from(new Set(allRows.map((r: any) => r.attendance_date))).sort();

    // ★ กรองเฉพาะแถวของนักเรียนคนนี้ ก่อนส่งกลับ (จุดต่างหลักจากฝั่งครู)
    const myRecords = allRows.filter((r: any) => r.student_id === studentId);

    return NextResponse.json({ dates, records: myRecords });
  } catch (err: any) {
    console.error("[GET /api/student-portal/subject-attendance/summary] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "โหลดข้อมูลสรุปเช็กชื่อไม่สำเร็จ" },
      { status: 500 }
    );
  }
}