"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Tab = "assignments" | "pending" | "grades" | "attendance";

interface Submission {
  id: string;
  file_url: string;
  file_name: string;
  submitted_at: string;
  score: number | null;
  feedback: string | null;
  status: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number | null;
  weight_percent?: number | null;
  submissions: Submission[];
}

const TAB_ITEMS: { key: Tab; label: string; icon: string }[] = [
  { key: "assignments", label: "งานที่มอบหมาย/ส่งงาน", icon: "📌" },
  { key: "pending", label: "งานที่ยังไม่ส่ง", icon: "⏳" },
  { key: "grades", label: "คะแนนรวม", icon: "⭐" },
  { key: "attendance", label: "เช็คชื่อ", icon: "✅" },
];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function isLate(dueDate: string | null, submittedAt: string | null) {
  if (!dueDate || !submittedAt) return false;
  return new Date(submittedAt).getTime() > new Date(dueDate).getTime();
}

export default function StudentPortalSubjectPage() {
  const router = useRouter();
  const { studentId, sectionId } = useParams() as { studentId: string; sectionId: string };

  const [tab, setTab] = useState<Tab>("assignments");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    const res = await fetch(
      `/api/student-portal/assignments?student_id=${studentId}&subject_section_id=${sectionId}`
    );
    const data = await res.json();
    if (res.ok) setAssignments(data.assignments ?? []);
    setLoading(false);
  }, [studentId, sectionId]);

  const fetchGrades = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    const res = await fetch(
      `/api/student-portal/grades?student_id=${studentId}&subject_section_id=${sectionId}`
    );
    const data = await res.json();
    if (res.ok) setGrades(data);
    setLoading(false);
  }, [studentId, sectionId]);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/student-portal/attendance?student_id=${studentId}`);
    const data = await res.json();
    if (res.ok) setAttendance(data);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    if (tab === "assignments" || tab === "pending") fetchAssignments();
    if (tab === "grades") fetchGrades();
    if (tab === "attendance") fetchAttendance();
  }, [tab, fetchAssignments, fetchGrades, fetchAttendance]);

  const handleUpload = async (assignmentId: string, file: File) => {
    setUploadingId(assignmentId);
    const formData = new FormData();
    formData.append("student_id", studentId);
    formData.append("assignment_id", assignmentId);
    formData.append("file", file);

    const res = await fetch("/api/student-portal/assignments", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await fetchAssignments();
    } else {
      const data = await res.json();
      alert(data.error ?? "ส่งงานไม่สำเร็จ");
    }
    setUploadingId(null);
  };

  const pendingAssignments = assignments.filter((a) => a.submissions.length === 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-fuchsia-50/40 font-['TH_Sarabun_New',_sans-serif] pb-14">
      <div className="max-w-3xl mx-auto p-4">
        {/* ปุ่มย้อนกลับ */}
        <button
          onClick={() => router.push(`/student-portal/${studentId}`)}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-fuchsia-600 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> กลับตารางเรียน
        </button>

        {/* แท็บ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 flex items-center gap-1 flex-wrap mb-5">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-colors ${
                tab === t.key
                  ? "bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.key === "pending" && pendingAssignments.length > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    tab === t.key ? "bg-white/25 text-white" : "bg-rose-100 text-rose-500"
                  }`}
                >
                  {pendingAssignments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-10 text-fuchsia-400 font-black text-sm animate-pulse">
            กำลังโหลดข้อมูล...
          </div>
        )}

        {/* งานที่มอบหมาย/ส่งงาน */}
        {tab === "assignments" && !loading && (
          <div className="space-y-3">
            {assignments.length === 0 ? (
              <EmptyState icon="📋" text="ยังไม่มีงานที่มอบหมายในวิชานี้" />
            ) : (
              assignments.map((a) => {
                const sub = a.submissions[0];
                const late = sub ? isLate(a.due_date, sub.submitted_at) : false;
                return (
                  <div
                    key={a.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black text-white shrink-0 bg-gradient-to-br from-indigo-500 to-blue-500">
                          📄
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-800 truncate">{a.title}</p>
                          {a.description && (
                            <p className="text-slate-500 text-xs font-bold mt-0.5 line-clamp-2">
                              {a.description}
                            </p>
                          )}
                          <p className="text-slate-400 text-[11px] font-bold mt-1">
                            {a.due_date ? <>กำหนดส่ง {formatDate(a.due_date)}</> : "ไม่มีกำหนดส่ง"}
                          </p>
                        </div>
                      </div>

                      {/* ★ คะแนนที่ได้ / สถานะ — โชว์ตรงนี้เลยโดยไม่ต้องกดเข้าไปดู */}
                      <div className="shrink-0">
                        {!sub ? (
                          <span className="inline-block px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-black">
                            ยังไม่ได้ส่ง
                          </span>
                        ) : sub.score !== null && sub.score !== undefined ? (
                          <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100">
                            <span className="text-sm font-black text-emerald-600">
                              {sub.score}
                              <span className="text-emerald-400 font-bold">/{a.max_score ?? "-"}</span>
                            </span>
                            {late && (
                              <span className="text-[9px] font-black text-orange-500">⏰ ส่งช้า</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 text-[11px] font-black">
                            ⏳ รอตรวจ
                          </span>
                        )}
                      </div>
                    </div>

                    {sub ? (
                      <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                        <p className="text-xs font-bold text-slate-600">
                          ส่งแล้ว: <span className="text-slate-800">{sub.file_name}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                          ส่งเมื่อ {formatDate(sub.submitted_at)}
                        </p>
                        {sub.feedback && (
                          <p className="text-xs font-bold text-indigo-600 mt-1.5 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                            💬 {sub.feedback}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2">
                        <label
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-xs cursor-pointer transition-colors ${
                            uploadingId === a.id ? "opacity-60 pointer-events-none" : ""
                          }`}
                        >
                          📎 เลือกไฟล์เพื่อส่งงาน
                          <input
                            type="file"
                            disabled={uploadingId === a.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(a.id, file);
                            }}
                            className="hidden"
                          />
                        </label>
                        {uploadingId === a.id && (
                          <span className="text-xs font-bold text-slate-400 animate-pulse">
                            กำลังอัปโหลด...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* งานที่ยังไม่ส่ง */}
        {tab === "pending" && !loading && (
          <div className="space-y-3">
            {pendingAssignments.length === 0 ? (
              <EmptyState icon="🎉" text="ไม่มีงานค้างส่ง เยี่ยมมาก!" />
            ) : (
              pendingAssignments.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-2xl border border-rose-100 shadow-sm p-4 flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black text-white shrink-0 bg-gradient-to-br from-rose-400 to-orange-400">
                    ⏰
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-800 truncate">{a.title}</p>
                    <p className="text-rose-400 text-xs font-bold mt-0.5">
                      กำหนดส่ง: {formatDate(a.due_date)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* คะแนนรวม */}
        {tab === "grades" && !loading && grades && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white p-5 shadow-sm">
              <p className="text-xs font-bold opacity-90">คะแนนรวม (ถ่วงน้ำหนัก)</p>
              <p className="text-3xl font-black mt-1">{grades.summary.weighted_score}%</p>
              <p className="text-[11px] font-bold opacity-80 mt-1">
                ตรวจแล้ว {grades.summary.weight_graded}% ของคะแนนทั้งหมด
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
              {grades.grades.length === 0 ? (
                <p className="text-center text-slate-300 font-bold text-sm py-8">ยังไม่มีคะแนน</p>
              ) : (
                grades.grades.map((g: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <p className="text-sm font-bold text-slate-700">{g.title}</p>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-fuchsia-600">
                        {g.score}
                        <span className="text-slate-400 font-bold">/{g.max_score}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold">น้ำหนัก {g.weight_percent}%</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* เช็คชื่อ */}
        {tab === "attendance" && !loading && attendance && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <StatCard label="มา" value={attendance.summary.present} colorClass="from-emerald-500 to-teal-400" />
              <StatCard label="ขาด" value={attendance.summary.absent} colorClass="from-rose-500 to-red-400" />
              <StatCard label="สาย" value={attendance.summary.late} colorClass="from-amber-500 to-orange-400" />
              <StatCard
                label="ลา"
                value={attendance.summary.excused ?? attendance.summary.leave}
                colorClass="from-sky-500 to-blue-400"
              />
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
              {attendance.records.length === 0 ? (
                <p className="text-center text-slate-300 font-bold text-sm py-8">ยังไม่มีข้อมูลการเช็คชื่อ</p>
              ) : (
                attendance.records.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm font-bold text-slate-600">{r.date ?? r.attendance_date}</span>
                    <StatusPill status={r.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
      <p className="text-3xl mb-2">{icon}</p>
      <p className="font-bold text-sm">{text}</p>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colorClass} p-3 text-white shadow-sm text-center`}>
      <p className="text-lg font-black">{value ?? 0}</p>
      <p className="text-[10px] font-bold opacity-90 mt-0.5">{label}</p>
    </div>
  );
}

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  present: { label: "มา", className: "bg-emerald-50 text-emerald-600" },
  absent: { label: "ขาด", className: "bg-rose-50 text-rose-600" },
  late: { label: "สาย", className: "bg-amber-50 text-amber-600" },
  leave: { label: "ลา", className: "bg-sky-50 text-sky-600" },
  excused: { label: "ลา", className: "bg-sky-50 text-sky-600" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, className: "bg-slate-100 text-slate-500" };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-black ${s.className}`}>{s.label}</span>
  );
}