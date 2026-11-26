"use client";

import { useEffect, useState } from "react";

type Teacher = { name: string; phone?: string | null };
type Classroom = { id: string; name: string; teachers: Teacher[] };
type Grade = { grade: string; classrooms: Classroom[] };

export default function TeacherFinder({ big = true, guardKey = "" }: { big?: boolean; guardKey?: string }) {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [grade, setGrade] = useState<string | null>(null);
  const [room, setRoom] = useState<Classroom | null>(null);

  useEffect(() => {
    fetch("/api/visitors/homeroom", { headers: guardKey ? { "x-guard-key": guardKey } : {} })
      .then(r => r.json())
      .then(j => setGrades(j.grades ?? []))
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [guardKey]);

  const rooms = grades.find(g => g.grade === grade)?.classrooms ?? [];
  const chip = (active: boolean) =>
    `rounded-2xl border-4 px-5 py-4 text-2xl font-black active:scale-[0.97] ${
      active ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700"
    }`;

  if (loading) return <p className="text-2xl text-slate-400">⏳ กำลังโหลด...</p>;
  if (err) return <p className="text-2xl text-red-600">{err}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className={`${big ? "text-2xl" : "text-lg"} font-black`}>1) เลือกชั้น</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          {grades.map(g => (
            <button key={g.grade} className={chip(grade === g.grade)}
              onClick={() => { setGrade(g.grade); setRoom(null); }}>
              {g.grade}
            </button>
          ))}
        </div>
      </div>

      {grade && (
        <div>
          <h3 className={`${big ? "text-2xl" : "text-lg"} font-black`}>2) เลือกห้อง</h3>
          <div className="mt-2 flex flex-wrap gap-3">
            {rooms.map(r => (
              <button key={r.id} className={chip(room?.id === r.id)} onClick={() => setRoom(r)}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {room && (
        <div className="rounded-3xl border-4 border-teal-300 bg-white p-5">
          <p className="text-xl font-bold text-slate-500">ครูประจำชั้น {room.name}</p>
          {room.teachers.length === 0 && <p className="mt-2 text-2xl text-slate-400">ยังไม่มีข้อมูลครูประจำชั้น</p>}
          {room.teachers.map((t, i) => (
            <div key={i} className="mt-2">
              <p className="text-3xl font-black text-slate-800">👩‍🏫 {t.name}</p>
              {t.phone && (
                <a href={`tel:${t.phone}`}
                  className="mt-2 inline-block rounded-2xl bg-green-600 px-6 py-4 text-2xl font-black text-white">
                  📞 โทร {t.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}