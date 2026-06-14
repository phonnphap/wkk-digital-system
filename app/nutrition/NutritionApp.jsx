"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { differenceInMonths, differenceInYears, format, parseISO } from "date-fns";
import { th } from "date-fns/locale";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

const MEDIAN_HEIGHT = {
  male: { 24:87.1,30:91.2,36:95.2,42:98.7,48:102.0,54:105.1,60:108.0,66:111.5,72:114.7,84:120.7,96:126.4,108:131.7,120:136.8,132:141.6,144:146.2,156:151.5,168:157.3,180:163.1,192:167.0,204:169.5,216:170.1 },
  female: { 24:85.7,30:90.2,36:94.1,42:97.6,48:100.9,54:103.9,60:107.2,66:110.5,72:113.6,84:119.6,96:125.4,108:130.7,120:135.5,132:140.8,144:147.0,156:152.4,168:157.1,180:160.5,192:162.5,204:163.8,216:163.8 }
};
const MEDIAN_WEIGHT_FOR_HEIGHT = {
  male:   { 80:11,90:12.5,100:14.5,110:17,120:20,130:24,140:28.5,150:34,160:41,170:50,180:58 },
  female: { 80:10.5,90:12,100:14,110:16.5,120:19.5,130:23,140:27.5,150:34,160:42,170:49,180:53 }
};

function getClosestMedian(refTable, key) {
  const keys = Object.keys(refTable).map(Number).sort((a, b) => a - b);
  return refTable[keys.reduce((p, c) => Math.abs(c - key) < Math.abs(p - key) ? c : p)];
}
function getMedianHeight(ageMonths, gender) {
  return getClosestMedian(gender === "male" ? MEDIAN_HEIGHT.male : MEDIAN_HEIGHT.female, ageMonths) || 110;
}
function getMedianWeightForHeight(heightCm, gender) {
  return getClosestMedian(gender === "male" ? MEDIAN_WEIGHT_FOR_HEIGHT.male : MEDIAN_WEIGHT_FOR_HEIGHT.female, Math.round(heightCm / 10) * 10) || 20;
}
function calcNutrition(student, weightKg, heightCm, measuredDate) {
  const ageM = differenceInMonths(new Date(measuredDate), new Date(student.birth_date));
  const genderKey = student.gender === "ชาย" || student.gender === "male" ? "male" : "female";
  const medH = getMedianHeight(ageM, genderKey);
  const medW = getMedianWeightForHeight(heightCm, genderKey);
  const ibw = getMedianWeightForHeight(medH, genderKey);
  const pctHA = Math.round((heightCm / medH) * 100);
  const pctWH = Math.round((weightKg / medW) * 100);
  return {
    age_months: ageM, median_height: +medH.toFixed(2), median_weight_for_height: +medW.toFixed(2),
    ibw_kg: +ibw.toFixed(2), pct_height_for_age: pctHA, pct_weight_for_height: pctWH,
    ha_status: getHAStatus(pctHA).label, wh_status: getWHStatus(pctWH).label,
  };
}
function getHAStatus(pct) {
  if (pct < 85) return { label: "เตี้ยแคระแกร็น (Severe stunted)", color: "#fff", bg: "#dc2626", emoji: "⚠️" };
  if (pct < 90) return { label: "เตี้ย (Stunted)", color: "#fff", bg: "#ef4444", emoji: "📉" };
  if (pct < 95) return { label: "ค่อนข้างเตี้ย", color: "#92400e", bg: "#fef3c7", emoji: "📊" };
  if (pct <= 105) return { label: "ตามเกณฑ์", color: "#fff", bg: "#16a34a", emoji: "✅" };
  if (pct <= 110) return { label: "ค่อนข้างสูง", color: "#fff", bg: "#2563eb", emoji: "📈" };
  if (pct <= 120) return { label: "สูง", color: "#fff", bg: "#7c3aed", emoji: "🌟" };
  return { label: "สูงมาก", color: "#fff", bg: "#4f46e5", emoji: "🏆" };
}
function getWHStatus(pct) {
  if (pct < 60) return { label: "ผอมแห้ง (Severe wasted)", color: "#fff", bg: "#dc2626", emoji: "⚠️" };
  if (pct < 70) return { label: "ผอม (Wasted)", color: "#fff", bg: "#ef4444", emoji: "📉" };
  if (pct < 80) return { label: "ค่อนข้างผอม", color: "#92400e", bg: "#fef3c7", emoji: "📊" };
  if (pct <= 110) return { label: "สมส่วน", color: "#fff", bg: "#16a34a", emoji: "✅" };
  if (pct <= 120) return { label: "ท้วม", color: "#92400e", bg: "#fed7aa", emoji: "📊" };
  if (pct <= 130) return { label: "เริ่มอ้วน (Overweight)", color: "#fff", bg: "#ea580c", emoji: "📈" };
  return { label: "อ้วน (Obese)", color: "#fff", bg: "#b91c1c", emoji: "⚠️" };
}
function formatAge(birthDate) {
  const today = new Date();
  const y = differenceInYears(today, new Date(birthDate));
  const m = differenceInMonths(today, new Date(birthDate)) % 12;
  return `${y} ปี ${m} เดือน`;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  page: { fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f0f4ff", minHeight: "100vh" },
  header: {
    background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #06b6d4 100%)",
    padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between",
    alignItems: "center", boxShadow: "0 4px 20px rgba(30,64,175,0.3)", gap: 12
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, margin: "2px 0 0" },
  backBtn: {
    background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)",
    color: "#fff", borderRadius: 10, padding: "8px 14px", cursor: "pointer",
    fontSize: 13, fontWeight: 700, fontFamily: "inherit", display: "flex",
    alignItems: "center", gap: 6, transition: "background 0.15s", flexShrink: 0
  },
  tabBar: {
    background: "#fff", padding: "0 1.5rem",
    borderBottom: "2px solid #e0e7ff", display: "flex", gap: 0,
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflowX: "auto"
  },
  tab: (active) => ({
    padding: "14px 20px", border: "none", background: "transparent",
    cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? "#1e40af" : "#6b7280",
    borderBottom: active ? "3px solid #1e40af" : "3px solid transparent",
    transition: "all 0.2s", marginBottom: -2, whiteSpace: "nowrap"
  }),
  content: { maxWidth: 1200, margin: "0 auto", padding: "1.5rem" },
  card: {
    background: "#fff", borderRadius: 16, padding: "1.25rem",
    marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    border: "1px solid #e0e7ff"
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#1e3a8a", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 },
  label: { fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4, display: "block" },
  select: {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1.5px solid #c7d2fe", fontSize: 14, background: "#f8faff",
    color: "#1e3a8a", fontFamily: "inherit", outline: "none",
    cursor: "pointer", transition: "border-color 0.2s"
  },
  input: {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1.5px solid #c7d2fe", fontSize: 14, background: "#f8faff",
    color: "#1e3a8a", fontFamily: "inherit", outline: "none", boxSizing: "border-box"
  },
  btn: {
    padding: "11px 24px", background: "linear-gradient(135deg,#1e40af,#3b82f6)",
    color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
    fontSize: 14, fontWeight: 700, boxShadow: "0 4px 12px rgba(59,130,246,0.35)",
    transition: "transform 0.1s, box-shadow 0.1s", fontFamily: "inherit"
  },
};

function Badge({ status }) {
  if (!status) return null;
  return (
    <span style={{
      background: status.bg, color: status.color, padding: "4px 12px",
      borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 4
    }}>
      {status.emoji} {status.label}
    </span>
  );
}

function StatCard({ label, value, color, icon, sub }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "16px 18px",
      border: `2px solid ${color}20`, boxShadow: `0 4px 16px ${color}15`,
      display: "flex", flexDirection: "column", gap: 4
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "#1e3a8a" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: "1px solid #f0f4ff", fontSize: 13
    }}>
      <span style={{ color: "#6b7280", fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#1e3a8a" }}>{value}</span>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function NutritionApp() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assess");

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

  const isAdmin = useMemo(() => ADMIN_ROLES.includes(currentUser?.role), [currentUser]);

  // ตั้งค่า tab เริ่มต้นให้เหมาะกับ role
  useEffect(() => {
    if (!currentUser) return;
    setTab(isAdmin ? "class" : "assess");
  }, [currentUser, isAdmin]);

  if (loading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div>
        <div style={{ fontSize: 16, color: "#3b82f6", fontWeight: 600 }}>กำลังโหลดระบบ...</div>
      </div>
    </div>
  );
  if (!currentUser) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#dc2626", fontSize: 16, fontWeight: 600 }}>❌ กรุณาเข้าสู่ระบบก่อน</div>
    </div>
  );

  // ── Tabs ตาม role ──────────────────────────────────────────────
  // ครูประจำชั้น: ประเมินรายห้อง (กรอกข้อมูล) + รายห้องเรียน + เปรียบเทียบเทอม
  // ผู้บริหาร/ผู้ดูแล: รายห้องเรียน + เปรียบเทียบเทอม + ผู้บริหาร (ไม่มีฟอร์มกรอกข้อมูล)
  const tabs = isAdmin
    ? [
        { key: "class", label: "📋 รายห้องเรียน" },
        { key: "compare", label: "📊 เปรียบเทียบเทอม" },
        { key: "admin", label: "🏫 ผู้บริหาร" },
      ]
    : [
        { key: "assess", label: "✏️ ประเมินรายห้อง" },
        { key: "class", label: "📋 รายห้องเรียน" },
        { key: "compare", label: "📊 เปรียบเทียบเทอม" },
      ];

  const roleLabel = {
    homeroom_teacher: "ครูประจำชั้น", subject_teacher: "ครูผู้สอน",
    admin: "ผู้ดูแลระบบ", director: "ผู้อำนวยการ",
    deputy_director: "รองผู้อำนวยการ", dept_head: "หัวหน้าฝ่าย", grade_head: "หัวหน้าระดับ"
  }[currentUser.role] || currentUser.role;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button
          onClick={() => router.push("/dashboard")}
          style={S.backBtn}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
        >
          ← แดชบอร์ด
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.headerTitle}>🌱 ระบบประเมินภาวะโภชนาการนักเรียน</h1>
          <p style={S.headerSub}>{currentUser.first_name} {currentUser.last_name} · {roleLabel}</p>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.2)", borderRadius: 10,
          padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0
        }}>
          โรงเรียนวัดเขียนเขต
        </div>
      </div>

      <div style={S.tabBar}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={S.tab(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.content}>
        {tab === "assess"  && !isAdmin && <ClassAssessPage currentUser={currentUser} />}
        {tab === "class"   && <ClassPage   currentUser={currentUser} isAdmin={isAdmin} />}
        {tab === "compare" && <ComparePage currentUser={currentUser} isAdmin={isAdmin} />}
        {tab === "admin"   && isAdmin && <AdminPage currentUser={currentUser} />}
      </div>
    </div>
  );
}

// ── ClassAssessPage (ใหม่) ──────────────────────────────────────────────────
// ครูประจำชั้นเห็นรายชื่อนักเรียนทั้งห้องพร้อมเลขที่ กรอก น้ำหนัก/ส่วนสูง ได้ทีเดียว
// แต่ละแถวมีปุ่ม "ดูกราฟ" เพื่อเปิดดูรายละเอียด/กราฟรายบุคคล
function ClassAssessPage({ currentUser }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [term, setTerm] = useState("term1");
  const [measuredDate, setMeasuredDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [values, setValues] = useState({}); // { [student_id]: { weight, height, seat } }
  const [existing, setExisting] = useState({}); // { [student_id]: record for this term }
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [detailStudent, setDetailStudent] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // โหลดห้องเรียนของครู (รองรับทั้ง RPC และ fallback query ตรง)
  useEffect(() => {
    if (!currentUser) return;
    const loadClassrooms = async () => {
      let rooms = [];
      const rpcRes = await supabase.rpc("get_my_classrooms");
      if (rpcRes.data && rpcRes.data.length > 0) {
        rooms = rpcRes.data;
      } else {
        const fb = await supabase.from("classrooms")
          .select("id, room_name, room_number, academic_year_id")
          .eq("homeroom_teacher_id", currentUser.id)
          .order("room_number");
        rooms = (fb.data || []).map(c => ({ ...c, classroom_id: c.id }));
      }
      setClassrooms(rooms);
      if (rooms.length >= 1) setSelectedClass(rooms[0]);
    };
    loadClassrooms();
  }, [currentUser]);

  // โหลดรายชื่อนักเรียน
  useEffect(() => {
    if (!selectedClass) return;
    const cid = selectedClass.classroom_id || selectedClass.id;
    setLoadingStudents(true);
    supabase.rpc("get_my_students", { p_classroom_id: cid }).then(({ data }) => {
      const list = data || [];
      setStudents(list);
      setLoadingStudents(false);
    });
  }, [selectedClass]);

  // โหลดข้อมูลที่บันทึกไว้แล้วสำหรับเทอมนี้ (เพื่อ pre-fill)
  useEffect(() => {
    if (!selectedClass || students.length === 0) return;
    const cid = selectedClass.classroom_id || selectedClass.id;
    const ay = selectedClass.academic_year_id;
    supabase.from("v_nutrition_student_detail").select("*")
      .eq("classroom_id", cid).eq("term", term)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.student_id] = r; });
        setExisting(map);
        // pre-fill ค่าน้ำหนัก/ส่วนสูง/เลขที่
        setValues(prev => {
          const next = { ...prev };
          students.forEach(s => {
            const ex = map[s.student_id];
            next[s.student_id] = {
              weight: ex?.weight_kg ?? next[s.student_id]?.weight ?? "",
              height: ex?.height_cm ?? next[s.student_id]?.height ?? "",
              seat: s.seat_number ?? next[s.student_id]?.seat ?? "",
            };
          });
          return next;
        });
      });
  }, [selectedClass, students, term]);

  function setVal(studentId, field, val) {
    setValues(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [field]: val } }));
  }

  // คำนวณผลแบบ live ต่อแถว
  const rows = useMemo(() => {
    return students.map(s => {
      const v = values[s.id] || {};
      const w = parseFloat(v.weight), h = parseFloat(v.height);
      let result = null;
      if (w >= 5 && h >= 50) {
        result = { ...calcNutrition(s, w, h, measuredDate), weight_kg: w, height_cm: h };
      }
      return { student: s, v, result };
    });
  }, [students, values, measuredDate]);

  const filledCount = rows.filter(r => r.result).length;

  const handleSaveAll = async () => {
    if (!selectedClass) return;
    const cid = selectedClass.classroom_id || selectedClass.id;
    const ay = selectedClass.academic_year_id;
    const toSave = rows.filter(r => r.result).map(r => ({
      student_id: r.student.student_id,
      classroom_id: cid,
      academic_year_id: ay,
      recorded_by: currentUser.id,
      term, measured_date: measuredDate,
      weight_kg: r.result.weight_kg, height_cm: r.result.height_cm,
      age_months: r.result.age_months,
      median_height: r.result.median_height,
      median_weight_for_height: r.result.median_weight_for_height,
      ibw_kg: r.result.ibw_kg,
      pct_height_for_age: r.result.pct_height_for_age,
      pct_weight_for_height: r.result.pct_weight_for_height,
      ha_status: r.result.ha_status,
      wh_status: r.result.wh_status,
    }));

    if (toSave.length === 0) { setSaveMsg("⚠️ กรุณากรอกน้ำหนัก/ส่วนสูงอย่างน้อย 1 คน"); return; }

    setSaving(true); setSaveMsg("");

    // บันทึกเลขที่ (seat_number) ที่เปลี่ยนแปลง
    const seatUpdates = students.filter(s => {
      const v = values[s.student_id];
      return v?.seat !== "" && v?.seat != null && Number(v.seat) !== s.seat_number;
    });
    for (const s of seatUpdates) {
      await supabase.from("students").update({ seat_number: Number(values[s.student_id].seat) }).eq("id", s.student_id);
    }

    const { error } = await supabase.from("nutrition_records")
      .upsert(toSave, { onConflict: "student_id,academic_year_id,term" });

    setSaving(false);
    setSaveMsg(error ? `❌ ${error.message}` : `✅ บันทึกสำเร็จ ${toSave.length} คน`);
  };

  if (classrooms.length === 0) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏫</div>
        <div style={{ color: "#6b7280", fontSize: 15, fontWeight: 600 }}>
          ไม่พบห้องเรียนที่คุณเป็นครูประจำชั้น<br />
          <span style={{ fontSize: 13, color: "#9ca3af" }}>กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบข้อมูลครูประจำชั้น</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ตัวเลือกห้อง/เทอม/วันที่ */}
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {classrooms.length > 1 ? (
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={S.label}>ห้องเรียน</label>
              <select style={S.select}
                value={selectedClass?.classroom_id || selectedClass?.id || ""}
                onChange={e => setSelectedClass(classrooms.find(c => (c.classroom_id || c.id) === e.target.value))}>
                {classrooms.map(c => (
                  <option key={c.classroom_id || c.id} value={c.classroom_id || c.id}>{c.room_name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 160, background: "#eff6ff", borderRadius: 10, padding: "10px 14px", color: "#1e40af", fontWeight: 700, fontSize: 14 }}>
              📚 {classrooms[0].room_name} <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>(ห้องประจำชั้นของคุณ)</span>
            </div>
          )}
          <div style={{ minWidth: 150 }}>
            <label style={S.label}>ครั้งที่วัด</label>
            <select style={S.select} value={term} onChange={e => setTerm(e.target.value)}>
              <option value="term1">🌸 ครั้งที่ 1 (เทอม 1)</option>
              <option value="term2">🍂 ครั้งที่ 2 (เทอม 2)</option>
            </select>
          </div>
          <div style={{ minWidth: 150 }}>
            <label style={S.label}>วันที่วัด</label>
            <input type="date" style={S.input} value={measuredDate} onChange={e => setMeasuredDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* สถิติย่อ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="นักเรียนทั้งหมด" value={students.length} color="#3b82f6" icon="👨‍👩‍👧‍👦" sub="คน" />
        <StatCard label="กรอกข้อมูลแล้ว" value={filledCount} color="#16a34a" icon="✅" sub="คน" />
        <StatCard label="ยังไม่กรอก" value={students.length - filledCount} color="#f59e0b" icon="⏳" sub="คน" />
      </div>

      {/* ตารางกรอกข้อมูลทั้งห้อง */}
      <div style={S.card}>
        <div style={S.cardTitle}>📝 บันทึกน้ำหนัก-ส่วนสูง ทั้งห้อง — {selectedClass?.room_name}</div>
        {loadingStudents ? (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ กำลังโหลดรายชื่อนักเรียน...</div>
        ) : students.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>📭 ไม่พบนักเรียนในห้องนี้</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                  {["เลขที่","ชื่อ-นามสกุล","อายุ","น้ำหนัก (กก.)","ส่วนสูง (ซม.)","ภาวะ WH","ภาวะ HA",""].map(h => (
                    <th key={h} style={{ padding: "10px 8px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const s = r.student;
                  const v = values[s.student_id] || {};
                  return (
                    <tr key={s.student_id} style={{ background: i % 2 === 0 ? "#f8faff" : "#fff" }}>
                      <td style={{ padding: "6px 8px", width: 60 }}>
                        <input type="number" min="1" placeholder="-" value={v.seat ?? ""}
                          onChange={e => setVal(s.student_id, "seat", e.target.value)}
                          style={{ ...S.input, padding: "6px 8px", textAlign: "center", width: 56 }} />
                      </td>
                      <td style={{ padding: "8px", fontWeight: 600, color: "#1e3a8a", whiteSpace: "nowrap" }}>
                        {s.gender === "male" || s.gender === "ชาย" ? "ด.ช. " : "ด.ญ. "}{s.first_name} {s.last_name}
                        {s.nick_name && <span style={{ color: "#9ca3af", fontWeight: 400 }}> ({s.nick_name})</span>}
                      </td>
                      <td style={{ padding: "8px", color: "#6b7280", whiteSpace: "nowrap" }}>{formatAge(s.birth_date)}</td>
                      <td style={{ padding: "6px 8px", width: 100 }}>
                        <input type="number" step="0.1" placeholder="0.0" value={v.weight ?? ""}
                          onChange={e => setVal(s.student_id, "weight", e.target.value)}
                          style={{ ...S.input, padding: "6px 8px", width: 90 }} />
                      </td>
                      <td style={{ padding: "6px 8px", width: 100 }}>
                        <input type="number" step="0.1" placeholder="0.0" value={v.height ?? ""}
                          onChange={e => setVal(s.student_id, "height", e.target.value)}
                          style={{ ...S.input, padding: "6px 8px", width: 90 }} />
                      </td>
                      <td style={{ padding: "8px" }}>
                        {r.result ? <Badge status={getWHStatus(r.result.pct_weight_for_height)} /> : <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px" }}>
                        {r.result ? <Badge status={getHAStatus(r.result.pct_height_for_age)} /> : <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px" }}>
                        <button onClick={() => setDetailStudent(s)}
                          style={{ ...S.btn, padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}>
                          📈 ดูกราฟ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {students.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={handleSaveAll} disabled={saving} style={{ ...S.btn, opacity: saving ? 0.6 : 1 }}>
              {saving ? "⏳ กำลังบันทึก..." : `💾 บันทึกข้อมูลทั้งห้อง (${filledCount} คน)`}
            </button>
            {saveMsg && (
              <div style={{
                padding: "8px 16px", borderRadius: 10,
                background: saveMsg.includes("✅") ? "#f0fdf4" : saveMsg.includes("⚠️") ? "#fffbeb" : "#fef2f2",
                color: saveMsg.includes("✅") ? "#16a34a" : saveMsg.includes("⚠️") ? "#b45309" : "#dc2626",
                fontWeight: 700, fontSize: 13
              }}>{saveMsg}</div>
            )}
          </div>
        )}
      </div>

      {/* รายละเอียด/กราฟรายบุคคล */}
      {detailStudent && (
        <StudentDetailPanel
          student={detailStudent}
          classroomId={selectedClass?.classroom_id || selectedClass?.id}
          onClose={() => setDetailStudent(null)}
        />
      )}
    </div>
  );
}

// ── StudentDetailPanel — กราฟ + รายละเอียดรายบุคคล ─────────────────────────────
function StudentDetailPanel({ student, classroomId, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from("v_nutrition_student_detail").select("*")
      .eq("student_id", student.student_id)
      .order("term")
      .then(({ data }) => { setRecords(data || []); setLoading(false); });
  }, [student]);

  const latest = records[records.length - 1];
  const gender = student.gender === "ชาย" || student.gender === "male" ? "male" : "female";

  return (
    <div style={{ ...S.card, border: "2px solid #c7d2fe", position: "relative" }}>
      <button onClick={onClose}
        style={{
          position: "absolute", top: 14, right: 14, background: "#f1f5f9", border: "none",
          borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#6b7280"
        }}>✕</button>

      <div style={S.cardTitle}>
        📈 รายละเอียด — {student.gender === "ชาย" || student.gender === "male" ? "เด็กชาย" : "เด็กหญิง"} {student.first_name} {student.last_name}
        {student.nick_name && ` (${student.nick_name})`}
      </div>
      <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
        {formatAge(student.birth_date)} · รหัส {student.student_code}
        {student.seat_number ? ` · เลขที่ ${student.seat_number}` : ""}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 30, color: "#6b7280" }}>⏳ กำลังโหลด...</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>📭 ยังไม่มีข้อมูลการวัดของนักเรียนคนนี้</div>
      ) : (
        <>
          {/* ตารางเปรียบเทียบ 2 เทอม */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${records.length},1fr)`, gap: 10, marginBottom: 16 }}>
            {records.map(r => (
              <div key={r.term} style={{ background: "#f8faff", borderRadius: 12, padding: 12, border: "1px solid #e0e7ff" }}>
                <div style={{ fontWeight: 700, color: "#1e40af", fontSize: 13, marginBottom: 6 }}>
                  {r.term === "term1" ? "🌸 ครั้งที่ 1" : "🍂 ครั้งที่ 2"}
                </div>
                <InfoRow label="วันที่วัด" value={r.measured_date ? format(parseISO(r.measured_date), "d MMM yyyy", { locale: th }) : "—"} />
                <InfoRow label="น้ำหนัก" value={`${r.weight_kg} กก.`} />
                <InfoRow label="ส่วนสูง" value={`${r.height_cm} ซม.`} />
                <InfoRow label="IBW" value={`${r.ibw_kg} กก.`} />
                <InfoRow label="%HA" value={`${r.pct_height_for_age}%`} />
                <InfoRow label="%WH" value={`${r.pct_weight_for_height}%`} />
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Badge status={getWHStatus(r.pct_weight_for_height)} />
                  <Badge status={getHAStatus(r.pct_height_for_age)} />
                </div>
              </div>
            ))}
          </div>

          {/* กราฟ */}
          {latest && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13, marginBottom: 8 }}>📐 ส่วนสูงตามเกณฑ์อายุ</div>
                <HAChart student={student} actualHeight={latest.height_cm} ageMonths={latest.age_months} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13, marginBottom: 8 }}>⚖️ น้ำหนักตามเกณฑ์ส่วนสูง</div>
                <WHChart actualWeight={latest.weight_kg} actualHeight={latest.height_cm} gender={gender} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── ClassPage ─────────────────────────────────────────────────────────────────
function ClassPage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [term, setTerm] = useState("term1");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const loadClassrooms = async () => {
      if (isAdmin) {
        const { data } = await supabase.from("classrooms").select("id, room_name, room_number, academic_year_id").order("room_number");
        setClassrooms(data || []);
      } else {
        const rpcRes = await supabase.rpc("get_my_classrooms");
        let rooms = rpcRes.data || [];
        if (rooms.length === 0) {
          const fb = await supabase.from("classrooms")
            .select("id, room_name, room_number, academic_year_id")
            .eq("homeroom_teacher_id", currentUser.id).order("room_number");
          rooms = (fb.data || []).map(c => ({ ...c, classroom_id: c.id }));
        }
        setClassrooms(rooms);
        if (rooms.length === 1) setSelectedClass(rooms[0]);
      }
    };
    loadClassrooms();
  }, [currentUser, isAdmin]);

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    const { data } = await supabase.from("v_nutrition_student_detail").select("*")
      .eq("classroom_id", selectedClass.classroom_id || selectedClass.id)
      .eq("term", term).order("last_name");
    setRecords(data || []);
    setLoading(false);
  }, [selectedClass, term]);

  const summary = useMemo(() => {
    const total = records.length;
    let normal = 0, risk = 0, urgent = 0, unmeasured = 0;
    records.forEach(r => {
      if (!r.wh_status) { unmeasured++; return; }
      if (r.wh_status === "สมส่วน") normal++;
      else if (r.wh_status.includes("ผอม") && !r.wh_status.includes("แห้ง")) risk++;
      else urgent++;
    });
    return { total, normal, risk, urgent, unmeasured };
  }, [records]);

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {(isAdmin || classrooms.length > 1) && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={S.label}>ห้องเรียน</label>
              <select style={S.select} value={selectedClass?.id || selectedClass?.classroom_id || ""}
                onChange={e => setSelectedClass(classrooms.find(c => (c.id || c.classroom_id) === e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => <option key={c.id || c.classroom_id} value={c.id || c.classroom_id}>{c.room_name}</option>)}
              </select>
            </div>
          )}
          {!isAdmin && classrooms.length === 1 && (
            <div style={{ flex: 1, background: "#eff6ff", borderRadius: 10, padding: "10px 14px", color: "#1e40af", fontWeight: 700, fontSize: 14 }}>
              📚 {classrooms[0].room_name}
            </div>
          )}
          <div style={{ minWidth: 140 }}>
            <label style={S.label}>ครั้งที่</label>
            <select style={S.select} value={term} onChange={e => setTerm(e.target.value)}>
              <option value="term1">🌸 ครั้งที่ 1</option>
              <option value="term2">🍂 ครั้งที่ 2</option>
            </select>
          </div>
          <button onClick={load} style={S.btn}>🔍 แสดงผล</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="นักเรียนทั้งหมด" value={summary.total} color="#3b82f6" icon="👨‍👩‍👧‍👦" />
        <StatCard label="สมส่วน" value={summary.normal} color="#16a34a" icon="✅" />
        <StatCard label="เสี่ยงโภชนาการ" value={summary.risk} color="#f59e0b" icon="⚠️" />
        <StatCard label="ต้องดูแลเร่งด่วน" value={summary.urgent} color="#dc2626" icon="🚨" />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ กำลังโหลด...</div>
      ) : (
        <div style={S.card}>
          <div style={S.cardTitle}>📋 รายชื่อนักเรียน ({records.length} คน)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                  {["เลขที่","ชื่อ-นามสกุล","อายุ","เพศ","น้ำหนัก","ส่วนสูง","IBW","% HA","% WH","ภาวะ WH","ภาวะ HA"].map(h => (
                    <th key={h} style={{ padding: "10px 10px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.student_id + r.term} style={{ background: i % 2 === 0 ? "#f8faff" : "#fff", transition: "background 0.1s" }}>
                    <td style={{ padding: "8px 10px", color: "#6b7280" }}>{r.seat_number ?? "—"}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1e3a8a" }}>
                      {r.gender === "male" || r.gender === "ชาย" ? "ด.ช. " : "ด.ญ. "}{r.first_name} {r.last_name}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280" }}>{r.birth_date ? formatAge(r.birth_date) : "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.gender}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{r.weight_kg ?? "—"}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{r.height_cm ?? "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.ibw_kg ?? "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.pct_height_for_age ? r.pct_height_for_age + "%" : "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.pct_weight_for_height ? r.pct_weight_for_height + "%" : "—"}</td>
                    <td style={{ padding: "8px 10px" }}><Badge status={r.wh_status ? getWHStatus(r.pct_weight_for_height) : null} /></td>
                    <td style={{ padding: "8px 10px" }}><Badge status={r.ha_status ? getHAStatus(r.pct_height_for_age) : null} /></td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>📭 ยังไม่มีข้อมูล กด "แสดงผล" เพื่อโหลดข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ComparePage ───────────────────────────────────────────────────────────────
function ComparePage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [term1Data, setTerm1Data] = useState([]);
  const [term2Data, setTerm2Data] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const loadClassrooms = async () => {
      if (isAdmin) {
        const { data } = await supabase.from("classrooms").select("id, room_name").order("room_number");
        setClassrooms(data || []);
      } else {
        const rpcRes = await supabase.rpc("get_my_classrooms");
        let rooms = rpcRes.data || [];
        if (rooms.length === 0) {
          const fb = await supabase.from("classrooms")
            .select("id, room_name").eq("homeroom_teacher_id", currentUser.id).order("room_number");
          rooms = (fb.data || []).map(c => ({ ...c, classroom_id: c.id }));
        }
        setClassrooms(rooms);
        if (rooms.length === 1) setSelectedClass(rooms[0]);
      }
    };
    loadClassrooms();
  }, [currentUser, isAdmin]);

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    const cid = selectedClass.classroom_id || selectedClass.id;
    const [r1, r2] = await Promise.all([
      supabase.from("v_nutrition_student_detail").select("*").eq("classroom_id", cid).eq("term", "term1"),
      supabase.from("v_nutrition_student_detail").select("*").eq("classroom_id", cid).eq("term", "term2")
    ]);
    setTerm1Data(r1.data || []); setTerm2Data(r2.data || []);
    setLoading(false);
  }, [selectedClass]);

  const chartData = useMemo(() => {
    const map = {};
    term1Data.forEach(r => { map[r.student_id] = { name: r.first_name, w1: r.weight_kg, h1: r.height_cm }; });
    term2Data.forEach(r => {
      if (!map[r.student_id]) map[r.student_id] = { name: r.first_name };
      map[r.student_id].w2 = r.weight_kg; map[r.student_id].h2 = r.height_cm;
    });
    return Object.values(map).slice(0, 15);
  }, [term1Data, term2Data]);

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          {(isAdmin || classrooms.length > 1) && (
            <div style={{ flex: 1 }}>
              <label style={S.label}>ห้องเรียน</label>
              <select style={S.select} value={selectedClass?.classroom_id || selectedClass?.id || ""}
                onChange={e => setSelectedClass(classrooms.find(c => (c.classroom_id || c.id) === e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => <option key={c.classroom_id || c.id} value={c.classroom_id || c.id}>{c.room_name}</option>)}
              </select>
            </div>
          )}
          {!isAdmin && classrooms.length === 1 && (
            <div style={{ flex: 1, background: "#eff6ff", borderRadius: 10, padding: "10px 14px", color: "#1e40af", fontWeight: 700 }}>
              📚 {classrooms[0].room_name}
            </div>
          )}
          <button onClick={load} style={S.btn}>📊 เปรียบเทียบ</button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ กำลังโหลด...</div>
        : chartData.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
              <StatCard label="วัดครั้งที่ 1" value={term1Data.length} color="#3b82f6" icon="🌸" />
              <StatCard label="วัดครั้งที่ 2" value={term2Data.length} color="#8b5cf6" icon="🍂" />
              <StatCard label="น้ำหนักเพิ่มขึ้น" value={chartData.filter(d => d.w1 && d.w2 && d.w2 > d.w1).length} color="#16a34a" icon="📈" />
              <StatCard label="ส่วนสูงเพิ่มขึ้น" value={chartData.filter(d => d.h1 && d.h2 && d.h2 > d.h1).length} color="#0891b2" icon="🚀" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={S.card}>
                <div style={S.cardTitle}>⚖️ เปรียบเทียบน้ำหนัก (กก.)</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} unit=" กก." />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #c7d2fe" }} />
                    <Bar dataKey="w1" name="ครั้งที่ 1" fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="w2" name="ครั้งที่ 2" fill="#8b5cf6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={S.card}>
                <div style={S.cardTitle}>📐 เปรียบเทียบส่วนสูง (ซม.)</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} unit=" ซม." />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #c7d2fe" }} />
                    <Bar dataKey="h1" name="ครั้งที่ 1" fill="#f59e0b" radius={[4,4,0,0]} />
                    <Bar dataKey="h2" name="ครั้งที่ 2" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────
function AdminPage({ currentUser }) {
  const [gradeGroup, setGradeGroup] = useState("");
  const [classrooms, setClassrooms] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [term, setTerm] = useState("term1");
  const [loading, setLoading] = useState(false);
  const GRADE_GROUPS = ["อนุบาล", "ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย"];

  useEffect(() => {
    supabase.from("classrooms").select("id, room_name, room_number, student_count, academic_year_id").order("room_number")
      .then(({ data }) => { setClassrooms(data || []); if (data?.[0]) setSelectedYear(data[0].academic_year_id); });
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_grade_summary", { p_academic_year_id: selectedYear, p_term: term, p_grade_group: gradeGroup || null });
    setSummary(data || []);
    setLoading(false);
  };

  const totals = useMemo(() => ({
    total: classrooms.reduce((s, c) => s + (c.student_count || 0), 0),
    measured: summary.reduce((s, r) => s + Number(r.measured_count || 0), 0),
    normalAvg: summary.length ? Math.round(summary.reduce((s, r) => s + Number(r.wh_normal_pct || 0), 0) / summary.length) : 0,
  }), [classrooms, summary]);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#fef3c7,#fffbeb)", border: "1px solid #fcd34d", borderRadius: 12, padding: "12px 16px", fontSize: 13, marginBottom: 16, color: "#92400e", fontWeight: 600 }}>
        🔐 หน้านี้สำหรับผู้บริหาร / ฝ่ายบริหาร / ผอ. / รองผอ. เท่านั้น
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={S.label}>สายชั้น</label>
            <select style={S.select} value={gradeGroup} onChange={e => setGradeGroup(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {GRADE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <label style={S.label}>ครั้งที่</label>
            <select style={S.select} value={term} onChange={e => setTerm(e.target.value)}>
              <option value="term1">🌸 ครั้งที่ 1</option>
              <option value="term2">🍂 ครั้งที่ 2</option>
            </select>
          </div>
          <button onClick={load} style={S.btn}>📊 โหลดข้อมูล</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="นักเรียนทั้งหมด" value={totals.total.toLocaleString()} color="#3b82f6" icon="👨‍👩‍👧‍👦" sub="คน" />
        <StatCard label="วัดแล้ว" value={totals.measured.toLocaleString()} color="#8b5cf6" icon="✅" sub="คน" />
        <StatCard label="% สมส่วน (เฉลี่ย)" value={`${totals.normalAvg}%`} color="#16a34a" icon="🎯" />
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ กำลังโหลด...</div>
        : summary.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>🏫 สรุปรายห้องเรียน — % สมส่วน</div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={summary} margin={{ top: 4, right: 8, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
                <XAxis dataKey="room_name" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #c7d2fe" }} formatter={v => v + "%"} />
                <Bar dataKey="wh_normal_pct" name="% สมส่วน" fill="url(#blueGrad)" radius={[6,6,0,0]} />
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#1e40af" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
function HAChart({ student, actualHeight, ageMonths }) {
  const gender = student.gender === "ชาย" || student.gender === "male" ? "male" : "female";
  const points = [];
  for (let a = ageMonths - 18; a <= ageMonths + 18; a += 6) {
    if (a < 0) continue;
    const med = getMedianHeight(a, gender);
    points.push({ age: `${Math.floor(a/12)}ปี${a%12}ด`, med, p90: +(med*0.90).toFixed(1), p85: +(med*0.85).toFixed(1), p110: +(med*1.10).toFixed(1), actual: a === ageMonths ? actualHeight : undefined });
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
        <XAxis dataKey="age" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
        <YAxis tick={{ fontSize: 11 }} unit=" ซม." />
        <Tooltip contentStyle={{ borderRadius: 10 }} />
        <Line type="monotone" dataKey="med" name="มาตรฐาน" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p90" name="-2SD" stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p85" name="-3SD" stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p110" name="+2SD" stroke="#8b5cf6" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="actual" name="นักเรียน" stroke="#1e40af" strokeWidth={0} dot={{ r: 8, fill: "#1e40af", stroke: "#fff", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function WHChart({ actualWeight, actualHeight, gender }) {
  const points = [];
  for (let h = actualHeight - 20; h <= actualHeight + 20; h += 5) {
    const med = getMedianWeightForHeight(h, gender);
    points.push({ h: `${h}`, med, p80: +(med*0.80).toFixed(1), p110: +(med*1.10).toFixed(1), p120: +(med*1.20).toFixed(1), actual: Math.abs(h - actualHeight) < 2.6 ? actualWeight : undefined });
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
        <XAxis dataKey="h" tick={{ fontSize: 11 }} unit=" ซม." />
        <YAxis tick={{ fontSize: 11 }} unit=" กก." />
        <Tooltip contentStyle={{ borderRadius: 10 }} />
        <Line type="monotone" dataKey="med" name="มาตรฐาน" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p80" name="-2SD" stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p110" name="+2SD" stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p120" name="+3SD" stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="actual" name="นักเรียน" stroke="#1e40af" strokeWidth={0} dot={{ r: 8, fill: "#1e40af", stroke: "#fff", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}