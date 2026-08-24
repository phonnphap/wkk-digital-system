"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number; student_code?: string };

type ScoreRow = {
  student_id: string;
  unit_score: number | null;   // คะแนนหน่วยการเรียน
  midterm_score: number | null; // คะแนนกลางภาค
  remark: string | null;
};

export default function Vp2Report({
  sectionId,
  subjectId,
  academicYearId,
  subjectTitle,
  subjectCode,
  classroomLabel,
  students,
  currentUserId,
  readOnly,
  unitMaxScore,     // คะแนนเต็มหน่วยการเรียน (ถ้ามีตั้งไว้ในรายวิชา)
  midtermMaxScore,  // คะแนนเต็มกลางภาค
  onBack,
}: {
  sectionId: string;
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  classroomLabel?: string;
  students: Student[];
  currentUserId?: string;
  readOnly?: boolean;
  unitMaxScore?: number;
  midtermMaxScore?: number;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState("");     // ชั้นมัธยมศึกษาปีที่ ...
  const [semester, setSemester] = useState("");          // ภาคเรียนที่ ...
  const [yearLabel, setYearLabel] = useState("");         // ปีการศึกษา ...
  const [subjectType, setSubjectType] = useState("");     // ประเภท (พื้นฐาน/เพิ่มเติม)
  const [creditHours, setCreditHours] = useState<string>("");

  const [rows, setRows] = useState<Record<string, ScoreRow>>({});

  const [teacherSignatureName, setTeacherSignatureName] = useState("");
  const [deptHeadName, setDeptHeadName] = useState("");
  const directorName = "นายธนัฐ ศิระวงษ์";

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // ข้อมูลรายวิชา (ประเภท / หน่วยกิต)
        const { data: subj } = await supabase
          .from("subjects")
          .select("subject_type, credit_hours")
          .eq("id", subjectId)
          .maybeSingle();
        if (subj) {
          setSubjectType(subj.subject_type === "additional" ? "เพิ่มเติม" : "พื้นฐาน");
          setCreditHours(subj.credit_hours != null ? String(subj.credit_hours) : "");
        }

        // ครูประจำวิชา + หัวหน้ากลุ่มสาระ (มาจาก department_id ของครูคนนี้)
        const { data: sectionRow } = await supabase
          .from("subject_sections")
          .select("teacher_id")
          .eq("id", sectionId)
          .maybeSingle();

        if (sectionRow?.teacher_id) {
          const { data: teacher } = await supabase
            .from("users")
            .select("prefix, first_name, last_name, full_name, department_id")
            .eq("id", sectionRow.teacher_id)
            .maybeSingle();

          if (teacher) {
            setTeacherSignatureName(
              teacher.full_name || `${teacher.prefix ?? ""}${teacher.first_name} ${teacher.last_name}`
            );

            if (teacher.department_id) {
              // ★ ใช้ role 'subject_dept_head' (ไม่ใช่ 'dept_head' เฉย ๆ) เพื่อไม่ชนกับหัวหน้ากลุ่มงาน
              const { data: deptHead } = await supabase
                .from("users")
                .select("prefix, first_name, last_name, full_name")
                .eq("department_id", teacher.department_id)
                .contains("extra_roles", ["subject_dept_head"])
                .maybeSingle();
              if (deptHead) {
                setDeptHeadName(
                  deptHead.full_name || `${deptHead.prefix ?? ""}${deptHead.first_name} ${deptHead.last_name}`
                );
              }
            }
          }
        }

        // ข้อมูลปีการศึกษา / ภาคเรียน / ชั้น
        if (academicYearId) {
          const { data: year } = await supabase
            .from("academic_years")
            .select("year_name, semester")
            .eq("id", academicYearId)
            .maybeSingle();
          if (year) {
            setYearLabel(String(year.year_name ?? ""));
            setSemester(String(year.semester ?? ""));
          }
        }
        if (classroomLabel) setGradeLevel(classroomLabel.trim());

        // คะแนนที่เคยกรอกไว้ (ถ้ามีตาราง vp2_progress_scores)
        const { data: scoreRows, error: scoreErr } = await supabase
          .from("vp2_progress_scores")
          .select("student_id, unit_score, midterm_score, remark")
          .eq("subject_section_id", sectionId);

        const map: Record<string, ScoreRow> = {};
        students.forEach(s => {
          map[s.id] = { student_id: s.id, unit_score: null, midterm_score: null, remark: null };
        });
        if (!scoreErr && scoreRows) {
          scoreRows.forEach((r: any) => {
            map[r.student_id] = {
              student_id: r.student_id,
              unit_score: r.unit_score,
              midterm_score: r.midterm_score,
              remark: r.remark,
            };
          });
        }
        setRows(map);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId, subjectId, academicYearId, classroomLabel, students]);

  function updateRow(studentId: string, field: "unit_score" | "midterm_score" | "remark", value: string) {
    setRows(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: field === "remark" ? (value === "" ? null : value) : (value === "" ? null : Number(value)),
      },
    }));
  }

  const totalByStudent = useMemo(() => {
    const t: Record<string, number> = {};
    Object.values(rows).forEach(r => {
      t[r.student_id] = (r.unit_score ?? 0) + (r.midterm_score ?? 0);
    });
    return t;
  }, [rows]);

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const payload = students.map(s => ({
        subject_section_id: sectionId,
        student_id: s.id,
        unit_score: rows[s.id]?.unit_score ?? null,
        midterm_score: rows[s.id]?.midterm_score ?? null,
        remark: rows[s.id]?.remark ?? null,
        updated_by: currentUserId || null,
      }));
      const { error: upsertErr } = await supabase
        .from("vp2_progress_scores")
        .upsert(payload, { onConflict: "subject_section_id,student_id" });
      if (upsertErr) throw upsertErr;
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "บันทึกไม่สำเร็จ (ตรวจสอบว่ามีตาราง vp2_progress_scores แล้วหรือยัง)");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return <div className="text-center py-10 text-fuchsia-500 font-black animate-pulse">กำลังโหลด...</div>;
  }

  return (
    <div className="space-y-4">
      {/* แถบควบคุม (ซ่อนตอนพิมพ์) */}
      <div className="print:hidden flex items-center justify-between flex-wrap gap-2">
        <button onClick={onBack} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs">
          ← กลับ
        </button>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-xs shadow"
            >
              {saving ? "กำลังบันทึก..." : "💾 บันทึกคะแนน"}
            </button>
          )}
          <button onClick={handlePrint} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-xs shadow">
            🖨️ พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
      </div>

      {error && <p className="print:hidden text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
      {savedAt && !error && (
        <p className="print:hidden text-xs font-black text-emerald-500">✅ บันทึกคะแนนล่าสุดแล้ว</p>
      )}

      {/* ตัวเอกสารสำหรับพิมพ์ */}
      <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-10 print:border-0 print:shadow-none print:p-0 max-w-3xl mx-auto font-['TH_Sarabun_New',_sans-serif]">
        <img src="/school-logo.png" alt="ตราโรงเรียน" className="absolute left-6 top-6 print:left-0 print:top-0 w-14 h-14 object-contain" />
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 text-center">
            <p className="font-black text-base">แบบประกาศผลคะแนนระหว่างเรียนรายวิชาของนักเรียนโรงเรียนวัดเขียนเขต</p>
            <p className="text-sm mt-1">
              ชั้น{" "}
              {readOnly ? (
                <span className="font-bold">{gradeLevel || "…………"}</span>
              ) : (
                <input value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="border-b border-slate-400 text-center w-32 focus:outline-none" />
              )}{" "}
              ภาคเรียนที่{" "}
              {readOnly ? (
                <span className="font-bold">{semester || "…"}</span>
              ) : (
                <input value={semester} onChange={e => setSemester(e.target.value)} className="border-b border-slate-400 text-center w-10 focus:outline-none" />
              )}{" "}
              ปีการศึกษา{" "}
              {readOnly ? (
                <span className="font-bold">{yearLabel || "…………"}</span>
              ) : (
                <input value={yearLabel} onChange={e => setYearLabel(e.target.value)} className="border-b border-slate-400 text-center w-24 focus:outline-none" />
              )}
            </p>
            <p className="text-sm mt-1">
              รหัสวิชา <span className="font-bold">{subjectCode}</span> รายวิชา <span className="font-bold">{subjectTitle}</span> ประเภท{" "}
              {readOnly ? (
                <span className="font-bold">{subjectType || "…………"}</span>
              ) : (
                <input value={subjectType} onChange={e => setSubjectType(e.target.value)} className="border-b border-slate-400 text-center w-24 focus:outline-none" />
              )}{" "}
              จำนวน{" "}
              {readOnly ? (
                <span className="font-bold">{creditHours || "…"}</span>
              ) : (
                <input value={creditHours} onChange={e => setCreditHours(e.target.value)} className="border-b border-slate-400 text-center w-10 focus:outline-none" />
              )}{" "}
              หน่วยกิต
            </p>
          </div>
          <div className="border border-slate-400 rounded px-2 py-1 text-[10px] font-bold shrink-0">แบบฟอร์ม 2</div>
        </div>

        <table className="w-full border-collapse text-xs mt-4">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 w-10">เลขที่</th>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 w-20">เลขประจำตัว</th>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5">ชื่อ นามสกุล</th>
              <th colSpan={3} className="border border-slate-400 px-1 py-1">คะแนน</th>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 w-20">หมายเหตุ</th>
            </tr>
            <tr>
              <th className="border border-slate-400 px-1 py-1 font-normal">
                หน่วยการเรียน{unitMaxScore != null ? ` (${unitMaxScore})` : " (……)"}
              </th>
              <th className="border border-slate-400 px-1 py-1 font-normal">
                กลางภาค{midtermMaxScore != null ? ` (${midtermMaxScore})` : " (……)"}
              </th>
              <th className="border border-slate-400 px-1 py-1 font-normal">
                รวม{unitMaxScore != null && midtermMaxScore != null ? ` (${unitMaxScore + midtermMaxScore})` : " (……)"}
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.id}>
                <td className="border border-slate-400 text-center py-1">{i + 1}</td>
                <td className="border border-slate-400 text-center py-1">{s.student_code ?? ""}</td>
                <td className="border border-slate-400 px-2 py-1">
                  {s.prefix ?? ""}{s.first_name} {s.last_name}
                </td>
                <td className="border border-slate-400 text-center py-1">
                  {readOnly ? (
                    rows[s.id]?.unit_score ?? ""
                  ) : (
                    <input
                      type="number"
                      value={rows[s.id]?.unit_score ?? ""}
                      onChange={e => updateRow(s.id, "unit_score", e.target.value)}
                      className="w-14 text-center focus:outline-none print:appearance-none"
                    />
                  )}
                </td>
                <td className="border border-slate-400 text-center py-1">
                  {readOnly ? (
                    rows[s.id]?.midterm_score ?? ""
                  ) : (
                    <input
                      type="number"
                      value={rows[s.id]?.midterm_score ?? ""}
                      onChange={e => updateRow(s.id, "midterm_score", e.target.value)}
                      className="w-14 text-center focus:outline-none"
                    />
                  )}
                </td>
                <td className="border border-slate-400 text-center py-1 font-bold">{totalByStudent[s.id] ?? 0}</td>
                <td className="border border-slate-400 text-center py-1">
                  {readOnly ? (
                    rows[s.id]?.remark ?? ""
                  ) : (
                    <input
                      value={rows[s.id]?.remark ?? ""}
                      onChange={e => updateRow(s.id, "remark", e.target.value)}
                      className="w-full text-center focus:outline-none"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 mt-10 text-sm text-center">
          <div>
            <p>ลงชื่อ.......................................ครูประจำวิชา</p>
            <p>({teacherSignatureName || "......................................."})</p>
          </div>
          <div>
            <p>ลงชื่อ.......................................หัวหน้ากลุ่มสาระฯ</p>
            <p>({deptHeadName || "......................................."})</p>
          </div>
        </div>
        <div className="text-center mt-8 text-sm">
          <p>ลงชื่อ.......................................</p>
          <p>({directorName})</p>
          <p>ผู้อำนวยการโรงเรียนวัดเขียนเขต</p>
        </div>
      </div>
    </div>
  );
}