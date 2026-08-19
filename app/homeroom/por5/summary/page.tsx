"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InsightsTool from "@/components/insights/InsightsTool";

const supabase = createClient();

type Classroom = { classroom_id: string; room_name: string };
type Student = { id: string; prefix?: string; first_name: string; last_name: string; nick_name?: string; seat_number: number; avatar_url?: string };
type SectionInfo = { id: string; subject_id: string; subject_code: string; subject_name: string };

type GradeCell = { grandTotal: number; percentage: number; grade: string };
type AttendCell = { present: number; total: number };

type ViewTab = "grades" | "attendance" | "insights";

export default function Por5SummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [tab, setTab] = useState<ViewTab>("grades");
  const [loadingData, setLoadingData] = useState(false);
  const [gradeMatrix, setGradeMatrix] = useState<Record<string, Record<string, GradeCell>>>({});
  const [attendMatrix, setAttendMatrix] = useState<Record<string, Record<string, AttendCell>>>({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
        if (profile) setCurrentUserId(profile.id);
      }
      const { data } = await supabase.rpc("get_my_classrooms");
      const rows = (data ?? []) as Classroom[];
      setClassrooms(rows);
      if (rows.length === 1) setSelectedClassroom(rows[0]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedClassroom) return;
    (async () => {
      setLoadingData(true);

      const { data: studentsData } = await supabase
        .from("students")
        .select("id, prefix, first_name, last_name, nick_name, seat_number, avatar_url")
        .eq("classroom_id", selectedClassroom.classroom_id)
        .order("seat_number");
      const studentRows = (studentsData ?? []) as Student[];
      setStudents(studentRows);

      const { data: sectionRows } = await supabase
        .from("subject_sections")
        .select("id, subject_id, is_active, subjects(subject_code, name_th)")
        .eq("classroom_id", selectedClassroom.classroom_id)
        .eq("is_active", true);

      const secs: SectionInfo[] = (sectionRows ?? []).map((r: any) => ({
        id: r.id,
        subject_id: r.subject_id,
        subject_code: r.subjects?.subject_code ?? "",
        subject_name: r.subjects?.name_th ?? "ไม่ทราบชื่อวิชา",
      })).sort((a: SectionInfo, b: SectionInfo) => a.subject_name.localeCompare(b.subject_name, "th"));
      setSections(secs);

      const gMatrix: Record<string, Record<string, GradeCell>> = {};
      const aMatrix: Record<string, Record<string, AttendCell>> = {};
      studentRows.forEach(s => { gMatrix[s.id] = {}; aMatrix[s.id] = {}; });

      await Promise.all(secs.map(async (sec) => {
        try {
          const res = await fetch(`/api/subject-grades/summary?subject_section_id=${sec.id}`);
          const json = await res.json();
          const assignments = json.assignments ?? [];
          const submissions = json.submissions ?? [];
          const scoreEvents = json.scoreEvents ?? [];
          const criteria = json.criteria ?? [];
          const totalMax = assignments.reduce((s: number, a: any) => s + (a.max_score ?? 0), 0);
          const sortedCriteria = [...criteria].sort((a: any, b: any) => b.min_percent - a.min_percent);

          studentRows.forEach(s => {
            const assignmentTotal = assignments.reduce((sum: number, a: any) => {
              const sub = submissions.find((x: any) => x.assignment_id === a.id && x.student_id === s.id);
              return sum + (sub?.score ?? 0);
            }, 0);
            const specialTotal = scoreEvents
              .filter((ev: any) => ev.student_id === s.id)
              .reduce((sum: number, ev: any) => sum + ev.points, 0);
            const grandTotal = assignmentTotal + specialTotal;
            const percentage = totalMax > 0 ? (assignmentTotal / totalMax) * 100 : 0;
            let grade = "-";
            for (const c of sortedCriteria) {
              if (percentage >= c.min_percent && percentage <= c.max_percent) { grade = c.grade; break; }
            }
            gMatrix[s.id][sec.id] = { grandTotal, percentage, grade };
          });
        } catch { /* ข้ามวิชานี้ถ้าดึงข้อมูลไม่สำเร็จ */ }

        try {
          const res = await fetch(`/api/subject-attendance/summary?subject_section_id=${sec.id}`);
          const json = await res.json();
          const dates: string[] = json.dates ?? [];
          const records = json.records ?? [];
          studentRows.forEach(s => {
            const presentCount = records.filter((r: any) => r.student_id === s.id && (r.status === "present" || r.status === "late")).length;
            aMatrix[s.id][sec.id] = { present: presentCount, total: dates.length };
          });
        } catch { /* ข้ามวิชานี้ถ้าดึงข้อมูลไม่สำเร็จ */ }
      }));

      setGradeMatrix(gMatrix);
      setAttendMatrix(aMatrix);
      setLoadingData(false);
    })();
  }, [selectedClassroom]);

  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const gradeRows = students.map(s => {
        const row: Record<string, string | number> = {
          "เลขที่": s.seat_number,
          "ชื่อ-นามสกุล": `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim(),
        };
        sections.forEach(sec => {
          const cell = gradeMatrix[s.id]?.[sec.id];
          row[sec.subject_name] = cell ? `${cell.grandTotal} (${cell.grade})` : "-";
        });
        return row;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gradeRows), "คะแนนรวมทุกวิชา");

      const attendRows = students.map(s => {
        const row: Record<string, string | number> = {
          "เลขที่": s.seat_number,
          "ชื่อ-นามสกุล": `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim(),
        };
        sections.forEach(sec => {
          const cell = attendMatrix[s.id]?.[sec.id];
          row[sec.subject_name] = cell && cell.total > 0 ? `${cell.present}/${cell.total}` : "-";
        });
        return row;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendRows), "การมาเรียนทุกวิชา");

      XLSX.writeFile(wb, `สรุปผล_${selectedClassroom?.room_name ?? ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      alert("ดาวน์โหลดไฟล์ไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 font-bold">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.push("/homeroom/por5")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">←</button>
        <h1 className="text-lg font-bold text-slate-800">ปพ.5 — สรุปผล</h1>
      </div>

      {!selectedClassroom ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {classrooms.map(c => (
            <button key={c.classroom_id} onClick={() => setSelectedClassroom(c)}
              className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg transition">
              <p className="font-bold text-slate-800">ห้อง {c.room_name}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-4 mb-4 print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              {classrooms.length > 1 && (
                <button onClick={() => setSelectedClassroom(null)} className="text-xs font-bold text-blue-600 underline">← เปลี่ยนห้อง</button>
              )}
              <span className="text-sm font-black text-slate-600">ห้อง {selectedClassroom.room_name}</span>
              <button onClick={() => setTab("grades")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "grades" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                ⭐ คะแนนรวมทุกวิชา
              </button>
              <button onClick={() => setTab("attendance")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "attendance" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                🗓️ การมาเรียนทุกวิชา
              </button>
              <button onClick={() => setTab("insights")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "insights" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                📊 ข้อมูลเชิงลึก
              </button>
            </div>
            {tab !== "insights" && (
              <div className="flex items-center gap-2">
                <button onClick={handleExportExcel} disabled={exporting || loadingData}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm disabled:opacity-50">
                  📊 {exporting ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด"}
                </button>
                <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm">
                  🖨️ พิมพ์
                </button>
              </div>
            )}
          </div>

          {tab === "insights" ? (
            <InsightsTool currentUserId={currentUserId} classroomId={selectedClassroom.classroom_id} />
          ) : loadingData ? (
            <p className="text-slate-400 text-sm">กำลังโหลดข้อมูลทุกวิชา...</p>
          ) : sections.length === 0 ? (
            <p className="text-slate-400 text-sm">ยังไม่พบวิชาที่เปิดสอนให้ห้องนี้</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left text-[11px] font-black text-slate-500 px-5 py-3 sticky left-0 bg-slate-50 z-10">รายชื่อ</th>
                    {sections.map(sec => (
                      <th key={sec.id} className="px-3 py-3 text-center min-w-[110px]">
                        <p className="text-[11px] font-black text-slate-700 truncate max-w-[110px] mx-auto" title={sec.subject_name}>{sec.subject_name}</p>
                        <p className="text-[9px] text-slate-300 font-bold">{sec.subject_code}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 sticky left-0 bg-white z-10">
                        <p className="text-xs font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                      </td>
                      {sections.map(sec => {
                        if (tab === "grades") {
                          const cell = gradeMatrix[s.id]?.[sec.id];
                          return (
                            <td key={sec.id} className="text-center px-3 py-3">
                              {cell ? (
                                <div className="flex flex-col items-center">
                                  <span className="text-sm font-black text-slate-700">{cell.grandTotal}</span>
                                  <span className="text-[10px] font-black text-fuchsia-500">{cell.grade}</span>
                                </div>
                              ) : <span className="text-slate-200 text-xs">-</span>}
                            </td>
                          );
                        }
                        const cell = attendMatrix[s.id]?.[sec.id];
                        return (
                          <td key={sec.id} className="text-center px-3 py-3">
                            {cell && cell.total > 0 ? (
                              <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-black ${
                                cell.present / cell.total >= 0.8 ? "bg-emerald-50 text-emerald-600" : cell.present / cell.total >= 0.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                              }`}>
                                {cell.present}/{cell.total}
                              </span>
                            ) : <span className="text-slate-200 text-xs">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}