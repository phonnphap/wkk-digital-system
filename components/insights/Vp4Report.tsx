"use client";

import { useEffect, useState } from "react";

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

// ลำดับวิชา: พื้นฐาน (ท/ค/ว/ส/พ/ศ/ง/อ) -> เพิ่มเติม -> กิจกรรม
const SUBJECT_LETTER_ORDER = ["ท", "ค", "ว", "ส", "พ", "ศ", "ง", "อ"];
function subjectTypeRank(sec: SectionInfo): number {
  if (isActivitySubject(sec.subject_code)) return 2;
  return sec.subject_type === "basic" ? 0 : 1;
}
function subjectLetterRank(code: string): number {
  const idx = SUBJECT_LETTER_ORDER.indexOf((code ?? "").charAt(0));
  return idx === -1 ? SUBJECT_LETTER_ORDER.length : idx;
}
function compareSections(a: SectionInfo, b: SectionInfo): number {
  const r = subjectTypeRank(a) - subjectTypeRank(b);
  if (r !== 0) return r;
  const l = subjectLetterRank(a.subject_code) - subjectLetterRank(b.subject_code);
  if (l !== 0) return l;
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
  return applyRounding(combined, members[0]?.gradeRoundingMode ?? "truncate");
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

function isFirstSemester(semester?: string): boolean {
  if (!semester) return false;
  const s = semester.trim();
  if (s === "1") return true;
  return /1/.test(s) && !/2/.test(s);
}

function formatThaiDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

const SIGNATURE_LINE_WIDTH_PX = 260;
function estimateTextWidthPx(text: string, pxPerChar = 13, basePadding = 24): number {
  return (text ?? "").length * pxPerChar + basePadding;
}

function InfoField({ label, value, grow = 1 }: { label: string; value: string; grow?: number }) {
  return (
    <div className="flex items-baseline" style={{ flexGrow: grow, flexBasis: 0, minWidth: "fit-content" }}>
      <span className="whitespace-nowrap">{label}</span>
      <span className="flex-1 text-center mx-2 px-1 whitespace-nowrap overflow-hidden text-ellipsis">{value}</span>
    </div>
  );
}

function SignatureField({ role, nameLabel, lineWidthPx }: { role: string; nameLabel?: string; lineWidthPx?: number }) {
  const w = lineWidthPx ?? SIGNATURE_LINE_WIDTH_PX;
  return (
    <div className="inline-flex items-baseline text-left signature-field">
      <span className="whitespace-nowrap">ลงชื่อ</span>
      <div className="flex flex-col items-center mx-1" style={{ width: `${w}px` }}>
        <span className="border-b-2 border-dotted border-gray-400 w-full text-center">&nbsp;</span>
        <span className="text-center whitespace-nowrap">{nameLabel ? `(${nameLabel})` : "\u00A0"}</span>
      </div>
      <span className="whitespace-nowrap">{role}</span>
    </div>
  );
}

// กล่อง "เวลาเรียน" ของแบบวัดผล 4 (pct = null แปลว่าไม่มีข้อมูล ไม่ติ๊กอะไร)
function AttendanceBox({ pct }: { pct: number | null }) {
  const level = pct === null ? -1 : pct >= 80 ? 0 : pct >= 60 ? 1 : 2;
  const items = [
    "ร้อยละ 80 ขึ้นไป (มีสิทธิ์สอบ)",
    "อยู่ระหว่างร้อยละ 60-79 (ไม่มีสิทธิ์สอบ)",
    "ต่ำกว่าร้อยละ 60 (ไม่มีสิทธิ์สอบ)",
  ];
  return (
    <div className="border p-3 text-xl inline-block">
      <p className="font-black mb-1">เวลาเรียน</p>
      {items.map((t, i) => (
        <p key={i}>{i === level ? "☑" : "☐"} {t}</p>
      ))}
    </div>
  );
}

const TH = "border px-2 py-1 font-black";
const TD = "border px-2 py-1";

export default function Vp4Report({
  classroomLevel,
  classroomLabel,
  academicYear,
  semester,
  docKind = "final",
  schoolName, districtName, provinceName,
  directorName,
  gradeHeadName = "",
  advisorNames,
  students,
  sections: sectionsProp,
  gradeMatrix,
  attendMatrix,
  groupNames = {},
  scoreDate,
  onBack,
}: {
  classroomLevel: "primary" | "secondary";
  classroomLabel: string;
  academicYear: string;
  semester?: string;
  docKind?: "final" | "midterm";   // midterm = แบบวัดผล 4 (มัธยมเท่านั้น)
  schoolName: string; districtName: string; provinceName: string;
  directorName: string;
  gradeHeadName?: string;
  advisorNames: AdvisorInfo[];
  students: Student[];
  sections: SectionInfo[];
  gradeMatrix: Record<string, Record<string, GradeCell>>;
  attendMatrix: Record<string, Record<string, AttendCell>>;
  groupNames?: Record<string, string>;
  scoreDate?: string;               // วันที่ของคะแนน (ใช้ในหมายเหตุแบบวัดผล 4)
  onBack: () => void;
}) {
  const EXCLUDED_SUBJECT_CODES = ["ส21101"];
  const sections = sectionsProp.filter(sec => !EXCLUDED_SUBJECT_CODES.includes(sec.subject_code));

  const isPrimary = classroomLevel === "primary";
  const sem1 = isFirstSemester(semester);
  const mode: "midterm" | "primary1" | "primary2" | "secondary" =
    !isPrimary && docKind === "midterm" ? "midterm" : isPrimary ? (sem1 ? "primary1" : "primary2") : "secondary";
  const showRemark = mode !== "primary2";

  const COL_WIDTHS: Record<typeof mode, string[]> = {
    midterm:   ["8%", "32%", "11%", "9%", "12%", "12%", "16%"],
    primary1:  ["7%", "26%", "9%", "7%", "8%", "9%", "11%", "13%", "10%"],
    primary2:  ["8%", "28%", "10%", "8%", "10%", "10%", "13%", "13%"],
    secondary: ["7%", "24%", "9%", "7%", "7%", "7%", "6%", "10%", "12%", "11%"],
  };

  const [overallScores, setOverallScores] = useState<Record<string, { characteristic: string; readThinkWrite: string }>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // ===== เพิ่มใหม่: วันที่คะแนนของแบบวัดผล 4 =====
const scoreDateKey = `vp4-scoredate-${academicYear}-${semester ?? ""}`;
const [scoreDateLocal, setScoreDateLocal] = useState<string>(
  scoreDate ?? new Date().toISOString().slice(0, 10)
);

// จำค่าที่ตั้งไว้ในเครื่อง (ถ้าไม่ได้ส่ง scoreDate มาจากหน้าแม่)
useEffect(() => {
  if (scoreDate) { setScoreDateLocal(scoreDate); return; }
  try {
    const saved = localStorage.getItem(scoreDateKey);
    if (saved) setScoreDateLocal(saved);
  } catch {}
}, [scoreDate, scoreDateKey]);

function handleScoreDateChange(v: string) {
  setScoreDateLocal(v);
  try { localStorage.setItem(scoreDateKey, v); } catch {}
}

  useEffect(() => {
    const results: Record<string, { characteristic: string; readThinkWrite: string }> = {};
    students.forEach(s => { results[s.id] = { characteristic: "-", readThinkWrite: "-" }; });
    setOverallScores(results);
  }, [classroomLevel, students]);

  const advisors = advisorNames;

  function subjectTypeLabel(sec: SectionInfo): string {
    if (isActivitySubject(sec.subject_code)) return "กิจกรรม";
    if (sec.subject_type === "basic") return "พื้นฐาน";
    if (sec.subject_type === "additional") return "เพิ่มเติม";
    return "-";
  }

  const sortedSections = [...sections].sort(compareSections);
  const reportRows = buildReportRows(sortedSections, groupNames);
  // แบบวัดผล 4: แยกทีละวิชา ไม่รวมกลุ่ม ไม่มีกิจกรรม
  const midtermSections = sortedSections.filter(s => !isActivitySubject(s.subject_code));

  const visibleStudents = selectedStudentId ? students.filter(s => s.id === selectedStudentId) : students;

  function creditSummary(studentId: string) {
    let basicPlanned = 0, basicEarned = 0, addPlanned = 0, addEarned = 0;
    sections.forEach(sec => {
      if (isActivitySubject(sec.subject_code)) return;
      const credit = sec.credit_hours ?? 0;
      const cell = gradeMatrix[studentId]?.[sec.id];
      const passed = cell ? parseFloat(cell.grade) > 0 : false;
      if (sec.subject_type === "basic") { basicPlanned += credit; if (passed) basicEarned += credit; }
      else { addPlanned += credit; if (passed) addEarned += credit; }
    });
    return {
      basicPlanned, basicEarned, addPlanned, addEarned,
      totalPlanned: basicPlanned + addPlanned, totalEarned: basicEarned + addEarned,
    };
  }

  function calcGpaAndAvgPercent(studentId: string) {
    let weightedGradeSum = 0, creditSum = 0, totalPercentSum = 0, subjectCount = 0;
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

  function attendancePercentFor(studentId: string): number | null {
    let present = 0, total = 0;
    sections.forEach(sec => {
      const c = attendMatrix[studentId]?.[sec.id];
      if (c) { present += c.present; total += c.total; }
    });
    return total > 0 ? (present / total) * 100 : null;
  }

  function overallActivityResult(studentId: string): "ผ" | "มผ" {
    const activities = sections.filter(s => isActivitySubject(s.subject_code));
    if (activities.length === 0) return "ผ";
    return activities.some(sec => activityResult(attendMatrix[studentId]?.[sec.id]) === "มผ") ? "มผ" : "ผ";
  }

  // ความกว้างเส้นลายเซ็น (เท่ากันทุกช่อง)
  const advisorCombinedName = `${formatFullName(advisors[0])}${advisors[1] ? " / " + formatFullName(advisors[1]) : ""}`;
  const signatureLineWidthPx = Math.max(
    SIGNATURE_LINE_WIDTH_PX,
    ...[formatFullName(advisors[0]), formatFullName(advisors[1]), advisorCombinedName, directorName, gradeHeadName]
      .map(n => estimateTextWidthPx(n ?? ""))
  );

  return (
    <div className="vp4-root font-['TH_Sarabun_New',_sans-serif]">
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
        const gradeLabel = `${isPrimary ? "ประถมศึกษาปีที่" : "มัธยมศึกษาปีที่"} ${roomParts.grade}`;

        return (
          <div key={s.id} className="vp4-page relative bg-white p-8 mb-6 print:mb-0 print:break-after-page border border-slate-100 print:border-0 text-xl">
            {mode === "midterm" && (
  <label className="flex items-center gap-2 text-base font-black">
    วันที่คะแนน
    <input
      type="date"
      value={scoreDateLocal}
      onChange={e => setScoreDateLocal(e.target.value)}
      className="border rounded-lg px-2 py-1"
    />
  </label>
)}

            <div className="text-center mb-2">
              <img src="/school-logo.png" alt="ตราโรงเรียน" className="h-24 w-24 mx-auto mb-1 object-contain" />
              <p className="font-bold text-2xl">
                {mode === "midterm" ? "แบบรายงานคะแนนระหว่างเรียนและเวลาเรียนประจำตัวนักเรียน" : "แบบรายงานประจำตัวนักเรียน"}
              </p>
              <p className="text-2xl">{schoolName} อำเภอ{districtName} จังหวัด{provinceName}</p>
            </div>

            <div className="text-center text-xl mb-3">
              {mode === "midterm"
                ? <span>ชั้นมัธยมศึกษาปีที่ {roomParts.grade} ภาคเรียนที่ {semester ?? "-"} ปีการศึกษา {academicYear}</span>
                : <span>ชั้น{gradeLabel} ปีการศึกษา {academicYear}</span>}
            </div>

            <div className="flex flex-wrap items-baseline gap-4 text-xl mb-3 w-full print:mb-1">
              <InfoField label="ชื่อ" value={`${s.prefix ?? ""}${s.first_name} ${s.last_name}`} grow={3} />
              <InfoField label="เลขประจำตัว" value={s.student_code ?? "-"} grow={2} />
              <InfoField label="ห้อง" value={roomParts.room} grow={1} />
              <InfoField label="เลขที่" value={String(s.seat_number)} grow={1} />
            </div>

            <table className="w-full border-collapse text-xl vp4-table table-fixed">
              <colgroup>
                {COL_WIDTHS[mode].map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                {mode === "midterm" ? (
                  <>
                    <tr className="border">
                      <th className={TH} rowSpan={2}>รหัสวิชา</th>
                      <th className={TH} rowSpan={2}>รายวิชา</th>
                      <th className={TH} rowSpan={2}>ประเภท</th>
                      <th className={TH} rowSpan={2}>หน่วยกิต</th>
                      <th className={TH} colSpan={2}>คะแนนระหว่างเรียน</th>
                      <th className={TH} rowSpan={2}>หมายเหตุ</th>
                    </tr>
                    <tr className="border text-slate-500">
                      <th className={TH}>คะแนนเต็ม</th>
                      <th className={TH}>คะแนนที่ได้</th>
                    </tr>
                  </>
                ) : mode === "secondary" ? (
                  <>
                    <tr className="border">
                      <th className={TH} rowSpan={2}>รหัสวิชา</th>
                      <th className={TH} rowSpan={2}>รายวิชา</th>
                      <th className={TH} rowSpan={2}>ประเภท</th>
                      <th className={TH} rowSpan={2}>หน่วยกิต</th>
                      <th className={TH} colSpan={3}>การประเมินผลสัมฤทธิ์</th>
                      <th className={TH} rowSpan={2}>คุณลักษณะ</th>
                      <th className={TH} rowSpan={2}>อ่านคิด<br />วิเคราะห์เขียน</th>
                      <th className={TH} rowSpan={2}>หมายเหตุ</th>
                    </tr>
                    <tr className="border text-slate-500">
                      <th className={TH}>คะแนน</th>
                      <th className={TH}>สอบปกติ</th>
                      <th className={TH}>แก้ตัว</th>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr className="border">
                      <th className={TH} rowSpan={2}>รหัสวิชา</th>
                      <th className={TH} rowSpan={2}>รายวิชา</th>
                      <th className={TH} rowSpan={2}>ประเภท</th>
                      <th className={TH} rowSpan={2}>ชั่วโมง</th>
                      <th className={TH} colSpan={2}>การประเมินผลสัมฤทธิ์</th>
                      <th className={TH} rowSpan={2}>{mode === "primary2" ? "คุณลักษณะอันพึงประสงค์" : "คุณลักษณะ"}</th>
                      <th className={TH} rowSpan={2}>อ่านคิด<br />วิเคราะห์เขียน</th>
                      {showRemark && <th className={TH} rowSpan={2}>หมายเหตุ</th>}
                    </tr>
                    <tr className="border text-slate-500">
                      <th className={TH}>{mode === "primary1" ? "คะแนนเต็ม" : "คะแนนที่ได้"}</th>
                      <th className={TH}>{mode === "primary1" ? "คะแนนที่ได้" : "ผลการเรียน"}</th>
                    </tr>
                  </>
                )}
              </thead>
              <tbody>
                {mode === "midterm" ? (
                  midtermSections.map((sec, idx) => {
                    const cell = gradeMatrix[s.id]?.[sec.id];
                    return (
                      <tr key={sec.id} className="border">
                        <td className={`${TD} text-center`}>{sec.subject_code}</td>
                        <td className={`${TD} break-words`}>{sec.subject_name}</td>
                        <td className={`${TD} text-center`}>{subjectTypeLabel(sec)}</td>
                        <td className={`${TD} text-center`}>{sec.credit_hours ?? "-"}</td>
                        <td className={`${TD} text-center font-black text-black`}>{cell?.totalMax ?? "-"}</td>
                        <td className={`${TD} text-center font-black text-black`}>{cell?.grandTotal ?? "-"}</td>
                        {idx === 0 && (
                          <td className={`${TD} align-top text-center text-red-600 text-base`} rowSpan={midtermSections.length}>
                            *คะแนนที่ได้เป็นคะแนน ณ วันที่ {formatThaiDate(scoreDateLocal)}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  reportRows.map(row => {
                    if (row.kind === "group") {
                      const combined = groupCombinedScore(gradeMatrix, s.id, row.members);
                      const unitSum = row.members.reduce((sum, m) => sum + ((isPrimary ? m.hours_per_year : m.credit_hours) ?? 0), 0);
                      const groupFullScore = row.members.reduce((sum, m) => sum + (gradeMatrix[s.id]?.[m.id]?.totalMax ?? 0), 0);
                      return (
                        <tr key={row.groupCode} className="border">
                          <td className={`${TD} text-center`}>{row.code}</td>
                          <td className={`${TD} break-words`}>{row.name}</td>
                          <td className={`${TD} text-center`}>พื้นฐาน</td>
                          <td className={`${TD} text-center`}>{unitSum || "-"}</td>
                          <td className={`${TD} text-center font-black text-black`}>
                            {mode === "primary1" ? (groupFullScore || "-") : (combined ?? "-")}
                          </td>
                          <td className={`${TD} text-center font-black text-black`}>
                            {mode === "primary1" ? (combined ?? "-") : "-"}
                          </td>
                          {mode === "secondary" && <td className={TD}></td>}
                          <td className={`${TD} text-center`}>{overall?.characteristic ?? "-"}</td>
                          <td className={`${TD} text-center`}>{overall?.readThinkWrite ?? "-"}</td>
                          {showRemark && <td className={TD}></td>}
                        </tr>
                      );
                    }

                    const sec = row.section;
                    const cell = gradeMatrix[s.id]?.[sec.id];
                    const isActivity = isActivitySubject(sec.subject_code);
                    const unitValue = isPrimary ? sec.hours_per_year : sec.credit_hours;
                    return (
                      <tr key={sec.id} className="border">
                        <td className={`${TD} text-center`}>{sec.subject_code}</td>
                        <td className={`${TD} break-words`}>{sec.subject_name}</td>
                        <td className={`${TD} text-center`}>{subjectTypeLabel(sec)}</td>
                        <td className={`${TD} text-center`}>{isActivity ? "-" : (unitValue ?? "-")}</td>
                        <td className={`${TD} text-center font-black text-black`}>
                          {isActivity ? "-" : mode === "primary1" ? (cell?.totalMax ?? "-") : (cell?.percentage != null ? Math.round(cell.percentage) : "-")}
                        </td>
                        <td className={`${TD} text-center font-black text-black`}>
                          {isActivity ? activityResult(attendMatrix[s.id]?.[sec.id]) : mode === "primary1" ? (cell?.grandTotal ?? "-") : (cell?.grade ?? "-")}
                        </td>
                        {mode === "secondary" && <td className={TD}></td>}
                        <td className={`${TD} text-center`}>{overall?.characteristic ?? "-"}</td>
                        <td className={`${TD} text-center`}>{overall?.readThinkWrite ?? "-"}</td>
                        {showRemark && <td className={TD}></td>}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* ส่วนสรุปใต้ตาราง */}
            {mode === "primary2" && (
              <div className="flex flex-col gap-1 text-xl mt-3">
                <span>ระดับผลการเรียนเฉลี่ย {gpa}</span>
                <span>คะแนนรวมเฉลี่ยร้อยละ {avgPercent}</span>
              </div>
            )}
            {mode === "secondary" && (
              <div className="mt-4 flex flex-col sm:flex-row gap-6 text-xl">
                <table className="border-collapse text-xl flex-1 vp4-table">
                  <thead>
                    <tr>
                      <th className="border p-1 text-left font-black">สรุปผลการประเมิน</th>
                      <th className="border p-1 font-black">ที่เรียน</th>
                      <th className="border p-1 font-black">ที่ได้</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-1">จำนวนหน่วยกิต/น้ำหนักวิชาพื้นฐาน</td><td className="border p-1 text-center">{credits.basicPlanned.toFixed(1)}</td><td className="border p-1 text-center">{credits.basicEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1">จำนวนหน่วยกิต/น้ำหนักวิชาเพิ่มเติม</td><td className="border p-1 text-center">{credits.addPlanned.toFixed(1)}</td><td className="border p-1 text-center">{credits.addEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1 font-bold">รวมจำนวนหน่วยกิต/น้ำหนัก</td><td className="border p-1 text-center font-bold">{credits.totalPlanned.toFixed(1)}</td><td className="border p-1 text-center font-bold">{credits.totalEarned.toFixed(1)}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ระดับผลการเรียนเฉลี่ย (GPA)</td><td className="border p-1 text-center">{gpa}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ลำดับที่ในห้องเรียน/ในชั้นเรียน</td><td className="border p-1 text-center">{roomRank}/-</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินคุณลักษณะอันพึงประสงค์</td><td className="border p-1 text-center">{characteristicLabel(overall?.characteristic ?? "-")}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน</td><td className="border p-1 text-center">{characteristicLabel(overall?.readThinkWrite ?? "-")}</td></tr>
                    <tr><td className="border p-1" colSpan={2}>ผลการประเมินกิจกรรมพัฒนาผู้เรียน</td><td className="border p-1 text-center">{overallActivityResult(s.id)} = {overallActivityResult(s.id) === "ผ" ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="h-8 print:h-6"></div>
            <div className="h-8 print:h-6"></div>
            <div className="h-8 print:h-6"></div>

            {/* ลายเซ็น */}
            {mode === "midterm" ? (
              <>
                <div className="grid grid-cols-2 signature-grid text-xl">
                  <SignatureField role="ครูที่ปรึกษา" nameLabel={formatFullName(advisors[0])} lineWidthPx={signatureLineWidthPx} />
                  <SignatureField role="ครูที่ปรึกษา" nameLabel={formatFullName(advisors[1])} lineWidthPx={signatureLineWidthPx} />
                </div>
                <div className="h-8 print:h-6"></div>
                <div className="grid grid-cols-2 signature-grid text-xl items-start">
                  <div><AttendanceBox pct={attendPct} /></div>
                  <div className="flex flex-col gap-8 print:gap-4">
                    <SignatureField role="หัวหน้าสายชั้น" nameLabel={gradeHeadName || undefined} lineWidthPx={signatureLineWidthPx} />
                    <SignatureField role="ผู้อำนวยการโรงเรียนวัดเขียนเขต" nameLabel={directorName} lineWidthPx={signatureLineWidthPx} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={`grid ${isPrimary ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"} signature-grid text-xl`}>
                  {isPrimary ? (
                    <>
                      <SignatureField role="ครูที่ปรึกษา" nameLabel={formatFullName(advisors[0])} lineWidthPx={signatureLineWidthPx} />
                      <SignatureField role="ครูที่ปรึกษา" nameLabel={formatFullName(advisors[1])} lineWidthPx={signatureLineWidthPx} />
                    </>
                  ) : (
                    <div className="sm:col-span-2">
                      <SignatureField role="ครูที่ปรึกษา" nameLabel={advisorCombinedName} lineWidthPx={signatureLineWidthPx} />
                    </div>
                  )}
                </div>
                <div className="h-8 print:h-6"></div>
                <div className="h-8 print:h-6"></div>
                <div className="h-8 print:h-6"></div>
                <div className="grid grid-cols-2 signature-grid text-xl">
                  <div></div>
                  <div className="flex flex-col gap-8 print:gap-4">
                    <SignatureField
                      role={isPrimary ? "ผู้อำนวยการโรงเรียน" : "ผู้บริหารสถานศึกษา"}
                      nameLabel={directorName}
                      lineWidthPx={signatureLineWidthPx}
                    />
                    <div className="h-8 print:h-6"></div>
                    <SignatureField role="ผู้ปกครอง" nameLabel="(...........................................................)" lineWidthPx={signatureLineWidthPx} />
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      <style jsx global>{`
  .signature-grid { gap: 7rem; }
  @media print {
    @page { size: A4 portrait; margin: 8mm; }

    html, body {
      background: #fff !important;
      height: auto !important;
      overflow: visible !important;
    }

    /* ซ่อนทุกอย่าง (sidebar/header ของระบบ) แล้วโชว์เฉพาะใบเกรด */
    body * { visibility: hidden !important; }
    .vp4-root, .vp4-root * { visibility: visible !important; }
    .vp4-root {
      position: absolute !important;
      left: 0; top: 0;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .vp4-page {
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      font-size: 14px;
      padding: 4mm !important;
      margin: 0 !important;
      width: 100% !important;
      max-width: none !important;
      box-shadow: none !important;
      border: 0 !important;
    }
    .vp4-page:last-child { page-break-after: auto; break-after: auto; }
    .vp4-page img { height: 60px !important; width: 60px !important; margin-bottom: 2px !important; }
    .vp4-page .mb-3 { margin-bottom: 4px !important; }
    .vp4-page .mb-2 { margin-bottom: 2px !important; }
    .vp4-page .mt-3 { margin-top: 4px !important; }
    .vp4-page .mt-4 { margin-top: 6px !important; }
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