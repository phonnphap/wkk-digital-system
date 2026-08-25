"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// ★ ส่งออก Excel — ใช้ไลบรารี SheetJS (ฝั่ง client, ไม่ต้องมี backend)
// ถ้ายังไม่มีในโปรเจกต์ ให้รัน: npm install xlsx
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
  gender: string | null; // "male" | "female"
};

type Assignment = {
  id: string;
  max_score: number;
  weight_percent?: number;
  allow_weight?: boolean;
  status?: string;
};
type Submission = { assignment_id: string; student_id: string; score: number | null };
type ExamScore = { student_id: string; exam_type: "midterm" | "final"; score: number | null };
// ★ เพิ่ม: ต้องดึงคะแนนพิเศษ (preset/scoreEvents) มาด้วย เพื่อให้ "คะแนนเก็บ" ตรงกับ
// ช่อง "รวม" (grandTotal = assignmentTotal + specialTotal) ในหน้าคะแนนรวม (GradeOverviewTool)
type Preset = { id: string; label: string; points: number; emoji: string; sort_order: number };
type ScoreEvent = { id: string; student_id: string; preset_id: string; points: number };

function isWeighted(a: Assignment): boolean {
  return !!(a.allow_weight && a.weight_percent != null && (a.max_score ?? 0) > 0);
}
function getAssignmentMaxContribution(a: Assignment): number {
  return isWeighted(a) ? (a.weight_percent as number) : (a.max_score ?? 0);
}
function getAssignmentWeightedScore(a: Assignment, raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (isWeighted(a)) return (raw / (a.max_score || 1)) * (a.weight_percent as number);
  return raw;
}
function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function applyRounding(n: number, mode: "up" | "truncate"): number {
  return mode === "up" ? Math.ceil(n) : Math.floor(n);
}

// ★ คำนวณอายุ ณ วันนี้ (ปี)
function calcAge(birthDateStr: string): number {
  const bd = new Date(birthDateStr);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

// ★ คำนำหน้าอัตโนมัติจากเพศ+อายุ (เกิน 15 ปี => นาย/นางสาว) ตามที่ตกลง — อิงอายุ ณ วันที่พิมพ์เอกสาร
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

// ★ รวมคำนำหน้า (title) + ชื่อเต็ม ให้แน่ใจว่ามีคำนำหน้าเสมอ (แม้ full_name จะไม่มีคำนำหน้าติดมาด้วยก็ตาม)
// หมายเหตุ: ตาราง "users" เก็บคำนำหน้าไว้ในคอลัมน์ชื่อ "title" (ไม่ใช่ "prefix") — ถ้าคอลัมน์จริงชื่ออื่น แจ้งได้เลย
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
  // ถ้า full_name ที่ดึงมามีคำนำหน้าติดอยู่แล้ว ไม่ต้องซ้ำ
  if (title && base.startsWith(title)) return base;
  return `${title}${base}`;
}

/* =========================================================================
   ★ ช่องลงชื่อ — ทำให้ "ชื่อในวงเล็บ" อยู่กึ่งกลางใต้ "เส้นประ" เป๊ะเสมอ
   ไม่ว่าคำต่อท้ายเส้นประ (เช่น "ครูประจำวิชา") จะสั้นหรือยาวแค่ไหนก็ตาม
   หลักการ: เส้นประเป็น span ความกว้างคงที่ (lineWidth) ที่มี position:relative
   แล้ววางชื่อ (และบรรทัดตำแหน่งเพิ่มเติมถ้ามี) เป็น position:absolute ยึดกับ
   span นั้นโดยตรง จึงกึ่งกลางตรงกับเส้นประเสมอ ไม่ขึ้นกับความยาวข้อความรอบข้าง
   ========================================================================= */
function SignatureField({
  role,
  name,
  extraLine,
  lineWidth = "9rem",
}: {
  role?: string;
  name: string;
  extraLine?: string;
  lineWidth?: string;
}) {
  return (
    <div
      className="inline-block text-center"
      style={{ paddingBottom: extraLine ? "3.4rem" : "1.9rem" }}
    >
      <p className="whitespace-nowrap inline-flex items-baseline justify-center">
        <span>ลงชื่อ</span>
        <span className="relative inline-block mx-1" style={{ width: lineWidth }}>
          <span className="block border-b border-dotted border-slate-500">&nbsp;</span>
          <span
            className="absolute left-0 right-0 top-full mt-1 text-center"
            style={{ whiteSpace: extraLine ? "normal" : "nowrap" }}
          >
            <span className="block whitespace-nowrap">({name})</span>
            {extraLine && <span className="block whitespace-nowrap mt-0.5">{extraLine}</span>}
          </span>
        </span>
        {role && <span>{role}</span>}
      </p>
    </div>
  );
}

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
  unitMaxScore = 70,
  midtermMaxScore = 0,
  gradeRoundingMode = "truncate", 
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
  currentUserId?: string;
  readOnly?: boolean;
  unitMaxScore?: number;
  midtermMaxScore?: number;
  gradeRoundingMode?: "up" | "truncate";
  subjectTeacherNameFallback?: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState("");
  const [semester, setSemester] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [creditHours, setCreditHours] = useState<string>("");

  const [extraInfo, setExtraInfo] = useState<Record<string, ExtraStudentInfo>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [examScores, setExamScores] = useState<ExamScore[]>([]);
  // ★ เพิ่ม state คะแนนพิเศษ ให้สอดคล้องกับหน้าคะแนนรวม
  const [presets, setPresets] = useState<Preset[]>([]);
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const [teacherSignatureName, setTeacherSignatureName] = useState("");
  const [deptHeadName, setDeptHeadName] = useState("");
  // ★ ชื่อกลุ่มสาระของหัวหน้า (เช่น "วิทยาศาสตร์และเทคโนโลยี") ดึงจาก users.department_id -> departments.name
  const [deptName, setDeptName] = useState("");
  const directorName = "นายธนณัฐ ศิระวงษ์";

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // ข้อมูลรายวิชา
        const { data: subj } = await supabase
          .from("subjects")
          .select("subject_type, credit_hours")
          .eq("id", subjectId)
          .maybeSingle();
        if (subj) {
          setSubjectType(subj.subject_type === "additional" ? "เพิ่มเติม" : "พื้นฐาน");
          setCreditHours(subj.credit_hours != null ? String(subj.credit_hours) : "");
        }

        // ครูประจำวิชา + หัวหน้ากลุ่มสาระ
        const { data: sectionRow } = await supabase
          .from("subject_sections")
          .select("teacher_id")
          .eq("id", sectionId)
          .maybeSingle();

        if (sectionRow?.teacher_id) {
          // ★ ดึงคำนำหน้าจากคอลัมน์ "title" ของตาราง users
          // ★ join ตาราง departments ผ่าน department_id เพื่อเอาค่า "name" (ชื่อกลุ่มสาระ) แทนที่จะโชว์ id
          const { data: teacher, error: teacherErr } = await supabase
            .from("users")
            .select("title, first_name, last_name, full_name, department_id, departments:department_id(name)")
            .eq("id", sectionRow.teacher_id)
            .maybeSingle();

          if (teacherErr) console.error("[Vp2Report] โหลดชื่อครูประจำวิชาไม่สำเร็จ:", teacherErr);

          if (teacher) {
            console.log("[Vp2Report] teacher row:", teacher); // ★ debug: เปิด console ดูว่าคอลัมน์ title/departments มาจริงไหม
            setTeacherSignatureName(buildNameWithTitle(teacher as any));

            const deptRel: any = (teacher as any).departments;
            const teacherDeptName = Array.isArray(deptRel) ? deptRel[0]?.name : deptRel?.name;
            if (teacherDeptName) setDeptName(teacherDeptName);

            if (teacher.department_id) {
  // ★ debug: ดึงผู้ใช้ทุกคนที่มี role "subject_dept_head" มาดูก่อน ไม่กรอง department_id
  // เพื่อเช็คว่า department_id ของแต่ละคนตรงกับของครูประจำวิชาจริงไหม
  const { data: deptUsers, error: allHeadsErr } = await supabase
  .from("users")
  .select("title, first_name, last_name, full_name, department_id, extra_roles")
  .eq("department_id", teacher.department_id);

if (allHeadsErr) {
  console.error("[Vp2Report] โหลดรายชื่อผู้ใช้ในกลุ่มสาระไม่สำเร็จ:", allHeadsErr);
} else {
  // ★ เช็คแบบ substring กันกรณีข้อมูลเก่าเก็บ role รวมกันเป็น string เดียว
  // เช่น ["subject_teacher, subject_dept_head"] แทนที่จะเป็น ["subject_teacher", "subject_dept_head"]
  const head = (deptUsers ?? []).find((u: any) => {
    const roles: unknown = u.extra_roles;
    if (Array.isArray(roles)) {
      return roles.some((r: any) => typeof r === "string" && r.includes("subject_dept_head"));
    }
    return false;
  });

   if (head) {
    console.log("[Vp2Report] deptHead row (matched):", head);
    setDeptHeadName(buildNameWithTitle(head as any));
  } else {
    console.warn("[Vp2Report] ไม่พบหัวหน้ากลุ่มสาระในกลุ่มสาระ department_id =", teacher.department_id);
  }
}
            }

          } else {
            console.warn("[Vp2Report] ไม่พบข้อมูลครูประจำวิชา teacher_id =", sectionRow.teacher_id);
          }
        } else {
          console.warn("[Vp2Report] section นี้ยังไม่มี teacher_id ผูกไว้");
        }

        // ปีการศึกษา / ภาคเรียน / ชั้น
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

        // ★ ข้อมูลนักเรียนเพิ่มเติม: รหัส นร. / วันเกิด / เพศ (ใช้คำนวณคำนำหน้าอัตโนมัติ)
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

        // ★ คะแนนจริง — ดึงจาก endpoint เดียวกับหน้า "คะแนนรวม" (ไม่กรอกซ้ำเอง)
        const gradeRes = await fetch(`/api/subject-grades/summary?subject_section_id=${sectionId}`);
        const gradeJson = await gradeRes.json();
        if (gradeRes.ok) {
          setAssignments((gradeJson.assignments ?? []).filter((a: Assignment) => a.status !== "draft"));
          setSubmissions(gradeJson.submissions ?? []);
          setExamScores(gradeJson.examScores ?? []);
          // ★ เพิ่ม: ดึงคะแนนพิเศษ (preset/scoreEvents) เหมือนหน้าคะแนนรวม
          setPresets(gradeJson.presets ?? []);
          setScoreEvents(gradeJson.scoreEvents ?? []);
        }

        // หมายเหตุที่เคยกรอกไว้ (ถ้ามี)
        const { data: remarkRows, error: remarkErr } = await supabase
          .from("vp2_progress_scores")
          .select("student_id, remark")
          .eq("subject_section_id", sectionId);
        if (!remarkErr && remarkRows) {
          const rmap: Record<string, string> = {};
          remarkRows.forEach((r: any) => { rmap[r.student_id] = r.remark ?? ""; });
          setRemarks(rmap);
        }
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [sectionId, subjectId, academicYearId, classroomLabel, students]);

  // ★ คะแนนเต็มรวมของชุดงานทั้งหมด (ใช้แสดงหัวตาราง แทนเลข 70 ตายตัว)
  const totalMaxScore = useMemo(
    () => assignments.reduce((sum, a) => sum + getAssignmentMaxContribution(a), 0),
    [assignments]
  );

  // ★ แก้ไข: "หน่วยการเรียน" ต้องเป็นคะแนนดิบรวม (assignmentTotal + specialTotal) เหมือนช่อง "รวม"
  // ในหน้าคะแนนรวม (GradeOverviewTool) ตรงๆ ไม่ต้อง scale เทียบกับ unitMaxScore (70) อีกต่อไป
  const scoreByStudent = useMemo(() => {
  const map: Record<string, { unit: number; midterm: number | null; total: number }> = {};
  students.forEach(s => {
    const subMap: Record<string, Submission> = {};
    submissions.filter(sub => sub.student_id === s.id).forEach(sub => { subMap[sub.assignment_id] = sub; });
    const assignmentTotal = assignments.reduce(
      (sum, a) => sum + getAssignmentWeightedScore(a, subMap[a.id]?.score),
      0
    );
    const specialTotal = scoreEvents
      .filter(ev => ev.student_id === s.id)
      .reduce((sum, ev) => sum + ev.points, 0);

    // ★ คะแนนดิบรวม ตรงกับช่อง "รวม" ในหน้าคะแนนรวม
    const rawUnit = assignmentTotal + specialTotal;

    // ★ ตัดเศษตามที่ตั้งค่าไว้ในรายวิชา แทนการโชว์ทศนิยม
    const scaledUnit = applyRounding(rawUnit, gradeRoundingMode);

    const midtermRaw = examScores.find(e => e.student_id === s.id && e.exam_type === "midterm")?.score ?? null;
const midterm = midtermRaw !== null ? applyRounding(midtermRaw, gradeRoundingMode) : null;
const total = applyRounding(scaledUnit + (midterm ?? 0), gradeRoundingMode);
map[s.id] = { unit: scaledUnit, midterm, total };
  });
  return map;
}, [students, submissions, assignments, examScores, scoreEvents, gradeRoundingMode]);

function formatGradeLevel(label?: string): string {
  if (!label) return "";
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return label.trim();
  if (nums.length === 1) return nums[0];
  return `${nums[0]}/${nums[nums.length - 1]}`;
}

  async function handleSaveRemarks() {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const payload = students.map(s => ({
        subject_section_id: sectionId,
        student_id: s.id,
        remark: remarks[s.id] ?? null,
        updated_by: currentUserId || null,
      }));
      const { error: upsertErr } = await supabase
        .from("vp2_progress_scores")
        .upsert(payload, { onConflict: "subject_section_id,student_id" });
      if (upsertErr) throw upsertErr;
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "บันทึกหมายเหตุไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  // ★ ส่งออกเป็นไฟล์ Excel — โครงสร้างคอลัมน์ตรงกับตารางที่แสดงในหน้ารายงาน
  async function handleExportExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("แบบวัดผล 2");

  const COLS = 7; // เลขที่, เลขประจำตัว, ชื่อ, หน่วยการเรียน, กลางภาค, รวม, หมายเหตุ

  ws.columns = [
    { width: 6 },
    { width: 12 },
    { width: 30 },
    { width: 16 },
    { width: 12 },
    { width: 10 },
    { width: 22 },
  ];

  // ---------- โลโก้ (มุมซ้ายบน ~2cm) ----------
  try {
    const logoRes = await fetch("/school-logo.png");
    const logoBuffer = await logoRes.arrayBuffer();
    const logoId = wb.addImage({ buffer: logoBuffer, extension: "png" });
    // 2cm ≈ 113px ที่ 96dpi
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 75, height: 78 },
    });
  } catch (e) {
    console.warn("โหลดโลโก้ไม่สำเร็จ ข้ามการฝังรูป:", e);
  }

  // เว้นแถวให้พ้นความสูงโลโก้ก่อนเริ่มหัวกระดาษ (โลโก้กินราว 5 แถว)
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 20;
  ws.getRow(5).height = 20;

  // ---------- ป้าย "แบบวัดผล 2" มุมขวาบน ----------
  const tagCell = ws.getCell(1, COLS); // แถว 1 คอลัมน์สุดท้าย
  tagCell.value = "แบบวัดผล 2";
  tagCell.font = { bold: true };
  tagCell.alignment = { horizontal: "center", vertical: "middle" };
  tagCell.border = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };

  // ---------- หัวกระดาษ 3 บรรทัด (merge เต็มความกว้าง, เริ่มแถว 6) ----------
  const headerLine1 = "แบบประกาศผลคะแนนระหว่างเรียนรายวิชาของนักเรียนโรงเรียนวัดเขียนเขต";
  const headerLine2 = `ชั้นมัธยมศึกษาปีที่ ${gradeLevel || "-"} ภาคเรียนที่ ${semester || "-"} ปีการศึกษา ${yearLabel || "-"}`;
  const headerLine3 = `รหัสวิชา ${subjectCode} รายวิชา ${subjectTitle} ประเภท ${subjectType || "-"} จำนวน ${creditHours || "-"} หน่วยกิต`;

  const headerStartRow = 6;
  [headerLine1, headerLine2, headerLine3].forEach((text, idx) => {
    const rowNum = headerStartRow + idx;
    ws.mergeCells(rowNum, 1, rowNum, COLS);
    const cell = ws.getCell(rowNum, 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
  });

  // ---------- หัวตาราง ----------
  const tableHeaderRow = headerStartRow + 4; // เว้น 1 แถวว่าง
  const colHeaders = [
    "เลขที่",
    "เลขประจำตัว",
    "ชื่อ นามสกุล",
    `หน่วยการเรียน (${totalMaxScore})`,
    `กลางภาค (${midtermMaxScore})`,
    `รวม (${totalMaxScore + midtermMaxScore})`,
    "หมายเหตุ",
  ];
  colHeaders.forEach((text, i) => {
    const cell = ws.getCell(tableHeaderRow, i + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });

  // ---------- แถวข้อมูลนักเรียน ----------
  students.forEach((s, i) => {
    const info = extraInfo[s.id];
    const displayPrefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, s.prefix ?? null);
    const sc = scoreByStudent[s.id] ?? { unit: 0, midterm: null, total: 0 };
    const rowNum = tableHeaderRow + 1 + i;

    const rowValues = [
      i + 1,
      info?.student_code ?? "",
      `${displayPrefix}${s.first_name} ${s.last_name}`,
      sc.unit,
      sc.midterm ?? "",
      sc.total,
      remarks[s.id] ?? "",
    ];

    rowValues.forEach((val, colIdx) => {
      const cell = ws.getCell(rowNum, colIdx + 1);
      cell.value = val;
      cell.alignment = {
        horizontal: colIdx === 2 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    });
  });

  const lastDataRow = tableHeaderRow + students.length;

  // ---------- ส่วนลงชื่อ (3 ตำแหน่ง) ----------
  const sigRow1 = lastDataRow + 3; // เว้นระยะจากตาราง

  // ครูประจำวิชา (คอลัมน์ 2-3) และ หัวหน้ากลุ่มสาระ (คอลัมน์ 5-6)
  const writeSignature = (
  rowStart: number,
  colStart: number,
  colEnd: number,
  name: string,
  role: string
) => {
    ws.mergeCells(rowStart, colStart, rowStart, colEnd);
    const lineCell = ws.getCell(rowStart, colStart);
    lineCell.value = "ลงชื่อ.......................................";
    lineCell.alignment = { horizontal: "center" };

    ws.mergeCells(rowStart + 1, colStart, rowStart + 1, colEnd);
    const nameCell = ws.getCell(rowStart + 1, colStart);
    nameCell.value = `(${name})`;
    nameCell.alignment = { horizontal: "center" };

    ws.mergeCells(rowStart + 2, colStart, rowStart + 2, colEnd);
    const roleCell = ws.getCell(rowStart + 2, colStart);
    roleCell.value = role;
    roleCell.alignment = { horizontal: "center" };
  };

  writeSignature(
    sigRow1, 2, 3,
    teacherSignatureName || subjectTeacherNameFallback || ".......................................",
    "ครูประจำวิชา"
  );
  writeSignature(
    sigRow1, 5, 6,
    deptHeadName || ".......................................",
    `หัวหน้ากลุ่มสาระ${deptName || "ฯ"}`
  );

  // ผู้อำนวยการ (กึ่งกลางทั้งแถว ใต้ 2 ลายเซ็นแรก)
  const sigRow2 = sigRow1 + 4;
  writeSignature(sigRow2, 3, 5, directorName, "ผู้อำนวยการโรงเรียนวัดเขียนเขต");

  // ---------- บันทึกไฟล์ ----------
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fileClassroom = gradeLevel ? `_ม.${gradeLevel.replace("/", "-")}` : "";
  a.href = url;
  a.download = `แบบวัดผล2_${subjectCode}${fileClassroom}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

  if (loading) {
    return <div className="text-center py-10 text-fuchsia-500 font-black animate-pulse">กำลังโหลด...</div>;
  }

  return (
    <div className="space-y-4">
      <style>{`
  /* ★ ตั้งชื่อฟอนต์เฉพาะของรายงานนี้ (THSarabunReport) ไม่ใช้ชื่อ 'TH Sarabun New' ตรงๆ
     เพราะ @font-face ไม่ได้ถูก scope ด้วย class ได้ — มันลงทะเบียนฟอนต์ให้ "ทั้งหน้าเว็บ" เสมอ
     ถ้าใช้ชื่อเดียวกับที่หน้า page.tsx ใช้อยู่ (font-['TH_Sarabun_New']) จะทำให้ฟอนต์ทั้งหน้า
     (รวมเมนูด้านบน/ปุ่มต่างๆ) เปลี่ยนไปใช้ฟอนต์นี้ไปด้วย ซึ่งตัวเล็กกว่า sans-serif ปกติมาก
     ทำให้ตัวหนังสือส่วนอื่นของหน้าดู "เล็กลง" ทั้งที่ font-size เท่าเดิม */
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

  /* บังคับฟอนต์ THSarabunReport เฉพาะภายในตัวเอกสาร (.vp2-print-area) เท่านั้น ไม่กระทบแถบปุ่มด้านบน */
  .vp2-print-area,
  .vp2-print-area * ,
  .vp2-print-area input,
  .vp2-print-area button,
  .vp2-print-area select,
  .vp2-print-area textarea {
    font-family: 'THSarabunReport', 'TH Sarabun New UI', sans-serif !important;
  }

  .vp2-print-area { font-size: 16px; }
  .vp2-print-area table { font-size: 16px; }

  @media print {
  @page { size: A4 portrait; margin: 8mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { visibility: hidden; }
  .vp2-report-root, .vp2-report-root * { visibility: visible; }
  .vp2-report-root { position: absolute; left: 0; top: 0; width: 100%; }

    .vp2-print-area { font-size: 16px !important; padding: 0 !important; }
  .vp2-print-area table { font-size: 16px !important; }
  .vp2-print-area th, .vp2-print-area td { padding-top: 1px !important; padding-bottom: 1px !important; }
  .vp2-header-block { margin-bottom: 4px !important; }
  .vp2-header-block p { margin: 0 !important; line-height: 1.25 !important; }
  /* ★ เว้นระยะก่อนส่วนลงชื่อให้มีที่ว่างพอสมควร ทั้งตอนพิมพ์และตอนดูปกติ */
  .vp2-signature-block { margin-top: 28px !important; }
  .vp2-director-block { margin-top: 22px !important; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
}
`}</style>

      <div className="vp2-report-root">
      <div className="print:hidden flex items-center justify-between flex-wrap gap-2">
  <button onClick={onBack} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm">
    ← กลับ
  </button>
  <div className="flex items-center gap-2">
    {!readOnly && (
      <button
        onClick={handleSaveRemarks}
        disabled={saving}
        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-sm shadow"
      >
        {saving ? "กำลังบันทึก..." : "💾 บันทึกหมายเหตุ"}
      </button>
    )}
    <button onClick={handleExportExcel} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow">
      📊 ส่งออก Excel
    </button>
    <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-sm shadow">
      🖨️ พิมพ์ / บันทึกเป็น PDF
    </button>
  </div>
</div>

      {error && <p className="print:hidden text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
      {savedAt && !error && (
        <p className="print:hidden text-xs font-black text-emerald-500">✅ บันทึกหมายเหตุล่าสุดแล้ว</p>
      )}

      {/* ★ แก้ไข: เจอสาเหตุจริงที่ "หน้าเล็กลง" — เดิม max-w-[190mm] (~718px, ขนาดกระดาษ A4) ถูกบังคับใช้ตลอด
          แม้ตอนไม่ได้พิมพ์ ทำให้การ์ดแคบกว่าเครื่องมืออื่นมาก ตอนนี้ให้ใช้ความกว้างเต็ม container ตามปกติ
          แล้วค่อยจำกัดเหลือ 190mm เฉพาะตอนสั่งพิมพ์ (print:) เท่านั้น */}
      <div className="bg-slate-100 print:bg-transparent rounded-2xl p-4 sm:p-8 print:p-0 overflow-x-auto">
<div
  className="vp2-print-area relative bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-12 print:border-0 print:shadow-none print:rounded-none print:p-0 mx-auto"
  style={{ maxWidth: "210mm", width: "100%" }}
>
        {/* ★ เปลี่ยนหัวกระดาษเป็น flex 3 ช่อง (โลโก้ | ข้อความกึ่งกลาง | ป้ายแบบวัดผล 2)
            แทนการใช้ absolute เดิม เพื่อไม่ให้โลโก้ไปทับข้อความไม่ว่าข้อความจะยาวแค่ไหน */}
        <div className="flex items-start gap-2 mb-2 vp2-header-block">
          <div
  className="shrink-0 flex items-center justify-center"
  style={{ width: "2cm", height: "2cm" }}
>
  <img src="/school-logo.png" alt="ตราโรงเรียน" className="w-full h-full object-contain" />
</div>
                    <div className="flex-1 text-center min-w-0" style={{ fontSize: "18px" }}>
            <p className="font-bold leading-snug">แบบประกาศผลคะแนนระหว่างเรียนรายวิชาของนักเรียนโรงเรียนวัดเขียนเขต</p>
            <p className="font-bold mt-1 whitespace-nowrap">
              ชั้นมัธยมศึกษาปีที่{" "}
              {readOnly ? (
                <span className="font-bold">{gradeLevel || "…………"}</span>
              ) : (
                <input value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} placeholder="เช่น 3/1" className="border-b border-slate-400 text-center w-16 focus:outline-none print:border-none" />
              )}{" "}
              ภาคเรียนที่{" "}
              {readOnly ? (
                <span className="font-bold">{semester || "…"}</span>
              ) : (
                <input value={semester} onChange={e => setSemester(e.target.value)} className="border-b border-slate-400 text-center w-8 focus:outline-none print:border-none" />
              )}{" "}
              ปีการศึกษา{" "}
              {readOnly ? (
                <span className="font-bold">{yearLabel || "…………"}</span>
              ) : (
                <input value={yearLabel} onChange={e => setYearLabel(e.target.value)} className="border-b border-slate-400 text-center w-20 focus:outline-none print:border-none" />
              )}
            </p>
                      <p className="font-bold mt-1 whitespace-nowrap">
              รหัสวิชา <span className="font-bold">{subjectCode}</span> รายวิชา <span className="font-bold">{subjectTitle}</span> ประเภท{" "}
              {readOnly ? (
                <span className="font-bold">{subjectType || "…………"}</span>
              ) : (
                <input value={subjectType} onChange={e => setSubjectType(e.target.value)} className="border-b border-slate-400 text-center w-20 focus:outline-none print:border-none" />
              )}{" "}
              จำนวน{" "}
              {readOnly ? (
                <span className="font-bold">{creditHours || "…"}</span>
              ) : (
                <input value={creditHours} onChange={e => setCreditHours(e.target.value)} className="border-b border-slate-400 text-center w-8 focus:outline-none print:border-none" />
              )}{" "}
              หน่วยกิต
            </p>
          </div>
                    <div className="w-20 print:w-16 shrink-0 flex items-start justify-end">
            <div className="border border-slate-400 rounded px-2 py-1 font-bold whitespace-nowrap" style={{ fontSize: "18px" }}>แบบวัดผล 2</div>
          </div>
        </div>

        <table className="w-full table-fixed border-collapse text-sm print:text-[11px] mt-4">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "5%" }}>เลขที่</th>
<th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "10%" }}>เลขประจำตัว</th>
<th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center font-bold" style={{ width: "38%" }}>ชื่อ นามสกุล</th>

<th colSpan={3} className="border border-slate-400 px-1 py-1 font-bold" style={{ width: "35%" }}>คะแนน</th>
<th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "12%" }}>หมายเหตุ</th>
            </tr>
            <tr>
              {/* ★ โชว์คะแนนเต็มจริงจากชุดงานทั้งหมด (totalMaxScore) แทนเลข 70 ตายตัว */}
              <th className="border border-slate-400 px-1 py-1 font-bold">หน่วยการเรียน ({totalMaxScore})</th>
              <th className="border border-slate-400 px-1 py-1 font-bold">กลางภาค ({midtermMaxScore})</th>
              <th className="border border-slate-400 px-1 py-1 font-bold">รวม ({totalMaxScore + midtermMaxScore})</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const info = extraInfo[s.id];
              const displayPrefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, s.prefix ?? null);
              const sc = scoreByStudent[s.id] ?? { unit: 0, midterm: null, total: 0 };
              return (
                <tr key={s.id}>
                  <td className="border border-slate-400 text-center py-1">{i + 1}</td>
                  <td className="border border-slate-400 text-center py-1">{info?.student_code ?? ""}</td>
                  <td className="border border-slate-400 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
  {displayPrefix}{s.first_name} {s.last_name}
</td>
                  <td className="border border-slate-400 text-center py-1">{fmtScore(sc.unit)}</td>
                  <td className="border border-slate-400 text-center py-1">{sc.midterm ?? "-"}</td>
                  <td className="border border-slate-400 text-center py-1 font-bold">{fmtScore(sc.total)}</td>
                  <td className="border border-slate-400 text-center py-1">
                    {readOnly ? (
                      remarks[s.id] ?? ""
                    ) : (
                      <input
                        value={remarks[s.id] ?? ""}
                        onChange={e => setRemarks(prev => ({ ...prev, [s.id]: e.target.value }))}
                        className="w-full text-center focus:outline-none print:border-none"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ★ ส่วนลงชื่อ — เว้นระยะห่างจากตารางมากขึ้น (mt-16 แทน mt-8 เดิม)
            และใช้ SignatureField ใหม่ ที่ทำให้ "ชื่อในวงเล็บ" อยู่กึ่งกลางใต้เส้นประจริงๆ */}
        <div className="grid grid-cols-2 gap-8 mt-16 print:mt-10 vp2-signature-block">
          <div className="flex justify-center">
            <SignatureField
              role="ครูประจำวิชา"
              name={teacherSignatureName || subjectTeacherNameFallback || "......................................."}
            />
          </div>
          <div className="flex justify-center">
            {/* "หัวหน้ากลุ่มสาระฯ" -> "หัวหน้ากลุ่มสาระ" + ชื่อกลุ่มสาระจริง (เช่น วิทยาศาสตร์และเทคโนโลยี) */}
            <SignatureField
              role={`หัวหน้ากลุ่มสาระ${deptName || "ฯ"}`}
              name={deptHeadName || "......................................."}
            />
          </div>
        </div>
        <div className="flex justify-center mt-10 print:mt-8 vp2-director-block">
          <SignatureField
            name={directorName}
            extraLine="ผู้อำนวยการโรงเรียนวัดเขียนเขต"
            lineWidth="9rem"
          />
        </div>
        </div>
      </div>
      </div>
      </div>  
  );
}