/**
 * lib/timetable-substitution.ts
 * ─────────────────────────────────────────────────────────
 * Helper กลางสำหรับระบบ "แลกคาบ / จัดครูสอนแทน" โดยอ้างอิงตารางจริง:
 *   timetable_entries, timetable_change_requests, classrooms, time_slots, users
 *
 * ใช้ร่วมกันได้ทั้งจาก SubstitutionSystem.tsx และจากฝั่งระบบลา (LeavePage)
 * ตอนใบลาอนุมัติครบ — เรียก autoAssignSubstitute() วนตามคาบที่ขาด แล้ว insert
 * ลง timetable_change_requests (request_type='leave_substitute', leave_request_id=...)
 * ─────────────────────────────────────────────────────────
 */

import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ── ค่าคงที่ ─────────────────────────────────────────────
export const DAY_OF_WEEK_LABELS: Record<number, string> = {
  1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัสบดี", 5: "ศุกร์",
};
export const DAY_OF_WEEK_LIST = [1, 2, 3, 4, 5];

/** แปลง JS Date -> day_of_week (1=จันทร์...5=ศุกร์), null ถ้าเป็นเสาร์-อาทิตย์ */
export function dateToDayOfWeek(dateStr: string): number | null {
  if (!dateStr) return null;
  const jsDay = new Date(dateStr + "T00:00:00").getDay(); // 0=อาทิตย์...6=เสาร์
  if (jsDay === 0 || jsDay === 6) return null;
  return jsDay; // จันทร์(1)...ศุกร์(5) ตรงกับ jsDay อยู่แล้ว
}

// ── Types ──────────────────────────────────────────────
export type TimeSlot = {
  id: string; slot_number: number; start_time: string; end_time: string;
  slot_label: string; schedule_type?: string;
};

export type ScheduleEntry = {
  id: string; academic_year_id: string; day_of_week: number; time_slot_id: string;
  classroom_id: string; subject_id: string; teacher_id: string; teacher_id_2?: string | null;
  time_slot?: TimeSlot;
  classroom?: { id: string; room_name?: string; room_number?: string; grade_level_id: string };
  subject?: { id: string; name: string };
};

export type MiniTeacher = { id: string; grade_level?: string | null; full_name?: string; email?: string };

// ── ปีการศึกษาปัจจุบัน ───────────────────────────────────
export async function getCurrentAcademicYearId(): Promise<string | null> {
  const { data } = await supabase.from("academic_years").select("id,is_current").eq("is_current", true).maybeSingle();
  if (data?.id) return data.id;
  const { data: latest } = await supabase.from("academic_years").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return latest?.id ?? null;
}

// ── คาบเรียนทั้งหมด ──────────────────────────────────────
export async function loadTimeSlots(): Promise<TimeSlot[]> {
  const { data } = await supabase.from("time_slots").select("*").order("slot_number", { ascending: true });
  return (data as TimeSlot[]) ?? [];
}

// ── ตารางสอนของครู 1 คน (ทุกวัน) ─────────────────────────
export async function loadTeacherSchedule(teacherId: string, academicYearId: string): Promise<ScheduleEntry[]> {
  if (!teacherId || !academicYearId) return [];
  const { data, error } = await supabase
    .from("timetable_entries")
    .select(`*, time_slot:time_slots(*), classroom:classrooms(id,room_name,room_number,grade_level_id), subject:subjects(id,name:name_th)`)
    .eq("academic_year_id", academicYearId)
    .or(`teacher_id.eq.${teacherId},teacher_id_2.eq.${teacherId}`);
  if (error) { console.warn("[loadTeacherSchedule]", error.message); return []; }
  return (data as unknown as ScheduleEntry[]) ?? [];
}

// ── ครูที่ "ติดสอน" อยู่ในวัน+คาบที่ระบุ ──────────────────
export async function findBusyTeacherIds(dayOfWeek: number, timeSlotId: string, academicYearId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("timetable_entries")
    .select("teacher_id,teacher_id_2")
    .eq("academic_year_id", academicYearId)
    .eq("day_of_week", dayOfWeek)
    .eq("time_slot_id", timeSlotId);
  const busy = new Set<string>();
  (data ?? []).forEach((r: any) => { if (r.teacher_id) busy.add(r.teacher_id); if (r.teacher_id_2) busy.add(r.teacher_id_2); });
  return busy;
}

// ── ครูที่ "ว่าง" ในวัน+คาบที่ระบุ จาก allTeacherIds ──────
export async function findFreeTeacherIds(
  allTeacherIds: string[], dayOfWeek: number, timeSlotId: string, academicYearId: string, excludeId?: string
): Promise<string[]> {
  const busy = await findBusyTeacherIds(dayOfWeek, timeSlotId, academicYearId);
  return allTeacherIds.filter(id => !busy.has(id) && id !== excludeId);
}

/**
 * หาครู "ที่สอนอยู่" ในวัน/คาบที่ target ต้องการ (candidate สำหรับแลกคาบเจาะจง)
 * แล้วกรองเฉพาะคนที่ "ว่าง" ในวัน/คาบของฉัน (เพื่อให้แลกกันได้จริงทั้งสองทาง)
 */
export async function findSwapCandidates(params: {
  myDayOfWeek: number; myTimeSlotId: string;      // คาบของฉันที่จะยกให้
  theirDayOfWeek: number; theirTimeSlotId: string; // คาบที่ฉันต้องการ
  academicYearId: string; myTeacherId: string;
}): Promise<string[]> {
  const { myDayOfWeek, myTimeSlotId, theirDayOfWeek, theirTimeSlotId, academicYearId, myTeacherId } = params;
  const { data } = await supabase
    .from("timetable_entries")
    .select("teacher_id,teacher_id_2")
    .eq("academic_year_id", academicYearId)
    .eq("day_of_week", theirDayOfWeek)
    .eq("time_slot_id", theirTimeSlotId);

  const teachingThen = new Set<string>();
  (data ?? []).forEach((r: any) => { if (r.teacher_id) teachingThen.add(r.teacher_id); if (r.teacher_id_2) teachingThen.add(r.teacher_id_2); });
  teachingThen.delete(myTeacherId);
  if (teachingThen.size === 0) return [];

  const busyAtMySlot = await findBusyTeacherIds(myDayOfWeek, myTimeSlotId, academicYearId);
  return Array.from(teachingThen).filter(id => !busyAtMySlot.has(id));
}

/**
 * จัดครูสอนแทนอัตโนมัติ 1 คาบ:
 *   ลำดับความสำคัญ 1) ครูสายชั้นเดียวกันที่ว่าง 2) ครูว่างทั้งโรงเรียน (fallback)
 */
export async function autoAssignSubstitute(params: {
  dayOfWeek: number; timeSlotId: string; academicYearId: string;
  absentTeacherId: string; classroomGradeLevelId: string | null;
  allTeachers: MiniTeacher[];
}): Promise<{ teacherId: string | null; sameGrade: boolean }> {
  const { dayOfWeek, timeSlotId, academicYearId, absentTeacherId, classroomGradeLevelId, allTeachers } = params;
  const busy = await findBusyTeacherIds(dayOfWeek, timeSlotId, academicYearId);
  const free = allTeachers.filter(t => t.id !== absentTeacherId && !busy.has(t.id));

  const sameGradeFree = classroomGradeLevelId ? free.filter(t => t.grade_level === classroomGradeLevelId) : [];
  if (sameGradeFree.length > 0) return { teacherId: sameGradeFree[0].id, sameGrade: true };
  if (free.length > 0) return { teacherId: free[0].id, sameGrade: false };
  return { teacherId: null, sameGrade: false };
}

// ── หาอีเมล "หัวหน้าสายชั้น" ของ grade_level ที่ระบุ ──────
export async function findGradeHeadEmails(gradeLevelId: string | null): Promise<string[]> {
  if (!gradeLevelId) return [];
  const { data } = await supabase.from("users").select("email,extra_roles,grade_level").eq("grade_level", gradeLevelId);
  return (data ?? [])
    .filter((u: any) => Array.isArray(u.extra_roles) && u.extra_roles.includes("grade_head"))
    .map((u: any) => u.email)
    .filter(Boolean);
}

// ── ส่งอีเมลแจ้งเตือน (ใช้ /api/send-email ตัวเดียวกับระบบลา) ──
export async function notifyParties(opts: { to: string[]; subject: string; html: string }) {
  const to = [...new Set(opts.to.filter(Boolean))];
  if (to.length === 0) return;
  try {
    await fetch("/api/send-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject: opts.subject, html: opts.html }),
    });
  } catch (e) { console.warn("[notifyParties] failed:", e); }
}

/**
 * ✅ Entry point สำหรับ "ระบบลา" เรียกใช้ตอนใบลาอนุมัติครบ (allApproved) เพื่อจัดครูสอนแทนอัตโนมัติ
 * ทุกคาบที่ครูคนนี้ขาดในวันนั้น แล้วสร้างแถวใน timetable_change_requests + แจ้งเตือนอัตโนมัติ
 */
export async function createSubstituteRequestsFromLeave(params: {
  leaveRequestId: string; absentTeacherId: string; leaveDate: string; // YYYY-MM-DD
  allTeachers: MiniTeacher[]; reviewerId?: string | null;
}): Promise<{ created: number; unassigned: number }> {
  const { leaveRequestId, absentTeacherId, leaveDate, allTeachers, reviewerId } = params;
  const academicYearId = await getCurrentAcademicYearId();
  const dow = dateToDayOfWeek(leaveDate);
  if (!academicYearId || !dow) return { created: 0, unassigned: 0 };

  const schedule = await loadTeacherSchedule(absentTeacherId, academicYearId);
  const todaysPeriods = schedule.filter(s => s.day_of_week === dow);

  let created = 0, unassigned = 0;
  const linkedId = crypto.randomUUID();

  for (const period of todaysPeriods) {
    const gradeLevelId = period.classroom?.grade_level_id ?? null;
    const { teacherId, sameGrade } = await autoAssignSubstitute({
      dayOfWeek: dow, timeSlotId: period.time_slot_id, academicYearId,
      absentTeacherId, classroomGradeLevelId: gradeLevelId, allTeachers,
    });
    if (!teacherId) { unassigned++; continue; }

    await supabase.from("timetable_change_requests").insert([{
      requester_id: absentTeacherId,
      classroom_id: period.classroom_id,
      time_slot_id: period.time_slot_id,
      day_of_week: dow,
      academic_year_id: academicYearId,
      old_subject_id: period.subject_id,
      old_teacher_id: absentTeacherId,
      new_subject_id: period.subject_id,
      new_teacher_id: teacherId,
      status: "approved", // มาจากใบลาที่อนุมัติแล้ว ไม่ต้องรอตอบรับ
      note: "จัดอัตโนมัติจากระบบลา (ลา/ไปราชการ)",
      request_type: "leave_substitute",
      leave_request_id: leaveRequestId,
      linked_request_id: linkedId,
      same_grade: sameGrade,
      reviewed_by: reviewerId ?? null,
      reviewed_at: new Date().toISOString(),
    }]);
    created++;

    const sub = allTeachers.find(t => t.id === teacherId);
    const headEmails = await findGradeHeadEmails(gradeLevelId);
    await notifyParties({
      to: [sub?.email, ...headEmails].filter(Boolean) as string[],
      subject: `[จัดสอนแทน] ${DAY_OF_WEEK_LABELS[dow]} คาบ ${period.time_slot?.slot_label ?? ""}`,
      html: `<p>คุณได้รับมอบหมายให้สอนแทนในวัน${DAY_OF_WEEK_LABELS[dow]} คาบ ${period.time_slot?.slot_label ?? ""} ห้อง ${period.classroom?.room_name ?? period.classroom?.room_number ?? ""} เนื่องจากครูผู้สอนลา/ไปราชการ</p>`,
    });
  }

  return { created, unassigned };
}