"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
// ★ ใช้ util กลางเพื่อคำนวณคำนำหน้าจากอายุ+เพศ
import { getDisplayPrefix } from "@/lib/student-prefix";

type Section = {
  id: string;
  subject: { id: string; subject_code: string; name_th: string } | null;
  timetable_entries: { id: string; day_of_week: number; slot_number: number; start_time: string; end_time: string }[];
};

type StudentInfo = {
  id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  student_no?: string;
  seat_number?: number; // ★ API จริงส่งฟิลด์นี้มา ไม่ใช่ student_no
  // ★ เพิ่ม: ต้องให้ /api/student-portal/timetable ส่งสองฟิลด์นี้มาด้วย
  // เพื่อให้คำนวณคำนำหน้าอัตโนมัติจากอายุปัจจุบันได้ ถ้า API ยังไม่ส่งมา
  // โค้ดจะ fallback ไปใช้ค่า prefix เดิมที่บันทึกไว้ในฐานข้อมูลแทน
  birth_date?: string | null;
  gender?: string | null;
};
type ClassroomInfo = { room_name?: string; grade_group?: string };
type TeacherInfo = { title?: string; first_name?: string; last_name?: string; full_name?: string };

const DAYS = [1, 2, 3, 4, 5];
const DAY_LABELS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];

const SUBJECT_COLORS = [
  { bg: "bg-red-100", border: "border-red-300", text: "text-red-800" },
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-800" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-800" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800" },
];

function formatTime(t: string) {
  return t ? t.slice(0, 5) : "";
}

function teacherDisplayName(t: TeacherInfo) {
  const fn = (t.first_name ?? "").trim();
  const ln = (t.last_name ?? "").trim();
  const namePart = fn || ln ? `${fn} ${ln}`.trim() : (t.full_name ?? "");
  return `${t.title ?? ""}${namePart}`.trim();
}

// ★ ของเดิม parse จาก grade_group โดยสมมติว่าเป็นรหัสสั้น เช่น "ป.1/7"
// แต่ข้อมูลจริงจาก API คือ
//   grade_group = คำเต็มอยู่แล้ว เช่น "ประถมศึกษา" / "มัธยมศึกษา" / "อนุบาล"
//   room_name   = รหัสห้อง เช่น "ป.1/1"  (มีทั้งชั้นปีและห้องอยู่ในนี้)
// เลยต้องดึงเลข "ปี/ห้อง" จาก room_name แล้วเอา grade_group (คำเต็ม) มาต่อแทน
// ผลลัพธ์ที่ต้องการ: "ชั้นประถมศึกษาปีที่ 1/1"
function formatClassLabel(classroom: ClassroomInfo | null) {
  if (!classroom) return "";
  const levelWord = (classroom.grade_group ?? "").trim(); // เช่น "ประถมศึกษา"
  const roomCode = (classroom.room_name ?? "").trim(); // เช่น "ป.1/1"
  if (!levelWord && !roomCode) return "";

  const match = roomCode.match(/(\d+)\s*\/\s*(\d+)/); // ดึง "ปี/ห้อง" ออกจากรหัสห้อง
  if (levelWord && match) {
    const [, year, room] = match;
    return `ชั้น${levelWord}ปีที่ ${year}/${room}`;
  }

  // เผื่อข้อมูลไม่ครบรูปแบบ ให้โชว์เท่าที่มีดีกว่าไม่โชว์อะไรเลย
  if (levelWord) return `ชั้น${levelWord}`;
  return roomCode;
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const { studentId } = useParams() as { studentId: string };
  const [sections, setSections] = useState<Section[]>([]);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [classroom, setClassroom] = useState<ClassroomInfo | null>(null);
  const [homeroomTeachers, setHomeroomTeachers] = useState<TeacherInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/student-portal/timetable?student_id=${studentId}`);
        const json = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(json.error ?? "โหลดตารางเรียนไม่สำเร็จ");
        setSections(json.sections ?? []);
        setStudent(json.student ?? null);
        setClassroom(json.classroom ?? null);
        setHomeroomTeachers(json.homeroom_teachers ?? []);
      } catch (e: any) {
        if (active) setError(e.message ?? "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [studentId]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/student-auth/logout", { method: "POST" });
    } finally {
      router.push("/login"); // TODO: เปลี่ยนเป็น path หน้าล็อกอินจริงของระบบ
    }
  }

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  sections.forEach((sec, i) => {
    if (sec.subject?.id) subjectColorMap[sec.subject.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
  });

  type SlotKey = { slot_number: number; start_time: string; end_time: string };
  const slotMap = new Map<string, SlotKey>();
  sections.forEach(sec => {
    sec.timetable_entries.forEach(e => {
      const key = `${e.slot_number}-${e.start_time}`;
      if (!slotMap.has(key)) slotMap.set(key, { slot_number: e.slot_number, start_time: e.start_time, end_time: e.end_time });
    });
  });
  const allSlots = Array.from(slotMap.values()).sort((a, b) => {
    if (a.slot_number !== b.slot_number) return a.slot_number - b.slot_number;
    return (a.start_time ?? "").localeCompare(b.start_time ?? "");
  });

  function findEntry(day: number, slot: SlotKey) {
    for (const sec of sections) {
      const entry = sec.timetable_entries.find(
        e => e.day_of_week === day && e.slot_number === slot.slot_number && e.start_time === slot.start_time
      );
      if (entry) return { section: sec, entry };
    }
    return null;
  }

  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay();

  // ★ ใช้คำนำหน้าที่คำนวณจากอายุ+เพศ แทนค่า prefix ดิบจากฐานข้อมูล
  const displayPrefix = student ? getDisplayPrefix(student.gender, student.birth_date, student.prefix) : "";
  const studentFullName = student ? `${displayPrefix}${student.first_name} ${student.last_name}`.trim() : "";
  const classLabel = formatClassLabel(classroom);
  // ★ เลขที่: API ส่งมาเป็น seat_number ไม่ใช่ student_no — เผื่อไว้ทั้งสองแบบ
  const seatNo = student?.seat_number ?? (student?.student_no ? Number(student.student_no) : undefined);

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-white to-sky-50 font-['TH_Sarabun_New',_sans-serif] pb-14">
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 px-5 pt-6 pb-8">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-10 -left-6 w-32 h-32 bg-white/10 rounded-full pointer-events-none" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/school-logo.png"
              alt="ตราโรงเรียนวัดเขียนเขต"
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/90 object-contain p-1 shadow-md shrink-0"
            />
            <div className="min-w-0">
              <p className="text-white/80 text-ml font-bold">โรงเรียนวัดเขียนเขต</p>
              {loading ? (
                <div className="h-7 w-48 bg-white/20 rounded-lg mt-1 animate-pulse" />
              ) : (
                <>
                  <h1 className="text-white font-black text-2xl sm:text-2xl leading-tight truncate drop-shadow-sm">
                    ยินดีต้อนรับ {studentFullName || "นักเรียน"} 👋
                  </h1>
                  {/* ★ ปรับขนาดตัวอักษรของบรรทัดชั้นเรียน/เลขที่ ให้ใหญ่ขึ้น (text-lg sm:text-2xl font-black)
                      ให้สอดคล้องกับสไตล์ของหน้ารายวิชา และแก้ให้ "เลขที่" ขึ้นจริง โดยอ้างอิง seat_number */}
                  {(classLabel || seatNo != null) && (
                    <p className="text-white text-m sm:text-xl font-black mt-1.5">
                      {classLabel}
                      {seatNo != null && `  เลขที่ ${seatNo}`}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="shrink-0 px-4 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-black text-m transition disabled:opacity-50"
          >
            {loggingOut ? "กำลังออก..." : "🚪 ออกจากระบบ"}
          </button>
        </div>

        {!loading && homeroomTeachers.length > 0 && (
          <div className="relative mt-3 bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-3">
            <p className="text-white text-m sm:text-xl font-black mt-0.5">ครูประจำชั้น  {homeroomTeachers.map(teacherDisplayName).filter(Boolean).join("  และ  ")}
            </p>
          </div>
        )}
      </div>

      <div className="px-3 sm:px-4 pt-4 max-w-5xl mx-auto space-y-3">
        {!loading && !error && allSlots.length > 0 && (
          <div className="bg-fuchsia-100 border-2 border-fuchsia-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <span className="text-xl">👆</span>
            <p className="text-fuchsia-700 text-sm font-bold">
              แตะที่วิชาในตารางเพื่อดูงานที่มอบหมาย คะแนน และการเช็คชื่อของวิชานั้น
            </p>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-10 text-center animate-pulse">
            <p className="text-slate-400 font-bold text-base">กำลังโหลดตารางเรียน...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl shadow-md border border-rose-100 p-8 text-center">
            <p className="text-4xl mb-2">😵</p>
            <p className="text-rose-600 font-black text-base">{error}</p>
            <button
              onClick={() => location.reload()}
              className="mt-4 px-5 py-2.5 rounded-2xl bg-rose-50 text-rose-600 font-black text-sm hover:bg-rose-100 transition"
            >
              🔄 ลองใหม่อีกครั้ง
            </button>
          </div>
        ) : allSlots.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-10 text-center">
            <p className="text-5xl mb-3">🗓️</p>
            <p className="text-slate-500 font-bold text-base">ยังไม่มีวิชาที่เปิดให้เข้าดู</p>
            <p className="text-slate-400 font-bold text-sm mt-1">รอครูผู้สอนเปิดให้เข้าใช้งานวิชานี้</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse w-full" style={{ minWidth: "640px" }}>
                <thead>
                  <tr>
                    <th className="px-2 py-3 bg-slate-100 border-b-2 border-r-2 border-slate-200 text-slate-500 font-black text-sm uppercase text-center sticky left-0 z-10 w-20">
                      คาบ
                    </th>
                    {DAYS.map(day => (
                      <th
                        key={day}
                        className={`px-2 py-3 border-b-2 border-r border-slate-200 text-center font-black text-base ${
                          day === todayDow ? "bg-fuchsia-100 text-fuchsia-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {DAY_LABELS[day - 1]}
                        {day === todayDow && <div className="text-xs font-black text-fuchsia-500">วันนี้</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSlots.map((slot, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-1 py-2 border-r-2 border-slate-200 sticky left-0 z-10 bg-slate-100 text-center">
                        <p className="text-sm font-black text-slate-600">{formatTime(slot.start_time)}</p>
                        <p className="text-xs text-slate-400">{formatTime(slot.end_time)}</p>
                      </td>
                      {DAYS.map(day => {
                        const found = findEntry(day, slot);
                        if (!found) {
                          return <td key={day} className="p-1 border-r border-slate-100">
                            <div className="rounded-xl border-2 border-dashed border-slate-100" style={{ minHeight: "68px" }} />
                          </td>;
                        }
                        const colors = subjectColorMap[found.section.subject?.id ?? ""] ?? SUBJECT_COLORS[0];
                        return (
                          <td key={day} className="p-1 border-r border-slate-100 align-top">
                            <button
                              onClick={() => router.push(`/student-portal/${studentId}/subject/${found.section.id}`)}
                              className={`w-full h-full rounded-xl border-2 px-2 py-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${colors.bg} ${colors.border} ${colors.text}`}
                              style={{ minHeight: "68px" }}
                            >
                              <p className="font-black text-sm leading-tight line-clamp-2">
                                {found.section.subject?.name_th ?? "-"}
                              </p>
                              <p className="text-xs font-bold opacity-80 mt-0.5">
                                {found.section.subject?.subject_code}
                              </p>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}