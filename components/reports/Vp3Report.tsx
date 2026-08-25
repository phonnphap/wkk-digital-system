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

type Status = "present" | "absent" | "late" | "leave" | "excused";

type DailyRecord = {
  student_id: string;
  attendance_date: string;
  status: Status;
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

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

// ★ ดึงเฉพาะ "เลขชั้นปี" ตัวแรก เช่น "ม.3/6" หรือ "3/6" -> "3" (ใช้จับคู่กับหัวหน้าสายชั้น)
function extractGradeNumber(label?: string): string {
  if (!label) return "";
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return "";
  return nums[0];
}

// ★ แก้ปัญหาเดิม: ชื่อในวงเล็บซ้อนทับกับคำว่า "ครูประจำวิชา" —
// ใช้วิธีเดียวกับ Vp2Report คือวาง (ชื่อ) และตำแหน่ง (role) ซ้อนกันเป็น block
// ภายใน span เดียวกันที่ position:absolute ใต้เส้นประ แทนการแยกเป็นคนละ <p>
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
    <div
      className="inline-block text-center"
      style={{ paddingBottom: role ? "3.4rem" : "1.9rem" }}
    >
      <p className="whitespace-nowrap inline-flex items-baseline justify-center">
        <span>ลงชื่อ</span>
        <span className="relative inline-block mx-1" style={{ width: lineWidth }}>
          <span className="block border-b border-dotted border-slate-500">&nbsp;</span>
          <span className="absolute left-0 right-0 top-full mt-1 text-center" style={{ whiteSpace: "normal" }}>
            <span className="block whitespace-nowrap">({name})</span>
            {role && <span className="block whitespace-nowrap mt-0.5">{role}</span>}
          </span>
        </span>
      </p>
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
  presentThresholds = [60, 80],
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
  const [gradeHeadName, setGradeHeadName] = useState("");

  // ★ วันที่ปัจจุบัน ณ ตอนเปิดหน้านี้ (ไม่ผูกกับข้อมูลอื่น)
  const now = useMemo(() => new Date(), []);
  const currentDay = now.getDate();
  const currentMonthTh = THAI_MONTHS[now.getMonth()];
  const currentYearBE = now.getFullYear() + 543;

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

        // ★ หัวหน้าสายชั้น — ดึงจาก users.extra_roles ที่มีคำว่า "grade_head"
        // และตรงกับเลขชั้นปีของห้องที่ครูสอน (เช่น สอน ม.3/6 -> เลขชั้น "3")
        // หมายเหตุ: สมมติว่ารูปแบบใน extra_roles เป็น string ที่มีทั้งคำว่า "grade_head"
        // และเลขชั้นปีอยู่ด้วย เช่น "grade_head_3" — ถ้ารูปแบบจริงต่างจากนี้ ปรับเงื่อนไข includes() ด้านล่างได้เลย
        const gradeNumber = extractGradeNumber(classroomLabel);
if (gradeNumber) {
  // ★ users.grade_level เป็น FK ไปยังตารางระดับชั้น (เช่น grade_levels)
  // join เพื่อดึงคอลัมน์ "name" ของระดับชั้นนั้นมาด้วย
  const { data: gradeHeadUsers, error: gradeHeadErr } = await supabase
    .from("users")
    .select("title, first_name, last_name, full_name, extra_roles, grade_level:grade_level(name)")
    .not("extra_roles", "is", null)
    .not("grade_level", "is", null);

  if (gradeHeadErr) {
    console.error("[Vp3Report] โหลดรายชื่อหัวหน้าสายชั้นไม่สำเร็จ:", gradeHeadErr);
  } else {
    console.log("[Vp3Report] gradeHeadUsers:", gradeHeadUsers); // ★ debug: เปิด console เช็ค shape ของ grade_level.name

    const head = (gradeHeadUsers ?? []).find((u: any) => {
      const roles: unknown = u.extra_roles;
      const isGradeHead =
        Array.isArray(roles) &&
        roles.some((r: any) => typeof r === "string" && r.includes("grade_head"));
      if (!isGradeHead) return false;

      const gradeLevelRel: any = u.grade_level;
      const gradeName: string | undefined = Array.isArray(gradeLevelRel)
        ? gradeLevelRel[0]?.name
        : gradeLevelRel?.name;
      if (!gradeName) return false;

      // ★ เทียบแบบ substring กันกรณีชื่อชั้นเก็บเป็น "ม.3", "มัธยมศึกษาปีที่ 3", หรือ "3" เฉยๆ
      const gradeNameNumbers = gradeName.match(/\d+/g);
      return gradeNameNumbers?.includes(gradeNumber) ?? false;
    });

    if (head) {
      setGradeHeadName(buildNameWithTitle(head as any));
    } else {
      console.warn("[Vp3Report] ไม่พบหัวหน้าสายชั้นที่ตรงกับชั้น", gradeNumber);
    }
  }
}

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

  const belowThresholdStudents = useMemo(() => {
    const total = attendanceDates.length;

    return students
      .map(s => {
        const counts: Record<Status, number> = { present: 0, absent: 0, late: 0, leave: 0, excused: 0 };
        attendanceRecords
          .filter(r => r.student_id === s.id)
          .forEach(r => { counts[r.status]++; });

        const present = counts.present + counts.late;
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
    const COLS = 5 + presentThresholds.length + 2;

    // ★ ฟอนต์ default ของทั้งชีท ให้ตรงกับที่ใช้ในหน้าเว็บ (TH Sarabun New, 16)
    ws.properties.defaultRowHeight = 20;

    try {
      // ★ ตราครุฑ — ดึงจาก public/images.jpg (D:\WEB\school-app\public\images.jpg)
      const logoRes = await fetch("/images.jpg");
      const logoBuffer = await logoRes.arrayBuffer();
      const logoId = wb.addImage({ buffer: logoBuffer, extension: "jpeg" });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 85, height: 85 } });
    } catch (e) {
      console.warn("โหลดโลโก้ไม่สำเร็จ:", e);
    }

    const tagCell = ws.getCell(1, COLS);
    tagCell.value = "แบบวัดผล 3";
    tagCell.font = { name: "TH Sarabun New", size: 16, bold: true };
    tagCell.alignment = { horizontal: "center", vertical: "middle" };
    tagCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };

    let row = 6;
    ws.mergeCells(row, 1, row, COLS);
    const titleCell = ws.getCell(row, 1);
    titleCell.value = "บันทึกข้อความ";
    titleCell.font = { name: "TH Sarabun New", size: 22, bold: true };
    titleCell.alignment = { horizontal: "center" };
    row++;

    const dateText = `วันที่ ${currentDay} เดือน ${currentMonthTh} พ.ศ. ${currentYearBE}`;
    const memoLines: { label: string; rest: string }[] = [
      { label: "ส่วนราชการ", rest: `  กลุ่มสาระการเรียนรู้${deptGroupName || "......................................."}` },
      { label: "ที่", rest: `  โรงเรียนวัดเขียนเขต                                    ${dateText}` },
      { label: "เรื่อง", rest: `  ขอส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง ${presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด` },
    ];
    memoLines.forEach(({ label, rest }) => {
      ws.mergeCells(row, 1, row, COLS);
      const c = ws.getCell(row, 1);
      c.value = `${label}${rest}`;
      c.font = { name: "TH Sarabun New", size: 16 };
      c.alignment = { horizontal: "left", wrapText: true };
      row++;
    });

    row++;
    ws.mergeCells(row, 1, row, COLS);
    const toCell = ws.getCell(row, 1);
    toCell.value = "เรียน  ผู้อำนวยการโรงเรียนวัดเขียนเขต";
    toCell.font = { name: "TH Sarabun New", size: 16 };
    row++;

    ws.mergeCells(row, 1, row, COLS);
    const bodyCell = ws.getCell(row, 1);
    bodyCell.value = `ด้วยครูประจำวิชา ${teacherSignatureName || subjectTeacherNameFallback || "......."} รหัสวิชา ${subjectCode} ระดับชั้นมัธยมศึกษาปีที่ ${gradeLevel || "...."} กลุ่มสาระการเรียนรู้${deptGroupName || "...."} ได้สำรวจเวลาเรียนของนักเรียนในภาคเรียนที่ ${semester || "...."} ปีการศึกษา ${yearLabel || "...."} พบว่ามีนักเรียนที่มีเวลาเรียนไม่ถึง ${presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด จำนวน ${belowThresholdStudents.length} คน ดังรายชื่อต่อไปนี้`;
    bodyCell.font = { name: "TH Sarabun New", size: 16 };
    bodyCell.alignment = { horizontal: "left", wrapText: true };
    row += 2;

    const headers = ["ที่", "ชั้น/ห้อง", "เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", "เต็ม (คาบ)", "ขาดเรียน", ...presentThresholds.map(t => `ไม่ถึง ${t}%`)];
    headers.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = { name: "TH Sarabun New", size: 16, bold: true };
      c.alignment = { horizontal: "center", wrapText: true };
      c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
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
        c.font = { name: "TH Sarabun New", size: 16 };
        c.alignment = { horizontal: ci === 4 ? "left" : "center" };
        c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
      row++;
    });

    row += 2;
    ws.mergeCells(row, 1, row, COLS);
    const closingCell = ws.getCell(row, 1);
    closingCell.value = "จึงเรียนมาเพื่อโปรดทราบและพิจารณาดำเนินการ";
    closingCell.font = { name: "TH Sarabun New", size: 16 };
    row += 3;

    const writeSignature = (r: number, colStart: number, colEnd: number, name: string, role: string) => {
      ws.mergeCells(r, colStart, r, colEnd);
      const lineCell = ws.getCell(r, colStart);
      lineCell.value = "ลงชื่อ.......................................";
      lineCell.font = { name: "TH Sarabun New", size: 16 };
      lineCell.alignment = { horizontal: "center" };

      ws.mergeCells(r + 1, colStart, r + 1, colEnd);
      const nameCell = ws.getCell(r + 1, colStart);
      nameCell.value = `(${name})`;
      nameCell.font = { name: "TH Sarabun New", size: 16 };
      nameCell.alignment = { horizontal: "center" };

      ws.mergeCells(r + 2, colStart, r + 2, colEnd);
      const roleCell = ws.getCell(r + 2, colStart);
      roleCell.value = role;
      roleCell.font = { name: "TH Sarabun New", size: 16 };
      roleCell.alignment = { horizontal: "center" };
    };
    const half = Math.floor(COLS / 2);
    writeSignature(row, 1, half, teacherSignatureName || subjectTeacherNameFallback || ".......................................", "ครูประจำวิชา");
    writeSignature(row, half + 1, COLS, gradeHeadName || ".......................................", `หัวหน้าสายชั้นมัธยมศึกษาปีที่ ${gradeLevel || "...."}`);

    // ★ ปรับความกว้างคอลัมน์ให้พอดีเนื้อหา (โดยเฉพาะคอลัมน์ชื่อ-สกุล)
    ws.columns = [
      { width: 6 },
      { width: 10 },
      { width: 8 },
      { width: 14 },
      { width: 32 },
      { width: 10 },
      { width: 10 },
      ...presentThresholds.map(() => ({ width: 10 })),
    ];

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
      <style>{`
        @font-face {
          font-family: 'THSarabunReport';
          src: url('/fonts/THSarabun.ttf') format('truetype');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'THSarabunReport';
          src: url('/fonts/THSarabun-Bold.ttf') format('truetype');
          font-weight: 700;
          font-style: normal;
          font-display: swap;
        }

        .vp3-print-area,
        .vp3-print-area * {
          font-family: 'THSarabunReport', 'TH Sarabun New UI', sans-serif !important;
        }
        .vp3-print-area { font-size: 16px; }

        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .vp3-report-root, .vp3-report-root * { visibility: visible; }
          .vp3-report-root { position: absolute; left: 0; top: 0; width: 100%; }
          .vp3-print-area { padding: 0 !important; }
        }
      `}</style>

      <div className="vp3-report-root">
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
        <div
          className="vp3-print-area relative bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-12 print:border-0 print:shadow-none print:p-0 mx-auto"
          style={{ maxWidth: "210mm", width: "100%" }}
        >
          <div className="flex items-start justify-between mb-2">
            <div style={{ width: "2.5cm", height: "2.5cm" }} className="shrink-0 flex items-center justify-center">
              {/* ★ ตราครุฑ — ดึงจาก public/images.jpg (D:\WEB\school-app\public\images.jpg) */}
              <img src="/images.jpg" alt="ตราครุฑ" className="w-full h-full object-contain" />
            </div>
            <div className="border border-slate-400 rounded px-2 py-1 font-bold whitespace-nowrap self-start">
              แบบวัดผล 3
            </div>
          </div>

          <p className="text-center font-bold mb-4" style={{ fontSize: "22px" }}>บันทึกข้อความ</p>

          <div className="space-y-1">
            <p><span className="font-bold">ส่วนราชการ</span>&nbsp;&nbsp;กลุ่มสาระการเรียนรู้{deptGroupName || "......................................."}</p>
            <p>
              <span className="font-bold">ที่</span>&nbsp;&nbsp;โรงเรียนวัดเขียนเขต
              <span className="ml-16">วันที่ {currentDay} เดือน {currentMonthTh} พ.ศ. {currentYearBE}</span>
            </p>
            <p><span className="font-bold">เรื่อง</span>&nbsp;&nbsp;ขอส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง {presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด</p>
            <div className="border-t border-slate-400 my-2" />
            <p><span className="font-bold">เรียน</span>&nbsp;&nbsp;ผู้อำนวยการโรงเรียนวัดเขียนเขต</p>
            <p className="indent-8 leading-relaxed">
              ด้วยครูประจำวิชา {teacherSignatureName || subjectTeacherNameFallback || "......................"} รหัสวิชา {subjectCode} ระดับชั้นมัธยมศึกษาปีที่ {gradeLevel || "......"} กลุ่มสาระการเรียนรู้{deptGroupName || "......................"} ได้สำรวจเวลาเรียนของนักเรียนในภาคเรียนที่ {semester || "..."} ปีการศึกษา {yearLabel || "........"} พบว่ามีนักเรียนที่มีเวลาเรียนไม่ถึง {presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด จำนวน {belowThresholdStudents.length} คน ดังรายชื่อต่อไปนี้
            </p>
          </div>

          <table className="w-full border-collapse mt-4">
            <thead>
              <tr>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-bold whitespace-nowrap">ที่</th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-bold whitespace-nowrap">ชั้น/ห้อง</th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-bold whitespace-nowrap">เลขที่</th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-bold whitespace-nowrap">เลขประจำตัว</th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-bold whitespace-nowrap">ชื่อ-สกุล</th>
                <th colSpan={2} className="border border-slate-400 px-2 py-1 font-bold whitespace-nowrap">เวลาเรียน(คาบ)</th>
                <th colSpan={presentThresholds.length} className="border border-slate-400 px-2 py-1 font-bold whitespace-nowrap">มีเวลาเรียนไม่ถึง</th>
              </tr>
              <tr>
                <th className="border border-slate-400 px-2 py-1 font-bold whitespace-nowrap">เต็ม</th>
                <th className="border border-slate-400 px-2 py-1 font-bold whitespace-nowrap">ขาดเรียน</th>
                {presentThresholds.map(t => (
                  <th key={t} className="border border-slate-400 px-2 py-1 font-bold whitespace-nowrap">{t}%</th>
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
                    <td className="border border-slate-400 text-center py-1 whitespace-nowrap">{gradeLevel}</td>
                    <td className="border border-slate-400 text-center py-1">{r.student.seat_number}</td>
                    <td className="border border-slate-400 text-center py-1 whitespace-nowrap">{info?.student_code ?? ""}</td>
                    <td className="border border-slate-400 px-2 py-1 whitespace-nowrap">{prefix}{r.student.first_name} {r.student.last_name}</td>
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

          <p className="mt-4">จึงเรียนมาเพื่อโปรดทราบและพิจารณาดำเนินการ</p>

          <div className="grid grid-cols-2 gap-8 mt-16">
            <div className="flex justify-center">
              <SignatureField role="ครูประจำวิชา" name={teacherSignatureName || subjectTeacherNameFallback || "......................................."} />
            </div>
            <div className="flex justify-center">
              <SignatureField
                role={`หัวหน้าสายชั้นมัธยมศึกษาปีที่ ${gradeLevel || "...."}`}
                name={gradeHeadName || "......................................."}
              />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}