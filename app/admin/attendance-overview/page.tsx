// app/admin/attendance-overview/page.tsx
//
// ⚠️ สมมติฐานเรื่องฐานข้อมูล (โปรดตรวจสอบ/ปรับให้ตรงกับสคีมาจริงของคุณ):
//   - ตาราง "classrooms": classroom_id, room_name (ระดับชั้นแยกจาก room_name ด้วย "/" เช่น "ป.1/2" -> "ป.1")
//   - ตาราง "students": id, classroom_id, gender
//   - ตาราง "attendance_records": student_id, classroom_id, attendance_date, status
//   - role admin/director/deputy_director มีสิทธิ์ SELECT ทุกแถวในตารางเหล่านี้ผ่าน RLS policy
//     (ถ้ายังไม่มี ต้องเพิ่ม policy ที่อนุญาตให้ role เหล่านี้เห็นข้อมูลทุกห้อง ไม่ใช่แค่ห้องตัวเอง)
//
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home, ArrowLeft, Calendar, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Users, BarChart3, Loader2,
} from "lucide-react";

const supabase = createClient();

// ★ แก้ path เหล่านี้ให้ตรงกับระบบจริง
const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

// ★ role ที่ถือว่าเป็นผู้ดูแลระบบ — ต้องตรงกับ homeroom hub
const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);

type AttendanceStatus = "present" | "absent" | "leave" | "late";

const STATUS_META: { value: AttendanceStatus; label: string; color: string; text: string; bg: string }[] = [
  { value: "present", label: "มา", color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
  { value: "late", label: "สาย", color: "bg-amber-400", text: "text-amber-600", bg: "bg-amber-50" },
  { value: "leave", label: "ลา", color: "bg-sky-400", text: "text-sky-600", bg: "bg-sky-50" },
  { value: "absent", label: "ขาด", color: "bg-rose-500", text: "text-rose-600", bg: "bg-rose-50" },
];

/* ------------------------------------------------------------------ */
/* Thai date helpers                                                    */
/* ------------------------------------------------------------------ */

const THAI_WEEKDAYS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toBuddhistYear(gregorianYear: number) {
  return gregorianYear + 543;
}
function formatThaiDateFull(iso: string) {
  const dt = parseISODateLocal(iso);
  const weekday = THAI_WEEKDAYS_FULL[dt.getDay()];
  const day = dt.getDate();
  const month = THAI_MONTHS_FULL[dt.getMonth()];
  const year = toBuddhistYear(dt.getFullYear());
  return `วัน${weekday}ที่ ${day} ${month} ${year}`;
}
function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysISO(iso: string, delta: number) {
  const dt = parseISODateLocal(iso);
  dt.setDate(dt.getDate() + delta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ★ ดึง "ระดับชั้น" จากชื่อห้อง เช่น "ป.1/2" -> "ป.1", "ม.3/4" -> "ม.3"
//    ถ้าตาราง classrooms มีคอลัมน์ grade_level แยกอยู่แล้ว ให้ลบฟังก์ชันนี้และดึงตรง ๆ จาก query แทน
function extractGradeLevel(roomName: string): string {
  const idx = roomName.indexOf("/");
  return idx === -1 ? roomName : roomName.slice(0, idx);
}

// เรียงระดับชั้นแบบ natural sort (ป.1, ป.2, ..., ป.10 ไม่ใช่ ป.1, ป.10, ป.2)
function gradeSort(a: string, b: string) {
  return a.localeCompare(b, "th", { numeric: true });
}

/* ------------------------------------------------------------------ */

type ClassroomRow = { classroom_id: string; room_name: string };
type StudentRow = { id: string; classroom_id: string; gender: string | null };
type AttendanceRecordRow = { student_id: string; classroom_id: string; status: AttendanceStatus };

type ClassStat = {
  classroom_id: string;
  room_name: string;
  grade: string;
  total: number; // จำนวนเต็ม นร. ในห้อง
  present: number;
  late: number;
  leave: number;
  absent: number;
  notRecorded: number;
};

type GradeGroup = {
  grade: string;
  classes: ClassStat[];
  totals: Omit<ClassStat, "classroom_id" | "room_name" | "grade">;
};

function emptyTotals() {
  return { total: 0, present: 0, late: 0, leave: 0, absent: 0, notRecorded: 0 };
}
function sumInto(target: ReturnType<typeof emptyTotals>, src: ReturnType<typeof emptyTotals>) {
  target.total += src.total;
  target.present += src.present;
  target.late += src.late;
  target.leave += src.leave;
  target.absent += src.absent;
  target.notRecorded += src.notRecorded;
}

export default function AttendanceOverviewPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [date, setDate] = useState(getTodayISO());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [gradeGroups, setGradeGroups] = useState<GradeGroup[]>([]);
  const [grandTotals, setGrandTotals] = useState(emptyTotals());
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const [genderTotals, setGenderTotals] = useState<Record<"male" | "female" | "unknown", Record<AttendanceStatus, number>>>({
    male: { present: 0, late: 0, leave: 0, absent: 0 },
    female: { present: 0, late: 0, leave: 0, absent: 0 },
    unknown: { present: 0, late: 0, leave: 0, absent: 0 },
  });

  const dateInputRef = useRef<HTMLInputElement>(null);

  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof (el as unknown as { showPicker?: () => void }).showPicker === "function") {
      (el as unknown as { showPicker: () => void }).showPicker();
    } else {
      el.focus();
      el.click();
    }
  }

  // ตรวจสิทธิ์ผู้ดูแลระบบก่อนแสดงหน้า
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (profile?.role && ADMIN_ROLES.has(profile.role)) {
        setAllowed(true);
      } else {
        router.push(HOMEROOM_PATH);
      }
      setCheckingAuth(false);
    })();
  }, [router]);

  // โหลดข้อมูลสรุปของวันที่เลือก
  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    setErrorMsg("");

    (async () => {
      const [classroomsRes, studentsRes, attendanceRes] = await Promise.all([
        supabase.from("classrooms").select("classroom_id, room_name").order("room_name"),
        supabase.from("students").select("id, classroom_id, gender"),
        supabase.from("attendance_records").select("student_id, classroom_id, status").eq("attendance_date", date),
      ]);

      if (classroomsRes.error || studentsRes.error || attendanceRes.error) {
        console.error(classroomsRes.error || studentsRes.error || attendanceRes.error);
        setErrorMsg(
          "โหลดข้อมูลไม่สำเร็จ — อาจเป็นเพราะชื่อตาราง/คอลัมน์ไม่ตรงกับระบบจริง หรือ RLS policy ยังไม่อนุญาตให้ role นี้เห็นข้อมูลทุกห้อง กรุณาตรวจสอบคอมเมนต์ด้านบนของไฟล์นี้"
        );
        setLoading(false);
        return;
      }

      const classrooms = (classroomsRes.data ?? []) as ClassroomRow[];
      const students = (studentsRes.data ?? []) as StudentRow[];
      const records = (attendanceRes.data ?? []) as AttendanceRecordRow[];

      // สถานะของนักเรียนแต่ละคนในวันที่เลือก
      const statusByStudent = new Map<string, AttendanceStatus>();
      records.forEach((r) => statusByStudent.set(r.student_id, r.status));

      // เริ่ม stat ต่อห้องจากรายชื่อห้องทั้งหมด (ห้องไหนยังไม่มีคนเช็คชื่อก็ยังอยู่ในตาราง)
      const statByClassroom = new Map<string, ClassStat>();
      classrooms.forEach((c) => {
        statByClassroom.set(c.classroom_id, {
          classroom_id: c.classroom_id,
          room_name: c.room_name,
          grade: extractGradeLevel(c.room_name),
          ...emptyTotals(),
        });
      });

      // สรุปแยกชาย/หญิง (นับเฉพาะคนที่มีบันทึกเช็คชื่อวันนี้แล้ว)
      const gTotals: Record<"male" | "female" | "unknown", Record<AttendanceStatus, number>> = {
        male: { present: 0, late: 0, leave: 0, absent: 0 },
        female: { present: 0, late: 0, leave: 0, absent: 0 },
        unknown: { present: 0, late: 0, leave: 0, absent: 0 },
      };

      students.forEach((s) => {
        const stat = statByClassroom.get(s.classroom_id);
        if (!stat) return; // นักเรียนอยู่ในห้องที่ไม่พบ (ข้อมูลไม่สอดคล้อง) — ข้าม
        stat.total += 1;

        const status = statusByStudent.get(s.id);
        if (!status) {
          stat.notRecorded += 1;
        } else {
          stat[status] += 1;
          const key = s.gender === "male" || s.gender === "female" ? s.gender : "unknown";
          gTotals[key][status] += 1;
        }
      });

      // จัดกลุ่มตามระดับชั้น + คำนวณ subtotal
      const groupMap = new Map<string, GradeGroup>();
      statByClassroom.forEach((stat) => {
        let group = groupMap.get(stat.grade);
        if (!group) {
          group = { grade: stat.grade, classes: [], totals: emptyTotals() };
          groupMap.set(stat.grade, group);
        }
        group.classes.push(stat);
        sumInto(group.totals, stat);
      });

      const groups = Array.from(groupMap.values()).sort((a, b) => gradeSort(a.grade, b.grade));
      groups.forEach((g) => g.classes.sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true })));

      const grand = emptyTotals();
      groups.forEach((g) => sumInto(grand, g.totals));

      setGradeGroups(groups);
      setGrandTotals(grand);
      setGenderTotals(gTotals);
      setLoading(false);
    })();
  }, [allowed, date]);

  const attendedRate = useMemo(() => {
    if (grandTotals.total === 0) return 0;
    return Math.round(((grandTotals.present + grandTotals.late) / grandTotals.total) * 1000) / 10;
  }, [grandTotals]);

  function toggleGrade(grade: string) {
    setCollapsedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!allowed) return null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-50 via-white to-sky-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-purple-600 hover:shadow-md"
          >
            <Home className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => router.push(HOMEROOM_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-purple-600 hover:shadow-md"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* หัวข้อ + ตัวเลือกวันที่ */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-purple-500 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> สำหรับผู้ดูแลระบบ
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
              สถิติการมาเรียนทั้งโรงเรียน
            </h1>
            <p className="mt-1 text-sm text-slate-500">ภาพรวมการมา/สาย/ลา/ขาด แยกรายห้องและรายระดับชั้น</p>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => setDate((d) => addDaysISO(d, -1))}
              className="flex h-[42px] w-10 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-purple-300"
              title="วันก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
              <button
                type="button"
                onClick={openDatePicker}
                className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-md active:translate-y-0 active:scale-[0.98]"
              >
                <Calendar className="h-4 w-4 text-purple-500" />
                {formatThaiDateFull(date)}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
            </div>

            <button
              onClick={() => setDate((d) => addDaysISO(d, 1))}
              className="flex h-[42px] w-10 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-purple-300"
              title="วันถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {date !== getTodayISO() && (
              <button
                onClick={() => setDate(getTodayISO())}
                className="h-[42px] rounded-2xl border-2 border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                กลับไปวันนี้
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            ⚠️ {errorMsg}
          </div>
        )}

        {!errorMsg && (
          <>
            {/* การ์ดสรุปรวมทั้งโรงเรียน */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="นักเรียนทั้งหมด" value={grandTotals.total} icon={<Users className="h-4 w-4" />} tone="slate" />
              <SummaryCard label="มา" value={grandTotals.present} tone="emerald" />
              <SummaryCard label="สาย" value={grandTotals.late} tone="amber" />
              <SummaryCard label="ลา" value={grandTotals.leave} tone="sky" />
              <SummaryCard label="ขาด" value={grandTotals.absent} tone="rose" />
              <SummaryCard label="ยังไม่บันทึก" value={grandTotals.notRecorded} tone="gray" />
            </div>
            <div className="mt-3 rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-100">
              <p className="text-sm font-bold text-slate-600">
                อัตรามาเรียนรวม (มา+สาย) วันนี้: <span className="text-purple-600">{attendedRate}%</span>
              </p>
            </div>

            {/* สรุปแยกชาย/หญิง */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(["male", "female"] as const).map((g) => {
                const data = genderTotals[g];
                const total = Object.values(data).reduce((a, b) => a + b, 0);
                return (
                  <div key={g} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                    <p className="mb-3 text-sm font-black text-slate-700">
                      {g === "male" ? "👦 นักเรียนชาย" : "👧 นักเรียนหญิง"} <span className="font-normal text-slate-400">({total} คน ที่เช็คชื่อแล้ว)</span>
                    </p>
                    <div className="space-y-2">
                      {STATUS_META.map((m) => {
                        const pct = total > 0 ? Math.round((data[m.value] / total) * 100) : 0;
                        return (
                          <div key={m.value}>
                            <div className="mb-1 flex justify-between text-xs">
                              <span className={`font-semibold ${m.text}`}>{m.label}</span>
                              <span className="text-slate-500">{data[m.value]} คน ({pct}%)</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full ${m.color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ตารางแยกรายระดับชั้น / รายห้อง */}
            <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              {loading ? (
                <p className="py-16 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
              ) : gradeGroups.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">ไม่พบข้อมูลห้องเรียน</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-xs text-slate-500">
                        <th className="px-4 py-3 text-left font-semibold">ระดับชั้น / ห้อง</th>
                        <th className="px-3 py-3 text-center font-semibold">นร. ทั้งหมด</th>
                        <th className="px-3 py-3 text-center font-semibold text-emerald-600">มา</th>
                        <th className="px-3 py-3 text-center font-semibold text-amber-600">สาย</th>
                        <th className="px-3 py-3 text-center font-semibold text-sky-600">ลา</th>
                        <th className="px-3 py-3 text-center font-semibold text-rose-600">ขาด</th>
                        <th className="px-3 py-3 text-center font-semibold text-slate-400">ยังไม่บันทึก</th>
                        <th className="px-3 py-3 text-center font-semibold">% มาเรียน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeGroups.map((g) => {
                        const collapsed = collapsedGrades.has(g.grade);
                        const rate = g.totals.total
                          ? Math.round(((g.totals.present + g.totals.late) / g.totals.total) * 1000) / 10
                          : 0;
                        return (
                          <>
                            {/* แถวสรุประดับชั้น — คลิกเพื่อย่อ/ขยาย */}
                            <tr
                              key={`grade-${g.grade}`}
                              onClick={() => toggleGrade(g.grade)}
                              className="cursor-pointer border-t border-slate-100 bg-purple-50/60 transition-colors hover:bg-purple-50"
                            >
                              <td className="px-4 py-2.5 font-bold text-purple-700">
                                <span className="inline-flex items-center gap-1.5">
                                  {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                                  ระดับชั้น {g.grade}
                                  <span className="font-normal text-purple-400">({g.classes.length} ห้อง)</span>
                                </span>
                              </td>
                              <TotalsCells totals={g.totals} bold />
                              <td className="px-3 py-2.5 text-center font-bold text-purple-700">{rate}%</td>
                            </tr>

                            {/* แถวรายห้องในระดับชั้นนี้ */}
                            {!collapsed &&
                              g.classes.map((c) => {
                                const classRate = c.total ? Math.round(((c.present + c.late) / c.total) * 1000) / 10 : 0;
                                return (
                                  <tr key={c.classroom_id} className="border-t border-slate-50 hover:bg-slate-50/60">
                                    <td className="px-4 py-2 pl-10 font-semibold text-slate-700">ห้อง {c.room_name}</td>
                                    <TotalsCells totals={c} />
                                    <td className="px-3 py-2 text-center text-slate-500">{classRate}%</td>
                                  </tr>
                                );
                              })}
                          </>
                        );
                      })}

                      {/* แถวรวมทั้งโรงเรียน */}
                      <tr className="border-t-2 border-slate-200 bg-slate-800 text-white">
                        <td className="px-4 py-3 font-black">รวมทั้งโรงเรียน</td>
                        <TotalsCells totals={grandTotals} dark />
                        <td className="px-3 py-3 text-center font-black">{attendedRate}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-4 text-[11px] text-slate-400">
              &quot;ยังไม่บันทึก&quot; หมายถึงนักเรียนที่ยังไม่มีการเช็คชื่อในวันนั้น (ครูประจำชั้นยังไม่ได้กดบันทึก) ไม่ได้แปลว่าขาดเรียน
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function TotalsCells({
  totals,
  bold,
  dark,
}: {
  totals: { total: number; present: number; late: number; leave: number; absent: number; notRecorded: number };
  bold?: boolean;
  dark?: boolean;
}) {
  const base = bold ? "font-bold" : dark ? "font-black" : "font-semibold";
  return (
    <>
      <td className={`px-3 py-2.5 text-center text-slate-700 ${dark ? "text-white" : ""} ${base}`}>{totals.total || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-emerald-300" : "text-emerald-600"} ${base}`}>{totals.present || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-amber-300" : "text-amber-600"} ${base}`}>{totals.late || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-sky-300" : "text-sky-600"} ${base}`}>{totals.leave || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-rose-300" : "text-rose-600"} ${base}`}>{totals.absent || "-"}</td>
      <td className={`px-3 py-2.5 text-center ${dark ? "text-slate-300" : "text-slate-400"} ${base}`}>{totals.notRecorded || "-"}</td>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone: "slate" | "emerald" | "amber" | "sky" | "rose" | "gray";
}) {
  const toneCls: Record<typeof tone, string> = {
    slate: "text-slate-700 bg-slate-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    sky: "text-sky-600 bg-sky-50",
    rose: "text-rose-600 bg-rose-50",
    gray: "text-slate-400 bg-slate-100",
  };
  return (
    <div className={`rounded-2xl p-4 shadow-sm ring-1 ring-slate-100 ${toneCls[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold opacity-80">
        {icon} {label}
      </div>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}