"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   Types — ต้องตรงกับ response ของ /api/insights/overview
   ========================================================================= */

type Role = "admin" | "homeroom_teacher" | "subject_teacher" | "unknown";
type Scope = "classroom" | "grade_level" | "subject_all" | "school";

type Totals = {
  studentCount: number;
  atRiskCount: number;
  atRiskHigh: number;
  atRiskMedium: number;
  atRiskPercent: number;
  onTimeRate: number | null;
  onTimePendingCount: number;
  attendanceRate: number | null;
  avgScore: number | null;
};

type AtRiskStudent = {
  id: string;
  name: string;
  seatNumber: number;
  classroomName: string;
  attendanceRate: number | null;
  avgScore: number | null;
  reasons: string[];
};

type ScoreBand = { band: string; count: number; percent: number };
type ClassroomRank = { classroomId: string; name: string; studentCount: number; riskCount: number; riskPercent: number };
type SubjectRank = { subjectId: string; name: string; studentCount: number; attendanceRate: number | null; riskPercent: number };
type TeacherRank = { teacherId: string; name: string; studentCount: number; riskPercent: number };

type InsightsResponse = {
  role: Role;
  totals: Totals;
  atRiskStudents: AtRiskStudent[];
  scoreDistribution: ScoreBand[];
  classroomRanking: ClassroomRank[];
  subjectRanking: SubjectRank[];
  teacherRanking: TeacherRank[];
  updatedAt?: string;
  error?: string;
};

type AcademicYear = { id: string; year_name: string; semester: number; is_current: boolean };
type ClassroomInfo = { id: string; room_name?: string | null; grade_group?: string | null; grade_level_id?: string | null };

/* =========================================================================
   Component
   - subjectId / classroomId ล็อกตายตัวจากหน้าที่เข้ามาเสมอ (เหมือนเดิม)
   - isAdmin: ถ้า true จะเห็นปุ่มขอบเขตเพิ่ม "รายวิชานี้ (ทุกห้องทั้งโรงเรียน)" และ "ทั้งโรงเรียน"
   ========================================================================= */

export default function InsightsTool({
  currentUserId,
  subjectId,
  classroomId,
  isAdmin = false,
}: {
  currentUserId?: string;
  subjectId: string;
  classroomId: string;
  isAdmin?: boolean;
}) {
  const [role, setRole] = useState<Role>("unknown");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<InsightsResponse | null>(null);

  const [scope, setScope] = useState<Scope>("classroom");

  const [currentClassroom, setCurrentClassroom] = useState<ClassroomInfo | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState<string>("");

  useEffect(() => {
    if (!classroomId) return;
    supabase
      .from("classrooms")
      .select("id, room_name, grade_group, grade_level_id")
      .eq("id", classroomId)
      .maybeSingle()
      .then(({ data }) => setCurrentClassroom((data ?? null) as ClassroomInfo | null));
  }, [classroomId]);

  useEffect(() => {
    supabase
      .from("academic_years")
      .select("id, year_name, semester, is_current")
      .order("year_name", { ascending: false })
      .order("semester", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as AcademicYear[];
        setAcademicYears(rows);
        const current = rows.find(y => y.is_current);
        if (current) setAcademicYearId(current.id);
      });
  }, []);

  async function loadInsights() {
    if (!currentUserId || !classroomId) return;
    if (scope !== "school" && !subjectId) return;
    if (scope === "grade_level" && !currentClassroom?.grade_level_id) return;

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ requester_id: currentUserId, scope });
      if (scope !== "school") params.set("subject_id", subjectId);
      if (scope === "classroom") {
        params.set("classroom_id", classroomId);
      } else if (scope === "grade_level") {
        params.set("grade_level_id", currentClassroom!.grade_level_id!);
      }
      // subject_all / school -> ไม่ล็อกห้อง/สายชั้น
      if (academicYearId) params.set("academic_year_id", academicYearId);

      const res = await fetch(`/api/insights/overview?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลเชิงลึกไม่สำเร็จ");
      setData(json);
      setRole(json.role);
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลเชิงลึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, subjectId, classroomId, scope, currentClassroom, academicYearId]);

  const scopeLabel =
    scope === "classroom" ? "ห้องเรียนนี้ (วิชานี้)"
    : scope === "grade_level" ? "ทุกห้องในสายชั้นเดียวกัน (วิชานี้)"
    : scope === "subject_all" ? "วิชานี้ ทุกห้องทั้งโรงเรียน"
    : "ทั้งโรงเรียน (ทุกวิชา ทุกห้อง)";

  const isMultiClassroomScope = scope !== "classroom";
  const isMultiSubjectScope = scope === "school";

  const bandColor = (band: string) => {
    switch (band) {
      case "0-49": return "bg-red-400";
      case "50-59": return "bg-amber-400";
      case "60-69": return "bg-yellow-400";
      case "70-79": return "bg-sky-400";
      case "80-89": return "bg-emerald-400";
      case "90-100": return "bg-teal-500";
      default: return "bg-slate-300";
    }
  };

  return (
    <div className="space-y-4">
      {/* ตัวเลือกขอบเขต */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 flex items-center gap-2 flex-wrap">
        <ScopeButton active={scope === "classroom"} onClick={() => setScope("classroom")} label={`🏠 ห้องนี้ (${currentClassroom?.grade_group ?? ""}${currentClassroom?.room_name ?? ""})`} />
        <ScopeButton active={scope === "grade_level"} onClick={() => setScope("grade_level")} label="🎓 ทุกห้องในสายชั้นเดียวกัน" />
        {isAdmin && (
          <>
            <ScopeButton active={scope === "subject_all"} onClick={() => setScope("subject_all")} label="📘 วิชานี้ (ทุกห้องทั้งโรงเรียน)" />
            <ScopeButton active={scope === "school"} onClick={() => setScope("school")} label="🏫 ทั้งโรงเรียน" />
          </>
        )}
        <span className="text-slate-300 text-[11px] font-bold ml-auto">ขอบเขต: {scopeLabel}</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลดข้อมูลเชิงลึก...</div>
      ) : error ? (
        <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-3">❌ {error}</p>
      ) : !data ? null : data.totals.studentCount === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
          <p className="text-3xl mb-2">📭</p>
          <p className="font-bold text-sm">ไม่มีข้อมูลนักเรียนในขอบเขตที่เลือก ลองสลับไปดูขอบเขตอื่น</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon="⚠️" label="นักเรียนกลุ่มเสี่ยง" value={`${data.totals.atRiskCount}`} sub={`${data.totals.atRiskHigh} สูง · ${data.totals.atRiskMedium} ปานกลาง`} tone="rose" />
            <StatCard icon="🕐" label="ส่งงานตรงเวลา" value={data.totals.onTimeRate === null ? "-" : `${data.totals.onTimeRate.toFixed(0)}%`} sub={`${data.totals.onTimePendingCount} รอตรวจ`} tone="sky" />
            <StatCard icon="🗓️" label="อัตราการเข้าเรียน" value={data.totals.attendanceRate === null ? "-" : `${data.totals.attendanceRate.toFixed(0)}%`} sub="เฉลี่ยทั้งหมด" tone="emerald" />
            <StatCard icon="⭐" label="คะแนนเฉลี่ย" value={data.totals.avgScore === null ? "-" : `${data.totals.avgScore.toFixed(0)}%`} sub="จากงานที่ตรวจแล้ว" tone="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
              <h3 className="font-black text-slate-700 text-sm mb-3 flex items-center gap-1.5">⚠️ นักเรียนกลุ่มเสี่ยง</h3>
              {data.atRiskStudents.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-3xl mb-2">🎉</p>
                  <p className="text-emerald-500 font-black text-sm">ไม่มีนักเรียนกลุ่มเสี่ยงในขอบเขตนี้</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left text-[11px] font-black text-slate-500 px-3 py-2">ชื่อ</th>
                        <th className="text-left text-[11px] font-black text-slate-500 px-3 py-2">ห้อง</th>
                        <th className="text-center text-[11px] font-black text-slate-500 px-3 py-2">เข้าเรียน</th>
                        <th className="text-center text-[11px] font-black text-slate-500 px-3 py-2">คะแนนเฉลี่ย</th>
                        <th className="text-left text-[11px] font-black text-slate-500 px-3 py-2">สาเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.atRiskStudents.map(s => (
                        <tr key={s.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-xs font-black text-slate-700 whitespace-nowrap">เลขที่ {s.seatNumber} {s.name}</td>
                          <td className="px-3 py-2 text-xs font-bold text-slate-500 whitespace-nowrap">{s.classroomName}</td>
                          <td className="px-3 py-2 text-center text-xs font-black">
                            {s.attendanceRate === null ? "-" : <span className={s.attendanceRate < 80 ? "text-red-500" : "text-slate-600"}>{s.attendanceRate}%</span>}
                          </td>
                          <td className="px-3 py-2 text-center text-xs font-black">
                            {s.avgScore === null ? "-" : <span className={s.avgScore < 50 ? "text-red-500" : "text-slate-600"}>{s.avgScore}%</span>}
                          </td>
                          <td className="px-3 py-2 text-[11px] font-bold text-slate-400">{s.reasons.join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5">
                <h3 className="font-black text-slate-700 text-sm mb-3 flex items-center gap-1.5">📈 การกระจายของคะแนน</h3>
                <div className="grid grid-cols-3 gap-2">
                  {data.scoreDistribution.map(b => (
                    <div key={b.band} className="text-center rounded-xl border border-slate-100 p-2">
                      <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${bandColor(b.band)}`} />
                      <p className="text-base font-black text-slate-700">{b.count}</p>
                      <p className="text-[9px] text-slate-400 font-bold">{b.band}</p>
                    </div>
                  ))}
                </div>
              </div>

              {isMultiClassroomScope && (
                <RankingCard
                  title="🏠 อันดับห้องเรียน"
                  rows={data.classroomRanking.map(c => ({ id: c.classroomId, name: c.name, sub: `${c.studentCount} คน`, riskPercent: c.riskPercent }))}
                />
              )}

              {isMultiSubjectScope && (
                <RankingCard
                  title="📘 อันดับรายวิชา"
                  rows={data.subjectRanking.map(s => ({ id: s.subjectId, name: s.name, sub: `${s.studentCount} คน`, riskPercent: s.riskPercent }))}
                />
              )}

              {isAdmin && data.teacherRanking.length > 0 && (
                <RankingCard
                  title="🧑‍🏫 อันดับครูผู้สอน"
                  rows={data.teacherRanking.map(t => ({ id: t.teacherId, name: t.name, sub: `${t.studentCount} คน`, riskPercent: t.riskPercent }))}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   ชิ้นส่วนย่อย
   ========================================================================= */

function ScopeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl font-black text-xs transition-colors ${
        active ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  icon, label, value, sub, tone,
}: {
  icon: string; label: string; value: string; sub: string; tone: "rose" | "emerald" | "sky" | "amber";
}) {
  const toneMap: Record<string, string> = {
    rose: "bg-rose-50 text-rose-500", emerald: "bg-emerald-50 text-emerald-500",
    sky: "bg-sky-50 text-sky-500", amber: "bg-amber-50 text-amber-500",
  };
  const valueToneMap: Record<string, string> = {
    rose: "text-rose-600", emerald: "text-emerald-600", sky: "text-sky-600", amber: "text-amber-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start justify-between">
      <div>
        <p className="text-[11px] font-bold text-slate-400">{label}</p>
        <p className={`text-2xl font-black mt-1 ${valueToneMap[tone]}`}>{value}</p>
        <p className="text-[10px] font-bold text-slate-300 mt-0.5">{sub}</p>
      </div>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${toneMap[tone]}`}>{icon}</div>
    </div>
  );
}

function RankingCard({ title, rows }: { title: string; rows: { id: string; name: string; sub: string; riskPercent: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5">
      <h3 className="font-black text-slate-700 text-sm mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-center text-slate-300 font-bold text-xs py-6">ไม่มีข้อมูล</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="w-6 text-center text-xs font-black text-slate-300">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-700 truncate">{r.name}</p>
                <p className="text-[10px] text-slate-400 font-bold">{r.sub}</p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-black shrink-0 ${
                  r.riskPercent < 20 ? "bg-emerald-50 text-emerald-600" : r.riskPercent < 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                }`}
              >
                เสี่ยง {r.riskPercent.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}