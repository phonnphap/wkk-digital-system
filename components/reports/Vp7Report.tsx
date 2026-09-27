"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// ★ ส่งออก Excel — ใช้ ExcelJS เหมือนกับ Vp2Report.tsx (ไฟล์ต้นแบบ)
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
type Preset = { id: string; label: string; points: number; emoji: string; sort_order: number };
type ScoreEvent = { id: string; student_id: string; preset_id: string; points: number };
// ★ เพิ่ม: เกณฑ์ตัดเกรด — มาจาก endpoint เดียวกับหน้าคะแนนรวม (json.criteria) เพื่อคำนวณ "ผลการเรียน"
type Criterion = { max_percent: number; min_percent: number; grade: string };

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
// ★ หาเกรดจากเปอร์เซ็นต์ ตามเกณฑ์ที่ตั้งไว้ในหน้า "ตั้งค่าคำนวณเกรด" ของวิชานี้ (เหมือน GradeOverviewTool)
function getGradeFromCriteria(percentage: number, criteria: Criterion[]): string {
  const sorted = [...criteria].sort((a, b) => b.min_percent - a.min_percent);
  for (const c of sorted) {
    if (percentage >= c.min_percent && percentage <= c.max_percent) return c.grade;
  }
  return "-";
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

// ★ คำนำหน้าอัตโนมัติจากเพศ+อายุ (เกิน 15 ปี => นาย/นางสาว)
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

/* =========================================================================
   ★ ช่องลงชื่อ — เหมือนกับ Vp2Report.tsx เป๊ะ (ชื่อในวงเล็บอยู่กึ่งกลางใต้เส้นประเสมอ)
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

export default function Vp7Report({
  sectionId,
  subjectId,
  academicYearId,
  subjectTitle,
  subjectCode,
  classroomLabel,
  students,
  currentUserId,
  readOnly,
  formativeMaxScore = 70,
  midtermMaxScore = 0,
  finalMaxScore = 30,
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
  formativeMaxScore?: number;   // ★ คะแนนเต็ม "หน่วยการเรียน" ที่ตั้งไว้ในรายวิชา (เดิมชื่อ unitMaxScore ใน Vp2Report)
  midtermMaxScore?: number;
  finalMaxScore?: number;       // ★ เพิ่ม: วผ.7 มีคอลัมน์ "ปลายภาค" แยกจาก วผ.2
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
  const [presets, setPresets] = useState<Preset[]>([]);
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);   // ★ เพิ่ม
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const [teacherSignatureName, setTeacherSignatureName] = useState("");
  const [deptHeadName, setDeptHeadName] = useState("");
  const [deptName, setDeptName] = useState("");
  const directorName = "นายธนณัฐ ศิระวงษ์";

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: subj } = await supabase
          .from("subjects")
          .select("subject_type, credit_hours")
          .eq("id", subjectId)
          .maybeSingle();
        if (subj) {
          setSubjectType(subj.subject_type === "additional" ? "เพิ่มเติม" : "พื้นฐาน");
          setCreditHours(subj.credit_hours != null ? String(subj.credit_hours) : "");
        }

        const { data: sectionRow } = await supabase
          .from("subject_sections")
          .select("teacher_id")
          .eq("id", sectionId)
          .maybeSingle();

        if (sectionRow?.teacher_id) {
          const { data: teacher, error: teacherErr } = await supabase
            .from("users")
            .select("title, first_name, last_name, full_name, department_id, departments:department_id(name)")
            .eq("id", sectionRow.teacher_id)
            .maybeSingle();

          if (teacherErr) console.error("[Vp7Report] โหลดชื่อครูประจำวิชาไม่สำเร็จ:", teacherErr);

          if (teacher) {
            setTeacherSignatureName(buildNameWithTitle(teacher as any));

            const deptRel: any = (teacher as any).departments;
            const teacherDeptName = Array.isArray(deptRel) ? deptRel[0]?.name : deptRel?.name;
            if (teacherDeptName) setDeptName(teacherDeptName);

            if (teacher.department_id) {
              const { data: deptUsers, error: allHeadsErr } = await supabase
                .from("users")
                .select("title, first_name, last_name, full_name, department_id, extra_roles")
                .eq("department_id", teacher.department_id);

              if (allHeadsErr) {
                console.error("[Vp7Report] โหลดรายชื่อผู้ใช้ในกลุ่มสาระไม่สำเร็จ:", allHeadsErr);
              } else {
                const head = (deptUsers ?? []).find((u: any) => {
                  const roles: unknown = u.extra_roles;
                  if (Array.isArray(roles)) {
                    return roles.some((r: any) => typeof r === "string" && r.includes("subject_dept_head"));
                  }
                  return false;
                });
                if (head) setDeptHeadName(buildNameWithTitle(head as any));
              }
            }
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

        // ★ คะแนนจริง + เกณฑ์เกรด — ดึงจาก endpoint เดียวกับหน้า "คะแนนรวม" ทั้งหมด ไม่กรอกซ้ำเอง
        const gradeRes = await fetch(`/api/subject-grades/summary?subject_section_id=${sectionId}`);
        const gradeJson = await gradeRes.json();
        if (gradeRes.ok) {
          setAssignments((gradeJson.assignments ?? []).filter((a: Assignment) => a.status !== "draft"));
          setSubmissions(gradeJson.submissions ?? []);
          setExamScores(gradeJson.examScores ?? []);
          setPresets(gradeJson.presets ?? []);
          setScoreEvents(gradeJson.scoreEvents ?? []);
          setCriteria(gradeJson.criteria ?? []);
        }

        // หมายเหตุที่เคยกรอกไว้ (ถ้ามี) — เก็บแยกตารางจาก วผ.2 เพราะข้อความหมายเหตุมักคนละความหมายกัน
        // (ต้องสร้างตาราง vp7_progress_scores โครงเดียวกับ vp2_progress_scores:
        //  subject_section_id, student_id, remark, updated_by + unique(subject_section_id, student_id))
        const { data: remarkRows, error: remarkErr } = await supabase
          .from("vp7_progress_scores")
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

  // ★ คะแนนเต็มรวมของชุดงานทั้งหมด (หน่วยการเรียน) — ใช้แสดงหัวตาราง แทนเลขตายตัว
  const totalMaxScore = useMemo(
    () => assignments.reduce((sum, a) => sum + getAssignmentMaxContribution(a), 0),
    [assignments]
  );
  const grandMaxScore = totalMaxScore + midtermMaxScore + finalMaxScore;

  // ★ คะแนนต่อคน: หน่วยการเรียน (งาน+พิเศษ) / กลางภาค / ปลายภาค / รวม (ปัดครั้งเดียวที่ผลรวม เหมือน GradeOverviewTool)
  // + ผลการเรียน (เกรด) คำนวณจาก % ของ "รวม" เทียบกับ grandMaxScore ตามเกณฑ์ที่ตั้งไว้ในวิชานี้
  const scoreByStudent = useMemo(() => {
    const map: Record<
      string,
      { unit: number; midterm: number | null; final: number | null; total: number; totalRaw: number; percentage: number; grade: string }
    > = {};
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
      const unitRaw = assignmentTotal + specialTotal;

      const midtermRaw = examScores.find(e => e.student_id === s.id && e.exam_type === "midterm")?.score ?? null;
      const finalRaw = examScores.find(e => e.student_id === s.id && e.exam_type === "final")?.score ?? null;

      // ★ ปัดเศษ "รวม" ครั้งเดียวจากผลรวมดิบทั้งหมด (ตรงกับตัวเลขในหน้าคะแนนรวม) แทนการปัดทีละคอลัมน์
      const totalBeforeRound = unitRaw + (midtermRaw ?? 0) + (finalRaw ?? 0);
      const totalRaw = Math.round(totalBeforeRound * 100) / 100;
      const total = totalRaw % 1 !== 0 ? applyRounding(totalRaw, gradeRoundingMode) : totalRaw;

      const percentage = grandMaxScore > 0 ? (total / grandMaxScore) * 100 : 0;
      const grade = getGradeFromCriteria(percentage, criteria);

      map[s.id] = { unit: unitRaw, midterm: midtermRaw, final: finalRaw, total, totalRaw, percentage, grade };
    });
    return map;
  }, [students, submissions, assignments, examScores, scoreEvents, criteria, grandMaxScore, gradeRoundingMode]);

  function getGradeLevelWord(classroomLabel?: string): string {
    if (!classroomLabel) return "มัธยมศึกษา";
    if (classroomLabel.includes("อนุบาล")) return "อนุบาล";
    if (classroomLabel.includes("ประถม")) return "ประถมศึกษา";
    return "มัธยมศึกษา";
  }
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
        .from("vp7_progress_scores")
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

  // ★ ส่งออกเป็นไฟล์ Excel — โครงสร้างคอลัมน์ตรงกับตารางที่แสดงในหน้ารายงาน (9 คอลัมน์)
  async function handleExportExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("แบบวัดผล 7");

    const COLS = 9; // เลขที่, เลขประจำตัว, ชื่อ, หน่วยการเรียน, กลางภาค, ปลายภาค, รวม, ผลการเรียน, หมายเหตุ

    ws.columns = [
      { width: 6 },
      { width: 12 },
      { width: 28 },
      { width: 14 },
      { width: 10 },
      { width: 10 },
      { width: 9 },
      { width: 12 },
      { width: 18 },
    ];

    try {
      const logoRes = await fetch("/school-logo.png");
      const logoBuffer = await logoRes.arrayBuffer();
      const logoId = wb.addImage({ buffer: logoBuffer, extension: "png" });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 75, height: 78 } });
    } catch (e) {
      console.warn("โหลดโลโก้ไม่สำเร็จ ข้ามการฝังรูป:", e);
    }

    for (let r = 1; r <= 5; r++) ws.getRow(r).height = 20;

    const tagCell = ws.getCell(1, COLS);
    tagCell.value = "แบบวัดผล 7";
    tagCell.font = { bold: true };
    tagCell.alignment = { horizontal: "center", vertical: "middle" };
    tagCell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };

    const headerLine1 = "แบบประกาศผลคะแนนระหว่างเรียนรายวิชาของนักเรียนโรงเรียนวัดเขียนเขต";
    const headerLine2 = `ชั้น${getGradeLevelWord(classroomLabel)}ปีที่ ${gradeLevel || "-"} ภาคเรียนที่ ${semester || "-"} ปีการศึกษา ${yearLabel || "-"}`;
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

    const tableHeaderRow = headerStartRow + 4;
    const colHeaders = [
      "เลขที่",
      "เลขประจำตัว",
      "ชื่อ นามสกุล",
      `หน่วยการเรียน (${fmtScore(totalMaxScore)})`,
      `กลางภาค (${midtermMaxScore})`,
      `ปลายภาค (${finalMaxScore})`,
      `รวม (${fmtScore(grandMaxScore)})`,
      "ผลการเรียน",
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

    students.forEach((s, i) => {
      const info = extraInfo[s.id];
      const displayPrefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, s.prefix ?? null);
      const sc = scoreByStudent[s.id] ?? { unit: 0, midterm: null, final: null, total: 0, grade: "-" };
      const rowNum = tableHeaderRow + 1 + i;

      const rowValues = [
        i + 1,
        info?.student_code ?? "",
        `${displayPrefix}${s.first_name} ${s.last_name}`,
        fmtScore(sc.unit),
        sc.midterm ?? "",
        sc.final ?? "",
        fmtScore(sc.total),
        sc.grade,
        remarks[s.id] ?? "",
      ];

      rowValues.forEach((val, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        cell.value = val;
        cell.alignment = { horizontal: colIdx === 2 ? "left" : "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" },
        };
      });
    });

    const lastDataRow = tableHeaderRow + students.length;

    // ★ หมายเหตุกรณี 0/ร/มส (เหมือนที่ระบุในแบบฟอร์มกระดาษ)
    const noteRow = lastDataRow + 2;
    ws.mergeCells(noteRow, 1, noteRow, COLS);
    const noteCell = ws.getCell(noteRow, 1);
    noteCell.value = "หมายเหตุ นักเรียนที่ได้ผลการเรียน 0, ร, มส ให้แนบแบบวัดผล 8 มาพร้อมกับแบบวัดผล 7 ทุกกรณี";
    noteCell.font = { bold: true, size: 11 };

    const sigRow1 = noteRow + 3;
    const writeSignature = (rowStart: number, colStart: number, colEnd: number, name: string, role: string) => {
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
      sigRow1, 6, 7,
      deptHeadName || ".......................................",
      `หัวหน้ากลุ่มสาระการเรียนรู้${deptName || "ฯ"}`
    );

    const sigRow2 = sigRow1 + 4;
    writeSignature(sigRow2, 4, 6, directorName, "ผู้อำนวยการโรงเรียนวัดเขียนเขต");

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileClassroom = gradeLevel ? `_ม.${gradeLevel.replace("/", "-")}` : "";
    a.href = url;
    a.download = `แบบวัดผล7_${subjectCode}${fileClassroom}.xlsx`;
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
  @font-face {
    font-family: 'THSarabunReport';
    src: url('/fonts/THSarabun.ttf') format('truetype');
    font-weight: 400; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'THSarabunReport';
    src: url('/fonts/THSarabun-Bold.ttf') format('truetype');
    font-weight: 700; font-style: normal; font-display: swap;
  }

  .vp7-print-area,
  .vp7-print-area * ,
  .vp7-print-area input,
  .vp7-print-area button,
  .vp7-print-area select,
  .vp7-print-area textarea {
    font-family: 'THSarabunReport', 'TH Sarabun New UI', sans-serif !important;
  }

  .vp7-print-area { font-size: 16px; }
  .vp7-print-area table { font-size: 16px; }

  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body * { visibility: hidden; }
    .vp7-report-root, .vp7-report-root * { visibility: visible; }
    .vp7-report-root { position: absolute; left: 0; top: 0; width: 100%; }

    .vp7-print-area { font-size: 16px !important; padding: 0 !important; }
    .vp7-print-area table { font-size: 16px !important; }
    .vp7-print-area th, .vp7-print-area td { padding-top: 1px !important; padding-bottom: 1px !important; }
    .vp7-header-block { margin-bottom: 4px !important; }
    .vp7-header-block p { margin: 0 !important; line-height: 1.25 !important; }
    .vp7-signature-block { margin-top: 28px !important; }
    .vp7-director-block { margin-top: 22px !important; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
`}</style>

      <div className="vp7-report-root">
        <div className="print:hidden flex items-center justify-between flex-wrap gap-2">
          <button onClick={onBack} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-base">
            ← กลับ
          </button>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button
                onClick={handleSaveRemarks}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-base shadow"
              >
                {saving ? "กำลังบันทึก..." : "💾 บันทึกหมายเหตุ"}
              </button>
            )}
            <button onClick={handleExportExcel} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow">
              📊 ส่งออก Excel
            </button>
            <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-base shadow">
              🖨️ พิมพ์ / บันทึกเป็น PDF
            </button>
          </div>
        </div>

        {error && <p className="print:hidden text-m font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
        {savedAt && !error && (
          <p className="print:hidden text-m font-black text-emerald-500">✅ บันทึกหมายเหตุล่าสุดแล้ว</p>
        )}

        <div className="bg-slate-100 print:bg-transparent rounded-2xl p-4 sm:p-8 print:p-0 overflow-x-auto">
          <div
            className="vp7-print-area relative bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-12 print:border-0 print:shadow-none print:rounded-none print:p-0 mx-auto"
            style={{ maxWidth: "210mm", width: "100%" }}
          >
            <div className="flex items-start gap-2 mb-2 vp7-header-block">
              <div className="shrink-0 flex items-center justify-center" style={{ width: "2cm", height: "2cm" }}>
                <img src="/school-logo.png" alt="ตราโรงเรียน" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 text-center min-w-0" style={{ fontSize: "18px" }}>
                <p className="font-bold leading-snug">แบบประกาศผลคะแนนระหว่างเรียนรายวิชาของนักเรียนโรงเรียนวัดเขียนเขต</p>
                <p className="font-bold mt-1 whitespace-nowrap">
                  ชั้น{getGradeLevelWord(classroomLabel)}ปีที่{" "}
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
                <div className="border border-slate-400 rounded px-2 py-1 font-bold whitespace-nowrap" style={{ fontSize: "18px" }}>แบบวัดผล 7</div>
              </div>
            </div>

            <table className="w-full table-fixed border-collapse text-base print:text-[13px] mt-4">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "5%" }}>เลขที่</th>
                  <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "9%" }}>เลขประจำตัว</th>
                  <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center font-bold" style={{ width: "30%" }}>ชื่อ นามสกุล</th>

                  <th colSpan={4} className="border border-slate-400 px-1 py-1 font-bold" style={{ width: "38%" }}>คะแนน</th>
                  <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "8%" }}>ผลการเรียน</th>
                  <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-bold" style={{ width: "10%" }}>หมายเหตุ</th>
                </tr>
                <tr>
                  <th className="border border-slate-400 px-1 py-1 font-bold">หน่วยการเรียน ({fmtScore(totalMaxScore)})</th>
                  <th className="border border-slate-400 px-1 py-1 font-bold">กลางภาค ({midtermMaxScore})</th>
                  <th className="border border-slate-400 px-1 py-1 font-bold">ปลายภาค ({finalMaxScore})</th>
                  <th className="border border-slate-400 px-1 py-1 font-bold">รวม ({fmtScore(grandMaxScore)})</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const info = extraInfo[s.id];
                  const displayPrefix = computePrefix(info?.gender ?? null, info?.birth_date ?? null, s.prefix ?? null);
                  const sc = scoreByStudent[s.id] ?? { unit: 0, midterm: null, final: null, total: 0, grade: "-" };
                  return (
                    <tr key={s.id}>
                      <td className="border border-slate-400 text-center py-1">{i + 1}</td>
                      <td className="border border-slate-400 text-center py-1">{info?.student_code ?? ""}</td>
                      <td className="border border-slate-400 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {displayPrefix}{s.first_name} {s.last_name}
                      </td>
                      <td className="border border-slate-400 text-center py-1">{fmtScore(sc.unit)}</td>
                      <td className="border border-slate-400 text-center py-1">{sc.midterm ?? "-"}</td>
                      <td className="border border-slate-400 text-center py-1">{sc.final ?? "-"}</td>
                      <td className="border border-slate-400 text-center py-1 font-bold">{fmtScore(sc.total)}</td>
                      <td className="border border-slate-400 text-center py-1 font-bold">{sc.grade}</td>
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

            {/* ★ หมายเหตุมาตรฐานของแบบฟอร์ม — นักเรียนติด 0/ร/มส ต้องแนบแบบวัดผล 8 มาด้วยทุกกรณี */}
            <p className="mt-3 text-[15px] font-bold">
              หมายเหตุ นักเรียนที่ได้ผลการเรียน 0, ร, มส ให้แนบแบบวัดผล 8 มาพร้อมกับแบบวัดผล 7 ทุกกรณี
            </p>

            <div className="grid grid-cols-2 gap-8 mt-16 print:mt-10 vp7-signature-block">
              <div className="flex justify-center">
                <SignatureField
                  role="ครูประจำวิชา"
                  name={teacherSignatureName || subjectTeacherNameFallback || "......................................."}
                />
              </div>
              <div className="flex justify-center">
                <SignatureField
                  role={`หัวหน้ากลุ่มสาระการเรียนรู้${deptName || "ฯ"}`}
                  name={deptHeadName || "......................................."}
                />
              </div>
            </div>
            <div className="flex justify-center mt-10 print:mt-8 vp7-director-block">
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