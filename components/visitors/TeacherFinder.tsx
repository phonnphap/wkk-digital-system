"use client";

import { useEffect, useState } from "react";

type Teacher = { name: string; phone?: string | null };
type Classroom = { id: string; name: string; teachers: Teacher[] };
type Grade = { grade: string; classrooms: Classroom[] };

type Props = {
  big?: boolean;
  guardKey?: string;
  defaultName?: string;     // ชื่อผู้มาติดต่อ (ถ้าหน้าที่เรียกมีอยู่แล้ว)
  defaultPurpose?: string;  // เรื่องที่มาติดต่อ
  defaultStudent?: string;  // ชื่อนักเรียนที่มาพบ
};

export default function TeacherFinder({ big = true, guardKey = "", defaultName = "", defaultPurpose = "", defaultStudent = "" }: Props) {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [grade, setGrade] = useState<string | null>(null);
  const [room, setRoom] = useState<Classroom | null>(null);

  const [vName, setVName] = useState(defaultName);
  const [vPurpose, setVPurpose] = useState(defaultPurpose);
  const [vStudent, setVStudent] = useState(defaultStudent);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // ถ้าหน้าที่เรียกมีการกรอกข้อมูลเพิ่ม ให้ซิงก์ค่าเข้ามา (เฉพาะตอนที่ช่องนี้ยังว่าง)
  useEffect(() => { if (defaultName && !vName) setVName(defaultName); }, [defaultName]);          // eslint-disable-line
  useEffect(() => { if (defaultPurpose && !vPurpose) setVPurpose(defaultPurpose); }, [defaultPurpose]); // eslint-disable-line
  useEffect(() => { if (defaultStudent && !vStudent) setVStudent(defaultStudent); }, [defaultStudent]); // eslint-disable-line

  useEffect(() => {
    fetch("/api/visitors/homeroom", { headers: guardKey ? { "x-guard-key": guardKey } : {} })
      .then(r => r.json())
      .then(j => setGrades(j.grades ?? []))
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [guardKey]);

  async function notifyTeacher() {
    if (!room) return;
    if (!vName.trim()) return setResult({ ok: false, text: "⚠️ กรุณากรอกชื่อผู้มาติดต่อ" });
    if (!vPurpose.trim()) return setResult({ ok: false, text: "⚠️ กรุณาระบุเรื่องที่มาติดต่อ" });
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/visitors/notify-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(guardKey ? { "x-guard-key": guardKey } : {}) },
        body: JSON.stringify({
          classroom_id: room.id,
          visitor_name: vName.trim(),
          purpose: vPurpose.trim(),
          student_name: vStudent.trim() || null,
        }),
      });
      const j = await res.json();
      if (j.ok) setResult({ ok: true, text: "✅ แจ้งครูทาง Teams แล้ว กรุณารอสักครู่" });
      else setResult({ ok: false, text: "❌ " + (j.error ?? "ส่งแจ้งเตือนไม่สำเร็จ") });
    } catch {
      setResult({ ok: false, text: "❌ ส่งแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่" });
    }
    setSending(false);
  }

  const rooms = grades.find(g => g.grade === grade)?.classrooms ?? [];
  const chip = (active: boolean) =>
    `rounded-2xl border-4 px-5 py-4 text-2xl font-black active:scale-[0.97] ${
      active ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700"
    }`;
  const input = "w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-xl";

  if (loading) return <p className="text-2xl text-slate-400">⏳ กำลังโหลด...</p>;
  if (err) return <p className="text-2xl text-red-600">{err}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className={`${big ? "text-2xl" : "text-lg"} font-black`}>1) เลือกชั้น</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          {grades.map(g => (
            <button type="button" key={g.grade} className={chip(grade === g.grade)}
              onClick={() => { setGrade(g.grade); setRoom(null); setResult(null); }}>
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
              <button type="button" key={r.id} className={chip(room?.id === r.id)}
                onClick={() => { setRoom(r); setResult(null); }}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {room && (
        <div className="space-y-4 rounded-3xl border-4 border-teal-300 bg-white p-5">
          <div>
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

          <div className="space-y-3 border-t-2 border-slate-100 pt-4">
            <p className="text-xl font-black text-slate-700">🔔 แจ้งครูว่ามีคนมาติดต่อ</p>
            <input className={input} value={vName} onChange={e => setVName(e.target.value)} placeholder="ชื่อผู้มาติดต่อ *" />
            <input className={input} value={vStudent} onChange={e => setVStudent(e.target.value)} placeholder="ชื่อนักเรียนที่มาพบ (ถ้ามี)" />
            <input className={input} value={vPurpose} onChange={e => setVPurpose(e.target.value)} placeholder="เรื่องที่มาติดต่อ *" />
            <button type="button" onClick={notifyTeacher} disabled={sending}
              className="w-full rounded-3xl bg-indigo-600 py-5 text-2xl font-black text-white shadow-lg active:scale-[0.98] disabled:opacity-40">
              {sending ? "⏳ กำลังส่ง..." : "🔔 แจ้งครูทาง Teams"}
            </button>
            {result && (
              <p className={`rounded-2xl px-4 py-3 text-xl font-bold ${result.ok ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-900"}`}>
                {result.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}