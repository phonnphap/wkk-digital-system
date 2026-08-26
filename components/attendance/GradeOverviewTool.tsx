"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Student = {
  id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  nick_name?: string;
  seat_number: number;
  avatar_url?: string;
};

type Assignment = {
  id: string;
  title: string;
  max_score: number;
  weight_percent?: number;
  allow_weight?: boolean;
  status?: string;
  due_date?: string | null;
  teaching_unit_no?: number | null;  // ★ เพิ่ม
  unit_name?: string | null;         // ★ เพิ่ม (ถ้า API ส่งมาให้)
};

type Preset = { id: string; label: string; points: number; emoji: string; sort_order: number };

type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string;
  score: number | null;
  teacher_comment?: string | null;
  graded_at?: string | null;
  submitted_at?: string | null;
  is_late?: boolean | null;
};

type ScoreEvent = { id: string; student_id: string; preset_id: string; points: number };

type Criterion = { id?: string; max_percent: number; min_percent: number; grade: string; sort_order?: number };
type GroupSubjectInfo = {
  id: string;
  subject_code: string;
  name_th: string;
  weight_percent: number;
  section_id: string;
  total_max_score: number;
};
type GroupSummary = {
  grouped: boolean;
  groupCode?: string;
  displayName?: string | null;
  isGuessed?: boolean;
  subjects?: GroupSubjectInfo[];
  combinedPercentByStudent?: Record<string, number>;
};
type ViewTab = "table" | "podium";
type NavDir = "up" | "down" | "left" | "right"; // ★ ทิศทางลูกศรสำหรับย้ายช่องกรอกคะแนน

// ★ ย้ายมาไว้ module scope เพื่อให้ GradeTable / EditableScoreCell / StudentReportModal เรียกใช้ได้
type LateInfo = { hasData: boolean; isLate: boolean; daysLate: number; isManual: boolean };

// ★ Toast แจ้งเตือนแบบลอยมุมขวาบน แทนที่ alert() เดิม
type ToastItem = { id: number; message: string; type: "success" | "error" | "info" };

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 print:hidden">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`cursor-pointer max-w-xs px-4 py-3 rounded-xl shadow-lg font-black text-xs text-white flex items-start gap-2 ${
            t.type === "error" ? "bg-red-500" : t.type === "success" ? "bg-emerald-500" : "bg-slate-700"
          }`}
          style={{ animation: "toast-in 0.2s ease-out" }}
        >
          <span>{t.type === "error" ? "⚠️" : t.type === "success" ? "✅" : "ℹ️"}</span>
          <span className="leading-snug">{t.message}</span>
        </div>
      ))}
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
type ExamScore = {
  student_id: string;
  exam_type: "midterm" | "final";
  score: number | null;
  raw_score?: number | null;
  raw_max_score?: number | null;
};

function isExamWeighted(rawMax: number | null | undefined, maxScore: number): boolean {
  return !!(rawMax && rawMax > 0 && rawMax !== maxScore);
}
function getExamWeightedScore(
  rawScore: number | null | undefined,
  rawMax: number | null | undefined,
  maxScore: number
): number {
  if (rawScore === null || rawScore === undefined) return 0;
  if (rawMax && rawMax > 0) return (rawScore / rawMax) * maxScore;
  return rawScore;
}
// ---- น้ำหนักชิ้นงาน (Weighted score) ----
// สูตร: คะแนนจริงที่ได้ = (คะแนนที่นักเรียนได้ / คะแนนเต็ม) × น้ำหนักชิ้นงาน
// ถ้าไม่ได้เปิดใช้น้ำหนัก หรือไม่ได้ระบุ % ไว้ ให้ใช้คะแนนดิบตามปกติ
function isWeighted(a: Assignment): boolean {
  return !!(a.allow_weight && a.weight_percent !== null && a.weight_percent !== undefined && (a.max_score ?? 0) > 0);
}

// คะแนนเต็มที่ "นับเข้าคะแนนรวม" ของชิ้นนี้ — ถ้ามีน้ำหนัก เต็มจะกลายเป็นค่าน้ำหนัก ไม่ใช่คะแนนดิบเดิม
function getAssignmentMaxContribution(a: Assignment): number {
  return isWeighted(a) ? (a.weight_percent as number) : (a.max_score ?? 0);
}

// แปลงคะแนนดิบที่กรอก -> คะแนนจริงตามน้ำหนัก (ครูยังกรอกคะแนนดิบตามปกติ ระบบแปลงให้ตรงนี้)
function getAssignmentWeightedScore(a: Assignment, rawScore: number | null | undefined): number {
  if (rawScore === null || rawScore === undefined) return 0;
  if (isWeighted(a)) return (rawScore / (a.max_score || 1)) * (a.weight_percent as number);
  return rawScore;
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
// คำนวณสถานะตรงเวลา/สาย
function getLateInfo(assignment: Assignment, sub?: Submission): LateInfo {
  // เคส 1: ไม่มีการส่งงานเลย
  if (!sub) {
    if (!assignment.due_date) {
      // ไม่มีกำหนดส่ง -> ยังประเมินไม่ได้ ไม่นับในสถิติ
      return { hasData: false, isLate: false, daysLate: 0, isManual: false };
    }
    const due = new Date(assignment.due_date).getTime();
    const now = Date.now();
    if (now <= due) {
      // ยังไม่ถึงกำหนดส่ง -> ยังตัดสินไม่ได้ตอนนี้ ไม่นับ (ไม่ยุติธรรมกับเด็ก)
      return { hasData: false, isLate: false, daysLate: 0, isManual: false };
    }
    // เลยกำหนดส่งไปแล้วและยังไม่ส่ง -> นับเป็น "ไม่ตรงเวลา"
    const daysLate = Math.max(1, Math.ceil((now - due) / (1000 * 60 * 60 * 24)));
    return { hasData: true, isLate: true, daysLate, isManual: false };
  }

  // เคส 2: ครูกำหนดสถานะเอง -> ใช้ค่านั้นเสมอ ไม่คำนวณทับ
  if (sub.is_late !== null && sub.is_late !== undefined) {
    return { hasData: true, isLate: sub.is_late, daysLate: 0, isManual: true };
  }

  // เคส 3: ชิ้นงานนี้ไม่ได้ตั้งกำหนดส่ง -> ถือว่าตรงเวลาทั้งหมด
  if (!assignment.due_date) {
    return { hasData: true, isLate: false, daysLate: 0, isManual: false };
  }

  // เคส 4: มีการส่งงานแล้ว (ไม่ว่าจะให้คะแนนแล้วหรือรอตรวจ) -> เทียบเวลาส่งจริงกับกำหนดส่ง
  const referenceIso = sub.submitted_at || sub.graded_at || new Date().toISOString();
  const due = new Date(assignment.due_date).getTime();
  const ref = new Date(referenceIso).getTime();

  if (ref <= due) return { hasData: true, isLate: false, daysLate: 0, isManual: false };
  const daysLate = Math.max(1, Math.ceil((ref - due) / (1000 * 60 * 60 * 24)));
  return { hasData: true, isLate: true, daysLate, isManual: false };
}

// ★ คำนวณอันดับ: คะแนนเท่ากัน = อันดับเดียวกัน (standard competition ranking เช่น 1,1,3,4)
function computeRanked(rows: ReturnType<typeof buildRowsType>) {
  const sorted = [...rows].sort((a, b) => b.grandTotal - a.grandTotal);
  let rank = 0;
  let prevScore: number | null = null;
  return sorted.map((r, i) => {
    if (prevScore === null || r.grandTotal !== prevScore) {
      rank = i + 1;
      prevScore = r.grandTotal;
    }
    return { ...r, rank };
  });
}

// ★ เอฟเฟกต์พลุกระดาษ (confetti) — สุ่มชิ้นสี่เหลี่ยมสีสันหล่นจากบนลงล่าง
const CONFETTI_COLORS = ["#f472b6", "#a78bfa", "#38bdf8", "#4ade80", "#facc15", "#fb923c", "#f87171", "#2dd4bf"];

function ConfettiBurst() {
  const [pieces] = useState(() =>
    Array.from({ length: 70 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.8 + Math.random() * 1.4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 6,
    }))
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {pieces.map(p => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-24px",
            width: p.size,
            height: p.size * 1.6,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          to { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* =========================================================================
   Component
   readOnly: สำหรับแอดมิน/ผู้บริหาร — ดู/export/print ได้ แต่แก้ไขคะแนนพิเศษ,
   คะแนนงาน, ตั้งค่าเกณฑ์เกรด, และคอมเมนต์ครู ไม่ได้
   ครูประจำวิชา (readOnly=false): แก้ไขคะแนนงานที่มอบหมายได้โดยตรงจากตารางนี้
   (คลิกที่คะแนน/ป้าย "รอตรวจ"/"ไม่ส่งงาน" เพื่อกรอกคะแนนได้ทันที กด Enter/ลูกศร
   เพื่อบันทึกแล้วย้ายไปช่องข้างเคียงได้เหมือนกรอกใน Excel)
   ========================================================================= */

export default function GradeOverviewTool({
  sectionId,
  subjectTitle,
  subjectCode,
  academicYearLabel,
  classroomLabel,
  homeroomTeacherName,
  subjectTeacherName,
  students,
  currentUserId,
  readOnly = false,
  gradingMode = "numeric",              // ★ เพิ่ม
  passThresholdPercent = 50,   
  gradingStructure = "formative_midterm_final",       // ★ เพิ่ม: โครงสร้างคะแนนเหลือแบบเดียว (เก็บ+กลางภาค+ปลายภาค)
  formativeMaxScore = 70,                      // ★ เพิ่ม
  midtermMaxScore = 0,                         // ★ เพิ่ม
  finalMaxScore = 30, 
}: {
  sectionId: string;
  subjectTitle: string;
  subjectCode: string;
  academicYearLabel?: string;
  classroomLabel?: string;
  homeroomTeacherName?: string;
  subjectTeacherName?: string;
  students: Student[];
  currentUserId?: string;
  readOnly?: boolean;
  gradingMode?: "numeric" | "pass_fail";   // ★ เพิ่ม
  passThresholdPercent?: number; 
  gradingStructure?: "formative_final" | "formative_midterm_final";
  formativeMaxScore?: number;
  midtermMaxScore?: number;
  finalMaxScore?: number;
}) {
  const [tab, setTab] = useState<ViewTab>("table");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { present: number; total: number }>>({});
  const [groupSummary, setGroupSummary] = useState<GroupSummary>({ grouped: false });
  const [showGradeSetting, setShowGradeSetting] = useState(false);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);
  const [hideScores, setHideScores] = useState(false);
  const [examScores, setExamScores] = useState<ExamScore[]>([]);
  // ★ โครงสร้างคะแนนเหลือแบบเดียว (เก็บ+กลางภาค+ปลายภาค) จึงแสดงคอลัมน์กลางภาคเสมอ
  // ไม่ผูกกับค่า gradingStructure ที่อาจเป็นข้อมูลเก่าจากฐานข้อมูลอีกต่อไป
  const useMidterm = true;
  const [rawMidtermMax, setRawMidtermMax] = useState<number | null>(null);
const [rawFinalMax, setRawFinalMax] = useState<number | null>(null);
  // ★ ลำดับคอลัมน์ชิ้นงานที่ครูลากสลับเอง (จำไว้ต่อห้องเรียนใน localStorage)
  const [assignmentOrder, setAssignmentOrder] = useState<string[]>([]);

  // ★ Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function showToast(message: string, type: ToastItem["type"] = "info") {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }
  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [gradeRes, attRes, groupRes] = await Promise.all([
  fetch(`/api/subject-grades/summary?subject_section_id=${sectionId}`),
  fetch(`/api/subject-attendance/summary?subject_section_id=${sectionId}`),
  fetch(`/api/subject-grades/group-summary?subject_section_id=${sectionId}`),
]);
      const json = await gradeRes.json();
      if (!gradeRes.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setAssignments((json.assignments ?? []).filter((a: Assignment) => a.status !== "draft"));
      setPresets(json.presets ?? []);
      setCriteria(json.criteria ?? []);
      setSubmissions(json.submissions ?? []);
      setScoreEvents(json.scoreEvents ?? []);
      setExamScores(json.examScores ?? []);
      setRawMidtermMax(json.rawMidtermMaxScore ?? null);   // ★ เพิ่ม
      setRawFinalMax(json.rawFinalMaxScore ?? null);       // ★ เพิ่ม

      try {
        const attJson = await attRes.json();
        if (attRes.ok) {
          const totalDates: string[] = attJson.dates ?? [];
          const map: Record<string, { present: number; total: number }> = {};
          students.forEach(s => { map[s.id] = { present: 0, total: totalDates.length }; });
          (attJson.records ?? []).forEach((r: any) => {
            if (!map[r.student_id]) map[r.student_id] = { present: 0, total: totalDates.length };
            if (r.status === "present" || r.status === "late") map[r.student_id].present += 1;
          });
          setAttendanceMap(map);
        }
        try {
  const groupJson = await groupRes.json();
  if (groupRes.ok) setGroupSummary(groupJson);
  else setGroupSummary({ grouped: false });
} catch {
  setGroupSummary({ grouped: false });
}
      } catch {
        // ไม่ critical
      }
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลคะแนนรวมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  // ★ โหลดลำดับคอลัมน์ที่บันทึกไว้ของห้องนี้
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`grade-assignment-order-${sectionId}`);
      if (saved) setAssignmentOrder(JSON.parse(saved));
      else setAssignmentOrder([]);
    } catch {
      setAssignmentOrder([]);
    }
  }, [sectionId]);

  // ★ เมื่อชิ้นงานเปลี่ยน (โหลดใหม่/เพิ่มชิ้นใหม่) ให้รวมเข้ากับลำดับที่จำไว้ ชิ้นใหม่ที่ยังไม่เคยเรียงจะถูกต่อท้าย
  useEffect(() => {
    setAssignmentOrder(prev => {
      const known = new Set(assignments.map(a => a.id));
      const filtered = prev.filter(id => known.has(id));
      const missing = assignments.map(a => a.id).filter(id => !filtered.includes(id));
      return [...filtered, ...missing];
    });
  }, [assignments]);

  // ★ บันทึกลำดับคอลัมน์ลง localStorage ทุกครั้งที่เปลี่ยน
  useEffect(() => {
    if (assignmentOrder.length === 0) return;
    try {
      localStorage.setItem(`grade-assignment-order-${sectionId}`, JSON.stringify(assignmentOrder));
    } catch {
      // ไม่ critical
    }
  }, [assignmentOrder, sectionId]);

  const orderedAssignments = useMemo(() => {
    const map = new Map(assignments.map(a => [a.id, a]));
    const ordered = assignmentOrder.map(id => map.get(id)).filter((a): a is Assignment => !!a);
    // เผื่อกรณี assignmentOrder ยังไม่ทันอัปเดต (โหลดครั้งแรก) ให้ fallback เป็นลำดับต้นฉบับ
    return ordered.length === assignments.length ? ordered : assignments;
  }, [assignments, assignmentOrder]);

  const totalMaxScore = useMemo(
  () => assignments.reduce((sum, a) => sum + getAssignmentMaxContribution(a), 0),
  [assignments]
);

  const rows = useMemo(() => {
  return students.map(s => {
    const subMap: Record<string, Submission> = {};
    submissions.filter(sub => sub.student_id === s.id).forEach(sub => { subMap[sub.assignment_id] = sub; });

    const assignmentTotal = assignments.reduce(
  (sum, a) => sum + getAssignmentWeightedScore(a, subMap[a.id]?.score),
  0
);
    const submittedCount = assignments.filter(a => subMap[a.id]?.score !== null && subMap[a.id]?.score !== undefined).length;
    const midtermRow = examScores.find(e => e.student_id === s.id && e.exam_type === "midterm");
    const finalRow = examScores.find(e => e.student_id === s.id && e.exam_type === "final");
    const midtermRaw = midtermRow?.raw_score ?? midtermRow?.score ?? null;
    const finalRaw = finalRow?.raw_score ?? finalRow?.score ?? null;
    const midtermScore = getExamWeightedScore(midtermRaw, midtermRow?.raw_max_score ?? rawMidtermMax, midtermMaxScore);
    const finalScore   = getExamWeightedScore(finalRaw, finalRow?.raw_max_score ?? rawFinalMax, finalMaxScore);

    // ★ นับตรงเวลา/สาย จาก getLateInfo แทน isOnTime เดิม
    let onTimeCount = 0;
    let lateCount = 0;
    let knownOnTimeCount = 0;
    let totalDaysLate = 0;
    assignments.forEach(a => {
      const info = getLateInfo(a, subMap[a.id]);
      if (!info.hasData) return;
      knownOnTimeCount++;
      if (info.isLate) { lateCount++; totalDaysLate += info.daysLate; } else { onTimeCount++; }
    });
    const onTimeRate = knownOnTimeCount > 0 ? (onTimeCount / knownOnTimeCount) * 100 : null;

    const presetTotals: Record<string, number> = {};
    presets.forEach(p => { presetTotals[p.id] = 0; });
    scoreEvents
      .filter(ev => ev.student_id === s.id && presetTotals[ev.preset_id] !== undefined)
      .forEach(ev => { presetTotals[ev.preset_id] += ev.points; });
    const specialTotal = Object.values(presetTotals).reduce((a, b) => a + b, 0);

    const att = attendanceMap[s.id];
    const attendanceRate = att && att.total > 0 ? (att.present / att.total) * 100 : null;
    const passFailStatus: "ผ่าน" | "ไม่ผ่าน" | null =
      gradingMode === "pass_fail"
        ? (attendanceRate === null ? null : attendanceRate >= passThresholdPercent ? "ผ่าน" : "ไม่ผ่าน")
        : null;

    // ★ เพิ่ม: สเกลคะแนนเก็บให้พอดีกับคะแนนเต็มที่ตั้งไว้
    const scaledFormative = totalMaxScore > 0 ? (assignmentTotal / totalMaxScore) * formativeMaxScore : 0;

    // ★ เพิ่ม: รวมคะแนนสุดท้าย (แทนที่ grandTotal เดิมที่ใช้ assignmentTotal+specialTotal ตรงๆ)
    const usesComponentGrading = gradingMode === "numeric"; // โครงสร้างเก็บ/กลาง/ปลาย ใช้เฉพาะโหมด numeric
    const componentTotal = usesComponentGrading
      ? scaledFormative + (useMidterm ? (midtermScore ?? 0) : 0) + (finalScore ?? 0)
      : null;
    const componentPercentage = usesComponentGrading ? componentTotal! : null; // เต็ม 100 อยู่แล้วโดยดีไซน์

    const percentage = usesComponentGrading
      ? (componentPercentage ?? 0)
      : (totalMaxScore > 0 ? (assignmentTotal / totalMaxScore) * 100 : 0);   // fallback เดิมเผื่อยังไม่ตั้งค่า

    let grade = "-";
    const sortedCriteria = [...criteria].sort((a, b) => b.min_percent - a.min_percent);
    for (const c of sortedCriteria) {
      if (percentage >= c.min_percent && percentage <= c.max_percent) { grade = c.grade; break; }
    }

        // grandTotal เดิม (คะแนนดิบ+พิเศษ) ยังเก็บไว้ใช้ในที่อื่น (เช่น Export/PodiumView) ไม่กระทบของเดิม
    const grandTotal = assignmentTotal + specialTotal;

    // ★ แก้บั๊ก: คอลัมน์ "รวม" ต้องใช้สูตรเดียวกับ percentage ไม่งั้นตัวเลขกับ % จะไม่ตรงกัน
    // โหมด numeric (เก็บ+กลางภาค+ปลายภาค) -> ใช้ componentTotal เต็ม 100
    // โหมด pass_fail (ไม่ใช้ระบบนี้) -> ใช้ grandTotal/totalMaxScore แบบเดิม
        // ★ แก้: "รวม" ต้องบวกคะแนนพิเศษ (+คะแนนสอบ ถ้าเป็นโหมด numeric) เข้าไปทั้งตัวเศษและตัวส่วน
    const examMaxTotal = usesComponentGrading ? (useMidterm ? midtermMaxScore : 0) + finalMaxScore : 0;

    const displayTotal = usesComponentGrading
      ? grandTotal + (useMidterm ? (midtermScore ?? 0) : 0) + (finalScore ?? 0) // งาน+พิเศษ (grandTotal) + สอบจริงที่ได้
      : grandTotal; // งาน+พิเศษ

    const displayMax = usesComponentGrading
      ? totalMaxScore + specialTotal + examMaxTotal   // เต็มงาน + คะแนนพิเศษที่ได้ + เต็มสอบทั้งหมด
      : totalMaxScore + specialTotal;                  // เต็มงาน + คะแนนพิเศษที่ได้

    return {
      student: s, subMap, presetTotals, assignmentTotal, submittedCount,
      onTimeCount, lateCount, onTimeRate, totalDaysLate,
      specialTotal, percentage, grade, grandTotal,
      attendanceRate, passFailStatus,
      scaledFormative, midtermScore, finalScore, componentTotal, midtermRaw, finalRaw,
      displayTotal, displayMax, // ★ เพิ่ม
    };
  });
}, [students, submissions, assignments, presets, scoreEvents, criteria, totalMaxScore,
    attendanceMap, gradingMode, passThresholdPercent, examScores, formativeMaxScore, midtermMaxScore, finalMaxScore, useMidterm]); // ★ เพิ่ม dependency

  async function handleAdjustPreset(studentId: string, presetId: string, currentValue: number, newValue: number) {
    if (readOnly) return;
    const delta = newValue - currentValue;
    if (delta === 0) return;
    try {
      const res = await fetch("/api/score-events/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_section_id: sectionId, student_id: studentId, preset_id: presetId,
          delta, created_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แก้ไขคะแนนไม่สำเร็จ");
      setScoreEvents(prev => [...prev, { id: json.event?.id ?? `local-${Date.now()}`, student_id: studentId, preset_id: presetId, points: delta }]);
    } catch (e: any) {
      showToast("แก้ไขคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error"); // ★ toast แทน alert
    }
  }
  async function saveExamConfig(examType: "midterm" | "final", rawMax: number | null) {
  if (readOnly) return;
  try {
    const res = await fetch("/api/subject-grades/exam-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_section_id: sectionId, exam_type: examType, raw_max_score: rawMax }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
    showToast("บันทึกคะแนนเต็มดิบสำเร็จ", "success");
  } catch (e: any) {
    showToast("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error");
  }
}
  // ให้คะแนนงานที่มอบหมายแบบ inline จากตารางคะแนนรวมนี้โดยตรง (เฉพาะครูประจำวิชา ไม่ใช่ readOnly)
  // NOTE: endpoint /api/assignment-submissions/grade ต้อง upsert สถานะเป็น "reviewed"
  // (ไม่ใช่ "graded") ให้ตรงกับ CHECK constraint ของตาราง assignment_submissions
  async function handleUpdateExamScore(
  studentId: string,
  examType: "midterm" | "final",
  rawScore: number,
  rawMax?: number | null // ถ้าไม่ส่งมา จะ fallback ไปใช้ rawMidtermMax/rawFinalMax ของวิชา
) {
  if (readOnly) return;
  const effectiveRawMax = rawMax ?? (examType === "midterm" ? rawMidtermMax : rawFinalMax);
  const ceiling = effectiveRawMax && effectiveRawMax > 0 ? effectiveRawMax : (examType === "midterm" ? midtermMaxScore : finalMaxScore);

  if (Number.isNaN(rawScore) || rawScore < 0 || rawScore > ceiling) {
    showToast(`คะแนนต้องอยู่ระหว่าง 0 - ${ceiling} คะแนน`, "error");
    return;
  }

  const maxScore = examType === "midterm" ? midtermMaxScore : finalMaxScore;
  const weighted = getExamWeightedScore(rawScore, effectiveRawMax, maxScore);

  try {
    const res = await fetch("/api/subject-grades/exam-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject_section_id: sectionId,
        student_id: studentId,
        exam_type: examType,
        score: weighted,          // ★ ค่า scale แล้ว ใช้คำนวณเกรดต่อได้เลย
        raw_score: rawScore,      // ★ เก็บดิบไว้โชว์ย้อนหลัง
        raw_max_score: effectiveRawMax ?? null,
        graded_by: currentUserId || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "บันทึกคะแนนไม่สำเร็จ");
    setExamScores(prev => {
      const exists = prev.some(e => e.student_id === studentId && e.exam_type === examType);
      const next = { student_id: studentId, exam_type: examType, score: weighted, raw_score: rawScore, raw_max_score: effectiveRawMax ?? null };
      if (exists) return prev.map(e => (e.student_id === studentId && e.exam_type === examType ? { ...e, ...next } : e));
      return [...prev, next];
    });
  } catch (e: any) {
    showToast("บันทึกคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error");
  }
}
async function handleUpdateScore(studentId: string, assignmentId: string, newScore: number) {
  if (readOnly) return;
  const assignment = assignments.find(a => a.id === assignmentId);
  if (!assignment) return;
  if (Number.isNaN(newScore) || newScore < 0 || newScore > (assignment.max_score ?? 0)) {
    showToast(`คะแนนต้องอยู่ระหว่าง 0 - ${assignment.max_score} คะแนน`, "error"); // ★ toast แทน alert
    return;
  }
  try {
    const res = await fetch("/api/assignment-submissions/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject_section_id: sectionId,
        assignment_id: assignmentId,
        student_id: studentId,
        score: newScore,
        graded_by: currentUserId || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "บันทึกคะแนนไม่สำเร็จ");

    const updated: Submission = json.submission ?? {
      id: `local-${Date.now()}`,
      assignment_id: assignmentId,
      student_id: studentId,
      status: "reviewed",
      score: newScore,
      graded_at: new Date().toISOString(),
    };

    setSubmissions(prev => {
      const exists = prev.some(s => s.assignment_id === assignmentId && s.student_id === studentId);
      if (exists) return prev.map(s => (s.assignment_id === assignmentId && s.student_id === studentId ? { ...s, ...updated } : s));
      return [...prev, updated];
    });
  } catch (e: any) {
    showToast("บันทึกคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error"); // ★ toast แทน alert
  }
}

  async function saveCriteria(newRows: Criterion[]) {
    if (readOnly) return;
    try {
      const res = await fetch("/api/grade-criteria", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_section_id: sectionId, rows: newRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setCriteria(json.criteria ?? []);
      setShowGradeSetting(false);
      showToast("บันทึกเกณฑ์เกรดสำเร็จ", "success"); // ★ toast
    } catch (e: any) {
      showToast("บันทึกเกณฑ์เกรดไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error"); // ★ toast แทน alert
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const sheetRows = rows.map(r => {
        const row: Record<string, string | number> = {
          "เลขที่": r.student.seat_number,
          "ชื่อ-นามสกุล": `${r.student.prefix ?? ""}${r.student.first_name} ${r.student.last_name}`.trim(),
        };
        orderedAssignments.forEach(a => {
  const sub = r.subMap[a.id];
  const info = getLateInfo(a, sub);
  const onTimeTag = !info.hasData ? "" : info.isLate ? ` (ส่งช้า${info.isManual ? "" : ` ${info.daysLate} วัน`})` : " (ตรงเวลา)";
  const weightedTag = isWeighted(a) && sub?.score !== null && sub?.score !== undefined
    ? ` [คะแนนจริง ${fmtScore(getAssignmentWeightedScore(a, sub.score))}/${a.weight_percent}]`
    : "";
  row[a.title] = sub?.score !== null && sub?.score !== undefined
    ? `${sub.score}${onTimeTag}${weightedTag}`
    : (sub ? "ส่งแล้ว-ยังไม่ให้คะแนน" : "ไม่ส่งงาน");
});
        presets.forEach(p => { row[p.label] = r.presetTotals[p.id] ?? 0; });
        row["คะแนนงานรวม"] = r.assignmentTotal;
        row["คะแนนพิเศษรวม"] = r.specialTotal;
        row["คะแนนรวมทั้งหมด"] = r.grandTotal;
        row["เปอร์เซ็นต์"] = Number(r.percentage.toFixed(2));
        row["เกรด"] = gradingMode === "pass_fail" ? (r.passFailStatus ?? "ไม่มีข้อมูล") : r.grade;   // ★ แก้บรรทัดนี้
        row["ส่งตรงเวลา (ชิ้น)"] = r.onTimeCount;
row["ส่งช้า (ชิ้น)"] = r.lateCount;
row["รวมจำนวนวันที่สายทั้งหมด"] = r.totalDaysLate; // ★ เพิ่ม
row["อัตราส่งตรงเวลา (%)"] = r.onTimeRate === null ? "ไม่มีข้อมูล" : Number(r.onTimeRate.toFixed(2));
        return row;
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "คะแนนรวม");

      const fileName = `คะแนนรวม_${subjectCode || subjectTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e: any) {
      showToast("ดาวน์โหลดไฟล์ไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error"); // ★ toast แทน alert
    } finally {
      setExporting(false);
    }
  }
  function GroupScoreCard({
  groupSummary,
  rows,
  readOnly,
  onGroupSettingsSaved,
}: {
  groupSummary: GroupSummary;
  rows: ReturnType<typeof buildRowsType>;
  readOnly?: boolean;
  onGroupSettingsSaved: (updated: Partial<GroupSummary>) => void;
}) {
  const [displayName, setDisplayName] = useState(groupSummary.displayName ?? "");
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(groupSummary.displayName ?? "");
    const drafts: Record<string, string> = {};
    (groupSummary.subjects ?? []).forEach(s => { drafts[s.id] = String(s.weight_percent); });
    setWeightDrafts(drafts);
  }, [groupSummary.groupCode, groupSummary.displayName, groupSummary.subjects]);

  if (!groupSummary.grouped) return null;

  const weightSum = Object.values(weightDrafts).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const weightWarning = Math.abs(weightSum - 100) > 0.5;

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    try {
      const weights = (groupSummary.subjects ?? []).map(s => ({
        subject_id: s.id,
        weight_percent: Number(weightDrafts[s.id] ?? s.weight_percent),
      }));
      const res = await fetch("/api/subject-grades/group-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_code: groupSummary.groupCode, display_name: displayName.trim() || null, weights }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      onGroupSettingsSaved({ displayName: displayName.trim() || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      showToast("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error"); // ★ toast แทน alert
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 print:hidden">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-black text-slate-800 text-sm flex items-center gap-1.5">🧮 คะแนนรวมกลุ่ม</h3>
        <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
          รหัสกลุ่ม: {groupSummary.groupCode}
        </span>
      </div>

      {groupSummary.isGuessed && (
        <p className="text-[11px] text-amber-500 font-bold mb-3 bg-amber-50 rounded-lg px-3 py-1.5 inline-block">
          ⚡ ระบบเดากลุ่มนี้จากรหัสวิชาอัตโนมัติ (ยังไม่ได้ตั้งค่าถาวร) — ถ้าต้องการให้คงกลุ่มนี้ไว้แน่นอน ไปตั้งค่าที่หน้า "ตั้งค่ารายวิชา"
        </p>
      )}

      {/* ช่องรหัสวิชาในกลุ่ม เรียงติดกัน */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {(groupSummary.subjects ?? []).map(s => (
          <span key={s.id} className="px-3 py-1.5 rounded-xl bg-violet-50 border border-violet-100 text-violet-700 text-xs font-black">
            {s.subject_code} · {s.name_th}
          </span>
        ))}
      </div>

      {/* ตั้งชื่อวิชารวม + % น้ำหนัก */}
       <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-4 mb-5 space-y-3">
        <div>
          <p className="text-[11px] font-black text-violet-500 mb-1.5">ชื่อวิชารวม (ไม่บังคับ)</p>
          <input
            type="text"
            disabled={readOnly}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={`เช่น สุขศึกษาและพลศึกษา (${groupSummary.groupCode})`}
            className="w-full border-2 border-violet-200 rounded-xl px-3 py-2 text-sm font-bold bg-white disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div>
          <p className="text-[11px] font-black text-violet-500 mb-1.5">% น้ำหนักคะแนนของแต่ละวิชาในกลุ่ม</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(groupSummary.subjects ?? []).map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-white rounded-lg border border-violet-100 px-3 py-2">
                <span className="text-xs font-bold text-slate-600 flex-1 truncate">{s.subject_code}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={readOnly}
                  value={weightDrafts[s.id] ?? ""}
                  onChange={e => setWeightDrafts(prev => ({ ...prev, [s.id]: e.target.value }))}
                  className="w-16 text-center border-2 border-slate-200 rounded-lg py-1 text-xs font-black disabled:bg-slate-50"
                />
                <span className="text-xs font-bold text-slate-400">%</span>
              </div>
            ))}
          </div>
          {weightWarning && (
            <p className="text-[11px] font-black text-amber-500 mt-1.5">
              ⚠️ รวม % ตอนนี้ = {weightSum.toFixed(1)}% (ควรรวมให้ได้ 100% พอดี)
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 text-white font-black text-xs shadow"
            >
              {saving ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่ากลุ่ม"}
            </button>
            {saved && <span className="text-xs font-black text-emerald-500">✅ บันทึกแล้ว</span>}
          </div>
        )}
      </div>

      {/* ตารางคะแนนรวมกลุ่ม (ถ่วงน้ำหนักแล้ว) */}
      {rows.length === 0 ? (
        <p className="text-center text-slate-300 text-xs font-bold py-6">ไม่มีนักเรียน</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map(r => {
            const s = r.student;
            const combinedPct = groupSummary.combinedPercentByStudent?.[s.id] ?? 0;
            return (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                {s.avatar_url ? (
                  <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 text-xs font-black flex items-center justify-center">
                    {s.first_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-700 truncate">
                    {s.prefix}{s.first_name} {s.last_name}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 text-white text-xs font-black shrink-0">
                  {combinedPct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
  function handlePrint() {
    window.print();
  }
  function SummaryStats({ rows, totalMaxScore, assignmentsCount }: {
  rows: ReturnType<typeof buildRowsType>;
  totalMaxScore: number;
  assignmentsCount: number;
}) {
  if (rows.length === 0) return null;
  const avgPercentage = rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length;
  const avgOnTime = (() => {
    const withData = rows.filter(r => r.onTimeRate !== null);
    if (withData.length === 0) return null;
    return withData.reduce((sum, r) => sum + (r.onTimeRate ?? 0), 0) / withData.length;
  })();

  const cards = [
    { label: "จำนวนนักเรียน", value: `${rows.length} คน`, icon: "👥", grad: "from-violet-500 to-indigo-500" },
    { label: "จำนวนชิ้นงาน", value: `${assignmentsCount} ชิ้น (${totalMaxScore} คะแนนเต็ม)`, icon: "📚", grad: "from-sky-500 to-cyan-500" },
    { label: "คะแนนเฉลี่ยของห้อง", value: `${avgPercentage.toFixed(1)}%`, icon: "📈", grad: "from-emerald-500 to-teal-500" },
    { label: "อัตราส่งตรงเวลาเฉลี่ย", value: avgOnTime === null ? "ไม่มีข้อมูล" : `${avgOnTime.toFixed(0)}%`, icon: "⏱️", grad: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
      {cards.map(c => (
        <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.grad} p-4 text-white shadow-sm`}>
          <p className="text-lg leading-none mb-2">{c.icon}</p>
          <p className="text-[11px] font-bold opacity-90">{c.label}</p>
          <p className="text-lg font-black mt-0.5">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {reportStudent && (
        <StudentReportModal
          row={rows.find(r => r.student.id === reportStudent.id)!}
          assignments={orderedAssignments}
          sectionId={sectionId}
          currentUserId={currentUserId}
          attendance={attendanceMap[reportStudent.id] ?? { present: 0, total: 0 }}
          subjectTitle={subjectTitle}
          subjectCode={subjectCode}
          academicYearLabel={academicYearLabel}
          classroomLabel={classroomLabel}
          homeroomTeacherName={homeroomTeacherName}
          subjectTeacherName={subjectTeacherName}
          readOnly={readOnly} 
          gradingMode={gradingMode}
          onClose={() => setReportStudent(null)}
          onToast={showToast}
        />
      )}

      {showGradeSetting && !readOnly && (
        <GradeSettingModal
          initialCriteria={criteria}
          onCancel={() => setShowGradeSetting(false)}
          onSave={saveCriteria}
        />
      )}
      {!loading && !error && (
      <SummaryStats rows={rows} totalMaxScore={totalMaxScore} assignmentsCount={assignments.length} />
    )}

      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="font-black text-slate-800 text-lg">คะแนนรวม</h2>
          <p className="text-slate-400 text-xs font-bold">
            {readOnly ? "มุมมองดูอย่างเดียว — ดูและดาวน์โหลด/พิมพ์ได้ แก้ไขไม่ได้" : "คลิกที่คะแนนงาน หรือคะแนนพิเศษ เพื่อแก้ไข/ให้คะแนนได้ทันที · กด Enter หรือลูกศร ↑↓←→ เพื่อบันทึกและย้ายไปช่องข้างเคียง · ลากหัวตารางชิ้นงานเพื่อสลับลำดับได้"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
  onClick={() => setTab(tab === "table" ? "podium" : "table")}
  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-white font-black text-sm flex items-center gap-1.5 shadow-sm"
>
  {tab === "table" ? "🏆 อันดับคะแนน" : "🔢 ตาราง"}
</button>
{!readOnly && gradingMode === "numeric" && (
  <button
    onClick={() => setShowGradeSetting(true)}
    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-400 to-pink-400 hover:from-fuchsia-500 hover:to-pink-500 text-white font-black text-sm flex items-center gap-1.5 shadow-sm"
  >
    ⚙️ ตั้งค่าคำนวณเกรด
  </button>
)}
          {readOnly && (
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
            >
              🖨️ พิมพ์
            </button>
          )}
          <button
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            📊 {exporting ? "กำลังดาวน์โหลด..." : "Export"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลดข้อมูลคะแนน...</div>
      ) : error ? (
        <p className="text-red-600 text-xs font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-3">❌ {error}</p>
      ) : tab === "table" ? (
        <GradeTable
  rows={rows}
  assignments={orderedAssignments}
  presets={presets}
  totalMaxScore={totalMaxScore}
  onOpenReport={s => setReportStudent(s)}
  onAdjustPreset={handleAdjustPreset}
  onUpdateScore={handleUpdateScore}
  onUpdateExamScore={handleUpdateExamScore}     // ★ add
  getLateInfo={getLateInfo}
  readOnly={readOnly}
  gradingMode={gradingMode}
  useMidterm={useMidterm}                       // ★ add
  formativeMaxScore={formativeMaxScore}          // ★ add
  midtermMaxScore={midtermMaxScore}              // ★ add
  finalMaxScore={finalMaxScore}                  // ★ add
  onReorderAssignments={setAssignmentOrder}      // ★ ลากสลับลำดับหัวตาราง
  rawMidtermMax={rawMidtermMax}              // ★ เพิ่ม
  rawFinalMax={rawFinalMax}                  // ★ เพิ่ม
  onChangeRawMidtermMax={setRawMidtermMax}   // ★ เพิ่ม
  onChangeRawFinalMax={setRawFinalMax}       // ★ เพิ่ม
  onSaveExamConfig={saveExamConfig}   
/>
      ) : (
        <PodiumView rows={rows} hideScores={hideScores} onToggleHide={() => setHideScores(v => !v)} />
      )}
    {!loading && !error && (
  <GroupScoreCard
    groupSummary={groupSummary}
    rows={rows}
    readOnly={readOnly}
    onGroupSettingsSaved={updated => setGroupSummary(prev => ({ ...prev, ...updated }))}
  />
)}
</div>
);
}

// ★ ตอนนี้ activeCell อ้างอิงด้วย "col" (assignment id / preset:id / midterm / final) + studentId
// เพื่อให้ย้ายด้วยลูกศรข้ามระหว่างคอลัมน์ประเภทต่างกันได้ในระบบเดียวกัน
type ActiveCell = { col: string; studentId: string } | null;

// ★ ตำแหน่ง: บรรทัดเปิดฟังก์ชัน function GradeTable({...}: {...}) {...}
function GradeTable({
  rows, assignments, presets, totalMaxScore, onOpenReport, onAdjustPreset, onUpdateScore,
  onUpdateExamScore, getLateInfo, readOnly, gradingMode = "numeric",
  useMidterm = false, formativeMaxScore = 0, midtermMaxScore = 0, finalMaxScore = 0,
  onReorderAssignments,
  rawMidtermMax, rawFinalMax, onChangeRawMidtermMax, onChangeRawFinalMax, onSaveExamConfig,  // ★ เพิ่ม
}: {
  rows: ReturnType<typeof buildRowsType>;
  assignments: Assignment[];
  presets: Preset[];
  totalMaxScore: number;
  onOpenReport: (s: Student) => void;
  onAdjustPreset: (studentId: string, presetId: string, currentValue: number, newValue: number) => void;
  onUpdateScore: (studentId: string, assignmentId: string, newScore: number) => void;
  onUpdateExamScore: (studentId: string, examType: "midterm" | "final", rawScore: number, rawMax?: number | null) => void; // ★ แก้ signature
  getLateInfo: (assignment: Assignment, sub?: Submission) => LateInfo;
  readOnly: boolean;
  gradingMode?: "numeric" | "pass_fail";
  useMidterm?: boolean;
  formativeMaxScore?: number;
  midtermMaxScore?: number;
  finalMaxScore?: number;
  onReorderAssignments: (newOrderIds: string[]) => void;
  rawMidtermMax: number | null;                                   // ★ เพิ่ม
  rawFinalMax: number | null;                                     // ★ เพิ่ม
  onChangeRawMidtermMax: (v: number | null) => void;              // ★ เพิ่ม
  onChangeRawFinalMax: (v: number | null) => void;                // ★ เพิ่ม
  onSaveExamConfig: (examType: "midterm" | "final", rawMax: number | null) => void; // ★ เพิ่ม
}) {
  // ★ ช่องที่กำลังกรอกคะแนนอยู่ตอนนี้ (คุมจากที่นี่ เพื่อให้กด Enter/ลูกศร แล้วสั่งเปิดช่องถัดไปได้)
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  // ★ id ชิ้นงานที่กำลังลากอยู่ (สำหรับลากสลับหัวตาราง)
  const [draggedId, setDraggedId] = useState<string | null>(null);
const unitHeaderGroups = useMemo(() => {
  const groups: { key: string; label: string; span: number }[] = [];
  assignments.forEach(a => {
    const key = a.teaching_unit_no != null ? `unit-${a.teaching_unit_no}` : `none-${a.id}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.span += 1;
    } else {
      groups.push({
        key,
        label: a.teaching_unit_no != null
          ? `หน่วยที่ ${a.teaching_unit_no}${a.unit_name ? " · " + a.unit_name : ""}`
          : "",
        span: 1,
      });
    }
  });
  return groups;
}, [assignments]);

const hasAnyUnitGroup = unitHeaderGroups.some(g => g.label);
  // ★ รายการ "คอลัมน์กรอกคะแนนได้" ทั้งหมดตามลำดับที่แสดงจริงในตาราง ใช้คำนวณตำแหน่งตอนกดลูกศร
  const navColumns = useMemo(() => {
    const cols: string[] = assignments.map(a => a.id);
    presets.forEach(p => cols.push(`preset:${p.id}`));
    if (gradingMode === "numeric") {
      if (useMidterm) cols.push("midterm");
      cols.push("final");
    }
    return cols;
  }, [assignments, presets, gradingMode, useMidterm]);

  function handleNavigate(fromCol: string, studentId: string, dir: NavDir) {
    const rowIdx = rows.findIndex(r => r.student.id === studentId);
    const colIdx = navColumns.indexOf(fromCol);
    if (rowIdx === -1 || colIdx === -1) { setActiveCell(null); return; }
    let newRowIdx = rowIdx;
    let newColIdx = colIdx;
    if (dir === "down") newRowIdx = Math.min(rows.length - 1, rowIdx + 1);
    if (dir === "up") newRowIdx = Math.max(0, rowIdx - 1);
    if (dir === "right") newColIdx = Math.min(navColumns.length - 1, colIdx + 1);
    if (dir === "left") newColIdx = Math.max(0, colIdx - 1);
    setActiveCell({ col: navColumns[newColIdx], studentId: rows[newRowIdx].student.id });
  }

  // ★ ลากหัวตารางชิ้นงานเพื่อสลับลำดับก่อน-หลัง
  function handleDragStart(id: string) {
    if (readOnly) return;
    setDraggedId(id);
  }
  function handleDragOverTh(e: React.DragEvent) {
    if (readOnly) return;
    e.preventDefault();
  }
  function handleDropTh(overId: string) {
    if (readOnly || !draggedId || draggedId === overId) { setDraggedId(null); return; }
    const ids = assignments.map(a => a.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(overId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const newIds = [...ids];
      newIds.splice(fromIdx, 1);
      newIds.splice(toIdx, 0, draggedId);
      onReorderAssignments(newIds);
    }
    setDraggedId(null);
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="font-bold text-sm">ไม่มีนักเรียนในวิชานี้</p>
      </div>
    );
  }

  return (
  <div className="bg-white rounded-2xl border border-slate-100 overflow-auto max-h-[75vh]">
    <table className="w-full min-w-[960px] border-collapse">
  <thead className="sticky top-0 z-20">
  {hasAnyUnitGroup && (
    <tr className="bg-indigo-100/70">
      <th className="sticky left-0 bg-indigo-100/70" />
      <th className="bg-indigo-100/70" />
      {unitHeaderGroups.map(g => (
        <th
          key={g.key}
          colSpan={g.span}
          className="px-2 py-1.5 text-center text-[10px] font-black text-indigo-700 border-b border-indigo-200"
        >
          {g.label}
        </th>
      ))}
      {presets.length > 0 && <th colSpan={presets.length} />}
      {gradingMode === "numeric" && <th colSpan={useMidterm ? 3 : 2} />}
      <th colSpan={3} />
    </tr>
  )}
  <tr className="bg-gradient-to-r from-indigo-50 via-sky-50 to-fuchsia-50">
    <th className="text-left text-[11px] font-black text-slate-600 px-5 py-3 sticky left-0 top-0 bg-gradient-to-r from-indigo-50 to-sky-50 z-30">
      Name
    </th>
    <th className="px-3 py-3 text-center text-[11px] font-black text-slate-400 bg-sky-50">Report</th>
    {assignments.map(a => (
      // ★ column header ลากสลับลำดับได้ (ไม่ readOnly เท่านั้น)
<th
  key={a.id}
  draggable={!readOnly}
  onDragStart={() => handleDragStart(a.id)}
  onDragOver={handleDragOverTh}
  onDrop={() => handleDropTh(a.id)}
  className={`relative px-3 py-3 text-center min-w-[110px] bg-sky-50/70 transition-opacity ${
    !readOnly ? "cursor-move" : ""
  } ${draggedId === a.id ? "opacity-40" : ""}`}
  title={!readOnly ? "ลากเพื่อย้ายลำดับคอลัมน์นี้" : undefined}
>
  {!readOnly && (
    <span className="absolute top-1 left-1.5 text-indigo-400 text-xs leading-none select-none">⠿</span>
  )}
  <p className="text-[11px] font-black text-indigo-700 truncate max-w-[110px] mx-auto" title={a.title}>{a.title}</p>
  <p className="text-[9px] text-indigo-600 font-bold">
    {isWeighted(a) ? `กรอกเต็ม ${a.max_score} → นน. ${a.weight_percent}%` : `เต็ม ${a.max_score} คะแนน`}
  </p>
</th>
    ))}
    {presets.map(p => (
  <th key={p.id} className="px-3 py-3 text-center min-w-[100px] bg-fuchsia-50/70">
    <p className="text-[11px] font-black text-fuchsia-600">{p.emoji} {p.label}</p>
    <p className="text-[9px] text-fuchsia-300 font-bold">คะแนนพิเศษ</p>
  </th>
))}

{gradingMode === "numeric" && (
  <>
    <th className="px-3 py-3 text-center min-w-[90px] bg-indigo-50/70">
      <p className="text-[11px] font-black text-indigo-700">คะแนนเก็บ</p>
      <p className="text-[9px] text-indigo-300 font-bold">เต็ม {formativeMaxScore}</p>
    </th>
    {useMidterm && (
  <th className="px-3 py-3 text-center min-w-[90px] bg-teal-50/70">
    <p className="text-[11px] font-black text-teal-700">กลางภาค</p>
    {readOnly ? (
      <p className="text-[9px] text-teal-300 font-bold">
        {rawMidtermMax ? `กรอกเต็ม ${rawMidtermMax} → นน. ${midtermMaxScore}` : `เต็ม ${midtermMaxScore}`}
      </p>
    ) : (
      <input
        type="number" min={0}
        value={rawMidtermMax ?? ""}
        placeholder={`เต็ม ${midtermMaxScore}`}
        onChange={e => onChangeRawMidtermMax(e.target.value === "" ? null : Number(e.target.value))}
        onBlur={() => onSaveExamConfig("midterm", rawMidtermMax)}
        className="w-14 text-center text-[9px] border-b border-teal-300 bg-transparent focus:outline-none"
        title="ใส่คะแนนเต็มดิบของข้อสอบจริง (ถ้าเต็มไม่เท่ากับที่ตั้งไว้)"
      />
    )}
  </th>
)}
<th className="px-3 py-3 text-center min-w-[90px] bg-orange-50/70">
  <p className="text-[11px] font-black text-orange-700">ปลายภาค</p>
  {readOnly ? (
    <p className="text-[9px] text-orange-300 font-bold">
      {rawFinalMax ? `กรอกเต็ม ${rawFinalMax} → นน. ${finalMaxScore}` : `เต็ม ${finalMaxScore}`}
    </p>
  ) : (
    <input
      type="number" min={0}
      value={rawFinalMax ?? ""}
      placeholder={`เต็ม ${finalMaxScore}`}
      onChange={e => onChangeRawFinalMax(e.target.value === "" ? null : Number(e.target.value))}
      onBlur={() => onSaveExamConfig("final", rawFinalMax)}
      className="w-14 text-center text-[9px] border-b border-orange-300 bg-transparent focus:outline-none"
      title="ใส่คะแนนเต็มดิบของข้อสอบจริง (ถ้าเต็มไม่เท่ากับที่ตั้งไว้)"
    />
  )}
</th>
  </>
)}
{/* ★ ลำดับคอลัมน์ท้ายตาราง: รวม -> ระดับผลการเรียน/สถานะ -> ส่งตรงเวลา (ย้ายระดับผลการเรียนไปไว้หลังคอลัมน์รวมตามที่ต้องการ) */}
<th className="px-3 py-3 text-center min-w-[100px] bg-emerald-50/70">
  <p className="text-[11px] font-black text-emerald-700">รวม</p>
  <p className="text-[9px] text-emerald-400 font-bold">งาน+พิเศษ{gradingMode === "numeric" ? "+สอบ" : ""}</p>
</th>
<th className="px-3 py-3 text-center min-w-[70px] bg-fuchsia-50/70">
  <p className="text-[11px] font-black text-fuchsia-700">
    {gradingMode === "pass_fail" ? "สถานะ" : "ระดับผลการเรียน"}
  </p>
</th>
<th className="px-3 py-3 text-center min-w-[90px] bg-amber-50/70">
  <p className="text-[11px] font-black text-amber-700">ส่งตรงเวลา</p>
</th>

  </tr>
</thead>
      <tbody>
          {rows.map(r => {
            const s = r.student;
            return (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-5 py-3 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 text-xs font-black flex items-center justify-center">
                        {s.first_name[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name} ({s.nick_name})</p>
                      <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <button
                    onClick={() => onOpenReport(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black whitespace-nowrap"
                  >
                    📄 Report
                  </button>
                </td>
                {assignments.map(a => {
    const sub = r.subMap[a.id];
    const lateInfo = getLateInfo(a, sub); // ★ เปลี่ยนจาก isOnTime(a, sub)
    return (
      <td key={a.id} className="text-center px-3 py-3">
        {readOnly ? (
  !sub ? (
    <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600">ไม่ส่งงาน</span>
  ) : sub.score === null ? (
    <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-600">รอตรวจ</span>
  ) : (
  (() => {
    const isLate = lateInfo.hasData && lateInfo.isLate;
  const bgClass = isLate ? "bg-orange-50 ring-1 ring-orange-200" : "bg-emerald-50 ring-1 ring-emerald-200";
  const textClass = isLate ? "text-orange-600" : "text-emerald-600";
  const weighted = isWeighted(a) ? getAssignmentWeightedScore(a, sub.score) : null;
  return (
    <div className={`inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl ${bgClass}`}>
      <span className={`text-sm font-black ${textClass}`}>
        {sub.score}
      </span>
      {weighted !== null && (
        <span className="text-[9px] font-black text-violet-500">= {fmtScore(weighted)} คะแนนจริง</span>
      )}
      {lateInfo.hasData && (
        <span className={`text-[9px] font-black ${textClass}`}>
          {isLate ? `⏰ ส่งช้า${lateInfo.isManual ? "" : ` ${lateInfo.daysLate} วัน`}` : "✅ ตรงเวลา"}
        </span>
        )}
      </div>
    );
  })()
)
) : (
  <EditableScoreCell
  submission={sub}
  assignment={a}
  lateInfo={lateInfo}
  isEditing={activeCell?.col === a.id && activeCell?.studentId === s.id}
  onRequestEdit={() => setActiveCell({ col: a.id, studentId: s.id })}
  onCommit={newScore => onUpdateScore(s.id, a.id, newScore)}
  onNavigate={dir => handleNavigate(a.id, s.id, dir)}
  onCancelEdit={() => setActiveCell(null)}
/>
)}
      </td>
    );
  })}
                {presets.map(p => (
                  <td key={p.id} className="text-center px-3 py-3">
                    {readOnly ? (
                      <span className={`text-sm font-black ${(r.presetTotals[p.id] ?? 0) > 0 ? "text-emerald-600" : (r.presetTotals[p.id] ?? 0) < 0 ? "text-red-500" : "text-slate-300"}`}>
                        {r.presetTotals[p.id] ?? 0}
                      </span>
                    ) : (
                      <EditablePresetCell
                        value={r.presetTotals[p.id] ?? 0}
                        isEditing={activeCell?.col === `preset:${p.id}` && activeCell?.studentId === s.id}
                        onRequestEdit={() => setActiveCell({ col: `preset:${p.id}`, studentId: s.id })}
                        onCommit={newValue => onAdjustPreset(s.id, p.id, r.presetTotals[p.id] ?? 0, newValue)}
                        onNavigate={dir => handleNavigate(`preset:${p.id}`, s.id, dir)}
                        onCancelEdit={() => setActiveCell(null)}
                      />
                    )}
                  </td>
                ))}
                
{gradingMode === "numeric" && (
  <>
    <td className="text-center px-3 py-3">
      <span className="text-sm font-black text-indigo-600">{fmtScore(r.scaledFormative)}</span>
      <span className="text-slate-400 font-bold text-xs">/{formativeMaxScore}</span>
    </td>
    {useMidterm && (
  <td className="text-center px-3 py-3">
    <EditableExamCell
      value={r.midtermScore}
      rawValue={r.midtermRaw}          // ★ เพิ่ม
      rawMax={rawMidtermMax}           // ★ เพิ่ม
      maxScore={midtermMaxScore}
      readOnly={readOnly}
      isEditing={activeCell?.col === "midterm" && activeCell?.studentId === s.id}
      onRequestEdit={() => setActiveCell({ col: "midterm", studentId: s.id })}
      onCommit={v => onUpdateExamScore(s.id, "midterm", v, rawMidtermMax)}
      onNavigate={dir => handleNavigate("midterm", s.id, dir)}
      onCancelEdit={() => setActiveCell(null)}
    />
  </td>
)}
<td className="text-center px-3 py-3">
  <EditableExamCell
    value={r.finalScore}
    rawValue={r.finalRaw}              // ★ เพิ่ม
    rawMax={rawFinalMax}               // ★ เพิ่ม
    maxScore={finalMaxScore}
    readOnly={readOnly}
    isEditing={activeCell?.col === "final" && activeCell?.studentId === s.id}
    onRequestEdit={() => setActiveCell({ col: "final", studentId: s.id })}
    onCommit={v => onUpdateExamScore(s.id, "final", v, rawFinalMax)}
    onNavigate={dir => handleNavigate("final", s.id, dir)}
    onCancelEdit={() => setActiveCell(null)}
  />
</td>
  </>
)}
{/* ★ คอลัมน์ "รวม" — มาก่อนคอลัมน์เกรด/สถานะ ตามลำดับใหม่ (รวม -> ระดับผลการเรียน -> ส่งตรงเวลา) */}
<td className="text-center px-3 py-3">
  <div className="inline-flex flex-col items-center gap-1 min-w-[70px]">
    <span className="font-black text-sm text-slate-700">
      {fmtScore(r.displayTotal)}<span className="text-slate-400 font-bold">/{fmtScore(r.displayMax)}</span>
    </span>
    <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${r.percentage >= 80 ? "bg-emerald-400" : r.percentage >= 50 ? "bg-amber-400" : "bg-rose-400"}`}
        style={{ width: `${Math.min(100, Math.max(0, r.percentage))}%` }}
      />
    </div>
    <span className="text-[9px] font-bold text-slate-400">{r.percentage.toFixed(0)}%</span>
  </div>
</td>
{/* ★ คอลัมน์เกรด/สถานะ — ย้ายมาไว้หลังคอลัมน์ "รวม" ตามที่ต้องการ */}
                <td className="text-center px-3 py-3">
  {gradingMode === "pass_fail" ? (
    r.passFailStatus === null ? (
      <span className="text-[10px] text-slate-300 font-bold">ไม่มีข้อมูล</span>
    ) : (
      <span className={`inline-flex items-center justify-center min-w-[36px] px-2.5 py-1.5 rounded-xl font-black text-xs text-white ${
        r.passFailStatus === "ผ่าน" ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-rose-500 to-red-400"
      }`}>
        {r.passFailStatus}
      </span>
    )
  ) : (
    <span className="inline-flex items-center justify-center min-w-[36px] px-2.5 py-1.5 rounded-xl font-black text-sm bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white">
      {r.grade}
    </span>
  )}
</td>
                <td className="text-center px-3 py-3">
                  {r.onTimeRate === null ? (
                    <span className="text-[10px] text-slate-300 font-bold">ไม่มีข้อมูล</span>
                  ) : (
                    <span className={`inline-flex items-center justify-center min-w-[50px] px-2 py-1.5 rounded-xl font-black text-xs ${
                      r.onTimeRate >= 80 ? "bg-emerald-50 text-emerald-600" : r.onTimeRate >= 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                    }`}>
                      {r.onTimeRate.toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ป้าย/ช่องกรอกคะแนนงานที่มอบหมาย แบบคลิกแก้ไขได้ทันที (สำหรับครูประจำวิชาเท่านั้น)
   - ยังไม่มีการส่งงานเลย ("ไม่ส่งงาน") -> คลิกเพื่อกรอกคะแนนได้เลย (ให้คะแนนย้อนหลัง/กรณีส่งงานกระดาษ)
   - ส่งงานแล้วแต่ยังไม่ตรวจ ("รอตรวจ") -> คลิกเพื่อกรอกคะแนน
   - มีคะแนนแล้ว -> คลิกที่ตัวเลขเพื่อแก้ไข
   ★ "isEditing" ถูกควบคุมจาก GradeTable เพื่อให้กด Enter/ลูกศร แล้วสั่งเปิดโหมดแก้ไขของ
   "ช่องข้างเคียง" (บน/ล่าง/ซ้าย/ขวา) ต่อได้ทันที เหมือนกรอกคะแนนใน Excel */
function EditableScoreCell({
  submission, assignment, lateInfo, isEditing, onRequestEdit, onCommit, onNavigate, onCancelEdit,
}: {
  submission?: Submission;
  assignment: Assignment;
  lateInfo: LateInfo;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCommit: (newScore: number) => void;
  onNavigate: (dir: NavDir) => void;
  onCancelEdit: () => void;
}) {
  const maxScore = assignment.max_score;
  const currentValueText = submission?.score !== null && submission?.score !== undefined ? String(submission.score) : "";
  const [draft, setDraft] = useState(currentValueText);
  const justActedRef = useRef(false);
  // ★ ใช้หน่วงเวลา (debounce) เพื่อ auto-save หลังพิมพ์เสร็จ ไม่ต้องกด Enter/blur
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(currentValueText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.score, isEditing]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function tryCommit(value: string) {
    const parsed = Number(value);
    if (value.trim() === "" || Number.isNaN(parsed)) return;
    if (submission?.score !== null && submission?.score !== undefined && parsed === submission.score) return;
    onCommit(parsed);
  }

  // ★ พิมพ์แล้ว auto-save หลังหยุดพิมพ์ 500ms โดยไม่ต้องกด Enter
  function handleChange(value: string) {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => tryCommit(value), 500);
  }

  // ★ Enter/ลูกศร = commit ค่าปัจจุบันก่อน แล้วสั่งย้ายไปช่องข้างเคียงตามทิศทาง
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      justActedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      tryCommit(draft);
      onNavigate("down");
    } else if (e.key === "Escape") {
      e.preventDefault();
      justActedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setDraft(currentValueText);
      onCancelEdit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      justActedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      tryCommit(draft);
      onNavigate("up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      justActedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      tryCommit(draft);
      onNavigate("down");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      justActedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      tryCommit(draft);
      onNavigate("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      justActedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      tryCommit(draft);
      onNavigate("right");
    }
  }

  function handleBlur() {
    if (justActedRef.current) {
      justActedRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    tryCommit(draft);
    onCancelEdit();
  }

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={0}
        max={maxScore}
        value={draft}
        onChange={e => handleChange(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-16 mx-auto block text-center border-2 border-sky-300 rounded-lg py-1 text-sm font-black focus:outline-none"
      />
    );
  }
  
  if (!submission) {
    return (
      <button
        onClick={onRequestEdit}
        title="คลิกเพื่อให้คะแนน"
        className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
      >
        ไม่ส่งงาน
      </button>
    );
  }

  if (submission.score === null) {
    return (
      <button
        onClick={onRequestEdit}
        title="คลิกเพื่อให้คะแนน"
        className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
      >
        รอตรวจ
      </button>
    );
  }

  // ★ มีคะแนนแล้ว: ใช้พื้นหลังสีตามสถานะส่งตรงเวลา/ส่งช้า
  const isLate = lateInfo.hasData && lateInfo.isLate;
  const bgClass = isLate ? "bg-orange-50 hover:bg-orange-100" : "bg-emerald-50 hover:bg-emerald-100";
  const textClass = isLate ? "text-orange-600" : "text-emerald-600";
  const weighted = isWeighted(assignment) ? getAssignmentWeightedScore(assignment, submission.score) : null;

return (
  <button onClick={onRequestEdit} title="คลิกเพื่อแก้ไขคะแนน"
    className={`flex flex-col items-center gap-0.5 mx-auto px-2.5 py-1.5 rounded-xl transition-colors ${bgClass} ring-1 ${isLate ? "ring-orange-200" : "ring-emerald-200"}`}>
    <span className={`text-sm font-black ${textClass}`}>
      {submission.score}
    </span>
    {weighted !== null && (
      <span className="text-[9px] font-black text-violet-500">= {fmtScore(weighted)} คะแนนจริง</span>
    )}
    {lateInfo.hasData && (
      <span className={`text-[9px] font-black ${isLate ? "text-orange-600" : "text-emerald-600"}`}>
        {isLate ? `⏰ ส่งช้า${lateInfo.isManual ? "" : ` ${lateInfo.daysLate} วัน`}` : "✅ ตรงเวลา"}
      </span>
    )}
  </button>
);
}

// ★ คะแนนกลางภาค/ปลายภาค — เปลี่ยนเป็น controlled (isEditing มาจาก GradeTable) เพื่อรองรับกดลูกศรย้ายช่อง
function EditableExamCell({
  value, rawValue, rawMax, maxScore, readOnly, isEditing, onRequestEdit, onCommit, onNavigate, onCancelEdit,
}: {
  value: number | null;        // ค่าที่ scale แล้ว ใช้แค่โชว์ "= X คะแนนจริง"
  rawValue: number | null;     // ค่าดิบที่กรอก/แก้ไข
  rawMax: number | null;
  maxScore: number;
  readOnly: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCommit: (rawScore: number) => void;
  onNavigate: (dir: NavDir) => void;
  onCancelEdit: () => void;
}) {
  const inputMax = rawMax && rawMax > 0 ? rawMax : maxScore;
  const currentText = rawValue !== null ? String(rawValue) : "";   // ★ แก้ จาก value -> rawValue
  const [draft, setDraft] = useState(currentText);
  const justActedRef = useRef(false);

  useEffect(() => { setDraft(currentText); }, [rawValue, isEditing]);   // ★ แก้ dep

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() === "" || Number.isNaN(parsed)) return;
    if (parsed !== rawValue) onCommit(parsed);   // ★ เทียบกับ rawValue
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("down"); }
    else if (e.key === "Escape") { e.preventDefault(); justActedRef.current = true; setDraft(currentText); onCancelEdit(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("down"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("left"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("right"); }
  }

  function handleBlur() {
    if (justActedRef.current) { justActedRef.current = false; return; }
    commit();
    onCancelEdit();
  }

  if (readOnly) {
    return (
      <span className="text-sm font-black text-slate-700 flex flex-col items-center">
        <span>{rawValue ?? "-"}<span className="text-slate-400 font-bold">/{inputMax}</span></span>
        {isExamWeighted(rawMax, maxScore) && value !== null && (
          <span className="text-[9px] font-black text-violet-500">= {fmtScore(value)} คะแนนจริง</span>
        )}
      </span>
    );
  }

  if (isEditing) {
    return (
      <input
        type="number" autoFocus min={0} max={inputMax}
        value={draft} onChange={e => setDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-16 mx-auto block text-center border-2 border-sky-300 rounded-lg py-1 text-sm font-black focus:outline-none"
      />
    );
  }

  const weighted = isExamWeighted(rawMax, maxScore) && value !== null ? value : null;

  return (
    <button onClick={onRequestEdit} title="คลิกเพื่อกรอกคะแนน"
      className="flex flex-col items-center gap-0.5 mx-auto text-sm font-black px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-700">
      {rawValue !== null ? (
        <span>{rawValue}<span className="text-slate-400 font-bold">/{inputMax}</span></span>
      ) : (
        <span className="text-amber-500 text-[10px]">ยังไม่กรอก</span>
      )}
      {weighted !== null && (
        <span className="text-[9px] font-black text-violet-500">= {fmtScore(weighted)} คะแนนจริง</span>
      )}
    </button>
  );
}

// ★ คะแนนพิเศษ — เปลี่ยนเป็น controlled เช่นกัน เพื่อรองรับกดลูกศรย้ายช่อง
function EditablePresetCell({
  value, isEditing, onRequestEdit, onCommit, onNavigate, onCancelEdit,
}: {
  value: number;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCommit: (newValue: number) => void;
  onNavigate: (dir: NavDir) => void;
  onCancelEdit: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const justActedRef = useRef(false);

  useEffect(() => { setDraft(String(value)); }, [value, isEditing]);

  function commit() {
    const parsed = Number(draft);
    if (Number.isNaN(parsed)) { setDraft(String(value)); return; }
    if (parsed !== value) onCommit(parsed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("down"); }
    else if (e.key === "Escape") { e.preventDefault(); justActedRef.current = true; setDraft(String(value)); onCancelEdit(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("down"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("left"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); justActedRef.current = true; commit(); onNavigate("right"); }
  }

  function handleBlur() {
    if (justActedRef.current) { justActedRef.current = false; return; }
    commit();
    onCancelEdit();
  }

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-16 text-center border-2 border-sky-300 rounded-lg py-1 text-sm font-black focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={onRequestEdit}
      title="คลิกเพื่อแก้ไขคะแนน"
      className={`text-sm font-black px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors ${
        value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-slate-300"
      }`}
    >
      {value}
    </button>
  );
}

function buildRowsType() {
  return [] as {
    student: Student;
    subMap: Record<string, Submission>;
    presetTotals: Record<string, number>;
    assignmentTotal: number;
    submittedCount: number;
    onTimeCount: number;
    totalDaysLate: number;
    lateCount: number;
    onTimeRate: number | null;
    specialTotal: number;
    percentage: number;
    grade: string;
    grandTotal: number;
    attendanceRate: number | null;
    passFailStatus: "ผ่าน" | "ไม่ผ่าน" | null;
    scaledFormative: number;        
    midtermScore: number | null;    
    finalScore: number | null;      
    componentTotal: number | null;  
    midtermRaw: number | null;      
    finalRaw: number | null; 
    displayTotal: number;    // ★ เพิ่ม
    displayMax: number; 
  }[];
}

// ★ อันดับคะแนน: คะแนนเท่ากันได้อันดับเดียวกัน + เอฟเฟกต์พลุกระดาษก่อนอันดับ 1-5 ปรากฏ
// + รายชื่อที่เหลือ (อันดับ 6 ขึ้นไป) พร้อมคะแนนแสดงเป็นลิสต์ด้านล่าง
function PodiumView({
  rows, hideScores, onToggleHide,
}: {
  rows: ReturnType<typeof buildRowsType>;
  hideScores: boolean;
  onToggleHide: () => void;
}) {
  const ranked = useMemo(() => computeRanked(rows), [rows]);
  const [showConfetti, setShowConfetti] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setShowConfetti(true);
    setRevealed(false);
    const revealTimer = setTimeout(() => setRevealed(true), 1600);
    const confettiTimer = setTimeout(() => setShowConfetti(false), 2400);
    return () => { clearTimeout(revealTimer); clearTimeout(confettiTimer); };
  }, [rows]);

  if (ranked.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
        <p className="font-bold text-sm">ยังไม่มีข้อมูลคะแนน</p>
      </div>
    );
  }

  const podiumRanked = ranked.filter(r => r.rank <= 5);
  const restRanked = ranked.filter(r => r.rank > 5);

  // จัดกลุ่มตามอันดับ (เผื่อคะแนนเท่ากันหลายคนในอันดับเดียว)
  const byRank = new Map<number, typeof podiumRanked>();
  podiumRanked.forEach(r => {
    if (!byRank.has(r.rank)) byRank.set(r.rank, []);
    byRank.get(r.rank)!.push(r);
  });

  // ลำดับการจัดวางแบบโพเดียม: 3(ซ้าย) - 1(กลาง) - 2(ขวา) - 4 - 5
  const visualRankOrder = [3, 1, 2, 4, 5].filter(n => byRank.has(n));
  const heights: Record<number, string> = { 1: "h-40", 2: "h-28", 3: "h-20", 4: "h-14", 5: "h-14" };
  const medalEmoji: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉", 4: "🏅", 5: "🏅" };

  return (
    <div className="relative">
      {showConfetti && <ConfettiBurst />}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-10">
        <div className="flex justify-end mb-6 print:hidden">
          <button onClick={onToggleHide} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs">
            {hideScores ? "👁️ แสดงคะแนน" : "🙈 ซ่อนคะแนน"}
          </button>
        </div>

        <div
          className={`flex items-end justify-center gap-3 sm:gap-6 flex-wrap transition-all duration-500 ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {visualRankOrder.map(rankNum => {
            const group = byRank.get(rankNum)!;
            return (
              <div key={rankNum} className="flex flex-col items-center">
                <p className="text-3xl mb-1">{medalEmoji[rankNum]}</p>
                <div className="flex items-end gap-2 flex-wrap justify-center max-w-[220px]">
                  {group.map(r => {
                    const s = r.student;
                    return (
                      <div key={s.id} className="flex flex-col items-center">
                        {s.avatar_url ? (
                          <img src={s.avatar_url} className="w-16 h-16 rounded-full object-cover border-4 border-amber-200 shadow" />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-400 text-white text-xl font-black flex items-center justify-center border-4 border-amber-200 shadow">
                            {s.first_name[0]}
                          </div>
                        )}
                        <p className="mt-2 text-sm font-black text-slate-700 text-center max-w-[100px] truncate">{s.first_name} {s.last_name}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] font-black text-fuchsia-500 my-2">
                  {hideScores ? "•••" : `${fmtScore(group[0].grandTotal)} คะแนน`}
                </p>
                <div className={`w-20 sm:w-28 ${heights[rankNum]} rounded-t-xl bg-gradient-to-b from-amber-300 to-amber-400 flex items-start justify-center pt-2`}>
                  <span className="text-white font-black text-lg">{rankNum}</span>
                </div>
              </div>
            );
          })}
        </div>

        {restRanked.length > 0 && (
          <div className={`mt-8 pt-6 border-t border-slate-100 transition-opacity duration-500 ${revealed ? "opacity-100" : "opacity-0"}`}>
            <p className="font-black text-slate-600 text-sm mb-3">📋 อันดับที่เหลือ</p>
            <div className="divide-y divide-slate-50">
              {restRanked.map(r => {
                const s = r.student;
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <span className="w-9 text-center text-xs font-black text-slate-400">#{r.rank}</span>
                    {s.avatar_url ? (
                      <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-black flex items-center justify-center">
                        {s.first_name[0]}
                      </div>
                    )}
                    <p className="flex-1 text-xs font-bold text-slate-600 truncate">{s.prefix}{s.first_name} {s.last_name}</p>
                    <span className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</span>
                    <span className="text-xs font-black text-fuchsia-500 shrink-0 min-w-[70px] text-right">
                      {hideScores ? "•••" : `${fmtScore(r.grandTotal)} คะแนน`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GradeSettingModal({
  initialCriteria, onCancel, onSave,
}: {
  initialCriteria: Criterion[];
  onCancel: () => void;
  onSave: (rows: Criterion[]) => void;
}) {
  const [rows, setRows] = useState<Criterion[]>(
    initialCriteria.length > 0
      ? initialCriteria
      : [
          { max_percent: 100, min_percent: 80, grade: "4" },
          { max_percent: 79, min_percent: 75, grade: "3.5" },
          { max_percent: 74, min_percent: 70, grade: "3" },
          { max_percent: 69, min_percent: 65, grade: "2.5" },
          { max_percent: 64, min_percent: 60, grade: "2" },
          { max_percent: 59, min_percent: 55, grade: "1.5" },
          { max_percent: 54, min_percent: 50, grade: "1" },
          { max_percent: 49, min_percent: 0, grade: "0" },
        ]
  );

  function updateRow(i: number, field: keyof Criterion, value: string) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [field]: field === "grade" ? value : Number(value) } : r)));
  }
  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows(prev => [...prev, { max_percent: 0, min_percent: 0, grade: "" }]);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800 text-lg">Grade Setting</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 mb-2 text-[11px] font-black text-slate-400 px-1">
          <span>Max</span><span>Min</span><span>Grade</span><span></span>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 items-center">
              <input type="number" value={r.max_percent} onChange={e => updateRow(i, "max_percent", e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center" />
              <input type="number" value={r.min_percent} onChange={e => updateRow(i, "min_percent", e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center" />
              <input value={r.grade} onChange={e => updateRow(i, "grade", e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center" />
              <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 font-black">✕</button>
            </div>
          ))}
        </div>

        <button onClick={addRow} className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-500 font-black text-xs">
          + เพิ่มแถว
        </button>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">Cancel</button>
          <button onClick={() => onSave(rows)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white font-black text-sm">+ Update</button>
        </div>
      </div>
    </div>
  );
}

function StudentReportModal({
  row, assignments, sectionId, currentUserId, attendance, subjectTitle, subjectCode,
  academicYearLabel, classroomLabel, homeroomTeacherName, subjectTeacherName, readOnly, onClose, gradingMode = "numeric", onToast,
}: {
  row: ReturnType<typeof buildRowsType>[number];
  assignments: Assignment[];
  sectionId: string;
  currentUserId?: string;
  attendance: { present: number; total: number };
  subjectTitle: string;
  subjectCode: string;
  academicYearLabel?: string;
  classroomLabel?: string;
  homeroomTeacherName?: string;
  subjectTeacherName?: string;
  readOnly?: boolean;
  onClose: () => void;
  gradingMode?: "numeric" | "pass_fail";
  onToast: (message: string, type?: "success" | "error" | "info") => void; // ★ toast แทน alert
}) {
  const s = row.student;

  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentSaved, setCommentSaved] = useState(false);
  const [loadingComment, setLoadingComment] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingComment(true);
    fetch(`/api/student-subject-comments?subject_section_id=${sectionId}&student_id=${s.id}`)
      .then(res => res.json())
      .then(json => { if (active) setComment(json.comment ?? ""); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingComment(false); });
    return () => { active = false; };
  }, [sectionId, s.id]);

  async function saveComment() {
    if (readOnly) return;
    setSavingComment(true);
    setCommentSaved(false);
    try {
      const res = await fetch("/api/student-subject-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_section_id: sectionId, student_id: s.id, comment, updated_by: currentUserId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกคอมเมนต์ไม่สำเร็จ");
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 2000);
    } catch (e: any) {
      onToast("บันทึกคอมเมนต์ไม่สำเร็จ: " + (e?.message ?? "unknown error"), "error"); // ★ toast แทน alert
    } finally {
      setSavingComment(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 print:bg-white" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 print:shadow-none print:max-h-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h3 className="font-black text-slate-800 text-lg">รายงานผลรายบุคคล</h3>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs">
              🖨️ พิมพ์ / บันทึก PDF
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
          </div>
        </div>

        <div className="text-center mb-5">
          {s.avatar_url ? (
            <img src={s.avatar_url} className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-fuchsia-100" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-400 text-white text-3xl font-black flex items-center justify-center mx-auto">
              {s.first_name[0]}
            </div>
          )}
          <p className="mt-3 font-black text-slate-800 text-lg">{s.prefix}{s.first_name} {s.last_name} ({s.nick_name})</p>
          <p className="text-slate-400 text-xs font-bold">เลขที่ {s.seat_number} · {classroomLabel ?? "-"}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <InfoBox label="ปีการศึกษา" value={academicYearLabel ?? "-"} />
          <InfoBox label="รายวิชา" value={`${subjectTitle} (${subjectCode})`} />
          <InfoBox label="ครูประจำชั้น" value={homeroomTeacherName ?? "-"} />
          <InfoBox label="ครูประจำวิชา" value={subjectTeacherName ?? "-"} />
        </div>

        <div className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white p-4 flex items-center justify-between mb-5">
  <div>
    <p className="text-[11px] font-bold opacity-90">คะแนนรวมทั้งหมด</p>
    <p className="text-2xl font-black">{row.grandTotal} คะแนน</p>
  </div>
  <div className="text-right">
    <p className="text-[11px] font-bold opacity-90">{gradingMode === "pass_fail" ? "สถานะ" : "เกรด"}</p>   {/* ★ */}
    <p className="text-2xl font-black">
      {gradingMode === "pass_fail" ? (row.passFailStatus ?? "-") : row.grade}   {/* ★ */}
    </p>
  </div>
</div>

        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">🗓️ การเข้าเรียน</p>
          <InfoBox
            label="จำนวนวันที่มาเรียน"
            value={attendance.total > 0 ? `${attendance.present} / ${attendance.total} วัน` : "ยังไม่มีข้อมูลการเช็คชื่อ"}
          />
        </div>

        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">📚 รายการชิ้นงาน</p>
          {assignments.length === 0 ? (
            <p className="text-slate-300 text-xs font-bold italic">ยังไม่มีงานที่มอบหมาย</p>
          ) : (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              {assignments.map((a, i) => {
  const sub = row.subMap[a.id];
  const info = getLateInfo(a, sub); // ★ เรียกตรง ๆ ได้เลย เพราะเป็น top-level function
  return (
    <div key={a.id} className={`flex items-center justify-between px-3 py-2 text-xs ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
      <span className="font-bold text-slate-600 truncate pr-2">{a.title}</span>
      <span className="font-black text-slate-700 whitespace-nowrap flex items-center gap-1.5">
        {sub?.score ?? (sub ? "รอตรวจ" : "ไม่ส่งงาน")} / {a.max_score}
        {info.hasData && info.isLate && (
          <span className="text-red-500">⏰{info.isManual ? "" : ` สาย ${info.daysLate}วัน`}</span>
        )}
      </span>
    </div>
  );
})}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-[11px] font-black text-slate-500">
            <span>ส่งงานแล้ว {row.submittedCount} / {assignments.length} ชิ้น · รวม {row.assignmentTotal} / {assignments.reduce((a, b) => a + (b.max_score ?? 0), 0)} คะแนน</span>
            <span>
  {row.onTimeRate === null
    ? "ไม่มีข้อมูลส่งตรงเวลา"
    : `⏱️ ตรงเวลา ${row.onTimeCount} / ส่งช้า ${row.lateCount} (${row.onTimeRate.toFixed(0)}%)${row.totalDaysLate > 0 ? ` · สายรวม ${row.totalDaysLate} วัน` : ""}`}
</span>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-black text-slate-600 mb-2">⭐ คะแนนพิเศษรวม</p>
          <InfoBox label="คะแนนพิเศษที่ได้ (บวก/ลบ)" value={`${row.specialTotal > 0 ? "+" : ""}${row.specialTotal} คะแนน`} />
        </div>

        <div>
          <p className="text-xs font-black text-slate-600 mb-2 flex items-center justify-between print:hidden">
            <span>💬 คอมเมนต์ครูประจำวิชา</span>
            {commentSaved && <span className="text-emerald-500 text-[10px] font-black">✓ บันทึกแล้ว</span>}
          </p>
          <p className="text-xs font-black text-slate-600 mb-2 hidden print:block">💬 คอมเมนต์ครูประจำวิชา</p>
          {loadingComment ? (
            <p className="text-slate-300 text-xs font-bold">กำลังโหลด...</p>
          ) : readOnly ? (
            <p className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 min-h-[3rem] print:border-none print:p-0 print:bg-transparent">
              {comment || "— ไม่มีคอมเมนต์ —"}
            </p>
          ) : (
            <>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="พิมพ์คอมเมนต์ถึงนักเรียน (ไม่บังคับ)..."
                rows={3}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold resize-none focus:border-fuchsia-300 focus:outline-none print:border-none print:p-0"
              />
              <button
                onClick={saveComment}
                disabled={savingComment}
                className="mt-2 w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-black text-xs disabled:opacity-50 print:hidden"
              >
                {savingComment ? "กำลังบันทึก..." : "💾 บันทึกคอมเมนต์"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-700 mt-0.5 truncate">{value}</p>
    </div>
  );
}