"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InsightsTool from "@/components/insights/InsightsTool";
import Vp4Report from "@/components/insights/Vp4Report";

const supabase = createClient();

type Classroom = { classroom_id: string; room_name: string };
type Student = { id: string; prefix?: string; first_name: string; last_name: string; nick_name?: string; seat_number: number; avatar_url?: string };
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

// วิชากลุ่ม "กิจกรรมพัฒนาผู้เรียน" (แนะแนว / ชุมนุม / ลูกเสือ-ยุวกาชาด ฯลฯ)
// สังเกตจาก subject_code ที่ขึ้นต้นด้วย "ก" (เช่น ก11901, ก11902, ก11903)
// ถ้ามีคอลัมน์ subject_type เป็น "activity" จริงในฐานข้อมูล แนะนำให้เปลี่ยนมาเช็คจาก field นั้นแทน
function isActivitySubject(subjectCode: string): boolean {
  return /^ก/.test(subjectCode ?? "");
}
function applyRounding(value: number, mode: "up" | "truncate" = "truncate"): number {
  return mode === "up" ? Math.ceil(value) : Math.floor(value);
}
// ลำดับหมวดวิชา: พื้นฐาน(0) < เพิ่มเติม(1) < กิจกรรมพัฒนาผู้เรียน(2, อยู่ท้ายสุดเสมอ)
function subjectRank(s: SectionInfo): number {
  if (isActivitySubject(s.subject_code)) return 2;
  return s.subject_type === "basic" ? 0 : 1;
}

// จานสี สลับ ชมพูเข้ม / ชมพูอ่อน ต่อ "บล็อกวิชา" หนึ่งบล็อก (วิชาเดี่ยว หรือกลุ่มวิชาที่รวมกัน)
const COLUMN_COLORS = [
  { header: "bg-pink-300/80 text-pink-900", code: "text-pink-900/50", cell: "bg-pink-50/70" },
  { header: "bg-pink-100/80 text-pink-800", code: "text-pink-800/50", cell: "bg-pink-50/20" },
];

type FlatColumn =
  | { key: string; kind: "single"; label: string; code: string; section: SectionInfo; colorIndex: number }
  | { key: string; kind: "groupMember"; label: string; code: string; section: SectionInfo; colorIndex: number; groupCode: string }
  | { key: string; kind: "groupCombined"; label: string; colorIndex: number; groupCode: string; members: SectionInfo[] };

type AdvisorInfo = { prefix?: string; first_name: string; last_name: string };
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
  const [advisors, setAdvisors] = useState<AdvisorInfo[]>([
  { first_name: "", last_name: "" },
  { first_name: "", last_name: "" },
]);
const [groupNames, setGroupNames] = useState<Record<string, string>>({});

  // คอลัมน์สำหรับแท็บ "คะแนนรวมทุกวิชา": วิชาที่ไม่รวมกลุ่ม = 1 คอลัมน์, วิชาที่รวมกลุ่ม = สมาชิกทุกวิชา + 1 คอลัมน์รวม
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
          cols.push({
            key: `${m.id}-member`,
            kind: "groupMember",
            label: m.subject_name,
            code: m.subject_code,
            section: m,
            colorIndex: idx,
            groupCode: sec.score_group_code!,
          });
        });

        const groupLabel = groupNames[sec.score_group_code] || members.map(m => m.subject_name).join("/");
        cols.push({
          key: `group-${sec.score_group_code}-combined`,
          kind: "groupCombined",
          label: groupLabel,
          colorIndex: idx,
          groupCode: sec.score_group_code!,
          members,
        });
      } else {
        const idx = colorIndex++;
        cols.push({
          key: sec.id,
          kind: "single",
          label: sec.subject_name,
          code: sec.subject_code,
          section: sec,
          colorIndex: idx,
        });
      }
    });

    return cols;
  }, [sections, groupNames]);

  // คอลัมน์สำหรับแท็บ "การมาเรียนทุกวิชา": แสดงทุกวิชาแยกคอลัมน์เดี่ยว ไม่รวมกลุ่ม (แต่เรียงลำดับเดียวกัน กิจกรรมฯ อยู่ท้ายสุด)
  const attendanceColumns = useMemo<FlatColumn[]>(() => {
    return sections.map((sec, i) => ({
      key: sec.id,
      kind: "single" as const,
      label: sec.subject_name,
      code: sec.subject_code,
      section: sec,
      colorIndex: i,
    }));
  }, [sections]);

  const activeColumns = tab === "attendance" ? attendanceColumns : gradeColumns;

  function groupCombinedCell(studentId: string, members: SectionInfo[]) {
  const cells = members.map(m => gradeMatrix[studentId]?.[m.id]);
  if (cells.some(c => !c)) return null;
  const totalWeight = members.reduce((s, m) => s + (m.score_group_weight_percent ?? 0), 0) || 100;
  const combined = members.reduce((sum, m, i) => {
    const w = (m.score_group_weight_percent ?? 0) / totalWeight;
   return sum + w * (cells[i]!.grandTotal);   // ★ ใช้คะแนนดิบ (รวม งาน+พิเศษ+สอบ) แทน %
  }, 0);
  const roundingMode = members[0]?.gradeRoundingMode ?? "truncate";
 return { parts: cells.map(c => c!.grandTotal), combined: applyRounding(combined, roundingMode), };  // ★ เก็บทศนิยม เช่น 7.5
}

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
        if (profile) setCurrentUserId(profile.id);
      }
      const { data } = await supabase.rpc("get_my_classrooms");
      const rows = (data ?? []) as Classroom[];
      setClassrooms(rows);
      if (rows.length === 1) setSelectedClassroom(rows[0]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedClassroom) return;
    (async () => {
      setLoadingData(true);

      const { data: studentsData } = await supabase
        .from("students")
        .select("id, prefix, first_name, last_name, nick_name, seat_number, avatar_url, student_code")
        .eq("classroom_id", selectedClassroom.classroom_id)
        .order("seat_number");
      const studentRows = (studentsData ?? []) as Student[];
      setStudents(studentRows);
      // ★ ดึงครูที่ปรึกษา/ครูประจำชั้น 2 คน จากตาราง classrooms
const { data: classroomRow, error: classroomErr } = await supabase
  .from("classrooms")
  .select("homeroom_teacher_id, homeroom_teacher_2_id")
  .eq("id", selectedClassroom.classroom_id)
  .maybeSingle();
if (classroomErr) console.error("[advisor] classroomRow error:", classroomErr);
console.log("[advisor] classroomRow:", classroomRow);

const teacherIds = [classroomRow?.homeroom_teacher_id, classroomRow?.homeroom_teacher_2_id]
  .filter((v): v is string => !!v);

if (teacherIds.length > 0) {
   const { data: teacherRows, error: teacherErr } = await supabase
    .from("users")
    .select("id, prefix, first_name, last_name")
    .in("id", teacherIds);
  if (teacherErr) console.error("[advisor] teacherRows error:", teacherErr);
  console.log("[advisor] teacherRows:", teacherRows);

  const teacherMap: Record<string, AdvisorInfo> = {};
  (teacherRows ?? []).forEach((t: any) => {
    teacherMap[t.id] = { prefix: t.prefix, first_name: t.first_name ?? "", last_name: t.last_name ?? "" };
  });

  setAdvisors([
    (classroomRow?.homeroom_teacher_id && teacherMap[classroomRow.homeroom_teacher_id]) || { first_name: "", last_name: "" },
    (classroomRow?.homeroom_teacher_2_id && teacherMap[classroomRow.homeroom_teacher_2_id]) || { first_name: "", last_name: "" },
  ]);
} else {
  setAdvisors([{ first_name: "", last_name: "" }, { first_name: "", last_name: "" }]);
}

      // Por5SummaryPage.tsx
       const { data: sectionRows } = await supabase
   .from("subject_sections")
   .select(
     "id, subject_id, is_active, formative_max_score, midterm_max_score, final_max_score, subjects(subject_code, name_th, subject_type, hours_per_year, credit_hours, score_group_code, score_group_weight_percent, grading_mode, grade_rounding_mode)"
)
   .eq("classroom_id", selectedClassroom.classroom_id)
   .eq("is_active", true);

      const secs: SectionInfo[] = (sectionRows ?? []).map((r: any) => {
        const subjectCode = r.subjects?.subject_code ?? "";
        const isActivity = isActivitySubject(subjectCode);
        return {
          id: r.id,
          subject_id: r.subject_id,
          subject_code: subjectCode,
          subject_name: r.subjects?.name_th ?? "ไม่ทราบชื่อวิชา",
          subject_type: r.subjects?.subject_type ?? "basic", // "basic" | "additional"
          hours_per_year: r.subjects?.hours_per_year ?? null,
          credit_hours: r.subjects?.credit_hours ?? null,
          score_group_code: isActivity ? null : (r.subjects?.score_group_code ?? null),
          score_group_weight_percent: r.subjects?.score_group_weight_percent ?? 100,
             gradingMode: r.subjects?.grading_mode ?? "numeric",
   formativeMaxScore: r.formative_max_score ?? 70,
   midtermMaxScore: r.midterm_max_score ?? 0,
   finalMaxScore: r.final_max_score ?? 30, gradeRoundingMode: r.subjects?.grade_rounding_mode ?? "truncate",
        };
      }).sort((a: SectionInfo, b: SectionInfo) => {
        const ra = subjectRank(a);
        const rb = subjectRank(b);
        if (ra !== rb) return ra - rb; // พื้นฐาน -> เพิ่มเติม -> กิจกรรมพัฒนาผู้เรียน(ท้ายสุด)
        return a.subject_name.localeCompare(b.subject_name, "th");
      });
      setSections(secs);

      // ใส่ต่อจาก setSections(secs);
      const groupCodes = Array.from(new Set(secs.map(s => s.score_group_code).filter(Boolean))) as string[];
      if (groupCodes.length > 0) {
        const { data: groupRows } = await supabase
          .from("subject_score_groups")
          .select("group_code, group_name")
          .in("group_code", groupCodes);
        const map: Record<string, string> = {};
        (groupRows ?? []).forEach((g: any) => { map[g.group_code] = g.group_name; });
        setGroupNames(map);
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
    const examScores = json.examScores ?? [];              // ★ เพิ่ม
    const rawMidtermMax = json.rawMidtermMaxScore ?? null;  // ★ เพิ่ม
    const rawFinalMax = json.rawFinalMaxScore ?? null;      // ★ เพิ่ม

    const usesComponentGrading = sec.gradingMode !== "pass_fail";
    const formativeMaxScore = sec.formativeMaxScore ?? 70;
    const midtermMaxScore = sec.midtermMaxScore ?? 0;
    const finalMaxScore = sec.finalMaxScore ?? 30;
    const useMidterm = midtermMaxScore > 0;

    // ★ ก็อปฟังก์ชันเดียวกับ GradeOverviewTool.tsx มาเป๊ะๆ (ในอนาคตควรย้ายไป lib กลาง)
    const isWeighted = (a: any) =>
      !!(a.allow_weight && a.weight_percent != null && (a.max_score ?? 0) > 0);
    const getAssignmentMaxContribution = (a: any) =>
      isWeighted(a) ? a.weight_percent : (a.max_score ?? 0);
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

      // % ใช้ตัดสินเกรดของ "วิชานี้เดี่ยวๆ" เท่านั้น (ยังต้องคงไว้)
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

      // ★ ค่านี้ต้องตรงกับคอลัมน์ "รวม" ที่แก้ไปในหน้าคะแนนรวม (displayTotal/displayMax)
      const examMaxTotal = usesComponentGrading
        ? (useMidterm && midtermRaw !== null ? midtermMaxScore : 0) + (finalRaw !== null ? finalMaxScore : 0)
        : 0;
      const displayTotal = assignmentTotal + specialTotal + (useMidterm ? (midtermScore ?? 0) : 0) + (finalScore ?? 0);
      const displayMax = usesComponentGrading ? totalMaxScore + examMaxTotal : totalMaxScore;

      gMatrix[s.id][sec.id] = { grandTotal: applyRounding(displayTotal, sec.gradeRoundingMode),   // ★ ปัดเศษคะแนนที่โชว์ในตารางด้วย
 percentage, grade, totalMax: displayMax };
    });
  } catch { /* ข้ามวิชานี้ถ้าดึงข้อมูลไม่สำเร็จ */ }

        try {
          const res = await fetch(`/api/subject-attendance/summary?subject_section_id=${sec.id}`);
          const json = await res.json();
          const dates: string[] = json.dates ?? [];
          const records = json.records ?? [];
          studentRows.forEach(s => {
            const presentCount = records.filter((r: any) => r.student_id === s.id && (r.status === "present" || r.status === "late")).length;
            aMatrix[s.id][sec.id] = { present: presentCount, total: dates.length };
          });
        } catch { /* ข้ามวิชานี้ถ้าดึงข้อมูลไม่สำเร็จ */ }
      }));

      setGradeMatrix(gMatrix);
      setAttendMatrix(aMatrix);
      setLoadingData(false);
    })();
  }, [selectedClassroom]);

  function detectLevel(roomName: string): "primary" | "secondary" {
    return roomName.startsWith("ม") || /^[4-6]\//.test(roomName) ? "secondary" : "primary";
    // TODO: แทนที่ด้วยการอ่านจาก classrooms.level ถ้ามีคอลัมน์นี้จริง แม่นยำกว่าการเดาจากชื่อ
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

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      {!selectedClassroom ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {classrooms.map(c => (
            <button key={c.classroom_id} onClick={() => setSelectedClassroom(c)}
              className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg transition">
              <p className="font-bold text-slate-800">ห้อง {c.room_name}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-4 mb-4 print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              {classrooms.length > 1 && (
                <button onClick={() => setSelectedClassroom(null)} className="text-xs font-bold text-blue-600 underline">← เปลี่ยนห้อง</button>
              )}
              <span className="text-sm font-black text-slate-600">ห้อง {selectedClassroom.room_name}</span>
              <button onClick={() => setTab("grades")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "grades" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                ⭐ คะแนนรวมทุกวิชา
              </button>
              <button onClick={() => setTab("attendance")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "attendance" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                🗓️ การมาเรียนทุกวิชา
              </button>
              <button onClick={() => setTab("insights")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "insights" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                📊 ข้อมูลเชิงลึก
              </button>
              <button onClick={() => setTab("vp4")}
                className={`px-4 py-2 rounded-xl font-black text-sm ${tab === "vp4" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                📄 ใบเกรด
              </button>
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

          {tab === "vp4" ? (
            <Vp4Report
              classroomLevel={detectLevel(selectedClassroom.room_name)}
  classroomLabel={selectedClassroom.room_name}
  groupNames={groupNames}
              academicYear="2568"           // TODO: ดึงจาก academic_years table จริง
              semester="1"                  // TODO: ดึงภาคเรียนปัจจุบันจริง
              schoolName="โรงเรียนวัดเขียนเขต"   // TODO: ดึงจาก schools table
              districtName="ธัญบุรี"
              provinceName="ปทุมธานี"
              directorName="นายธนณัฐ ศิระวงษ์"  // TODO
              advisorNames={advisors}
              students={students}
              sections={sections}
              gradeMatrix={gradeMatrix}
              attendMatrix={attendMatrix}
              onBack={() => setTab("grades")}
            />
          ) : tab === "insights" ? (
            <InsightsTool currentUserId={currentUserId} classroomId={selectedClassroom.classroom_id} />
          ) : loadingData ? (
            <p className="text-slate-400 text-sm">กำลังโหลดข้อมูลทุกวิชา...</p>
          ) : sections.length === 0 ? (
            <p className="text-slate-400 text-sm">ยังไม่พบวิชาที่เปิดสอนให้ห้องนี้</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left text-[11px] font-black text-slate-500 px-5 py-3 sticky left-0 bg-slate-50 z-10">รายชื่อ</th>
                    {activeColumns.map(col => {
                      const colors = COLUMN_COLORS[col.colorIndex % COLUMN_COLORS.length];
                      return (
                        <th key={col.key} className={`px-3 py-3 text-center min-w-[110px] ${colors.header}`}>
                          <p className="text-[11px] font-black truncate max-w-[140px] mx-auto" title={col.label}>
                            {col.label}
                          </p>
                          <p className={`text-[9px] font-bold ${colors.code}`}>
                            {col.kind === "groupCombined" ? "รวม" : col.code}
                          </p>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 sticky left-0 bg-white z-10">
                        <p className="text-xs font-black text-slate-700 whitespace-nowrap">{s.prefix}{s.first_name} {s.last_name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                      </td>
                      {activeColumns.map(col => {
                        const colors = COLUMN_COLORS[col.colorIndex % COLUMN_COLORS.length];

                        if (tab === "attendance") {
                          const cell = col.kind === "single" ? attendMatrix[s.id]?.[col.section.id] : undefined;
                          return (
                            <td key={col.key} className={`text-center px-3 py-3 ${colors.cell}`}>
                              {cell && cell.total > 0 ? (
                                <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-black ${
                                  cell.present / cell.total >= 0.8 ? "bg-emerald-50 text-emerald-600" : cell.present / cell.total >= 0.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                                }`}>
                                  {cell.present}/{cell.total}
                                </span>
                              ) : <span className="text-slate-200 text-xs">-</span>}
                            </td>
                          );
                        }

                        // tab === "grades"
                        if (col.kind === "groupCombined") {
                          const g = groupCombinedCell(s.id, col.members);
                          return (
                            <td key={col.key} className={`text-center px-3 py-3 ${colors.cell}`}>
                              {g ? (
                                <span className="inline-flex px-2 py-1 rounded-full text-sm font-black bg-fuchsia-50 text-fuchsia-600">
                                  {g.combined}
                                </span>
                              ) : <span className="text-slate-200 text-xs">-</span>}
                            </td>
                          );
                        }

                        // "single" or "groupMember"
                        const cell = gradeMatrix[s.id]?.[col.section.id];
return (
  <td key={col.key} className={`text-center px-3 py-3 ${colors.cell}`}>
    {cell ? (
      <div className="flex flex-col items-center">
       <span className="text-sm font-black text-slate-700">
         {cell.grandTotal}<span className="text-slate-400 font-bold text-[10px]">/{cell.totalMax}</span>
       </span>
        {col.kind === "single" && (
          <span className="text-[10px] font-black text-fuchsia-500">{cell.grade}</span>
        )}
      </div>
    ) : <span className="text-slate-200 text-xs">-</span>}
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