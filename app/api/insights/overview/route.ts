import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* =========================================================================
   GET /api/insights/overview
   -------------------------------------------------------------------------
   Query params:
     requester_id     : string (users.id)  -- บังคับ ใช้เช็ก role/สิทธิ์
     subject_id        : string  -- บังคับเสมอ (วิชาปัจจุบันของหน้าที่เข้ามา)
     scope             : "classroom" | "grade_level"  (default: "classroom")
     classroom_id       : string  -- บังคับเมื่อ scope = "classroom"
     grade_level_id     : string  -- บังคับเมื่อ scope = "grade_level"
     academic_year_id   : string  -- แนะนำให้ส่งเสมอ ใช้กรอง subject_sections/classrooms ตามปีการศึกษา

   ⚠️ ASSUMPTIONS เกี่ยวกับ schema (ยืนยันแล้วบางส่วนจากการตรวจสคีมาจริง):
     - subjects(id, subject_code, name_th, name_en, credit_hours, subject_group, created_at)
       ⚠️ ไม่มีคอลัมน์ created_by/academic_year/semester — ยืนยันแล้วจากสคีมาจริง
     - subject_sections(id, subject_id, classroom_id, academic_year_id, teacher_id,
       co_teacher_id, join_code, is_active, created_by, created_at) — ยืนยันแล้ว
     - classrooms(id, grade_level_id, room_number, room_name, homeroom_teacher_id,
       academic_year_id, student_count, created_at, grade_group, homeroom_teacher_2_id,
       schedule_type, school_id) — ยืนยันแล้ว
     - academic_years(id, year_name, semester, start_date, end_date, is_current, created_at) — ยืนยันแล้ว
     - users(id, role, extra_roles, full_name, first_name, last_name)
       ⚠️ ยังไม่ยืนยัน — ก่อนหน้านี้ยืนยันว่าตารางโปรไฟล์จริงคือ `profiles(id, email, full_name)`
       ถ้าระบบ role/สิทธิ์ของครู-แอดมินอยู่ใน `profiles` ไม่ใช่ `users` ต้องเปลี่ยน 2 จุดที่ query `users` ด้านล่าง
     - students(id, prefix, first_name, last_name, seat_number, classroom_id)
     - assignments(id, subject_section_id, max_score, due_date, assigned_at)
     - assignment_submissions(id, assignment_id, student_id, status, score, submitted_at)
     - attendance_records(student_id, classroom_id, status, attendance_date)
       ผูกกับ classroom_id ไม่ใช่รายวิชา จึงกรองช่วงวันที่ตามปีการศึกษาที่เลือก (start_date/end_date)
       เพื่อไม่ให้ปนข้อมูลข้ามปี

   เกณฑ์ "กลุ่มเสี่ยง" (แก้ค่าคงที่ด้านล่างได้ภายหลัง):
     - อัตราเข้าเรียน < 80%  หรือ
     - คะแนนเฉลี่ย (%) < 50
     ระดับความเสี่ยง: เข้าเงื่อนไข 2 ข้อ = สูง, เข้าเงื่อนไข 1 ข้อ = ปานกลาง
   ========================================================================= */

const ATTENDANCE_RISK_THRESHOLD = 0.8; // เข้าเรียน < 80% ถือว่าเสี่ยง
const SCORE_RISK_THRESHOLD = 50; // คะแนนเฉลี่ย(%) < 50 ถือว่าเสี่ยง

type Role = "admin" | "homeroom_teacher" | "subject_teacher" | "unknown";
type Scope = "classroom" | "grade_level";

function emptyResult(role: Role) {
  return {
    role,
    totals: {
      studentCount: 0,
      atRiskCount: 0,
      atRiskHigh: 0,
      atRiskMedium: 0,
      atRiskPercent: 0,
      onTimeRate: null as number | null,
      onTimePendingCount: 0,
      attendanceRate: null as number | null,
      avgScore: null as number | null,
    },
    atRiskStudents: [] as any[],
    scoreDistribution: [] as any[],
    classroomRanking: [] as any[],
    subjectRanking: [] as any[],
    teacherRanking: [] as any[],
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const requesterId = searchParams.get("requester_id");
  const subjectId = searchParams.get("subject_id");
  const scope = (searchParams.get("scope") ?? "classroom") as Scope;
  const classroomIdParam = searchParams.get("classroom_id");
  const gradeLevelIdParam = searchParams.get("grade_level_id");
  const academicYearId = searchParams.get("academic_year_id");

  if (!requesterId) {
    return NextResponse.json({ error: "missing requester_id" }, { status: 400 });
  }
  if (!subjectId) {
    return NextResponse.json({ error: "missing subject_id" }, { status: 400 });
  }
  if (scope === "classroom" && !classroomIdParam) {
    return NextResponse.json({ error: "missing classroom_id" }, { status: 400 });
  }
  if (scope === "grade_level" && !gradeLevelIdParam) {
    return NextResponse.json({ error: "missing grade_level_id" }, { status: 400 });
  }

  // 1) หา role ของผู้ขอข้อมูล
const { data: requester, error: userErr } = await admin
  .from("users")
  .select("id, role, is_homeroom, is_subject_teacher, full_name, first_name, last_name")
  .eq("id", requesterId)
  .maybeSingle();

if (userErr || !requester) {
  return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
}

const ADMIN_ROLES = ["admin", "director", "deputy_director"];
const isAdmin = ADMIN_ROLES.includes(requester.role);
const isHomeroom = requester.is_homeroom === true;
const isSubjectTeacher = requester.is_subject_teacher === true;

// ลำดับความสำคัญ: admin > subject_teacher > homeroom_teacher
// (ครูคนหนึ่งอาจเป็นทั้งสองอย่างพร้อมกัน แต่หน้า Insights นี้ฝังอยู่ในบริบท "รายวิชา" เสมอ
//  จึงให้สิทธิ์แบบ subject_teacher เป็นตัวตัดสินก่อน ถ้ามีทั้งสองบทบาท)
const role: Role = isAdmin
  ? "admin"
  : isSubjectTeacher
  ? "subject_teacher"
  : isHomeroom
  ? "homeroom_teacher"
  : "unknown";

if (role === "unknown") {
  return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลเชิงลึก" }, { status: 403 });
}

  try {
    /* -----------------------------------------------------------------
       2) หาช่วงวันที่ของปีการศึกษา (ถ้าระบุ) ไว้กรอง attendance/assignments
       ----------------------------------------------------------------- */
    let yearStart: string | null = null;
    let yearEnd: string | null = null;
    if (academicYearId) {
      const { data: yearRow } = await admin
        .from("academic_years")
        .select("start_date, end_date")
        .eq("id", academicYearId)
        .maybeSingle();
      yearStart = yearRow?.start_date ?? null;
      yearEnd = yearRow?.end_date ?? null;
    }

    /* -----------------------------------------------------------------
       3) หา classroom ids ตามขอบเขตที่ขอ (ห้องเดียว หรือ ทุกห้องในสายชั้นเดียวกัน)
       ----------------------------------------------------------------- */
    async function fetchClassroomsWithFallback() {
  let baseQuery = admin
    .from("classrooms")
    .select("id, room_name, grade_group, grade_level_id, homeroom_teacher_id, homeroom_teacher_2_id");

  if (scope === "classroom") {
    baseQuery = baseQuery.eq("id", classroomIdParam!);
  } else {
    baseQuery = baseQuery.eq("grade_level_id", gradeLevelIdParam!);
  }

  if (academicYearId) {
    const { data } = await baseQuery.eq("academic_year_id", academicYearId);
    if (data && data.length > 0) return data;
    // Fallback: ห้องนี้/สายชั้นนี้ผูกกับปีการศึกษาอื่น (ไม่ตรงกับปีที่เลือก/ปีปัจจุบัน)
    // ดึงโดยไม่กรองปีการศึกษาแทน ดีกว่าแสดงผลว่างทั้งที่ห้องมีอยู่จริง
  }

  let fallbackQuery = admin
    .from("classrooms")
    .select("id, room_name, grade_group, grade_level_id, homeroom_teacher_id, homeroom_teacher_2_id");
  if (scope === "classroom") {
    fallbackQuery = fallbackQuery.eq("id", classroomIdParam!);
  } else {
    fallbackQuery = fallbackQuery.eq("grade_level_id", gradeLevelIdParam!);
  }
  const { data } = await fallbackQuery;
  return data ?? [];
}

let classrooms = await fetchClassroomsWithFallback();
if (classrooms.length === 0) return NextResponse.json(emptyResult(role));

    const scopeClassroomIds = classrooms.map(c => c.id);

    /* -----------------------------------------------------------------
       4) subject_sections ของ "วิชาปัจจุบัน" ในห้องที่อยู่ในขอบเขต
          ไม่ใช่ admin -> จำกัดเฉพาะ section ที่ตัวเองสอน (teacher_id/co_teacher_id)
       ----------------------------------------------------------------- */
    async function fetchSectionsWithFallback() {
  function buildBaseQuery() {
    let q = admin
      .from("subject_sections")
      .select("id, subject_id, classroom_id, academic_year_id, teacher_id, co_teacher_id")
      .eq("subject_id", subjectId)
      .in("classroom_id", scopeClassroomIds);
    if (!isAdmin) {
      q = q.or(`teacher_id.eq.${requesterId},co_teacher_id.eq.${requesterId}`);
    }
    return q;
  }

  if (academicYearId) {
    const { data } = await buildBaseQuery().eq("academic_year_id", academicYearId);
    if (data && data.length > 0) return data;
    // Fallback: section ผูกกับปีการศึกษาอื่น (ไม่ตรงกับปีที่เลือก/ปีปัจจุบัน)
    // ดึงโดยไม่กรองปีการศึกษาแทน ดีกว่าแสดงผลว่างทั้งที่มี section อยู่จริง
  }

  const { data } = await buildBaseQuery();
  return data ?? [];
}

const sections = await fetchSectionsWithFallback();
if (!sections || sections.length === 0) return NextResponse.json(emptyResult(role));

    const sectionIds = sections.map(s => s.id);
    // ห้องที่มี section ของวิชานี้จริง ๆ (กันกรณีบางห้องในสายชั้นไม่ได้สอนวิชานี้)
    const classroomIds = Array.from(new Set(sections.map(s => s.classroom_id)));
    classrooms = classrooms.filter(c => classroomIds.includes(c.id));

    /* -----------------------------------------------------------------
       5) นักเรียนในห้องที่อยู่ในขอบเขต (เฉพาะห้องที่มีวิชานี้สอนจริง)
       ----------------------------------------------------------------- */
    const { data: students } = await admin
      .from("students")
      .select("id, prefix, first_name, last_name, seat_number, classroom_id")
      .in("classroom_id", classroomIds);

    if (!students || students.length === 0) return NextResponse.json(emptyResult(role));

    /* -----------------------------------------------------------------
       6) assignments -> submissions (เฉพาะ section ของวิชานี้ในขอบเขต)
       ----------------------------------------------------------------- */
    let assignmentQuery = admin
      .from("assignments")
      .select("id, subject_section_id, max_score, due_date, assigned_at")
      .in("subject_section_id", sectionIds);
    if (yearStart) assignmentQuery = assignmentQuery.gte("assigned_at", yearStart);
    if (yearEnd) assignmentQuery = assignmentQuery.lte("assigned_at", yearEnd);

    const { data: assignments } = await assignmentQuery;
    const assignmentIds = (assignments ?? []).map(a => a.id);

    const { data: submissions } = assignmentIds.length
      ? await admin
          .from("assignment_submissions")
          .select("assignment_id, student_id, status, score, submitted_at")
          .in("assignment_id", assignmentIds)
      : { data: [] as any[] };

    /* -----------------------------------------------------------------
       7) เช็กชื่อ (กรองตามช่วงปีการศึกษาถ้าระบุ) + ข้อมูลอ้างอิงชื่อวิชา/ครู
       ----------------------------------------------------------------- */
    async function fetchAttendanceWithFallback() {
  if (yearStart && yearEnd) {
    const { data } = await admin
      .from("attendance_records")
      .select("student_id, classroom_id, status, attendance_date")
      .in("classroom_id", classroomIds)
      .gte("attendance_date", yearStart)
      .lte("attendance_date", yearEnd);

    if (data && data.length > 0) return data;

    // Fallback: ตัวกรองปีการศึกษาไม่เจอข้อมูลเลย (start_date/end_date อาจตั้งไม่ตรงกับข้อมูลจริง)
    // ดึงทั้งหมดของห้องในขอบเขตแทน ดีกว่าแสดงผลว่างทั้งที่มีข้อมูลจริงอยู่
  }

  const { data } = await admin
    .from("attendance_records")
    .select("student_id, classroom_id, status, attendance_date")
    .in("classroom_id", classroomIds);
  return data ?? [];
}

const [attendanceRecords, { data: subjectRow }, { data: teacherUsers }] = await Promise.all([
  fetchAttendanceWithFallback(),
  admin.from("subjects").select("id, subject_code, name_th").eq("id", subjectId).maybeSingle(),
  admin.from("users").select("id, full_name, first_name, last_name").in(
    "id",
    Array.from(new Set(sections.flatMap(s => [s.teacher_id, s.co_teacher_id]).filter(Boolean)))
  ),
]);

    /* -----------------------------------------------------------------
       8) คำนวณสถิติต่อนักเรียน
       ----------------------------------------------------------------- */
    const assignmentById = new Map((assignments ?? []).map(a => [a.id, a]));
    const classroomById = new Map(classrooms.map(c => [c.id, c]));
    const sectionByClassroom = new Map(sections.map(s => [s.classroom_id, s]));

    const attendanceByStudent: Record<string, { present: number; total: number }> = {};
    (attendanceRecords ?? []).forEach((r: any) => {
      if (!attendanceByStudent[r.student_id]) attendanceByStudent[r.student_id] = { present: 0, total: 0 };
      attendanceByStudent[r.student_id].total += 1;
      if (r.status === "present" || r.status === "late") attendanceByStudent[r.student_id].present += 1;
    });

    const scoreByStudent: Record<string, { sum: number; max: number }> = {};
    const onTimeByStudent: Record<string, { onTime: number; known: number }> = {};
    let pendingReviewCount = 0;
    (submissions ?? []).forEach((sub: any) => {
      const a = assignmentById.get(sub.assignment_id);
      if (!a) return;
      if (sub.status === "pending_review") pendingReviewCount += 1;

      if (!scoreByStudent[sub.student_id]) scoreByStudent[sub.student_id] = { sum: 0, max: 0 };
      if (sub.score !== null && sub.score !== undefined) {
        scoreByStudent[sub.student_id].sum += sub.score ?? 0;
        scoreByStudent[sub.student_id].max += a.max_score ?? 0;
      }

      if (!onTimeByStudent[sub.student_id]) onTimeByStudent[sub.student_id] = { onTime: 0, known: 0 };
      if (a.due_date && sub.submitted_at) {
        onTimeByStudent[sub.student_id].known += 1;
        if (new Date(sub.submitted_at).getTime() <= new Date(a.due_date).getTime()) {
          onTimeByStudent[sub.student_id].onTime += 1;
        }
      }
    });

    type StudentStat = {
      id: string;
      name: string;
      seatNumber: number;
      classroomId: string;
      classroomName: string;
      attendanceRate: number | null;
      avgScore: number | null;
      onTimeRate: number | null;
      atRisk: boolean;
      riskLevel: "high" | "medium" | null;
      reasons: string[];
    };

    const studentStats: StudentStat[] = students.map(s => {
      const att = attendanceByStudent[s.id];
      const attendanceRate = att && att.total > 0 ? att.present / att.total : null;
      const sc = scoreByStudent[s.id];
      const avgScore = sc && sc.max > 0 ? (sc.sum / sc.max) * 100 : null;
      const ot = onTimeByStudent[s.id];
      const onTimeRate = ot && ot.known > 0 ? (ot.onTime / ot.known) * 100 : null;

      const reasons: string[] = [];
      if (attendanceRate !== null && attendanceRate < ATTENDANCE_RISK_THRESHOLD) reasons.push("เข้าเรียนต่ำกว่า 80%");
      if (avgScore !== null && avgScore < SCORE_RISK_THRESHOLD) reasons.push("คะแนนเฉลี่ยต่ำกว่า 50%");

      const classroom = classroomById.get(s.classroom_id);
      return {
        id: s.id,
        name: `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim(),
        seatNumber: s.seat_number,
        classroomId: s.classroom_id,
        classroomName: classroom ? `${classroom.grade_group ?? ""} ${classroom.room_name ?? ""}`.trim() : "-",
        attendanceRate,
        avgScore,
        onTimeRate,
        atRisk: reasons.length > 0,
        riskLevel: reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : null,
        reasons,
      };
    });

    /* -----------------------------------------------------------------
       9) สรุปภาพรวม (totals)
       ----------------------------------------------------------------- */
    const atRiskStudents = studentStats.filter(s => s.atRisk);
    const withAttendance = studentStats.filter(s => s.attendanceRate !== null);
    const withScore = studentStats.filter(s => s.avgScore !== null);
    const withOnTime = studentStats.filter(s => s.onTimeRate !== null);

    const totals = {
      studentCount: studentStats.length,
      atRiskCount: atRiskStudents.length,
      atRiskHigh: atRiskStudents.filter(s => s.riskLevel === "high").length,
      atRiskMedium: atRiskStudents.filter(s => s.riskLevel === "medium").length,
      atRiskPercent: studentStats.length > 0 ? (atRiskStudents.length / studentStats.length) * 100 : 0,
      attendanceRate: withAttendance.length > 0 ? avg(withAttendance.map(s => s.attendanceRate as number)) * 100 : null,
      avgScore: withScore.length > 0 ? avg(withScore.map(s => s.avgScore as number)) : null,
      onTimeRate: withOnTime.length > 0 ? avg(withOnTime.map(s => s.onTimeRate as number)) : null,
      onTimePendingCount: pendingReviewCount,
    };

    /* -----------------------------------------------------------------
       10) การกระจายของคะแนน (เฉพาะคนที่มีข้อมูลคะแนน)
       ----------------------------------------------------------------- */
    const bands = [
      { key: "0-49", min: 0, max: 49 },
      { key: "50-59", min: 50, max: 59 },
      { key: "60-69", min: 60, max: 69 },
      { key: "70-79", min: 70, max: 79 },
      { key: "80-89", min: 80, max: 89 },
      { key: "90-100", min: 90, max: 100 },
    ];
    const scoreDistribution = bands.map(b => {
      const count = withScore.filter(s => (s.avgScore as number) >= b.min && (s.avgScore as number) <= b.max).length;
      return {
        band: b.key,
        count,
        percent: withScore.length > 0 ? (count / withScore.length) * 100 : 0,
      };
    });

    /* -----------------------------------------------------------------
       11) อันดับห้องเรียน (ความเสี่ยงน้อย -> มาก) — มีความหมายเฉพาะโหมด "สายชั้น"
       ----------------------------------------------------------------- */
    const byClassroom = new Map<string, StudentStat[]>();
    studentStats.forEach(s => {
      if (!byClassroom.has(s.classroomId)) byClassroom.set(s.classroomId, []);
      byClassroom.get(s.classroomId)!.push(s);
    });
    const classroomRanking = Array.from(byClassroom.entries())
      .map(([classroomId, list]) => {
        const riskCount = list.filter(s => s.atRisk).length;
        const c = classroomById.get(classroomId);
        return {
          classroomId,
          name: c ? `${c.grade_group ?? ""} ${c.room_name ?? ""}`.trim() : "-",
          studentCount: list.length,
          riskCount,
          riskPercent: list.length > 0 ? (riskCount / list.length) * 100 : 0,
        };
      })
      .sort((a, b) => a.riskPercent - b.riskPercent);

    /* -----------------------------------------------------------------
       12) subjectRanking / teacherRanking — ในบริบทนี้มีวิชาเดียวเสมอ (subjectId ที่ล็อกไว้)
           จึงคืนเป็นแถวเดียวของวิชาปัจจุบัน (เผื่อ UI ฝั่งหน้าใช้โครงสร้างเดิม)
       ----------------------------------------------------------------- */
    const subjectRanking = [
      {
        subjectId: subjectId,
        name: subjectRow?.name_th ?? "-",
        studentCount: studentStats.length,
        attendanceRate: totals.attendanceRate,
        riskPercent: totals.atRiskPercent,
      },
    ];

    const teacherNameById = new Map(
      (teacherUsers ?? []).map((t: any) => [t.id, t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim()])
    );
    const byTeacher = new Map<string, Set<string>>();
    sections.forEach(sec => {
      if (!sec.teacher_id) return;
      const classroomStudentIds = students.filter(s => s.classroom_id === sec.classroom_id).map(s => s.id);
      if (!byTeacher.has(sec.teacher_id)) byTeacher.set(sec.teacher_id, new Set());
      classroomStudentIds.forEach(id => byTeacher.get(sec.teacher_id)!.add(id));
    });

    const studentStatById = new Map(studentStats.map(s => [s.id, s]));
    const teacherRanking = isAdmin
      ? Array.from(byTeacher.entries())
          .map(([teacherId, idSet]) => {
            const list = Array.from(idSet).map(id => studentStatById.get(id)).filter(Boolean) as StudentStat[];
            const riskCount = list.filter(s => s.atRisk).length;
            return {
              teacherId,
              name: teacherNameById.get(teacherId) ?? "-",
              studentCount: list.length,
              riskPercent: list.length > 0 ? (riskCount / list.length) * 100 : 0,
            };
          })
          .filter(t => t.studentCount > 0)
          .sort((a, b) => a.riskPercent - b.riskPercent)
      : [];

    return NextResponse.json({
      role,
      totals,
      atRiskStudents: atRiskStudents
        .sort((a, b) => (a.attendanceRate ?? 1) - (b.attendanceRate ?? 1))
        .map(s => ({
          id: s.id,
          name: s.name,
          seatNumber: s.seatNumber,
          classroomName: s.classroomName,
          attendanceRate: s.attendanceRate === null ? null : Number((s.attendanceRate * 100).toFixed(1)),
          avgScore: s.avgScore === null ? null : Number(s.avgScore.toFixed(1)),
          reasons: s.reasons,
        })),
      scoreDistribution,
      classroomRanking,
      subjectRanking,
      teacherRanking,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "โหลดข้อมูลเชิงลึกไม่สำเร็จ" }, { status: 500 });
  }
}

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}