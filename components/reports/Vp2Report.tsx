"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
// หมายเหตุ: ตาราง "users" เก็บคำนำหน้าไว้ในคอลัมน์ชื่อ "title" (ไม่ใช่ "prefix")
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
          // ★ แก้ไข: ดึงคำนำหน้าจากคอลัมน์ "title" ของตาราง users (ของเดิมใช้ "prefix" ซึ่งไม่มีคอลัมน์นี้จริง เลยไม่ขึ้นค่า)
          // ★ แก้ไข: join ตาราง departments ผ่าน department_id เพื่อเอาค่า "name" (ชื่อกลุ่มสาระ) แทนที่จะโชว์ id
          const { data: teacher, error: teacherErr } = await supabase
            .from("users")
            .select("title, first_name, last_name, full_name, department_id, departments:department_id(name)")
            .eq("id", sectionRow.teacher_id)
            .maybeSingle();

          if (teacherErr) console.error("[Vp2Report] โหลดชื่อครูประจำวิชาไม่สำเร็จ:", teacherErr);

          if (teacher) {
            setTeacherSignatureName(buildNameWithTitle(teacher as any));

            const deptRel: any = (teacher as any).departments;
            const teacherDeptName = Array.isArray(deptRel) ? deptRel[0]?.name : deptRel?.name;
            if (teacherDeptName) setDeptName(teacherDeptName);

            if (teacher.department_id) {
              const { data: deptHead, error: deptErr } = await supabase
                .from("users")
                .select("title, first_name, last_name, full_name")
                .eq("department_id", teacher.department_id)
                .contains("extra_roles", ["subject_dept_head"])
                .maybeSingle();

              if (deptErr) console.error("[Vp2Report] โหลดชื่อหัวหน้ากลุ่มสาระไม่สำเร็จ:", deptErr);

              if (deptHead) {
                setDeptHeadName(buildNameWithTitle(deptHead as any));
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

  // ★ คำนวณคะแนนต่อคน ด้วยสูตรเดียวกับหน้า "คะแนนรวม"
  const totalMaxScore = useMemo(
    () => assignments.reduce((sum, a) => sum + getAssignmentMaxContribution(a), 0),
    [assignments]
  );

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

    const rawUnit = totalMaxScore > 0
      ? ((assignmentTotal + specialTotal) / totalMaxScore) * unitMaxScore
      : 0;

    // ★ ตัดเศษตามที่ตั้งค่าไว้ในรายวิชา แทนการโชว์ทศนิยม
    const scaledUnit = applyRounding(rawUnit, gradeRoundingMode);

    const midtermRaw = examScores.find(e => e.student_id === s.id && e.exam_type === "midterm")?.score ?? null;
const midterm = midtermRaw !== null ? applyRounding(midtermRaw, gradeRoundingMode) : null;
const total = applyRounding(scaledUnit + (midterm ?? 0), gradeRoundingMode);
map[s.id] = { unit: scaledUnit, midterm, total };
  });
  return map;
}, [students, submissions, assignments, examScores, scoreEvents, totalMaxScore, unitMaxScore, gradeRoundingMode]);

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

  if (loading) {
    return <div className="text-center py-10 text-fuchsia-500 font-black animate-pulse">กำลังโหลด...</div>;
  }

  return (
    <div className="space-y-4">
      <style>{`
  @font-face {
  font-family: 'TH Sarabun New';
  src: url('/fonts/THSarabun.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'TH Sarabun New';
  src: url('/fonts/THSarabun-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

  /* ★ แก้ไข: บังคับฟอนต์ THSarabun เฉพาะภายในตัวเอกสาร (.vp2-print-area) เท่านั้น
     เดิมบังคับทั้ง .vp2-report-root ซึ่งครอบคลุมแถบปุ่มด้านบน (กลับ/บันทึก/พิมพ์) ไปด้วย
     ทำให้ปุ่มและตัวหนังสือแถบเมนูเปลี่ยนไปใช้ฟอนต์ไทยที่ตัวเล็กกว่าปกติ ดูเหมือน "หน้าเว็บเล็กลง" */
  .vp2-print-area,
  .vp2-print-area * ,
  .vp2-print-area input,
  .vp2-print-area button,
  .vp2-print-area select,
  .vp2-print-area textarea {
    font-family: 'TH Sarabun New', 'TH Sarabun New UI', sans-serif !important;
  }

  @media print {
  @page { size: A4 portrait; margin: 8mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { visibility: hidden; }
  .vp2-report-root, .vp2-report-root * { visibility: visible; }
  .vp2-report-root { position: absolute; left: 0; top: 0; width: 100%; }

  .vp2-print-area { font-size: 13px !important; padding: 0 !important; }
  .vp2-print-area table { font-size: 12px !important; }
  .vp2-print-area th, .vp2-print-area td { padding-top: 1px !important; padding-bottom: 1px !important; }
  .vp2-header-block { margin-bottom: 4px !important; }
  .vp2-header-block p { margin: 0 !important; line-height: 1.25 !important; }
  .vp2-signature-block { margin-top: 10px !important; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
}
`}</style>

      <div className="vp2-report-root">
      <div className="print:hidden flex items-center justify-between flex-wrap gap-2">
        <button onClick={onBack} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs">
          ← กลับ
        </button>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={handleSaveRemarks}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-xs shadow"
            >
              {saving ? "กำลังบันทึก..." : "💾 บันทึกหมายเหตุ"}
            </button>
          )}
          <button onClick={handlePrint} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-xs shadow">
            🖨️ พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
      </div>

      {error && <p className="print:hidden text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
      {savedAt && !error && (
        <p className="print:hidden text-xs font-black text-emerald-500">✅ บันทึกหมายเหตุล่าสุดแล้ว</p>
      )}

      <div className="vp2-print-area relative bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-10 print:border-0 print:shadow-none print:p-0 max-w-[190mm] mx-auto">
        {/* ★ เปลี่ยนหัวกระดาษเป็น flex 3 ช่อง (โลโก้ | ข้อความกึ่งกลาง | ป้ายแบบวัดผล 2)
            แทนการใช้ absolute เดิม เพื่อไม่ให้โลโก้ไปทับข้อความไม่ว่าข้อความจะยาวแค่ไหน */}
        <div className="flex items-start gap-2 mb-2 vp2-header-block">
          <div className="w-12 h-12 print:w-10 print:h-10 shrink-0 flex items-center justify-center">
            <img src="/school-logo.png" alt="ตราโรงเรียน" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 text-center min-w-0">
            <p className="font-black text-base print:text-sm leading-snug">แบบประกาศผลคะแนนระหว่างเรียนรายวิชาของนักเรียนโรงเรียนวัดเขียนเขต</p>
            <p className="text-sm print:text-xs mt-1 whitespace-nowrap">
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
            <p className="text-sm print:text-xs mt-1 whitespace-nowrap">
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
          <div className="w-12 print:w-10 shrink-0 flex items-start justify-end">
            <div className="border border-slate-400 rounded px-2 py-1 text-[10px] font-bold whitespace-nowrap">แบบวัดผล 2</div>
          </div>
        </div>

        <table className="w-full border-collapse text-xs print:text-[9px] mt-4">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 w-8">เลขที่</th>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 w-16">เลขประจำตัว</th>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5">ชื่อ นามสกุล</th>
              <th colSpan={3} className="border border-slate-400 px-1 py-1">คะแนน</th>
              <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 w-16">หมายเหตุ</th>
            </tr>
            <tr>
              <th className="border border-slate-400 px-1 py-1 font-normal">หน่วยการเรียน ({unitMaxScore})</th>
              <th className="border border-slate-400 px-1 py-1 font-normal">กลางภาค ({midtermMaxScore})</th>
              <th className="border border-slate-400 px-1 py-1 font-normal">รวม ({unitMaxScore + midtermMaxScore})</th>
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
                  <td className="border border-slate-400 px-2 py-1">
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

        <div className="grid grid-cols-2 gap-8 mt-8 print:mt-6 text-sm print:text-xs text-center vp2-signature-block">
          <div>
            <p>ลงชื่อ.......................................ครูประจำวิชา</p>
<p>({teacherSignatureName || subjectTeacherNameFallback || "......................................."})</p>
          </div>
          <div>
            {/* ★ "หัวหน้ากลุ่มสาระฯ" -> "หัวหน้ากลุ่มสาระ" + ชื่อกลุ่มสาระจริง (เช่น วิทยาศาสตร์และเทคโนโลยี) */}
            <p>ลงชื่อ.......................................หัวหน้ากลุ่มสาระ{deptName || "ฯ"}</p>
            <p>({deptHeadName || "......................................."})</p>
          </div>
        </div>
        <div className="text-center mt-6 print:mt-4 text-sm print:text-xs">
          <p>ลงชื่อ.......................................</p>
          <p>({directorName})</p>
          <p>ผู้อำนวยการโรงเรียนวัดเขียนเขต</p>
        </div>
      </div>
      </div>
    </div>
  );
}