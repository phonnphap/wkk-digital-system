"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   Types — ต้องตรงกับ response ของ /api/insights/overview
   ========================================================================= */

type Role = "admin" | "homeroom_teacher" | "subject_teacher" | "unknown";
type Scope = "school" | "grade_level" | "classroom";

type Totals = {
  studentCount: number;
  atRiskCount: number;
  atRiskPercent: number;
  onTimeRate: number | null;
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
  error?: string;
};

type GradeLevel = { id: string; name: string };
type ClassroomOption = { id: string; room_name?: string; grade_group?: string; grade_level_id?: string };
type SubjectOption = { id: string; name_th: string; subject_code: string };

/* =========================================================================
   Component
   ========================================================================= */

export default function InsightsTool({
  currentUserId,
  defaultClassroomId,
  defaultGradeLevelId,
}: {
  currentUserId?: string;
  defaultClassroomId?: string;
  defaultGradeLevelId?: string;
}) {
  const [role, setRole] = useState<Role>("unknown");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<InsightsResponse | null>(null);

  // ตัวเลือกขอบเขตการดู
  const [scope, setScope] = useState<Scope>(defaultClassroomId ? "classroom" : "grade_level");
  const [scopeId, setScopeId] = useState<string>(defaultClassroomId ?? defaultGradeLevelId ?? "");
  const [subjectId, setSubjectId] = useState<string>("");

  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [mySubjects, setMySubjects] = useState<SubjectOption[]>([]);

  // โหลดตัวเลือกสำหรับ dropdown (สายชั้น/ระดับชั้น, ห้องเรียน, วิชาที่ครูสอน)
  useEffect(() => {
    (async () => {
      const { data: levels } = await supabase.from("grade_levels").select("id, name").order("name");
      setGradeLevels((levels ?? []) as GradeLevel[]);

      const { data: rooms } = await supabase.from("classrooms").select("id, room_name, grade_group, grade_level_id");
      setClassrooms((rooms ?? []) as ClassroomOption[]);

      if (currentUserId) {
        const { data: sections } = await supabase
          .from("subject_sections")
          .select("subject_id, subjects(id, name_th, subject_code)")
          .eq("teacher_id", currentUserId);
        const uniq = new Map<string, SubjectOption>();
        (sections ?? []).forEach((s: any) => {
          const subj = s.subjects;
          if (subj) uniq.set(subj.id, subj);
        });
        setMySubjects(Array.from(uniq.values()));
      }
    })();
  }, [currentUserId]);

  async function loadInsights() {
    if (!currentUserId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ requester_id: currentUserId, scope });
      if (scope !== "school" && scopeId) params.set("scope_id", scopeId);
      if (subjectId) params.set("subject_id", subjectId);

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
  }, [currentUserId, scope, scopeId, subjectId]);

  const isAdmin = role === "admin";
  const isSubjectTeacher = role === "subject_teacher";

  const filteredClassrooms = useMemo(() => {
    // ถ้าเลือกสายชั้น/ระดับชั้นไว้ ให้กรองรายการห้องให้เหลือเฉพาะระดับนั้น (สะดวกตอนสลับไปเลือกห้องเฉพาะ)
    return classrooms;
  }, [classrooms]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-black text-slate-800 text-lg">📊 ข้อมูลเชิงลึก</h2>
          <p className="text-slate-400 text-xs font-bold">ภาพรวมความเสี่ยง การเข้าเรียน การส่งงาน และคะแนนของนักเรียน</p>
        </div>
      </div>

      {/* ตัวเลือกขอบเขตการดู */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-2 flex-wrap">
        {isAdmin && (
          <>
            <ScopeButton active={scope === "school"} onClick={() => { setScope("school"); setScopeId(""); }} label="🏫 ทั้งโรงเรียน" />
            <ScopeButton active={scope === "grade_level"} onClick={() => setScope("grade_level")} label="🎓 สายชั้น/ระดับชั้น" />
            <ScopeButton active={scope === "classroom"} onClick={() => setScope("classroom")} label="🏠 ห้องเรียน" />
          </>
        )}
        {isSubjectTeacher && (
          <>
            <ScopeButton active={scope === "grade_level"} onClick={() => setScope("grade_level")} label="🎓 ระดับชั้นที่สอน" />
            <ScopeButton active={scope === "classroom"} onClick={() => setScope("classroom")} label="🏠 ห้องเรียน" />
          </>
        )}
        {role === "homeroom_teacher" && (
          <span className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 font-black text-xs">🏠 ห้องที่ปรึกษาของฉัน</span>
        )}

        {scope === "grade_level" && (
          <select
            value={scopeId}
            onChange={e => setScopeId(e.target.value)}
            className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-fuchsia-400 focus:outline-none"
          >
            <option value="">-- เลือกสายชั้น/ระดับชั้น --</option>
            {gradeLevels.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {scope === "classroom" && (
          <select
            value={scopeId}
            onChange={e => setScopeId(e.target.value)}
            className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-fuchsia-400 focus:outline-none"
          >
            <option value="">-- เลือกห้องเรียน --</option>
            {filteredClassrooms.map(c => (
              <option key={c.id} value={c.id}>{c.grade_group} {c.room_name}</option>
            ))}
          </select>
        )}
        {isSubjectTeacher && mySubjects.length > 0 && (
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-fuchsia-400 focus:outline-none"
          >
            <option value="">-- ทุกวิชาที่สอน --</option>
            {mySubjects.map(s => <option key={s.id} value={s.id}>{s.subject_code} · {s.name_th}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลดข้อมูลเชิงลึก...</div>
      ) : error ? (
        <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-3">❌ {error}</p>
      ) : !data ? null : data.totals.studentCount === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
          <p className="text-3xl mb-2">📭</p>
          <p className="font-bold text-sm">ไม่มีข้อมูลนักเรียนในขอบเขตที่เลือก ลองเลือกขอบเขตอื่น</p>
        </div>
      ) : (
        <>
          {/* การ์ดสรุป */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon="⚠️"
              label="นักเรียนกลุ่มเสี่ยง"
              count={`${data.totals.atRiskCount} คน`}
              percent={`${data.totals.atRiskPercent.toFixed(1)}%`}
              tone="rose"
            />
            <StatCard
              icon="✅"
              label="ส่งงานตรงเวลา"
              count={data.totals.onTimeRate === null ? "ไม่มีข้อมูล" : `${data.totals.onTimeRate.toFixed(1)}%`}
              percent="เฉลี่ยทั้งหมด"
              tone="emerald"
            />
            <StatCard
              icon="🗓️"
              label="อัตราการเข้าเรียน"
              count={data.totals.attendanceRate === null ? "ไม่มีข้อมูล" : `${data.totals.attendanceRate.toFixed(1)}%`}
              percent="เฉลี่ยทั้งหมด"
              tone="sky"
            />
            <StatCard
              icon="⭐"
              label="คะแนนเฉลี่ย"
              count={data.totals.avgScore === null ? "ไม่มีข้อมูล" : `${data.totals.avgScore.toFixed(1)}%`}
              percent={`จากนักเรียน ${data.totals.studentCount} คน`}
              tone="amber"
            />
          </div>

          {/* นักเรียนกลุ่มเสี่ยง */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
            <h3 className="font-black text-slate-700 text-sm mb-3 flex items-center gap-1.5">⚠️ นักเรียนกลุ่มเสี่ยง (ปีการศึกษานี้)</h3>
            {data.atRiskStudents.length === 0 ? (
              <p className="text-center text-slate-300 font-bold text-sm py-6">ไม่มีนักเรียนกลุ่มเสี่ยงในขอบเขตนี้ 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left text-[11px] font-black text-slate-500 px-4 py-2">ชื่อ</th>
                      <th className="text-left text-[11px] font-black text-slate-500 px-4 py-2">ห้อง</th>
                      <th className="text-center text-[11px] font-black text-slate-500 px-4 py-2">เข้าเรียน</th>
                      <th className="text-center text-[11px] font-black text-slate-500 px-4 py-2">คะแนนเฉลี่ย</th>
                      <th className="text-left text-[11px] font-black text-slate-500 px-4 py-2">สาเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.atRiskStudents.map(s => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-xs font-black text-slate-700 whitespace-nowrap">เลขที่ {s.seatNumber} {s.name}</td>
                        <td className="px-4 py-2 text-xs font-bold text-slate-500 whitespace-nowrap">{s.classroomName}</td>
                        <td className="px-4 py-2 text-center text-xs font-black">
                          {s.attendanceRate === null ? "-" : <span className={s.attendanceRate < 80 ? "text-red-500" : "text-slate-600"}>{s.attendanceRate}%</span>}
                        </td>
                        <td className="px-4 py-2 text-center text-xs font-black">
                          {s.avgScore === null ? "-" : <span className={s.avgScore < 50 ? "text-red-500" : "text-slate-600"}>{s.avgScore}%</span>}
                        </td>
                        <td className="px-4 py-2 text-[11px] font-bold text-slate-400">{s.reasons.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* การกระจายของคะแนน */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
            <h3 className="font-black text-slate-700 text-sm mb-4 flex items-center gap-1.5">📈 การกระจายของคะแนน</h3>
            <div className="space-y-2.5">
              {data.scoreDistribution.map(b => (
                <div key={b.band} className="flex items-center gap-3">
                  <span className="w-16 text-xs font-black text-slate-500 shrink-0">{b.band}%</span>
                  <div className="flex-1 h-6 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${b.band === "0-49" ? "bg-red-400" : b.band === "50-59" ? "bg-amber-400" : "bg-emerald-400"}`}
                      style={{ width: `${Math.max(2, b.percent)}%` }}
                    />
                  </div>
                  <span className="w-24 text-xs font-black text-slate-600 text-right shrink-0">{b.count} คน ({b.percent.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* อันดับห้องเรียน + อันดับวิชา */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankingCard
              title="🏠 อันดับห้องเรียน (เสี่ยงน้อย → มาก)"
              rows={data.classroomRanking.map(c => ({ id: c.classroomId, name: c.name, sub: `${c.studentCount} คน`, riskPercent: c.riskPercent }))}
            />
            <RankingCard
              title="📚 วิชาตามอัตราการเข้าเรียน (เสี่ยงน้อย → มาก)"
              rows={data.subjectRanking.map(s => ({
                id: s.subjectId,
                name: s.name,
                sub: s.attendanceRate === null ? `${s.studentCount} คน` : `เข้าเรียน ${s.attendanceRate.toFixed(1)}% · ${s.studentCount} คน`,
                riskPercent: s.riskPercent,
              }))}
            />
          </div>

          {/* ครูที่ดีที่สุด (แอดมินเท่านั้น) */}
          {isAdmin && (
            <RankingCard
              title="🏆 ครูที่ดีที่สุด (เสี่ยงต่ำสุด)"
              rows={data.teacherRanking.map(t => ({ id: t.teacherId, name: t.name, sub: `${t.studentCount} คน`, riskPercent: t.riskPercent }))}
            />
          )}
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
        active ? "bg-fuchsia-500 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  icon,
  label,
  count,
  percent,
  tone,
}: {
  icon: string;
  label: string;
  count: string;
  percent: string;
  tone: "rose" | "emerald" | "sky" | "amber";
}) {
  const toneMap: Record<string, string> = {
    rose: "from-rose-400 to-red-400",
    emerald: "from-emerald-400 to-teal-400",
    sky: "from-sky-400 to-blue-400",
    amber: "from-amber-400 to-orange-400",
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${toneMap[tone]} text-white p-4 shadow-sm`}>
      <p className="text-xl mb-1">{icon}</p>
      <p className="text-[11px] font-bold opacity-90">{label}</p>
      <p className="text-xl font-black mt-0.5">{count}</p>
      <p className="text-[10px] font-bold opacity-80 mt-0.5">{percent}</p>
    </div>
  );
}

function RankingCard({ title, rows }: { title: string; rows: { id: string; name: string; sub: string; riskPercent: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
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
                เสี่ยง {r.riskPercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}