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

export default function StudentDashboardPage() {
  const router = useRouter();
  const { studentId } = useParams() as { studentId: string };
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/student-portal/timetable?student_id=${studentId}`);
      const json = await res.json();
      setSections(json.sections ?? []);
      setLoading(false);
    })();
  }, [studentId]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/student-auth/logout", { method: "POST" });
    router.push("/join/logged-out");
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

  return (
    <div className="min-h-screen bg-slate-50 font-['TH_Sarabun_New',_sans-serif] pb-10">
      <div className="bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 px-4 pt-6 pb-8 flex items-center justify-between">
        <h1 className="text-white font-black text-lg">📚 ตารางเรียนของฉัน</h1>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-xs disabled:opacity-50"
        >
          {loggingOut ? "กำลังออก..." : "🚪 ออกจากระบบ"}
        </button>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {loading ? (
          <p className="text-center text-slate-400 font-bold py-10">กำลังโหลด...</p>
        ) : sections.length === 0 ? (
          <p className="text-center text-slate-400 font-bold py-10">ยังไม่มีวิชาที่เปิดให้เข้าดู</p>
        ) : (
          [1, 2, 3, 4, 5, 6, 7].map(day =>
            byDay[day]?.length ? (
              <div key={day} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="font-black text-slate-700 text-sm mb-3">วัน{DAY_LABELS[day]}</p>
                <div className="space-y-2">
                  {byDay[day].map(({ section, entry }) => (
                    <button
                      key={entry.id}
                      onClick={() => router.push(`/student-portal/${studentId}/subject/${section.id}`)}
                      className="w-full flex items-center justify-between rounded-xl border-2 border-slate-100 hover:border-fuchsia-300 px-4 py-3 transition-colors text-left"
                    >
                      <div>
                        <p className="font-black text-slate-700 text-sm">{section.subject?.name_th ?? "-"}</p>
                        <p className="text-[11px] text-slate-400 font-bold">{section.subject?.subject_code}</p>
                      </div>
                      <span className="text-xs font-black text-fuchsia-500">
                        {entry.start_time?.slice(0, 5)}-{entry.end_time?.slice(0, 5)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
      </div>
    </div>
  );
}