"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   วผ.9 — แบบสรุปจำนวนนักเรียนชั้น ... ที่ติด 0, ร, มส (ระดับ "ห้องเรียน")
   • รวบรวมจาก vp8_fail_records ของทุกรายวิชา (subject_sections) ในห้องนี้ — อ่านอย่างเดียว
     ครูประจำวิชากรอกที่ วผ.8 → ครูประจำชั้นเปิด วผ.9 เพื่อพิมพ์สรุปทั้งห้อง
   • แยก 3 รอบ: ประกาศผลสอบ / สอบซ่อมครั้งที่ 1 / สอบซ่อมครั้งที่ 2 (พิมพ์แยกใบ)
   • หัวคอลัมน์รายวิชา = "รหัสวิชา ชื่อวิชา" หมุนขวา 90° (writing-mode: vertical-rl)
   • มี 2 มุมมองหนังสือแจ้งผู้ปกครอง (พิมพ์ได้ทั้งห้อง หรือเลือกรายคน)
       1) ผ่านทุกรายวิชา (ไม่ติดอะไรเลยในทุกรอบ)
       2) ติด 0 / ร / มส — แจ้งรายวิชาที่ติดเป็นรายบุคคล แยกตามรอบ
   ========================================================================= */

type Student = {
  id: string; prefix?: string; first_name: string; last_name: string; seat_number: number;
  student_code?: string;
};

type RoundKey = "announce" | "retake1" | "retake2";
type FailResult = "0" | "ร" | "มส";
type SubjectKind = "basic" | "extra";
type Subject = { code: string; title: string; kind: SubjectKind };
// รอบ -> student_id -> รหัสวิชา -> ผล
type Matrix = Record<RoundKey, Record<string, Record<string, FailResult>>>;
type View = "sheet" | "pass" | "fail";
type RoundLetterCfg = { held: string; nextExam: string; nextAnnounce: string };

const ROUNDS: { key: RoundKey; label: string; next?: string }[] = [
  { key: "announce", label: "ประกาศผลสอบ", next: "สอบซ่อมครั้งที่ 1" },
  { key: "retake1", label: "สอบซ่อมครั้งที่ 1", next: "สอบซ่อมครั้งที่ 2" },
  { key: "retake2", label: "สอบซ่อมครั้งที่ 2" },
];
const RESULTS: FailResult[] = ["0", "ร", "มส"];
const MIN_ROWS = 5;

const emptyMatrix = (): Matrix => ({ announce: {}, retake1: {}, retake2: {} });

/* ===== ตั้งชื่อตาราง/คอลัมน์ที่นี่ที่เดียว (แก้ให้ตรงกับ Supabase จริง) ===== */
const DB = {
  sectionsTable: "subject_sections",
  sectionCodeCol: "subject_code",
  sectionRoomCol: "classroom_id",                                   // คอลัมน์ผูกห้องเรียน
  sectionSubjectIdCol: "subject_id",                                   // section → ตารางวิชา
  subjectsTable: "subjects",
  subjectCodeCols: ["subject_code", "code"],
  subjectTitleCols: ["name_th", "name", "title", "subject_name", "subject_title"],
  sectionTitleCols: ["subject_name", "subject_title", "title", "name"], // สำรอง ถ้า section มีชื่อวิชาเอง
  sectionTypeCols: ["subject_type", "course_type", "category"],        // (ถ้ามี) พื้นฐาน/เพิ่มเติม
  failTable: "vp8_fail_records",
  studentsTable: "students",
};

/* ===== helpers ===== */
const TH_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const thd = (v: string | number | null | undefined) => String(v ?? "").replace(/\d/g, d => TH_DIGITS[+d]);
const fill = (v: string | undefined, dots = "……………………") => (v && v.trim() ? thd(v) : dots);
const nameOf = (s: Student) => `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim();

function defaultTerm() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const be = d.getFullYear() + 543;
  if (m >= 5 && m <= 10) return { semester: "1", year: String(be) };
  if (m >= 11) return { semester: "2", year: String(be) };
  return { semester: "2", year: String(be - 1) };
}

function pickFirst(row: any, cols: string[]): string {
  for (const c of cols) if (row?.[c]) return String(row[c]).trim();
  return "";
}

// พื้นฐาน/เพิ่มเติม: คอลัมน์ประเภท → ชื่อวิชามี "เพิ่มเติม" → หลักที่ 3 ของรหัสวิชา (ท21101=พื้นฐาน, ท21201=เพิ่มเติม)
function classifyKind(sec: any, code: string, title: string): SubjectKind {
  for (const c of DB.sectionTypeCols) {
    const v = sec?.[c];
    if (v == null) continue;
    const s = String(v).toLowerCase();
    if (/เพิ่มเติม|extra|additional|elective/.test(s)) return "extra";
    if (/พื้นฐาน|basic|core/.test(s)) return "basic";
  }
  if (title.includes("เพิ่มเติม")) return "extra";
  const digits = code.replace(/\D/g, "");
  if (digits.length >= 5) return digits[2] === "2" ? "extra" : "basic";
  return "basic";
}

function dots(text: string | number | undefined | null, w = "min-w-[90px]") {
  return (
    <span className={`inline-block border-b border-dotted border-black px-1 text-center ${w}`}>
      {text || "\u00A0"}
    </span>
  );
}

/* =========================================================================
   เปลือกหนังสือราชการ (ใช้ร่วมกันทั้งหนังสือผ่าน/ไม่ผ่าน) — 1 ฉบับ = 1 หน้า A4
   ========================================================================= */
function LetterShell(p: {
  docNo: string; dateText: string; subject: string; to: string;
  garudaUrl: string; signatureUrl: string; schoolName: string; addressLines: string[]; phone: string; fax: string;
  principalName: string; principalTitle: string; children: ReactNode;
}) {
  const [garudaOk, setGarudaOk] = useState(true);
  const [sigOk, setSigOk] = useState(true);
  return (
    <div
      className="vp9-letter flex flex-col bg-white border border-slate-200 rounded-xl print:border-0 print:rounded-none"
      style={{
        width: "210mm", maxWidth: "100%", margin: "0 auto", padding: "12mm 25mm", minHeight: "270mm",
        fontFamily: '"TH SarabunIT๙","TH Sarabun New","THSarabunNew","Sarabun",sans-serif',
        fontSize: "16pt", lineHeight: 1.4, color: "#000",
      }}
    >
      {/* ตราครุฑกึ่งกลาง */}
      <div className="text-center" style={{ height: "28mm" }}>
        {garudaOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.garudaUrl} alt="" onError={() => setGarudaOk(false)} style={{ height: "28mm" }} className="mx-auto object-contain" />
        )}
      </div>

      {/* ที่ ... (ซ้าย) · ที่อยู่โรงเรียน (ขวา — ชิดขอบขวา ตามต้นแบบ) */}
      <div className="flex justify-between items-start" style={{ marginTop: "-4mm" }}>
        <p>ที่ {p.docNo}</p>
        <div className="whitespace-nowrap" style={{ width: "30%" }}>
          <p>{p.schoolName} &nbsp; สพฐ.</p>
          {p.addressLines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </div>

      {/* วันที่ — กึ่งกลางที่ราว 62% ของความกว้างเนื้อหา */}
      <p style={{ marginLeft: "24%", width: "76%", textAlign: "center", marginTop: "3mm" }}>{p.dateText}</p>

      <div className="space-y-1" style={{ marginTop: "5mm" }}>
        <div className="flex"><span style={{ width: "1.8cm" }} className="shrink-0">เรื่อง</span><span>{p.subject}</span></div>
        <div className="flex"><span style={{ width: "1.8cm" }} className="shrink-0">เรียน</span><span>{p.to}</span></div>
      </div>

      <div className="space-y-2" style={{ marginTop: "4mm" }}>{p.children}</div>

      {/* ขอแสดงความนับถือ + ลายเซ็น ผอ. */}
      <div className="text-center" style={{ marginTop: "10mm", marginLeft: "30%", width: "70%" }}>
        <p>ขอแสดงความนับถือ</p>
        <div style={{ height: "17mm" }} className="flex items-center justify-center">
          {sigOk && p.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.signatureUrl} alt="" onError={() => setSigOk(false)} style={{ maxHeight: "17mm" }} className="object-contain" />
          )}
        </div>
        <p>( {p.principalName} )</p>
        <p>{p.principalTitle}</p>
      </div>

      <div className="mt-auto pt-6" style={{ fontSize: "15pt" }}>
        <p>{p.schoolName}</p>
        <p>โทรศัพท์ {p.phone}</p>
        <p>โทรสาร {p.fax}</p>
      </div>
    </div>
  );
}

const indent = { textIndent: "2.5cm" } as const;

export default function Vp9Report({
  classroomId, sectionId, classroomLabel, students,
  semester, academicYearLabel,
  homeroomTeacherNames, levelHeadName,
  logoUrl = "/logo.png", garudaUrl = "/images.jpg", principalSignatureUrl = "",
  schoolName = "โรงเรียนวัดเขียนเขต",
  addressLines = ["ตำบลบึงยี่โถ  อำเภอธัญบุรี", "จังหวัดปทุมธานี  12130"],
  phone = "0-2533-1239", fax = "0-2533-1454",
  docNoPrefix = "ศธ.04087.029/",
  examScopeText = "ชั้นมัธยมศึกษาปีที่ 1-6",
  curriculumRevisionYear,
  principalName = "นายธนณัฐ  ศิระวงษ์", principalTitle = "ผู้อำนวยการโรงเรียนวัดเขียนเขต",
  onBack,
}: {
  classroomId?: string;                // ใช้ดึงทุกรายวิชา (subject_sections.classroom_id) ของห้องนี้
  sectionId?: string;                  // ถ้าไม่ส่ง classroomId จะหาห้องจาก section นี้ให้เอง
  classroomLabel: string;              // เช่น "ม.2/6"
  students: Student[];                 // นักเรียนทั้งห้อง
  semester?: number | string;
  academicYearLabel?: string;
  homeroomTeacherNames?: string[];     // ครูประจำชั้น (1–2 คน)
  levelHeadName?: string;              // หัวหน้าสายชั้น
  logoUrl?: string;
  garudaUrl?: string;                  // ตราครุฑสำหรับหนังสือราชการ
  principalSignatureUrl?: string;      // URL ลายเซ็น ผอ. (page.tsx ดึงจาก users ให้) แสดงในหนังสือแจ้งผู้ปกครอง
  schoolName?: string;
  addressLines?: string[];
  phone?: string;
  fax?: string;
  docNoPrefix?: string;
  examScopeText?: string;
  curriculumRevisionYear?: string;     // ปีของ "ฉบับปรับปรุง พ.ศ." ในหนังสือ (ไม่ส่ง = ใช้ปีการศึกษา ตามไฟล์ต้นแบบ)
  principalName?: string;
  principalTitle?: string;
  onBack: () => void;
}) {
  const term = useMemo(defaultTerm, []);
  const [view, setView] = useState<View>("sheet");
  const [round, setRound] = useState<RoundKey>("announce");
  const [semesterV, setSemesterV] = useState(String(semester ?? term.semester));
  const [yearV, setYearV] = useState(academicYearLabel ?? term.year);
  const [teacher1, setTeacher1] = useState(homeroomTeacherNames?.[0] ?? "");
  const [teacher2, setTeacher2] = useState(homeroomTeacherNames?.[1] ?? "");
  const [headName, setHeadName] = useState(levelHeadName ?? "");
  const [logoOk, setLogoOk] = useState(true);
  const [showAll, setShowAll] = useState(false); // แสดงนักเรียนทั้งห้องในตาราง

  useEffect(() => { setSemesterV(String(semester ?? term.semester)); }, [semester, term]);
  useEffect(() => { setYearV(academicYearLabel ?? term.year); }, [academicYearLabel, term]);
  const tKey = (homeroomTeacherNames ?? []).join("|");
  useEffect(() => {
    setTeacher1(homeroomTeacherNames?.[0] ?? "");
    setTeacher2(homeroomTeacherNames?.[1] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tKey]);
  useEffect(() => { if (levelHeadName) setHeadName(levelHeadName); }, [levelHeadName]);

  /* ----- โหลด section ของห้อง (+วิชา) และผล วผ.8 ทั้งหมด แล้วแยกตามเทอมในหน่วยความจำ ----- */
  const [rawSecs, setRawSecs] = useState<any[]>([]);
  const [rawRecs, setRawRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [termSel, setTermSel] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        let roomId = classroomId;
        if (!roomId && sectionId) {
          const cur = await supabase.from(DB.sectionsTable).select("*").eq("id", sectionId).maybeSingle();
          if (cur.error) throw cur.error;
          roomId = cur.data?.[DB.sectionRoomCol] ?? undefined;
        }
        if (!roomId) throw new Error("ไม่พบห้องเรียน (ส่ง classroomId หรือ sectionId)");
        // subjects(*) = ข้อมูลวิชา (รหัส/ชื่อ/ประเภท) ผ่าน subject_id เหมือนหน้า ปพ.5
        const secRes = await supabase.from(DB.sectionsTable).select(`*, ${DB.subjectsTable}(*)`).eq(DB.sectionRoomCol, roomId);
        if (secRes.error) throw secRes.error;
        const secs: any[] = secRes.data ?? [];
        let recs: any[] = [];
        if (secs.length > 0) {
          const recRes = await supabase.from(DB.failTable)
            .select("round, student_id, result, subject_section_id")
            .in("subject_section_id", secs.map(x => x.id));
          if (recRes.error) throw recRes.error;
          recs = recRes.data ?? [];
        }
        if (!active) return;
        setRawSecs(secs);
        setRawRecs(recs);
      } catch (e: any) {
        if (!active) return;
        setLoadError(e?.message ?? "unknown error");
        setRawSecs([]);
        setRawRecs([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [classroomId, sectionId, reloadKey]);

  const subjectOf = (sec: any) => {
    const j = sec?.[DB.subjectsTable];
    return Array.isArray(j) ? j[0] : j;
  };
  const codeOfSec = (sec: any): string =>
    String(sec?.[DB.sectionCodeCol] ?? "").trim() || pickFirst(subjectOf(sec), DB.subjectCodeCols);
  // เทอมของ section: คอลัมน์ semester/term ใน section → ใน subjects → เลขท้ายรหัสวิชา (คี่=1, คู่=2 เช่น ท21101/ท21102)
  const semesterOfSec = (sec: any): string => {
    for (const src of [sec, subjectOf(sec)]) {
      if (!src) continue;
      for (const [k, v] of Object.entries(src)) {
        if (/semester|(^|_)term(_|$)/i.test(k) && /^[12]$/.test(String(v))) return String(v);
      }
    }
    const last = codeOfSec(sec).replace(/\D/g, "").slice(-1);
    return last ? (Number(last) % 2 === 1 ? "1" : "2") : "";
  };

  const terms = useMemo(
    () => [...new Set(rawSecs.map(semesterOfSec).filter(Boolean))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawSecs]);
  useEffect(() => {
    if (terms.length === 0 || terms.includes(termSel)) return;
    const pref = String(semester ?? term.semester);
    setTermSel(terms.includes(pref) ? pref : terms[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms]);
  useEffect(() => { if (termSel) setSemesterV(termSel); }, [termSel]);

  const { subjects, matrix } = useMemo(() => {
    const secs = termSel && terms.length > 0 ? rawSecs.filter(x => semesterOfSec(x) === termSel) : rawSecs;
    const byCode = new Map<string, Subject>();
    const codeOfSection = new Map<string, string>();
    secs.forEach(sec => {
      const code = codeOfSec(sec);
      if (!code) return;
      codeOfSection.set(sec.id, code);
      if (!byCode.has(code)) {
        const subj = subjectOf(sec);
        const title = pickFirst(subj, DB.subjectTitleCols) || pickFirst(sec, DB.sectionTitleCols) || code;
        byCode.set(code, { code, title, kind: classifyKind({ ...(subj ?? {}), ...sec }, code, title) });
      }
    });
    const next = emptyMatrix();
    rawRecs.forEach((r: any) => {
      const code = codeOfSection.get(r.subject_section_id);
      const bucket = next[r.round as RoundKey];
      if (!code || !bucket) return;
      (bucket[r.student_id] ??= {})[code] = r.result as FailResult;
    });
    return { subjects: [...byCode.values()].sort((x, y) => x.code.localeCompare(y.code, "th")), matrix: next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSecs, rawRecs, termSel, terms]);
  const codeProblem = rawSecs.length > 0 && rawSecs.every(x => !codeOfSec(x));

  // นักเรียนที่มีผล วผ.8 แต่ไม่อยู่ในรายชื่อห้องที่ส่งมา (เช่น เทอมนี้ยังไม่ผูกนักเรียนกับห้อง) → ดึงชื่อจากตาราง students ตาม id
  const [extraStudents, setExtraStudents] = useState<Student[]>([]);
  useEffect(() => {
    const have = new Set(students.map(x => x.id));
    const missing = [...new Set(rawRecs.map((r: any) => r.student_id as string))].filter(id => id && !have.has(id));
    if (missing.length === 0) { setExtraStudents([]); return; }
    let active = true;
    (async () => {
      const res = await supabase.from(DB.studentsTable).select("*").in("id", missing);
      if (!active || res.error) return;
      setExtraStudents((res.data ?? []).map((r: any): Student => ({
        id: r.id,
        prefix: r.prefix ?? r.title ?? "",
        first_name: r.first_name,
        last_name: r.last_name,
        seat_number: r.seat_number ?? r.number ?? 0,
        student_code: r.student_code ?? r.student_number ?? r.student_no ?? undefined,
      })));
    })();
    return () => { active = false; };
  }, [rawRecs, students]);

  const sorted = useMemo(
    () => [...students, ...extraStudents].sort((a, b) => a.seat_number - b.seat_number),
    [students, extraStudents]);
  const subjectByCode = useMemo(() => new Map(subjects.map(s => [s.code, s])), [subjects]);

  const current = matrix[round];
  const hasFail = (k: RoundKey, id: string) => Object.keys(matrix[k][id] ?? {}).length > 0;
  const failers = sorted.filter(s => hasFail(round, s.id));
  const neverFailed = sorted.filter(s => ROUNDS.every(r => !hasFail(r.key, s.id)));
  const roundCount = (k: RoundKey) => sorted.filter(s => hasFail(k, s.id)).length;
  const roundInfo = ROUNDS.find(r => r.key === round)!;

  /* ----- คอลัมน์รายวิชา (ไม่มีรายวิชาเลย → เว้นช่องว่างตามแบบฟอร์ม 10 + 5) ----- */
  const padTo = (arr: (Subject | null)[], min: number) =>
    arr.length >= min ? arr : [...arr, ...Array.from({ length: min - arr.length }, () => null)];
  const noSubjects = subjects.length === 0;
  const basicCols = padTo(subjects.filter(s => s.kind === "basic"), noSubjects ? 10 : 1);
  const extraCols = padTo(subjects.filter(s => s.kind === "extra"), noSubjects ? 5 : 1);
  const allCols = [...basicCols, ...extraCols];
  const tableRows = showAll ? sorted : failers;
  const blankRows = Math.max(0, MIN_ROWS - tableRows.length);
  const failCells = failers.reduce((n, st) => n + Object.keys(current[st.id] ?? {}).length, 0);
  const totalOf = (s: Subject | null) => (s ? failers.filter(st => current[st.id]?.[s.code]).length : 0);

  const sigTeachers = [teacher1, teacher2].map(t => t.trim()).filter(Boolean);
  const roomLabel = classroomLabel;
  const levelLabel = roomLabel.includes("/") ? roomLabel.split("/")[0] : roomLabel; // ม.2/6 → ม.2
  const roomNoPrefix = roomLabel.replace(/^ม\.?\s*/, "");                           // ม.2/6 → 2/6

  /* ===================== หนังสือแจ้งผู้ปกครอง ===================== */
  const todayTh = useMemo(
    () => new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }), []);
  const [dateText, setDateText] = useState(todayTh);
  const [docNoPass, setDocNoPass] = useState(docNoPrefix);
  const [docNoFail, setDocNoFail] = useState(docNoPrefix);
  const [cfg, setCfg] = useState<Record<RoundKey, RoundLetterCfg>>({
    announce: { held: "", nextExam: "", nextAnnounce: "" },
    retake1: { held: "", nextExam: "", nextAnnounce: "" },
    retake2: { held: "", nextExam: "", nextAnnounce: "" },
  });
  const setCfgField = (f: keyof RoundLetterCfg, v: string) =>
    setCfg(p => ({ ...p, [round]: { ...p[round], [f]: v } }));
  const [pickId, setPickId] = useState("all");
  useEffect(() => { setPickId("all"); }, [view, round]);

  const letterRecipients = view === "pass" ? neverFailed : failers;
  const letterList = pickId === "all" ? letterRecipients : letterRecipients.filter(s => s.id === pickId);

  const commonShell = {
    dateText: thd(dateText), garudaUrl, signatureUrl: principalSignatureUrl, schoolName, addressLines: addressLines.map(thd),
    phone: thd(phone), fax: thd(fax), principalName, principalTitle,
  };
  const nextTermText = semesterV === "1"
    ? `ในภาคเรียนที่ ๒ ปีการศึกษา ${thd(yearV)}`
    : "";

  function failItems(studentId: string) {
    const byCode = current[studentId] ?? {};
    return RESULTS.map(r => ({
      r,
      names: subjects.filter(s => byCode[s.code] === r).map(s => s.title),
    })).filter(x => x.names.length > 0);
  }

  function PassLetter({ s }: { s: Student }) {
    return (
      <LetterShell
        {...commonShell}
        docNo={thd(docNoPass)}
        subject={`แจ้งผลการตัดสินผลการเรียน  ภาคเรียนที่ ${thd(semesterV)}  ปีการศึกษา ${thd(yearV)}`}
        to={`ผู้ปกครองของ ${nameOf(s)} ชั้น ${thd(roomLabel)} เลขที่ ${thd(s.seat_number)}`}
      >
        <p style={indent}>
          ด้วย{schoolName}กำหนดให้มีการวัดประเมินผลการเรียนปลายภาค ภาคเรียนที่ {thd(semesterV)} ประจำปีการศึกษา {thd(yearV)}{" "}
          {thd(examScopeText)} ในวันที่ {fill(cfg.announce.held)} ไปแล้วนั้น
        </p>
        <p style={indent}>
          โรงเรียนจึงขอแจ้งผลการตัดสินผลการเรียน สำหรับนักเรียนในความปกครองของท่าน ผลปรากฏว่า
          <b>มีผลการเรียนผ่านทุกรายวิชา</b> และทางโรงเรียนจะแจ้งผลการเรียนรายบุคคล
          {semesterV === "1" ? ` ${nextTermText}` : ""} ต่อไป
        </p>
        <p style={{ textIndent: "3cm" }} className="pt-2">จึงเรียนมาเพื่อโปรดทราบ</p>
      </LetterShell>
    );
  }

  function FailLetter({ s }: { s: Student }) {
    const items = failItems(s.id);
    const c = cfg[round];
    const isFirst = round === "announce";
    const revYear = curriculumRevisionYear ?? yearV;
    const subj = isFirst
      ? `แจ้งผลการติด 0, ร, มส  ประจำภาคเรียนที่ ${thd(semesterV)}  ปีการศึกษา ${thd(yearV)}`
      : `แจ้งผลการติด 0, ร, มส  หลัง${roundInfo.label}  ภาคเรียนที่ ${thd(semesterV)}  ปีการศึกษา ${thd(yearV)}`;
    return (
      <LetterShell
        {...commonShell}
        docNo={thd(docNoFail)}
        subject={subj}
        to={`ผู้ปกครองของ ${nameOf(s)} ชั้นมัธยมศึกษาปีที่ ${thd(roomNoPrefix)}`}
      >
        <p style={indent}>
          {isFirst
            ? <>ด้วย{schoolName}กำหนดให้มีการวัดประเมินผล การสอบปลายภาค ภาคเรียนที่ {thd(semesterV)} ประจำปีการศึกษา {thd(yearV)} {thd(examScopeText)} ในวันที่ {fill(c.held)} ไปแล้วนั้น</>
            : <>ด้วย{schoolName}กำหนดให้มี{roundInfo.label} ภาคเรียนที่ {thd(semesterV)} ประจำปีการศึกษา {thd(yearV)} {thd(examScopeText)} ในวันที่ {fill(c.held)} ไปแล้วนั้น</>}
          {" "}โรงเรียนจึงขอแจ้งผลการตัดสินผลการเรียน
          {isFirst ? " สำหรับนักเรียนที่มีผลการเรียน 0, ร, มส" : ` หลัง${roundInfo.label}`} ซึ่งนักเรียนในความปกครองของท่าน
          {isFirst ? " " : " ยัง"}<b>มีผลการเรียนที่ไม่ผ่าน</b>ดังนี้
        </p>

        <div className="pl-[3cm] space-y-0.5">
          {items.map((it, i) => (
            <p key={it.r} style={{ textIndent: "-0.8cm", paddingLeft: "0.8cm" }}>
              {thd(i + 1)}. ติด {it.r} จำนวน {thd(it.names.length)} รายวิชา ได้แก่ {it.names.join(", ")}
            </p>
          ))}
        </div>

        <p style={indent}>
          เพื่อให้เป็นไปตามระเบียบ{schoolName}ว่าด้วยการวัดและประเมินผลการเรียน ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน
          พุทธศักราช ๒๕๕๑ (ฉบับปรับปรุง พุทธศักราช {thd(revYear)}) ระดับมัธยมศึกษา{" "}
          {roundInfo.next
            ? "จึงขอความร่วมมือผู้ปกครองได้กำกับดูแลติดตามนักเรียนในความปกครองของท่าน ให้ดำเนินการตามกำหนด ดังนี้"
            : "จึงขอความร่วมมือผู้ปกครองติดต่อฝ่ายวัดผลและประเมินผลของโรงเรียน เพื่อดำเนินการตามระเบียบต่อไป"}
        </p>

        {roundInfo.next && (
          <>
            <div className="pl-[1.2cm] space-y-0.5">
              <p className="flex"><span className="w-[7.5cm] shrink-0">- {roundInfo.next}</span><span>วันที่ {fill(c.nextExam)}</span></p>
              <p className="flex"><span className="w-[7.5cm] shrink-0">- ประกาศผล{roundInfo.next}</span><span>วันที่ {fill(c.nextAnnounce)}</span></p>
            </div>
            <p style={indent}>
              ถ้านักเรียนไม่มาดำเนินการตามกำหนดเวลาดังกล่าว จะส่งผลให้ไม่ผ่านการตัดสินผลการเรียนรายวิชา
              และทางโรงเรียนจะแจ้งผลการเรียนรายบุคคล{semesterV === "1" ? ` ${nextTermText}` : ""} ต่อไป
              ทางโรงเรียนหวังเป็นอย่างยิ่งว่าจะได้รับความร่วมมือเป็นอย่างดี
            </p>
          </>
        )}
        {!roundInfo.next && (
          <p style={indent}>ทางโรงเรียนหวังเป็นอย่างยิ่งว่าจะได้รับความร่วมมือเป็นอย่างดี</p>
        )}
        <p style={{ textIndent: "3cm" }} className="pt-2">จึงเรียนมาเพื่อโปรดทราบ และดำเนินการ</p>
      </LetterShell>
    );
  }

  const roundTabs = (
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
  );

  const inputCls = "border-2 border-slate-200 rounded-lg px-2 py-1 font-bold";

  /* ===================== RENDER ===================== */
  return (
    <div className="space-y-4">
      {/* ===== แถบควบคุม (ไม่พิมพ์) ===== */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          {view === "sheet" ? (
            <button onClick={onBack} className="text-m font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          ) : (
            <button onClick={() => setView("sheet")} className="text-m font-black text-slate-400 hover:text-slate-600 mb-1">← กลับไป วผ.9</button>
          )}
          <h2 className="font-black text-slate-800 text-xl">
            {view === "sheet" && "วผ.9 สรุปจำนวนนักเรียนที่ติด 0, ร, มส"}
            {view === "pass" && "หนังสือแจ้งผู้ปกครอง · ผ่านทุกรายวิชา"}
            {view === "fail" && `หนังสือแจ้งผู้ปกครอง · ติด 0, ร, มส (${roundInfo.label})`}
          </h2>
          <p className="text-slate-400 text-m font-bold">ชั้น {roomLabel} · นักเรียน {sorted.length} คน</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setReloadKey(k => k + 1)} disabled={loading}
            className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-base disabled:opacity-50">
            🔄 โหลดใหม่
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white font-black text-base">
            🖨️ {view === "sheet" ? "พิมพ์รอบนี้" : "พิมพ์หนังสือ"}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-m font-bold text-rose-600 print:hidden">
          ⚠️ โหลดข้อมูลไม่ได้: {loadError}<br />
          (ตรวจชื่อตาราง/คอลัมน์ในออบเจ็กต์ <code>DB</code> ด้านบนไฟล์ให้ตรงกับ Supabase)
        </div>
      )}

      {codeProblem && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-m font-bold text-amber-700 print:hidden">
          ⚠️ พบ {rawSecs.length} section แต่อ่านรหัสวิชาไม่ได้ — ตรวจ DB.subjectCodeCols (ตาราง subjects)
        </div>
      )}

      {terms.length > 1 && (
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 w-fit print:hidden">
          {terms.map(t => (
            <button key={t} onClick={() => setTermSel(t)}
              className={`px-3 py-2 rounded-lg text-m font-black transition-colors ${
                termSel === t ? "bg-indigo-500 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}>
              เทอม {t}
            </button>
          ))}
        </div>
      )}

      {view !== "pass" && roundTabs}

      {loading && <div className="text-center py-10 text-slate-300 font-bold print:hidden">กำลังโหลด...</div>}

      {/* ===== แผงข้อมูลหัวฟอร์ม + ปุ่มสร้างหนังสือ (มุมมอง วผ.9) ===== */}
      {view === "sheet" && !loading && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 print:hidden">
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {([
              ["ภาคเรียนที่", semesterV, setSemesterV],
              ["ปีการศึกษา", yearV, setYearV],
              ["ครูประจำชั้น คนที่ 1", teacher1, setTeacher1],
              ["ครูประจำชั้น คนที่ 2", teacher2, setTeacher2],
              [`หัวหน้าสายชั้น ${levelLabel}`, headName, setHeadName],
            ] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
              <label key={label} className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
                {label}
                <input value={val} onChange={e => set(e.target.value)} className={inputCls} />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-m font-black text-slate-500">หนังสือแจ้งผู้ปกครอง:</span>
            <button onClick={() => setView("pass")}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-[14px]">
              📄 ผ่านทุกรายวิชา ({neverFailed.length} คน)
            </button>
            <button onClick={() => setView("fail")}
              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[14px]">
              📄 ติด 0 / ร / มส · {roundInfo.label} ({failers.length} คน)
            </button>
          </div>
          <label className="flex items-center gap-2 text-m font-bold text-slate-500">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="accent-fuchsia-500" />
            แสดงนักเรียนทั้งห้องในตาราง (คนที่ไม่ติดจะเว้นช่องว่าง)
          </label>
          <p className="text-[12px] font-bold text-slate-400">
            ตรวจข้อมูล: รายวิชาในเทอมนี้ {subjects.length} วิชา · ที่ครูบันทึกไว้ใน วผ.8 รอบนี้ {Object.keys(current).length} คน / {failCells} รายการ
          </p>
          <p className="text-[12px] font-bold text-slate-400">
            ข้อมูลมาจากที่ครูประจำวิชาบันทึกใน วผ.8 ของทุกรายวิชาในห้องนี้ — ถ้ามีวิชาที่ครูยังไม่บันทึก รายชื่อจะยังไม่ครบ
          </p>
        </div>
      )}

      {/* ===== แผงตั้งค่าหนังสือ + เลือกผู้รับ (มุมมองหนังสือ) ===== */}
      {view !== "sheet" && !loading && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 print:hidden">
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            <label className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
              เลขที่หนังสือ (ที่ …)
              <input value={view === "pass" ? docNoPass : docNoFail}
                onChange={e => (view === "pass" ? setDocNoPass : setDocNoFail)(e.target.value)} className={inputCls} />
            </label>
            <label className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
              ลงวันที่
              <input value={dateText} onChange={e => setDateText(e.target.value)} className={inputCls} />
            </label>
            <label className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
              {view === "pass" || round === "announce" ? "วันที่สอบปลายภาค (ที่ผ่านมา)" : `วันที่จัด${roundInfo.label} (ที่ผ่านมา)`}
              <input value={cfg[view === "pass" ? "announce" : round].held}
                onChange={e => setCfg(p => {
                  const k: RoundKey = view === "pass" ? "announce" : round;
                  return { ...p, [k]: { ...p[k], held: e.target.value } };
                })}
                placeholder="เช่น 21, 23, 25 กันยายน 2569" className={inputCls} />
            </label>
            {view === "fail" && roundInfo.next && (
              <>
                <label className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
                  วันที่{roundInfo.next}
                  <input value={cfg[round].nextExam} onChange={e => setCfgField("nextExam", e.target.value)}
                    placeholder="เช่น 28-30 กันยายน 1-2 ตุลาคม 2569" className={inputCls} />
                </label>
                <label className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
                  วันที่ประกาศผล{roundInfo.next}
                  <input value={cfg[round].nextAnnounce} onChange={e => setCfgField("nextAnnounce", e.target.value)}
                    placeholder="เช่น 5 ตุลาคม 2569" className={inputCls} />
                </label>
              </>
            )}
            <label className="text-m font-bold text-slate-500 flex flex-col gap-0.5">
              พิมพ์ให้
              <select value={pickId} onChange={e => setPickId(e.target.value)} className={inputCls}>
                <option value="all">ทั้งหมด ({letterRecipients.length} ฉบับ)</option>
                {letterRecipients.map(s => (
                  <option key={s.id} value={s.id}>{s.seat_number}. {nameOf(s)}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[12px] font-bold text-slate-400">
            {view === "pass"
              ? "ผู้รับ = นักเรียนที่ไม่ติด 0/ร/มส เลยในทุกรอบที่บันทึกไว้"
              : `ผู้รับ = นักเรียนที่ติดในรอบ "${roundInfo.label}" · ระบุรายวิชาที่ติดเป็นรายบุคคล`}
            {" "}· ช่องที่ยังไม่กรอกวันที่จะพิมพ์เป็นจุด ……… ไว้ให้เขียนมือ
          </p>
        </div>
      )}

      {/* ===== หนังสือแจ้งผู้ปกครอง (พิมพ์) ===== */}
      {view !== "sheet" && !loading && (
        letterList.length === 0 ? (
          <div className="text-center py-10 text-slate-300 font-bold print:hidden">
            {view === "pass" ? "ไม่มีนักเรียนที่ผ่านทุกรายวิชา" : `ไม่มีนักเรียนที่ติดในรอบ "${roundInfo.label}"`}
          </div>
        ) : (
          <div className="vp9-print-area space-y-4 print:space-y-0">
            {letterList.map(s =>
              <Fragment key={s.id}>{view === "pass" ? PassLetter({ s }) : FailLetter({ s })}</Fragment>
            )}
          </div>
        )
      )}

      {/* ===== ใบ วผ.9 (พิมพ์) ===== */}
      {view === "sheet" && !loading && (
        <div className="vp9-print-area bg-white rounded-2xl border border-slate-100 p-8 print:border-0 print:p-0 print:rounded-none">
          <div className="relative">
            {/* กล่องเลือกรอบ มุมขวาบน */}
            <div className="absolute right-0 top-0 border-2 border-purple-700 px-3 py-1.5 text-[15px] font-bold leading-snug">
              <p className="text-center font-black">แบบวัดผล 9</p>
              {ROUNDS.map(r => (
                <p key={r.key} className="whitespace-nowrap">
                  <span className="inline-block w-5 text-center">{round === r.key ? "☑" : "☐"}</span>{r.label}
                </p>
              ))}
            </div>

            <div className="text-center">
              {logoOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" onError={() => setLogoOk(false)} className="h-16 mx-auto mb-1 object-contain" />
              ) : (
                <div className="h-16" />
              )}
              <p className="font-black text-[19px]">{schoolName}</p>
              <p className="text-[18px] font-bold mt-1">
                สรุปจำนวนนักเรียนชั้น {dots(roomLabel, "min-w-[80px]")} ที่ติด 0, ร, มส จำแนกตามกลุ่มสาระการเรียนรู้
              </p>
              <p className="text-[17px] font-bold mt-1">
                ภาคเรียนที่ {dots(semesterV, "min-w-[50px]")} ปีการศึกษา {dots(yearV, "min-w-[80px]")}
              </p>
            </div>
          </div>

          {/* ตารางสรุป */}
          <table className="w-full border-collapse mt-3 text-[16px] vp9-table" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 34 }} />
              <col style={{ width: "26%" }} />
              {allCols.map((_, i) => <col key={i} />)}
            </colgroup>
            <thead>
              <tr className="bg-slate-50">
                <th rowSpan={2} className="border border-slate-400 px-1 py-1.5 font-black">ที่</th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 font-black">ชื่อ-สกุล</th>
                <th colSpan={basicCols.length} className="border border-slate-400 px-2 py-1.5 font-black">รายวิชาพื้นฐาน</th>
                <th colSpan={extraCols.length} className="border border-slate-400 px-2 py-1.5 font-black">รายวิชาเพิ่มเติม</th>
              </tr>
              <tr className="bg-slate-50">
                {allCols.map((s, i) => (
                  <th key={i} className="border border-slate-400 p-0 align-top">
                    {/* รหัสวิชา + ชื่อวิชา หมุนขวา 90° (อ่านจากบนลงล่าง) */}
                    <div
                      style={{
                        writingMode: "vertical-rl", height: 230, margin: "0 auto", padding: "5px 0",
                        fontSize: 12.5, lineHeight: 1.15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden",
                      }}>
                      {s ? `${s.code} ${s.title}` : ""}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((st, i) => (
                <tr key={st.id}>
                  <td className="border border-slate-400 text-center py-1.5 font-bold">{i + 1}</td>
                  <td className="border border-slate-400 px-2 py-1.5 font-bold whitespace-nowrap overflow-hidden">{nameOf(st)}</td>
                  {allCols.map((s, c) => (
                    <td key={c} className="border border-slate-400 text-center py-1.5 font-black">
                      {s ? current[st.id]?.[s.code] ?? "" : ""}
                    </td>
                  ))}
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`b${i}`}>
                  <td className="border border-slate-400 text-center py-1.5 font-bold">{tableRows.length + i + 1}</td>
                  <td className="border border-slate-400 py-1.5">&nbsp;</td>
                  {allCols.map((_, c) => <td key={c} className="border border-slate-400 py-1.5">&nbsp;</td>)}
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="border border-slate-400 text-center py-1.5 font-black text-[18px]">รวม</td>
                {allCols.map((s, c) => (
                  <td key={c} className="border border-slate-400 text-center py-1.5 font-black">
                    {s && totalOf(s) > 0 ? totalOf(s) : ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* ลายเซ็น */}
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 text-[18px] font-bold vp9-avoid">
            {/* ครูประจำชั้น 2 คน = ซ้าย/ขวา · คนเดียว = ยุบฝั่งซ้าย เหลือเฉพาะฝั่งขวา */}
            {sigTeachers.length >= 2 && (
              <div className="text-center">
                <p>ลงชื่อ{dots("", "min-w-[160px]")}</p>
                <p>({dots(sigTeachers[0], "min-w-[170px]")})</p>
                <p>ครูประจำชั้น</p>
              </div>
            )}
            <div className={`text-center ${sigTeachers.length >= 2 ? "" : "col-start-2"}`}>
              <p>ลงชื่อ{dots("", "min-w-[160px]")}</p>
              <p>({dots(sigTeachers.length >= 2 ? sigTeachers[1] : sigTeachers[0] ?? "", "min-w-[170px]")})</p>
              <p>ครูประจำชั้น</p>
            </div>
          </div>

          <div className="mt-6 text-[18px] font-bold vp9-avoid flex flex-col items-center text-center">
            <p>ลงชื่อ{dots("", "min-w-[200px]")}</p>
            <p>({dots(headName, "min-w-[200px]")})</p>
            <p>หัวหน้าสายชั้น {levelLabel}</p>
          </div>

          <div className="mt-8 text-[18px] font-bold vp9-avoid flex flex-col items-center text-center">
            <p>ลงชื่อ{dots("", "min-w-[200px]")}</p>
            <p>({principalName})</p>
            <p>{principalTitle}</p>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          .vp9-print-area, .vp9-print-area * { visibility: visible; }
          .vp9-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .vp9-table th, .vp9-table td { border: 1px solid #000 !important; color: #000 !important; background: #fff !important; }
          .vp9-table tr { break-inside: avoid; }
          .vp9-avoid { break-inside: avoid; }
          .vp9-letter { break-after: page; page-break-after: always; min-height: 270mm; color: #000; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 13mm !important; }
          .vp9-letter:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}