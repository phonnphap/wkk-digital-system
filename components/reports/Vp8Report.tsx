"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   วผ.8 — แบบส่งรายชื่อนักเรียนที่สอบไม่ผ่าน
   บันทึกได้ 3 รอบ (แยกกัน แต่ละรอบพิมพ์เป็นใบของตัวเอง):
     1) ประกาศผลสอบ   2) สอบซ่อมครั้งที่ 1   3) สอบซ่อมครั้งที่ 2
   ผลการเรียนที่ไม่ผ่าน: 0 / ร / มส
   เก็บข้อมูลในตาราง vp8_fail_records (ดูไฟล์ vp8_fail_records.sql)
   ========================================================================= */

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string; seat_number: number;
  student_code?: string; // เลขประจำตัว (ถ้ามี)
};

type RoundKey = "announce" | "retake1" | "retake2";
type FailResult = "0" | "ร" | "มส";
type RoundRecords = Record<string, FailResult>; // student_id -> ผล

const ROUNDS: { key: RoundKey; label: string; short: string }[] = [
  { key: "announce", label: "ประกาศผลสอบ", short: "ประกาศผลสอบ" },
  { key: "retake1", label: "สอบซ่อมครั้งที่ 1", short: "สอบซ่อมครั้งที่ 1" },
  { key: "retake2", label: "สอบซ่อมครั้งที่ 2", short: "สอบซ่อมครั้งที่ 2" },
];
const RESULTS: FailResult[] = ["0", "ร", "มส"];
const MIN_ROWS = 9;

const emptyRounds = (): Record<RoundKey, RoundRecords> => ({ announce: {}, retake1: {}, retake2: {} });

/* =========================================================================
   ตรวจรายชื่ออัตโนมัติ (รอบ "ประกาศผลสอบ")
   ลำดับความสำคัญ: มส → ร → 0
     มส : เวลาเรียนต่ำกว่า ATTEND_MIN_PERCENT
     ร  : ส่งงานไม่ครบ (ชิ้นงานที่ถึงกำหนดแล้ว/ไม่มีกำหนด แต่ยังไม่ส่ง)
     0  : ส่งครบ เวลาเรียนถึง แต่คะแนนรวมต่ำกว่า PASS_PERCENT
   สูตรคะแนนรวมเหมือนหน้า "คะแนนรวม" (GradeOverviewTool) ทุกประการ
   ========================================================================= */

const PASS_PERCENT = 50;
const ATTEND_MIN_PERCENT = 80;
// สถานะเช็คชื่อที่นับว่า "มาเรียน": มา + สาย + ไปกิจกรรม (leave = ลาป่วย/ลากิจ นับเป็นขาด)
// ต้องให้ตรงกับ Vp3Report / GradeOverviewTool / AttendanceOverviewTool ด้วย
const ATTENDED_STATUSES = ["present", "late", "excused"];

type GAssignment = {
  id: string; title: string; max_score: number;
  weight_percent?: number | null; allow_weight?: boolean; status?: string; due_date?: string | null;
};
type GSubmission = { assignment_id: string; student_id: string; score: number | null; submitted_at?: string | null };
type GExam = {
  student_id: string; exam_type: "midterm" | "final"; score: number | null;
  raw_score?: number | null; raw_max_score?: number | null;
};
type Flag = { studentId: string; result: FailResult; reason: string };
type AutoPreview = { flags: Flag[]; warnings: string[] };

function isWeightedA(a: GAssignment): boolean {
  return !!(a.allow_weight && a.weight_percent !== null && a.weight_percent !== undefined && (a.max_score ?? 0) > 0);
}
function contributionOf(a: GAssignment): number {
  return isWeightedA(a) ? (a.weight_percent as number) : (a.max_score ?? 0);
}
function weightedScoreOf(a: GAssignment, raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  return isWeightedA(a) ? (raw / (a.max_score || 1)) * (a.weight_percent as number) : raw;
}
function examWeighted(raw: number | null | undefined, rawMax: number | null | undefined, max: number): number {
  if (raw === null || raw === undefined) return 0;
  if (rawMax && rawMax > 0) return (raw / rawMax) * max;
  return raw;
}

// หาเกรดจากเปอร์เซ็นต์ตามเกณฑ์ของวิชา (เหมือน getGradeFromCriteria ใน Vp7Report)
function gradeFromCriteria(
  percentage: number,
  criteria: { max_percent: number; min_percent: number; grade: string }[]
): string {
  const sortedC = [...criteria].sort((a, b) => b.min_percent - a.min_percent);
  for (const c of sortedC) {
    if (percentage >= c.min_percent && percentage <= c.max_percent) return c.grade;
  }
  return "-";
}

function computeFailures(opts: {
  students: Student[];
  g: any;                // ผลจาก /api/subject-grades/summary
  att: any | null;       // ผลจาก /api/subject-attendance/summary
  midtermMax: number;
  finalMax: number;
  rounding: "up" | "round_up" | "truncate";
  showSpecialScores: boolean; // ตามการตั้งค่าของครูใน Smart Class
}): AutoPreview {
  const { students, g, att, midtermMax, finalMax, rounding, showSpecialScores } = opts;
  const assignments: GAssignment[] = ((g.assignments ?? []) as GAssignment[]).filter(a => a.status !== "draft");
  const submissions: GSubmission[] = g.submissions ?? [];
  const exams: GExam[] = g.examScores ?? [];
  const events = (g.scoreEvents ?? []) as { student_id: string; preset_id: string; points: number }[];
  const presetIds = new Set<string>((g.presets ?? []).map((p: { id: string }) => p.id));
  const criteria: { max_percent: number; min_percent: number; grade: string }[] = g.criteria ?? [];
  const rawMidMax: number | null = g.rawMidtermMaxScore ?? null;
  const rawFinMax: number | null = g.rawFinalMaxScore ?? null;

  const totalMax = assignments.reduce((s, a) => s + contributionOf(a), 0);
  const maxAll = totalMax + midtermMax + finalMax;
  const now = Date.now();

  const subMap = new Map<string, GSubmission>();
  submissions.forEach(s => subMap.set(`${s.assignment_id}|${s.student_id}`, s));

  const dates: string[] = att?.dates ?? [];
  const attended: Record<string, number> = {};
  ((att?.records ?? []) as { student_id: string; status: string }[]).forEach(r => {
    if (ATTENDED_STATUSES.includes(r.status)) attended[r.student_id] = (attended[r.student_id] ?? 0) + 1;
  });

  const flags: Flag[] = [];
  const undetermined: string[] = [];
  const nameOf = (s: Student) => `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim();

  students.forEach(s => {
    // 1) มส — เวลาเรียน
    if (dates.length > 0) {
      const present = attended[s.id] ?? 0;
      const rate = (present / dates.length) * 100;
      if (rate < ATTEND_MIN_PERCENT) {
        flags.push({ studentId: s.id, result: "มส", reason: `เวลาเรียน ${rate.toFixed(0)}% (${present}/${dates.length} วัน)` });
        return;
      }
    }

    // 2) ร — ส่งงานไม่ครบ
    const missing = assignments.filter(a => {
      if (a.due_date && now <= new Date(a.due_date).getTime()) return false; // ยังไม่ถึงกำหนด ไม่นับ
      const sub = subMap.get(`${a.id}|${s.id}`);
      return !(sub && (sub.submitted_at || (sub.score !== null && sub.score !== undefined)));
    });
    if (missing.length > 0) {
      const names = missing.slice(0, 3).map(a => a.title).join(", ");
      flags.push({
        studentId: s.id, result: "ร",
        reason: `ส่งงานไม่ครบ ${missing.length} ชิ้น: ${names}${missing.length > 3 ? " ..." : ""}`,
      });
      return;
    }

    // 3) 0 — คะแนนรวมต่ำกว่าเกณฑ์ (สูตรเดียวกับหน้าคะแนนรวม)
    const assignmentTotal = assignments.reduce((sum, a) => sum + weightedScoreOf(a, subMap.get(`${a.id}|${s.id}`)?.score), 0);
    const special = showSpecialScores
      ? events.filter(ev => ev.student_id === s.id && presetIds.has(ev.preset_id)).reduce((x, ev) => x + ev.points, 0)
      : 0;
    const mRow = exams.find(e => e.student_id === s.id && e.exam_type === "midterm");
    const fRow = exams.find(e => e.student_id === s.id && e.exam_type === "final");
    const mRaw = mRow?.raw_score ?? mRow?.score ?? null;
    const fRaw = fRow?.raw_score ?? fRow?.score ?? null;

    if ((finalMax > 0 && fRaw === null) || (midtermMax > 0 && mRaw === null)) {
      undetermined.push(nameOf(s)); // ยังไม่มีคะแนนสอบครบ ไม่ตัดสินว่าติด 0
      return;
    }

    const mScore = examWeighted(mRaw, mRow?.raw_max_score ?? rawMidMax, midtermMax);
    const fScore = examWeighted(fRaw, fRow?.raw_max_score ?? rawFinMax, finalMax);
    const raw2 = Math.round((assignmentTotal + mScore + special + fScore) * 100) / 100;
    const total = raw2 % 1 !== 0 ? (rounding === "truncate" ? Math.floor(raw2) : Math.ceil(raw2)) : raw2;
    const pct = maxAll > 0 ? (total / maxAll) * 100 : 0;
    // ติด 0 = เกรดตามเกณฑ์ของวิชาเป็น "0" (ถ้าวิชานั้นยังไม่ตั้งเกณฑ์ ใช้ต่ำกว่า PASS_PERCENT แทน)
    const grade = criteria.length > 0 ? gradeFromCriteria(pct, criteria) : "-";
    const failed = grade !== "-" ? grade === "0" : pct < PASS_PERCENT;
    if (failed) {
      flags.push({ studentId: s.id, result: "0", reason: `คะแนน ${fmt(total)}/${fmt(maxAll)} (${pct.toFixed(0)}%)${grade !== "-" ? ` เกรด ${grade}` : ""}` });
    }
  });

  const warnings: string[] = [];
  if (!att || dates.length === 0) warnings.push("ไม่มีข้อมูลเช็คชื่อ — ข้ามเงื่อนไข มส");
  if (assignments.length === 0) warnings.push("ยังไม่มีชิ้นงานที่มอบหมาย — ข้ามเงื่อนไข ร");
  if (undetermined.length > 0) {
    warnings.push(`${undetermined.length} คนยังไม่มีคะแนนสอบครบ จึงยังไม่ตัดสินติด 0: ${undetermined.slice(0, 5).join(", ")}${undetermined.length > 5 ? " ..." : ""}`);
  }
  return { flags, warnings };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ค่าเริ่มต้นภาคเรียน/ปีการศึกษา (ใช้เมื่อ props ไม่ได้ส่งมา) — ภาค 1: พ.ค.–ต.ค., ภาค 2: พ.ย.–เม.ย.
function defaultTerm() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const be = d.getFullYear() + 543;
  if (m >= 5 && m <= 10) return { semester: "1", year: String(be) };
  if (m >= 11) return { semester: "2", year: String(be) };
  return { semester: "2", year: String(be - 1) };
}

/* ===== ตั้งชื่อตาราง/คอลัมน์ที่นี่ที่เดียว (แก้ให้ตรงกับ Supabase จริง) ===== */
const DB = {
  sectionsTable: "subject_sections",   // ตารางที่ sectionId ชี้ไป
  sectionTeacherCol: "teacher_id",     // คอลัมน์ครูผู้สอนในตารางนั้น
  sectionCodeCol: "subject_code",      // คอลัมน์รหัสวิชา
  sectionRoomCol: "classroom_id",      // ใช้แยกห้อง (ถ้าไม่มีค่านี้จะข้ามเอง)
  usersTable: "users",
  deptTable: "departments",            // ตารางกลุ่มสาระ (อ้างด้วย users.department_id)
  headRole: "subject_dept_head",       // ค่าใน users.extra_roles ของ หน.กลุ่มสาระ
};

function userDisplayName(u: any): string {
  if (!u) return "";
  const full = u.full_name ?? u.name ?? u.display_name;
  if (full) return String(full).trim();
  return `${u.prefix ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
}

// extra_roles เป็น array หรือข้อความก็ใช้ได้
function hasRole(u: any, role: string): boolean {
  const r = u?.extra_roles;
  if (!r) return false;
  return Array.isArray(r) ? r.includes(role) : String(r).includes(role);
}

function dots(text: string | number | undefined | null, w = "min-w-[90px]") {
  return (
    <span className={`inline-block border-b border-dotted border-black px-1 text-center ${w}`}>
      {text || "\u00A0"}
    </span>
  );
}

export default function Vp8Report({
  sectionId, subjectCode, subjectTitle, classroomLabel, students, currentUserId, readOnly,
  subjectTeacherNameFallback, subjectTeacherNames, headOfAreaName, areaHeads,   // ← เพิ่ม 3 ตัว
  semester, academicYearLabel, learningArea,
  midtermMaxScore = 0, finalMaxScore = 30, gradeRoundingMode = "truncate", showSpecialScores = true,
  logoUrl = "/logo.png", schoolName = "โรงเรียนวัดเขียนเขต",
  principalName = "นายธนณัฐ  ศิระวงษ์", principalTitle = "ผู้อำนวยการโรงเรียนวัดเขียนเขต",
  onBack,
}: {
  sectionId: string;
  subjectCode: string;
  subjectTitle: string;
  classroomLabel?: string;
  students: Student[];
  currentUserId?: string;
  readOnly?: boolean;
  subjectTeacherNameFallback?: string;
  subjectTeacherNames?: string[];                 // รายชื่อครูผู้สอนทั้งหมดของวิชา/ห้องนี้ (1–2 คน)
  headOfAreaName?: string;                        // ชื่อ หน.กลุ่มสาระ (ถ้าส่งตรงมาจะใช้ค่านี้ก่อน)
  areaHeads?: Record<string, string>;             // map: ชื่อกลุ่มสาระ -> ชื่อ หน.กลุ่มสาระ
  semester?: number | string;
  academicYearLabel?: string;
  learningArea?: string;
  midtermMaxScore?: number;
  finalMaxScore?: number;
  showSpecialScores?: boolean;
  gradeRoundingMode?: "up" | "round_up" | "truncate"; // "up" = ที่ Vp7Report/Hub ใช้, "round_up" = ที่หน้าคะแนนรวมใช้
  logoUrl?: string;
  schoolName?: string;
  principalName?: string;
  principalTitle?: string;
  onBack: () => void;
}) {
  const [round, setRound] = useState<RoundKey>("announce");
  const [records, setRecords] = useState<Record<RoundKey, RoundRecords>>(emptyRounds());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const term = useMemo(defaultTerm, []);
const [semesterV, setSemesterV] = useState(String(semester ?? term.semester));
const [yearV, setYearV] = useState(academicYearLabel ?? term.year);
const [areaV, setAreaV] = useState(learningArea ?? "");
const [teacher1, setTeacher1] = useState("");
const [teacher2, setTeacher2] = useState("");
const [headName, setHeadName] = useState("");

// ซิงก์ค่าอัตโนมัติจาก props (ครูแก้เองต่อได้)
useEffect(() => { setSemesterV(String(semester ?? term.semester)); }, [semester, term]);
useEffect(() => { setYearV(academicYearLabel ?? term.year); }, [academicYearLabel, term]);
useEffect(() => { setAreaV(learningArea ?? ""); }, [learningArea]);

const teachersKey = (subjectTeacherNames ?? []).join("|");
useEffect(() => {
  const list = (subjectTeacherNames ?? []).map(n => n?.trim()).filter(Boolean) as string[];
  if (list.length === 0 && subjectTeacherNameFallback) list.push(subjectTeacherNameFallback);
  setTeacher1(list[0] ?? "");
  setTeacher2(list[1] ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [teachersKey, subjectTeacherNameFallback]);

useEffect(() => {
  const v = headOfAreaName ?? areaHeads?.[areaV];
  if (v) setHeadName(v);   // มีค่าจาก props เท่านั้นถึงจะตั้ง ไม่เช่นนั้นปล่อยให้ค่าจาก DB อยู่
}, [headOfAreaName, areaHeads, areaV]);

/* ----- ดึงครู 2 คน + กลุ่มสาระ + หน.กลุ่มสาระ จาก DB ----- */
useEffect(() => {
  let active = true;
  (async () => {
    try {
      // 1) section ปัจจุบัน → ครูคนที่ 1
      const { data: sec } = await supabase
        .from(DB.sectionsTable).select("*").eq("id", sectionId).maybeSingle();
      const t1Id: string | null = sec?.[DB.sectionTeacherCol] ?? null;

      // 2) section อื่นที่รหัสวิชาเดียวกัน (ห้องเดียวกัน) → ครูคนที่ 2
      let t2Id: string | null = null;
      if (sec) {
        let q = supabase.from(DB.sectionsTable).select("*")
          .eq(DB.sectionCodeCol, sec[DB.sectionCodeCol] ?? subjectCode)
          .neq("id", sectionId);
        if (sec[DB.sectionRoomCol] != null) q = q.eq(DB.sectionRoomCol, sec[DB.sectionRoomCol]);
        const { data: others } = await q;
        t2Id = (others ?? [])
          .map((o: any) => o[DB.sectionTeacherCol])
          .find((id: string | null) => id && id !== t1Id) ?? null;
      }

      // 3) ข้อมูลครูจากตาราง users
      const ids = [t1Id, t2Id].filter(Boolean) as string[];
      if (ids.length === 0) return;
      const { data: us } = await supabase.from(DB.usersTable).select("*").in("id", ids);
      const u1 = us?.find((u: any) => u.id === t1Id);
      const u2 = us?.find((u: any) => u.id === t2Id);

      // 4) กลุ่มสาระ = department_id ของครู
      const deptId = u1?.department_id ?? u2?.department_id ?? null;
      let deptName = "";
      let head = "";
      if (deptId) {
        const { data: d } = await supabase.from(DB.deptTable).select("*").eq("id", deptId).maybeSingle();
        deptName = d?.name ?? d?.name_th ?? d?.title ?? "";

        // 5) หน.กลุ่มสาระ = คนในกลุ่มสาระเดียวกันที่ extra_roles มี subject_dept_head
        const { data: mates } = await supabase.from(DB.usersTable).select("*").eq("department_id", deptId);
        head = userDisplayName((mates ?? []).find((m: any) => hasRole(m, DB.headRole)));
      }

      if (!active) return;
      if (u1) setTeacher1(userDisplayName(u1));
      if (u2) setTeacher2(userDisplayName(u2));
      if (deptName) setAreaV(deptName);
      if (head) setHeadName(head);
    } catch {
      /* ดึงไม่ได้ก็ใช้ค่าจาก props / กรอกเอง */
    }
  })();
  return () => { active = false; };
}, [sectionId, subjectCode]);

const teacherNames = [teacher1, teacher2].map(t => t.trim()).filter(Boolean);
  const [logoOk, setLogoOk] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [preview, setPreview] = useState<AutoPreview | null>(null);
  const [autoInfo, setAutoInfo] = useState<Record<string, string>>({}); // student_id -> เหตุผลที่ระบบตรวจพบ

  const sorted = useMemo(() => [...students].sort((a, b) => a.seat_number - b.seat_number), [students]);
    /* ----- ดึงเลขประจำตัวนักเรียน (ถ้า props ไม่มี student_code) ----- */
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});
  const idsKey = students.filter(s => !s.student_code).map(s => s.id).join(",");

  useEffect(() => {
    if (!idsKey) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("students")          // ← ถ้าตารางนักเรียนชื่ออื่น แก้ตรงนี้
        .select("*")
        .in("id", idsKey.split(","));
      if (!active || error || !data) return;
      const map: Record<string, string> = {};
      data.forEach((r: any) => {
        const code = r.student_code ?? r.student_number ?? r.student_no ?? r.student_id_number ?? r.code;
        if (code) map[r.id] = String(code);
      });
      setCodeMap(map);
    })();
    return () => { active = false; };
  }, [idsKey]);

  /* ----- โหลดข้อมูลทั้ง 3 รอบ ----- */
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from("vp8_fail_records")
        .select("round, student_id, result")
        .eq("subject_section_id", sectionId);
      if (!active) return;
      if (error) {
        setLoadError(error.message);
        setRecords(emptyRounds());
      } else {
        const next = emptyRounds();
        (data ?? []).forEach((r: any) => {
          if (next[r.round as RoundKey]) next[r.round as RoundKey][r.student_id] = r.result as FailResult;
        });
        setRecords(next);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [sectionId]);

  const current = records[round];

  function setStudentResult(studentId: string, result: FailResult | null) {
    setRecords(prev => {
      const next = { ...prev[round] };
      if (result === null) delete next[studentId];
      else next[studentId] = result;
      return { ...prev, [round]: next };
    });
  }

  function copyFromPrevious() {
    const idx = ROUNDS.findIndex(r => r.key === round);
    if (idx <= 0) return;
    const prevKey = ROUNDS[idx - 1].key;
    if (Object.keys(current).length > 0 &&
      !confirm(`แทนที่รายชื่อ "${ROUNDS[idx].label}" ด้วยรายชื่อจาก "${ROUNDS[idx - 1].label}"?`)) return;
    setRecords(prev => ({ ...prev, [round]: { ...prev[prevKey] } }));
  }

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    try {
      const del = await supabase.from("vp8_fail_records").delete()
        .eq("subject_section_id", sectionId).eq("round", round);
      if (del.error) throw del.error;
      const rows = Object.entries(current).map(([student_id, result]) => ({
        subject_section_id: sectionId,
        round,
        student_id,
        result,
        updated_by: currentUserId ?? null,
      }));
      if (rows.length > 0) {
        const ins = await supabase.from("vp8_fail_records").insert(rows);
        if (ins.error) throw ins.error;
      }
      setSavedAt(Date.now());
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  }

  /* ----- ตรวจรายชื่ออัตโนมัติ ----- */
  async function runAutoDetect() {
    setDetecting(true);
    try {
      const [gRes, aRes] = await Promise.all([
        fetch(`/api/subject-grades/summary?subject_section_id=${sectionId}`),
        fetch(`/api/subject-attendance/summary?subject_section_id=${sectionId}`),
      ]);
      const g = await gRes.json();
      if (!gRes.ok) throw new Error(g.error ?? "โหลดคะแนนไม่สำเร็จ");
      let att: any = null;
      try { if (aRes.ok) att = await aRes.json(); } catch { att = null; }
      setPreview(computeFailures({
        students: sorted, g, att,
        midtermMax: midtermMaxScore, finalMax: finalMaxScore, rounding: gradeRoundingMode, showSpecialScores,
      }));
    } catch (e: any) {
      alert("ตรวจรายชื่อไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setDetecting(false);
    }
  }

  function applyPreview() {
    if (!preview) return;
    if (Object.keys(current).length > 0 &&
      !confirm("แทนที่รายชื่อรอบ \"ประกาศผลสอบ\" ที่ติ๊กไว้ ด้วยผลตรวจอัตโนมัติ?")) return;
    const map: RoundRecords = {};
    const info: Record<string, string> = {};
    preview.flags.forEach(f => { map[f.studentId] = f.result; info[f.studentId] = f.reason; });
    setRecords(prev => ({ ...prev, announce: map }));
    setAutoInfo(info);
    setPreview(null);
  }

  /* ----- แถวในใบ วผ.8 ----- */
  const failRows = sorted.filter(s => current[s.id]);
  const blanks = Math.max(0, MIN_ROWS - failRows.length);
  const roomLabel = classroomLabel ?? "";

  const roundCount = (k: RoundKey) => Object.keys(records[k]).length;

  return (
    <div className="space-y-4">
      {/* ===== แถบควบคุม (ไม่พิมพ์) ===== */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <button onClick={onBack} className="text-m font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          <h2 className="font-black text-slate-800 text-xl">วผ.8 แบบส่งรายชื่อนักเรียนที่สอบไม่ผ่าน</h2>
          <p className="text-slate-400 text-m font-bold">{subjectCode} · {subjectTitle}{roomLabel ? ` · ${roomLabel}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-base">
            🖨️ พิมพ์รอบนี้
          </button>
          {!readOnly && (
            <button onClick={handleSave} disabled={saving || !!loadError}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-base">
              {saving ? "กำลังบันทึก..." : "💾 บันทึกรอบนี้"}
            </button>
          )}
        </div>
      </div>

      {savedAt && !saving && <p className="text-m font-black text-emerald-500 print:hidden">✅ บันทึก "{ROUNDS.find(r => r.key === round)?.label}" แล้ว</p>}

      {loadError && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-m font-bold text-rose-600 print:hidden">
          ⚠️ โหลดข้อมูลไม่ได้: {loadError}<br />
          (ถ้าเป็นครั้งแรก ให้รันไฟล์ <code>vp8_fail_records.sql</code> ใน Supabase เพื่อสร้างตารางก่อน)
        </div>
      )}

      {/* ===== เลือกรอบ ===== */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 w-fit print:hidden">
        {ROUNDS.map(r => (
          <button key={r.key} onClick={() => setRound(r.key)}
            className={`px-3 py-2 rounded-lg text-m font-black transition-colors ${
              round === r.key ? "bg-fuchsia-500 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}>
            {r.label} <span className="opacity-70">({roundCount(r.key)})</span>
          </button>
        ))}
      </div>

      {/* ===== แผงเลือกนักเรียน (ไม่พิมพ์) ===== */}
      {loading ? (
        <div className="text-center py-10 text-slate-300 font-bold print:hidden">กำลังโหลด...</div>
      ) : (
        !readOnly && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 print:hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="font-black text-slate-600 text-m">
                ติ๊กนักเรียนที่ไม่ผ่านในรอบ "{ROUNDS.find(r => r.key === round)?.label}" แล้วเลือกผล (0 / ร / มส)
              </p>
              <div className="flex items-center gap-2">
                {round === "announce" && (
                  <button onClick={runAutoDetect} disabled={detecting}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-[14px] disabled:opacity-50">
                    {detecting ? "⏳ กำลังตรวจ..." : "⚡ ตรวจรายชื่ออัตโนมัติ (มส / ร / 0)"}
                  </button>
                )}
                {round !== "announce" && (
                  <button onClick={copyFromPrevious}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-[14px]">
                    📋 ดึงรายชื่อจากรอบก่อนหน้า
                  </button>
                )}
                {Object.keys(current).length > 0 && (
                  <button onClick={() => setRecords(p => ({ ...p, [round]: {} }))}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[14px]">
                    ล้างรอบนี้
                  </button>
                )}
              </div>
              </div>
              <div className="grid gap-2 mb-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
  {[
    ["ภาคเรียนที่", semesterV, setSemesterV],
    ["ปีการศึกษา", yearV, setYearV],
    ["กลุ่มสาระฯ", areaV, setAreaV],
    ["ครูผู้สอนคนที่ 1", teacher1, setTeacher1],
    ["ครูผู้สอนคนที่ 2 (ถ้ามี)", teacher2, setTeacher2],
    ["หัวหน้ากลุ่มสาระฯ", headName, setHeadName],
  ].map(([label, val, set]: any) => (
    <label key={label} className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
      {label}
      <input value={val} onChange={e => set(e.target.value)}
        className="border-2 border-slate-200 rounded-lg px-2 py-1 font-bold" />
    </label>
  ))}
</div>
            
            

            {preview && (
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-3 mb-3">
                <p className="font-black text-indigo-700 text-m mb-2">
                  ผลตรวจอัตโนมัติ: ไม่ผ่าน {preview.flags.length} คน
                  (มส {preview.flags.filter(f => f.result === "มส").length} ·
                  ร {preview.flags.filter(f => f.result === "ร").length} ·
                  0 {preview.flags.filter(f => f.result === "0").length})
                </p>
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-[14px] font-bold text-amber-600 mb-1">⚠️ {w}</p>
                ))}
                {preview.flags.length > 0 && (
                  <div className="max-h-40 overflow-y-auto divide-y divide-indigo-100 bg-white rounded-lg border border-indigo-100 my-2">
                    {preview.flags.map(f => {
                      const st = sorted.find(x => x.id === f.studentId);
                      return (
                        <div key={f.studentId} className="flex items-center gap-2 px-2 py-1 text-[14px]">
                          <span className="font-black text-slate-500 w-8 text-center">{st?.seat_number}</span>
                          <span className="font-bold text-slate-700 flex-1 truncate">
                            {st ? `${st.prefix ?? ""}${st.first_name} ${st.last_name}` : f.studentId}
                          </span>
                          <span className="font-bold text-slate-400 truncate max-w-[45%]" title={f.reason}>{f.reason}</span>
                          <span className="font-black text-rose-600 w-8 text-center">{f.result}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={applyPreview} disabled={preview.flags.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-black text-[14px] disabled:opacity-50">
                    ✅ ใช้รายชื่อนี้ ({preview.flags.length} คน)
                  </button>
                  <button onClick={() => setPreview(null)}
                    className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-500 font-black text-[14px]">
                    ยกเลิก
                  </button>
                </div>
                <p className="text-[12px] font-bold text-slate-400 mt-2">
                  ใช้แล้วยังติ๊กเพิ่ม/ถอด หรือเปลี่ยนผล (0/ร/มส) ด้านล่างได้ก่อนกดบันทึก
                </p>
              </div>
            )}

            <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] max-h-[340px] overflow-y-auto">
              {sorted.map(s => {
                const val = current[s.id];
                return (
                  <div key={s.id}
                    className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1 ${
                      val ? "border-rose-300 bg-rose-50/50" : "border-slate-100"
                    }`}>
                    <input type="checkbox" checked={!!val} className="accent-rose-500"
                      onChange={e => setStudentResult(s.id, e.target.checked ? "0" : null)} />
                    <span className="text-m font-bold text-slate-600 flex-1 truncate">
                      {s.seat_number}. {s.prefix ?? ""}{s.first_name} {s.last_name}
                      {val && round === "announce" && autoInfo[s.id] && (
                        <span className="block text-[12px] font-bold text-rose-500 truncate">{autoInfo[s.id]}</span>
                      )}
                    </span>
                    {val && (
                      <select value={val} onChange={e => setStudentResult(s.id, e.target.value as FailResult)}
                        className="border-2 border-slate-200 rounded-md px-1 py-0.5 font-black text-m">
                        {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ===== ใบ วผ.8 (พิมพ์) ===== */}
      <div className="vp8-print-area bg-white rounded-2xl border border-slate-100 p-8 print:border-0 print:p-0 print:rounded-none">
        <div className="relative">
          {/* กล่องเลือกรอบ มุมขวาบน */}
          <div className="absolute right-0 top-0 border-2 border-purple-700 px-3 py-1.5 text-[15px] font-bold leading-snug">
            <p className="text-center font-black">แบบวัดผล 8</p>
            {ROUNDS.map(r => (
              <p key={r.key} className="whitespace-nowrap">
                <span className="inline-block w-5 text-center">{round === r.key ? "☑" : "☐"}</span>{r.short}
              </p>
            ))}
          </div>

          {/* ตราโรงเรียน + หัวเรื่อง */}
          <div className="text-center">
            {logoOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" onError={() => setLogoOk(false)} className="h-16 mx-auto mb-1 object-contain" />
            ) : (
              <div className="h-16" />
            )}
            <p className="font-black text-[19px]">{schoolName}</p>
            <p className="text-[18px] font-bold mt-1">
  แบบส่งรายชื่อนักเรียนที่สอบไม่ผ่าน &nbsp; ภาคเรียนที่ {dots(semesterV, "min-w-[70px]")}
  &nbsp; ปีการศึกษา {dots(yearV, "min-w-[110px]")}
</p>
<p className="text-[18px] font-bold mt-1">
  รหัสวิชา {dots(subjectCode, "min-w-[70px]")} ชื่อวิชา {dots(subjectTitle, "min-w-[150px]")}
  กลุ่มสาระการเรียนรู้ {dots(areaV, "min-w-[180px]")}
</p>
<p className="text-[18px] font-bold mt-1">
  ชื่อครูผู้สอน {dots(teacherNames.join(" , "), "min-w-[240px]")}
</p>
          </div>
        </div>

        {/* ตาราง */}
        <table className="w-full border-collapse mt-3 text-[17px] vp8-table">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-400 px-2 py-1.5 font-black w-10">ที่</th>
              <th className="border border-slate-400 px-2 py-1.5 font-black w-14">เลขที่</th>
              <th className="border border-slate-400 px-2 py-1.5 font-black w-28">เลขประจำตัว</th>
              <th className="border border-slate-400 px-2 py-1.5 font-black">ชื่อ-นามสกุล</th>
              <th className="border border-slate-400 px-2 py-1.5 font-black w-28">ชั้น/ห้อง</th>
              <th className="border border-slate-400 px-2 py-1.5 font-black w-48">ผลการเรียนที่ไม่ผ่าน (0 / ร / มส)</th>
            </tr>
          </thead>
          <tbody>
            {failRows.map((s, i) => (
              <tr key={s.id}>
                <td className="border border-slate-400 text-center py-1.5 font-bold">{i + 1}</td>
                <td className="border border-slate-400 text-center py-1.5 font-bold">{s.seat_number}</td>
                <td className="border border-slate-400 text-center py-1.5 font-bold">{s.student_code || codeMap[s.id] || ""}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-bold">{s.prefix ?? ""}{s.first_name} {s.last_name}</td>
                <td className="border border-slate-400 text-center py-1.5 font-bold">{roomLabel}</td>
                <td className="border border-slate-400 text-center py-1.5 font-black">{current[s.id]}</td>
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`b${i}`}>
                {Array.from({ length: 6 }).map((__, c) => (
                  <td key={c} className="border border-slate-400 py-1.5">&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[17px] font-black">
          หมายเหตุ &nbsp; ถ้ามีนักเรียนติด 0, ร, มส ให้รายงาน แบบวัดผล 8 มาพร้อม แบบวัดผล 7 ทุกกรณี
        </p>

        {/* ลายเซ็น */}
<div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 text-[18px] font-bold vp8-avoid">
  {/* แถว 1: ครูคนที่ 1 | หน.กลุ่มสาระฯ */}
  <div>
    <p>ลงชื่อ{dots("", "min-w-[160px]")}ครูประจำวิชา</p>
    <p className="pl-10">({dots(teacher1, "min-w-[170px]")})</p>
  </div>
  <div>
    <p>ลงชื่อ{dots("", "min-w-[160px]")}หัวหน้ากลุ่มสาระฯ</p>
    <p className="pl-10">({dots(headName, "min-w-[170px]")})</p>
  </div>

  {/* แถว 2: ครูคนที่ 2 (แยกอยู่ด้านล่าง ไม่รวมกับคนแรก) */}
  {teacher2.trim() && (
    <div>
      <p>ลงชื่อ{dots("", "min-w-[160px]")}ครูประจำวิชา</p>
      <p className="pl-10">({dots(teacher2, "min-w-[170px]")})</p>
    </div>
  )}
</div>

{/* ผอ. อยู่กึ่งกลางหน้า */}
<div className="mt-8 text-[18px] font-bold vp8-avoid flex flex-col items-center text-center">
  <p>ลงชื่อ{dots("", "min-w-[200px]")}</p>
  <p>({principalName})</p>
  <p>{principalTitle}</p>
</div>
</div>
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          .vp8-print-area, .vp8-print-area * { visibility: visible; }
          .vp8-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .vp8-table th, .vp8-table td { border: 1px solid #000 !important; color: #000 !important; background: #fff !important; }
          .vp8-table tr { break-inside: avoid; }
          .vp8-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}