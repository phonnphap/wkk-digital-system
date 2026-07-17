// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { differenceInMonths, differenceInYears } from "date-fns";

const supabase = createClient();
const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

// ============================================================
// โครงสร้างเครื่องมือคัดกรอง "ความสามารถในการอ่านและการเขียน"
// อ้างอิงคำชี้แจง สถาบันภาษาไทย สวก. สพฐ. (ภาคเรียนที่ ๑ กรกฎาคม ๒๕๖๙)
// ============================================================
const GRADES = {
  1: {
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
  2: {
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
  3: {
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
  4: {
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
  5: {
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
  6: {
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
// ห้องเรียนที่รองรับต้องเป็นระดับประถมศึกษา ป.1-ป.6 (รูปแบบชื่อห้อง เช่น "ป.4/1")
function parseGradeLevel(roomName) {
  const m = (roomName || "").match(/^ป\.?(\d+)/);
  if (!m) return null;
  const lvl = Number(m[1]);
  return lvl >= 1 && lvl <= 6 ? lvl : null;
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

// ── เหมือนระบบโภชนาการ: ดึงเฉพาะห้องเรียนที่ผู้ใช้เป็นครูประจำชั้น (หรือทั้งหมดถ้าเป็นแอดมิน) ──
async function fetchMyClassrooms(userId) {
  const rpc = await supabase.rpc("get_my_classrooms");
  if (rpc.data && rpc.data.length > 0) return sortClassrooms(rpc.data);
  const fb = await supabase.from("classrooms")
    .select("id,room_name,room_number,academic_year_id")
    .or(`homeroom_teacher_id.eq.${userId},homeroom_teacher_2_id.eq.${userId}`);
  return sortClassrooms((fb.data || []).map(c => ({ ...c, classroom_id: c.id })));
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

// ── Styles (สอดคล้องกับระบบโภชนาการ) ──────────────────────────
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
// Main App — โครงสร้าง auth เหมือนระบบโภชนาการทุกประการ
// ══════════════════════════════════════════════════════════════
export default function ReadingWritingApp() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assess");

  const isAdmin = useMemo(() => ADMIN_ROLES.includes(currentUser?.role ?? ""), [currentUser]);

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
      if (data) setCurrentUser(data);
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
    ? [{ key: "assess", label: "✏️ บันทึกคะแนน" }, { key: "overview", label: "🏫 ภาพรวมโรงเรียน" }]
    : [{ key: "assess", label: "✏️ บันทึกคะแนน" }];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.headerTitle}>📖 ระบบบันทึกคะแนนความสามารถในการอ่านและการเขียน</h1>
          <p style={S.headerSub}>{currentUser.title}{currentUser.first_name} {currentUser.last_name} · {roleLabel}</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 14px",
          color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>ภาคเรียนที่ ๑ / ๒๕๖๙</div>
      </div>
      <div style={S.tabBar}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={S.tab(tab === t.key)}>{t.label}</button>)}
      </div>
      <div style={S.content}>
        {tab === "assess" && <AssessPage currentUser={currentUser} isAdmin={isAdmin} />}
        {tab === "overview" && isAdmin && <OverviewPage />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// AssessPage — ครูประจำชั้นเห็นเฉพาะห้องตัวเองอัตโนมัติ (fetchMyClassrooms)
// แอดมิน/ผู้บริหารเลือกดูได้ทุกห้อง
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

  // โหลดห้องเรียน: ครูประจำชั้น -> เฉพาะห้องตัวเอง / แอดมิน -> ทุกห้อง
  useEffect(() => {
    if (!currentUser) return;
    setLoadingRooms(true);
    const load = async () => {
      let rooms = [];
      if (isAdmin) {
        const { data } = await supabase.from("classrooms")
          .select("id,room_name,room_number,academic_year_id");
        rooms = sortClassrooms((data || []).map(c => ({ ...c, classroom_id: c.id })));
      } else {
        rooms = await fetchMyClassrooms(currentUser.id); // ← ข้อจำกัดอัตโนมัติตามครูที่ล็อกอิน
      }
      setClassrooms(rooms);
      if (rooms.length > 0) setSelectedClass(rooms[0]);
      setLoadingRooms(false);
    };
    load();
  }, [currentUser, isAdmin]);

  // โหลดรายชื่อนักเรียนของห้องที่เลือก (ใช้ RPC เดียวกับระบบโภชนาการ — คืนเฉพาะนักเรียนในห้องของครูคนนั้น)
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
        ไม่พบห้องเรียนที่คุณเป็นครูประจำชั้น<br />
        <span style={{ fontSize: 13, color: "#9ca3af" }}>กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบข้อมูลครูประจำชั้น</span>
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
            เครื่องมือนี้รองรับเฉพาะระดับชั้น ป.1–ป.6 เท่านั้น (ตรวจไม่พบระดับชั้นจากชื่อห้อง &quot;{selectedClass?.room_name}&quot;)
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
// OverviewPage — เฉพาะแอดมิน/ผู้บริหาร เห็นทุกห้อง
// ══════════════════════════════════════════════════════════════
function OverviewPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: classrooms } = await supabase.from("classrooms")
      .select("id,room_name,student_count,academic_year_id");
    const { data: records } = await supabase.from("reading_writing_records").select("*");

    const summary = sortClassrooms(classrooms || []).map(c => {
      const gradeLevel = parseGradeLevel(c.room_name);
      const g = gradeLevel ? GRADES[gradeLevel] : null;
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
      return { room_name: c.room_name, gradeLevel, total: c.student_count || 0, measured: recs.length, ok, warn, bad };
    });
    setRows(summary);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ ...S.card, textAlign: "center", padding: 40 }}>⏳ กำลังโหลด...</div>;

  return (
    <div style={S.card}>
      <div style={S.cardTitle}><span>🏫 สรุปผลรายห้องเรียน — ทุกระดับชั้น</span>
        <button onClick={load} style={S.btnPrint}>🔄 รีเฟรช</button></div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
            {["ห้องเรียน", "นักเรียนทั้งหมด", "วัดแล้ว", "ดี/ดีมาก", "พอใช้", "ต้องปรับปรุง"].map(h =>
              <th key={h} style={thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.room_name} style={{ textAlign: "center" }}>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#1e3a8a" }}>{r.room_name}</td>
                <td style={tdStyle}>{r.total}</td>
                <td style={tdStyle}>{r.measured}</td>
                <td style={{ ...tdStyle, color: "#16a34a", fontWeight: 700 }}>{r.ok}</td>
                <td style={{ ...tdStyle, color: "#b45309", fontWeight: 700 }}>{r.warn}</td>
                <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 700 }}>{r.bad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}