"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string;
  seat_number: number; student_code?: string;
};

function isActivitySubject(subjectCode: string): boolean {
  return /^ก/.test(subjectCode ?? "");
}

function applyRounding(value: number, mode: "up" | "truncate" = "truncate"): number {
  return mode === "up" ? Math.ceil(value) : Math.floor(value);
}

function parseRoomName(roomName: string): { grade: string; room: string } {
  const m = roomName.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return { grade: m[1], room: m[2] };
  return { grade: roomName, room: roomName };
}

type SectionInfo = {
  id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  subject_type: "basic" | "additional";
  hours_per_year: number | null;
  credit_hours: number | null;
  score_group_code?: string | null;
  score_group_weight_percent?: number;
  gradeRoundingMode?: "up" | "truncate";
};
type GradeCell = { grandTotal: number; percentage: number; grade: string; totalMax: number };
type AttendCell = { present: number; total: number };

type AdvisorInfo = { prefix?: string; first_name: string; last_name: string };

type ReportRow =
  | { kind: "single"; section: SectionInfo }
  | { kind: "group"; groupCode: string; code: string; name: string; members: SectionInfo[] };

function buildReportRows(sections: SectionInfo[], groupNames: Record<string, string>): ReportRow[] {
  const seen = new Set<string>();
  const rows: ReportRow[] = [];
  sections.forEach(sec => {
    if (sec.score_group_code) {
      if (seen.has(sec.score_group_code)) return;
      seen.add(sec.score_group_code);
      const members = sections.filter(s => s.score_group_code === sec.score_group_code);
      rows.push({
        kind: "group",
        groupCode: sec.score_group_code,
        code: sec.score_group_code,
        name: groupNames[sec.score_group_code] || members.map(m => m.subject_name).join("/"),
        members,
      });
    } else {
      rows.push({ kind: "single", section: sec });
    }
  });
  return rows;
}

// ★ ลำดับการเรียงวิชา: พื้นฐานก่อน (เรียงตามอักษรย่อ ท/ค/ว/ส/พ/ศ/ง/อ) แล้วเพิ่มเติม (เรียงอักษรย่อแบบเดียวกัน) แล้วจึงกิจกรรม
const SUBJECT_LETTER_ORDER = ["ท", "ค", "ว", "ส", "พ", "ศ", "ง", "อ"];

function subjectTypeRank(sec: SectionInfo): number {
  if (isActivitySubject(sec.subject_code)) return 2; // กิจกรรมอยู่ท้ายสุด
  return sec.subject_type === "basic" ? 0 : 1; // พื้นฐาน -> เพิ่มเติม
}

function subjectLetterRank(code: string): number {
  const letter = (code ?? "").charAt(0);
  const idx = SUBJECT_LETTER_ORDER.indexOf(letter);
  return idx === -1 ? SUBJECT_LETTER_ORDER.length : idx;
}

function compareSections(a: SectionInfo, b: SectionInfo): number {
  const rankDiff = subjectTypeRank(a) - subjectTypeRank(b);
  if (rankDiff !== 0) return rankDiff;
  const letterDiff = subjectLetterRank(a.subject_code) - subjectLetterRank(b.subject_code);
  if (letterDiff !== 0) return letterDiff;
  return (a.subject_code ?? "").localeCompare(b.subject_code ?? "");
}

function groupCombinedScore(
  gradeMatrix: Record<string, Record<string, GradeCell>>,
  studentId: string,
  members: SectionInfo[]
): number | null {
  const cells = members.map(m => gradeMatrix[studentId]?.[m.id]);
  if (cells.some(c => !c)) return null;
  const totalWeight = members.reduce((s, m) => s + (m.score_group_weight_percent ?? 0), 0) || 100;
  const combined = members.reduce((sum, m, i) => {
    const w = (m.score_group_weight_percent ?? 0) / totalWeight;
    return sum + w * cells[i]!.grandTotal;
  }, 0);
  const roundingMode = members[0]?.gradeRoundingMode ?? "truncate";
  return applyRounding(combined, roundingMode);
}

function formatFullName(a?: AdvisorInfo): string {
  if (!a || (!a.first_name && !a.last_name)) return "…";
  return `${a.prefix ?? ""}${a.first_name} ${a.last_name}`.trim();
}

function activityResult(att?: AttendCell): "ผ" | "มผ" {
  if (!att || att.total === 0) return "ผ";
  return att.present / att.total >= 0.5 ? "ผ" : "มผ";
}

function characteristicLabel(level: string): string {
  const map: Record<string, string> = { "3": "3 = ดีเยี่ยม", "2": "2 = ดี", "1": "1 = ผ่าน", "0": "0 = ไม่ผ่าน" };
  return map[level] ?? "-";
}

// ★ ตรวจสอบว่าเป็นภาคเรียนที่ 1 หรือไม่ (รองรับค่าที่อาจเป็น "1", "ภาคเรียนที่ 1", "เทอม 1" ฯลฯ)
function isFirstSemester(semester?: string): boolean {
  if (!semester) return false;
  const s = semester.trim();
  if (s === "1") return true;
  return /1/.test(s) && !/2/.test(s);
}

// ★ ประมาณความกว้างของข้อความไทย/อังกฤษ เพื่อคำนวณความกว้างของเส้นใต้ (blank) ให้พอดีกับข้อความ
function estimateTextWidthPx(text: string, pxPerChar = 13, basePadding = 24): number {
  const len = (text ?? "").length;
  return len * pxPerChar + basePadding;
}

// ★ ช่องกรอกข้อมูลด้านบน (ชื่อ / เลขประจำตัว / ห้อง / เลขที่) — label ตามด้วยข้อความที่จัดกึ่งกลาง (ไม่มีเส้นใต้)
function InfoField({ label, value, grow = 1 }: { label: string; value: string; grow?: number }) {
  return (
    <div className="flex items-baseline" style={{ flexGrow: grow, flexBasis: 0, minWidth: "fit-content" }}>
      <span className="whitespace-nowrap">{label}</span>
      <span className="flex-1 text-center mx-2 px-1 whitespace-nowrap overflow-hidden text-ellipsis">
        {value}
      </span>
    </div>
  );
}

// ★ บรรทัดลงชื่อ — "ลงชื่อ" ชิดซ้ายตรงกันทุกช่อง เส้นใต้กับชื่อในวงเล็บอยู่ในคอลัมน์เดียวกัน
//    ทำให้ชื่อในวงเล็บอยู่กึ่งกลางเส้นใต้พอดี ไม่ว่าความยาวของคำว่า "ลงชื่อ" หรือ role จะเป็นเท่าใด
function SignatureField({ role, nameLabel, lineWidthPx: fixedLineWidthPx }: { role: string; nameLabel?: string; lineWidthPx?: number }) {
  const lineWidthPx = fixedLineWidthPx ?? Math.max(140, estimateTextWidthPx(nameLabel ?? ""));
  return (
    <div className="inline-flex items-baseline text-left signature-field">
      <span className="whitespace-nowrap">ลงชื่อ</span>
      <div className="flex flex-col items-center mx-1" style={{ width: `${lineWidthPx}px` }}>
        <span className="border-b-2 border-dotted border-gray-400 w-full text-center">&nbsp;</span>
        <span className="text-center whitespace-nowrap">
          {nameLabel ? `(${nameLabel})` : "\u00A0"}
        </span>
      </div>
      <span className="whitespace-nowrap">{role}</span>
    </div>
  );
}

export default function Vp4Report({
  classroomLevel,
  classroomLabel,
  academicYear,
  semester,
  schoolName, districtName, provinceName,
  directorName,
  advisorNames,
  students,
  sections: sectionsProp,
  gradeMatrix,
  attendMatrix,
  groupNames = {},
  onBack,
}: {
  classroomLevel: "primary" | "secondary";
  classroomLabel: string;
  academicYear: string;
  semester?: string;
  schoolName: string; districtName: string; provinceName: string;
  directorName: string;
  advisorNames: AdvisorInfo[];
  students: Student[];
  sections: SectionInfo[];
  gradeMatrix: Record<string, Record<string, GradeCell>>;
  attendMatrix: Record<string, Record<string, AttendCell>>;
  groupNames?: Record<string, string>;
  onBack: () => void;
}) {
  // ★ ส21101 (สังคมศึกษาฯ) ไม่มีในตารางสอน ป.1 แล้ว จึงต้องไม่แสดงในใบเกรด/ปพ นี้
  const EXCLUDED_SUBJECT_CODES = ["ส21101"];
  const sections = sectionsProp.filter(sec => !EXCLUDED_SUBJECT_CODES.includes(sec.subject_code));

  const router = useRouter();
  // ★ ประถมศึกษา ภาคเรียนที่ 1: ยังไม่มีผลการเรียน/เกรดเฉลี่ยสรุป ให้แสดงคะแนนเต็มและคะแนนที่ได้แทน
  const isPrimarySemester1 = classroomLevel === "primary" && isFirstSemester(semester);
  const [overallScores, setOverallScores] = useState<Record<string, { characteristic: string; readThinkWrite: string }>>({});
  // ★ null = ดูทั้งห้อง, มีค่า = ดูเฉพาะนักเรียนคนนั้น
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // ★ ครูที่ปรึกษาที่ดึงสดจากตาราง classrooms -> users (title, first_name, last_name)
  const [fetchedAdvisors, setFetchedAdvisors] = useState<AdvisorInfo[] | null>(null);

  useEffect(() => {
    (async () => {
      const results: Record<string, { characteristic: string; readThinkWrite: string }> = {};
      students.forEach(s => { results[s.id] = { characteristic: "-", readThinkWrite: "-" }; });
      setOverallScores(results);
    })();
  }, [classroomLevel, students]);

  // ★ ดึงครูที่ปรึกษา (homeroom_teacher_id, homeroom_teacher_2_id) จาก classrooms
  //    โดยอ้างอิงจาก room_name (เช่น "ป.1/6") แล้ว join ไปที่ users เพื่อเอา title + first_name + last_name
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!classroomLabel) {
        setFetchedAdvisors(null);
        return;
      }

      const { data: classroom, error: classroomError } = await supabase
        .from("classrooms")
        .select("id, room_name, homeroom_teacher_id, homeroom_teacher_2_id")
        .eq("room_name", classroomLabel)
        .maybeSingle();

      if (cancelled) return;

      if (classroomError || !classroom) {
        setFetchedAdvisors(null);
        return;
      }

      const teacherIds = [classroom.homeroom_teacher_id, classroom.homeroom_teacher_2_id].filter(
        (id): id is string => Boolean(id)
      );

      if (teacherIds.length === 0) {
        setFetchedAdvisors([]);
        return;
      }

      const { data: teachers, error: teachersError } = await supabase
        .from("users")
        .select("id, title, first_name, last_name")
        .in("id", teacherIds);

      if (cancelled) return;

      if (teachersError || !teachers) {
        setFetchedAdvisors(null);
        return;
      }

      // เรียงลำดับให้ตรงกับ ครูที่ปรึกษาคนที่ 1 (homeroom_teacher_id) และคนที่ 2 (homeroom_teacher_2_id)
      const ordered: AdvisorInfo[] = teacherIds.map(id => {
        const t = teachers.find((u: any) => u.id === id);
        return t
          ? { prefix: t.title ?? "", first_name: t.first_name ?? "", last_name: t.last_name ?? "" }
          : { prefix: "", first_name: "", last_name: "" };
      });

      setFetchedAdvisors(ordered);
    })();

    return () => { cancelled = true; };
  }, [classroomLabel]);

  // ★ ถ้าดึงจาก classrooms/users สำเร็จและมีข้อมูล ให้ใช้ค่านี้แทน prop ที่ส่งเข้ามา
  const resolvedAdvisors: AdvisorInfo[] =
    fetchedAdvisors && fetchedAdvisors.length > 0 ? fetchedAdvisors : advisorNames;

  function subjectTypeLabel(sec: SectionInfo): string {
    if (isActivitySubject(sec.subject_code)) return "กิจกรรม";
    if (sec.subject_type === "basic") return "พื้นฐาน";
    if (sec.subject_type === "additional") return "เพิ่มเติม";
    return "-";
  }

  // ★ เรียงวิชา: พื้นฐาน (ท/ค/ว/ส/พ/ศ/ง/อ) -> เพิ่มเติม (ท/ค/ว/ส/พ/ศ/ง/อ) -> กิจกรรม
  const sortedSections = [...sections].sort(compareSections);
  const reportRows = buildReportRows(sortedSections, groupNames);

  // ★ นักเรียนที่จะแสดง: ทั้งห้อง หรือ เฉพาะคนที่เลือก (เรียงตามเลขที่เดิม)
  const visibleStudents = selectedStudentId
    ? students.filter(s => s.id === selectedStudentId)
    : students;

  function creditSummary(studentId: string) {
    let basicPlanned = 0, basicEarned = 0;
    let addPlanned = 0, addEarned = 0;
    sections.forEach(sec => {
      if (isActivitySubject(sec.subject_code)) return;
      const credit = sec.credit_hours ?? 0;
      const cell = gradeMatrix[studentId]?.[sec.id];
      const passed = cell ? parseFloat(cell.grade) > 0 : false;
      if (sec.subject_type === "basic") {
        basicPlanned += credit;
        if (passed) basicEarned += credit;
      } else {
        addPlanned += credit;
        if (passed) addEarned += credit;
      }
    });
    return {
      basicPlanned, basicEarned, addPlanned, addEarned,
      totalPlanned: basicPlanned + addPlanned,
      totalEarned: basicEarned + addEarned,
    };
  }

  function calcGpaAndAvgPercent(studentId: string) {
    let weightedGradeSum = 0, creditSum = 0;
    let totalPercentSum = 0, subjectCount = 0;
    sections.forEach(sec => {
      if (isActivitySubject(sec.subject_code)) return;
      const cell = gradeMatrix[studentId]?.[sec.id];
      if (!cell) return;
      const credit = sec.credit_hours ?? 0;
      const g = parseFloat(cell.grade);
      if (!isNaN(g) && credit > 0) { weightedGradeSum += g * credit; creditSum += credit; }
      totalPercentSum += cell.percentage;
      subjectCount += 1;
    });
    const gpa = creditSum > 0 ? weightedGradeSum / creditSum : 0;
    const avgPercent = subjectCount > 0 ? totalPercentSum / subjectCount : 0;
    return { gpa: gpa.toFixed(2), avgPercent: avgPercent.toFixed(2), gpaRaw: gpa };
  }

  // ★ ลำดับที่ยังเทียบกับ "ทั้งห้อง" เสมอ ไม่ผูกกับโหมดดูทีละคน
  const classroomRanking = (() => {
    const withGpa = students.map(s => ({ id: s.id, gpa: calcGpaAndAvgPercent(s.id).gpaRaw }));
    const sorted = [...withGpa].sort((a, b) => b.gpa - a.gpa);
    const rankMap: Record<string, number> = {};
    let rank = 0, prev: number | null = null;
    sorted.forEach((r, i) => {
      if (prev === null || r.gpa !== prev) { rank = i + 1; prev = r.gpa; }
      rankMap[r.id] = rank;
    });
    return rankMap;
  })();

  function attendancePercentFor(studentId: string) {
    let present = 0, total = 0;
    sections.forEach(sec => {
      const c = attendMatrix[studentId]?.[sec.id];
      if (c) { present += c.present; total += c.total; }
    });
    return total > 0 ? (present / total) * 100 : 0;
  }

  function overallActivityResult(studentId: string): "ผ" | "มผ" {
    const activities = sections.filter(s => isActivitySubject(s.subject_code));
    if (activities.length === 0) return "ผ";
    const anyFail = activities.some(sec => activityResult(attendMatrix[studentId]?.[sec.id]) === "มผ");
    return anyFail ? "มผ" : "ผ";
  }

  return (
    <div className="font-['TH_Sarabun_New',_sans-serif]">
      {/* ★ รวมแถวปุ่มพิมพ์ + ปุ่มเลือกนักเรียนไว้บรรทัดเดียวกัน ลดพื้นที่ว่างด้านบน */}
      <div className="flex items-start justify-between gap-3 mb-2 print:hidden">
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setSelectedStudentId(null)}
            className={`px-3 py-1.5 rounded-lg text-base font-black ${!selectedStudentId ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
            ทั้งห้อง
          </button>
          {students.map(s => (
            <button key={s.id} onClick={() => setSelectedStudentId(s.id)}
              title={`${s.prefix ?? ""}${s.first_name} ${s.last_name}`}
              className={`w-9 h-9 rounded-lg text-base font-black ${selectedStudentId === s.id ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
              {s.seat_number}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()} className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-base">
          {selectedStudentId ? "🖨️ พิมพ์" : "🖨️ พิมพ์ทั้งห้อง"}
        </button>
      </div>

      {visibleStudents.map(s => {
        const { gpa, avgPercent } = calcGpaAndAvgPercent(s.id);
        const attendPct = attendancePercentFor(s.id);
        const overall = overallScores[s.id];
        const credits = creditSummary(s.id);
        const roomRank = classroomRanking[s.id] ?? "-";
        const roomParts = parseRoomName(classroomLabel);

        return (
          <div key={s.id} className="vp4-page bg-white p-8 mb-6 print:mb-0 print:break-after-page border border-slate-100 print:border-0 text-xl">
            <div className="text-center mb-2">
              <img src="/school-logo.png" alt="ตราโรงเรียน" className="h-24 w-24 mx-auto mb-1 object-contain" />
              <p className="font-bold text-2xl">แบบรายงานประจำตัวนักเรียน</p>
              <p className="text-2xl">{schoolName} อำเภอ{districtName} จังหวัด{provinceName}</p>
            </div>

            <div className="text-center text-xl mb-3">
              {classroomLevel === "primary" ? (
                <span>ชั้นประถมศึกษาปีที่ {roomParts.grade} ปีการศึกษา {academicYear}</span>
              ) : (
                <span>ชั้นมัธยมศึกษาปีที่ {roomParts.grade} ปีการศึกษา {academicYear}</span>
              )}
            </div>

            {/* ★ ชื่อ / เลขประจำตัว / ห้อง / เลขที่ — ไม่มีเส้นใต้ */}
            <div className="flex flex-wrap items-baseline gap-4 text-xl mb-3 w-full print:mb-1">
              <InfoField label="ชื่อ" value={`${s.prefix ?? ""}${s.first_name} ${s.last_name}`} grow={3} />
              <InfoField label="เลขประจำตัว" value={s.student_code ?? "-"} grow={2} />
              <InfoField label="ห้อง" value={String(classroomLevel === "primary" ? roomParts.room : classroomLabel)} grow={1} />
              <InfoField label="เลขที่" value={String(s.seat_number)} grow={1} />
            </div>

            <table className="w-full border-collapse text-xl vp4-table table-fixed">
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="border">
                  <th className="border px-2 py-1 font-black" rowSpan={2}>รหัสวิชา</th>
                  <th className="border px-2 py-1 font-black" rowSpan={2}>รายวิชา</th>
                  <th className="border px-2 py-1 font-black" rowSpan={2}>ประเภท</th>
                  <th className="border px-2 py-1 font-black" rowSpan={2}>{classroomLevel === "primary" ? "ชั่วโมง" : "หน่วยกิต"}</th>
                  <th className="border px-2 py-1 font-black" colSpan={2}>การประเมินผลสัมฤทธิ์</th>
                  <th className="border px-2 py-1 font-black" rowSpan={2}>คุณลักษณะ</th>
                  <th className="border px-2 py-1 font-black" rowSpan={2}>อ่านคิด<br/>วิเคราะห์เขียน</th>
                  <th className="border px-2 py-1 font-black" rowSpan={2}>หมายเหตุ</th>
                </tr>
                <tr className="border text-xl text-slate-500">
                  <th className="border px-2 py-1 font-black">{isPrimarySemester1 ? "คะแนนเต็ม" : "คะแนน"}</th>
                  <th className="border px-2 py-1 font-black">{isPrimarySemester1 ? "คะแนนที่ได้" : "ผลการเรียน"}</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map(row => {
                  if (row.kind === "group") {
                    const combined = groupCombinedScore(gradeMatrix, s.id, row.members);
                    const unitSum = row.members.reduce((sum, m) => {
                      const v = classroomLevel === "primary" ? m.hours_per_year : m.credit_hours;
                      return sum + (v ?? 0);
                    }, 0);
                    const groupFullScore = row.members.reduce((sum, m) => {
                      return sum + (gradeMatrix[s.id]?.[m.id]?.totalMax ?? 0);
                    }, 0);
                    return (
                      <tr key={row.groupCode} className="border">
                        <td className="border px-2 py-1 text-center">{row.code}</td>
                        <td className="border px-2 py-1 break-words">{row.name}</td>
                        <td className="border px-2 py-1 text-center">พื้นฐาน</td>
                        <td className="border px-2 py-1 text-center">{unitSum || "-"}</td>
                        <td className="border px-2 py-1 text-center font-black text-black">
                          {isPrimarySemester1 ? (groupFullScore || "-") : (combined ?? "-")}
                        </td>
                        <td className="border px-2 py-1 text-center font-black text-black">
                          {isPrimarySemester1 ? (combined ?? "-") : "-"}
                        </td>
                        <td className="border px-2 py-1 text-center">{overall?.characteristic ?? "-"}</td>
                        <td className="border px-2 py-1 text-center">{overall?.readThinkWrite ?? "-"}</td>
                        <td className="border px-2 py-1"></td>
                      </tr>
                    );
                  }

                  const sec = row.section;
                  const cell = gradeMatrix[s.id]?.[sec.id];
                  const isActivity = isActivitySubject(sec.subject_code);
                  const unitValue = classroomLevel === "primary" ? sec.hours_per_year : sec.credit_hours;
                  return (
                    <tr key={sec.id} className="border">
                      <td className="border px-2 py-1 text-center">{sec.subject_code}</td>
                      <td className="border px-2 py-1 break-words">{sec.subject_name}</td>
                      <td className="border px-2 py-1 text-center">{subjectTypeLabel(sec)}</td>
                      <td className="border px-2 py-1 text-center">{isActivity ? "-" : (unitValue ?? "-")}</td>
                      <td className="border px-2 py-1 text-center font-black text-black">
                        {isActivity
                          ? "-"
                          : isPrimarySemester1
                            ? (cell?.totalMax ?? "-")
                            : (cell?.percentage != null ? Math.round(cell.percentage) : "-")}
                      </td>
                      <td className="border px-2 py-1 text-center font-black text-black">
                        {isActivity
                          ? activityResult(attendMatrix[s.id]?.[sec.id])
                          : isPrimarySemester1
                            ? (cell?.grandTotal ?? "-")
                            : (cell?.grade ?? "-")}
                      </td>
                      <td className="border px-2 py-1 text-center">{overall?.characteristic ?? "-"}</td>
                      <td className="border px-2 py-1 text-center">{overall?.readThinkWrite ?? "-"}</td>
                      <td className="border px-2 py-1"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {classroomLevel === "primary" ? (
              isPrimarySemester1 ? null : (
                // ★ คะแนนเฉลี่ยขึ้นบรรทัดใหม่ (เดิมอยู่บรรทัดเดียวกัน)
                <div className="flex flex-col gap-1 text-xl mt-3">
                  <span>ระดับผลการเรียนเฉลี่ย {gpa}</span>
                  <span>คะแนนเฉลี่ยร้อยละ {avgPercent}</span>
                </div>
              )
            ) : (
              <div className="mt-4 flex flex-col sm:flex-row gap-6 text-xl">
                <table className="border-collapse text-xl flex-1 vp4-table">
                  <thead>
                    <tr>
                      <th className="border p-1 text-left font-black" colSpan={1}>สรุปผลการประเมิน</th>
                      <th className="border p-1 font-black">ที่เรียน</th>
                      <th className="border p-1 font-black">ที่ได้</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-1">จำนวนหน่วยกิต/น้ำหนักวิชาพื้นฐาน</td><td className="border p-1 text-center">{credits.basicPlanned.toFixed(1)}</td><td className="border p-1 text-center">{credits.basicEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1">จำนวนหน่วยกิต/น้ำหนักวิชาเพิ่มเติม</td><td className="border p-1 text-center">{credits.addPlanned.toFixed(1)}</td><td className="border p-1 text-center">{credits.addEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1 font-bold">รวมจำนวนหน่วยกิต/น้ำหนัก</td><td className="border p-1 text-center font-bold">{credits.totalPlanned.toFixed(1)}</td><td className="border p-1 text-center font-bold">{credits.totalEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ระดับผลการเรียนเฉลี่ย (GPA)</td><td className="border p-1 text-center">{gpa}</td></tr>
                    <tr>
                      <td className="border p-1" colSpan={2}>ลำดับที่ในห้องเรียน/ในชั้นเรียน</td>
                      <td className="border p-1 text-center">{roomRank}/-</td>
                    </tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินคุณลักษณะอันพึงประสงค์</td><td className="border p-1 text-center">{characteristicLabel(overall?.characteristic ?? "-")}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน</td><td className="border p-1 text-center">{characteristicLabel(overall?.readThinkWrite ?? "-")}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินกิจกรรมพัฒนาผู้เรียน</td><td className="border p-1 text-center">{overallActivityResult(s.id)} = {overallActivityResult(s.id) === "ผ" ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ★ เว้นช่องว่างก่อนลงชื่อครูที่ปรึกษา (4 บรรทัด) */}
            <div className="h-8 print:h-6"></div>
            <div className="h-8 print:h-6"></div>
            <div className="h-8 print:h-6"></div>
            <div className="h-8 print:h-6"></div>

            {/* ★ ลายเซ็นครูที่ปรึกษา (และผู้ปกครอง สำหรับมัธยม) — "ลงชื่อ" ชิดซ้ายตรงกันทุกช่อง เส้นใต้ยาวเท่ากันทั้ง 4 ช่อง มีช่องว่างตรงกลางก่อน "ลงชื่อ" ถัดไป */}
            {(() => {
              // ★ คำนวณความกว้างเส้นใต้ลายเซ็นให้เท่ากันทั้ง 4 ช่อง โดยใช้ความกว้างของชื่อที่ยาวที่สุดเป็นเกณฑ์
              const advisorCombinedName =
                classroomLevel === "primary"
                  ? null
                  : `${formatFullName(resolvedAdvisors[0])}${resolvedAdvisors[1] ? " / " + formatFullName(resolvedAdvisors[1]) : ""}`;
              const allSignatureNames = classroomLevel === "primary"
                ? [formatFullName(resolvedAdvisors[0]), formatFullName(resolvedAdvisors[1]), directorName, ""]
                : [advisorCombinedName ?? "", directorName, ""];
              const signatureLineWidthPx = Math.max(
                140,
                ...allSignatureNames.map(n => estimateTextWidthPx(n ?? ""))
              );

              return (
                <>
                  <div className={`grid ${classroomLevel === "primary" ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"} signature-grid text-xl`}>
                    {classroomLevel === "primary" ? (
                      <>
                        <SignatureField role="ครูที่ปรึกษา" nameLabel={formatFullName(resolvedAdvisors[0])} lineWidthPx={signatureLineWidthPx} />
                        <SignatureField role="ครูที่ปรึกษา" nameLabel={formatFullName(resolvedAdvisors[1])} lineWidthPx={signatureLineWidthPx} />
                      </>
                    ) : (
                      <div className="sm:col-span-2">
                        <SignatureField
                          role="ครูที่ปรึกษา"
                          nameLabel={advisorCombinedName ?? undefined}
                          lineWidthPx={signatureLineWidthPx}
                        />
                      </div>
                    )}
                  </div>

                  {/* ★ เว้นก่อนลายเซ็นผู้อำนวยการ (3 บรรทัด) */}
                  <div className="h-8 print:h-6"></div>
                  <div className="h-8 print:h-6"></div>
                  <div className="h-8 print:h-6"></div>

                  {/* ★ ลงชื่อ ผอ. และผู้ปกครอง ย้ายไปด้านขวา (ตรงตำแหน่งครูคนที่ 2) เรียงซ้อนกันตามแนวตั้ง */}
                  <div className="grid grid-cols-2 signature-grid text-xl">
                    <div></div>
                    <div className="flex flex-col gap-8 print:gap-4">
                      <SignatureField
                        role={classroomLevel === "primary" ? "ผู้อำนวยการโรงเรียน" : "ผู้บริหารสถานศึกษา"}
                        nameLabel={directorName}
                        lineWidthPx={signatureLineWidthPx}
                      />
                      <SignatureField role="ผู้ปกครอง" lineWidthPx={signatureLineWidthPx} />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        );
      })}

      <style jsx global>{`
        .signature-grid {
          gap: 7rem;
        }
        @media print {
          @page { size: A4; margin: 8mm; }
          .vp4-page {
            page-break-after: always;
            page-break-inside: avoid;
            font-size: 14px;
            padding: 4mm !important;
            margin-bottom: 0 !important;
          }
          .vp4-page:last-child { page-break-after: auto; }
          .vp4-page img { height: 60px !important; width: 60px !important; margin-bottom: 2px !important; }
          .vp4-page .mb-3 { margin-bottom: 4px !important; }
          .vp4-page .mb-2 { margin-bottom: 2px !important; }
          .vp4-page .mt-3 { margin-top: 4px !important; }
          .vp4-page .mt-4 { margin-top: 6px !important; }
          .vp4-page .mt-8 { margin-top: 8px !important; }
          .vp4-page .h-8 { height: 10px !important; }
          .vp4-page .gap-6 { gap: 10px !important; }
          .vp4-page .signature-grid { gap: 60px !important; }
          .vp4-table { table-layout: fixed; width: 100%; }
          .vp4-table th, .vp4-table td { font-size: 13px; padding: 2px 4px; line-height: 1.25; }
          .vp4-table th { font-weight: 900; }
        }
      `}</style>
    </div>
  );
}