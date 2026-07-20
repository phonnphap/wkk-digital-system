// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { differenceInMonths, differenceInYears } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const supabase = createClient();
const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

// ============================================================
// โครงสร้างเครื่องมือคัดกรอง "ความสามารถในการอ่านและการเขียน"
// อ้างอิงคำชี้แจง สถาบันภาษาไทย สวก. สพฐ. (ภาคเรียนที่ ๑ กรกฎาคม ๒๕๖๙)
// รองรับ ป.1-ป.6 และ ม.1-ม.6
// ============================================================
const GRADES = {
  "1": {
    label: "ป.1", full: "ประถมศึกษาปีที่ ๑",
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "ตอนที่ ๑ อ่านพยัญชนะ", max: 10 },
        { key: "r2", label: "ตอนที่ ๒ อ่านสะกดคำ", max: 10 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "ตอนที่ ๑ เขียนพยัญชนะ", max: 10 },
        { key: "w2", label: "ตอนที่ ๒ เขียนคำ", max: 10 },
      ]},
    ],
    evalLevel: "group",
  },
  "2": {
    label: "ป.2", full: "ประถมศึกษาปีที่ ๒",
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "ตอนที่ ๑ อ่านออกเสียงคำ", max: 20 },
        { key: "r2", label: "ตอนที่ ๒ อ่านรู้เรื่อง", max: 10 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "ตอนที่ ๑ เขียนคำ", max: 20 },
        { key: "w2", label: "ตอนที่ ๒ เขียนเรื่อง", max: 27 },
      ]},
    ],
    evalLevel: "part",
  },
  "3": {
    label: "ป.3", full: "ประถมศึกษาปีที่ ๓",
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "ตอนที่ ๑ อ่านออกเสียงคำ", max: 20 },
        { key: "r2", label: "ตอนที่ ๒ อ่านรู้เรื่อง", max: 10 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "ตอนที่ ๑ เขียนคำ", max: 20 },
        { key: "w2", label: "ตอนที่ ๒ เขียนเรื่อง", max: 32 },
      ]},
    ],
    evalLevel: "part",
  },
  "4": {
    label: "ป.4", full: "ประถมศึกษาปีที่ ๔",
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "ตอนที่ ๑ อ่านออกเสียง", max: 30 },
        { key: "r2", label: "ตอนที่ ๒ อ่านรู้เรื่อง", max: 20 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "เขียนเรื่องตามจินตนาการ", max: 32 },
      ]},
    ],
    evalLevel: "part",
  },
  "5": {
    label: "ป.5", full: "ประถมศึกษาปีที่ ๕",
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "ตอนที่ ๑ อ่านออกเสียง", max: 30 },
        { key: "r2", label: "ตอนที่ ๒ อ่านรู้เรื่อง", max: 20 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "เขียนเรื่องตามจินตนาการ", max: 32 },
      ]},
    ],
    evalLevel: "part",
  },
  "6": {
    label: "ป.6", full: "ประถมศึกษาปีที่ ๖",
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "ตอนที่ ๑ อ่านออกเสียง", max: 30 },
        { key: "r2", label: "ตอนที่ ๒ อ่านรู้เรื่อง", max: 20 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "เขียนเรื่องตามจินตนาการและสร้างสรรค์", max: 32 },
      ]},
    ],
    evalLevel: "part",
  },
};

// ── ม.1-ม.6: ฉบับที่ ๑ การอ่าน (๒๐ ข้อ เต็ม ๒๐) + ฉบับที่ ๒ การเขียน (เกณฑ์ Rubric เต็ม ๓๒)
// อ้างอิงคำชี้แจงเครื่องมือคัดกรองฯ ม.1-ม.6 (กรกฎาคม ๒๕๖๙) โครงสร้างคะแนนเหมือนกันทุกระดับชั้น
const THAI_DIGIT = { 1: "๑", 2: "๒", 3: "๓", 4: "๔", 5: "๕", 6: "๖" };
for (let i = 1; i <= 6; i++) {
  GRADES["m" + i] = {
    label: `ม.${i}`, full: `มัธยมศึกษาปีที่ ${THAI_DIGIT[i]}`,
    groups: [
      { key: "read", label: "ฉบับที่ ๑ การอ่าน", parts: [
        { key: "r1", label: "การอ่าน (๒๐ ข้อ)", max: 20 },
      ]},
      { key: "write", label: "ฉบับที่ ๒ การเขียน", parts: [
        { key: "w1", label: "๑. การตั้งชื่อเรื่อง", max: 5 },
        { key: "w2", label: "๒. เนื้อหา", max: 15 },
        { key: "w3", label: "๓. การใช้ภาษา", max: 4 },
        { key: "w4", label: "๔. ความเป็นระเบียบเรียบร้อย", max: 3 },
        { key: "w5", label: "๕. การเขียนสะกดคำ", max: 5 },
      ]},
    ],
    evalLevel: "group",
  };
}

function flatParts(g) {
  const arr = [];
  g.groups.forEach(grp => grp.parts.forEach(p => arr.push({ ...p, group: grp.key, groupLabel: grp.label })));
  return arr;
}
function groupMax(g, groupKey) {
  return g.groups.find(x => x.key === groupKey).parts.reduce((s, p) => s + p.max, 0);
}
function classify(score, max) {
  if (max <= 0 || score === null || score === undefined || score === "") return null;
  const pct = (Number(score) / max) * 100;
  if (pct >= 75) return { label: "ดีมาก", tint: "#dbeafe", tx: "#1e40af" };
  if (pct >= 50) return { label: "ดี", tint: "#dcfce7", tx: "#166534" };
  if (pct >= 25) return { label: "พอใช้", tint: "#fef9c3", tx: "#854d0e" };
  return { label: "ปรับปรุง", tint: "#fee2e2", tx: "#991b1b" };
}
// ห้องเรียนที่รองรับต้องเป็นระดับ ป.1-ป.6 หรือ ม.1-ม.6 (รูปแบบชื่อห้อง เช่น "ป.4/1", "ม.2/3")
function parseGradeLevel(roomName) {
  const name = roomName || "";
  const mP = name.match(/^ป\.?(\d+)/);
  if (mP) {
    const lvl = Number(mP[1]);
    return lvl >= 1 && lvl <= 6 ? String(lvl) : null;
  }
  const mM = name.match(/^ม\.?(\d+)/);
  if (mM) {
    const lvl = Number(mM[1]);
    return lvl >= 1 && lvl <= 6 ? "m" + lvl : null;
  }
  return null;
}
// ป.4-6 และ ม.1-6 ต้องมี "ครูผู้ประเมิน" ที่ได้รับมอบหมายจึงจะบันทึกคะแนนได้ (นอกเหนือจากครูประจำชั้น)
function isEvaluatorGrade(gradeLevel) {
  if (!gradeLevel) return false;
  if (String(gradeLevel).startsWith("m")) return true;
  return Number(gradeLevel) >= 4 && Number(gradeLevel) <= 6;
}
// ตัดห้องอนุบาล ๒-๓ ออกจากรายการห้องเรียนของเครื่องมือนี้ (ไม่รองรับระดับอนุบาล)
function isExcludedKindergarten(roomName) {
  const m = (roomName || "").match(/^อ\.?(\d+)/);
  if (!m) return false;
  const lvl = Number(m[1]);
  return lvl === 2 || lvl === 3;
}

function formatAge(bd) {
  if (!bd) return "—";
  const y = differenceInYears(new Date(), new Date(bd));
  const m = differenceInMonths(new Date(), new Date(bd)) % 12;
  return `${y} ปี ${m} เดือน`;
}
function genderPrefix(g, roomName) {
  const isHighSchool = /^ม\.?(\d+)/.test(roomName || "") && Number((roomName || "").match(/^ม\.?(\d+)/)?.[1]) >= 4;
  const isMale = (g || "").toLowerCase().includes("male") || (g || "").includes("ชาย");
  if (isHighSchool) return isMale ? "นาย" : "นางสาว";
  return isMale ? "ด.ช." : "ด.ญ.";
}

// ── ดึงเฉพาะห้องเรียนที่ผู้ใช้เป็นครูประจำชั้น ──
async function fetchMyClassrooms(userId) {
  const rpc = await supabase.rpc("get_my_classrooms");
  if (rpc.data && rpc.data.length > 0) return sortClassrooms(rpc.data);
  const fb = await supabase.from("classrooms")
    .select("id,room_name,room_number,academic_year_id")
    .or(`homeroom_teacher_id.eq.${userId},homeroom_teacher_2_id.eq.${userId}`);
  return sortClassrooms((fb.data || []).map(c => ({ ...c, classroom_id: c.id })));
}
// ── ดึงห้องเรียนที่ผู้ใช้ได้รับมอบหมายเป็น "ครูผู้ประเมิน" (ตาราง reading_writing_evaluators) ──
async function fetchEvaluatorClassrooms(userId) {
  const { data } = await supabase
    .from("reading_writing_evaluators")
    .select("classroom_id, classrooms:classroom_id (id, room_name, room_number, academic_year_id)")
    .eq("teacher_id", userId);
  return sortClassrooms((data || [])
    .filter(r => r.classrooms)
    .map(r => ({ ...r.classrooms, classroom_id: r.classroom_id })));
}
// ── รวมห้องเรียนที่เป็นครูประจำชั้น + ห้องที่ได้รับมอบหมายเป็นครูผู้ประเมิน (ไม่ซ้ำ) ──
async function fetchAllMyClassrooms(userId) {
  const [home, evalRooms] = await Promise.all([
    fetchMyClassrooms(userId),
    fetchEvaluatorClassrooms(userId),
  ]);
  const map = {};
  [...home, ...evalRooms].forEach(c => { map[c.classroom_id || c.id] = c; });
  return sortClassrooms(Object.values(map));
}
// ── ห้องที่ "ประเมินคะแนนได้" (ใช้กับหน้าบันทึกคะแนนเท่านั้น) ──
// ป.4-6 และ ม.1-6 ต้องเป็นครูผู้ประเมินที่ถูกมอบหมายเท่านั้นจึงจะบันทึกคะแนนได้
// (ครูประจำชั้นของห้องเหล่านี้ที่ไม่ได้รับมอบหมาย จะเห็นห้องได้เฉพาะในแท็บ "รายห้องเรียน" เท่านั้น)
async function fetchAssessableClassrooms(userId) {
  const [home, evalRooms] = await Promise.all([
    fetchMyClassrooms(userId),
    fetchEvaluatorClassrooms(userId),
  ]);
  const filteredHome = home.filter(c => !isEvaluatorGrade(parseGradeLevel(c.room_name)));
  const map = {};
  [...filteredHome, ...evalRooms].forEach(c => { map[c.classroom_id || c.id] = c; });
  return sortClassrooms(Object.values(map));
}
const GRADE_ORDER = { "อ": 0, "ป": 1, "ม": 2 };
function classroomSortKey(roomName) {
  const match = (roomName || "").match(/^([อปม])\.?(\d+)\/(\d+)/);
  if (!match) return [9, 0, 0];
  const [, prefix, grade, room] = match;
  return [GRADE_ORDER[prefix] ?? 9, Number(grade), Number(room)];
}
function sortClassrooms(rooms) {
  return [...rooms].sort((a, b) => {
    const ka = classroomSortKey(a.room_name), kb = classroomSortKey(b.room_name);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

// ── Styles ──────────────────────────
const S = {
  page: { fontFamily: "'Sarabun','Noto Sans Thai',sans-serif", background: "#f0f4ff", minHeight: "100vh" },
  header: { background: "linear-gradient(135deg,#1e40af 0%,#3b82f6 50%,#06b6d4 100%)",
    padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center",
    boxShadow: "0 4px 20px rgba(30,64,175,0.3)", gap: 12 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, margin: "2px 0 0" },
  tabBar: { background: "#fff", padding: "0 1.5rem", borderBottom: "2px solid #e0e7ff",
    display: "flex", gap: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflowX: "auto" },
  tab: (a) => ({ padding: "14px 20px", border: "none", background: "transparent", cursor: "pointer",
    fontSize: 14, fontWeight: a ? 700 : 400, color: a ? "#1e40af" : "#6b7280",
    borderBottom: a ? "3px solid #1e40af" : "3px solid transparent", whiteSpace: "nowrap" }),
  content: { maxWidth: 1300, margin: "0 auto", padding: "1.5rem" },
  card: { background: "#fff", borderRadius: 16, padding: "1.25rem", marginBottom: 16,
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e0e7ff" },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#1e3a8a", marginBottom: 14, display: "flex",
    alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4, display: "block" },
  select: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c7d2fe",
    fontSize: 14, background: "#f8faff", color: "#1e3a8a", fontFamily: "inherit", cursor: "pointer" },
  input: { padding: "6px 8px", borderRadius: 8, border: "1.5px solid #c7d2fe", fontSize: 13,
    background: "#f8faff", color: "#1e3a8a", fontFamily: "inherit", width: 64, textAlign: "center" },
  btn: { padding: "11px 24px", background: "linear-gradient(135deg,#1e40af,#3b82f6)", color: "#fff",
    border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
    boxShadow: "0 4px 12px rgba(59,130,246,0.35)", fontFamily: "inherit" },
  btnSm: { padding: "7px 14px", background: "linear-gradient(135deg,#1e40af,#3b82f6)", color: "#fff",
    border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  btnPrint: { padding: "8px 16px", background: "linear-gradient(135deg,#047857,#10b981)", color: "#fff",
    border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
};
function Badge({ status }) {
  if (!status) return <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>;
  return <span style={{ background: status.tint, color: status.tx, padding: "3px 10px", borderRadius: 20,
    fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{status.label}</span>;
}
function StatCard({ label, value, color }) {
  return <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", border: `2px solid ${color}30` }}>
    <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// Main App
// ══════════════════════════════════════════════════════════════
export default function ReadingWritingApp() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assess");
  const [isProjectManager, setIsProjectManager] = useState(false);

  const isRealAdmin = ADMIN_ROLES.includes(currentUser?.role ?? "");
  const isAdmin = useMemo(() => isRealAdmin || isProjectManager, [isRealAdmin, isProjectManager]);

  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      let { data } = await supabase.from("users")
        .select("id, first_name, last_name, role, department_id")
        .eq("auth_id", authUser.id).maybeSingle();

      if (!data) {
        const email = authUser.email || authUser.user_metadata?.email || "";
        if (email) {
          const res = await supabase.from("users")
            .select("id, first_name, last_name, role, department_id")
            .eq("email", email).maybeSingle();
          data = res.data;
          if (data) await supabase.from("users").update({ auth_id: authUser.id }).eq("id", data.id);
        }
      }

      if (data) {
        setCurrentUser(data);
        const { data: pmData } = await supabase
          .from("reading_writing_project_managers")
          .select("id")
          .eq("user_id", data.id)
          .maybeSingle();
        if (pmData) setIsProjectManager(true);
      }
      setLoading(false);
    };
    init();
  }, []);

  if (loading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
        <div style={{ fontSize: 16, color: "#3b82f6", fontWeight: 600 }}>กำลังโหลดระบบ...</div>
      </div>
    </div>
  );
  if (!currentUser) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#dc2626", fontSize: 16, fontWeight: 600 }}>❌ กรุณาเข้าสู่ระบบก่อน</div>
    </div>
  );

  const roleLabel = { homeroom_teacher: "ครูประจำชั้น", subject_teacher: "ครูผู้สอน", admin: "ผู้ดูแลระบบ",
    director: "ผู้อำนวยการ", deputy_director: "รองผู้อำนวยการ", dept_head: "หัวหน้าฝ่าย",
    grade_head: "หัวหน้าระดับ" }[currentUser.role] || currentUser.role;

  const tabs = isAdmin
    ? [
        { key: "assess", label: "✏️ บันทึกคะแนน" },
        { key: "class", label: "📋 รายห้องเรียน" },
        { key: "overview", label: "🏫 ภาพรวมโรงเรียน" },
        { key: "evaluators", label: "👩‍🏫 จัดการครูผู้ประเมิน" },
        ...(isRealAdmin ? [{ key: "managers", label: "⚙️ ผู้ดูแลโครงการ" }] : []),
      ]
    : [
        { key: "assess", label: "✏️ บันทึกคะแนน" },
        { key: "class", label: "📋 รายห้องเรียน" },
      ];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
        <button
  onClick={() => router.push("/homeroom")}
  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg"
>
  ←
</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.headerTitle}>📖 ระบบบันทึกคะแนนความสามารถในการอ่านและการเขียน</h1>
          <p style={S.headerSub}>{currentUser.title}{currentUser.first_name} {currentUser.last_name} · {roleLabel}{isProjectManager && !isRealAdmin ? " · ผู้ดูแลโครงการ" : ""}</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 14px",
          color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>ภาคเรียนที่ ๑ / ๒๕๖๙</div>
      </div>
      <div style={S.tabBar}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={S.tab(tab === t.key)}>{t.label}</button>)}
      </div>
      <div style={S.content}>
        {tab === "assess" && <AssessPage currentUser={currentUser} isAdmin={isAdmin} />}
        {tab === "class" && <ClassPage currentUser={currentUser} isAdmin={isAdmin} />}
        {tab === "overview" && isAdmin && <OverviewPage />}
        {tab === "evaluators" && isAdmin && <EvaluatorsPage currentUser={currentUser} />}
        {tab === "managers" && isRealAdmin && <ManagersPage currentUser={currentUser} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// AssessPage — ครูประจำชั้น/ครูผู้ประเมินเห็นเฉพาะห้องของตน (fetchAllMyClassrooms)
// แอดมิน/ผู้บริหารเลือกดูได้ทุกห้องผ่านแท็บ "ภาพรวมโรงเรียน" / "รายห้องเรียน"
// ══════════════════════════════════════════════════════════════
function AssessPage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [values, setValues] = useState({});
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // โหลดห้องเรียน: ครูประจำชั้น (ทุกระดับ) + ครูผู้ประเมินที่ได้รับมอบหมาย (ป.4-6, ม.1-6)
  useEffect(() => {
    if (!currentUser) return;
    setLoadingRooms(true);
    fetchAssessableClassrooms(currentUser.id).then(rooms => {
      setClassrooms(rooms);
      if (rooms.length > 0) setSelectedClass(rooms[0]);
      setLoadingRooms(false);
    });
  }, [currentUser]);

  // โหลดรายชื่อนักเรียนของห้องที่เลือก
  useEffect(() => {
    if (!selectedClass) return;
    const cid = selectedClass.classroom_id || selectedClass.id;
    setLoadingStudents(true);
    setStudents([]); setValues({});
    supabase.rpc("get_my_students", { p_classroom_id: cid }).then(({ data }) => {
      setStudents(data || []);
      setLoadingStudents(false);
    });
  }, [selectedClass]);

  const gradeLevel = parseGradeLevel(selectedClass?.room_name);
  const g = gradeLevel ? GRADES[gradeLevel] : null;

  // โหลดคะแนนที่เคยบันทึกไว้ของห้องนี้
  useEffect(() => {
    if (!selectedClass || !g || students.length === 0) return;
    const cid = selectedClass.classroom_id || selectedClass.id;
    supabase.from("reading_writing_records").select("*")
      .eq("classroom_id", cid).eq("academic_year_id", selectedClass.academic_year_id)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.student_id] = r; });
        setValues(prev => {
          const next = { ...prev };
          students.forEach(s => {
            const key = s.student_id || s.id;
            const ex = map[key];
            if (!next[key]) next[key] = {};
            if (ex?.scores) next[key] = { ...ex.scores };
          });
          return next;
        });
      });
  }, [selectedClass, students, g]);

  function setScore(studentKey, partKey, val, max) {
    let v = val === "" ? "" : Math.max(0, Math.min(max, Number(val)));
    setValues(prev => ({ ...prev, [studentKey]: { ...(prev[studentKey] || {}), [partKey]: v } }));
  }

  const parts = g ? flatParts(g) : [];

  const handleSaveAll = async () => {
    if (!selectedClass || !g) return;
    const cid = selectedClass.classroom_id || selectedClass.id;
    const ay = selectedClass.academic_year_id;
    const toSave = students
      .map(s => {
        const key = s.student_id || s.id;
        const sc = values[key] || {};
        const hasAny = parts.some(p => sc[p.key] !== undefined && sc[p.key] !== "");
        if (!hasAny) return null;
        return {
          student_id: key, classroom_id: cid, academic_year_id: ay,
          grade_level: gradeLevel, recorded_by: currentUser.id, scores: sc,
        };
      })
      .filter(Boolean);
    if (toSave.length === 0) { setSaveMsg("⚠️ กรุณากรอกคะแนนอย่างน้อย 1 คน"); return; }
    setSaving(true); setSaveMsg("");
    const { error } = await supabase.from("reading_writing_records")
      .upsert(toSave, { onConflict: "student_id,academic_year_id" });
    setSaving(false);
    setSaveMsg(error ? `❌ ${error.message}` : `✅ บันทึกสำเร็จ ${toSave.length} คน`);
  };

  const handlePrint = () => {
    if (!g) return;
    const html = `
      <h3>${selectedClass?.room_name} — แบบบันทึกคะแนนความสามารถในการอ่านและการเขียน (${g.full})</h3>
      <table><thead><tr>
        <th>เลขที่</th><th>ชื่อ-นามสกุล</th>
        ${parts.map(p => `<th>${p.label}<br>(เต็ม ${p.max})</th>`).join("")}
        ${g.evalLevel === "part" ? parts.map(p => `<th>ผล</th>`).join("") : g.groups.map(gr => `<th>ผล ${gr.label}</th>`).join("")}
      </tr></thead><tbody>
      ${students.map((s, i) => {
        const key = s.student_id || s.id;
        const sc = values[key] || {};
        const cells = parts.map(p => `<td>${sc[p.key] ?? "—"}</td>`).join("");
        const badgeCells = g.evalLevel === "part"
          ? parts.map(p => `<td>${classify(sc[p.key], p.max)?.label ?? "—"}</td>`).join("")
          : g.groups.map(gr => {
              const hasAny = gr.parts.some(p => sc[p.key] !== undefined && sc[p.key] !== "");
              const total = gr.parts.reduce((sum, p) => sum + (Number(sc[p.key]) || 0), 0);
              return `<td>${hasAny ? (classify(total, groupMax(g, gr.key))?.label ?? "—") : "—"}</td>`;
            }).join("");
        return `<tr><td style="text-align:center">${s.seat_number || i + 1}</td>
          <td>${genderPrefix(s.gender, selectedClass?.room_name)} ${s.first_name} ${s.last_name}</td>
          ${cells}${badgeCells}</tr>`;
      }).join("")}
      </tbody></table>`;
    const w = window.open("", "_blank", "width=1100,height=750");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายงาน ${selectedClass?.room_name}</title>
      <style>body{font-family:'Sarabun',sans-serif;font-size:12px;margin:20px}h2,h3{color:#1e40af}
      table{width:100%;border-collapse:collapse}th{background:#1e40af;color:#fff;padding:6px 8px;font-size:11px}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center}
      tr:nth-child(even)td{background:#f8faff}@media print{button{display:none}}</style></head>
      <body><h2>โรงเรียน — รายงานความสามารถในการอ่านและการเขียน</h2>${html}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  if (loadingRooms) return <div style={{ ...S.card, textAlign: "center", padding: 48 }}>⏳ กำลังโหลดห้องเรียน...</div>;
  if (classrooms.length === 0) return (
    <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏫</div>
      <div style={{ color: "#6b7280", fontSize: 15, fontWeight: 600 }}>
        ไม่พบห้องเรียนที่คุณสามารถบันทึกคะแนนได้<br />
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          ห้อง ป.4–ป.6 และ ม.1–ม.6 ต้องได้รับมอบหมายเป็น "ครูผู้ประเมิน" จากผู้ดูแลระบบก่อนจึงจะบันทึกคะแนนได้<br />
          (ครูประจำชั้นยังดูข้อมูลห้องของตนได้ที่แท็บ "รายห้องเรียน")
        </span>
      </div>
    </div>
  );

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {classrooms.length > 1 ? (
  <div style={{ flex: 1, minWidth: 160 }}>
    <label style={S.label}>ห้องเรียน</label>
    <select style={S.select} value={selectedClass?.classroom_id || selectedClass?.id || ""}
      onChange={e => setSelectedClass(classrooms.find(c => (c.classroom_id || c.id) === e.target.value))}>
      {classrooms.map(c => <option key={c.classroom_id || c.id} value={c.classroom_id || c.id}>{c.room_name}</option>)}
    </select>
  </div>
) : (
  <div style={{ flex: 1, background: "#eff6ff", borderRadius: 10, padding: "10px 14px",
    color: "#1e40af", fontWeight: 700, fontSize: 14 }}>📚 {classrooms[0]?.room_name}</div>
)}
        </div>
      </div>

      {!g ? (
        <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: "#92400e", fontWeight: 600 }}>
            เครื่องมือนี้รองรับเฉพาะระดับชั้น ป.1–ป.6 และ ม.1–ม.6 เท่านั้น (ตรวจไม่พบระดับชั้นจากชื่อห้อง &quot;{selectedClass?.room_name}&quot;)
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
            <StatCard label="นักเรียนทั้งหมด" value={students.length} color="#3b82f6" />
            <StatCard label="กรอกข้อมูลแล้ว" value={students.filter(s => {
              const sc = values[s.student_id || s.id] || {};
              return parts.some(p => sc[p.key] !== undefined && sc[p.key] !== "");
            }).length} color="#16a34a" />
            <StatCard label="ระดับชั้น" value={g.label} color="#7c3aed" />
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>
              <span>📝 {selectedClass?.room_name} — {g.full}</span>
              <button onClick={handlePrint} style={S.btnPrint}>🖨️ พิมพ์รายงาน</button>
            </div>

            {loadingStudents ? (
              <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ กำลังโหลดรายชื่อนักเรียน...</div>
            ) : students.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>📭 ไม่พบนักเรียนในห้องนี้</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                      <th style={thStyle}>เลขที่</th>
                      <th style={{ ...thStyle, textAlign: "left" }}>ชื่อ-นามสกุล</th>
                      {parts.map(p => <th key={p.key} style={thStyle}>{p.label}<br /><span style={{ fontWeight: 400 }}>(เต็ม {p.max})</span></th>)}
                      {g.evalLevel === "part"
                        ? parts.map(p => <th key={"b" + p.key} style={thStyle}>ผล</th>)
                        : g.groups.map(gr => <th key={"b" + gr.key} style={thStyle}>ผล {gr.label.replace("ฉบับที่ ๑ ", "").replace("ฉบับที่ ๒ ", "")}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const key = s.student_id || s.id;
                      const sc = values[key] || {};
                      return (
                        <tr key={key} style={{ background: i % 2 === 0 ? "#f8faff" : "#fff" }}>
                          <td style={tdStyle}>{s.seat_number || i + 1}</td>
                          <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600, color: "#1e3a8a", whiteSpace: "nowrap" }}>
                            {genderPrefix(s.gender, selectedClass?.room_name)} {s.first_name} {s.last_name}
                          </td>
                          {parts.map(p => (
                            <td style={tdStyle} key={p.key}>
                              <input type="number" min="0" max={p.max} style={S.input}
                                value={sc[p.key] ?? ""} placeholder="0"
                                onChange={e => setScore(key, p.key, e.target.value, p.max)} />
                            </td>
                          ))}
                          {g.evalLevel === "part"
                            ? parts.map(p => <td style={tdStyle} key={"bd" + p.key}><Badge status={classify(sc[p.key], p.max)} /></td>)
                            : g.groups.map(gr => {
                                const hasAny = gr.parts.some(p => sc[p.key] !== undefined && sc[p.key] !== "");
                                const total = gr.parts.reduce((sum, p) => sum + (Number(sc[p.key]) || 0), 0);
                                return <td style={tdStyle} key={"bd" + gr.key}><Badge status={hasAny ? classify(total, groupMax(g, gr.key)) : null} /></td>;
                              })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {students.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button onClick={handleSaveAll} disabled={saving} style={{ ...S.btn, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "⏳ กำลังบันทึก..." : "💾 บันทึกทั้งห้อง"}
                </button>
                {saveMsg && (
                  <div style={{ padding: "7px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13,
                    background: saveMsg.includes("✅") ? "#f0fdf4" : saveMsg.includes("⚠️") ? "#fffbeb" : "#fef2f2",
                    color: saveMsg.includes("✅") ? "#16a34a" : saveMsg.includes("⚠️") ? "#b45309" : "#dc2626" }}>
                    {saveMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
const thStyle = { padding: "8px 6px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { padding: "6px", textAlign: "center" };

// ══════════════════════════════════════════════════════════════
// ClassPage — "รายห้องเรียน" อ้างอิงระบบประเมินโภชนาการ
// แอดมินเลือกดูได้ทุกห้อง (ยกเว้นอนุบาล ๒-๓ ซึ่งไม่รองรับ) / ครูเห็นเฉพาะห้องของตน
// ══════════════════════════════════════════════════════════════
function ClassPage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const loadRooms = async () => {
      let rooms = [];
      if (isAdmin) {
        const { data } = await supabase.from("classrooms").select("id,room_name,room_number,academic_year_id");
        rooms = sortClassrooms((data || [])
          .filter(c => !isExcludedKindergarten(c.room_name))
          .map(c => ({ ...c, classroom_id: c.id })));
      } else {
        rooms = await fetchAllMyClassrooms(currentUser.id);
      }
      setClassrooms(rooms);
      if (rooms.length === 1) setSelectedClass(rooms[0]);
    };
    loadRooms();
  }, [currentUser, isAdmin]);

  const gradeLevel = parseGradeLevel(selectedClass?.room_name);
  const g = gradeLevel ? GRADES[gradeLevel] : null;
  const parts = g ? flatParts(g) : [];

  function overallStatus(sc) {
    if (!g || !sc) return null;
    const levels = g.evalLevel === "part"
      ? parts.map(p => classify(sc[p.key], p.max))
      : g.groups.map(gr => {
          const total = gr.parts.reduce((s, p) => s + (Number(sc[p.key]) || 0), 0);
          return classify(total, groupMax(g, gr.key));
        });
    const order = { "ปรับปรุง": 0, "พอใช้": 1, "ดี": 2, "ดีมาก": 3 };
    return levels.reduce((acc, l) => {
      if (!l) return acc;
      if (!acc || order[l.label] < order[acc.label]) return l;
      return acc;
    }, null);
  }

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    const cid = selectedClass.classroom_id || selectedClass.id;
    const { data: students } = await supabase.rpc("get_my_students", { p_classroom_id: cid });
    const { data: recs } = await supabase.from("reading_writing_records")
      .select("*").eq("classroom_id", cid).eq("academic_year_id", selectedClass.academic_year_id);
    const map = {};
    (recs || []).forEach(r => { map[r.student_id] = r; });
    const merged = (students || [])
      .map((s, i) => {
        const key = s.student_id || s.id;
        return { student: s, seat: s.seat_number || (i + 1), scores: map[key]?.scores || null };
      })
      .sort((a, b) => Number(a.seat) - Number(b.seat));
    setRecords(merged);
    setLoading(false);
  }, [selectedClass]);

  const displayRecords = useMemo(() => {
    if (!statusFilter) return records;
    return records.filter(r => overallStatus(r.scores)?.label === statusFilter);
  }, [records, statusFilter, g]);

  const summary = useMemo(() => {
    let good = 0, warn = 0, bad = 0, measured = 0;
    records.forEach(r => {
      const st = overallStatus(r.scores);
      if (!st) return;
      measured++;
      if (st.label === "ดีมาก" || st.label === "ดี") good++;
      else if (st.label === "พอใช้") warn++;
      else bad++;
    });
    return { total: records.length, measured, good, warn, bad };
  }, [records, g]);

  const handlePrint = () => {
    if (!g) return;
    const html = `<h3>${selectedClass?.room_name} — ${g.full}</h3>
      <table><thead><tr><th>เลขที่</th><th>ชื่อ-นามสกุล</th>
      ${parts.map(p => `<th>${p.label}<br>(เต็ม ${p.max})</th>`).join("")}
      <th>ผลรวม</th></tr></thead><tbody>
      ${displayRecords.map(r => {
        const sc = r.scores || {};
        const cells = parts.map(p => `<td>${sc[p.key] ?? "—"}</td>`).join("");
        const st = overallStatus(sc);
        return `<tr><td style="text-align:center">${r.seat}</td>
          <td>${genderPrefix(r.student.gender, selectedClass?.room_name)} ${r.student.first_name} ${r.student.last_name}</td>
          ${cells}<td>${st?.label ?? "—"}</td></tr>`;
      }).join("")}
      </tbody></table>
      <p style="margin-top:12px;font-size:11px;color:#6b7280">
        ดีมาก/ดี: ${summary.good} คน | พอใช้: ${summary.warn} คน | ต้องปรับปรุง: ${summary.bad} คน | รวม: ${summary.total} คน
      </p>`;
    const w = window.open("", "_blank", "width=1100,height=750");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายงาน ${selectedClass?.room_name}</title>
      <style>body{font-family:'Sarabun',sans-serif;font-size:12px;margin:20px}h2,h3{color:#1e40af}
      table{width:100%;border-collapse:collapse}th{background:#1e40af;color:#fff;padding:6px 8px;font-size:11px}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center}
      tr:nth-child(even)td{background:#f8faff}@media print{button{display:none}}</style></head>
      <body><h2>โรงเรียน — รายงานความสามารถในการอ่านและการเขียนรายห้องเรียน</h2>${html}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {(isAdmin || classrooms.length > 1) ? (
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={S.label}>ห้องเรียน</label>
              <select style={S.select} value={selectedClass?.classroom_id || selectedClass?.id || ""}
                onChange={e => { setSelectedClass(classrooms.find(c => (c.classroom_id || c.id) === e.target.value)); setRecords([]); setStatusFilter(null); }}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => <option key={c.classroom_id || c.id} value={c.classroom_id || c.id}>{c.room_name}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ flex: 1, background: "#eff6ff", borderRadius: 10, padding: "10px 14px", color: "#1e40af", fontWeight: 700, fontSize: 14 }}>
              📚 {classrooms[0]?.room_name}
            </div>
          )}
          <button onClick={load} style={S.btn}>🔍 แสดงผล</button>
          {records.length > 0 && <button onClick={handlePrint} style={S.btnPrint}>🖨️ พิมพ์รายงาน</button>}
        </div>
      </div>

      {selectedClass && !g && (
        <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: "#92400e", fontWeight: 600 }}>
            เครื่องมือนี้รองรับเฉพาะระดับชั้น ป.1–ป.6 และ ม.1–ม.6 เท่านั้น
          </div>
        </div>
      )}

      {selectedClass && g && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            <div onClick={() => setStatusFilter(null)} style={{ cursor: "pointer" }}>
              <StatCard label="ทั้งหมด" value={summary.total} color="#3b82f6" />
            </div>
            <div onClick={() => setStatusFilter(statusFilter === "ดีมาก" ? null : "ดีมาก")} style={{ cursor: "pointer" }}>
              <StatCard label="ดีมาก" value={summary.good} color="#16a34a" />
            </div>
            <div onClick={() => setStatusFilter(statusFilter === "พอใช้" ? null : "พอใช้")} style={{ cursor: "pointer" }}>
              <StatCard label="พอใช้" value={summary.warn} color="#f59e0b" />
            </div>
            <div onClick={() => setStatusFilter(statusFilter === "ปรับปรุง" ? null : "ปรับปรุง")} style={{ cursor: "pointer" }}>
              <StatCard label="ต้องปรับปรุง" value={summary.bad} color="#dc2626" />
            </div>
          </div>

          {statusFilter && (
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#1e40af", fontWeight: 700 }}>🔍 กรองแสดง: {statusFilter}</span>
              <button onClick={() => setStatusFilter(null)} style={{ ...S.btnSm, background: "#f1f5f9", color: "#6b7280" }}>✕ ล้างตัวกรอง</button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ กำลังโหลด...</div>
          ) : (
            <div style={S.card}>
              <div style={S.cardTitle}>📋 รายชื่อนักเรียน ({displayRecords.length} คน)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                      <th style={thStyle}>เลขที่</th>
                      <th style={{ ...thStyle, textAlign: "left" }}>ชื่อ-นามสกุล</th>
                      {parts.map(p => <th key={p.key} style={thStyle}>{p.label}<br /><span style={{ fontWeight: 400 }}>(เต็ม {p.max})</span></th>)}
                      <th style={thStyle}>ผลรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRecords.map(r => {
                      const sc = r.scores || {};
                      const st = overallStatus(sc);
                      const key = r.student.student_id || r.student.id;
                      return (
                        <tr key={key}>
                          <td style={tdStyle}>{r.seat}</td>
                          <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600, color: "#1e3a8a", whiteSpace: "nowrap" }}>
                            {genderPrefix(r.student.gender, selectedClass?.room_name)} {r.student.first_name} {r.student.last_name}
                          </td>
                          {parts.map(p => <td style={tdStyle} key={p.key}>{sc[p.key] ?? "—"}</td>)}
                          <td style={tdStyle}><Badge status={st} /></td>
                        </tr>
                      );
                    })}
                    {displayRecords.length === 0 && (
                      <tr><td colSpan={parts.length + 3} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>
                        📭 กด "แสดงผล" เพื่อโหลดข้อมูล
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// EvaluatorsPage — "จัดการครูผู้ประเมิน" สำหรับห้อง ป.4-6 และ ม.1-6
// ต้องมีตาราง reading_writing_evaluators (id, classroom_id, teacher_id, academic_year_id, added_by, created_at)
// แนะนำ unique constraint บน (classroom_id, teacher_id)
// ══════════════════════════════════════════════════════════════
function EvaluatorsPage({ currentUser }) {
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFor, setOpenFor] = useState(null);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: rooms } = await supabase.from("classrooms")
      .select("id,room_name,room_number,academic_year_id");
    const eligible = sortClassrooms((rooms || [])
      .filter(c => isEvaluatorGrade(parseGradeLevel(c.room_name)))
      .map(c => ({ ...c, classroom_id: c.id })));
    setClassrooms(eligible);

    const { data: evalData } = await supabase
      .from("reading_writing_evaluators")
      .select("id, classroom_id, teacher_id");
    const { data: usrData } = await supabase
      .from("users").select("id,first_name,last_name,title,role").order("first_name");
    setAllUsers(usrData || []);
    const userMap = {};
    (usrData || []).forEach(u => { userMap[u.id] = u; });
    const byRoom = {};
    (evalData || []).forEach(e => {
      if (!byRoom[e.classroom_id]) byRoom[e.classroom_id] = [];
      byRoom[e.classroom_id].push({ id: e.id, teacher: userMap[e.teacher_id] || null });
    });
    setAssignments(byRoom);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredUsers = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allUsers.filter(u => `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)).slice(0, 8);
  }, [allUsers, search]);

  const handleAssign = async (classroom, user) => {
    const cid = classroom.classroom_id || classroom.id;
    const { error } = await supabase.from("reading_writing_evaluators")
      .upsert([{ classroom_id: cid, teacher_id: user.id, academic_year_id: classroom.academic_year_id, added_by: currentUser.id }],
        { onConflict: "classroom_id,teacher_id", ignoreDuplicates: true });
    if (error) alert("❌ " + error.message);
    setSearch(""); setOpenFor(null);
    await loadData();
  };

  const handleRemove = async (id) => {
    if (!confirm("ยืนยันการลบครูผู้ประเมินคนนี้ออกจากห้องนี้?")) return;
    await supabase.from("reading_writing_evaluators").delete().eq("id", id);
    await loadData();
  };

  const roleLabel = { homeroom_teacher: "ครูประจำชั้น", subject_teacher: "ครูผู้สอน", admin: "ผู้ดูแลระบบ",
    director: "ผู้อำนวยการ", deputy_director: "รองผู้อำนวยการ", dept_head: "หัวหน้าฝ่าย", grade_head: "หัวหน้าระดับ" };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ ...S.card, background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "1px solid #fcd34d" }}>
        <div style={{ fontWeight: 700, color: "#92400e", fontSize: 14, marginBottom: 4 }}>👩‍🏫 จัดการครูผู้ประเมิน</div>
        <div style={{ color: "#92400e", fontSize: 13 }}>
          กำหนดครูผู้ประเมินความสามารถในการอ่านและการเขียน สำหรับห้องเรียนระดับชั้น ป.4–ป.6 และ ม.1–ม.6
          (ครูที่ได้รับมอบหมายจะเห็นห้องเรียนนี้ในเมนู "บันทึกคะแนน" โดยไม่ต้องเป็นครูประจำชั้น)
        </div>
      </div>

      {loading ? (
        <div style={{ ...S.card, textAlign: "center", padding: 32 }}>⏳ กำลังโหลด...</div>
      ) : classrooms.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 32, color: "#9ca3af" }}>ไม่พบห้องเรียนที่เข้าเกณฑ์ (ป.4–ป.6, ม.1–ม.6)</div>
      ) : classrooms.map(c => {
        const cid = c.classroom_id || c.id;
        const list = assignments[cid] || [];
        return (
          <div key={cid} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 14 }}>📚 {c.room_name}</div>
              <button onClick={() => { setOpenFor(openFor === cid ? null : cid); setSearch(""); }} style={S.btnSm}>
                {openFor === cid ? "✕ ปิด" : "➕ มอบหมายครู"}
              </button>
            </div>
            {list.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>ยังไม่มีครูผู้ประเมิน</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {list.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "#f8faff", borderRadius: 10, border: "1px solid #e0e7ff" }}>
                    <span style={{ fontWeight: 600, color: "#1e3a8a", fontSize: 13 }}>
                      {a.teacher?.title}{a.teacher?.first_name} {a.teacher?.last_name}
                      <span style={{ color: "#6b7280", fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                        {roleLabel[a.teacher?.role] || a.teacher?.role}
                      </span>
                    </span>
                    <button onClick={() => handleRemove(a.id)}
                      style={{ padding: "5px 12px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5",
                        borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>🗑️ ลบ</button>
                  </div>
                ))}
              </div>
            )}
            {openFor === cid && (
              <div style={{ position: "relative", marginTop: 10 }}>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="🔍 พิมพ์ชื่อครูเพื่อค้นหา..." style={{ ...S.select, width: "100%" }} />
                {filteredUsers.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
                    border: "1.5px solid #c7d2fe", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 50, overflow: "hidden", marginTop: 4 }}>
                    {filteredUsers.map(u => (
                      <button key={u.id} onClick={() => handleAssign(c, u)}
                        style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent",
                          textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between",
                          fontFamily: "inherit", borderBottom: "1px solid #f0f4ff" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13 }}>{u.title}{u.first_name} {u.last_name}</span>
                        <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 12 }}>+ เลือก</span>
                      </button>
                    ))}
                  </div>
                )}
                {search.length > 0 && filteredUsers.length === 0 && (
                  <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: 12, marginTop: 4,
                    background: "#f8faff", borderRadius: 10, border: "1px solid #e0e7ff" }}>ไม่พบผู้ใช้</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OverviewPage — เฉพาะแอดมิน/ผู้บริหาร/ผู้ดูแลโครงการ เห็นทุกห้อง
// ══════════════════════════════════════════════════════════════
const GRADE_FILTERS = ["", "1", "2", "3", "4", "5", "6", "m1", "m2", "m3", "m4", "m5", "m6"];

function OverviewPage() {
  const [gradeFilter, setGradeFilter] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartFilter, setChartFilter] = useState(null);

  const load = useCallback(async () => {
  setLoading(true);
  const { data: classrooms } = await supabase.from("classrooms")
    .select("id,room_name,student_count,academic_year_id");
  const { data: records } = await supabase.from("reading_writing_records").select("*");

  // ✅ ตัดห้องที่ไม่รองรับออกก่อน (อ.1-3 และห้องที่ไม่ตรงรูปแบบ ป./ม.1-6)
  // ✅ ตัดห้องอนุบาล ๒-๓ ออกก่อน และเก็บเฉพาะห้องที่ parse ระดับชั้นได้ (ป.1-6, ม.1-6)
const supportedClassrooms = (classrooms || [])
  .filter(c => !isExcludedKindergarten(c.room_name))
  .filter(c => parseGradeLevel(c.room_name) !== null);

let summary = sortClassrooms(supportedClassrooms).map(c => {
  const gl = parseGradeLevel(c.room_name);
  const g = gl ? GRADES[gl] : null;
    const recs = (records || []).filter(r => r.classroom_id === c.id);
    let ok = 0, warn = 0, bad = 0;
    if (g) {
      recs.forEach(r => {
        const parts = flatParts(g);
        const levels = g.evalLevel === "part"
          ? parts.map(p => classify(r.scores?.[p.key], p.max))
          : g.groups.map(gr => {
              const total = gr.parts.reduce((s, p) => s + (Number(r.scores?.[p.key]) || 0), 0);
              return classify(total, groupMax(g, gr.key));
            });
        const worst = levels.reduce((acc, l) => {
          const order = { "ปรับปรุง": 0, "พอใช้": 1, "ดี": 2, "ดีมาก": 3 };
          if (!l) return acc;
          if (!acc || order[l.label] < order[acc.label]) return l;
          return acc;
        }, null);
        if (worst?.label === "ดีมาก" || worst?.label === "ดี") ok++;
        else if (worst?.label === "พอใช้") warn++;
        else if (worst?.label === "ปรับปรุง") bad++;
      });
    }
    const measured = recs.length;
    return {
      room_name: c.room_name, gradeLevel: gl, total: c.student_count || 0, measured,
      ok, warn, bad,
      okPct: measured ? Math.round((ok / measured) * 100) : 0,
      warnPct: measured ? Math.round((warn / measured) * 100) : 0,
      badPct: measured ? Math.round((bad / measured) * 100) : 0,
    };
  });
  setRows(summary);
  setLoading(false);
}, []);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => {
    if (!gradeFilter) return rows;
    return rows.filter(r => String(r.gradeLevel) === gradeFilter);
  }, [rows, gradeFilter]);

  const totals = useMemo(() => {
    const total = filteredRows.reduce((s, r) => s + r.total, 0);
    const measured = filteredRows.reduce((s, r) => s + r.measured, 0);
    const ok = filteredRows.reduce((s, r) => s + r.ok, 0);
    const warn = filteredRows.reduce((s, r) => s + r.warn, 0);
    const bad = filteredRows.reduce((s, r) => s + r.bad, 0);
    return {
      total, measured, ok, warn, bad,
      okPct: measured ? Math.round((ok / measured) * 100) : 0,
      warnPct: measured ? Math.round((warn / measured) * 100) : 0,
      badPct: measured ? Math.round((bad / measured) * 100) : 0,
    };
  }, [filteredRows]);

  if (loading) return <div style={{ ...S.card, textAlign: "center", padding: 40 }}>⏳ กำลังโหลด...</div>;

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 160 }}>
            <label style={S.label}>สายชั้น</label>
            <select style={S.select} value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {GRADE_FILTERS.filter(Boolean).map(gl => <option key={gl} value={gl}>{GRADES[gl].full}</option>)}
            </select>
          </div>
          <button onClick={load} style={S.btnPrint}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="นักเรียนทั้งหมด" value={totals.total.toLocaleString()} color="#3b82f6" />
        <StatCard label="วัดแล้ว" value={totals.measured.toLocaleString()} color="#7c3aed" />
        <div onClick={() => setChartFilter(chartFilter === "ok" ? null : "ok")} style={{ cursor: "pointer" }}>
          <StatCardOutline active={chartFilter === "ok"} color="#16a34a" label="ดี/ดีมาก" value={`${totals.ok} คน`} sub={`${totals.okPct}% ของที่วัดแล้ว`} />
        </div>
        <div onClick={() => setChartFilter(chartFilter === "warn" ? null : "warn")} style={{ cursor: "pointer" }}>
          <StatCardOutline active={chartFilter === "warn"} color="#f59e0b" label="พอใช้" value={`${totals.warn} คน`} sub={`${totals.warnPct}% ของที่วัดแล้ว`} />
        </div>
        <div onClick={() => setChartFilter(chartFilter === "bad" ? null : "bad")} style={{ cursor: "pointer" }}>
          <StatCardOutline active={chartFilter === "bad"} color="#dc2626" label="ต้องปรับปรุง" value={`${totals.bad} คน`} sub={`${totals.badPct}% ของที่วัดแล้ว`} />
        </div>
      </div>

      {chartFilter && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700,
            color: chartFilter === "ok" ? "#16a34a" : chartFilter === "warn" ? "#b45309" : "#dc2626" }}>
            {chartFilter === "ok" ? "✅ กราฟ: ดี/ดีมาก" : chartFilter === "warn" ? "⚠️ กราฟ: พอใช้" : "🚨 กราฟ: ต้องปรับปรุง"}
          </span>
          <button onClick={() => setChartFilter(null)} style={{ ...S.btnPrint, background: "#f1f5f9", color: "#6b7280", boxShadow: "none" }}>✕ ดูทั้งหมด</button>
        </div>
      )}

      {filteredRows.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>📊 สัดส่วนผลการประเมินรายห้องเรียน (ร้อยละของนักเรียนที่วัดแล้ว)</div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={filteredRows} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
              <XAxis dataKey="room_name" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v, name) => [`${v ?? 0}%`, name]} />
              <Legend verticalAlign="top" height={36} />
              {(!chartFilter || chartFilter === "ok") && (
                <Bar dataKey="okPct" name="✅ ดี/ดีมาก" fill="#16a34a" stackId={chartFilter ? undefined : "a"} radius={chartFilter ? [4, 4, 0, 0] : undefined} />
              )}
              {(!chartFilter || chartFilter === "warn") && (
                <Bar dataKey="warnPct" name="⚠️ พอใช้" fill="#f59e0b" stackId={chartFilter ? undefined : "a"} radius={chartFilter ? [4, 4, 0, 0] : undefined} />
              )}
              {(!chartFilter || chartFilter === "bad") && (
                <Bar dataKey="badPct" name="🚨 ต้องปรับปรุง" fill="#dc2626" stackId={chartFilter ? undefined : "a"} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>📋 ตารางสรุปรายห้องเรียน</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
              {["ห้องเรียน", "นักเรียนทั้งหมด", "วัดแล้ว", "✅ ดี/ดีมาก", "% ดี/ดีมาก", "⚠️ พอใช้", "% พอใช้", "🚨 ปรับปรุง", "% ปรับปรุง"].map(h =>
                <th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filteredRows.map((r, i) => (
                <tr key={r.room_name} style={{ textAlign: "center", background: i % 2 === 0 ? "#f8faff" : "#fff" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#1e3a8a" }}>{r.room_name}</td>
                  <td style={tdStyle}>{r.total}</td>
                  <td style={tdStyle}>{r.measured}</td>
                  <td style={{ ...tdStyle, color: "#16a34a", fontWeight: 700 }}>{r.ok}</td>
                  <td style={tdStyle}><span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{r.okPct}%</span></td>
                  <td style={{ ...tdStyle, color: "#b45309", fontWeight: 700 }}>{r.warn}</td>
                  <td style={tdStyle}><span style={{ background: "#fef9c3", color: "#854d0e", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{r.warnPct}%</span></td>
                  <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 700 }}>{r.bad}</td>
                  <td style={tdStyle}><span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{r.badPct}%</span></td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>📭 ไม่พบข้อมูลห้องเรียนที่รองรับ (ป.1–ป.6, ม.1–ม.6) ในตัวกรองนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function StatCardOutline({ label, value, sub, color, active }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px",
      border: `2px solid ${color}30`, outline: active ? `3px solid ${color}` : "none" }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════
// ManagersPage — จัดการผู้ดูแลโครงการอ่าน-เขียน (เฉพาะแอดมินตัวจริง)
// ══════════════════════════════════════════════════════════════
function ManagersPage({ currentUser }) {
  const [managers, setManagers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: mgData } = await supabase
      .from("reading_writing_project_managers")
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false });

    const { data: usrData } = await supabase
      .from("users")
      .select("id, first_name, last_name, title, role")
      .order("first_name");

    const userMap = {};
    (usrData || []).forEach(u => { userMap[u.id] = u; });

    const merged = (mgData || []).map(m => ({ ...m, user: userMap[m.user_id] || null }));
    setManagers(merged);
    setAllUsers(usrData || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const managerIds = useMemo(() => new Set(managers.map(m => m.user_id)), [managers]);

  const filtered = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allUsers.filter(u =>
      !managerIds.has(u.id) &&
      (`${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || (u.title || "").toLowerCase().includes(q))
    ).slice(0, 8);
  }, [allUsers, search, managerIds]);

  const handleAdd = async (userToAdd) => {
    setAdding(true);
    const { error } = await supabase
      .from("reading_writing_project_managers")
      .upsert([{ user_id: userToAdd.id, added_by: currentUser.id }], { onConflict: "user_id", ignoreDuplicates: true });
    if (error) alert("❌ " + error.message);
    else { setSearch(""); await loadData(); }
    setAdding(false);
  };

  const handleRemove = async (id) => {
    if (!confirm("ยืนยันการลบผู้ดูแลโครงการคนนี้?")) return;
    await supabase.from("reading_writing_project_managers").delete().eq("id", id);
    await loadData();
  };

  const roleLabel = { homeroom_teacher: "ครูประจำชั้น", subject_teacher: "ครูผู้สอน", admin: "ผู้ดูแลระบบ",
    director: "ผู้อำนวยการ", deputy_director: "รองผู้อำนวยการ", dept_head: "หัวหน้าฝ่าย", grade_head: "หัวหน้าระดับ" };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ ...S.card, background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "1px solid #fcd34d" }}>
        <div style={{ fontWeight: 700, color: "#92400e", fontSize: 14, marginBottom: 4 }}>⚙️ ผู้ดูแลโครงการอ่าน-เขียน</div>
        <div style={{ color: "#92400e", fontSize: 13 }}>ผู้ดูแลโครงการสามารถดูภาพรวมผลการประเมินทุกห้อง/ทุกสายชั้นได้ เหมือนผู้บริหาร โดยไม่ต้องเปลี่ยนตำแหน่งในระบบ</div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>➕ เพิ่มผู้ดูแลโครงการ</div>
        <div style={{ position: "relative" }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 พิมพ์ชื่อหรือนามสกุลเพื่อค้นหา..."
            style={{ ...S.select, width: "100%" }} />
          {filtered.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
              border: "1.5px solid #c7d2fe", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              zIndex: 50, overflow: "hidden", marginTop: 4 }}>
              {filtered.map(u => (
                <button key={u.id} onClick={() => handleAdd(u)} disabled={adding}
                  style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent",
                    textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 8, fontFamily: "inherit", borderBottom: "1px solid #f0f4ff" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 14 }}>{u.title}{u.first_name} {u.last_name}</span>
                    <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>{roleLabel[u.role] || u.role}</span>
                  </div>
                  <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>+ เพิ่ม</span>
                </button>
              ))}
            </div>
          )}
          {search.length > 0 && filtered.length === 0 && (
            <div style={{ padding: "12px 14px", color: "#9ca3af", fontSize: 13, marginTop: 4,
              background: "#f8faff", borderRadius: 10, border: "1px solid #e0e7ff" }}>
              ไม่พบผู้ใช้ หรืออาจเป็นผู้ดูแลโครงการอยู่แล้ว
            </div>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>👥 ผู้ดูแลโครงการปัจจุบัน ({managers.length} คน)</div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>⏳ กำลังโหลด...</div>
        ) : managers.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#9ca3af" }}>ยังไม่มีผู้ดูแลโครงการ</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {managers.map(m => {
              const u = m.user;
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", background: "#f8faff", borderRadius: 12, border: "1px solid #e0e7ff" }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 14 }}>{u?.title}{u?.first_name} {u?.last_name}</span>
                    <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>{roleLabel[u?.role] || u?.role}</span>
                  </div>
                  <button onClick={() => handleRemove(m.id)}
                    style={{ padding: "7px 14px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5",
                      borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                    🗑️ ลบ
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}