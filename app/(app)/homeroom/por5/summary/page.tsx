"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InsightsTool from "@/components/insights/InsightsTool";
import Vp4Report from "@/components/insights/Vp4Report";

const supabase = createClient();
const ADMIN_ROLES = ["admin", "executive", "director", "deputy_director"];

type Classroom = {
  classroom_id: string; room_name: string;
  year_name?: string; semester?: number; split?: boolean;
};
type Student = { id: string; prefix?: string; first_name: string; last_name: string; nick_name?: string; seat_number: number; avatar_url?: string; student_code?: string };
type SectionInfo = {
  id: string; subject_id: string; subject_code: string; subject_name: string;
  subject_type: "basic" | "additional";
  hours_per_year: number | null; credit_hours: number | null;
  score_group_code?: string | null; score_group_weight_percent?: number;
  gradingMode?: "numeric" | "pass_fail";
  formativeMaxScore?: number;
  midtermMaxScore?: number;
  finalMaxScore?: number; gradeRoundingMode?: "up" | "truncate";
};

type GradeCell = { grandTotal: number; percentage: number; grade: string; totalMax: number };
type AttendCell = { present: number; total: number };
type ViewTab = "grades" | "attendance" | "insights" | "vp4";
type DocKind = "final" | "midterm";

function isActivitySubject(subjectCode: string): boolean {
  return /^ก/.test(subjectCode ?? "");
}
function applyRounding(value: number, mode: "up" | "truncate" = "truncate"): number {
  return mode === "up" ? Math.ceil(value) : Math.floor(value);
}
function subjectRank(s: SectionInfo): number {
  if (isActivitySubject(s.subject_code)) return 2;
  return s.subject_type === "basic" ? 0 : 1;
}

// ห้อง ม.* หรือห้องที่แยกเทอมแล้ว = มี classroom คนละ id ต่อเทอม
function isSplitRoom(c: Classroom) {
  return c.room_name.trim().startsWith("ม") || !!c.split;
}
function detectLevel(roomName: string): "primary" | "secondary" {
  return roomName.startsWith("ม") || /^[4-6]\//.test(roomName) ? "secondary" : "primary";
}

const COLUMN_COLORS = [
  { header: "bg-pink-300/80 text-pink-900", code: "text-pink-900/50", cell: "bg-pink-50/70" },
  { header: "bg-pink-100/80 text-pink-800", code: "text-pink-800/50", cell: "bg-pink-50/20" },
];

type FlatColumn =
  | { key: string; kind: "single"; label: string; code: string; section: SectionInfo; colorIndex: number }
  | { key: string; kind: "groupMember"; label: string; code: string; section: SectionInfo; colorIndex: number; groupCode: string }
  | { key: string; kind: "groupCombined"; label: string; colorIndex: number; groupCode: string; members: SectionInfo[] };

type AdvisorInfo = { prefix?: string; first_name: string; last_name: string };
const EMPTY_ADVISORS: AdvisorInfo[] = [{ first_name: "", last_name: "" }, { first_name: "", last_name: "" }];

export default function Por5SummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [tab, setTab] = useState<ViewTab>("grades");
  const [loadingData, setLoadingData] = useState(false);
  const [gradeMatrix, setGradeMatrix] = useState<Record<string, Record<string, GradeCell>>>({});
  const [attendMatrix, setAttendMatrix] = useState<Record<string, Record<string, AttendCell>>>({});
  const [exporting, setExporting] = useState(false);
  const [advisors, setAdvisors] = useState<AdvisorInfo[]>(EMPTY_ADVISORS);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});

  // ★ ใหม่: เทอม / ชนิดใบ / snapshot
  const [semester, setSemester] = useState<1 | 2>(1);
  const [docKind, setDocKind] = useState<DocKind>("final");
  const [snapshotInfo, setSnapshotInfo] = useState<{ lockedAt: string } | null>(null);
  const [locking, setLocking] = useState(false);
  const [notInTimetable, setNotInTimetable] = useState<string[]>([]);
  const [gradeHeadName, setGradeHeadName] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [yearName, setYearName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const level = selectedClassroom ? detectLevel(selectedClassroom.room_name) : "primary";
  // ประถมมีแต่ใบเกรด; มัธยมเลือก ใบเกรด/แบบวัดผล 4 (มิดเทอม) ได้
  const kind: DocKind = level === "secondary" ? docKind : "final";
  const lockable =
    !!selectedClassroom &&
    ((level === "primary" && semester === 1) || (level === "secondary" && kind === "midterm"));

  const gradeColumns = useMemo<FlatColumn[]>(() => {
    const seenGroups = new Set<string>();
    const cols: FlatColumn[] = [];
    let colorIndex = 0;
    sections.forEach(sec => {
      if (sec.score_group_code) {
        if (seenGroups.has(sec.score_group_code)) return;
        seenGroups.add(sec.score_group_code);
        const members = sections.filter(s => s.score_group_code === sec.score_group_code);
        const idx = colorIndex++;
        members.forEach(m => {
          cols.push({ key: `${m.id}-member`, kind: "groupMember", label: m.subject_name, code: m.subject_code, section: m, colorIndex: idx, groupCode: sec.score_group_code! });
        });
        const groupLabel = groupNames[sec.score_group_code] || members.map(m => m.subject_name).join("/");
        cols.push({ key: `group-${sec.score_group_code}-combined`, kind: "groupCombined", label: groupLabel, colorIndex: idx, groupCode: sec.score_group_code!, members });
      } else {
        const idx = colorIndex++;
        cols.push({ key: sec.id, kind: "single", label: sec.subject_name, code: sec.subject_code, section: sec, colorIndex: idx });
      }
    });
    return cols;
  }, [sections, groupNames]);

  const attendanceColumns = useMemo<FlatColumn[]>(() => {
    return sections.map((sec, i) => ({
      key: sec.id, kind: "single" as const, label: sec.subject_name, code: sec.subject_code, section: sec, colorIndex: i,
    }));
  }, [sections]);

  const activeColumns = tab === "attendance" ? attendanceColumns : gradeColumns;

  function groupCombinedCell(studentId: string, members: SectionInfo[]) {
    const cells = members.map(m => gradeMatrix[studentId]?.[m.id]);
    if (cells.some(c => !c)) return null;
    const totalWeight = members.reduce((s, m) => s + (m.score_group_weight_percent ?? 0), 0) || 100;
    const combined = members.reduce((sum, m, i) => {
      const w = (m.score_group_weight_percent ?? 0) / totalWeight;
      return sum + w * (cells[i]!.grandTotal);
    }, 0);
    const roundingMode = members[0]?.gradeRoundingMode ?? "truncate";
    return { parts: cells.map(c => c!.grandTotal), combined: applyRounding(combined, roundingMode) };
  }

  // ── โหลดห้อง + ปี/เทอมของแต่ละห้อง ──
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let admin = false;
      if (authUser) {
        const { data: profile } = await supabase.from("users").select("id, role").eq("auth_id", authUser.id).maybeSingle();
        if (profile) {
          setCurrentUserId(profile.id);
          admin = !!profile.role && ADMIN_ROLES.includes(profile.role);
        }
      }
      setIsAdmin(admin);

      // แอดมิน/ผู้บริหาร: เห็นทุกห้อง · ครู: เห็นเฉพาะห้องของตัวเอง
      let base: { classroom_id: string; room_name: string }[];
      if (admin) {
        const { data: all } = await supabase.from("classrooms").select("id, room_name");
        base = (all ?? []).map((r: any) => ({ classroom_id: r.id, room_name: r.room_name ?? "" }));
      } else {
        const { data } = await supabase.rpc("get_my_classrooms");
        base = (data ?? []) as { classroom_id: string; room_name: string }[];
      }
      const ids = base.map(r => r.classroom_id);

      const [{ data: roomRows }, { data: yearRows }] = await Promise.all([
        supabase.from("classrooms").select("id, academic_year_id, split_by_semester").in("id", ids.length ? ids : ["_none_"]),
        supabase.from("academic_years").select("id, year_name, semester, is_current"),
      ]);
      const yearById = new Map<string, any>((yearRows ?? []).map((y: any) => [y.id, y]));
      const roomById = new Map<string, any>((roomRows ?? []).map((r: any) => [r.id, r]));

      const rows: Classroom[] = base.map(r => {
        const room = roomById.get(r.classroom_id);
        const yr = room ? yearById.get(room.academic_year_id) : null;
        return { ...r, year_name: yr?.year_name, semester: yr?.semester ?? 1, split: !!room?.split_by_semester };
      });
      setClassrooms(rows);

      const cur: any = (yearRows ?? []).find((y: any) => y.is_current);
      const initSem = ((cur?.semester ?? 1) === 2 ? 2 : 1) as 1 | 2;
      setSemester(initSem);
      const initYear: string = cur?.year_name ?? "";
      setYearName(initYear);

      const visible = rows.filter(c =>
        (!initYear || !c.year_name || c.year_name === initYear) &&
        (!isSplitRoom(c) || c.semester === initSem));
      if (visible.length === 1) setSelectedClassroom(visible[0]);
      setLoading(false);
    })();
  }, []);

  const visibleClassrooms = classrooms
    .filter(c => (!yearName || !c.year_name || c.year_name === yearName) && (!isSplitRoom(c) || c.semester === semester))
    .sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true }));
  const yearOptions = Array.from(new Set(classrooms.map(c => c.year_name).filter(Boolean))) as string[];
  const levelGroups = [
    { key: "kindergarten", label: "อนุบาล", test: (n: string) => n.startsWith("อ") },
    { key: "primary", label: "ประถมศึกษา", test: (n: string) => n.startsWith("ป") },
    { key: "secondary", label: "มัธยมศึกษา", test: (n: string) => n.startsWith("ม") },
  ];

  function changeSemester(next: 1 | 2) {
    if (next === semester) return;
    if (selectedClassroom && isSplitRoom(selectedClassroom)) {
      const sibling = classrooms.find(c =>
        c.room_name.trim() === selectedClassroom.room_name.trim() &&
        c.year_name === selectedClassroom.year_name && c.semester === next);
      if (!sibling) {
        alert(`ไม่พบห้อง ${selectedClassroom.room_name} ของเทอม ${next} (ต้องมีห้องเทอมนั้นในระบบ/หน้าตารางสอนก่อน)`);
        return;
      }
      setSelectedClassroom(sibling);
    }
    setSemester(next);
  }

  // ── โหลดข้อมูลหลัก (snapshot ก่อน ถ้าไม่มีค่อยดึงสด) ──
  useEffect(() => {
    if (!selectedClassroom) return;
    let cancelled = false;
    const room = selectedClassroom;

    (async () => {
      setLoadingData(true);
      setSnapshotInfo(null);
      setNotInTimetable([]);

      // A) มี snapshot ที่บันทึกไว้ → ใช้ข้อมูลนั้น
      if (room.year_name) {
        const { data: snap } = await supabase
          .from("grade_report_snapshots")
          .select("payload, locked_at")
          .eq("classroom_id", room.classroom_id)
          .eq("year_name", room.year_name)
          .eq("semester", semester)
          .eq("doc_kind", kind)
          .maybeSingle();
        if (cancelled) return;
        if (snap) {
          const p: any = snap.payload;
          setStudents(p.students ?? []);
          setSections(p.sections ?? []);
          setGroupNames(p.groupNames ?? {});
          setGradeMatrix(p.gradeMatrix ?? {});
          setAttendMatrix(p.attendMatrix ?? {});
          if (p.advisors) setAdvisors(p.advisors);
          if (p.gradeHeadName != null) setGradeHeadName(p.gradeHeadName);
          setSnapshotInfo({ lockedAt: snap.locked_at });
          setLoadingData(false);
          return;
        }
      }

      // B) ดึงสด
      const { data: studentsData } = await supabase
        .from("students")
        .select("id, prefix, first_name, last_name, nick_name, seat_number, avatar_url, student_code")
        .eq("classroom_id", room.classroom_id)
        .order("seat_number");
      const studentRows = (studentsData ?? []) as Student[];
      if (cancelled) return;
      setStudents(studentRows);

      // ครูที่ปรึกษา (ตาราง users ใช้คอลัมน์ title ไม่ใช่ prefix)
      const { data: classroomRow } = await supabase
        .from("classrooms")
        .select("homeroom_teacher_id, homeroom_teacher_2_id")
        .eq("id", room.classroom_id)
        .maybeSingle();
      const teacherIds = [classroomRow?.homeroom_teacher_id, classroomRow?.homeroom_teacher_2_id].filter((v): v is string => !!v);
      if (teacherIds.length > 0) {
        const { data: teacherRows } = await supabase.from("users").select("id, title, first_name, last_name").in("id", teacherIds);
        const teacherMap: Record<string, AdvisorInfo> = {};
        (teacherRows ?? []).forEach((t: any) => {
          teacherMap[t.id] = { prefix: t.title ?? "", first_name: t.first_name ?? "", last_name: t.last_name ?? "" };
        });
        setAdvisors([
          (classroomRow?.homeroom_teacher_id && teacherMap[classroomRow.homeroom_teacher_id]) || { first_name: "", last_name: "" },
          (classroomRow?.homeroom_teacher_2_id && teacherMap[classroomRow.homeroom_teacher_2_id]) || { first_name: "", last_name: "" },
        ]);
      } else {
        setAdvisors(EMPTY_ADVISORS);
      }

      const { data: sectionRows } = await supabase
        .from("subject_sections")
        .select("id, subject_id, is_active, formative_max_score, midterm_max_score, final_max_score, subjects(subject_code, name_th, subject_type, hours_per_year, credit_hours, score_group_code, score_group_weight_percent, grading_mode, grade_rounding_mode)")
        .eq("classroom_id", room.classroom_id)
        .eq("is_active", true);

      let secs: SectionInfo[] = (sectionRows ?? []).map((r: any) => {
        const subjectCode = r.subjects?.subject_code ?? "";
        const isActivity = isActivitySubject(subjectCode);
        return {
          id: r.id,
          subject_id: r.subject_id,
          subject_code: subjectCode,
          subject_name: r.subjects?.name_th ?? "ไม่ทราบชื่อวิชา",
          subject_type: r.subjects?.subject_type ?? "basic",
          hours_per_year: r.subjects?.hours_per_year ?? null,
          credit_hours: r.subjects?.credit_hours ?? null,
          score_group_code: isActivity ? null : (r.subjects?.score_group_code ?? null),
          score_group_weight_percent: r.subjects?.score_group_weight_percent ?? 100,
          gradingMode: r.subjects?.grading_mode ?? "numeric",
          formativeMaxScore: r.formative_max_score ?? 70,
          midtermMaxScore: r.midterm_max_score ?? 0,
          finalMaxScore: r.final_max_score ?? 30,
          gradeRoundingMode: r.subjects?.grade_rounding_mode ?? "truncate",
        };
      }).sort((a: SectionInfo, b: SectionInfo) => {
        const ra = subjectRank(a), rb = subjectRank(b);
        if (ra !== rb) return ra - rb;
        return a.subject_name.localeCompare(b.subject_name, "th");
      });

      // มัธยม/ห้องแยกเทอม: อ้างอิงตารางสอนของห้อง+เทอมนั้น (วิชากิจกรรมไม่ต้องอยู่ในตารางสอน)
      if (isSplitRoom(room)) {
        const { data: tt } = await supabase.from("timetable_entries").select("subject_id").eq("classroom_id", room.classroom_id);
        const ttIds = new Set((tt ?? []).map((e: any) => e.subject_id));
        if (ttIds.size > 0) {
          const dropped = secs.filter(s => !ttIds.has(s.subject_id) && !isActivitySubject(s.subject_code));
          setNotInTimetable(dropped.map(s => `${s.subject_code} ${s.subject_name}`));
          secs = secs.filter(s => ttIds.has(s.subject_id) || isActivitySubject(s.subject_code));
        }
      }
      setSections(secs);

      const groupCodes = Array.from(new Set(secs.map(s => s.score_group_code).filter(Boolean))) as string[];
      if (groupCodes.length > 0) {
        const { data: groupRows } = await supabase.from("subject_score_groups").select("group_code, display_name").in("group_code", groupCodes);
        const map: Record<string, string> = {};
        (groupRows ?? []).forEach((g: any) => { map[g.group_code] = g.display_name; });
        setGroupNames(map);
      } else {
        setGroupNames({});
      }

      const gMatrix: Record<string, Record<string, GradeCell>> = {};
      const aMatrix: Record<string, Record<string, AttendCell>> = {};
      studentRows.forEach(s => { gMatrix[s.id] = {}; aMatrix[s.id] = {}; });

      await Promise.all(secs.map(async (sec) => {
        try {
          const res = await fetch(`/api/subject-grades/summary?subject_section_id=${sec.id}`);
          const json = await res.json();
          const assignments = json.assignments ?? [];
          const submissions = json.submissions ?? [];
          const scoreEvents = json.scoreEvents ?? [];
          const criteria = json.criteria ?? [];
          const examScores = json.examScores ?? [];
          const rawMidtermMax = json.rawMidtermMaxScore ?? null;
          const rawFinalMax = json.rawFinalMaxScore ?? null;

          const usesComponentGrading = sec.gradingMode !== "pass_fail";
          const formativeMaxScore = sec.formativeMaxScore ?? 70;
          const midtermMaxScore = sec.midtermMaxScore ?? 0;
          const finalMaxScore = sec.finalMaxScore ?? 30;
          const useMidterm = midtermMaxScore > 0;

          const isWeighted = (a: any) => !!(a.allow_weight && a.weight_percent != null && (a.max_score ?? 0) > 0);
          const getAssignmentMaxContribution = (a: any) => (isWeighted(a) ? a.weight_percent : (a.max_score ?? 0));
          const getAssignmentWeightedScore = (a: any, raw: number | null | undefined) => {
            if (raw == null) return 0;
            return isWeighted(a) ? (raw / (a.max_score || 1)) * a.weight_percent : raw;
          };
          const getExamWeightedScore = (raw: number | null | undefined, rawMax: number | null | undefined, max: number) => {
            if (raw == null) return 0;
            return rawMax && rawMax > 0 ? (raw / rawMax) * max : raw;
          };

          const totalMaxScore = assignments.reduce((sum: number, a: any) => sum + getAssignmentMaxContribution(a), 0);
          const sortedCriteria = [...criteria].sort((a: any, b: any) => b.min_percent - a.min_percent);

          studentRows.forEach(s => {
            const subMap: Record<string, any> = {};
            submissions.filter((x: any) => x.student_id === s.id).forEach((x: any) => { subMap[x.assignment_id] = x; });

            const weightedList = assignments.filter(isWeighted);
            const unweightedList = assignments.filter((a: any) => !isWeighted(a));
            const weightedMaxTotal = weightedList.reduce((s2: number, a: any) => s2 + (a.weight_percent ?? 0), 0);
            const weightedEarnedTotal = weightedList.reduce((s2: number, a: any) => s2 + getAssignmentWeightedScore(a, subMap[a.id]?.score), 0);
            const unweightedMaxTotal = unweightedList.reduce((s2: number, a: any) => s2 + (a.max_score ?? 0), 0);
            const unweightedEarnedTotal = unweightedList.reduce((s2: number, a: any) => s2 + (subMap[a.id]?.score ?? 0), 0);
            const assignmentTotal = weightedEarnedTotal + unweightedEarnedTotal;

            const midtermRow = examScores.find((e: any) => e.student_id === s.id && e.exam_type === "midterm");
            const finalRow = examScores.find((e: any) => e.student_id === s.id && e.exam_type === "final");
            const midtermRaw = midtermRow?.raw_score ?? midtermRow?.score ?? null;
            const finalRaw = finalRow?.raw_score ?? finalRow?.score ?? null;
            const midtermScore = getExamWeightedScore(midtermRaw, midtermRow?.raw_max_score ?? rawMidtermMax, midtermMaxScore);
            const finalScore = getExamWeightedScore(finalRaw, finalRow?.raw_max_score ?? rawFinalMax, finalMaxScore);

            const specialTotal = scoreEvents.filter((ev: any) => ev.student_id === s.id).reduce((s2: number, ev: any) => s2 + ev.points, 0);

            const remainingCapacity = Math.max(0, formativeMaxScore - weightedMaxTotal);
            const scaledUnweighted = unweightedMaxTotal > 0 ? (unweightedEarnedTotal / unweightedMaxTotal) * remainingCapacity : 0;
            const scaledFormative = weightedEarnedTotal + scaledUnweighted;

            const componentTotal = usesComponentGrading
              ? scaledFormative + (useMidterm ? (midtermScore ?? 0) : 0) + (finalScore ?? 0)
              : null;
            const rawPercentage = usesComponentGrading
              ? (componentTotal ?? 0)
              : (totalMaxScore > 0 ? (assignmentTotal / totalMaxScore) * 100 : 0);
            const percentage = applyRounding(rawPercentage, sec.gradeRoundingMode);
            let grade = "-";
            for (const c of sortedCriteria) {
              if (percentage >= c.min_percent && percentage <= c.max_percent) { grade = c.grade; break; }
            }

            const examMaxTotal = usesComponentGrading
              ? (useMidterm && midtermRaw !== null ? midtermMaxScore : 0) + (finalRaw !== null ? finalMaxScore : 0)
              : 0;
            const displayTotal = assignmentTotal + specialTotal + (useMidterm ? (midtermScore ?? 0) : 0) + (finalScore ?? 0);
            const displayMax = usesComponentGrading ? totalMaxScore + examMaxTotal : totalMaxScore;

            gMatrix[s.id][sec.id] = { grandTotal: applyRounding(displayTotal, sec.gradeRoundingMode), percentage, grade, totalMax: displayMax };
          });
        } catch { /* ข้ามวิชานี้ถ้าดึงไม่สำเร็จ */ }

        try {
          const res = await fetch(`/api/subject-attendance/summary?subject_section_id=${sec.id}`);
          const json = await res.json();
          const dates: string[] = json.dates ?? [];
          const records = json.records ?? [];
          studentRows.forEach(s => {
            const presentCount = records.filter((r: any) => r.student_id === s.id && (r.status === "present" || r.status === "late")).length;
            aMatrix[s.id][sec.id] = { present: presentCount, total: dates.length };
          });
        } catch { /* ข้ามวิชานี้ถ้าดึงไม่สำเร็จ */ }
      }));

      if (cancelled) return;
      setGradeMatrix(gMatrix);
      setAttendMatrix(aMatrix);
      setLoadingData(false);
    })();

    return () => { cancelled = true; };
  }, [selectedClassroom?.classroom_id, semester, kind, reloadKey]);

  // ── บันทึก/ปลดล็อก snapshot ──
  async function lockTerm() {
    if (!selectedClassroom?.year_name || loadingData || snapshotInfo) return;
    const msg = kind === "midterm"
      ? "บันทึกคะแนนมิดเทอม (แบบวัดผล 4) ณ ตอนนี้ใช่ไหม?\nหลังบันทึก ใบนี้จะไม่เปลี่ยนตามคะแนนที่กรอกเพิ่มภายหลัง"
      : "ล็อกคะแนนเทอม 1 ใช่ไหม?\nหลังล็อก ใบเกรดเทอม 1 จะไม่เปลี่ยนตามคะแนนที่กรอกใหม่ในเทอม 2";
    if (!window.confirm(msg)) return;
    setLocking(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("grade_report_snapshots").upsert({
      classroom_id: selectedClassroom.classroom_id,
      year_name: selectedClassroom.year_name,
      semester,
      doc_kind: kind,
      payload: { students, sections, groupNames, gradeMatrix, attendMatrix, advisors, gradeHeadName },
      locked_by: currentUserId || null,
      locked_at: nowIso,
    }, { onConflict: "classroom_id,year_name,semester,doc_kind" });
    setLocking(false);
    if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); return; }
    setSnapshotInfo({ lockedAt: nowIso });
  }

  async function unlockTerm() {
    if (!selectedClassroom?.year_name || !snapshotInfo) return;
    if (!window.confirm("ปลดล็อก? ใบนี้จะกลับไปคำนวณจากคะแนนปัจจุบันทั้งหมด (ข้อมูลที่บันทึกไว้จะหายถาวร)")) return;
    await supabase.from("grade_report_snapshots").delete()
      .eq("classroom_id", selectedClassroom.classroom_id)
      .eq("year_name", selectedClassroom.year_name)
      .eq("semester", semester)
      .eq("doc_kind", kind);
    setSnapshotInfo(null);
    setReloadKey(k => k + 1);
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const gradeRows = students.map(s => {
        const row: Record<string, string | number> = {
          "เลขที่": s.seat_number,
          "ชื่อ-นามสกุล": `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim(),
        };
        gradeColumns.forEach(col => {
          if (col.kind === "single") {
            const cell = gradeMatrix[s.id]?.[col.section.id];
            row[col.label] = cell ? `${cell.grandTotal} (${cell.grade})` : "-";
          } else if (col.kind === "groupMember") {
            const cell = gradeMatrix[s.id]?.[col.section.id];
            row[col.label] = cell ? `${cell.grandTotal}` : "-";
          } else if (col.kind === "groupCombined") {
            const g = groupCombinedCell(s.id, col.members);
            row[`${col.label} (รวม)`] = g ? `${g.combined}` : "-";
          }
        });
        return row;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gradeRows), "คะแนนรวมทุกวิชา");

      const attendRows = students.map(s => {
        const row: Record<string, string | number> = {
          "เลขที่": s.seat_number,
          "ชื่อ-นามสกุล": `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim(),
        };
        sections.forEach(sec => {
          const cell = attendMatrix[s.id]?.[sec.id];
          row[sec.subject_name] = cell && cell.total > 0 ? `${cell.present}/${cell.total}` : "-";
        });
        return row;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendRows), "การมาเรียนทุกวิชา");

      XLSX.writeFile(wb, `สรุปผล_${selectedClassroom?.room_name ?? ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      alert("ดาวน์โหลดไฟล์ไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 font-bold">กำลังโหลดข้อมูล...</div>;

  const tabBtn = (active: boolean) =>
    `px-4 py-2 rounded-xl font-black text-sm ${active ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`;

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      {!selectedClassroom ? (
        <>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5 w-fit mt-4">
            {([1, 2] as const).map(s => (
              <button key={s} onClick={() => setSemester(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${semester === s ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                เทอม {s}
              </button>
            ))}
          </div>
          {isAdmin && yearOptions.length > 1 && (
            <select value={yearName} onChange={e => setYearName(e.target.value)}
              className="ml-2 mt-4 border-2 border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black">
              {yearOptions.sort().reverse().map(y => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
            </select>
          )}
          {isAdmin && (
            <p className="mt-3 text-xs font-bold text-indigo-600">🔑 สิทธิ์ผู้ดูแล — เห็นทุกห้องทั้งโรงเรียน ({visibleClassrooms.length} ห้อง)</p>
          )}
          {(() => {
            const used = new Set<string>();
            const sections = levelGroups.map(g => {
              const rooms = visibleClassrooms.filter(c => g.test(c.room_name));
              rooms.forEach(r => used.add(r.classroom_id));
              return { ...g, rooms };
            });
            const others = visibleClassrooms.filter(c => !used.has(c.classroom_id));
            if (others.length) sections.push({ key: "other", label: "อื่นๆ", test: () => true, rooms: others });
            return sections.filter(g => g.rooms.length > 0).map(g => (
              <div key={g.key} className="mt-5">
                <h2 className="text-sm font-black text-slate-600 mb-2">{g.label} <span className="text-slate-300">({g.rooms.length})</span></h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {g.rooms.map(c => (
                    <button key={c.classroom_id} onClick={() => setSelectedClassroom(c)}
                      className="text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-lg transition">
                      <p className="font-bold text-slate-800">ห้อง {c.room_name}</p>
                    </button>
                  ))}
                </div>
              </div>
            ));
          })()}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-4 mb-4 print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => router.push("/dashboard")}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
              {visibleClassrooms.length > 1 && (
                <button onClick={() => setSelectedClassroom(null)} className="text-xs font-bold text-blue-600 underline">← เปลี่ยนห้อง</button>
              )}
              <span className="text-sm font-black text-slate-600">ห้อง {selectedClassroom.room_name}</span>

              <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                {([1, 2] as const).map(s => (
                  <button key={s} onClick={() => changeSemester(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black ${semester === s ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                    เทอม {s}
                  </button>
                ))}
              </div>

              <button onClick={() => setTab("grades")} className={tabBtn(tab === "grades")}>⭐ คะแนนรวมทุกวิชา</button>
              <button onClick={() => setTab("attendance")} className={tabBtn(tab === "attendance")}>🗓️ การมาเรียนทุกวิชา</button>
              <button onClick={() => setTab("insights")} className={tabBtn(tab === "insights")}>📊 ข้อมูลเชิงลึก</button>
              <button onClick={() => setTab("vp4")} className={tabBtn(tab === "vp4")}>📄 {level === "secondary" ? "ใบเกรด / แบบวัดผล 4" : "ใบเกรด"}</button>
            </div>
            {tab !== "insights" && tab !== "vp4" && (
              <div className="flex items-center gap-2">
                <button onClick={handleExportExcel} disabled={exporting || loadingData}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm disabled:opacity-50">
                  📊 {exporting ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด"}
                </button>
                <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm">
                  🖨️ พิมพ์
                </button>
              </div>
            )}
          </div>

          {/* แถบควบคุมของแท็บใบเกรด */}
          {tab === "vp4" && (
            <div className="flex items-center gap-2 flex-wrap mb-3 print:hidden">
              {level === "secondary" && (
                <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                  <button onClick={() => setDocKind("midterm")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black ${kind === "midterm" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                    แบบวัดผล 4 (มิดเทอม)
                  </button>
                  <button onClick={() => setDocKind("final")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black ${kind === "final" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                    ใบเกรดปลายภาค
                  </button>
                </div>
              )}

              {level === "secondary" && kind === "midterm" && (
                <input value={gradeHeadName} onChange={e => setGradeHeadName(e.target.value)} disabled={!!snapshotInfo}
                  placeholder="ชื่อหัวหน้าสายชั้น (เช่น นายธนวัฒน์ ภู่เทศวิเศษพงศ์)"
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold w-80 disabled:bg-slate-50" />
              )}

              {lockable && (
                snapshotInfo ? (
                  <>
                    <span className="px-3 py-2 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-black text-sm">
                      🔒 บันทึกแล้ว {new Date(snapshotInfo.lockedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <button onClick={unlockTerm}
                      className="px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-slate-600 font-black text-sm">🔓 ปลดล็อก</button>
                  </>
                ) : (
                  <button onClick={lockTerm} disabled={locking || loadingData}
                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm disabled:opacity-50">
                    {locking ? "⏳ กำลังบันทึก..." : kind === "midterm" ? "💾 บันทึกคะแนนมิดเทอมเพื่อจำค่า" : "🔒 ล็อกคะแนนเทอม 1"}
                  </button>
                )
              )}
            </div>
          )}

          {tab === "vp4" && lockable && !snapshotInfo && !loadingData && (
            <p className="mb-3 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 print:hidden">
              ⚠️ {kind === "midterm"
                ? "ยังไม่ได้บันทึกคะแนนมิดเทอม — ใบนี้จะเปลี่ยนตามคะแนนปัจจุบัน ควรกดบันทึกก่อนเริ่มกรอกคะแนนปลายภาค"
                : "เทอม 1 ยังไม่ล็อก — ใบเกรดนี้จะเปลี่ยนตามคะแนนปัจจุบัน ควรล็อกก่อนเริ่มกรอกคะแนนเทอม 2"}
            </p>
          )}
          {notInTimetable.length > 0 && (
            <p className="mb-3 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 print:hidden">
              ⚠️ วิชาต่อไปนี้มี Smart Class แต่ไม่อยู่ในตารางสอนเทอม {semester} จึงไม่แสดงในใบ: {notInTimetable.join(", ")}
            </p>
          )}

          {tab === "vp4" ? (
            loadingData ? (
              <p className="text-slate-400 text-sm">กำลังโหลดข้อมูลทุกวิชา...</p>
            ) : (
              <Vp4Report
                classroomLevel={level}
                classroomLabel={selectedClassroom.room_name}
                groupNames={groupNames}
                academicYear={selectedClassroom.year_name ?? "2569"}
                semester={String(semester)}
                docKind={kind}
                schoolName="โรงเรียนวัดเขียนเขต"
                districtName="ธัญบุรี"
                provinceName="ปทุมธานี"
                directorName="นายธนณัฐ ศิระวงษ์"
                gradeHeadName={gradeHeadName}
                advisorNames={advisors}
                students={students}
                sections={sections}
                gradeMatrix={gradeMatrix}
                attendMatrix={attendMatrix}
                scoreDate={snapshotInfo?.lockedAt}
                onBack={() => setTab("grades")}
              />
            )
          ) : tab === "insights" ? (
            <InsightsTool currentUserId={currentUserId} classroomId={selectedClassroom.classroom_id} />
          ) : loadingData ? (
            <p className="text-slate-400 text-sm">กำลังโหลดข้อมูลทุกวิชา...</p>
          ) : sections.length === 0 ? (
            <p className="text-slate-400 text-sm">ยังไม่พบวิชาที่เปิดสอนให้ห้องนี้</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-auto max-h-[75vh] print:max-h-none print:overflow-visible">
              <table className="w-full min-w-[720px] border-collapse text-base">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left text-sm font-black text-slate-500 px-5 py-3 sticky left-0 top-0 z-30 bg-sky-100">รายชื่อ</th>
                    {activeColumns.map(col => {
                      const colors = COLUMN_COLORS[col.colorIndex % COLUMN_COLORS.length];
                      return (
                        <th key={col.key} className={`px-3 py-3 text-center min-w-[110px] sticky top-0 z-20 ${colors.header}`}>
                          <p className="text-sm font-black truncate max-w-[140px] mx-auto" title={col.label}>{col.label}</p>
                          <p className={`text-xs font-bold ${colors.code}`}>{col.kind === "groupCombined" ? "รวม" : col.code}</p>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-sky-50/60">
                      <td className="px-5 py-3 sticky left-0 z-10 bg-sky-50">
                        <p className="text-base font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name}</p>
                        <p className="text-sm text-slate-500 font-bold">เลขที่ {s.seat_number}</p>
                      </td>
                      {activeColumns.map(col => {
                        const colors = COLUMN_COLORS[col.colorIndex % COLUMN_COLORS.length];

                        if (tab === "attendance") {
                          const cell = col.kind === "single" ? attendMatrix[s.id]?.[col.section.id] : undefined;
                          return (
                            <td key={col.key} className={`text-center px-3 py-3 ${colors.cell}`}>
                              {cell && cell.total > 0 ? (
                                <span className={`inline-flex px-2 py-1 rounded-full text-sm font-black ${
                                  cell.present / cell.total >= 0.8 ? "bg-emerald-50 text-emerald-600" : cell.present / cell.total >= 0.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                                }`}>
                                  {cell.present}/{cell.total}
                                </span>
                              ) : <span className="text-slate-300 text-sm">-</span>}
                            </td>
                          );
                        }

                        if (col.kind === "groupCombined") {
                          const g = groupCombinedCell(s.id, col.members);
                          return (
                            <td key={col.key} className={`text-center px-3 py-3 ${colors.cell}`}>
                              {g ? (
                                <span className="inline-flex px-2 py-1 rounded-full text-base font-black bg-fuchsia-50 text-fuchsia-600">{g.combined}</span>
                              ) : <span className="text-slate-300 text-sm">-</span>}
                            </td>
                          );
                        }

                        const cell = gradeMatrix[s.id]?.[col.section.id];
                        return (
                          <td key={col.key} className={`text-center px-3 py-3 ${colors.cell}`}>
                            {cell ? (
                              <div className="flex flex-col items-center">
                                <span className="text-base font-black text-slate-700">
                                  {cell.grandTotal}<span className="text-slate-400 font-bold text-sm">/{cell.totalMax}</span>
                                </span>
                                {col.kind === "single" && <span className="text-sm font-black text-fuchsia-500">{cell.grade}</span>}
                              </div>
                            ) : <span className="text-slate-300 text-sm">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}