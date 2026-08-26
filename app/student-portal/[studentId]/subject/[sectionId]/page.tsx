"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Tab = "assignments" | "pending" | "grades" | "attendance";

interface StudentPortalClientProps {
  studentId: string;
  sectionId?: string; // ★ ถ้าไม่มีค่า = โหมดดูตารางรวม (ไม่ใช้ในหน้านี้ แต่กันไว้)
}

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

export default function StudentPortalClient({ studentId, sectionId }: StudentPortalClientProps) {
  const router = useRouter();
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
    <div className="max-w-3xl mx-auto p-4">
      {/* ★ ปุ่มย้อนกลับไปตารางเรียนรวม */}
      <button
        onClick={() => router.push(`/student-portal/${studentId}`)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> กลับตารางเรียน
      </button>

      <nav className="flex gap-2 border-b mb-4">
        {[
          { key: "assignments", label: "งานที่มอบหมาย/ส่งงาน" },
          { key: "pending", label: "งานที่ยังไม่ส่ง" },
          { key: "grades", label: "คะแนนรวม" },
          { key: "attendance", label: "เช็คชื่อ" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`px-3 py-2 text-sm ${
              tab === t.key ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      {tab === "assignments" && !loading && (
        <ul className="space-y-3">
          {assignments.map((a) => {
            const sub = a.submissions[0];
            return (
              <li key={a.id} className="border rounded p-3">
                <div className="flex justify-between">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-xs text-gray-400">{a.due_date}</span>
                </div>
                {a.description && <p className="text-sm text-gray-600 mt-1">{a.description}</p>}

                {sub ? (
                  <div className="mt-2 text-sm">
                    <p>ส่งแล้ว: {sub.file_name}</p>
                    {sub.score != null && <p>คะแนน: {sub.score}/{a.points_possible}</p>}
                    {sub.feedback && <p className="text-gray-500">ความเห็น: {sub.feedback}</p>}
                  </div>
                ) : (
                  <div className="mt-2">
                    <input
                      type="file"
                      disabled={uploadingId === a.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(a.id, file);
                      }}
                    />
                    {uploadingId === a.id && <span className="text-xs ml-2">กำลังอัปโหลด...</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "pending" && !loading && (
        <ul className="space-y-2">
          {pendingAssignments.length === 0 && (
            <p className="text-sm text-gray-400">ไม่มีงานค้างส่ง 🎉</p>
          )}
          {pendingAssignments.map((a) => (
            <li key={a.id} className="border rounded p-3">
              <span className="font-medium">{a.title}</span>
              <span className="text-xs text-gray-400 block">กำหนดส่ง: {a.due_date}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "grades" && !loading && grades && (
        <div>
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="font-medium">
              คะแนนรวม (ถ่วงน้ำหนัก): {grades.summary.weighted_score}%
            </p>
            <p className="text-xs text-gray-400">
              ตรวจแล้ว {grades.summary.weight_graded}% ของคะแนนทั้งหมด
            </p>
          </div>
          <ul className="space-y-2">
            {grades.grades.map((g: any, i: number) => (
              <li key={i} className="flex justify-between border-b py-1 text-sm">
                <span>{g.title}</span>
                <span>{g.score}/{g.max_score} (น้ำหนัก {g.weight_percent}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "attendance" && !loading && attendance && (
        <div>
          <div className="mb-4 grid grid-cols-4 gap-2 text-center text-sm">
            <div className="p-2 bg-green-50 rounded">มา {attendance.summary.present}</div>
            <div className="p-2 bg-red-50 rounded">ขาด {attendance.summary.absent}</div>
            <div className="p-2 bg-yellow-50 rounded">สาย {attendance.summary.late}</div>
            <div className="p-2 bg-blue-50 rounded">ลา {attendance.summary.excused ?? attendance.summary.leave}</div>
          </div>
          <ul className="space-y-1">
            {attendance.records.map((r: any) => (
              <li key={r.id} className="flex justify-between text-sm border-b py-1">
                <span>{r.date ?? r.attendance_date}</span>
                <span>{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}