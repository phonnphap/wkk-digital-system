// app/attendance/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Save } from "lucide-react";

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
};

type AttendanceStatus = "present" | "absent" | "leave" | "late";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeCls: string }[] = [
  { value: "present", label: "มา", activeCls: "bg-emerald-600 text-white" },
  { value: "late", label: "สาย", activeCls: "bg-amber-500 text-white" },
  { value: "leave", label: "ลา", activeCls: "bg-sky-500 text-white" },
  { value: "absent", label: "ขาด", activeCls: "bg-rose-500 text-white" },
];

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(getTodayISO());
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

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
        .select("id, seat_number, prefix, first_name, last_name, nick_name")
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

    const { error } = await supabase
      .from("attendance_records")
      .upsert(rows, { onConflict: "student_id,attendance_date" });

    setSaving(false);
    if (error) {
      alert("บันทึกไม่สำเร็จ: " + error.message);
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
    <div className="mx-auto max-w-3xl px-6 py-6 lg:px-8">
      {/* แถบนำทางด้านบน */}
      <div className="flex items-center justify-between">
        <Link href={HOMEROOM_PATH} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" /> ครูประจำชั้น
        </Link>
        <Link href={DASHBOARD_PATH} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <Home className="h-4 w-4" /> กลับหน้าแดชบอร์ด
        </Link>
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

      {/* ปุ่มตั้งค่าทั้งห้องอย่างเร็ว */}
      <div className="mt-3 flex flex-wrap gap-2">
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

      {/* สรุปตัวเลข */}
      {!loading && students.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {STATUS_OPTIONS.map((opt) => (
            <span key={opt.value} className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
              {opt.label} {summary[opt.value] ?? 0} คน
            </span>
          ))}
        </div>
      )}

      {/* รายชื่อนักเรียน */}
      <div className="mt-4 space-y-2">
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
        <div className="sticky bottom-4 mt-6 flex items-center justify-end gap-3">
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
  );
}