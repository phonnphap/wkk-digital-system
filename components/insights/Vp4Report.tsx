"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string;
  seat_number: number; student_code?: string;
};

// ★ วิชาที่ขึ้นต้นด้วย "ก" = กิจกรรมพัฒนาผู้เรียน (ชุมนุม/แนะแนว/ลูกเสือ ฯลฯ)
function isActivitySubject(subjectCode: string): boolean {
  return /^ก/.test(subjectCode ?? "");
}

type SectionInfo = {
  id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  subject_type: "basic" | "additional";
  hours_per_year: number | null;
  credit_hours: number | null;   // ★ เพิ่ม: ใช้แสดงคอลัมน์ "หน่วยกิต" ของมัธยม
};
type GradeCell = { grandTotal: number; percentage: number; grade: string; totalMax: number };
type AttendCell = { present: number; total: number };

// ★ เปลี่ยนจาก string[] เป็น object[] เพื่อให้ต่อคำนำหน้าชื่อ-นามสกุลได้ถูกต้อง
type AdvisorInfo = { prefix?: string; first_name: string; last_name: string };

function formatFullName(a?: AdvisorInfo): string {
  if (!a || (!a.first_name && !a.last_name)) return "…";
  return `${a.prefix ?? ""}${a.first_name} ${a.last_name}`.trim();
}

function activityResult(att?: AttendCell): "ผ" | "มผ" {
  // ★ กติกา: ไม่มีการเช็คชื่อเลยสักครั้ง (total = 0) -> ถือว่า "ผ" (ไม่ตัดสิทธิ์เพราะครูไม่ได้เช็ค)
  // มีการเช็คแล้วมาเรียน >= ครึ่งหนึ่ง -> "ผ", น้อยกว่าครึ่งหนึ่ง -> "มผ"
  if (!att || att.total === 0) return "ผ";
  return att.present / att.total >= 0.5 ? "ผ" : "มผ";
}

function characteristicLabel(level: string): string {
  const map: Record<string, string> = { "3": "3 = ดีเยี่ยม", "2": "2 = ดี", "1": "1 = ผ่าน", "0": "0 = ไม่ผ่าน" };
  return map[level] ?? "-";
}

export default function Vp4Report({
  classroomLevel,
  classroomLabel,
  academicYear,
  semester,
  schoolName, districtName, provinceName,
  directorName,
  advisorNames,
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
  advisorNames: AdvisorInfo[];   // ★ เปลี่ยน type
  students: Student[];
  sections: SectionInfo[];
  gradeMatrix: Record<string, Record<string, GradeCell>>;
  attendMatrix: Record<string, Record<string, AttendCell>>;
  onBack: () => void;
}) {
  const [overallScores, setOverallScores] = useState<Record<string, { characteristic: string; readThinkWrite: string }>>({});

  useEffect(() => {
    // ★ แก้: ดึงข้อมูลคุณลักษณะ/อ่านคิดเขียน ทั้งประถมและมัธยม (เดิมทำแค่ประถม)
    (async () => {
      // TODO: แทนที่ query นี้ด้วยตารางคะแนนจริงของ ScoreSheetAssessmentTool
      const results: Record<string, { characteristic: string; readThinkWrite: string }> = {};
      students.forEach(s => { results[s.id] = { characteristic: "-", readThinkWrite: "-" }; });
      setOverallScores(results);
    })();
  }, [classroomLevel, students]);

  function extractGradeLevel(roomName: string): string {
    const m = roomName.match(/^(\d+)/);
    return m ? m[1] : roomName;
  }

  function subjectTypeLabel(sec: SectionInfo): string {
    if (isActivitySubject(sec.subject_code)) return "กิจกรรม";   // ★ เพิ่ม
    if (sec.subject_type === "basic") return "พื้นฐาน";
    if (sec.subject_type === "additional") return "เพิ่มเติม";
    return "-";
  }

  // ★ แยกวิชาเป็นกลุ่มเพื่อสรุปยอดหน่วยกิต: พื้นฐาน / เพิ่มเติม / กิจกรรม
  function creditSummary(studentId: string) {
    let basicPlanned = 0, basicEarned = 0;
    let addPlanned = 0, addEarned = 0;
    sections.forEach(sec => {
      if (isActivitySubject(sec.subject_code)) return; // กิจกรรมไม่นับหน่วยกิต
      const credit = sec.credit_hours ?? 0;
      const cell = gradeMatrix[studentId]?.[sec.id];
      const passed = cell ? parseFloat(cell.grade) > 0 : false;
      if (sec.subject_type === "basic") {
        basicPlanned += credit;
        if (passed) basicEarned += credit;
      } else {
        addPlanned += credit;
        if (passed) addEarned += credit;
      }
    });
    return {
      basicPlanned, basicEarned, addPlanned, addEarned,
      totalPlanned: basicPlanned + addPlanned,
      totalEarned: basicEarned + addEarned,
    };
  }

  // ★ GPA ต้องถ่วงน้ำหนักด้วยหน่วยกิต ไม่ใช่เฉลี่ยเกรดตรงๆ และไม่นับวิชากิจกรรม
  function calcGpaAndAvgPercent(studentId: string) {
    let weightedGradeSum = 0, creditSum = 0;
    let totalPercentSum = 0, subjectCount = 0;
    sections.forEach(sec => {
      if (isActivitySubject(sec.subject_code)) return;
      const cell = gradeMatrix[studentId]?.[sec.id];
      if (!cell) return;
      const credit = sec.credit_hours ?? 0;
      const g = parseFloat(cell.grade);
      if (!isNaN(g) && credit > 0) { weightedGradeSum += g * credit; creditSum += credit; }
      totalPercentSum += cell.percentage;
      subjectCount += 1;
    });
    const gpa = creditSum > 0 ? weightedGradeSum / creditSum : 0;
    const avgPercent = subjectCount > 0 ? totalPercentSum / subjectCount : 0;
    return { gpa: gpa.toFixed(2), avgPercent: avgPercent.toFixed(2), gpaRaw: gpa };
  }

  // ★ ลำดับที่ในห้องเรียน: เทียบ GPA กับเพื่อนร่วมห้องเดียวกันเท่านั้น (ข้อมูลที่มีอยู่ครบ)
  const classroomRanking = (() => {
    const withGpa = students.map(s => ({ id: s.id, gpa: calcGpaAndAvgPercent(s.id).gpaRaw }));
    const sorted = [...withGpa].sort((a, b) => b.gpa - a.gpa);
    const rankMap: Record<string, number> = {};
    let rank = 0, prev: number | null = null;
    sorted.forEach((r, i) => {
      if (prev === null || r.gpa !== prev) { rank = i + 1; prev = r.gpa; }
      rankMap[r.id] = rank;
    });
    return rankMap;
  })();

  function attendancePercentFor(studentId: string) {
    let present = 0, total = 0;
    sections.forEach(sec => {
      const c = attendMatrix[studentId]?.[sec.id];
      if (c) { present += c.present; total += c.total; }
    });
    return total > 0 ? (present / total) * 100 : 0;
  }

  // ★ ผลรวมกิจกรรมพัฒนาผู้เรียน: ถ้ามีกิจกรรมไหน "มผ" ให้ภาพรวมเป็น "มผ" ไม่งั้น "ผ"
  function overallActivityResult(studentId: string): "ผ" | "มผ" {
    const activities = sections.filter(s => isActivitySubject(s.subject_code));
    if (activities.length === 0) return "ผ";
    const anyFail = activities.some(sec => activityResult(attendMatrix[studentId]?.[sec.id]) === "มผ");
    return anyFail ? "มผ" : "ผ";
  }

  return (
    <div className="font-['TH_Sarabun_New',_sans-serif]">
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
        const credits = creditSummary(s.id);
        const roomRank = classroomRanking[s.id] ?? "-";

        return (
          <div key={s.id} className="vp4-page bg-white p-8 mb-6 print:mb-0 print:break-after-page border border-slate-100 print:border-0">
            <div className="text-center mb-2">
              <img src="/school-logo.png" alt="ตราโรงเรียน" className="h-16 w-16 mx-auto mb-1 object-contain" />
              <p className="font-bold">แบบรายงานประจำตัวนักเรียน</p>
              <p className="text-sm">{schoolName} อำเภอ{districtName} จังหวัด{provinceName}</p>
            </div>

            <div className="text-center text-sm mb-3">
              {classroomLevel === "primary" ? (
                <span>ชั้นประถมศึกษาปีที่ {extractGradeLevel(classroomLabel)} ปีการศึกษา {academicYear}</span>
              ) : (
                <span>ชั้นมัธยมศึกษาปีที่ {extractGradeLevel(classroomLabel)} ปีการศึกษา {academicYear}</span>
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
                  <th className="border p-1" rowSpan={2}>รหัสวิชา</th>
                  <th className="border p-1" rowSpan={2}>รายวิชา</th>
                  <th className="border p-1" rowSpan={2}>ประเภท</th>
                  <th className="border p-1" rowSpan={2}>{classroomLevel === "primary" ? "ชั่วโมง" : "หน่วยกิต"}</th>
                  <th className="border p-1" colSpan={2}>การประเมินผลสัมฤทธิ์</th>
                  <th className="border p-1" rowSpan={2}>คุณลักษณะ</th>
                  <th className="border p-1" rowSpan={2}>อ่านคิด<br/>วิเคราะห์เขียน</th>
                  <th className="border p-1" rowSpan={2}>หมายเหตุ</th>
                </tr>
                <tr className="border text-[10px] text-slate-400">
                  <th className="border p-1">คะแนน</th>
                  <th className="border p-1">ผลการเรียน</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(sec => {
                  const cell = gradeMatrix[s.id]?.[sec.id];
                  const isActivity = isActivitySubject(sec.subject_code);
                  const unitValue = classroomLevel === "primary" ? sec.hours_per_year : sec.credit_hours;
                  return (
                    <tr key={sec.id} className="border">
                      <td className="border p-1">{sec.subject_code}</td>
                      <td className="border p-1">{sec.subject_name}</td>
                      <td className="border p-1 text-center">{subjectTypeLabel(sec)}</td>
                      <td className="border p-1 text-center">{isActivity ? "-" : (unitValue ?? "-")}</td>
                      <td className="border p-1 text-center">
                        {isActivity ? "-" : (cell?.percentage != null ? Math.round(cell.percentage) : "-")}
                      </td>
                      <td className="border p-1 text-center">
                        {isActivity ? activityResult(attendMatrix[s.id]?.[sec.id]) : (cell?.grade ?? "-")}
                      </td>
                      <td className="border p-1 text-center">{overall?.characteristic ?? "-"}</td>
                      <td className="border p-1 text-center">{overall?.readThinkWrite ?? "-"}</td>
                      <td className="border p-1"></td>
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
              <div className="mt-4 flex flex-col sm:flex-row gap-6 text-sm">
                <table className="border-collapse text-sm flex-1">
                  <thead>
                    <tr>
                      <th className="border p-1 text-left" colSpan={1}>สรุปผลการประเมิน</th>
                      <th className="border p-1">ที่เรียน</th>
                      <th className="border p-1">ที่ได้</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-1">จำนวนหน่วยกิต/น้ำหนักวิชาพื้นฐาน</td><td className="border p-1 text-center">{credits.basicPlanned.toFixed(1)}</td><td className="border p-1 text-center">{credits.basicEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1">จำนวนหน่วยกิต/น้ำหนักวิชาเพิ่มเติม</td><td className="border p-1 text-center">{credits.addPlanned.toFixed(1)}</td><td className="border p-1 text-center">{credits.addEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1 font-bold">รวมจำนวนหน่วยกิต/น้ำหนัก</td><td className="border p-1 text-center font-bold">{credits.totalPlanned.toFixed(1)}</td><td className="border p-1 text-center font-bold">{credits.totalEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ระดับผลการเรียนเฉลี่ย (GPA)</td><td className="border p-1 text-center">{gpa}</td></tr>
                    <tr>
                      <td className="border p-1" colSpan={2}>ลำดับที่ในห้องเรียน/ในชั้นเรียน</td>
                      <td className="border p-1 text-center">{roomRank}/-</td>
                    </tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินคุณลักษณะอันพึงประสงค์</td><td className="border p-1 text-center">{characteristicLabel(overall?.characteristic ?? "-")}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน</td><td className="border p-1 text-center">{characteristicLabel(overall?.readThinkWrite ?? "-")}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินกิจกรรมพัฒนาผู้เรียน</td><td className="border p-1 text-center">{overallActivityResult(s.id)} = {overallActivityResult(s.id) === "ผ" ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className={`grid ${classroomLevel === "primary" ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"} gap-6 mt-8 text-sm text-center`}>
              {classroomLevel === "primary" ? (
                <>
                  <div>ลงชื่อ .......................... ครูที่ปรึกษา<br/>({formatFullName(advisorNames[0])})</div>
                  <div>ลงชื่อ .......................... ครูที่ปรึกษา<br/>({formatFullName(advisorNames[1])})</div>
                  <div>ลงชื่อ .......................... ผู้อำนวยการโรงเรียน<br/>({directorName})</div>
                  <div>ลงชื่อ .......................... ผู้ปกครอง</div>
                </>
              ) : (
                <>
                  <div>
                    ลงชื่อ .......................... ครูที่ปรึกษา<br/>
                    ({formatFullName(advisorNames[0])}{advisorNames[1] ? " / " + formatFullName(advisorNames[1]) : ""})
                  </div>
                  <div>ลงชื่อ .......................... ผู้บริหารสถานศึกษา<br/>({directorName})</div>
                  <div>ลงชื่อ .......................... ผู้ปกครอง</div>
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