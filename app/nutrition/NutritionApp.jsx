// ============================================================
// NutritionApp.jsx — ระบบประเมินโภชนาการนักเรียน
// Supabase integration + Role-based access + Teacher classroom lock
//
// Dependencies: @supabase/supabase-js, recharts, date-fns
// npm install @supabase/supabase-js recharts date-fns
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, PieChart, Pie, Cell
} from "recharts";
import {
  differenceInMonths, differenceInYears, format, parseISO
} from "date-fns";
import { th } from "date-fns/locale";

const supabase = createClient();

// ─── Roles ที่มีสิทธิ์ดูข้อมูลทั้งโรงเรียน ────────────────
const ADMIN_ROLES = [
  "admin",
  "director", 
  "deputy_director",
  "dept_head",
  "grade_head"
];

// ─── เกณฑ์ Median Height อ้างอิงกรมอนามัย (อายุเป็นเดือน) ─
const MEDIAN_HEIGHT = {
  male: {
    24:87.1,30:91.2,36:95.2,42:98.7,48:102.0,54:105.1,60:108.0,
    66:111.5,72:114.7,84:120.7,96:126.4,108:131.7,120:136.8,
    132:141.6,144:146.2,156:151.5,168:157.3,180:163.1,192:167.0,
    204:169.5,216:170.1
  },
  female: {
    24:85.7,30:90.2,36:94.1,42:97.6,48:100.9,54:103.9,60:107.2,
    66:110.5,72:113.6,84:119.6,96:125.4,108:130.7,120:135.5,
    132:140.8,144:147.0,156:152.4,168:157.1,180:160.5,192:162.5,
    204:163.8,216:163.8
  }
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
  const ref = gender === "male" ? MEDIAN_HEIGHT.male : MEDIAN_HEIGHT.female;
  return getClosestMedian(ref, ageMonths) || 110;
}

function getMedianWeightForHeight(heightCm, gender) {
  const ref = gender === "male" ? MEDIAN_WEIGHT_FOR_HEIGHT.male : MEDIAN_WEIGHT_FOR_HEIGHT.female;
  return getClosestMedian(ref, Math.round(heightCm / 10) * 10) || 20;
}

function calcNutrition(student, weightKg, heightCm, measuredDate) {
  const ageM = differenceInMonths(new Date(measuredDate), new Date(student.birth_date));
  const genderKey = student.gender === "ชาย" || student.gender === "male" ? "male" : "female";
  const medH = getMedianHeight(ageM, genderKey);
  const medW = getMedianWeightForHeight(heightCm, genderKey);
  const medH_actual = getMedianHeight(ageM, genderKey);
  const ibw = getMedianWeightForHeight(medH_actual, genderKey);
  const pctHA = Math.round((heightCm / medH) * 100);
  const pctWH = Math.round((weightKg / medW) * 100);

  return {
    age_months: ageM,
    median_height: +medH.toFixed(2),
    median_weight_for_height: +medW.toFixed(2),
    ibw_kg: +ibw.toFixed(2),
    pct_height_for_age: pctHA,
    pct_weight_for_height: pctWH,
    ha_status: getHAStatus(pctHA).label,
    wh_status: getWHStatus(pctWH).label,
  };
}

function getHAStatus(pct) {
  if (pct < 85) return { label: "เตี้ยแคระแกร็น (Severe stunted)", color: "#E24B4A", bg: "#FCEBEB" };
  if (pct < 90) return { label: "เตี้ย (Stunted)", color: "#A32D2D", bg: "#F7C1C1" };
  if (pct < 95) return { label: "ค่อนข้างเตี้ย", color: "#854F0B", bg: "#FAEEDA" };
  if (pct <= 105) return { label: "ตามเกณฑ์", color: "#3B6D11", bg: "#EAF3DE" };
  if (pct <= 110) return { label: "ค่อนข้างสูง", color: "#185FA5", bg: "#E6F1FB" };
  if (pct <= 120) return { label: "สูง", color: "#0C447C", bg: "#B5D4F4" };
  return { label: "สูงมาก", color: "#534AB7", bg: "#EEEDFE" };
}

function getWHStatus(pct) {
  if (pct < 60) return { label: "ผอมแห้ง (Severe wasted)", color: "#E24B4A", bg: "#FCEBEB" };
  if (pct < 70) return { label: "ผอม (Wasted)", color: "#A32D2D", bg: "#F7C1C1" };
  if (pct < 80) return { label: "ค่อนข้างผอม", color: "#854F0B", bg: "#FAEEDA" };
  if (pct <= 110) return { label: "สมส่วน", color: "#3B6D11", bg: "#EAF3DE" };
  if (pct <= 120) return { label: "ท้วม", color: "#BA7517", bg: "#FAEEDA" };
  if (pct <= 130) return { label: "เริ่มอ้วน (Overweight)", color: "#854F0B", bg: "#FAC775" };
  return { label: "อ้วน (Obese)", color: "#A32D2D", bg: "#F7C1C1" };
}

function formatAge(birthDate) {
  const today = new Date();
  const y = differenceInYears(today, new Date(birthDate));
  const m = differenceInMonths(today, new Date(birthDate)) % 12;
  return `${y} ปี ${m} เดือน`;
}

// ─── Badge component ───────────────────────────────────────
function Badge({ status }) {
  if (!status) return null;
  return (
    <span style={{
      background: status.bg, color: status.color,
      padding: "2px 10px", borderRadius: 20,
      fontSize: 12, fontWeight: 500, whiteSpace: "nowrap"
    }}>
      {status.label}
    </span>
  );
}

// ─── Main App ──────────────────────────────────────────────
export default function NutritionApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assess");

  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      let { data } = await supabase
        .from("users")
        .select("id, first_name, last_name, role, department_id")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (!data) {
        const email = authUser.email || authUser.user_metadata?.email || "";
        if (email) {
          const res = await supabase
            .from("users")
            .select("id, first_name, last_name, role, department_id")
            .eq("email", email)
            .maybeSingle();
          data = res.data;
          if (data) {
            await supabase.from("users")
              .update({ auth_id: authUser.id })
              .eq("id", data.id);
          }
        }
      }

      if (data) setCurrentUser(data);
      setLoading(false);
    };
    init();
  }, []);

  const isAdmin = useMemo(
    () => ADMIN_ROLES.includes(currentUser?.role),
    [currentUser]
  );

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>กำลังโหลด...</div>;
  if (!currentUser) return <div style={{ padding: 32, textAlign: "center", color: "#E24B4A" }}>❌ กรุณาเข้าสู่ระบบก่อน</div>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>ระบบประเมินภาวะโภชนาการนักเรียน</h1>
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
            {currentUser?.first_name} {currentUser?.last_name} · {currentUser?.role}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e5e5", marginBottom: 20 }}>
        {[
          { key: "assess",  label: "ประเมินรายบุคคล" },
          { key: "class",   label: "รายห้องเรียน" },
          { key: "compare", label: "เปรียบเทียบเทอม" },
          ...(isAdmin ? [{ key: "admin", label: "ผู้บริหาร" }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", border: "none", background: "transparent",
              cursor: "pointer", fontSize: 13,
              borderBottom: tab === t.key ? "2px solid #185FA5" : "2px solid transparent",
              fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? "#185FA5" : "#666"
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "assess"  && <AssessPage  currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === "class"   && <ClassPage   currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === "compare" && <ComparePage currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === "admin"   && isAdmin && <AdminPage currentUser={currentUser} />}
    </div>
  );
}

// ─── AssessPage: ประเมินรายบุคคล ──────────────────────────
function AssessPage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [term, setTerm] = useState("term1");
  const [measuredDate, setMeasuredDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // ดึงห้องเรียน: ครูปกติเห็นเฉพาะห้องตัวเอง (ผ่าน RPC)
  useEffect(() => {
    if (!currentUser) return;
    if (isAdmin) {
      // admin ดึงทุกห้อง
      supabase.from("classrooms")
        .select("id, room_name, room_number, grade_group")
        .order("room_number")
        .then(({ data }) => setClassrooms(data || []));
    } else {
      // ครู: ดึงเฉพาะห้องที่ตัวเองเป็น homeroom_teacher
      supabase.rpc("get_my_classrooms")
        .then(({ data }) => {
          setClassrooms(data || []);
          // ถ้าครูมีแค่ห้องเดียว auto-select
          if (data?.length === 1) setSelectedClass(data[0]);
        });
    }
  }, [currentUser, isAdmin]);

  // ดึงนักเรียนเมื่อเลือกห้อง
  useEffect(() => {
    if (!selectedClass) return;
    supabase.rpc("get_my_students", { p_classroom_id: selectedClass.classroom_id || selectedClass.id })
      .then(({ data }) => setStudents(data || []));
  }, [selectedClass]);

  // คำนวณเมื่อกรอกค่า
  useEffect(() => {
    if (!selectedStudent || !weightKg || !heightCm) { setResult(null); return; }
    const w = parseFloat(weightKg), h = parseFloat(heightCm);
    if (w < 5 || h < 50) return;
    const calc = calcNutrition(selectedStudent, w, h, measuredDate);
    setResult({ ...calc, weight_kg: w, height_cm: h });
  }, [selectedStudent, weightKg, heightCm, measuredDate]);

  const handleSave = async () => {
    if (!selectedStudent || !result) return;
    setSaving(true); setSaveMsg("");
    const { error } = await supabase.from("nutrition_records").upsert({
      student_id:         selectedStudent.student_id,
      classroom_id:       selectedStudent.classroom_id,
      academic_year_id:   selectedClass.academic_year_id,
      recorded_by:        currentUser.id,
      term,
      measured_date:      measuredDate,
      weight_kg:          result.weight_kg,
      height_cm:          result.height_cm,
      ...result
    }, { onConflict: "student_id,academic_year_id,term" });

    setSaving(false);
    setSaveMsg(error ? `เกิดข้อผิดพลาด: ${error.message}` : "บันทึกสำเร็จ ✓");
  };

  const haStatus = result ? getHAStatus(result.pct_height_for_age) : null;
  const whStatus = result ? getWHStatus(result.pct_weight_for_height) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* LEFT */}
      <div>
        {/* ห้องเรียน */}
        <Card title="เลือกห้องเรียน">
          {!isAdmin && classrooms.length === 1 ? (
            <div style={{ padding: "6px 0", fontSize: 14 }}>
              <strong>{classrooms[0].room_name}</strong>
              <span style={{ marginLeft: 8, fontSize: 12, color: "#888" }}>(ห้องประจำชั้นของคุณ)</span>
            </div>
          ) : (
            <Field label="ห้องเรียน">
              <select onChange={e => setSelectedClass(classrooms.find(c => (c.classroom_id || c.id) === e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => (
                  <option key={c.classroom_id || c.id} value={c.classroom_id || c.id}>{c.room_name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="นักเรียน">
            <select onChange={e => setSelectedStudent(students.find(s => s.student_id === e.target.value))}>
              <option value="">— เลือกนักเรียน —</option>
              {students.map(s => (
                <option key={s.student_id} value={s.student_id}>
                  {s.gender === "ชาย" || s.gender === "male" ? "ด.ช. " : "ด.ญ. "}
                  {s.first_name} {s.last_name} ({s.nick_name})
                </option>
              ))}
            </select>
          </Field>
        </Card>

        {/* ข้อมูลนักเรียน */}
        {selectedStudent && (
          <Card title="ข้อมูลนักเรียน">
            <InfoRow label="ชื่อ-นามสกุล"
              value={`${selectedStudent.gender === "ชาย" || selectedStudent.gender === "male" ? "เด็กชาย " : "เด็กหญิง "}${selectedStudent.first_name} ${selectedStudent.last_name}`} />
            <InfoRow label="วันเกิด"
              value={format(parseISO(selectedStudent.birth_date), "d MMMM yyyy", { locale: th })} />
            <InfoRow label="อายุปัจจุบัน" value={formatAge(selectedStudent.birth_date)} />
            <InfoRow label="เพศ" value={selectedStudent.gender} />
            <InfoRow label="รหัสนักเรียน" value={selectedStudent.student_code} />
          </Card>
        )}

        {/* บันทึกการวัด */}
        {selectedStudent && (
          <Card title="บันทึกการวัด">
            <Field label="ครั้งที่วัด">
              <select value={term} onChange={e => setTerm(e.target.value)}>
                <option value="term1">ครั้งที่ 1 (เทอม 1)</option>
                <option value="term2">ครั้งที่ 2 (เทอม 2)</option>
              </select>
            </Field>
            <Field label="วันที่วัด">
              <input type="date" value={measuredDate} onChange={e => setMeasuredDate(e.target.value)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="น้ำหนัก (กก.)">
                <input type="number" step="0.1" placeholder="0.0"
                  value={weightKg} onChange={e => setWeightKg(e.target.value)} />
              </Field>
              <Field label="ส่วนสูง (ซม.)">
                <input type="number" step="0.1" placeholder="0.0"
                  value={heightCm} onChange={e => setHeightCm(e.target.value)} />
              </Field>
            </div>
            <button onClick={handleSave} disabled={!result || saving}
              style={{ marginTop: 8, width: "100%", padding: "9px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
              {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
            {saveMsg && <p style={{ fontSize: 13, color: saveMsg.includes("สำเร็จ") ? "#3B6D11" : "#A32D2D", marginTop: 6 }}>{saveMsg}</p>}
          </Card>
        )}
      </div>

      {/* RIGHT: ผลประเมิน */}
      <div>
        {result && (
          <>
            <Card title="ผลการประเมินโภชนาการ">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <Metric label="น้ำหนัก" value={`${result.weight_kg} กก.`} />
                <Metric label="ส่วนสูง" value={`${result.height_cm} ซม.`} />
                <Metric label="IBW" value={`${result.ibw_kg} กก.`} sub="น้ำหนักอุดมคติ" />
                <Metric label="%Median HA" value={`${result.pct_height_for_age}%`} sub="ส่วนสูงตามเกณฑ์" />
              </div>
              <InfoRow label="ภาวะส่วนสูงตามเกณฑ์อายุ" value={<Badge status={haStatus} />} />
              <InfoRow label="ภาวะน้ำหนักตามเกณฑ์ส่วนสูง" value={<Badge status={whStatus} />} />
              <InfoRow label="อายุ ณ วันที่วัด" value={`${result.age_months} เดือน`} />
              <InfoRow label="Median Height อ้างอิง" value={`${result.median_height} ซม.`} />
              <InfoRow label="Median Weight อ้างอิง" value={`${result.median_weight_for_height} กก.`} />
            </Card>

            {/* กราฟ HA */}
            <Card title="กราฟส่วนสูงตามเกณฑ์อายุ">
              <HAChart student={selectedStudent} actualHeight={result.height_cm} ageMonths={result.age_months} />
            </Card>

            {/* กราฟ WH */}
            <Card title="กราฟน้ำหนักตามเกณฑ์ส่วนสูง">
              <WHChart actualWeight={result.weight_kg} actualHeight={result.height_cm}
                gender={selectedStudent.gender === "ชาย" || selectedStudent.gender === "male" ? "male" : "female"} />
            </Card>
          </>
        )}
        {!result && selectedStudent && (
          <div style={{ padding: 24, color: "#999", textAlign: "center", background: "#f9f9f9", borderRadius: 12 }}>
            กรอกน้ำหนักและส่วนสูงเพื่อดูผลการประเมิน
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ClassPage: รายห้องเรียน ───────────────────────────────
function ClassPage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [term, setTerm] = useState("term1");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const fn = isAdmin
      ? supabase.from("classrooms").select("id, room_name, room_number").order("room_number")
      : supabase.rpc("get_my_classrooms");
    fn.then(({ data }) => {
      setClassrooms(data || []);
      if (!isAdmin && data?.length === 1) setSelectedClass(data[0]);
    });
  }, [currentUser, isAdmin]);

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    const { data } = await supabase
      .from("v_nutrition_student_detail")
      .select("*")
      .eq("classroom_id", selectedClass.classroom_id || selectedClass.id)
      .eq("term", term)
      .order("last_name");
    setRecords(data || []);
    setLoading(false);
  }, [selectedClass, term]);

  const summary = useMemo(() => {
    const total = records.length;
    const counts = { normal: 0, risk: 0, urgent: 0 };
    records.forEach(r => {
      if (!r.wh_status) return;
      if (r.wh_status === "สมส่วน") counts.normal++;
      else if (r.wh_status.includes("ผอม") && !r.wh_status.includes("แห้ง")) counts.risk++;
      else counts.urgent++;
    });
    return { total, ...counts };
  }, [records]);

  return (
    <div>
      <Card>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {isAdmin && (
            <Field label="ห้องเรียน" style={{ flex: 1, minWidth: 160 }}>
              <select onChange={e => setSelectedClass(classrooms.find(c => (c.id || c.classroom_id) === e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => <option key={c.id || c.classroom_id} value={c.id || c.classroom_id}>{c.room_name}</option>)}
              </select>
            </Field>
          )}
          {!isAdmin && classrooms.length === 1 && (
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>ห้องเรียน</p>
              <strong style={{ fontSize: 14 }}>{classrooms[0].room_name}</strong>
            </div>
          )}
          <Field label="ครั้งที่" style={{ minWidth: 120 }}>
            <select value={term} onChange={e => setTerm(e.target.value)}>
              <option value="term1">ครั้งที่ 1</option>
              <option value="term2">ครั้งที่ 2</option>
            </select>
          </Field>
          <button onClick={load} style={{ padding: "8px 20px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            แสดงผล
          </button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <Metric label="นักเรียนทั้งหมด" value={summary.total} />
        <Metric label="สมส่วน" value={summary.normal} color="#3B6D11" />
        <Metric label="เสี่ยงโภชนาการ" value={summary.risk} color="#854F0B" />
        <Metric label="ต้องดูแลเร่งด่วน" value={summary.urgent} color="#A32D2D" />
      </div>

      {loading ? <p style={{ textAlign: "center", color: "#888" }}>กำลังโหลด...</p> : (
        <Card title={`รายชื่อนักเรียน (${records.length} คน)`}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e5e5", color: "#888", fontSize: 12 }}>
                  {["ชื่อ-นามสกุล","อายุ","เพศ","นน.(กก.)","สส.(ซม.)","IBW","% HA","% WH","ภาวะ WH","ภาวะ HA"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.student_id + r.term} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px" }}>{r.gender === "male" || r.gender === "ชาย" ? "ด.ช. " : "ด.ญ. "}{r.first_name} {r.last_name}</td>
                    <td style={{ padding: "6px 8px" }}>{r.birth_date ? formatAge(r.birth_date) : "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.gender}</td>
                    <td style={{ padding: "6px 8px" }}>{r.weight_kg ?? "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.height_cm ?? "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.ibw_kg ?? "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.pct_height_for_age ? r.pct_height_for_age + "%" : "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.pct_weight_for_height ? r.pct_weight_for_height + "%" : "—"}</td>
                    <td style={{ padding: "6px 8px" }}><Badge status={r.wh_status ? getWHStatus(r.pct_weight_for_height) : null} /></td>
                    <td style={{ padding: "6px 8px" }}><Badge status={r.ha_status ? getHAStatus(r.pct_height_for_age) : null} /></td>
                  </tr>
                ))}
                {records.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 24, color: "#aaa" }}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── ComparePage: เปรียบเทียบ 2 เทอม ─────────────────────
function ComparePage({ currentUser, isAdmin }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [term1Data, setTerm1Data] = useState([]);
  const [term2Data, setTerm2Data] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const fn = isAdmin
      ? supabase.from("classrooms").select("id, room_name").order("room_number")
      : supabase.rpc("get_my_classrooms");
    fn.then(({ data }) => {
      setClassrooms(data || []);
      if (!isAdmin && data?.length === 1) setSelectedClass(data[0]);
    });
  }, [currentUser, isAdmin]);

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    const cid = selectedClass.classroom_id || selectedClass.id;
    const [r1, r2] = await Promise.all([
      supabase.from("v_nutrition_student_detail").select("*").eq("classroom_id", cid).eq("term", "term1"),
      supabase.from("v_nutrition_student_detail").select("*").eq("classroom_id", cid).eq("term", "term2")
    ]);
    setTerm1Data(r1.data || []);
    setTerm2Data(r2.data || []);
    setLoading(false);
  }, [selectedClass]);

  const chartData = useMemo(() => {
    const map = {};
    term1Data.forEach(r => { map[r.student_id] = { name: r.first_name, w1: r.weight_kg, h1: r.height_cm }; });
    term2Data.forEach(r => {
      if (!map[r.student_id]) map[r.student_id] = { name: r.first_name };
      map[r.student_id].w2 = r.weight_kg;
      map[r.student_id].h2 = r.height_cm;
    });
    return Object.values(map).slice(0, 15);
  }, [term1Data, term2Data]);

  return (
    <div>
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          {(isAdmin || classrooms.length > 1) && (
            <Field label="ห้องเรียน" style={{ flex: 1 }}>
              <select onChange={e => setSelectedClass(classrooms.find(c => (c.classroom_id || c.id) === e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => <option key={c.classroom_id || c.id} value={c.classroom_id || c.id}>{c.room_name}</option>)}
              </select>
            </Field>
          )}
          {!isAdmin && classrooms.length === 1 && (
            <div style={{ flex: 1 }}><strong style={{ fontSize: 14 }}>{classrooms[0].room_name}</strong></div>
          )}
          <button onClick={load} style={{ padding: "8px 20px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            เปรียบเทียบ
          </button>
        </div>
      </Card>

      {loading ? <p style={{ textAlign: "center", color: "#888" }}>กำลังโหลด...</p> : chartData.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card title="เปรียบเทียบน้ำหนัก (กก.) ครั้งที่ 1 vs 2">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} unit=" กก." />
                  <Tooltip />
                  <Bar dataKey="w1" name="ครั้งที่ 1" fill="#378ADD" radius={[3,3,0,0]} />
                  <Bar dataKey="w2" name="ครั้งที่ 2" fill="#639922" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="เปรียบเทียบส่วนสูง (ซม.) ครั้งที่ 1 vs 2">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} unit=" ซม." />
                  <Tooltip />
                  <Bar dataKey="h1" name="ครั้งที่ 1" fill="#EF9F27" radius={[3,3,0,0]} />
                  <Bar dataKey="h2" name="ครั้งที่ 2" fill="#534AB7" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="สรุปการเปลี่ยนแปลง">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              <Metric label="วัดครั้งที่ 1" value={term1Data.length} />
              <Metric label="วัดครั้งที่ 2" value={term2Data.length} />
              <Metric label="น้ำหนักเพิ่มขึ้น" color="#3B6D11"
                value={chartData.filter(d => d.w1 && d.w2 && d.w2 > d.w1).length} />
              <Metric label="ส่วนสูงเพิ่มขึ้น" color="#185FA5"
                value={chartData.filter(d => d.h1 && d.h2 && d.h2 > d.h1).length} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── AdminPage: ผู้บริหาร ─────────────────────────────────
function AdminPage({ currentUser }) {
  const [viewMode, setViewMode] = useState("all");
  const [gradeGroup, setGradeGroup] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [classrooms, setClassrooms] = useState([]);
  const [summary, setSummary] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [term, setTerm] = useState("term1");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("classrooms").select("id, room_name, room_number, grade_group").order("room_number")
      .then(({ data }) => setClassrooms(data || []));
    // ดึง academic_years ถ้ามี table
    supabase.from("classrooms").select("academic_year_id").limit(1)
      .then(({ data }) => data?.[0] && setSelectedYear(data[0].academic_year_id));
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_grade_summary", {
      p_academic_year_id: selectedYear,
      p_term: term,
      p_grade_group: gradeGroup || null
    });
    setSummary(data || []);
    setLoading(false);
  };

  const totals = useMemo(() => ({
    total: classrooms.reduce((s, c) => s + (c.student_count || 0), 0),
    measured: summary.reduce((s, r) => s + Number(r.measured_count || 0), 0),
    normalAvg: summary.length ? Math.round(summary.reduce((s, r) => s + Number(r.wh_normal_pct || 0), 0) / summary.length) : 0,
  }), [classrooms, summary]);

  const GRADE_GROUPS = ["อนุบาล", "ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย"];

  return (
    <div>
      <div style={{ background: "#FFF3CD", border: "1px solid #FAEEDA", borderRadius: 8, padding: "8px 14px", fontSize: 13, marginBottom: 16, color: "#854F0B" }}>
        หน้านี้สำหรับ ผู้ดูแลโครงการ / ฝ่ายบริหาร / ผอ. / รองผอ. เท่านั้น
      </div>

      {/* View mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["all","ทั้งโรงเรียน"],["level","ทีละสายชั้น"],["class","ทีละห้อง"]].map(([k, lbl]) => (
          <button key={k} onClick={() => { setViewMode(k); setGradeGroup(""); }}
            style={{ padding: "7px 16px", border: "0.5px solid #ccc", borderRadius: 8, cursor: "pointer", fontSize: 13,
              background: viewMode === k ? "#185FA5" : "transparent", color: viewMode === k ? "#fff" : "#333" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {viewMode === "level" && (
            <Field label="สายชั้น" style={{ flex: 1 }}>
              <select value={gradeGroup} onChange={e => setGradeGroup(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {GRADE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          )}
          {viewMode === "class" && (
            <Field label="ห้องเรียน" style={{ flex: 1 }}>
              <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.room_name}</option>)}
              </select>
            </Field>
          )}
          <Field label="ครั้งที่" style={{ minWidth: 120 }}>
            <select value={term} onChange={e => setTerm(e.target.value)}>
              <option value="term1">ครั้งที่ 1</option>
              <option value="term2">ครั้งที่ 2</option>
            </select>
          </Field>
          <button onClick={load} style={{ padding: "8px 20px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            โหลดข้อมูล
          </button>
        </div>
      </Card>

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        <Metric label="นักเรียนทั้งหมด" value={totals.total} />
        <Metric label="วัดแล้ว" value={totals.measured} color="#185FA5" />
        <Metric label="% สมส่วน (เฉลี่ย)" value={`${totals.normalAvg}%`} color="#3B6D11" />
      </div>

      {loading ? <p style={{ textAlign: "center", color: "#888" }}>กำลังโหลด...</p> : summary.length > 0 && (
        <Card title="สรุปรายห้องเรียน — % สมส่วน ครั้งที่ 1 vs 2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="room_name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v) => v + "%"} />
              <Bar dataKey="wh_normal_pct" name="% สมส่วน" fill="#378ADD" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ─── Charts ────────────────────────────────────────────────
function HAChart({ student, actualHeight, ageMonths }) {
  const gender = student.gender === "ชาย" || student.gender === "male" ? "male" : "female";
  const points = [];
  for (let a = ageMonths - 18; a <= ageMonths + 18; a += 6) {
    if (a < 0) continue;
    const med = getMedianHeight(a, gender);
    points.push({ age: `${Math.floor(a / 12)}ปี ${a % 12}ด`, med, p90: +(med * 0.90).toFixed(1), p85: +(med * 0.85).toFixed(1), p110: +(med * 1.10).toFixed(1), actual: a === ageMonths ? actualHeight : undefined });
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="age" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
        <YAxis tick={{ fontSize: 11 }} unit=" ซม." />
        <Tooltip />
        <Line type="monotone" dataKey="med" name="มาตรฐาน" stroke="#378ADD" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p90" name="-2SD" stroke="#EF9F27" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p85" name="-3SD" stroke="#E24B4A" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p110" name="+2SD" stroke="#378ADD" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="actual" name="นักเรียน" stroke="#534AB7" strokeWidth={0} dot={{ r: 7, fill: "#534AB7" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function WHChart({ actualWeight, actualHeight, gender }) {
  const points = [];
  for (let h = actualHeight - 20; h <= actualHeight + 20; h += 5) {
    const med = getMedianWeightForHeight(h, gender);
    points.push({ h: `${h}`, med, p80: +(med * 0.80).toFixed(1), p110: +(med * 1.10).toFixed(1), p120: +(med * 1.20).toFixed(1), actual: Math.abs(h - actualHeight) < 2.6 ? actualWeight : undefined });
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="h" tick={{ fontSize: 11 }} unit=" ซม." />
        <YAxis tick={{ fontSize: 11 }} unit=" กก." />
        <Tooltip />
        <Line type="monotone" dataKey="med" name="มาตรฐาน" stroke="#378ADD" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p80" name="-2SD" stroke="#EF9F27" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p110" name="+2SD" stroke="#EF9F27" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="p120" name="+3SD" stroke="#E24B4A" strokeDasharray="4 3" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="actual" name="นักเรียน" stroke="#534AB7" strokeWidth={0} dot={{ r: 7, fill: "#534AB7" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Shared UI ─────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #e8e8e8", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 16 }}>
      {title && <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{title}</p>}
      {children}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 10, ...style }}>
      <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid #f5f5f5", fontSize: 13 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Metric({ label, value, sub, color }) {
  return (
    <div style={{ background: "#f9f9f9", borderRadius: 8, padding: "12px", textAlign: "center" }}>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 500, color: color || "inherit" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#aaa" }}>{sub}</p>}
    </div>
  );
}