"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, TabStopType, ImageRun, VerticalAlign,
} from "docx";

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

// ★ ขนาดกระดาษ/ขอบกระดาษ A4 แนวตั้ง ตามภาพที่แนบ (หน่วย twips: 1 นิ้ว = 1440 twips, 2.54cm = 1 นิ้ว)
const CM_TO_TWIPS = (cm: number) => Math.round((cm / 2.54) * 1440);
const PAGE_WIDTH_TWIPS = CM_TO_TWIPS(21); // A4 กว้าง 21cm
const MARGIN_TOP = CM_TO_TWIPS(2.54);
const MARGIN_BOTTOM = CM_TO_TWIPS(2.54);
const MARGIN_LEFT = CM_TO_TWIPS(2.54);
const MARGIN_RIGHT = CM_TO_TWIPS(2.22);
const USABLE_WIDTH = PAGE_WIDTH_TWIPS - MARGIN_LEFT - MARGIN_RIGHT;
const CENTER_TAB_POS = Math.round(USABLE_WIDTH / 2); // ★ ตำแหน่งกึ่งกลางหน้ากระดาษ สำหรับให้ "วันที่" เริ่มตรงนี้

const FONT_NAME = "TH Sarabun New";

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

// ★ ดึงเฉพาะเลขชั้นปี (ตัวแรก) เช่น "3/6" -> "3" — ใช้จับคู่หัวหน้าสายชั้น
function extractGradeNumber(label?: string): string {
  if (!label) return "";
  const nums = label.match(/\d+/g);
  return nums && nums.length > 0 ? nums[0] : "";
}

// ★ ตรวจว่าชื่อระดับชั้น (จากตาราง grade_levels.name) เป็นระดับ "มัธยม" หรือไม่
// ป้องกันปัญหาเดิม: จับคำว่า "ม" เฉยๆ จะ match ผิดกับ "ประถม" (ป.3) เพราะคำว่า "ประถม" ก็มีตัว ม อยู่ด้วย
function isSecondaryLevelName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.includes("ประถม")) return false; // กันชนกับคำว่า ป.3 ที่มีตัว ม ปนอยู่ในคำว่า "ประถม"
  return trimmed.includes("มัธยม") || /^ม\.?\s*\d/.test(trimmed);
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
  const [exporting, setExporting] = useState(false);

  const [gradeLevel, setGradeLevel] = useState("");
  const [semester, setSemester] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [deptGroupName, setDeptGroupName] = useState("");

  const [extraInfo, setExtraInfo] = useState<Record<string, ExtraStudentInfo>>({});
  const [attendanceDates, setAttendanceDates] = useState<string[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<DailyRecord[]>([]);

  const [teacherSignatureName, setTeacherSignatureName] = useState("");
  const [gradeHeadName, setGradeHeadName] = useState("");

  const now = useMemo(() => new Date(), []);
  const currentDay = now.getDate();
  const currentMonthTh = THAI_MONTHS[now.getMonth()];
  const currentYearBE = now.getFullYear() + 543;

  // ★ เลขชั้นปีล้วนๆ (ไม่มีเลขห้อง) ใช้แสดงในตำแหน่งหัวหน้าสายชั้น เช่น "3" ไม่ใช่ "3/6"
  const gradeNumberOnly = useMemo(() => extractGradeNumber(classroomLabel), [classroomLabel]);

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
        // join ผ่าน users.grade_level -> grade_levels.name เพื่อดึงชื่อระดับชั้นจริง
        // แก้บั๊กเดิม: ต้องกรองว่าเป็นระดับ "มัธยม" เท่านั้น ไม่ให้ปนกับ "ประถม" ที่เลขชั้นตรงกันบังเอิญ (เช่น ป.3 กับ ม.3)
        if (gradeNumberOnly) {
          const { data: gradeHeadUsers, error: gradeHeadErr } = await supabase
            .from("users")
            .select("title, first_name, last_name, full_name, extra_roles, grade_level:grade_level(name)")
            .not("extra_roles", "is", null)
            .not("grade_level", "is", null);

          if (gradeHeadErr) {
            console.error("[Vp3Report] โหลดรายชื่อหัวหน้าสายชั้นไม่สำเร็จ:", gradeHeadErr);
          } else {
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

              // ★ ต้องเป็นระดับมัธยมเท่านั้น (กันชนกับ ป.3)
              if (!isSecondaryLevelName(gradeName)) return false;

              const gradeNameNumbers = gradeName.match(/\d+/g);
              return gradeNameNumbers?.includes(gradeNumberOnly) ?? false;
            });

            if (head) {
              setGradeHeadName(buildNameWithTitle(head as any));
            } else {
              console.warn("[Vp3Report] ไม่พบหัวหน้าสายชั้นมัธยมที่ตรงกับชั้น", gradeNumberOnly);
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
  }, [sectionId, subjectId, academicYearId, classroomLabel, students, gradeNumberOnly]);

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

  // ★ ส่งออกเป็นไฟล์ Word (.docx) แทน Excel — คงหน้าตาให้ตรงกับต้นฉบับ (แบบวัดผล 3)
  async function handleExportWord() {
    setExporting(true);
    try {
      let logoImageRun: ImageRun | null = null;
      try {
        const logoRes = await fetch("/images.jpg");
        const logoBuffer = await logoRes.arrayBuffer();
        logoImageRun = new ImageRun({
          data: logoBuffer,
          transformation: { width: 70, height: 70 },
          type: "jpg",
        });
      } catch (e) {
        console.warn("โหลดโลโก้ไม่สำเร็จ:", e);
      }

      const dateRunText = `วันที่ ${currentDay} เดือน ${currentMonthTh} พ.ศ. ${currentYearBE}`;

      // ---------- หัวกระดาษ: โลโก้ + ป้าย "แบบวัดผล 3" ----------
      const headerTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 33, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                children: [
                  new Paragraph({
                    children: logoImageRun ? [logoImageRun] : [new TextRun({ text: "" })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 34, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ text: "" })],
              }),
              new TableCell({
                width: { size: 33, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    border: {
                      top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                      bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                      left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                      right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                    },
                    children: [
                      new TextRun({ text: "  แบบวัดผล 3  ", font: FONT_NAME, size: 32, bold: true }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      // ---------- ย่อหน้าต่างๆ ----------
      const titlePara = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 300 },
        children: [new TextRun({ text: "บันทึกข้อความ", font: FONT_NAME, size: 44, bold: true })],
      });

      const orgPara = new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: "ส่วนราชการ", font: FONT_NAME, size: 32, bold: true }),
          new TextRun({ text: `  กลุ่มสาระการเรียนรู้${deptGroupName || "......................................."}`, font: FONT_NAME, size: 32 }),
        ],
      });

      // ★ "วันที่" เริ่มตรงกลางหน้ากระดาษ — ใช้ tab stop กึ่งกลาง usable width
      const datePara = new Paragraph({
        spacing: { after: 100 },
        tabStops: [{ type: TabStopType.LEFT, position: CENTER_TAB_POS }],
        children: [
          new TextRun({ text: "ที่", font: FONT_NAME, size: 32, bold: true }),
          new TextRun({ text: "  โรงเรียนวัดเขียนเขต", font: FONT_NAME, size: 32 }),
          new TextRun({ text: `\t${dateRunText}`, font: FONT_NAME, size: 32 }),
        ],
      });

      const subjectPara = new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: "เรื่อง", font: FONT_NAME, size: 32, bold: true }),
          new TextRun({
            text: `  ขอส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง ${presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด`,
            font: FONT_NAME, size: 32,
          }),
        ],
      });

      const dividerPara = new Paragraph({
        spacing: { after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } },
        children: [new TextRun({ text: "", font: FONT_NAME, size: 32 })],
      });

      const toPara = new Paragraph({
        spacing: { after: 150 },
        children: [
          new TextRun({ text: "เรียน", font: FONT_NAME, size: 32, bold: true }),
          new TextRun({ text: "  ผู้อำนวยการโรงเรียนวัดเขียนเขต", font: FONT_NAME, size: 32 }),
        ],
      });

      const bodyText = `ด้วยครูประจำวิชา ${teacherSignatureName || subjectTeacherNameFallback || "......."} รหัสวิชา ${subjectCode} ระดับชั้นมัธยมศึกษาปีที่ ${gradeNumberOnly || "...."} กลุ่มสาระการเรียนรู้${deptGroupName || "...."} ได้สำรวจเวลาเรียนของนักเรียนในภาคเรียนที่ ${semester || "...."} ปีการศึกษา ${yearLabel || "...."} พบว่ามีนักเรียนที่มีเวลาเรียนไม่ถึง ${presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด จำนวน ${belowThresholdStudents.length} คน ดังรายชื่อต่อไปนี้`;
      const bodyPara = new Paragraph({
        spacing: { after: 250 },
        indent: { firstLine: 400 },
        children: [new TextRun({ text: bodyText, font: FONT_NAME, size: 32 })],
      });

      // ---------- ตารางรายชื่อ ----------
      const headerCellStyle = (text: string, colSpan = 1) =>
        new TableCell({
          columnSpan: colSpan,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text, font: FONT_NAME, size: 28, bold: true })],
            }),
          ],
        });

      const dataCell = (text: string, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.CENTER) =>
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: align,
              children: [new TextRun({ text, font: FONT_NAME, size: 28 })],
            }),
          ],
        });

      const headerRow1 = new TableRow({
        tableHeader: true,
        children: [
          headerCellStyle("ที่"),
          headerCellStyle("ชั้น/ห้อง"),
          headerCellStyle("เลขที่"),
          headerCellStyle("เลขประจำตัว"),
          headerCellStyle("ชื่อ-สกุล"),
          headerCellStyle("เวลาเรียน(คาบ)", 2),
          headerCellStyle("มีเวลาเรียนไม่ถึง", presentThresholds.length),
        ],
      });
      const headerRow2 = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({ children: [new Paragraph("")] }),
          new TableCell({ children: [new Paragraph("")] }),
          new TableCell({ children: [new Paragraph("")] }),
          new TableCell({ children: [new Paragraph("")] }),
          new TableCell({ children: [new Paragraph("")] }),
          headerCellStyle("เต็ม"),
          headerCellStyle("ขาดเรียน"),
          ...presentThresholds.map(t => headerCellStyle(`${t}%`)),
        ],
      });

      const dataRows = belowThresholdStudents.map((r, i) => {
        const info = extraInfo[r.student.id];
        const prefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, r.student.prefix ?? null);
        return new TableRow({
          children: [
            dataCell(String(i + 1)),
            dataCell(gradeLevel),
            dataCell(String(r.student.seat_number)),
            dataCell(info?.student_code ?? ""),
            dataCell(`${prefix}${r.student.first_name} ${r.student.last_name}`, AlignmentType.LEFT),
            dataCell(String(r.total)),
            dataCell(String(r.absent)),
            ...r.belowFlags.map(f => dataCell(f ? "✓" : "")),
          ],
        });
      });

      const totalCols = 7 + presentThresholds.length;
      const emptyRow =
        belowThresholdStudents.length === 0
          ? [
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: totalCols,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: "ไม่พบนักเรียนที่เวลาเรียนต่ำกว่าเกณฑ์", font: FONT_NAME, size: 28 })],
                      }),
                    ],
                  }),
                ],
              }),
            ]
          : [];

      const mainTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        },
        rows: [headerRow1, headerRow2, ...dataRows, ...emptyRow],
      });

      const closingPara = new Paragraph({
        spacing: { before: 250, after: 500 },
        children: [new TextRun({ text: "จึงเรียนมาเพื่อโปรดทราบและพิจารณาดำเนินการ", font: FONT_NAME, size: 32 })],
      });

      // ---------- ส่วนลงชื่อ (2 ตำแหน่ง: ครูประจำวิชา / หัวหน้าสายชั้น) ----------
      const teacherName = teacherSignatureName || subjectTeacherNameFallback || ".......................................";
      const headName = gradeHeadName || ".......................................";
      // ★ ตำแหน่งไม่มีเลขห้อง ใช้เฉพาะเลขชั้นปี เช่น "หัวหน้าสายชั้นมัธยมศึกษาปีที่ 3"
      const headRoleText = `หัวหน้าสายชั้นมัธยมศึกษาปีที่ ${gradeNumberOnly || "...."}`;

      const signatureTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ลงชื่อ.......................................", font: FONT_NAME, size: 32 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `(${teacherName})`, font: FONT_NAME, size: 32 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ครูประจำวิชา", font: FONT_NAME, size: 32 })] }),
                ],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ลงชื่อ.......................................", font: FONT_NAME, size: 32 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `(${headName})`, font: FONT_NAME, size: 32 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headRoleText, font: FONT_NAME, size: 32 })] }),
                ],
              }),
            ],
          }),
        ],
      });

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                size: { width: PAGE_WIDTH_TWIPS, height: CM_TO_TWIPS(29.7) }, // A4: 21 x 29.7 cm
                margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
              },
            },
            children: [
              headerTable,
              new Paragraph({ text: "" }),
              titlePara,
              orgPara,
              datePara,
              subjectPara,
              dividerPara,
              toPara,
              bodyPara,
              mainTable,
              closingPara,
              signatureTable,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `แบบวัดผล3_${subjectCode}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("ส่งออกไฟล์ Word ไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setExporting(false);
    }
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

        /* ★ ขอบกระดาษ A4 แนวตั้ง ตามภาพที่แนบ: บน 2.54 / ล่าง 2.54 / ซ้าย 2.54 / ขวา 2.22 */
        @media print {
          @page { size: A4 portrait; margin: 2.54cm 2.22cm 2.54cm 2.54cm; }
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
          <button
            onClick={handleExportWord}
            disabled={exporting}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm shadow"
          >
            📄 {exporting ? "กำลังสร้างไฟล์..." : "ส่งออก Word"}
          </button>
          <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-sm shadow">
            🖨️ พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
      </div>

      {error && <p className="print:hidden text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      <div className="bg-slate-100 print:bg-transparent rounded-2xl p-4 sm:p-8 print:p-0 overflow-x-auto">
        <div
          className="vp3-print-area relative bg-white rounded-2xl border border-slate-200 shadow-lg print:border-0 print:shadow-none print:p-0 mx-auto"
          style={{
            maxWidth: "210mm",
            width: "100%",
            paddingTop: "2.54cm",
            paddingBottom: "2.54cm",
            paddingLeft: "2.54cm",
            paddingRight: "2.22cm",
          }}
        >
          <div className="flex items-start justify-between mb-2">
            <div style={{ width: "2cm", height: "2cm" }} className="shrink-0 flex items-center justify-center">
              <img src="/images.jpg" alt="ตราครุฑ" className="w-full h-full object-contain" />
            </div>
            <div className="border border-slate-400 rounded px-2 py-1 font-bold whitespace-nowrap self-start">
              แบบวัดผล 3
            </div>
          </div>

          <p className="text-center font-bold mb-4" style={{ fontSize: "22px" }}>บันทึกข้อความ</p>

          <div className="space-y-1">
            <p><span className="font-bold">ส่วนราชการ</span>&nbsp;&nbsp;กลุ่มสาระการเรียนรู้{deptGroupName || "......................................."}</p>
            {/* ★ "วันที่" เริ่มตรงกลางหน้ากระดาษ — ใช้ absolute left-1/2 เทียบกับกล่องเอกสาร (ซึ่งกำหนด padding เป็นระยะขอบกระดาษแล้ว) */}
            <p className="relative">
              <span className="font-bold">ที่</span>&nbsp;&nbsp;โรงเรียนวัดเขียนเขต
              <span className="absolute" style={{ left: "50%" }}>
                วันที่ {currentDay} เดือน {currentMonthTh} พ.ศ. {currentYearBE}
              </span>
            </p>
            <p><span className="font-bold">เรื่อง</span>&nbsp;&nbsp;ขอส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง {presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด</p>
            <div className="border-t border-slate-400 my-2" />
            <p><span className="font-bold">เรียน</span>&nbsp;&nbsp;ผู้อำนวยการโรงเรียนวัดเขียนเขต</p>
            <p className="indent-8 leading-relaxed">
              ด้วยครูประจำวิชา {teacherSignatureName || subjectTeacherNameFallback || "......................"} รหัสวิชา {subjectCode} ระดับชั้นมัธยมศึกษาปีที่ {gradeNumberOnly || "......"} กลุ่มสาระการเรียนรู้{deptGroupName || "......................"} ได้สำรวจเวลาเรียนของนักเรียนในภาคเรียนที่ {semester || "..."} ปีการศึกษา {yearLabel || "........"} พบว่ามีนักเรียนที่มีเวลาเรียนไม่ถึง {presentThresholds.join("% และ ")}% ของเวลาเรียนทั้งหมด จำนวน {belowThresholdStudents.length} คน ดังรายชื่อต่อไปนี้
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
                role={`หัวหน้าสายชั้นมัธยมศึกษาปีที่ ${gradeNumberOnly || "...."}`}
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