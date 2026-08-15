import { NextRequest, NextResponse } from "next/server";
// ยืนยันจาก /api/subject-grades/summary ของโปรเจกต์จริง: ใช้ admin client ตัวนี้
import { createAdminClient } from "@/lib/supabase/admin";

/* =========================================================================
   GET /api/insights/overview
   -------------------------------------------------------------------------
   Query params:
     requester_id : string (users.id)  -- บังคับ ใช้เช็ก role/สิทธิ์
     scope        : "school" | "grade_level" | "classroom"  (default: "classroom")
     scope_id     : string  -- id ของ grade_levels หรือ classrooms ตาม scope (ไม่ต้องส่งถ้า scope = "school")
     subject_id   : string  -- (เฉพาะครูประจำวิชา) จำกัดเฉพาะวิชาที่เลือก

   ⚠️ ASSUMPTIONS เกี่ยวกับ schema (ปรับชื่อ table/column ตรงนี้ได้ตามจริง):
     - users(id, role, extra_roles jsonb/text[], full_name, first_name, last_name)
       role อยู่ใน: admin | director | deputy_director | teacher | homeroom_teacher
       extra_roles มีค่า "subject_teacher" ได้ (เป็น array)
     - classrooms(id, room_name, grade_group, grade_level_id, homeroom_teacher_id, homeroom_teacher_2_id)
     - grade_levels(id, name)  -- ใช้แทนทั้ง "สายชั้น"/"ระดับชั้น" ตามที่ classrooms.grade_level_id อ้างถึง
     - students(id, prefix, first_name, last_name, seat_number, classroom_id)
     - subject_sections(id, subject_id, classroom_id, teacher_id)
     - subjects(id, subject_code, name_th)
     - assignments(id, subject_section_id, max_score, due_date, assigned_at)
     - assignment_submissions(id, assignment_id, student_id, status, score, submitted_at, teacher_comment, graded_at)
     - score_events(id, student_id, preset_id, points, subject_section_id)  -- มี subject_section_id ตรง ๆ กรองง่ายกว่า join ผ่าน assignment
     - attendance_records(student_id, classroom_id, status, attendance_date)
       ⚠️ attendance_records ผูกกับ classroom_id (เช็กชื่อระดับห้อง/โฮมรูม) ไม่ใช่รายวิชา
       จึงใช้ค่านี้เป็นตัวแทน "อัตราการเข้าเรียน" ทั้งในภาพรวมนักเรียน และในอันดับวิชา (โดยประมาณ)
       ถ้าภายหลังมีตารางเช็กชื่อแยกรายวิชาโดยตรง ให้เปลี่ยนมาใช้ตารางนั้นแทนในส่วน subjectRanking

   เกณฑ์ "กลุ่มเสี่ยง" (แก้ค่าคงที่ด้านล่างได้ภายหลัง):
     - อัตราเข้าเรียน < 80%  หรือ
     - คะแนนเฉลี่ย (%) < 50
   ========================================================================= */

const ATTENDANCE_RISK_THRESHOLD = 0.8; // เข้าเรียน < 80% ถือว่าเสี่ยง
const SCORE_RISK_THRESHOLD = 50; // คะแนนเฉลี่ย(%) < 50 ถือว่าเสี่ยง

type Role = "admin" | "homeroom_teacher" | "subject_teacher" | "unknown";

function emptyResult(role: Role) {
  return {
    role,
    totals: {
      studentCount: 0,
      atRiskCount: 0,
      atRiskPercent: 0,
      onTimeRate: null as number | null,
      attendanceRate: null as number | null,
      avgScore: null as number | null,
    },
    atRiskStudents: [] as any[],
    scoreDistribution: [] as any[],
    classroomRanking: [] as any[],
    subjectRanking: [] as any[],
    teacherRanking: [] as any[],
  };
}

export async function GET(req: NextRequest) {
  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const requesterId = searchParams.get("requester_id");
  const scope = (searchParams.get("scope") ?? "classroom") as "school" | "grade_level" | "classroom";
  const scopeId = searchParams.get("scope_id");
  const subjectId = searchParams.get("subject_id");

  if (!requesterId) {
    return NextResponse.json({ error: "missing requester_id" }, { status: 400 });
  }

  // 1) หา role ของผู้ขอข้อมูล
  const { data: requester, error: userErr } = await admin
    .from("users")
    .select("id, role, extra_roles, full_name, first_name, last_name")
    .eq("id", requesterId)
    .maybeSingle();

  if (userErr || !requester) {
    return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
  }

  const isAdmin = ["admin", "director", "deputy_director"].includes(requester.role);
  const isHomeroom = requester.role === "homeroom_teacher";
  const extraRoles: string[] = Array.isArray(requester.extra_roles) ? requester.extra_roles : [];
  const isSubjectTeacher = extraRoles.includes("subject_teacher");

  const role: Role = isAdmin ? "admin" : isSubjectTeacher ? "subject_teacher" : isHomeroom ? "homeroom_teacher" : "unknown";

  if (role === "unknown") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลเชิงลึก" }, { status: 403 });
  }
  if (!isAdmin && scope === "school") {
    return NextResponse.json({ error: "เฉพาะแอดมิน/ผู้บริหารเท่านั้นที่ดูภาพรวมทั้งโรงเรียนได้" }, { status: 403 });
  }

  try {
    /* -----------------------------------------------------------------
       2) หา classroom ids ตามขอบเขตที่ขอ + เช็กสิทธิ์การมองเห็นของ role
       ----------------------------------------------------------------- */
    let classroomQuery = admin
      .from("classrooms")
      .select("id, room_name, grade_group, grade_level_id, homeroom_teacher_id, homeroom_teacher_2_id");

    if (scope === "classroom" && scopeId) classroomQuery = classroomQuery.eq("id", scopeId);
    else if (scope === "grade_level" && scopeId) classroomQuery = classroomQuery.eq("grade_level_id", scopeId);

    if (isHomeroom && !isAdmin) {
      classroomQuery = classroomQuery.or(
        `homeroom_teacher_id.eq.${requesterId},homeroom_teacher_2_id.eq.${requesterId}`
      );
    }

    const { data: classroomsRaw } = await classroomQuery;
    let classrooms = classroomsRaw ?? [];

    /* -----------------------------------------------------------------
       3) ครูประจำวิชา: จำกัดเฉพาะห้องที่ตัวเองสอนวิชานั้นจริง ๆ
       ----------------------------------------------------------------- */
    let allowedSectionIds: string[] | null = null;
    if (isSubjectTeacher && !isAdmin) {
      let sectionQuery = admin.from("subject_sections").select("id, classroom_id, subject_id").eq("teacher_id", requesterId);
      if (subjectId) sectionQuery = sectionQuery.eq("subject_id", subjectId);
      const { data: mySections } = await sectionQuery;
      const allowedClassroomIds = new Set((mySections ?? []).map(s => s.classroom_id));
      allowedSectionIds = (mySections ?? []).map(s => s.id);

      classrooms =
        scope === "classroom" || scope === "grade_level"
          ? classrooms.filter(c => allowedClassroomIds.has(c.id))
          : (classroomsRaw ?? []).filter(c => allowedClassroomIds.has(c.id)); // scope="school" ครูวิชาไม่ควรมาถึงจุดนี้ (บล็อกไว้ด้านบนแล้ว)
    }

    const classroomIds = classrooms.map(c => c.id);
    if (classroomIds.length === 0) return NextResponse.json(emptyResult(role));

    /* -----------------------------------------------------------------
       4) นักเรียนในขอบเขต
       ----------------------------------------------------------------- */
    const { data: students } = await admin
      .from("students")
      .select("id, prefix, first_name, last_name, seat_number, classroom_id")
      .in("classroom_id", classroomIds);

    if (!students || students.length === 0) return NextResponse.json(emptyResult(role));
    const studentIds = students.map(s => s.id);

    /* -----------------------------------------------------------------
       5) subject_sections ในขอบเขต (สำหรับคะแนน/ส่งงาน)
       ----------------------------------------------------------------- */
    let sectionsQuery = admin
      .from("subject_sections")
      .select("id, subject_id, classroom_id, teacher_id")
      .in("classroom_id", classroomIds);
    if (allowedSectionIds) sectionsQuery = sectionsQuery.in("id", allowedSectionIds);
    if (subjectId) sectionsQuery = sectionsQuery.eq("subject_id", subjectId);

    const { data: sections } = await sectionsQuery;
    const sectionIds = (sections ?? []).map(s => s.id);

    /* -----------------------------------------------------------------
       6) ดึงข้อมูลย่อยที่เหลือ (assignments -> submissions, attendance, ตารางอ้างอิงชื่อ)
       ----------------------------------------------------------------- */
    const { data: assignments } = sectionIds.length
      ? await admin.from("assignments").select("id, subject_section_id, max_score, due_date").in("subject_section_id", sectionIds)
      : { data: [] as any[] };

    const assignmentIds = (assignments ?? []).map(a => a.id);

    const { data: submissions } = assignmentIds.length
      ? await admin.from("assignment_submissions").select("assignment_id, student_id, status, score, submitted_at").in("assignment_id", assignmentIds)
      : { data: [] as any[] };

    const [{ data: attendanceRecords }, { data: subjects }, { data: teacherUsers }] = await Promise.all([
      admin.from("attendance_records").select("student_id, classroom_id, status, attendance_date").in("classroom_id", classroomIds),
      admin.from("subjects").select("id, subject_code, name_th"),
      admin.from("users").select("id, full_name, first_name, last_name"),
    ]);

    /* -----------------------------------------------------------------
       7) คำนวณสถิติต่อนักเรียน
       ----------------------------------------------------------------- */
    const assignmentById = new Map((assignments ?? []).map(a => [a.id, a]));
    const sectionById = new Map((sections ?? []).map(s => [s.id, s]));
    const classroomById = new Map(classrooms.map(c => [c.id, c]));

    const attendanceByStudent: Record<string, { present: number; total: number }> = {};
    (attendanceRecords ?? []).forEach((r: any) => {
      if (!attendanceByStudent[r.student_id]) attendanceByStudent[r.student_id] = { present: 0, total: 0 };
      attendanceByStudent[r.student_id].total += 1;
      if (r.status === "present" || r.status === "late") attendanceByStudent[r.student_id].present += 1;
    });

    const scoreByStudent: Record<string, { sum: number; max: number }> = {};
    const onTimeByStudent: Record<string, { onTime: number; known: number }> = {};
    (submissions ?? []).forEach((sub: any) => {
      const a = assignmentById.get(sub.assignment_id);
      if (!a) return;
      if (!scoreByStudent[sub.student_id]) scoreByStudent[sub.student_id] = { sum: 0, max: 0 };
      scoreByStudent[sub.student_id].sum += sub.score ?? 0;
      scoreByStudent[sub.student_id].max += a.max_score ?? 0;

      if (!onTimeByStudent[sub.student_id]) onTimeByStudent[sub.student_id] = { onTime: 0, known: 0 };
      if ((sub.status === "submitted" || sub.status === "graded") && a.due_date && sub.submitted_at) {
        onTimeByStudent[sub.student_id].known += 1;
        if (new Date(sub.submitted_at).getTime() <= new Date(a.due_date).getTime()) {
          onTimeByStudent[sub.student_id].onTime += 1;
        }
      }
    });
    // งานที่ยังไม่มีคะแนนเลย -> ยังไม่รวม max_score เข้าตัวหาร เพื่อไม่ให้ % คะแนนดูต่ำเกินจริงจากงานที่ยังไม่ตรวจ
    // (max_score ถูกรวมเฉพาะตอนมี submission ของนักเรียนคนนั้นแล้วเท่านั้น ตามลอจิกด้านบน)

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
        reasons,
      };
    });

    /* -----------------------------------------------------------------
       8) สรุปภาพรวม (totals)
       ----------------------------------------------------------------- */
    const atRiskStudents = studentStats.filter(s => s.atRisk);
    const withAttendance = studentStats.filter(s => s.attendanceRate !== null);
    const withScore = studentStats.filter(s => s.avgScore !== null);
    const withOnTime = studentStats.filter(s => s.onTimeRate !== null);

    const totals = {
      studentCount: studentStats.length,
      atRiskCount: atRiskStudents.length,
      atRiskPercent: studentStats.length > 0 ? (atRiskStudents.length / studentStats.length) * 100 : 0,
      attendanceRate: withAttendance.length > 0 ? avg(withAttendance.map(s => s.attendanceRate as number)) * 100 : null,
      avgScore: withScore.length > 0 ? avg(withScore.map(s => s.avgScore as number)) : null,
      onTimeRate: withOnTime.length > 0 ? avg(withOnTime.map(s => s.onTimeRate as number)) : null,
    };

    /* -----------------------------------------------------------------
       9) การกระจายของคะแนน (เฉพาะคนที่มีข้อมูลคะแนน)
       ----------------------------------------------------------------- */
    const bands = [
      { key: "0-49", min: 0, max: 49 },
      { key: "50-59", min: 50, max: 59 },
      { key: "60-69", min: 60, max: 69 },
      { key: "70-79", min: 70, max: 79 },
      { key: "80-100", min: 80, max: 100 },
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
       10) อันดับห้องเรียน (ความเสี่ยงน้อย -> มาก)
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
       11) อันดับวิชาตามอัตราการเข้าเรียน (ความเสี่ยงน้อย -> มาก)
       ⚠️ ประมาณจากอัตราเข้าเรียนของนักเรียนที่ลงทะเบียนวิชานั้น (ดูหมายเหตุบนสุดของไฟล์)
       ----------------------------------------------------------------- */
    const subjectNameById = new Map((subjects ?? []).map((sub: any) => [sub.id, sub.name_th]));
    const studentStatById = new Map(studentStats.map(s => [s.id, s]));

    const bySubject = new Map<string, Set<string>>(); // subject_id -> student ids ที่ลงเรียน
    (sections ?? []).forEach((sec: any) => {
      const classroomStudentIds = students.filter(s => s.classroom_id === sec.classroom_id).map(s => s.id);
      if (!bySubject.has(sec.subject_id)) bySubject.set(sec.subject_id, new Set());
      classroomStudentIds.forEach(id => bySubject.get(sec.subject_id)!.add(id));
    });

    const subjectRanking = Array.from(bySubject.entries())
      .map(([subjId, idSet]) => {
        const list = Array.from(idSet).map(id => studentStatById.get(id)).filter(Boolean) as StudentStat[];
        const withAtt = list.filter(s => s.attendanceRate !== null);
        const avgAttendance = withAtt.length > 0 ? avg(withAtt.map(s => s.attendanceRate as number)) * 100 : null;
        const riskCount = list.filter(s => s.atRisk).length;
        return {
          subjectId: subjId,
          name: subjectNameById.get(subjId) ?? "-",
          studentCount: list.length,
          attendanceRate: avgAttendance,
          riskPercent: list.length > 0 ? (riskCount / list.length) * 100 : 0,
        };
      })
      .sort((a, b) => a.riskPercent - b.riskPercent);

    /* -----------------------------------------------------------------
       12) ครูที่ดีที่สุด (เสี่ยงต่ำสุด) — เฉพาะแอดมินเท่านั้นที่ควรใช้ค่านี้ในหน้าจอ
       ----------------------------------------------------------------- */
    const teacherNameById = new Map((teacherUsers ?? []).map((t: any) => [t.id, t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim()]));
    const byTeacher = new Map<string, Set<string>>(); // teacher_id -> student ids
    (sections ?? []).forEach((sec: any) => {
      if (!sec.teacher_id) return;
      const classroomStudentIds = students.filter(s => s.classroom_id === sec.classroom_id).map(s => s.id);
      if (!byTeacher.has(sec.teacher_id)) byTeacher.set(sec.teacher_id, new Set());
      classroomStudentIds.forEach(id => byTeacher.get(sec.teacher_id)!.add(id));
    });

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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "โหลดข้อมูลเชิงลึกไม่สำเร็จ" }, { status: 500 });
  }
}

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}