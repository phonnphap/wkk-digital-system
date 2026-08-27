"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";

type Tab = "assignments" | "pending" | "grades" | "attendance";
type GradingMode = "numeric" | "pass_fail";
type PassFailResult = "pass" | "fail" | null;

interface Submission {
  id: string;
  content: string | null;
  submitted_at: string;
  score: number | null;
  teacher_comment: string | null;
  status: string;
  is_late: boolean | null;
  // ★ FIX 1: ไฟล์ที่นักเรียนอัปโหลดส่งงาน ต้องมี URL เพื่อให้คลิกเปิด/ดาวน์โหลดได้
  file_url?: string | null;
  file_name?: string | null;
  // ★ FIX 3: ผลลัพธ์เมื่อ assignment เป็นโหมดผ่าน/ไม่ผ่าน
  pass_fail_result?: PassFailResult;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number | null;
  weight_percent?: number | null;
  submissions: Submission[];
  // ★ FIX 3: โหมดการให้คะแนนของงานชิ้นนี้
  grading_mode?: GradingMode;
}

interface GradeRow {
  assignment_id: string;
  title: string;
  score: number | null;
  max_score: number | null;
  weight_percent: number | null;
  percentage: number | null;
  is_late: boolean;
  // ★ FIX 3
  grading_mode?: GradingMode;
  pass_fail_result?: PassFailResult;
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

// ★ FIX 1: helper เผื่อกรณี content เป็น URL ตรง ๆ (เก็บมาแบบเก่าก่อนมี file_url)
function looksLikeUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export default function StudentPortalSubjectPage() {
  const router = useRouter();
  const { studentId, sectionId } = useParams() as { studentId: string; sectionId: string };

  const [tab, setTab] = useState<Tab>("assignments");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<{
    grades: GradeRow[];
    summary: { weighted_score: number; weight_graded: number; grade: string | null };
  } | null>(null);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-fuchsia-50/40 font-['TH_Sarabun_New',_sans-serif] pb-16">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* ปุ่มย้อนกลับ */}
        <button
          onClick={() => router.push(`/student-portal/${studentId}`)}
          className="flex items-center gap-2 text-base font-bold text-slate-500 hover:text-fuchsia-600 mb-5 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" /> กลับตารางเรียน
        </button>

        {/* แท็บ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex items-center gap-2 flex-wrap mb-6">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-xl font-black text-sm sm:text-base transition-colors ${
                tab === t.key
                  ? "bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="text-lg">{t.icon}</span>
              {t.label}
              {t.key === "pending" && pendingAssignments.length > 0 && (
                <span
                  className={`ml-0.5 px-2 py-0.5 rounded-full text-xs font-black ${
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
          <div className="text-center py-12 text-fuchsia-400 font-black text-base animate-pulse">
            กำลังโหลดข้อมูล...
          </div>
        )}

        {/* งานที่มอบหมาย/ส่งงาน */}
        {tab === "assignments" && !loading && (
          <div className="space-y-4">
            {assignments.length === 0 ? (
              <EmptyState icon="📋" text="ยังไม่มีงานที่มอบหมายในวิชานี้" />
            ) : (
              assignments.map((a) => {
                const sub = a.submissions[0];
                const late = !!sub?.is_late;
                const isPassFail = a.grading_mode === "pass_fail";
                return (
                  <div
                    key={a.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0 bg-gradient-to-br from-indigo-500 to-blue-500">
                          📄
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-800 text-lg truncate">{a.title}</p>
                          {a.description && (
                            <p className="text-slate-500 text-sm font-bold mt-1 line-clamp-2">
                              {a.description}
                            </p>
                          )}
                          <p className="text-slate-400 text-xs font-bold mt-1.5">
                            {a.due_date ? <>กำหนดส่ง {formatDate(a.due_date)}</> : "ไม่มีกำหนดส่ง"}
                          </p>
                        </div>
                      </div>

                      {/* คะแนนที่ได้ / สถานะ */}
                      <div className="shrink-0">
                        {!sub ? (
                          <span className="inline-block px-4 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-black">
                            ยังไม่ได้ส่ง
                          </span>
                        ) : isPassFail ? (
                          // ★ FIX 3: แสดงผลผ่าน/ไม่ผ่าน/รอตรวจ แทนตัวเลขคะแนน
                          sub.pass_fail_result === "pass" ? (
                            <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
                              <span className="text-base font-black text-emerald-600">✅ ผ่าน</span>
                              {late && <span className="text-[11px] font-black text-orange-500">⏰ ส่งช้า</span>}
                            </div>
                          ) : sub.pass_fail_result === "fail" ? (
                            <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-rose-50 border border-rose-100">
                              <span className="text-base font-black text-rose-600">❌ ไม่ผ่าน</span>
                              {late && <span className="text-[11px] font-black text-orange-500">⏰ ส่งช้า</span>}
                            </div>
                          ) : (
                            <span className="inline-block px-4 py-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 text-sm font-black">
                              ⏳ รอตรวจ
                            </span>
                          )
                        ) : sub.score !== null && sub.score !== undefined ? (
                          <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
                            <span className="text-lg font-black text-emerald-600">
                              {sub.score}
                              <span className="text-emerald-400 font-bold text-sm">/{a.max_score ?? "-"}</span>
                            </span>
                            {late && <span className="text-[11px] font-black text-orange-500">⏰ ส่งช้า</span>}
                          </div>
                        ) : (
                          <span className="inline-block px-4 py-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 text-sm font-black">
                            ⏳ รอตรวจ
                          </span>
                        )}
                      </div>
                    </div>

                    {sub ? (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                        {/* ★ FIX 1: ไฟล์ที่ส่ง แสดงเป็นลิงก์คลิกได้จริง */}
                        {sub.file_url ? (
                          <a
                            href={sub.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-black text-indigo-600 hover:text-indigo-700 hover:underline break-all"
                          >
                            <Paperclip className="h-4 w-4 shrink-0" />
                            {sub.file_name || "เปิดไฟล์ที่ส่ง"}
                          </a>
                        ) : looksLikeUrl(sub.content) ? (
                          <a
                            href={sub.content as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-black text-indigo-600 hover:text-indigo-700 hover:underline break-all"
                          >
                            <Paperclip className="h-4 w-4 shrink-0" />
                            เปิดไฟล์ที่ส่ง
                          </a>
                        ) : (
                          sub.content && (
                            <p className="text-sm font-bold text-slate-600 whitespace-pre-wrap break-words">
                              {sub.content}
                            </p>
                          )
                        )}
                        <p className="text-xs text-slate-400 font-bold mt-1">
                          ส่งเมื่อ {formatDate(sub.submitted_at)}
                        </p>
                        {sub.teacher_comment && (
                          <p className="text-sm font-bold text-indigo-600 mt-2 bg-indigo-50 rounded-lg px-3 py-2">
                            💬 {sub.teacher_comment}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-3">
                        <label
                          className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm cursor-pointer transition-colors ${
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
                          <span className="text-sm font-bold text-slate-400 animate-pulse">
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
          <div className="space-y-4">
            {pendingAssignments.length === 0 ? (
              <EmptyState icon="🎉" text="ไม่มีงานค้างส่ง เยี่ยมมาก!" />
            ) : (
              pendingAssignments.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5 flex items-center gap-4"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0 bg-gradient-to-br from-rose-400 to-orange-400">
                    ⏰
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-800 text-lg truncate">{a.title}</p>
                    <p className="text-rose-400 text-sm font-bold mt-1">
                      กำหนดส่ง: {formatDate(a.due_date)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* คะแนนรวม — ★ ปรับให้เป็นตารางแบบครู แต่เห็นเฉพาะข้อมูลตัวเอง */}
        {tab === "grades" && !loading && grades && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white p-6 shadow-sm flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm font-bold opacity-90">คะแนนรวม (ถ่วงน้ำหนักจากงานที่มอบหมาย)</p>
                <p className="text-4xl font-black mt-1">{grades.summary.weighted_score}%</p>
                <p className="text-xs font-bold opacity-80 mt-1.5">
                  ตรวจแล้ว {grades.summary.weight_graded}% ของน้ำหนักคะแนนทั้งหมด
                </p>
                {/* ★ FIX 2: ชี้แจงขอบเขตของตัวเลขคะแนนรวม */}
                <p className="text-[11px] font-bold opacity-75 mt-1">
                  * ยังไม่รวมคะแนนสอบกลางภาค/ปลายภาค
                </p>
              </div>
              {grades.summary.grade && (
                <div className="text-center bg-white/15 rounded-2xl px-6 py-3">
                  <p className="text-xs font-bold opacity-90">เกรด</p>
                  <p className="text-3xl font-black mt-0.5">{grades.summary.grade}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {grades.grades.length === 0 ? (
                <p className="text-center text-slate-300 font-bold text-base py-10">
                  ยังไม่มีคะแนนที่ตรวจแล้ว
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-indigo-50 via-sky-50 to-fuchsia-50">
                      <th className="text-left text-xs font-black text-slate-500 px-5 py-3">ชื่องาน</th>
                      <th className="text-center text-xs font-black text-slate-500 px-3 py-3">คะแนน</th>
                      <th className="text-center text-xs font-black text-slate-500 px-3 py-3">น้ำหนัก</th>
                      <th className="text-center text-xs font-black text-slate-500 px-3 py-3">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {grades.grades.map((g) => {
                      const isPassFail = g.grading_mode === "pass_fail";
                      return (
                        <tr key={g.assignment_id}>
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-bold text-slate-700">{g.title}</p>
                          </td>
                          <td className="text-center px-3 py-3.5">
                            {isPassFail ? (
                              // ★ FIX 3: แสดงป้ายผ่าน/ไม่ผ่านในตารางคะแนนรวมด้วย
                              <span
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-sm ${
                                  g.pass_fail_result === "pass"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : g.pass_fail_result === "fail"
                                    ? "bg-rose-50 text-rose-600"
                                    : "bg-amber-50 text-amber-600"
                                }`}
                              >
                                {g.pass_fail_result === "pass"
                                  ? "✅ ผ่าน"
                                  : g.pass_fail_result === "fail"
                                  ? "❌ ไม่ผ่าน"
                                  : "⏳ รอตรวจ"}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl font-black text-sm ${
                                  g.is_late
                                    ? "bg-orange-50 text-orange-600"
                                    : "bg-emerald-50 text-emerald-600"
                                }`}
                              >
                                {g.score ?? "-"}
                                <span className="text-slate-400 font-bold text-xs">/{g.max_score ?? "-"}</span>
                              </span>
                            )}
                          </td>
                          <td className="text-center px-3 py-3.5 text-sm font-bold text-slate-500">
                            {g.weight_percent != null ? `${g.weight_percent}%` : "-"}
                          </td>
                          <td className="text-center px-3 py-3.5">
                            {g.is_late ? (
                              <span className="text-[11px] font-black text-orange-500">⏰ ส่งช้า</span>
                            ) : (
                              <span className="text-[11px] font-black text-emerald-500">✅ ตรงเวลา</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* เช็คชื่อ */}
        {tab === "attendance" && !loading && attendance && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-3">
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
                <p className="text-center text-slate-300 font-bold text-base py-10">
                  ยังไม่มีข้อมูลการเช็คชื่อ
                </p>
              ) : (
                attendance.records.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-base font-bold text-slate-600">
                      {r.date ?? r.attendance_date}
                    </span>
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
    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="font-bold text-base">{text}</p>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colorClass} p-4 text-white shadow-sm text-center`}>
      <p className="text-2xl font-black">{value ?? 0}</p>
      <p className="text-xs font-bold opacity-90 mt-1">{label}</p>
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
    <span className={`px-3 py-1.5 rounded-full text-sm font-black ${s.className}`}>{s.label}</span>
  );
}