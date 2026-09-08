"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string;
  seat_number: number; student_code?: string; // TODO: เลขประจำตัว - เช็คชื่อ column จริงใน students
};
type SectionInfo = {
  id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  subject_type: "basic" | "additional";   // ← เอา ? ออก, บังคับเป็น literal
  hours_per_year: number | null;
};
type GradeCell = { grandTotal: number; percentage: number; grade: string; totalMax: number };
type AttendCell = { present: number; total: number };

export default function Vp4Report({
  classroomLevel,          // "primary" | "secondary" -- TODO: ส่งมาจากหน้าแม่ (ดู helper ด้านล่าง)
  classroomLabel,          // เช่น "1/6"
  academicYear,            // เช่น "2568"
  semester,                // เช่น "1" (ใช้เฉพาะ ม.)
  schoolName, districtName, provinceName,
  directorName,            // TODO: ดึงจาก settings/schools table
  advisorNames,            // [ชื่อครูที่ปรึกษา1, ชื่อครูที่ปรึกษา2] -- TODO
  students,
  sections,
  gradeMatrix,
  attendMatrix,
  onBack,
}: {
  classroomLevel: "primary" | "secondary";
  classroomLabel: string;
  academicYear: string;
  semester?: string;
  schoolName: string; districtName: string; provinceName: string;
  directorName: string;
  advisorNames: string[];
  students: Student[];
  sections: SectionInfo[];
  gradeMatrix: Record<string, Record<string, GradeCell>>;
  attendMatrix: Record<string, Record<string, AttendCell>>;
  onBack: () => void;
}) {
  // ค่าคุณลักษณะ/อ่านคิดเขียนภาพรวม รายคน (ใช้เฉพาะ ป.)
  const [overallScores, setOverallScores] = useState<Record<string, { characteristic: string; readThinkWrite: string }>>({});

  useEffect(() => {
    if (classroomLevel !== "primary") return;
    (async () => {
      // TODO: แทนที่ query นี้ด้วยตารางคะแนนจริงของ ScoreSheetAssessmentTool
      // ตัวอย่างสมมติ: ตาราง assessment_scores(student_id, assessment_type, item_key, score)
      // ต้องคำนวณ "ระดับ" (0-3 หรือ 0-4) สรุปรวมของนักเรียนแต่ละคนสำหรับทั้งภาคเรียน
      const results: Record<string, { characteristic: string; readThinkWrite: string }> = {};
      students.forEach(s => { results[s.id] = { characteristic: "-", readThinkWrite: "-" }; });
      setOverallScores(results);
    })();
  }, [classroomLevel, students]);
  function extractGradeLevel(roomName: string): string {
  const m = roomName.match(/^(\d+)/); // "1/7" -> "1"
  return m ? m[1] : roomName;
}
function subjectTypeLabel(type: string | null | undefined): string {
  if (type === "basic") return "พื้นฐาน";
  if (type === "additional") return "เพิ่มเติม";
  return "-";
}
  function calcGpaAndAvgPercent(studentId: string) {
    let totalGrandScore = 0, totalMaxPercent = 0, gradeSum = 0, gradeCount = 0;
    sections.forEach(sec => {
      const cell = gradeMatrix[studentId]?.[sec.id];
      if (!cell) return;
      totalGrandScore += cell.percentage;
      totalMaxPercent += 100;
      const g = parseFloat(cell.grade);
      if (!isNaN(g)) { gradeSum += g; gradeCount += 1; }
    });
    const avgPercent = totalMaxPercent > 0 ? (totalGrandScore / totalMaxPercent) * 100 : 0;
    const gpa = gradeCount > 0 ? gradeSum / gradeCount : 0;
    return { gpa: gpa.toFixed(2), avgPercent: avgPercent.toFixed(2) };
  }

  function attendancePercentFor(studentId: string) {
    let present = 0, total = 0;
    sections.forEach(sec => {
      const c = attendMatrix[studentId]?.[sec.id];
      if (c) { present += c.present; total += c.total; }
    });
    return total > 0 ? (present / total) * 100 : 0;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button onClick={onBack} className="text-sm font-black text-blue-600 underline">← กลับ</button>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-sm">
          🖨️ พิมพ์ทั้งห้อง
        </button>
      </div>

      {students.map(s => {
        const { gpa, avgPercent } = calcGpaAndAvgPercent(s.id);
        const attendPct = attendancePercentFor(s.id);
        const overall = overallScores[s.id];

        return (
          <div key={s.id} className="vp4-page bg-white p-8 mb-6 print:mb-0 print:break-after-page border border-slate-100 print:border-0">
            <div className="text-center mb-2">
  <img src="/school-logo.png" alt="ตราโรงเรียน" className="h-16 w-16 mx-auto mb-1 object-contain" />
  <p className="font-bold">แบบรายงานคะแนนประจำตัวนักเรียน</p>
  <p className="text-sm">{schoolName} อำเภอ{districtName} จังหวัด{provinceName}</p>
</div>

<div className="text-center text-sm mb-3">
  {classroomLevel === "primary" ? (
    <span>ชั้นประถมศึกษาปีที่ {extractGradeLevel(classroomLabel)} ปีการศึกษา {academicYear}</span>
  ) : (
    <span>ชั้น ม.{extractGradeLevel(classroomLabel)} ภาคเรียนที่ {semester} ปีการศึกษา {academicYear}</span>
  )}
</div>

            <div className="flex flex-wrap gap-4 text-sm mb-3">
              <span>ชื่อ {s.prefix}{s.first_name} {s.last_name}</span>
              <span>เลขประจำตัว {s.student_code ?? "-"}</span>
              <span>ห้อง {classroomLabel}</span>
              <span>เลขที่ {s.seat_number}</span>
            </div>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border">
                  <th className="border p-1">รหัสวิชา</th>
                  <th className="border p-1">รายวิชา</th>
                  <th className="border p-1">ประเภท</th>
                  <th className="border p-1">{classroomLevel === "primary" ? "ชั่วโมง" : "หน่วยกิต"}</th>
                  <th className="border p-1" colSpan={2}>
                    {classroomLevel === "primary" ? "การประเมินผลสัมฤทธิ์" : "คะแนนระหว่างเรียน"}
                  </th>
                  {classroomLevel === "primary" ? (
                    <>
                      <th className="border p-1">คุณลักษณะฯ</th>
                      <th className="border p-1">อ่าน คิด เขียน</th>
                    </>
                  ) : (
                    <th className="border p-1">หมายเหตุ</th>
                  )}
                </tr>
                <tr className="border text-[10px] text-slate-400">
                  <th className="border p-1" colSpan={4}></th>
                  <th className="border p-1">คะแนนที่ได้</th>
                  <th className="border p-1">{classroomLevel === "primary" ? "ผลการเรียน" : "คะแนนที่ได้"}</th>
                  <th className="border p-1" colSpan={classroomLevel === "primary" ? 2 : 1}></th>
                </tr>
              </thead>
              <tbody>
                {sections.map(sec => {
                  const cell = gradeMatrix[s.id]?.[sec.id];
                  return (
                    <tr key={sec.id} className="border">
                      <td className="border p-1">{sec.subject_code}</td>
                      <td className="border p-1">{sec.subject_name}</td>
                      <td className="border p-1 text-center">{subjectTypeLabel(sec.subject_type)}</td>
                      <td className="border p-1 text-center">
                        {sec.hours_per_year ?? "-"}
                      </td>
                      <td className="border p-1 text-center">{cell?.totalMax ?? "-"}</td>
                      <td className="border p-1 text-center">
                        {classroomLevel === "primary" ? (cell?.grade ?? "-") : (cell?.grandTotal ?? "-")}
                      </td>
                      {classroomLevel === "primary" ? (
                        <>
                          <td className="border p-1 text-center">{overall?.characteristic ?? "-"}</td>
                          <td className="border p-1 text-center">{overall?.readThinkWrite ?? "-"}</td>
                        </>
                      ) : (
                        <td className="border p-1"></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {classroomLevel === "primary" ? (
              <div className="flex gap-8 text-sm mt-3">
                <span>ระดับผลการเรียนเฉลี่ย {gpa}</span>
                <span>คะแนนเฉลี่ยร้อยละ {avgPercent}</span>
              </div>
            ) : (
              <div className="text-sm mt-3 space-y-1">
                <p>เวลาเรียน</p>
                <label><input type="checkbox" readOnly checked={attendPct >= 80} /> ร้อยละ 80 ขึ้นไป (มีสิทธิ์สอบ)</label><br/>
                <label><input type="checkbox" readOnly checked={attendPct >= 60 && attendPct < 80} /> ร้อยละ 60-79 (ไม่มีสิทธิ์สอบ)</label><br/>
                <label><input type="checkbox" readOnly checked={attendPct < 60} /> ต่ำกว่าร้อยละ 60 (ไม่มีสิทธิ์สอบ)</label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mt-8 text-sm text-center">
              <div>ลงชื่อ .......................... ครูที่ปรึกษา<br/>({advisorNames[0] ?? "…"})</div>
              <div>ลงชื่อ .......................... ครูที่ปรึกษา<br/>({advisorNames[1] ?? "…"})</div>
              {classroomLevel === "primary" ? (
                <>
                  <div>ลงชื่อ .......................... ผู้อำนวยการโรงเรียน<br/>({directorName})</div>
                  <div>ลงชื่อ .......................... ผู้ปกครอง</div>
                </>
              ) : (
                <>
                  <div>ลงชื่อ .......................... หัวหน้าสายชั้น</div>
                  <div>ลงชื่อ .......................... ผู้อำนวยการโรงเรียน<br/>({directorName})</div>
                </>
              )}
            </div>
          </div>
        );
      })}

      <style jsx global>{`
        @media print {
          .vp4-page { page-break-after: always; }
          .vp4-page:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}