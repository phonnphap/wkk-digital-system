"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Paperclip, LogOut } from "lucide-react";
import GradeOverviewTool from "@/components/attendance/GradeOverviewTool"; 
// ★ ใช้ util กลางเพื่อคำนวณคำนำหน้าจากอายุ+เพศ
import { getDisplayPrefix } from "@/lib/student-prefix";

type Tab = "assignments" | "pending" | "grades" | "attendance";
type GradingMode = "numeric" | "pass_fail";
type PassFailResult = "pass" | "fail" | null;
type AttachmentKind = "file" | "link" | "text";

type SubmissionAttachment = {
  id: string;
  kind: AttachmentKind;
  url: string | null;
  content: string | null;
  file_name: string | null;
  created_at: string;
};
type SubmissionComment = {
  id: string;
  author_role: "student" | "teacher";
  author_name: string | null;
  content: string;
  created_at: string;
};
interface Submission {
  id: string;
  content: string | null;
  submitted_at: string;
  score: number | null;
  teacher_comment: string | null;
  status: string;
  is_late: boolean | null;
  is_submitted?: boolean;
  file_url?: string | null;
  file_name?: string | null;
  pass_fail_result?: PassFailResult;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  created_at?: string | null;
  max_score: number | null;
  weight_percent?: number | null;
  submissions: Submission[];
  grading_mode?: GradingMode;
}

// ★ ข้อมูลรายวิชาสำหรับแบนเนอร์ด้านบน
// หมายเหตุ: สมมติว่ามี endpoint นี้ ถ้ายังไม่มีฝั่ง backend ต้องเพิ่มให้ตรงกัน
interface SubjectInfo {
  subject_name: string;
  class_name?: string | null;
  academic_year?: string | null;
  class_code?: string | null;
  class_room_label?: string | null;  
  homeroom_teacher_name?: string | null;
  subject_teacher_name?: string | null;
  grading_mode?: "numeric" | "pass_fail";
  pass_threshold_percent?: number;
  grading_structure?: "formative_final" | "formative_midterm_final";
  formative_max_score?: number;
  midterm_max_score?: number;
  final_max_score?: number;
}

const TAB_ITEMS: { key: Tab; label: string; icon: string }[] = [
  { key: "assignments", label: "งานของฉัน", icon: "📌" },
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
type GradeStudent = {
  id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  nick_name?: string;
  seat_number: number;
  // ★ เพิ่ม: ต้องให้ /api/student-portal/timetable ส่งสองฟิลด์นี้มาด้วย
  // เพื่อคำนวณคำนำหน้าอัตโนมัติจากอายุปัจจุบัน ถ้าไม่มีข้อมูลจะ fallback ไปใช้ prefix เดิม
  birth_date?: string | null;
  gender?: string | null;
};

// ★ วันที่แบบสั้น สำหรับหัวคอลัมน์ตารางเช็คชื่อ เช่น "06 ส.ค. 69"
function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return "-";
  }
}

function looksLikeUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^https?:\/\/\S+$/i.test(text.trim());
}

// ★ ฟีเจอร์เสริม (อ้างอิงจากภาพตัวอย่าง): badge นับเวลาถึงกำหนดส่ง / เลยกำหนดแล้วกี่วัน
function getDueStatus(due_date: string | null | undefined): { label: string; className: string } | null {
  if (!due_date) return null;
  const due = new Date(due_date).getTime();
  if (Number.isNaN(due)) return null;
  const now = Date.now();
  const diffMs = due - now;
  const diffDays = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    return {
      label: diffDays === 0 ? "เลยกำหนดวันนี้ 😟" : `เลยกำหนดแล้ว ${diffDays} วัน 😟`,
      className: "bg-rose-50 text-rose-600",
    };
  }
  if (diffDays === 0) {
    return { label: "กำหนดส่งวันนี้ ⏰", className: "bg-amber-50 text-amber-600" };
  }
  return { label: `เหลืออีก ${diffDays} วัน`, className: "bg-emerald-50 text-emerald-600" };
}

// ★ เพิ่มใหม่: เช็คว่างานนี้ "ปิดรับส่ง" แล้วหรือยัง (เลยกำหนดส่ง + ครูปิดอนุญาตส่งย้อนหลัง)
// งานที่ไม่มีกำหนดส่ง (due_date เป็น null) จะไม่ถูกล็อกเลย ส่งได้ตลอด
function isSubmissionClosed(dueDate: string | null | undefined, allowLateSubmission: boolean): boolean {
  if (allowLateSubmission) return false;
  if (!dueDate) return false;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return false;
  return due < Date.now();
}

export default function StudentPortalSubjectPage() {
  const router = useRouter();
  const { studentId, sectionId } = useParams() as { studentId: string; sectionId: string };

  const [tab, setTab] = useState<Tab>("assignments");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  // ★ เพิ่มใหม่: ค่าตั้งค่า "อนุญาตให้ส่งงานย้อนหลัง" ของวิชานี้ ดึงมาจาก API ตอนโหลดงาน
  // default true ไว้ก่อนโหลดเสร็จ กันฟอร์มกระพริบล็อกๆ เปิดๆ ระหว่างรอข้อมูล
  const [allowLateSubmission, setAllowLateSubmission] = useState(true);
  const [attendance, setAttendance] = useState<any>(null);
  const [subjectInfo, setSubjectInfo] = useState<SubjectInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [selfStudent, setSelfStudent] = useState<GradeStudent | null>(null);

  const fetchAssignments = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    const res = await fetch(
      `/api/student-portal/assignments?student_id=${studentId}&subject_section_id=${sectionId}`
    );
    const data = await res.json();
    if (res.ok) {
      setAssignments(data.assignments ?? []);
      // ★ เพิ่มใหม่: เก็บค่า allow_late_submission ที่ API ส่งมาด้วย
      setAllowLateSubmission(data.allow_late_submission ?? true);
    }
    setLoading(false);
  }, [studentId, sectionId]);

  const fetchAttendance = useCallback(async () => {
  if (!sectionId) return;
  setLoading(true);
  // ★ เปลี่ยนมาดึงเช็คชื่อ "รายวิชา" (ตรงกับที่ครูเห็น) แทนเช็คชื่อโฮมรูม
  const res = await fetch(`/api/subject-attendance/summary?subject_section_id=${sectionId}`);
  const data = await res.json();
  console.log("timetable API response:", data); 
  if (res.ok) {
    const allRecords: { student_id: string; attendance_date: string; status: string }[] =
      data.records ?? [];
    const myRecords = allRecords.filter((r) => r.student_id === studentId);

    const summary = { present: 0, absent: 0, late: 0, excused: 0 };
    myRecords.forEach((r) => {
      if (r.status === "present") summary.present++;
      else if (r.status === "absent") summary.absent++;
      else if (r.status === "late") summary.late++;
      else if (r.status === "leave" || r.status === "excused") summary.excused++;
    });

    setAttendance({
      summary,
      records: myRecords.map((r) => ({
        id: `${r.student_id}-${r.attendance_date}`,
        date: r.attendance_date,
        status: r.status,
      })),
    });
  }
  setLoading(false);
}, [studentId, sectionId]);

// ★ ดึงข้อมูลรายวิชา/ตัวนักเรียน จาก endpoint ตารางเรียนเดียวกับหน้า dashboard
// (แทนที่ /api/student-portal/subject-section ที่ยังไม่มีจริง -> 404)
const fetchSubjectInfo = useCallback(async () => {
  if (!sectionId) return;
  try {
    const res = await fetch(`/api/student-portal/timetable?student_id=${studentId}`);
    if (!res.ok) return;
    const data = await res.json();

    const sections: any[] = data.sections ?? [];
    const matched = sections.find((s) => s.id === sectionId);

    const classroom = data.classroom;
const classLabel = classroom?.grade_group
  ? `${classroom.grade_group}${classroom.room_name ? `/${classroom.room_name}` : ""}`
  : (classroom?.room_name ?? null);

setSubjectInfo({
  subject_name: matched?.subject?.name_th ?? "",
  class_code: matched?.subject?.subject_code ?? null,
  class_name: classLabel,
  class_room_label: classroom?.room_name ?? null,   // ★ เก็บแค่ "ป.3/1"
  academic_year: data.academic_year ?? null,
});

    // ★ เก็บข้อมูลตัวนักเรียนไว้ใช้ส่งต่อให้ GradeOverviewTool (ข้อ 2.2)
    // ★ เพิ่ม birth_date/gender เพื่อให้คำนวณคำนำหน้าอัตโนมัติได้ทั้งหน้านี้และใน GradeOverviewTool
    if (data.student) {
      setSelfStudent({
        id: data.student.id,
        prefix: data.student.prefix,
        first_name: data.student.first_name,
        last_name: data.student.last_name,
        nick_name: data.student.nick_name ?? data.student.first_name,
        seat_number: Number(data.student.seat_number) || 0,
        birth_date: data.student.birth_date ?? null,
        gender: data.student.gender ?? null,
      });
    }
  } catch {
    // เงียบไว้ ไม่ให้กระทบหน้าอื่น
  }
}, [studentId, sectionId]);

useEffect(() => {
  fetchSubjectInfo();
}, [fetchSubjectInfo]);

  useEffect(() => {
  if (tab === "assignments" || tab === "pending") fetchAssignments();
  if (tab === "attendance") fetchAttendance();
}, [tab, fetchAssignments, fetchAttendance]);

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

  // ★ ออกจากระบบ: ล้างข้อมูล session ฝั่ง client แล้วพากลับหน้า login
  // หมายเหตุ: ปรับ path "/login" และการเคลียร์ token ให้ตรงกับระบบ auth จริงที่ใช้งาน
  const handleLogout = () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("ยืนยันออกจากระบบ?");
      if (!confirmed) return;
      localStorage.clear();
      sessionStorage.clear();
    }
    router.push("/login");
  };

  const pendingAssignments = assignments.filter((a) => a.submissions.length === 0);

  // ★ เรียงงานในแท็บ "งานของฉัน" ตามลำดับที่มอบหมาย (เก่า -> ใหม่ ตามวันกำหนดส่ง)
// งานที่ไม่มีกำหนดส่งจะถูกจัดไว้ท้ายสุด
const sortedAssignments = [...assignments].sort((a, b) => {
  const at = a.created_at ? new Date(a.created_at).getTime() : Infinity;
  const bt = b.created_at ? new Date(b.created_at).getTime() : Infinity;
  return at - bt;
});
  // ★ คำนวณสรุปการเช็คชื่อ (จำนวนขาด/ลา/สาย และ % การมาเรียน) ในแท็บเช็คชื่อ
  const attSummary = attendance?.summary ?? null;
  const attExcused = attSummary ? attSummary.excused ?? attSummary.leave ?? 0 : 0;
  const attTotal = attSummary
    ? (attSummary.present ?? 0) + (attSummary.absent ?? 0) + (attSummary.late ?? 0) + attExcused
    : 0;
  const attPercent = attTotal > 0 ? Math.round(((attSummary?.present ?? 0) / attTotal) * 100) : null;

  // ★ คำนำหน้าที่แสดงผลจริง คำนวณจากอายุ+เพศ (fallback เป็น prefix เดิมถ้าคำนวณไม่ได้)
  const selfDisplayPrefix = selfStudent
    ? getDisplayPrefix(selfStudent.gender, selfStudent.birth_date, selfStudent.prefix)
    : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-fuchsia-50/40 font-['TH_Sarabun_New',_sans-serif] pb-16">
      {/* ★ แบนเนอร์ด้านบน + ปุ่มย้อนกลับมุมบนซ้าย (เล็กลง) + ปุ่มออกจากระบบมุมบนขวา */}
      <div className="relative bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-400 pt-14 pb-8 px-4 sm:px-6 lg:px-8 rounded-b-[2rem] shadow-md">
        <button
          onClick={() => router.push(`/student-portal/${studentId}`)}
          aria-label="กลับตารางเรียน"
          className="absolute top-4 left-4 sm:left-6 lg:left-8 inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 active:scale-95 transition-all shadow-sm"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <button
          onClick={handleLogout}
          className="absolute top-4 right-4 sm:right-6 lg:right-8 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-m font-black hover:bg-white/30 active:scale-95 transition-all shadow-ml"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">ออกจากระบบ</span>
        </button>

        <div className="max-w-6xl mx-auto mt-2 flex items-start justify-between flex-wrap gap-4">
  {/* ฝั่งซ้าย: ชื่อวิชา + รหัสเข้ารายวิชา */}
  <div className="min-w-0">
    <p className="text-2xl sm:text-3xl font-black text-white truncate">
      รายวิชา{subjectInfo?.subject_name ? `: ${subjectInfo.subject_name}` : ""}
    </p>

    <div className="flex items-center gap-2 flex-wrap mt-3">
      {subjectInfo?.academic_year && (
        <span className="px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-bold backdrop-blur-sm">
          ปีการศึกษา: {subjectInfo.academic_year}
        </span>
      )}
      {subjectInfo?.class_code && (
        <span className="px-3 py-1.5 rounded-full bg-amber-300/90 text-amber-900 text-base font-black">
          รหัสรายวิชา: {subjectInfo.class_code}
        </span>
      )}
    </div>
  </div>

  {/* ฝั่งขวา: คำทักทาย ตัวใหญ่ */}
{selfStudent && (
  <div className="text-right mt-1 sm:mt-0 mr-0 sm:mr-14">
    <p className="text-2xl sm:text-3xl font-black text-white truncate">
      สวัสดี {selfDisplayPrefix}{selfStudent.first_name} {selfStudent.last_name}
    </p>
    <p className="text-lg sm:text-2xl font-black text-white/90 mt-1.5">
      {subjectInfo?.class_room_label ? `${subjectInfo.class_room_label} · ` : ""}เลขที่ {selfStudent.seat_number}
    </p>
  </div>
)}
</div>
</div> 

      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* ★ แท็บเมนู 4 อัน จัดกึ่งกลาง ตัวหนังสือใหญ่ขึ้น */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex items-center justify-center gap-2 flex-wrap mb-6 -mt-10 relative z-10">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-xl font-black text-base sm:text-lg transition-colors ${
                tab === t.key
                  ? "bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
              {t.key === "pending" && pendingAssignments.length > 0 && (
                <span
                  className={`ml-0.5 px-2.5 py-0.5 rounded-full text-sm font-black ${
                    tab === t.key ? "bg-white/25 text-white" : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {pendingAssignments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-12 text-fuchsia-500 font-black text-lg animate-pulse">
            กำลังโหลดข้อมูล...
          </div>
        )}

        {/* งานของฉัน */}
        {tab === "assignments" && !loading && (
          <div className="space-y-4">
            {sortedAssignments.length === 0 ? (
              <EmptyState icon="📋" text="ยังไม่มีงานที่มอบหมายในวิชานี้" />
            ) : (
              sortedAssignments.map((a) => {
                const sub = a.submissions[0];
                const late = !!sub?.is_late;
                const isPassFail = a.grading_mode === "pass_fail";
                const dueStatus = !sub ? getDueStatus(a.due_date) : null;
                // ★ เพิ่มใหม่: เช็คว่างานนี้ปิดรับส่งแล้วหรือยัง (เลยกำหนด + ครูปิดส่งย้อนหลัง)
                const closed = !sub && isSubmissionClosed(a.due_date, allowLateSubmission);
                return (
                  <div
                    key={a.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white shrink-0 bg-gradient-to-br from-indigo-500 to-blue-500">
                          📄
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 text-xl truncate">{a.title}</p>
                          {a.description && (
                            <p className="text-slate-600 text-base font-bold mt-1 line-clamp-2">
                              {a.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap mt-2">
{/* ★ วันที่มอบหมายงาน */}
{a.created_at && (
  <p className="text-slate-400 text-sm font-bold">
    มอบหมายเมื่อ {formatDate(a.created_at)}
  </p>
)}
<p className="text-slate-500 text-sm font-bold">
  {a.due_date ? <>กำหนดส่ง {formatDate(a.due_date)}</> : "ไม่มีกำหนดส่ง"}
</p>
                            {dueStatus && (
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-black ${dueStatus.className}`}
                              >
                                {dueStatus.label}
                              </span>
                            )}
                            {/* ★ เพิ่มใหม่: badge บอกว่าปิดรับส่งงานแล้ว */}
                            {closed && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-600">
                                🔒 ปิดรับส่งงานแล้ว
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ★ คะแนน/สถานะ ชิดขวา ตัวใหญ่ */}
                      <div className="shrink-0 ml-auto">
                        {!sub ? (
                          <span className="inline-block px-5 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-lg font-black">
                            ยังไม่ได้ส่ง
                          </span>
                        ) : isPassFail ? (
                          sub.pass_fail_result === "pass" ? (
                            <div className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                              <span className="text-xl font-black text-emerald-600">✅ ผ่าน</span>
                              {late && <span className="text-xs font-black text-orange-500">⏰ ส่งช้า</span>}
                            </div>
                          ) : sub.pass_fail_result === "fail" ? (
                            <div className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-rose-50 border border-rose-200">
                              <span className="text-xl font-black text-rose-600">❌ ไม่ผ่าน</span>
                              {late && <span className="text-xs font-black text-orange-500">⏰ ส่งช้า</span>}
                            </div>
                          ) : (
                            <span className="inline-block px-5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 text-lg font-black">
                              ⏳ รอตรวจ
                            </span>
                          )
                        ) : sub.score !== null && sub.score !== undefined ? (
                          <div className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <span className="text-3xl font-black text-emerald-600 leading-none">
                              {sub.score}
                              <span className="text-emerald-500 font-bold text-lg">/{a.max_score ?? "-"}</span>
                            </span>
                            {late && <span className="text-xs font-black text-orange-500 mt-1">⏰ ส่งช้า</span>}
                          </div>
                        ) : (
                          <span className="inline-block px-5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 text-lg font-black">
                            ⏳ รอตรวจ
                          </span>
                        )}
                      </div>
                    </div>

                    {sub ? (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                        {sub.file_url ? (
                          <a
                            href={sub.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-base font-black text-indigo-600 hover:text-indigo-700 hover:underline break-all"
                          >
                            <Paperclip className="h-5 w-5 shrink-0" />
                            {sub.file_name || "เปิดไฟล์ที่ส่ง"}
                          </a>
                        ) : looksLikeUrl(sub.content) ? (
                          <a
                            href={sub.content as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-base font-black text-indigo-600 hover:text-indigo-700 hover:underline break-all"
                          >
                            <Paperclip className="h-5 w-5 shrink-0" />
                            เปิดไฟล์ที่ส่ง
                          </a>
                        ) : (
                          sub.content && (
                            <p className="text-base font-bold text-slate-700 whitespace-pre-wrap break-words">
                              {sub.content}
                            </p>
                          )
                        )}
                        <p className="text-sm text-slate-500 font-bold mt-1.5">
                          ส่งเมื่อ {formatDate(sub.submitted_at)}
                        </p>
                        {sub.teacher_comment && (
                          <p className="text-base font-bold text-indigo-700 mt-2 bg-indigo-50 rounded-lg px-3 py-2">
                            💬 {sub.teacher_comment}
                          </p>
                        )}
                      </div>
                    ) : closed ? (
                      // ★ เพิ่มใหม่: แทนที่จะโชว์ฟอร์มส่งงาน ให้โชว์ข้อความปิดรับส่งแทน
                      // เมื่อเลยกำหนดส่งแล้วและครูปิด "อนุญาตให้ส่งงานย้อนหลัง" ไว้
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-center">
                        <p className="text-sm font-black text-slate-500">
                          🔒 เลยกำหนดส่งงานนี้แล้ว และครูปิดการส่งงานย้อนหลังไว้ ติดต่อครูผู้สอนหากต้องการส่งงานนี้
                        </p>
                      </div>
                    ) : (
                      <SubmissionPanel
  assignment={a}
  studentId={studentId}
  submission={a.submissions[0] ?? null}
  onChanged={fetchAssignments}
/>
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
              pendingAssignments.map((a) => {
                const dueStatus = getDueStatus(a.due_date);
                // ★ เพิ่มใหม่: badge เดียวกับแท็บ "งานของฉัน"
                const closed = isSubmissionClosed(a.due_date, allowLateSubmission);
                return (
                  <div
                    key={a.id}
                    className="bg-white rounded-2xl border border-rose-200 shadow-sm p-5"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white shrink-0 bg-gradient-to-br from-rose-400 to-orange-400">
                          ⏰
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 text-xl truncate">{a.title}</p>
                          
                          {a.description && (
                            <p className="text-slate-600 text-base font-bold mt-1 line-clamp-2">
                              {a.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap mt-2">
{/* ★ วันที่มอบหมายงาน */}
{a.created_at && (
  <p className="text-slate-400 text-sm font-bold">
    มอบหมายเมื่อ {formatDate(a.created_at)}
  </p>
)}
<p className="text-slate-500 text-sm font-bold">
  {a.due_date ? <>กำหนดส่ง {formatDate(a.due_date)}</> : "ไม่มีกำหนดส่ง"}
</p>
                            {dueStatus && (
                              <span className={`px-2.5 py-1 rounded-full text-xs font-black ${dueStatus.className}`}>
                                {dueStatus.label}
                              </span>
                            )}
                            {closed && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-600">
                                🔒 ปิดรับส่งงานแล้ว
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ★ แสดงคะแนนเต็มของงานนี้ */}
                      <div className="shrink-0 ml-auto">
                        <span className="inline-block px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-lg font-black">
                          เต็ม {a.max_score ?? "-"} คะแนน
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        )}

        {/* คะแนนรวม */}
{tab === "grades" && (
  <GradeOverviewTool
    sectionId={sectionId}
    subjectTitle={subjectInfo?.subject_name ?? ""}
    subjectCode={subjectInfo?.class_code ?? ""}
    academicYearLabel={subjectInfo?.academic_year ?? undefined}
    classroomLabel={subjectInfo?.class_name ?? undefined}
    homeroomTeacherName={subjectInfo?.homeroom_teacher_name ?? undefined}
    subjectTeacherName={subjectInfo?.subject_teacher_name ?? undefined}
    // ★ ส่ง prefix ที่คำนวณจากอายุ+เพศแล้วเข้าไปแทนค่า prefix ดิบ
    // เผื่อ GradeOverviewTool เอาไปแสดงชื่อนักเรียนตรงๆ โดยไม่คำนวณเอง
    students={selfStudent ? [{ ...selfStudent, prefix: selfDisplayPrefix }] : []}
    gradingMode={subjectInfo?.grading_mode ?? "numeric"}
    passThresholdPercent={subjectInfo?.pass_threshold_percent ?? 50}
    gradingStructure={subjectInfo?.grading_structure ?? "formative_midterm_final"}
    formativeMaxScore={subjectInfo?.formative_max_score ?? 70}
    midtermMaxScore={subjectInfo?.midterm_max_score ?? 0}
    finalMaxScore={subjectInfo?.final_max_score ?? 30}
    currentStudentId={studentId}
    hideActions  
    readOnly
  />
)}

        {/* เช็คชื่อ */}
        {tab === "attendance" && !loading && attendance && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard label="มา" value={attendance.summary.present} colorClass="from-emerald-500 to-teal-400" />
              <StatCard label="ขาด" value={attendance.summary.absent} colorClass="from-rose-500 to-red-400" />
              <StatCard label="สาย" value={attendance.summary.late} colorClass="from-amber-500 to-orange-400" />
              <StatCard
                label="ลา"
                value={attendance.summary.excused ?? attendance.summary.leave}
                colorClass="from-sky-500 to-blue-400"
              />
              {/* ★ การ์ดสรุป % การมาเรียนของวิชานี้ */}
              <StatCard
                label="% มาเรียน"
                value={attPercent}
                suffix="%"
                colorClass="from-fuchsia-500 to-pink-400"
              />
            </div>

            {/* ★ ตารางเช็คชื่อ: วันที่เป็นคอลัมน์ สถานะแสดงในแถวเดียว */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
              {attendance.records.length === 0 ? (
                <p className="text-center text-slate-400 font-bold text-lg py-10">
                  ยังไม่มีข้อมูลการเช็คชื่อ
                </p>
              ) : (
                <table className="w-full min-w-max border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-indigo-50 via-sky-50 to-fuchsia-50">
                      <th className="sticky left-0 z-10 bg-indigo-50 text-left text-sm font-black text-slate-600 px-5 py-3 min-w-[140px]">
                        รายการ
                      </th>
                      {attendance.records.map((r: any) => (
                        <th
                          key={r.id}
                          className="text-center text-sm font-black text-slate-600 px-4 py-3 min-w-[90px]"
                        >
                          {formatShortDate(r.date ?? r.attendance_date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="sticky left-0 z-10 bg-white text-base font-bold text-slate-800 px-5 py-3.5">
                        สถานะ
                      </td>
                      {attendance.records.map((r: any) => (
                        <td key={r.id} className="text-center px-4 py-3.5">
                          <StatusPill status={r.status} />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
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
    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500">
      <p className="text-5xl mb-3">{icon}</p>
      <p className="font-bold text-lg">{text}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass,
  suffix,
}: {
  label: string;
  value: number | null;
  colorClass: string;
  suffix?: string;
}) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colorClass} p-4 text-white shadow-sm text-center`}>
      <p className="text-3xl font-black">
        {value ?? 0}
        {suffix ?? ""}
      </p>
      <p className="text-sm font-bold opacity-95 mt-1">{label}</p>
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
  const s = STATUS_STYLE[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`px-4 py-2 rounded-full text-base font-black ${s.className}`}>{s.label}</span>
  );
}

function SubmissionPanel({
  assignment,
  studentId,
  submission,
  onChanged,
}: {
  assignment: Assignment;
  studentId: string;
  submission: Submission | null;
  onChanged: () => void;
}) {
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>([]);
  const [comments, setComments] = useState<SubmissionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkInput, setLinkInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isSubmitted = !!submission?.is_submitted;
  // ★ ลบได้เฉพาะตอนยังไม่ถูกตรวจ (ตรงกับเงื่อนไขฝั่ง API)
  const isLocked = submission ? ["reviewed", "needs_revision", "failed"].includes(submission.status) : false;

  async function loadExtras() {
    setLoading(true);
    try {
      const [attRes, cmtRes] = await Promise.all([
        fetch(`/api/student-portal/submission-attachments?assignment_id=${assignment.id}&student_id=${studentId}`),
        fetch(`/api/student-portal/submission-comments?assignment_id=${assignment.id}&student_id=${studentId}`),
      ]);
      const attJson = await attRes.json();
      const cmtJson = await cmtRes.json();
      setAttachments(attJson.attachments ?? []);
      setComments(cmtJson.comments ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  async function handleFileUpload(file: File) {
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("assignment_id", assignment.id);
      fd.append("student_id", studentId);
      fd.append("subject_section_id", assignment.id); // TODO: ถ้ามี sectionId แยก ให้ส่ง prop เข้ามาแทน assignment.id
      fd.append("file", file);
      const res = await fetch("/api/student-portal/submission-attachments", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แนบไฟล์ไม่สำเร็จ");
      await loadExtras();
    } catch (e: any) {
      alert(e?.message ?? "แนบไฟล์ไม่สำเร็จ");
    }
    setUploadingFile(false);
  }

  async function handleAddLink() {
    if (!linkInput.trim()) return;
    const res = await fetch("/api/student-portal/submission-attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment_id: assignment.id, student_id: studentId, kind: "link", url: linkInput.trim() }),
    });
    if (res.ok) {
      setLinkInput("");
      await loadExtras();
    }
  }

  async function handleAddText() {
    if (!textInput.trim()) return;
    const res = await fetch("/api/student-portal/submission-attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment_id: assignment.id, student_id: studentId, kind: "text", content: textInput.trim() }),
    });
    if (res.ok) {
      setTextInput("");
      await loadExtras();
    }
  }

  async function handleRemoveAttachment(id: string) {
    await fetch(`/api/student-portal/submission-attachments?id=${id}&student_id=${studentId}`, { method: "DELETE" });
    await loadExtras();
  }

  async function handleToggleConfirm(confirm: boolean) {
    setToggling(true);
    try {
      const res = await fetch("/api/student-portal/submission-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignment.id, student_id: studentId, confirm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "อัปเดตสถานะไม่สำเร็จ");
      onChanged();
    } catch (e: any) {
      alert(e?.message ?? "อัปเดตสถานะไม่สำเร็จ");
    }
    setToggling(false);
  }

  async function handleDeleteSubmission() {
    if (!confirm("ต้องการลบงานที่ส่งไว้ทั้งหมด (ไฟล์/ลิงก์/ข้อความ) ใช่หรือไม่?")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/student-portal/submission-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignment.id, student_id: studentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ลบไม่สำเร็จ");
      onChanged();
    } catch (e: any) {
      alert(e?.message ?? "ลบไม่สำเร็จ");
    }
    setDeleting(false);
  }

  async function handlePostComment() {
    if (!commentInput.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/student-portal/submission-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignment.id, student_id: studentId, content: commentInput.trim() }),
      });
      if (res.ok) {
        setCommentInput("");
        await loadExtras();
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-4">
      {/* ★ แนบไฟล์ / ลิงก์ / ข้อความ */}
      {!isLocked && (
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-black cursor-pointer hover:bg-slate-100">
            📎 แนบไฟล์
            <input
              type="file"
              disabled={uploadingFile}
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
          </label>
          {uploadingFile && <span className="text-xs font-bold text-slate-400 self-center">กำลังอัปโหลด...</span>}
        </div>
      )}

      {!isLocked && (
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px] flex gap-1.5">
            <input
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="แนบลิงก์ (https://...)"
              className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
            />
            <button onClick={handleAddLink} className="px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-black">เพิ่ม</button>
          </div>
        </div>
      )}

      {!isLocked && (
        <div className="flex gap-1.5">
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            rows={2}
            placeholder="แนบข้อความ..."
            className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold resize-none focus:border-indigo-400 focus:outline-none"
          />
          <button onClick={handleAddText} className="px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-black self-start">เพิ่ม</button>
        </div>
      )}

      {/* ★ รายการที่แนบไว้ */}
      {loading ? (
        <p className="text-xs text-slate-300 font-bold">กำลังโหลด...</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-slate-300 font-bold">ยังไม่มีไฟล์/ลิงก์/ข้อความที่แนบ</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
              {att.kind === "file" && (
                <a href={att.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-indigo-600 hover:underline truncate">
                  📎 {att.file_name}
                </a>
              )}
              {att.kind === "link" && (
                <a href={att.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-indigo-600 hover:underline truncate">
                  🔗 {att.url}
                </a>
              )}
              {att.kind === "text" && (
                <p className="text-sm font-bold text-slate-600 whitespace-pre-wrap">{att.content}</p>
              )}
              {!isLocked && (
                <button onClick={() => handleRemoveAttachment(att.id)} className="text-slate-300 hover:text-rose-500 shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ★ ปุ่มยืนยัน/ยกเลิกส่งงาน + ลบงาน */}
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
        {isSubmitted ? (
          <button
            onClick={() => handleToggleConfirm(false)}
            disabled={toggling || isLocked}
            title={isLocked ? "ครูตรวจงานนี้แล้ว ไม่สามารถยกเลิกได้" : undefined}
            className="px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 text-sm font-black disabled:opacity-50"
          >
            {toggling ? "..." : "↺ ยกเลิกการส่งงาน"}
          </button>
        ) : (
          <button
            onClick={() => handleToggleConfirm(true)}
            disabled={toggling}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black disabled:opacity-50"
          >
            {toggling ? "..." : "✅ ยืนยันการส่งงาน"}
          </button>
        )}
        {!isLocked && submission && (
          <button
            onClick={handleDeleteSubmission}
            disabled={deleting}
            className="px-4 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 text-sm font-black disabled:opacity-50"
          >
            {deleting ? "..." : "🗑️ ลบงานที่ส่ง"}
          </button>
        )}
        {isLocked && <span className="text-xs font-bold text-slate-400">🔒 ครูตรวจงานนี้แล้ว แก้ไข/ลบไม่ได้</span>}
      </div>

      {/* ★ คอมเมนต์ */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <p className="text-xs font-black text-slate-400">💬 คอมเมนต์</p>
        {comments.map(c => (
          <div key={c.id} className={`text-sm rounded-lg px-3 py-2 ${c.author_role === "teacher" ? "bg-indigo-50 text-indigo-700" : "bg-white border border-slate-100 text-slate-600"}`}>
            <p className="font-black text-xs">{c.author_role === "teacher" ? "👩‍🏫 ครู" : "🧑‍🎓 นักเรียน"}</p>
            <p className="font-bold mt-0.5 whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePostComment()}
            placeholder="พิมพ์คอมเมนต์..."
            className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
          />
          <button onClick={handlePostComment} disabled={posting} className="px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-black disabled:opacity-50">
            ส่ง
          </button>
        </div>
      </div>
    </div>
  );
}