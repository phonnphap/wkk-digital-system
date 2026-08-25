"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ExcelJS from "exceljs";

const supabase = createClient();

type Student = {
  id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  seat_number: number;
};

type ExtraStudentInfo = {
  student_code: string | null;
  birth_date: string | null;
  gender: string | null;
};

// ★ สมมติรูปแบบข้อมูลเวลาเรียนที่ดึงจาก API — ปรับให้ตรงกับ schema จริงของระบบเช็คชื่อ
type Status = "present" | "absent" | "late" | "leave" | "excused";

type DailyRecord = {
  student_id: string;
  attendance_date: string;
  status: Status;
};

function calcAge(birthDateStr: string): number {
  const bd = new Date(birthDateStr);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

function computePrefix(gender: string | null, birthDate: string | null, fallback: string | null): string {
  if (gender === "male") {
    if (birthDate && calcAge(birthDate) > 15) return "นาย";
    return fallback ?? "เด็กชาย";
  }
  if (gender === "female") {
    if (birthDate && calcAge(birthDate) > 15) return "นางสาว";
    return fallback ?? "เด็กหญิง";
  }
  return fallback ?? "";
}

function buildNameWithTitle(person: {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
} | null | undefined): string {
  if (!person) return "";
  const title = person.title ?? "";
  const base =
    person.full_name?.trim() ||
    `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  if (title && base.startsWith(title)) return base;
  return `${title}${base}`;
}

function formatGradeLevel(label?: string): string {
  if (!label) return "";
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return label.trim();
  if (nums.length === 1) return nums[0];
  return `${nums[0]}/${nums[nums.length - 1]}`;
}

function SignatureField({
  role,
  name,
  lineWidth = "9rem",
}: {
  role?: string;
  name: string;
  lineWidth?: string;
}) {
  return (
    <div className="inline-block text-center" style={{ paddingBottom: "1.9rem" }}>
      <p className="whitespace-nowrap inline-flex items-baseline justify-center">
        <span>ลงชื่อ</span>
        <span className="relative inline-block mx-1" style={{ width: lineWidth }}>
          <span className="block border-b border-dotted border-slate-500">&nbsp;</span>
          <span className="absolute left-0 right-0 top-full mt-1 text-center whitespace-nowrap">
            ({name})
          </span>
        </span>
      </p>
      {role && <p className="mt-1">{role}</p>}
    </div>
  );
}

export default function Vp3Report({
  sectionId,
  subjectId,
  academicYearId,
  subjectTitle,
  subjectCode,
  classroomLabel,
  students,
  readOnly,
  presentThresholds = [60, 80], // ★ เกณฑ์ % ที่ต้องเช็ค (เรียงจากน้อยไปมาก)
  subjectTeacherNameFallback,
  onBack,
}: {
  sectionId: string;
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  classroomLabel?: string;
  students: Student[];
  readOnly?: boolean;
  presentThresholds?: number[];
  subjectTeacherNameFallback?: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState("");
  const [semester, setSemester] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [deptGroupName, setDeptGroupName] = useState("");

  const [extraInfo, setExtraInfo] = useState<Record<string, ExtraStudentInfo>>({});
  const [attendanceDates, setAttendanceDates] = useState<string[]>([]);
const [attendanceRecords, setAttendanceRecords] = useState<DailyRecord[]>([]);

  const [teacherSignatureName, setTeacherSignatureName] = useState("");
  const [gradeHeadName, setGradeHeadName] = useState(""); // หัวหน้าสายชั้น — แก้ไขเองได้ถ้ายังไม่มี query อัตโนมัติ

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sectionRow } = await supabase
          .from("subject_sections")
          .select("teacher_id")
          .eq("id", sectionId)
          .maybeSingle();

        if (sectionRow?.teacher_id) {
          const { data: teacher } = await supabase
            .from("users")
            .select("title, first_name, last_name, full_name, department_id, departments:department_id(name)")
            .eq("id", sectionRow.teacher_id)
            .maybeSingle();
          if (teacher) {
            setTeacherSignatureName(buildNameWithTitle(teacher as any));
            const deptRel: any = (teacher as any).departments;
            const dName = Array.isArray(deptRel) ? deptRel[0]?.name : deptRel?.name;
            if (dName) setDeptGroupName(dName);
          }
        }

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
        if (classroomLabel) setGradeLevel(formatGradeLevel(classroomLabel));

        const ids = students.map(s => s.id);
        if (ids.length > 0) {
          const { data: extraRows } = await supabase
            .from("students")
            .select("id, student_code, birth_date, gender")
            .in("id", ids);
          const map: Record<string, ExtraStudentInfo> = {};
          (extraRows ?? []).forEach((r: any) => {
            map[r.id] = { student_code: r.student_code, birth_date: r.birth_date, gender: r.gender };
          });
          setExtraInfo(map);
        }

        // ★ TODO: แก้ endpoint/คอลัมน์ให้ตรงกับระบบเช็คชื่อจริงของคุณ
        const attRes = await fetch(`/api/subject-attendance/summary?subject_section_id=${sectionId}`);
if (attRes.ok) {
  const attJson = await attRes.json();
  setAttendanceDates(attJson.dates ?? []);
  setAttendanceRecords(attJson.records ?? []);
} else {
  console.warn("[Vp3Report] โหลดข้อมูลเช็คชื่อไม่สำเร็จ");
}
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId, subjectId, academicYearId, classroomLabel, students]);

  // ★ คำนวณ % เวลาเรียน แล้วกรองเฉพาะคนที่ต่ำกว่าเกณฑ์อย่างน้อยหนึ่งค่า
  const belowThresholdStudents = useMemo(() => {
  const total = attendanceDates.length;

  return students
    .map(s => {
      const counts: Record<Status, number> = { present: 0, absent: 0, late: 0, leave: 0, excused: 0 };
      attendanceRecords
        .filter(r => r.student_id === s.id)
        .forEach(r => { counts[r.status]++; });

      const present = counts.present + counts.late; // ★ ตรงกับ totalPresent ของหน้าเช็คชื่อ
      const absent = total - present;
      const percent = total > 0 ? (present / total) * 100 : 0;
      const belowFlags = presentThresholds.map(t => percent < t);

      return { student: s, total, present, absent, percent, belowFlags, counts };
    })
    .filter(row => row.belowFlags.some(Boolean));
}, [students, attendanceRecords, attendanceDates, presentThresholds]);

  function handlePrint() {
    window.print();
  }

  async function handleExportExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("แบบวัดผล 3");
    const COLS = 5 + presentThresholds.length + 2; // ที่,ชั้น/ห้อง,เลขที่,เลขประจำตัว,ชื่อ-สกุล,เต็ม,ขาดเรียน,+เกณฑ์

    try {
      const logoRes = await fetch("/school-logo.png");
      const logoBuffer = await logoRes.arrayBuffer();
      const logoId = wb.addImage({ buffer: logoBuffer, extension: "png" });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 90 } });
    } catch (e) {
      console.warn("โหลดโลโก้ไม่สำเร็จ:", e);
    }

    const tagCell = ws.getCell(1, COLS);
    tagCell.value = "แบบวัดผล 3";
    tagCell.font = { bold: true };
    tagCell.alignment = { horizontal: "center", vertical: "middle" };
    tagCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };

    let row = 6;
    const memoLines = [
      "บันทึกข้อความ",
      `ส่วนราชการ  กลุ่มสาระการเรียนรู้${deptGroupName || "......................................."}`,
      `ที่  โรงเรียนวัดเขียนเขต                                    วันที่.....เดือน.................พ.ศ......`,
      `เรื่อง  ขอส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง ${presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด`,
      "",
      "เรียน  ผู้อำนวยการโรงเรียนวัดเขียนเขต",
      "",
      `ด้วยครูประจำวิชา ${teacherSignatureName || subjectTeacherNameFallback || "......."} รหัสวิชา ${subjectCode} ระดับชั้นมัธยมศึกษาปีที่ ${gradeLevel || "...."} กลุ่มสาระการเรียนรู้${deptGroupName || "...."} ได้สำรวจเวลาเรียนของนักเรียนในภาคเรียนที่ ${semester || "...."} ปีการศึกษา ${yearLabel || "...."} พบว่ามีนักเรียนที่มีเวลาเรียนไม่ถึง ${presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด จำนวน ${belowThresholdStudents.length} คน ดังรายชื่อต่อไปนี้`,
    ];
    memoLines.forEach(text => {
      ws.mergeCells(row, 1, row, COLS);
      const c = ws.getCell(row, 1);
      c.value = text;
      c.alignment = { horizontal: text.includes("บันทึก") ? "center" : "left", wrapText: true };
      row++;
    });

    row++;
    const headers = ["ที่", "ชั้น/ห้อง", "เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", "เต็ม (คาบ)", "ขาดเรียน", ...presentThresholds.map(t => `ไม่ถึง ${t}%`)];
    headers.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = { bold: true };
      c.alignment = { horizontal: "center", wrapText: true };
      c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    const tableHeaderRow = row;
    row++;

    belowThresholdStudents.forEach((r, i) => {
      const info = extraInfo[r.student.id];
      const prefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, r.student.prefix ?? null);
      const values = [
        i + 1,
        gradeLevel,
        r.student.seat_number,
        info?.student_code ?? "",
        `${prefix}${r.student.first_name} ${r.student.last_name}`,
        r.total,
        r.absent,
        ...r.belowFlags.map(f => (f ? "✓" : "")),
      ];
      values.forEach((v, ci) => {
        const c = ws.getCell(row, ci + 1);
        c.value = v;
        c.alignment = { horizontal: ci === 4 ? "left" : "center" };
        c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
      row++;
    });

    row += 2;
    ws.mergeCells(row, 1, row, COLS);
    ws.getCell(row, 1).value = "จึงเรียนมาเพื่อโปรดทราบและพิจารณาดำเนินการ";
    row += 3;

    const writeSignature = (r: number, colStart: number, colEnd: number, name: string, role: string) => {
      ws.mergeCells(r, colStart, r, colEnd);
      ws.getCell(r, colStart).value = "ลงชื่อ.......................................";
      ws.getCell(r, colStart).alignment = { horizontal: "center" };
      ws.mergeCells(r + 1, colStart, r + 1, colEnd);
      ws.getCell(r + 1, colStart).value = `(${name})`;
      ws.getCell(r + 1, colStart).alignment = { horizontal: "center" };
      ws.mergeCells(r + 2, colStart, r + 2, colEnd);
      ws.getCell(r + 2, colStart).value = role;
      ws.getCell(r + 2, colStart).alignment = { horizontal: "center" };
    };
    const half = Math.floor(COLS / 2);
    writeSignature(row, 1, half, teacherSignatureName || subjectTeacherNameFallback || ".......................................", "ครูประจำวิชา");
    writeSignature(row, half + 1, COLS, gradeHeadName || ".......................................", `หัวหน้าสายชั้นมัธยมศึกษาปีที่ ${gradeLevel || "...."}`);

    ws.columns = Array(COLS).fill({ width: 12 });
    ws.getColumn(5).width = 26;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `แบบวัดผล3_${subjectCode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="text-center py-10 text-fuchsia-500 font-black animate-pulse">กำลังโหลด...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden flex items-center justify-between flex-wrap gap-2">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm">
          ← กลับ
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleExportExcel} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow">
            📊 ส่งออก Excel
          </button>
          <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-sm shadow">
            🖨️ พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
      </div>

      {error && <p className="print:hidden text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      <div className="bg-slate-100 print:bg-transparent rounded-2xl p-4 sm:p-8 print:p-0 overflow-x-auto">
        <div className="relative bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-12 print:border-0 print:shadow-none print:p-0 mx-auto" style={{ maxWidth: "210mm", width: "100%" }}>

          <div className="flex items-start justify-between mb-2">
            <div style={{ width: "3cm", height: "3cm" }} className="shrink-0 flex items-center justify-center">
              <img src="/school-logo.png" alt="ตราโรงเรียน" className="w-full h-full object-contain" />
            </div>
            <div className="border border-slate-400 rounded px-2 py-1 font-bold whitespace-nowrap self-start" style={{ fontSize: "16px" }}>
              แบบวัดผล 3
            </div>
          </div>

          <p className="text-center font-bold text-lg mb-4">บันทึกข้อความ</p>

          <div className="space-y-1 text-sm">
            <p>ส่วนราชการ&nbsp;&nbsp;กลุ่มสาระการเรียนรู้{deptGroupName || "......................................."}</p>
            <p>ที่&nbsp;&nbsp;โรงเรียนวัดเขียนเขต<span className="ml-16">วันที่..........เดือน...............................พ.ศ. ..........</span></p>
            <p>เรื่อง&nbsp;&nbsp;ขอส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง {presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด</p>
            <div className="border-t border-slate-400 my-2" />
            <p>เรียน&nbsp;&nbsp;ผู้อำนวยการโรงเรียนวัดเขียนเขต</p>
            <p className="indent-8 leading-relaxed">
              ด้วยครูประจำวิชา {teacherSignatureName || subjectTeacherNameFallback || "......................"} รหัสวิชา {subjectCode} ระดับชั้นมัธยมศึกษาปีที่ {gradeLevel || "......"} กลุ่มสาระการเรียนรู้{deptGroupName || "......................"} ได้สำรวจเวลาเรียนของนักเรียนในภาคเรียนที่ {semester || "..."} ปีการศึกษา {yearLabel || "........"} พบว่ามีนักเรียนที่มีเวลาเรียนไม่ถึง {presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด จำนวน {belowThresholdStudents.length} คน ดังรายชื่อต่อไปนี้
            </p>
          </div>

          <table className="w-full table-fixed border-collapse text-sm mt-4">
            <thead>
              <tr>
                <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold">ที่</th>
                <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold">ชั้น/ห้อง</th>
                <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold">เลขที่</th>
                <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold">เลขประจำตัว</th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-bold">ชื่อ-สกุล</th>
                <th colSpan={2} className="border border-slate-400 px-1 py-1 font-bold">เวลาเรียน(คาบ)</th>
                <th colSpan={presentThresholds.length} className="border border-slate-400 px-1 py-1 font-bold">มีเวลาเรียนไม่ถึง</th>
              </tr>
              <tr>
                <th className="border border-slate-400 px-1 py-1 font-bold">เต็ม</th>
                <th className="border border-slate-400 px-1 py-1 font-bold">ขาดเรียน</th>
                {presentThresholds.map(t => (
                  <th key={t} className="border border-slate-400 px-1 py-1 font-bold">{t}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {belowThresholdStudents.length === 0 && (
                <tr>
                  <td colSpan={7 + presentThresholds.length} className="border border-slate-400 text-center py-3 text-slate-400">
                    ไม่พบนักเรียนที่เวลาเรียนต่ำกว่าเกณฑ์
                  </td>
                </tr>
              )}
              {belowThresholdStudents.map((r, i) => {
                const info = extraInfo[r.student.id];
                const prefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, r.student.prefix ?? null);
                return (
                  <tr key={r.student.id}>
                    <td className="border border-slate-400 text-center py-1">{i + 1}</td>
                    <td className="border border-slate-400 text-center py-1">{gradeLevel}</td>
                    <td className="border border-slate-400 text-center py-1">{r.student.seat_number}</td>
                    <td className="border border-slate-400 text-center py-1">{info?.student_code ?? ""}</td>
                    <td className="border border-slate-400 px-2 py-1">{prefix}{r.student.first_name} {r.student.last_name}</td>
                    <td className="border border-slate-400 text-center py-1">{r.total}</td>
                    <td className="border border-slate-400 text-center py-1">{r.absent}</td>
                    {r.belowFlags.map((f, fi) => (
                      <td key={fi} className="border border-slate-400 text-center py-1">{f ? "✓" : ""}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-4 text-sm">จึงเรียนมาเพื่อโปรดทราบและพิจารณาดำเนินการ</p>

          <div className="grid grid-cols-2 gap-8 mt-16">
            <div className="flex justify-center">
              <SignatureField role="ครูประจำวิชา" name={teacherSignatureName || subjectTeacherNameFallback || "......................................."} />
            </div>
            <div className="flex justify-center">
              {readOnly ? (
                <SignatureField role={`หัวหน้าสายชั้นมัธยมศึกษาปีที่ ${gradeLevel || "...."}`} name={gradeHeadName || "......................................."} />
              ) : (
                <div className="text-center">
                  <SignatureField name={gradeHeadName || "......................................."} />
                  <input
                    value={gradeHeadName}
                    onChange={e => setGradeHeadName(e.target.value)}
                    placeholder="พิมพ์ชื่อหัวหน้าสายชั้น"
                    className="print:hidden mt-1 text-xs border-b border-slate-300 text-center focus:outline-none"
                  />
                  <p className="mt-1">หัวหน้าสายชั้นมัธยมศึกษาปีที่ {gradeLevel || "...."}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}