"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";

type Section = {
  id: string;
  subject: { id: string; subject_code: string; name_th: string } | null;
  timetable_entries: { id: string; day_of_week: number; slot_number: number; start_time: string; end_time: string }[];
};

const DAY_LABELS = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

// สีไล่เฉดต่อวัน ให้แยกแยะง่ายและดูสดใส
const DAY_THEME: Record<number, { grad: string; chip: string; dot: string }> = {
  1: { grad: "from-yellow-400 to-amber-500", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  2: { grad: "from-pink-400 to-rose-500", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-400" },
  3: { grad: "from-emerald-400 to-teal-500", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-400" },
  4: { grad: "from-orange-400 to-amber-600", chip: "bg-orange-50 text-orange-700", dot: "bg-orange-400" },
  5: { grad: "from-sky-400 to-blue-500", chip: "bg-sky-50 text-sky-700", dot: "bg-sky-400" },
  6: { grad: "from-violet-400 to-purple-500", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-400" },
  7: { grad: "from-red-400 to-rose-500", chip: "bg-red-50 text-red-700", dot: "bg-red-400" },
};

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

  // จัดกลุ่มตามวัน
  const byDay: Record<number, { section: Section; entry: Section["timetable_entries"][0] }[]> = {};
  sections.forEach(sec => {
    sec.timetable_entries.forEach(entry => {
      if (!byDay[entry.day_of_week]) byDay[entry.day_of_week] = [];
      byDay[entry.day_of_week].push({ section: sec, entry });
    });
  });
  Object.values(byDay).forEach(list => list.sort((a, b) => a.entry.slot_number - b.entry.slot_number));

  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay(); // 1=จันทร์...7=อาทิตย์

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-white to-sky-50 font-['TH_Sarabun_New',_sans-serif] pb-14">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 px-5 pt-8 pb-12 rounded-b-[2.5rem] shadow-lg">
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

      <div className="px-4 -mt-6 max-w-3xl mx-auto space-y-4">
        {loading ? (
          <SkeletonList />
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
        ) : sections.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-10 text-center">
            <p className="text-4xl mb-3">🗓️</p>
            <p className="text-slate-400 font-bold text-sm">ยังไม่มีวิชาที่เปิดให้เข้าดู</p>
            <p className="text-slate-300 font-bold text-xs mt-1">รอครูผู้สอนเปิดให้เข้าใช้งานวิชานี้</p>
          </div>
        ) : (
          [1, 2, 3, 4, 5, 6, 7].map(day => {
            const list = byDay[day];
            if (!list?.length) return null;
            const theme = DAY_THEME[day];
            const isToday = day === todayDow;
            return (
              <div
                key={day}
                className={`bg-white rounded-3xl shadow-md border overflow-hidden transition ${
                  isToday ? "border-fuchsia-300 ring-2 ring-fuchsia-100" : "border-slate-100"
                }`}
              >
                <div className={`bg-gradient-to-r ${theme.grad} px-4 py-3 flex items-center justify-between`}>
                  <p className="font-black text-white text-sm flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-white ${isToday ? "animate-pulse" : ""}`} />
                    วัน{DAY_LABELS[day]}
                  </p>
                  {isToday && (
                    <span className="text-[10px] font-black bg-white/25 text-white px-2.5 py-1 rounded-full">
                      วันนี้
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  {list.map(({ section, entry }) => (
                    <button
                      key={entry.id}
                      onClick={() => router.push(`/student-portal/${studentId}/subject/${section.id}`)}
                      className="w-full flex items-center justify-between rounded-2xl border-2 border-slate-100 hover:border-fuchsia-300 hover:bg-fuchsia-50/40 px-4 py-3.5 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`shrink-0 w-10 h-10 rounded-2xl ${theme.chip} flex items-center justify-center font-black text-xs`}>
                          {section.subject?.subject_code?.slice(0, 2) ?? "-"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-700 text-sm truncate group-hover:text-fuchsia-600 transition">
                            {section.subject?.name_th ?? "-"}
                          </p>
                          <p className="text-[11px] text-slate-400 font-bold">{section.subject?.subject_code}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs font-black px-2.5 py-1.5 rounded-xl ${theme.chip}`}>
                        {entry.start_time?.slice(0, 5)}-{entry.end_time?.slice(0, 5)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden">
          <div className="h-11 bg-slate-100" />
          <div className="p-3 space-y-2">
            <div className="h-16 bg-slate-50 rounded-2xl" />
            <div className="h-16 bg-slate-50 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}