"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  Clock,
  FileText,
  PartyPopper,
  AlertCircle,
  ClipboardList,
  Hourglass,
  Trophy,
  CalendarCheck,
} from "lucide-react";

type Tab = "assignments" | "pending" | "grades" | "attendance";

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  points_possible: number | null;
  submissions: {
    id: string;
    file_url: string;
    file_name: string;
    submitted_at: string;
    score: number | null;
    feedback: string | null;
    status: string;
  }[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; emoji: string }> = {
  present: { bg: "bg-emerald-100", text: "text-emerald-700", label: "มา", emoji: "✅" },
  absent: { bg: "bg-rose-100", text: "text-rose-700", label: "ขาด", emoji: "❌" },
  late: { bg: "bg-amber-100", text: "text-amber-700", label: "สาย", emoji: "⏰" },
  leave: { bg: "bg-sky-100", text: "text-sky-700", label: "ลา", emoji: "📩" },
  excused: { bg: "bg-sky-100", text: "text-sky-700", label: "ลา", emoji: "📩" },
};

export default function StudentPortalSubjectPage() {
  const router = useRouter();
  const { studentId, sectionId } = useParams() as { studentId: string; sectionId: string };

  const [tab, setTab] = useState<Tab>("assignments");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSessionMismatch = useCallback(async () => {
    setErrorMsg("เซสชันไม่ตรงกับบัญชีนี้ กำลังพากลับไปหน้าเข้าสู่ระบบ...");
    try {
      await fetch("/api/student-portal/logout", { method: "POST" });
    } catch {
      // ignore, still redirect
    }
    setTimeout(() => router.push("/student-portal"), 1500);
  }, [router]);

  const handleResponse = useCallback(
    async (res: Response) => {
      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === "SESSION_MISMATCH" || res.status === 401) {
          await handleSessionMismatch();
          return null;
        }
        setErrorMsg(data?.error ?? "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
        return null;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data?.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
        return null;
      }
      setErrorMsg(null);
      return res.json();
    },
    [handleSessionMismatch]
  );

  const fetchAssignments = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    const res = await fetch(
      `/api/student-portal/assignments?student_id=${studentId}&subject_section_id=${sectionId}`
    );
    const data = await handleResponse(res);
    if (data) setAssignments(data.assignments ?? []);
    setLoading(false);
  }, [studentId, sectionId, handleResponse]);

  const fetchGrades = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    const res = await fetch(
      `/api/student-portal/grades?student_id=${studentId}&subject_section_id=${sectionId}`
    );
    const data = await handleResponse(res);
    if (data) setGrades(data);
    setLoading(false);
  }, [studentId, sectionId, handleResponse]);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/student-portal/attendance?student_id=${studentId}`);
    const data = await handleResponse(res);
    if (data) setAttendance(data);
    setLoading(false);
  }, [studentId, handleResponse]);

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

    const data = await handleResponse(res);
    if (data) {
      await fetchAssignments();
    }
    setUploadingId(null);
  };

  const pendingAssignments = assignments.filter((a) => a.submissions.length === 0);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "assignments", label: "งานที่มอบหมาย", icon: <ClipboardList className="h-4 w-4" /> },
    { key: "pending", label: "ยังไม่ส่ง", icon: <Hourglass className="h-4 w-4" /> },
    { key: "grades", label: "คะแนนรวม", icon: <Trophy className="h-4 w-4" /> },
    { key: "attendance", label: "เช็คชื่อ", icon: <CalendarCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white font-['TH_Sarabun_New']">
      {/* Header */}
      <div className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-400 pb-9 pt-5 px-4 rounded-b-[2.5rem] shadow-md">
        <button
          onClick={() => router.push(`/student-portal/${studentId}`)}
          className="flex items-center gap-1.5 text-lg text-white/90 hover:text-white mb-4 transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" /> กลับตารางเรียน
        </button>

        <nav className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-full text-lg font-semibold transition-all active:scale-95 ${
                tab === t.key
                  ? "bg-white text-fuchsia-600 shadow-lg"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="max-w-2xl mx-auto p-4 -mt-5">
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 text-lg leading-relaxed">
            <AlertCircle className="h-6 w-6 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 rounded-full border-4 border-violet-200 border-t-violet-500 animate-spin" />
          </div>
        )}

        {/* Assignments */}
        {tab === "assignments" && !loading && (
          <ul className="space-y-3">
            {assignments.length === 0 && !errorMsg && (
              <EmptyState text="ยังไม่มีงานที่มอบหมายในตอนนี้" />
            )}
            {assignments.map((a) => {
              const sub = a.submissions[0];
              return (
                <li
                  key={a.id}
                  className="bg-white rounded-3xl p-4 shadow-sm border-2 border-gray-100 hover:shadow-md hover:border-violet-100 transition-all"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-xl text-gray-800">{a.title}</span>
                    {a.due_date && (
                      <span className="text-base text-gray-400 whitespace-nowrap shrink-0 flex items-center gap-1">
                        <Clock className="h-4 w-4" /> {a.due_date}
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-lg text-gray-500 mt-1 leading-relaxed">{a.description}</p>
                  )}

                  {sub ? (
                    <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-lg text-emerald-800 flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="h-5 w-5" /> ส่งแล้ว: {sub.file_name}
                      </span>
                      {sub.score != null && (
                        <span>
                          คะแนน: <b>{sub.score}</b>/{a.points_possible}
                        </span>
                      )}
                      {sub.feedback && (
                        <span className="text-emerald-700/80">ความเห็น: {sub.feedback}</span>
                      )}
                    </div>
                  ) : (
                    <label className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/60 px-3 py-4 text-lg font-medium text-violet-600 cursor-pointer hover:bg-violet-50 active:scale-[0.98] transition-all">
                      <UploadCloud className="h-5 w-5" />
                      {uploadingId === a.id ? "กำลังอัปโหลด..." : "แตะเพื่อส่งงาน"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingId === a.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(a.id, file);
                        }}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Pending */}
        {tab === "pending" && !loading && (
          <ul className="space-y-3">
            {pendingAssignments.length === 0 && !errorMsg && (
              <EmptyState icon={<PartyPopper className="h-10 w-10 text-amber-400" />} text="เยี่ยม! ไม่มีงานค้างส่งเลย 🎉" />
            )}
            {pendingAssignments.map((a) => (
              <li
                key={a.id}
                className="bg-white rounded-3xl p-4 shadow-sm border-2 border-gray-100 flex items-center gap-3"
              >
                <div className="h-11 w-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-xl text-gray-800">{a.title}</p>
                  {a.due_date && (
                    <p className="text-base text-gray-400">กำหนดส่ง: {a.due_date}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Grades */}
        {tab === "grades" && !loading && grades && (
          <div>
            <div className="mb-4 p-5 rounded-3xl bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white shadow-lg">
              <p className="text-lg text-white/80">คะแนนรวม (ถ่วงน้ำหนัก)</p>
              <p className="text-5xl font-extrabold mt-1">{grades.summary.weighted_score}%</p>
              <div className="mt-3 h-3 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${Math.min(grades.summary.weight_graded, 100)}%` }}
                />
              </div>
              <p className="text-base text-white/70 mt-1">
                ตรวจแล้ว {grades.summary.weight_graded}% ของคะแนนทั้งหมด
              </p>
            </div>
            <ul className="space-y-2">
              {grades.grades.map((g: any, i: number) => (
                <li
                  key={i}
                  className="flex justify-between items-center bg-white rounded-2xl px-4 py-3 shadow-sm border-2 border-gray-100 text-lg"
                >
                  <span className="text-gray-700">{g.title}</span>
                  <span className="font-semibold text-violet-600">
                    {g.score}/{g.max_score}{" "}
                    <span className="text-gray-400 font-normal text-base">(น้ำหนัก {g.weight_percent}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Attendance */}
        {tab === "attendance" && !loading && attendance && (
          <div>
            <div className="mb-4 grid grid-cols-4 gap-2 text-center">
              {(["present", "absent", "late", "leave"] as const).map((key) => {
                const style = STATUS_STYLES[key];
                const value =
                  key === "leave"
                    ? attendance.summary.leave ?? attendance.summary.excused
                    : attendance.summary[key];
                return (
                  <div key={key} className={`rounded-2xl p-3 ${style.bg}`}>
                    <p className="text-xl">{style.emoji}</p>
                    <p className={`text-2xl font-bold ${style.text}`}>{value ?? 0}</p>
                    <p className={`text-base ${style.text}`}>{style.label}</p>
                  </div>
                );
              })}
            </div>
            <ul className="space-y-1.5">
              {(attendance.records ?? []).map((r: any) => {
                const style = STATUS_STYLES[r.status] ?? STATUS_STYLES.present;
                return (
                  <li
                    key={r.id}
                    className="flex justify-between items-center bg-white rounded-2xl px-4 py-3 shadow-sm border-2 border-gray-100 text-lg"
                  >
                    <span className="text-gray-600">{r.date ?? r.attendance_date}</span>
                    <span className={`px-3 py-1 rounded-full text-base font-semibold ${style.bg} ${style.text}`}>
                      {style.emoji} {style.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {icon ?? <FileText className="h-10 w-10 text-gray-300" />}
      <p className="text-lg text-gray-400">{text}</p>
    </div>
  );
}