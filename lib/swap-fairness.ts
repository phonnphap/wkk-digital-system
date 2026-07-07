// ══════════════════════════════════════════════════════════════════════════
// lib/swap-fairness.ts
// ── ฟังก์ชันช่วยคำนวณสำหรับระบบ "แลกคาบ & สอนแทน" ────────────────────────
//
// ต้องเพิ่มคอลัมน์ใน DB ก่อนใช้งาน (รันใน Supabase SQL Editor):
//
//   alter table users add column if not exists grade_level text;
//   alter table users add column if not exists extra_role text;
//   alter table class_swap_requests alter column target_entry_id drop not null;
//   alter table class_swap_requests add column if not exists swap_type text default 'mutual';
//
// ══════════════════════════════════════════════════════════════════════════

export interface LeaveRow {
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
}

/** ครูคนนี้ลา/ไปราชการในวันที่ระบุหรือไม่ (นับเฉพาะ approved) */
export function isTeacherOnLeave(
  teacherId: string,
  date: string,
  leaveRequests: LeaveRow[]
): boolean {
  return leaveRequests.some(
    (l) =>
      l.status === "approved" &&
      l.user_id === teacherId &&
      date >= l.start_date &&
      date <= l.end_date
  );
}

/** คาบว่างของครูคนหนึ่งในวัน (day_of_week) หนึ่ง — คืนเป็น Set ของ time_slot_id ที่ว่าง */
export function getTeacherFreeSlotIds(
  teacherId: string,
  dayOfWeek: number,
  allEntries: { teacher_id: string; day_of_week: number; time_slot_id: string }[],
  workingSlots: { id: string }[]
): Set<string> {
  const busy = new Set(
    allEntries
      .filter((e) => e.teacher_id === teacherId && e.day_of_week === dayOfWeek)
      .map((e) => e.time_slot_id)
  );
  const free = new Set<string>();
  workingSlots.forEach((s) => {
    if (!busy.has(s.id)) free.add(s.id);
  });
  return free;
}

/** จำนวนครั้ง/ชั่วโมงสะสมที่เคยถูกจัดสอนแทน (ยิ่งเยอะ ยิ่งมีสิทธิ์ถูกจัดใหม่น้อยลง เพื่อความเท่าเทียม) */
export function getSubHistoryScore(
  teacherId: string,
  subRecords: { substitute_teacher_id?: string; hours_count: number }[]
): number {
  return subRecords
    .filter((r) => r.substitute_teacher_id === teacherId)
    .reduce((s, r) => s + Number(r.hours_count || 1), 0);
}

/**
 * เลือกครูที่เหมาะสมที่สุดสำหรับคาบหนึ่ง จาก candidates:
 *  1) ต้องว่างคาบนั้นจริง
 *  2) ต้องไม่ลา/ไปราชการวันนั้น
 *  3) เรียงตาม "จำนวนคาบว่างทั้งวัน" มาก -> น้อย ก่อนเสมอ (คนว่างเยอะสอนแทนก่อน)
 *  4) ถ้าเท่ากัน เรียงตาม "ประวัติเคยสอนแทนสะสม" น้อย -> มาก (คนที่โดนน้อยกว่ามีสิทธิ์ก่อน = เท่าเทียม)
 */
export function pickBestSubstitute(
  candidates: { id: string }[],
  dayOfWeek: number,
  timeSlotId: string,
  date: string,
  allEntries: { teacher_id: string; day_of_week: number; time_slot_id: string }[],
  workingSlots: { id: string }[],
  leaveRequests: LeaveRow[],
  subRecords: { substitute_teacher_id?: string; hours_count: number }[],
  excludeIds: Set<string> = new Set()
): string | null {
  const scored: { teacherId: string; freeCount: number; subScore: number }[] = [];
  for (const t of candidates) {
    if (excludeIds.has(t.id)) continue;
    if (isTeacherOnLeave(t.id, date, leaveRequests)) continue;
    const freeSlots = getTeacherFreeSlotIds(t.id, dayOfWeek, allEntries, workingSlots);
    if (!freeSlots.has(timeSlotId)) continue;
    scored.push({
      teacherId: t.id,
      freeCount: freeSlots.size,
      subScore: getSubHistoryScore(t.id, subRecords),
    });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.freeCount - a.freeCount || a.subScore - b.subScore);
  return scored[0].teacherId;
}

/**
 * จัดครูสอนแทนอัตโนมัติทั้งวันสำหรับครูที่ลา/ไปราชการ
 * ลำดับการหา: สายชั้นเดียวกันก่อนเสมอ -> ถ้าไม่มีจริงๆ ค่อยขยายไปทั้งโรงเรียน
 * ระบบจะเช็คครูที่ลา/ไปราชการวันนั้น เอาออกจากรายชื่อผู้มีสิทธิ์สอนแทนก่อนเสมอ
 * คืนค่า { [timetable_entry_id]: substitute_teacher_id | null }
 */
export function autoAssignWholeDay(
  absentTeacherId: string,
  date: string,
  dayOfWeek: number,
  absentDayEntries: { id: string; time_slot_id: string; teacher_id: string; day_of_week: number }[],
  allEntries: { teacher_id: string; day_of_week: number; time_slot_id: string }[],
  allTeachers: { id: string; grade_level?: string }[],
  workingSlots: { id: string }[],
  leaveRequests: LeaveRow[],
  subRecords: { substitute_teacher_id?: string; hours_count: number }[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const absentTeacher = allTeachers.find((t) => t.id === absentTeacherId);

  const sameGrade = allTeachers.filter(
    (t) =>
      t.id !== absentTeacherId &&
      t.grade_level &&
      t.grade_level === absentTeacher?.grade_level
  );
  const others = allTeachers.filter(
    (t) =>
      t.id !== absentTeacherId &&
      !(t.grade_level && t.grade_level === absentTeacher?.grade_level)
  );

  for (const entry of absentDayEntries) {
    // 1) ลองหาในสายชั้นเดียวกันก่อนเสมอ
    let sub = pickBestSubstitute(
      sameGrade,
      dayOfWeek,
      entry.time_slot_id,
      date,
      allEntries,
      workingSlots,
      leaveRequests,
      subRecords
    );
    // 2) ไม่มีคนว่างในสายชั้นเดียวกันจริงๆ -> ขยายไปทั้งโรงเรียน
    if (!sub) {
      sub = pickBestSubstitute(
        others,
        dayOfWeek,
        entry.time_slot_id,
        date,
        allEntries,
        workingSlots,
        leaveRequests,
        subRecords
      );
    }
    result[entry.id] = sub;
  }
  return result;
}

/** อีเมลของหัวหน้าสายชั้น (extra_role === 'grade_head') ตามสายชั้นที่ระบุ */
export function findGradeHeadEmails(
  gradeLevel: string | undefined,
  allTeachers: any[]
): string[] {
  if (!gradeLevel) return [];
  return allTeachers
    .filter((t) => t.extra_role === "grade_head" && t.grade_level === gradeLevel)
    .map((t) => t.email)
    .filter(Boolean);
}

/** ส่งอีเมลแจ้งเตือนไปยังครูที่เกี่ยวข้อง + หัวหน้าสายชั้น (ใช้ /api/send-email เดิมของระบบลา) */
export async function notifySwapParties(opts: {
  toTeacherEmails: (string | undefined)[];
  gradeHeadEmails: string[];
  subject: string;
  html: string;
}) {
  const to = [
    ...new Set([...opts.toTeacherEmails, ...opts.gradeHeadEmails].filter(Boolean)),
  ] as string[];
  if (to.length === 0) return;
  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject: opts.subject, html: opts.html }),
    });
  } catch (e) {
    console.warn("[notifySwapParties] failed:", e);
  }
}