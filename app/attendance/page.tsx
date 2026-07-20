// app/attendance/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save } from "lucide-react";

const supabase = createClient();

// ★ แก้ path เหล่านี้ให้ตรงกับระบบจริง
const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

type Classroom = {
  classroom_id: string;
  room_name: string;
};

type Student = {
  id: string;
  seat_number: number | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  gender: string | null; // "male" | "female" | null
};

type AttendanceStatus = "present" | "absent" | "leave" | "late";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeCls: string; barColor: string; textColor: string }[] = [
  { value: "present", label: "มา",   activeCls: "bg-emerald-600 text-white", barColor: "bg-emerald-500", textColor: "text-emerald-600" },
  { value: "late",    label: "สาย",  activeCls: "bg-amber-500 text-white",   barColor: "bg-amber-400",   textColor: "text-amber-600" },
  { value: "leave",   label: "ลา",   activeCls: "bg-sky-500 text-white",     barColor: "bg-sky-400",     textColor: "text-sky-600" },
  { value: "absent",  label: "ขาด",  activeCls: "bg-rose-500 text-white",    barColor: "bg-rose-500",    textColor: "text-rose-600" },
];

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

// คำนวณวันแรกของเดือนถัดไป (สำหรับ query แบบ >= เดือนนี้ < เดือนหน้า)
function getNextMonthStartISO(dateISO: string) {
  const [y, m] = dateISO.slice(0, 7).split("-").map(Number);
  const next = new Date(y, m, 1); // m คือเดือนถัดไปแบบ 0-index อยู่แล้ว เพราะ m จาก slice เป็น 1-based
  return next.toISOString().slice(0, 10);
}
function getMonthStartISO(dateISO: string) {
  return dateISO.slice(0, 7) + "-01";
}

type MonthStats = Record<AttendanceStatus, number> & { totalRecords: number; schoolDays: number };

// แถบเปอร์เซ็นต์แบบง่าย ไม่พึ่งพา library ภายนอก
function StatBar({ label, count, total, colorCls, textCls }: { label: string; count: number; total: number; colorCls: string; textCls: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={`font-semibold ${textCls}`}>{label}</span>
        <span className="text-slate-500 font-medium">{count} คน ({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${colorCls} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// กราฟแท่งสรุปมา/ขาด/ลา/สาย แยกชาย-หญิง + รวมทั้งหมด
function GenderAttendanceChart({ students, statusMap }: { students: Student[]; statusMap: Record<string, AttendanceStatus> }) {
  const groups: { key: "male" | "female" | "unknown"; label: string; icon: string }[] = [
    { key: "male", label: "ชาย", icon: "👦" },
    { key: "female", label: "หญิง", icon: "👧" },
  ];

  const counts = useMemo(() => {
    const base: Record<string, Record<AttendanceStatus, number>> = {
      male: { present: 0, late: 0, leave: 0, absent: 0 },
      female: { present: 0, late: 0, leave: 0, absent: 0 },
      unknown: { present: 0, late: 0, leave: 0, absent: 0 },
    };
    students.forEach((s) => {
      const g = s.gender === "male" || s.gender === "female" ? s.gender : "unknown";
      const st = statusMap[s.id] ?? "present";
      base[g][st] += 1;
    });
    return base;
  }, [students, statusMap]);

  const totalByStatus: Record<AttendanceStatus, number> = {
    present: counts.male.present + counts.female.present + counts.unknown.present,
    late: counts.male.late + counts.female.late + counts.unknown.late,
    leave: counts.male.leave + counts.female.leave + counts.unknown.leave,
    absent: counts.male.absent + counts.female.absent + counts.unknown.absent,
  };
  const grandTotal = students.length;

  const maxForBars = Math.max(1, students.length);

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const groupTotal = Object.values(counts[g.key]).reduce((a, b) => a + b, 0);
        return (
          <div key={g.key}>
            <p className="text-xs font-black text-slate-600 mb-1.5">{g.icon} {g.label} <span className="text-slate-400 font-normal">({groupTotal} คน)</span></p>
            <div className="flex h-5 w-full overflow-hidden rounded-lg bg-slate-100">
              {STATUS_OPTIONS.map((opt) => {
                const c = counts[g.key][opt.value];
                const widthPct = maxForBars > 0 ? (c / maxForBars) * 100 : 0;
                return c > 0 ? (
                  <div key={opt.value} className={`${opt.barColor} h-full flex items-center justify-center transition-all`} style={{ width: `${widthPct}%` }} title={`${opt.label}: ${c}`}>
                    {widthPct > 8 && <span className="text-[10px] font-bold text-white">{c}</span>}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        );
      })}

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-black text-slate-700 mb-2">📊 รวมทั้งหมด ({grandTotal} คน)</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${opt.barColor}`} />
              <span className={`text-xs font-bold ${opt.textColor}`}>{opt.label}</span>
              <span className="ml-auto text-xs font-black text-slate-700">{totalByStatus[opt.value]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(getTodayISO());
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);

  // โหลดห้องที่ครูดูแล
  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data }: { data: Classroom[] | null }) => {
      setClassrooms(data ?? []);
      if (data?.length) setSelectedClass(data[0]);
    });
  }, []);

  // โหลดนักเรียน + สถานะเช็คชื่อของวันที่เลือก
  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    const cid = selectedClass.classroom_id;

    Promise.all([
      supabase
        .from("students")
        .select("id, seat_number, prefix, first_name, last_name, nick_name, gender")
        .eq("classroom_id", cid)
        .order("seat_number"),
      supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("classroom_id", cid)
        .eq("attendance_date", date),
    ]).then(([studentsRes, attendanceRes]) => {
      const studentList: Student[] = studentsRes.data ?? [];
      setStudents(studentList);

      const map: Record<string, AttendanceStatus> = {};
      // ค่าเริ่มต้น = มา สำหรับทุกคนที่ยังไม่มีบันทึก
      studentList.forEach((s) => { map[s.id] = "present"; });
      (attendanceRes.data ?? []).forEach((r: { student_id: string; status: AttendanceStatus }) => {
        map[r.student_id] = r.status;
      });
      setStatusMap(map);
      setLoading(false);
    });
  }, [selectedClass, date]);

  // โหลดสถิติการมาเรียนรายเดือนของห้องนี้ (ตามเดือนของวันที่เลือก)
  useEffect(() => {
    if (!selectedClass) { setMonthStats(null); return; }
    const cid = selectedClass.classroom_id;
    const start = getMonthStartISO(date);
    const end = getNextMonthStartISO(date);

    supabase
      .from("attendance_records")
      .select("status, attendance_date")
      .eq("classroom_id", cid)
      .gte("attendance_date", start)
      .lt("attendance_date", end)
      .then(({ data }: { data: { status: AttendanceStatus; attendance_date: string }[] | null }) => {
        const rows = data ?? [];
        const counts: MonthStats = { present: 0, late: 0, leave: 0, absent: 0, totalRecords: 0, schoolDays: 0 };
        const daySet = new Set<string>();
        rows.forEach((r) => {
          counts[r.status] = (counts[r.status] ?? 0) + 1;
          counts.totalRecords += 1;
          daySet.add(r.attendance_date);
        });
        counts.schoolDays = daySet.size;
        setMonthStats(counts);
      });
  }, [selectedClass, date]);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStatusMap((prev) => ({ ...prev, [studentId]: status }));
  }

  function setAllStatus(status: AttendanceStatus) {
    const map: Record<string, AttendanceStatus> = {};
    students.forEach((s) => { map[s.id] = status; });
    setStatusMap(map);
  }

  async function handleSave() {
    if (!selectedClass || students.length === 0) return;
    setSaving(true);
    setSavedMsg("");

    const rows = students.map((s) => ({
      student_id: s.id,
      classroom_id: selectedClass.classroom_id,
      attendance_date: date,
      status: statusMap[s.id] ?? "present",
    }));

    // ✅ เพิ่ม .select() เพื่อตรวจว่าบันทึกจริงกี่แถว
    // หมายเหตุ: หากขึ้น error ประมาณ "no unique or exclusion constraint matching the ON CONFLICT specification"
    // แปลว่าตาราง attendance_records ยังไม่มี UNIQUE constraint บน (student_id, attendance_date)
    // ให้รันคำสั่ง SQL นี้ในฐานข้อมูลก่อน:
    //   ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_student_date_unique UNIQUE (student_id, attendance_date);
    const { data: savedRows, error } = await supabase
      .from("attendance_records")
      .upsert(rows, { onConflict: "student_id,attendance_date" })
      .select();

    setSaving(false);

    if (error) {
      console.error("attendance save error:", error);
      alert("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }

    if (!savedRows || savedRows.length < rows.length) {
      alert(
        `บันทึกได้เพียง ${savedRows?.length ?? 0}/${rows.length} คน — กรุณาตรวจสอบสิทธิ์ (RLS policy) ของตาราง attendance_records ว่าอนุญาตให้ครูประจำชั้นเขียนข้อมูลของนักเรียนทุกคนในห้องหรือไม่`
      );
      return;
    }

    setSavedMsg("บันทึกเรียบร้อยแล้ว");
    setTimeout(() => setSavedMsg(""), 2500);
  }

  const summary = students.reduce(
    (acc, s) => {
      const st = statusMap[s.id] ?? "present";
      acc[st] = (acc[st] ?? 0) + 1;
      return acc;
    },
    {} as Record<AttendanceStatus, number>
  );

  return (
    // ✅ ขยายให้เต็มหน้าจอ (ตัด mx-auto max-w-3xl ออก)
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      {/* แถบนำทางด้านบน: กลับแดชบอร์ด + ย้อนกลับไปครูประจำชั้น (ชิดซ้ายทั้งคู่) */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push(DASHBOARD_PATH)}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg"
        >
          🏠
        </button>
        <button
          onClick={() => router.push(HOMEROOM_PATH)}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg"
        >
          ←
        </button>
      </div>

      <h1 className="mt-4 text-lg font-bold text-slate-800">บันทึกเช็คชื่อ</h1>
      <p className="mt-1 text-sm text-slate-500">บันทึกการมาเรียนของนักเรียนรายวัน</p>

      {/* เลือกห้อง + วันที่ */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {classrooms.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">ห้องเรียน</label>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={selectedClass?.classroom_id ?? ""}
              onChange={(e) => setSelectedClass(classrooms.find((c) => c.classroom_id === e.target.value) ?? null)}
            >
              {classrooms.map((c) => (
                <option key={c.classroom_id} value={c.classroom_id}>{c.room_name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
          <input
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {date !== getTodayISO() && (
          <button
            onClick={() => setDate(getTodayISO())}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            กลับไปวันนี้
          </button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* คอลัมน์ซ้าย: รายชื่อ + ปุ่มบันทึก (กินพื้นที่ 2 ส่วน) */}
        <div className="lg:col-span-2 space-y-3">
          {/* ปุ่มตั้งค่าทั้งห้องอย่างเร็ว */}
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-slate-400">ตั้งค่าทั้งห้อง:</span>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAllStatus(opt.value)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ทุกคน{opt.label}
              </button>
            ))}
          </div>

          {/* สรุปตัวเลขวันนี้ */}
          {!loading && students.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {STATUS_OPTIONS.map((opt) => (
                <span key={opt.value} className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
                  {opt.label} {summary[opt.value] ?? 0} คน
                </span>
              ))}
            </div>
          )}

          {/* รายชื่อนักเรียน */}
          <div className="space-y-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
            ) : students.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">ไม่พบนักเรียนในห้องนี้</p>
            ) : (
              students.map((s) => {
                const current = statusMap[s.id] ?? "present";
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                        {s.seat_number}
                      </span>
                      <p className="text-sm font-semibold text-slate-800">
                        {s.prefix ?? ""}{s.first_name} {s.last_name}
                        {s.nick_name && <span className="ml-1 font-normal text-slate-400">({s.nick_name})</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setStatus(s.id, opt.value)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                            current === opt.value ? opt.activeCls : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ปุ่มบันทึก */}
          {!loading && students.length > 0 && (
            <div className="sticky bottom-4 flex items-center justify-end gap-3">
              {savedMsg && <span className="text-sm font-semibold text-emerald-600">{savedMsg}</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "กำลังบันทึก..." : "บันทึกการเช็คชื่อ"}
              </button>
            </div>
          )}
        </div>

        {/* คอลัมน์ขวา: สถิติมาเรียน + กราฟสรุป ช/ญ */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-black text-slate-700 mb-3">📈 สถิติมาเรียนประจำเดือน</h3>
            {monthStats ? (
              monthStats.totalRecords === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">ยังไม่มีข้อมูลการเช็คชื่อในเดือนนี้</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    บันทึกแล้ว <span className="font-bold text-slate-600">{monthStats.schoolDays}</span> วัน ·
                    รวม <span className="font-bold text-slate-600">{monthStats.totalRecords}</span> รายการ
                  </p>
                  {STATUS_OPTIONS.map((opt) => (
                    <StatBar
                      key={opt.value}
                      label={opt.label}
                      count={monthStats[opt.value] ?? 0}
                      total={monthStats.totalRecords}
                      colorCls={opt.barColor}
                      textCls={opt.textColor}
                    />
                  ))}
                </div>
              )
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">กำลังโหลดสถิติ...</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-black text-slate-700 mb-3">👦👧 สรุปการมาเรียนวันนี้ แยกชาย/หญิง</h3>
            {!loading && students.length > 0 ? (
              <GenderAttendanceChart students={students} statusMap={statusMap} />
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">ไม่มีข้อมูลนักเรียน</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}