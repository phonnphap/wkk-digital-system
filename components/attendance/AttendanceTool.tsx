"use client";

import { useEffect, useState, useCallback } from "react";

type Status = "present" | "absent" | "late" | "leave";

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string;
  seat_number: number; avatar_url?: string;
};

type ReferenceInfo = { status: Status };

const STATUS_CONFIG: Record<Status, { label: string; emoji: string; bg: string; text: string; ring: string }> = {
  present: { label: "มา", emoji: "✅", bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-300" },
  late: { label: "สาย", emoji: "⏰", bg: "bg-amber-500", text: "text-white", ring: "ring-amber-300" },
  leave: { label: "ลา", emoji: "📄", bg: "bg-blue-500", text: "text-white", ring: "ring-blue-300" },
  absent: { label: "ขาด", emoji: "❌", bg: "bg-red-500", text: "text-white", ring: "ring-red-300" },
};

export default function AttendanceTool({
  timetableEntryId, date, students, currentUserId,
  referenceMap, referenceLabel = "โฮมรูม",
}: {
  timetableEntryId: string;   // ★ เปลี่ยนจาก sectionId — ต้องได้มาจากการเลือกคาบแล้วเท่านั้น
  date: string;
  students: Student[];
  currentUserId?: string;
  referenceMap?: Record<string, ReferenceInfo>;
  referenceLabel?: string;
}) {
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const loadAttendance = useCallback(async () => {
    if (!timetableEntryId || !date) return;
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/subject-attendance?timetable_entry_id=${timetableEntryId}&attendance_date=${date}`);
      const json = await res.json();
      const map: Record<string, Status> = {};
      (json.records ?? []).forEach((r: any) => { map[r.student_id] = r.status; });
      setStatusMap(map);
    } catch {
      // โหลดไม่ได้ ปล่อยว่างให้ครูเช็กใหม่
    } finally {
      setLoading(false);
    }
  }, [timetableEntryId, date]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  function setStatus(studentId: string, status: Status) {
    setStatusMap(prev => ({ ...prev, [studentId]: status }));
    setSaved(false);
  }

  function markAllPresent() {
    const map: Record<string, Status> = {};
    students.forEach(s => { map[s.id] = "present"; });
    setStatusMap(map);
    setSaved(false);
  }

  function pullFromReference() {
    if (!referenceMap) return;
    setStatusMap(prev => {
      const next = { ...prev };
      students.forEach(s => {
        const ref = referenceMap[s.id];
        if (ref && !next[s.id]) next[s.id] = ref.status; // ไม่ทับคนที่เช็กไปแล้ว
      });
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setError("");
    const missing = students.filter(s => !statusMap[s.id]);
    if (missing.length > 0) {
      setError(`ยังไม่ได้เช็กชื่อ ${missing.length} คน กรุณาเลือกสถานะให้ครบทุกคน`);
      return;
    }
    setSaving(true);
    try {
      const records = students.map(s => ({ student_id: s.id, status: statusMap[s.id] }));
      const res = await fetch("/api/subject-attendance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timetable_entry_id: timetableEntryId, attendance_date: date, records, created_by: currentUserId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
    } finally {
      setSaving(false);
    }
  }

  const summary = students.reduce((acc, s) => {
    const st = statusMap[s.id];
    if (st) acc[st] = (acc[st] ?? 0) + 1;
    return acc;
  }, {} as Record<Status, number>);

  if (loading) {
    return <div className="p-10 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดข้อมูลเช็กชื่อ...</div>;
  }
  if (students.length === 0) {
    return (
      <div className="p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">📭</p>
        <p className="font-bold text-sm">ยังไม่มีนักเรียนเข้าร่วมวิชานี้ ไม่สามารถเช็กชื่อได้</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex gap-2 text-xs font-bold flex-wrap">
          {(Object.keys(STATUS_CONFIG) as Status[]).map(st => (
            <span key={st} className={`px-2 py-1 rounded-lg ${STATUS_CONFIG[st].bg} ${STATUS_CONFIG[st].text}`}>
              {STATUS_CONFIG[st].emoji} {STATUS_CONFIG[st].label} {summary[st] ?? 0}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {referenceMap && (
            <button onClick={pullFromReference}
              className="px-3 py-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-black text-xs">
              📥 ดึงจาก{referenceLabel}
            </button>
          )}
          <button onClick={markAllPresent}
            className="px-3 py-1.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 font-black text-xs">
            ✅ มาทั้งหมด
          </button>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {students.map(s => (
          <div key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            {s.avatar_url ? (
              <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-400 text-white text-xs font-black flex items-center justify-center shrink-0">
                {s.first_name[0]}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-700 truncate flex items-center gap-1">
                {s.prefix}{s.first_name} {s.last_name}
                {referenceMap?.[s.id] && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                    referenceMap[s.id].status === "absent" ? "bg-red-100 text-red-600" :
                    referenceMap[s.id].status === "present" ? "bg-emerald-100 text-emerald-600" :
                    "bg-amber-100 text-amber-600"
                  }`}>
                    {referenceLabel}: {STATUS_CONFIG[referenceMap[s.id].status].label}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-slate-400">เลขที่ {s.seat_number}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {(Object.keys(STATUS_CONFIG) as Status[]).map(st => {
                const active = statusMap[s.id] === st;
                const cfg = STATUS_CONFIG[st];
                return (
                  <button key={st} onClick={() => setStatus(s.id, st)} title={cfg.label}
                    className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-all ${
                      active ? `${cfg.bg} ${cfg.text} scale-110 ring-2 ${cfg.ring}` : "bg-white border-2 border-slate-200 grayscale opacity-60 hover:opacity-100"
                    }`}>
                    {cfg.emoji}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2 mt-3">❌ {error}</p>}

      <button onClick={handleSave} disabled={saving}
        className="mt-4 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
        {saving ? "⏳ กำลังบันทึก..." : saved ? "✅ บันทึกแล้ว — กดซ้ำเพื่ออัปเดต" : "💾 บันทึกการเช็กชื่อ"}
      </button>
    </div>
  );
}