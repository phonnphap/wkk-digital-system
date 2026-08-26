"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";

type Section = {
  id: string;
  subject: { id: string; subject_code: string; name_th: string } | null;
  timetable_entries: { id: string; day_of_week: number; slot_number: number; start_time: string; end_time: string }[];
};

const DAYS = [1, 2, 3, 4, 5];
const DAY_LABELS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const DAY_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ."];

const SUBJECT_COLORS = [
  { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700" },
];

function formatTime(t: string) {
  return t ? t.slice(0, 5) : "";
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const { studentId } = useParams() as { studentId: string };
  const [sections, setSections] = useState<Section[]>([]);
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
      router.push("/join/logged-out");
    }
  }

  // สีต่อวิชา (คงที่ตาม subject id)
  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  sections.forEach((sec, i) => {
    if (sec.subject?.id) subjectColorMap[sec.subject.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
  });

  // รวบรวมคาบเวลาที่ไม่ซ้ำกันทั้งหมด (เรียงตาม slot_number แล้วตามเวลาเริ่ม)
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

  // หา entry ที่ตรงกับ (day, slot)
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-white to-sky-50 font-['TH_Sarabun_New',_sans-serif] pb-14">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 px-5 pt-8 pb-10 rounded-b-[2.5rem] shadow-lg">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-10 -left-6 w-32 h-32 bg-white/10 rounded-full" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-white/70 text-xs font-bold">สวัสดี 👋</p>
            <h1 className="text-white font-black text-2xl mt-0.5">📚 ตารางเรียนของฉัน</h1>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-4 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-black text-xs transition disabled:opacity-50"
          >
            {loggingOut ? "กำลังออก..." : "🚪 ออกจากระบบ"}
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 -mt-5 max-w-5xl mx-auto space-y-4">
        {loading ? (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-10 text-center animate-pulse">
            <p className="text-slate-300 font-bold text-sm">กำลังโหลดตารางเรียน...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl shadow-md border border-rose-100 p-8 text-center">
            <p className="text-3xl mb-2">😵</p>
            <p className="text-rose-500 font-black text-sm">{error}</p>
            <button
              onClick={() => location.reload()}
              className="mt-4 px-5 py-2.5 rounded-2xl bg-rose-50 text-rose-600 font-black text-xs hover:bg-rose-100 transition"
            >
              🔄 ลองใหม่อีกครั้ง
            </button>
          </div>
        ) : allSlots.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-10 text-center">
            <p className="text-4xl mb-3">🗓️</p>
            <p className="text-slate-400 font-bold text-sm">ยังไม่มีวิชาที่เปิดให้เข้าดู</p>
            <p className="text-slate-300 font-bold text-xs mt-1">รอครูผู้สอนเปิดให้เข้าใช้งานวิชานี้</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse w-full" style={{ minWidth: "560px" }}>
                <thead>
                  <tr>
                    <th className="px-2 py-3 bg-slate-50 border-b-2 border-r-2 border-slate-200 text-slate-400 font-black text-[11px] uppercase text-center sticky left-0 z-10 w-16">
                      คาบ
                    </th>
                    {DAYS.map(day => (
                      <th
                        key={day}
                        className={`px-2 py-3 border-b-2 border-r border-slate-200 text-center font-black text-xs ${
                          day === todayDow ? "bg-fuchsia-50 text-fuchsia-600" : "bg-slate-50 text-slate-600"
                        }`}
                      >
                        {DAY_LABELS[day - 1]}
                        {day === todayDow && <div className="text-[9px] font-black text-fuchsia-400">วันนี้</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSlots.map((slot, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-1 py-2 border-r-2 border-slate-200 sticky left-0 z-10 bg-slate-50 text-center">
                        <p className="text-[11px] font-black text-slate-500">{formatTime(slot.start_time)}</p>
                        <p className="text-[9px] text-slate-400">{formatTime(slot.end_time)}</p>
                      </td>
                      {DAYS.map(day => {
                        const found = findEntry(day, slot);
                        if (!found) {
                          return <td key={day} className="p-1 border-r border-slate-100">
                            <div className="rounded-xl border-2 border-dashed border-slate-100" style={{ minHeight: "64px" }} />
                          </td>;
                        }
                        const colors = subjectColorMap[found.section.subject?.id ?? ""] ?? SUBJECT_COLORS[0];
                        return (
                          <td key={day} className="p-1 border-r border-slate-100 align-top">
                            <button
                              onClick={() => router.push(`/student-portal/${studentId}/subject/${found.section.id}`)}
                              className={`w-full h-full rounded-xl border-2 px-2 py-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${colors.bg} ${colors.border} ${colors.text}`}
                              style={{ minHeight: "64px" }}
                            >
                              <p className="font-black text-[11px] leading-tight line-clamp-2">
                                {found.section.subject?.name_th ?? "-"}
                              </p>
                              <p className="text-[9px] font-bold opacity-70 mt-0.5">
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