// app/admin/attendance-overview/page.tsx
//
// ⚠️ สมมติฐานเรื่องฐานข้อมูล (โปรดตรวจสอบ/ปรับให้ตรงกับสคีมาจริงของคุณ):
//   - มีตาราง "classrooms" ที่มีคอลัมน์ classroom_id (หรือ id), room_name, room_number
//   - มีตาราง "students" ที่มีคอลัมน์ classroom_id, gender
//   - มีตาราง "attendance_records" ที่มีคอลัมน์ classroom_id, student_id, attendance_date, status
//   - ผู้ใช้ role admin/director/deputy_director มีสิทธิ์ SELECT ทุกแถวในตารางเหล่านี้ผ่าน RLS policy
//     (ถ้ายังไม่มี ต้องเพิ่ม policy ที่อนุญาตให้ role เหล่านี้เห็นข้อมูลทุกห้อง ไม่ใช่แค่ห้องตัวเอง)
//
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

type AttendanceStatus = "present" | "absent" | "leave" | "late";
const STATUS_META: { value: AttendanceStatus; label: string; color: string; text: string }[] = [
  { value: "present", label: "มา",  color: "bg-emerald-500", text: "text-emerald-600" },
  { value: "late",    label: "สาย", color: "bg-amber-400",   text: "text-amber-600" },
  { value: "leave",   label: "ลา",  color: "bg-sky-400",     text: "text-sky-600" },
  { value: "absent",  label: "ขาด", color: "bg-rose-500",    text: "text-rose-600" },
];

type ClassroomRow = { classroom_id: string; room_name: string; room_number?: number };

function getTodayISO() { return new Date().toISOString().slice(0, 10); }

export default function AttendanceOverviewPage() {
  const router = useRouter();
  const [date, setDate] = useState(getTodayISO());
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [studentGender, setStudentGender] = useState<Record<string, string | null>>({}); // student_id -> gender
  const [studentClassroom, setStudentClassroom] = useState<Record<string, string>>({}); // student_id -> classroom_id
  const [records, setRecords] = useState<{ student_id: string; classroom_id: string; status: AttendanceStatus }[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    setErrorMsg("");

    (async () => {
      // ปรับตรงนี้หากชื่อตาราง/คอลัมน์จริงต่างจากที่สมมติไว้ด้านบน
      const [classroomsRes, studentsRes, attendanceRes] = await Promise.all([
        supabase.from("classrooms").select("classroom_id, room_name, room_number"),
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

      setClassrooms(classroomsRes.data ?? []);

      const genderMap: Record<string, string | null> = {};
      const clsMap: Record<string, string> = {};
      (studentsRes.data ?? []).forEach((s: any) => {
        genderMap[s.id] = s.gender ?? null;
        clsMap[s.id] = s.classroom_id;
      });
      setStudentGender(genderMap);
      setStudentClassroom(clsMap);
      setRecords((attendanceRes.data as any) ?? []);
      setLoading(false);
    })();
  }, [date]);

  const perClassroom = useMemo(() => {
    const map = new Map<string, Record<AttendanceStatus, number>>();
    classrooms.forEach(c => map.set(c.classroom_id, { present: 0, late: 0, leave: 0, absent: 0 }));
    records.forEach(r => {
      if (!map.has(r.classroom_id)) map.set(r.classroom_id, { present: 0, late: 0, leave: 0, absent: 0 });
      map.get(r.classroom_id)![r.status] += 1;
    });
    return map;
  }, [classrooms, records]);

  const schoolTotals = useMemo(() => {
    const totals: Record<AttendanceStatus, number> = { present: 0, late: 0, leave: 0, absent: 0 };
    const byGender: Record<"male" | "female" | "unknown", Record<AttendanceStatus, number>> = {
      male: { present: 0, late: 0, leave: 0, absent: 0 },
      female: { present: 0, late: 0, leave: 0, absent: 0 },
      unknown: { present: 0, late: 0, leave: 0, absent: 0 },
    };
    records.forEach(r => {
      totals[r.status] += 1;
      const g = studentGender[r.student_id];
      const key = g === "male" || g === "female" ? g : "unknown";
      byGender[key][r.status] += 1;
    });
    return { totals, byGender };
  }, [records, studentGender]);

  const grandTotal = records.length;

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push(DASHBOARD_PATH)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
        <button onClick={() => router.push(HOMEROOM_PATH)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">←</button>
      </div>

      <h1 className="mt-4 text-lg font-bold text-slate-800">สถิติการมาเรียนทั้งโรงเรียน</h1>
      <p className="mt-1 text-sm text-slate-500">ภาพรวมการมา/ขาด/ลา/สายของทุกห้องเรียน</p>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          ⚠️ {errorMsg}
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">กำลังโหลด...</p>
      ) : !errorMsg && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATUS_META.map(m => (
              <div key={m.value} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <div className={`text-3xl font-black ${m.text}`}>{schoolTotals.totals[m.value]}</div>
                <div className="text-xs font-bold text-slate-400 mt-1">{m.label} (ทั้งโรงเรียน)</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(["male", "female"] as const).map(g => {
              const data = schoolTotals.byGender[g];
              const total = Object.values(data).reduce((a, b) => a + b, 0);
              return (
                <div key={g} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-black text-slate-700 mb-3">{g === "male" ? "👦 นักเรียนชาย" : "👧 นักเรียนหญิง"} ({total} คน)</p>
                  <div className="space-y-2">
                    {STATUS_META.map(m => {
                      const pct = total > 0 ? Math.round((data[m.value] / total) * 100) : 0;
                      return (
                        <div key={m.value}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={`font-semibold ${m.text}`}>{m.label}</span>
                            <span className="text-slate-500">{data[m.value]} คน ({pct}%)</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
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

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-black text-slate-700">รายห้องเรียน</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-black text-slate-400">ห้อง</th>
                    {STATUS_META.map(m => (
                      <th key={m.value} className="text-center px-3 py-3 text-xs font-black text-slate-400">{m.label}</th>
                    ))}
                    <th className="text-center px-3 py-3 text-xs font-black text-slate-400">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {classrooms.map(c => {
                    const data = perClassroom.get(c.classroom_id) ?? { present: 0, late: 0, leave: 0, absent: 0 };
                    const total = Object.values(data).reduce((a, b) => a + b, 0);
                    return (
                      <tr key={c.classroom_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-bold text-slate-800">{c.room_name}</td>
                        {STATUS_META.map(m => (
                          <td key={m.value} className={`px-3 py-3 text-center font-black ${m.text}`}>{data[m.value]}</td>
                        ))}
                        <td className="px-3 py-3 text-center font-black text-slate-600">{total}</td>
                      </tr>
                    );
                  })}
                  {classrooms.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">ไม่พบข้อมูลห้องเรียน</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400 text-right">รวมบันทึกการเช็คชื่อทั้งหมด {grandTotal} รายการในวันที่เลือก</p>
        </>
      )}
    </div>
  );
}