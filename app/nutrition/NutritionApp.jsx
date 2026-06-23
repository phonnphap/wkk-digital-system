"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { differenceInMonths, differenceInYears, format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,  // ✅ เพิ่ม Legend ตรงนี้
} from "recharts";

const supabase = createClient();
const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

// ============================================================
// WHO / กรมอนามัย LMS Parameters — ถูกต้องตามมาตรฐาน
// ============================================================

// Height-for-Age (HA) — อายุเป็นเดือน { L, M, S }
const WHO_HA_MALE = {
  24:{L:1,M:87.8,S:0.03655},  30:{L:1,M:91.9,S:0.03639},  36:{L:1,M:96.1,S:0.03467},
  42:{L:1,M:99.9,S:0.03534},  48:{L:1,M:103.3,S:0.03600}, 54:{L:1,M:106.7,S:0.03649},
  60:{L:1,M:110.0,S:0.03692}, 66:{L:1,M:113.0,S:0.03743}, 72:{L:1,M:115.9,S:0.03751},
  78:{L:1,M:118.7,S:0.03815}, 84:{L:1,M:121.7,S:0.03821}, 90:{L:1,M:124.5,S:0.03830},
  96:{L:1,M:127.3,S:0.03843},102:{L:1,M:130.0,S:0.03873},108:{L:1,M:132.6,S:0.03891},
  114:{L:1,M:135.2,S:0.03902},120:{L:1,M:137.8,S:0.03921},126:{L:1,M:140.3,S:0.03954},
  132:{L:1,M:142.8,S:0.03977},138:{L:1,M:145.2,S:0.04014},144:{L:1,M:147.7,S:0.04057},
  150:{L:1,M:150.0,S:0.04108},156:{L:1,M:152.9,S:0.04153},162:{L:1,M:155.8,S:0.04198},
  168:{L:1,M:159.0,S:0.04216},174:{L:1,M:162.3,S:0.04200},180:{L:1,M:165.3,S:0.04161},
  186:{L:1,M:167.7,S:0.04094},192:{L:1,M:169.4,S:0.04025},198:{L:1,M:170.5,S:0.03955},
  204:{L:1,M:171.2,S:0.03892},210:{L:1,M:171.5,S:0.03838},216:{L:1,M:171.6,S:0.03793},
  228:{L:1,M:171.7,S:0.03750}
};

const WHO_HA_FEMALE = {
  24:{L:1,M:86.4,S:0.03779},  30:{L:1,M:90.7,S:0.03674},  36:{L:1,M:95.1,S:0.03602},
  42:{L:1,M:98.8,S:0.03628},  48:{L:1,M:102.7,S:0.03671}, 54:{L:1,M:105.9,S:0.03712},
  60:{L:1,M:109.4,S:0.03755}, 66:{L:1,M:112.0,S:0.03779}, 72:{L:1,M:114.6,S:0.03812},
  78:{L:1,M:117.1,S:0.03840}, 84:{L:1,M:120.0,S:0.03861}, 90:{L:1,M:122.8,S:0.03876},
  96:{L:1,M:125.5,S:0.03896},102:{L:1,M:128.2,S:0.03914},108:{L:1,M:130.9,S:0.03924},
  114:{L:1,M:133.5,S:0.03930},120:{L:1,M:136.2,S:0.03934},126:{L:1,M:138.8,S:0.03938},
  132:{L:1,M:141.5,S:0.03953},138:{L:1,M:144.0,S:0.03993},144:{L:1,M:147.0,S:0.04045},
  150:{L:1,M:149.8,S:0.04100},156:{L:1,M:152.2,S:0.04128},162:{L:1,M:154.2,S:0.04136},
  168:{L:1,M:155.8,S:0.04117},174:{L:1,M:157.0,S:0.04076},180:{L:1,M:157.9,S:0.04025},
  186:{L:1,M:158.6,S:0.03972},192:{L:1,M:159.1,S:0.03929},198:{L:1,M:159.5,S:0.03893},
  204:{L:1,M:159.7,S:0.03862},210:{L:1,M:160.0,S:0.03836},216:{L:1,M:160.3,S:0.03814},
  228:{L:1,M:160.5,S:0.03793}
};

// Weight-for-Height (WH) — ความสูงเป็น ซม. { L, M, S }
const WHO_WH_MALE = {
  65:{L:-0.3521,M:7.4327,S:0.09001},  70:{L:-0.3521,M:8.4329,S:0.09009},
  75:{L:-0.3521,M:9.5159,S:0.09015},  80:{L:-0.3521,M:10.5656,S:0.09023},
  85:{L:-0.3521,M:11.6374,S:0.09015}, 90:{L:-0.3521,M:12.7307,S:0.09018},
  95:{L:-0.3521,M:13.9015,S:0.09024},100:{L:-0.3521,M:15.1774,S:0.09075},
  105:{L:-0.3521,M:16.5981,S:0.09154},110:{L:-0.3521,M:18.1579,S:0.09252},
  115:{L:-0.3521,M:19.8607,S:0.09361},120:{L:-0.3521,M:21.7300,S:0.09473},
  125:{L:1,M:23.79,S:0.13200},130:{L:1,M:26.27,S:0.13250},
  135:{L:1,M:29.08,S:0.13300},140:{L:1,M:32.18,S:0.13400},
  145:{L:1,M:35.78,S:0.13520},150:{L:1,M:39.74,S:0.13600},
  155:{L:1,M:44.02,S:0.13700},160:{L:1,M:48.55,S:0.13750},
  165:{L:1,M:53.20,S:0.13780},170:{L:1,M:57.80,S:0.13760},
  175:{L:1,M:62.00,S:0.13700},180:{L:1,M:65.80,S:0.13600}
};

const WHO_WH_FEMALE = {
  65:{L:-0.3833,M:7.2402,S:0.09191},  70:{L:-0.3833,M:8.1765,S:0.09209},
  75:{L:-0.3833,M:9.2341,S:0.09224},  80:{L:-0.3833,M:10.1571,S:0.09238},
  85:{L:-0.3833,M:11.0761,S:0.09201}, 90:{L:-0.3833,M:12.0548,S:0.09186},
  95:{L:-0.3833,M:13.1071,S:0.09204},100:{L:-0.3833,M:14.2828,S:0.09267},
  105:{L:-0.3833,M:15.5962,S:0.09374},110:{L:-0.3833,M:17.0666,S:0.09495},
  115:{L:-0.3833,M:18.6891,S:0.09626},120:{L:-0.3833,M:20.4739,S:0.09745},
  125:{L:1,M:22.46,S:0.13100},130:{L:1,M:24.74,S:0.13200},
  135:{L:1,M:27.36,S:0.13350},140:{L:1,M:30.44,S:0.13500},
  145:{L:1,M:33.90,S:0.13650},150:{L:1,M:37.66,S:0.13750},
  155:{L:1,M:41.60,S:0.13800},160:{L:1,M:45.58,S:0.13820},
  165:{L:1,M:49.40,S:0.13780},170:{L:1,M:52.90,S:0.13700},
  175:{L:1,M:56.00,S:0.13580},180:{L:1,M:58.70,S:0.13450}
};

// ── Interpolation LMS ─────────────────────────────────────────────────────────
function interpolateLMS(table, key) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (table[key] !== undefined) return table[key];
  const lower = keys.filter(k => k <= key).pop();
  const upper = keys.filter(k => k >= key)[0];
  if (lower === undefined) return table[keys[0]];
  if (upper === undefined) return table[keys[keys.length - 1]];
  if (lower === upper) return table[lower];
  const r = (key - lower) / (upper - lower);
  const lo = table[lower], hi = table[upper];
  return { L: lo.L + r*(hi.L-lo.L), M: lo.M + r*(hi.M-lo.M), S: lo.S + r*(hi.S-lo.S) };
}

// ── Z-score ตาม WHO LMS method ───────────────────────────────────────────────
function calcZScoreLMS(value, lms) {
  const { L, M, S } = lms;
  if (Math.abs(L) < 0.0001) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

// ── Median Height/Weight สำหรับกราฟ ─────────────────────────────────────────
function medH(ageMonths, g) {
  const lms = interpolateLMS(g === "male" ? WHO_HA_MALE : WHO_HA_FEMALE, ageMonths);
  return lms?.M ?? 110;
}
function medW(heightCm, g) {
  const lms = interpolateLMS(g === "male" ? WHO_WH_MALE : WHO_WH_FEMALE, heightCm);
  return lms?.M ?? 20;
}

// ── Main calculation ─────────────────────────────────────────────────────────
function calcNutrition(student, weightKg, heightCm, measuredDate) {
  const ageM = getMonthsDiff(student.birth_date, measuredDate);
  const g    = gKey(student.gender);

  const haLMS = interpolateLMS(g === "male" ? WHO_HA_MALE : WHO_HA_FEMALE, ageM);
  const whLMS = interpolateLMS(g === "male" ? WHO_WH_MALE : WHO_WH_FEMALE, heightCm);

  const zHA = calcZScoreLMS(heightCm, haLMS);
  const zWH = calcZScoreLMS(weightKg, whLMS);

  const medianH = parseFloat(haLMS.M.toFixed(1));
  const medianW = parseFloat(whLMS.M.toFixed(1));
  const pctHA   = parseFloat((heightCm / haLMS.M * 100).toFixed(1));
  const pctWH   = parseFloat((weightKg / whLMS.M * 100).toFixed(1));

  return {
    age_months:               ageM,
    weight_kg:                weightKg,
    height_cm:                heightCm,
    ibw_kg:                   medianW,
    median_height:            medianH,
    median_weight_for_height: medianW,
    pct_height_for_age:       pctHA,
    pct_weight_for_height:    pctWH,
    z_height_for_age:         parseFloat(zHA.toFixed(2)),
    z_weight_for_height:      parseFloat(zWH.toFixed(2)),
    ha_status:                getHAStatus(zHA),
    wh_status:                getWHStatus(zWH),
  };
}

// ── Classification ตาม PDF กรมอนามัย ────────────────────────────────────────
function getHAStatus(z) {
  if (z < -3)   return { label: "เตี้ย",         color: "#fff",     bg: "#dc2626", emoji: "⚠️" };
  if (z < -2)   return { label: "ค่อนข้างเตี้ย", color: "#92400e", bg: "#fef3c7", emoji: "📉" };
  if (z <= 1.5) return { label: "สูงตามเกณฑ์",   color: "#fff",     bg: "#16a34a", emoji: "✅" };
  if (z <= 2)   return { label: "ค่อนข้างสูง",   color: "#fff",     bg: "#2563eb", emoji: "📈" };
  if (z <= 3)   return { label: "สูง",            color: "#fff",     bg: "#7c3aed", emoji: "🌟" };
  return          { label: "สูงมาก",         color: "#fff",     bg: "#4f46e5", emoji: "🏆" };
}

function getWHStatus(z) {
  if (z < -3)   return { label: "ผอม",         color: "#fff",     bg: "#dc2626", emoji: "⚠️" };
  if (z < -2)   return { label: "ค่อนข้างผอม", color: "#92400e", bg: "#fef3c7", emoji: "📉" };
  if (z <= 1.5) return { label: "สมส่วน",       color: "#fff",     bg: "#16a34a", emoji: "✅" };
  if (z <= 2)   return { label: "ท้วม",         color: "#92400e", bg: "#fed7aa", emoji: "📊" };
  if (z <= 3)   return { label: "เริ่มอ้วน",    color: "#fff",     bg: "#ea580c", emoji: "📈" };
  return          { label: "อ้วน",          color: "#fff",     bg: "#b91c1c", emoji: "⚠️" };
}

function whStatusFromLabel(label) {
  const map = {
    "ผอม":         { label:"ผอม",         color:"#fff",     bg:"#dc2626", emoji:"⚠️" },
    "ค่อนข้างผอม": { label:"ค่อนข้างผอม", color:"#92400e", bg:"#fef3c7", emoji:"📉" },
    "สมส่วน":      { label:"สมส่วน",       color:"#fff",     bg:"#16a34a", emoji:"✅" },
    "ท้วม":        { label:"ท้วม",         color:"#92400e", bg:"#fed7aa", emoji:"📊" },
    "เริ่มอ้วน":   { label:"เริ่มอ้วน",    color:"#fff",     bg:"#ea580c", emoji:"📈" },
    "อ้วน":        { label:"อ้วน",          color:"#fff",     bg:"#b91c1c", emoji:"⚠️" },
  };
  return label ? map[label] ?? { label, color:"#6b7280", bg:"#f3f4f6", emoji:"❓" } : null;
}

function haStatusFromLabel(label) {
  const map = {
    "เตี้ย":         { label:"เตี้ย",         color:"#fff",     bg:"#dc2626", emoji:"⚠️" },
    "ค่อนข้างเตี้ย": { label:"ค่อนข้างเตี้ย", color:"#92400e", bg:"#fef3c7", emoji:"📉" },
    "สูงตามเกณฑ์":   { label:"สูงตามเกณฑ์",   color:"#fff",     bg:"#16a34a", emoji:"✅" },
    "ค่อนข้างสูง":   { label:"ค่อนข้างสูง",   color:"#fff",     bg:"#2563eb", emoji:"📈" },
    "สูง":           { label:"สูง",            color:"#fff",     bg:"#7c3aed", emoji:"🌟" },
    "สูงมาก":        { label:"สูงมาก",         color:"#fff",     bg:"#4f46e5", emoji:"🏆" },
  };
  return label ? map[label] ?? { label, color:"#6b7280", bg:"#f3f4f6", emoji:"❓" } : null;
}

function getTotalMonths(birthDate, measuredDate) {
  const b = new Date(birthDate);
  const m = new Date(measuredDate);
  return (m.getFullYear() - b.getFullYear()) * 12 + (m.getMonth() - b.getMonth());
}
const getMonthsDiff = getTotalMonths;
function gKey(gender) {
  return (gender || "").toLowerCase().includes("male") || (gender || "").includes("ชาย") ? "male" : "female";
}

function formatAge(bd) {
  const y=differenceInYears(new Date(),new Date(bd));
  const m=differenceInMonths(new Date(),new Date(bd))%12;
  return `${y} ปี ${m} เดือน`;
}
function genderLabel(g) {
  if(!g) return "—";
  const v=g.toLowerCase();
  if(v==="male"||v==="ชาย"||v==="m") return "ชาย";
  if(v==="female"||v==="หญิง"||v==="f") return "หญิง";
  return g;
}
function isHighSchool(roomName) {
  const match = (roomName || "").match(/^ม\.?(\d+)/);
  if (!match) return false;
  return Number(match[1]) >= 4; // ม.4, ม.5, ม.6
}
function genderPrefix(g, roomName){
  const isMale = genderLabel(g)==="ชาย";
  if (isHighSchool(roomName)) {
    return isMale ? "นาย" : "นางสาว";
  }
  return isMale ? "ด.ช." : "ด.ญ.";
}

async function fetchMyClassrooms(userId) {
  const rpc=await supabase.rpc("get_my_classrooms");
  if(rpc.data&&rpc.data.length>0) return sortClassrooms(rpc.data);
  const fb=await supabase.from("classrooms")
    .select("id,room_name,room_number,academic_year_id")
    .or(`homeroom_teacher_id.eq.${userId},homeroom_teacher_2_id.eq.${userId}`);
  return sortClassrooms((fb.data||[]).map(c=>({...c,classroom_id:c.id})));
}

// ── Print helper ──────────────────────────────────────────────────────────────
function printElement(id, title) {
  const el = document.getElementById(id);
  if (!el) return;
  const w = window.open("", "_blank", "width=900,height=700");
  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #111; margin: 20px; }
      h1 { font-size: 16px; margin-bottom: 4px; }
      h2 { font-size: 14px; color: #1e40af; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1e40af; color: #fff; padding: 6px 8px; font-size: 11px; text-align: left; }
      td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
      tr:nth-child(even) td { background: #f8faff; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
      .normal { background: #dcfce7; color: #166534; }
      .warn   { background: #fef9c3; color: #854d0e; }
      .danger { background: #fee2e2; color: #991b1b; }
      .blue   { background: #dbeafe; color: #1e40af; }
      @media print { button { display: none; } }
    </style>
  </head><body>
    <h1>โรงเรียนวัดเขียนเขต</h1>
    <h2>รายงานประเมินภาวะโภชนาการนักเรียน</h2>
    ${el.innerHTML}
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  w.document.close();
}

const GRADE_ORDER = { "อ": 0, "ป": 1, "ม": 2 };
function classroomSortKey(roomName) {
  // roomName เช่น "อ.2/1", "ป.6/2", "ม.3/1"
  const match = (roomName || "").match(/^([อปม])\.?(\d+)\/(\d+)/);
  if (!match) return [9, 0, 0];
  const [, prefix, grade, room] = match;
  return [GRADE_ORDER[prefix] ?? 9, Number(grade), Number(room)];
}

function sortClassrooms(rooms) {
  return [...rooms].sort((a, b) => {
    const ka = classroomSortKey(a.room_name);
    const kb = classroomSortKey(b.room_name);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: {fontFamily:"'Sarabun','Noto Sans Thai',sans-serif",background:"#f0f4ff",minHeight:"100vh",overflowX:"hidden"},
  header:{background:"linear-gradient(135deg,#1e40af 0%,#3b82f6 50%,#06b6d4 100%)",
    padding:"1rem 1.5rem",display:"flex",justifyContent:"space-between",
    alignItems:"center",boxShadow:"0 4px 20px rgba(30,64,175,0.3)",gap:12},
  headerTitle:{color:"#fff",fontSize:18,fontWeight:700,margin:0},
  headerSub:{color:"rgba(255,255,255,0.8)",fontSize:13,margin:"2px 0 0"},
  backBtn:{background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.35)",
    color:"#fff",borderRadius:10,padding:"8px 16px",cursor:"pointer",
    fontSize:13,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,flexShrink:0},
  tabBar:{background:"#fff",padding:"0 1.5rem",borderBottom:"2px solid #e0e7ff",
    display:"flex",gap:0,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",overflowX:"auto",scrollbarWidth:"none"},
  tab:(a)=>({padding:"14px 20px",border:"none",background:"transparent",cursor:"pointer",
    fontSize:14,fontWeight:a?700:400,color:a?"#1e40af":"#6b7280",
    borderBottom:a?"3px solid #1e40af":"3px solid transparent",
    transition:"all 0.2s",marginBottom:-2,whiteSpace:"nowrap"}),
  content:{maxWidth:1400,margin:"0 auto",padding:"1.5rem",overflowX:"hidden"},
  card:{background:"#fff",borderRadius:16,padding:"1.25rem",marginBottom:16,
    boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:"1px solid #e0e7ff"},
  cardTitle:{fontSize:15,fontWeight:700,color:"#1e3a8a",marginBottom:14,display:"flex",alignItems:"center",gap:8},
  label:{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:4,display:"block"},
  select:{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #c7d2fe",
    fontSize:14,background:"#f8faff",color:"#1e3a8a",fontFamily:"inherit",outline:"none",cursor:"pointer"},
  input:{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #c7d2fe",
    fontSize:14,background:"#f8faff",color:"#1e3a8a",fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  btn:{padding:"11px 24px",background:"linear-gradient(135deg,#1e40af,#3b82f6)",
    color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:14,
    fontWeight:700,boxShadow:"0 4px 12px rgba(59,130,246,0.35)",fontFamily:"inherit"},
  btnSm:{padding:"7px 14px",background:"linear-gradient(135deg,#1e40af,#3b82f6)",
    color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:12,
    fontWeight:700,fontFamily:"inherit"},
  btnPrint:{padding:"8px 16px",background:"linear-gradient(135deg,#047857,#10b981)",
    color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:13,
    fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6},
  btnDanger:{padding:"7px 14px",background:"#fee2e2",color:"#991b1b",border:"1px solid #fca5a5",
    borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"},
};

function Badge({status}) {
  if(!status) return null;
  return <span style={{background:status.bg,color:status.color,padding:"3px 10px",
    borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap",
    display:"inline-flex",alignItems:"center",gap:3}}>
    {status.emoji} {status.label}
  </span>;
}
function StatCard({label,value,color,icon,sub}) {
  return <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",
    border:`2px solid ${color}20`,display:"flex",flexDirection:"column",gap:4}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:20}}>{icon}</span>
      <span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{label}</span>
    </div>
    <div style={{fontSize:26,fontWeight:800,color:color||"#1e3a8a"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:"#9ca3af"}}>{sub}</div>}
  </div>;
}
function InfoRow({label,value}) {
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
    padding:"6px 0",borderBottom:"1px solid #f0f4ff",fontSize:12}}>
    <span style={{color:"#6b7280",fontWeight:600}}>{label}</span>
    <span style={{fontWeight:700,color:"#1e3a8a"}}>{value}</span>
  </div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function NutritionApp() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assess");
  const [isProjectManager, setIsProjectManager] = useState(false);

  const isAdmin = useMemo(()=>
    ADMIN_ROLES.includes(currentUser?.role)||isProjectManager
  ,[currentUser,isProjectManager]);

  const isRealAdmin = ADMIN_ROLES.includes(currentUser?.role ?? "");

  useEffect(()=>{
    if(!currentUser) return;
    setTab(isRealAdmin ? "class" : "assess");
  },[currentUser, isRealAdmin]);

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

        // ✅ เช็คว่าเป็นผู้ดูแลโครงการไหม
        const { data: pmData } = await supabase
          .from("nutrition_project_managers")
          .select("id")
          .eq("user_id", data.id)
          .maybeSingle();

        if (pmData) setIsProjectManager(true);
      }

      setLoading(false);
    };
    init();
  }, []);

  if(loading) return (
    <div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>🌱</div>
        <div style={{fontSize:16,color:"#3b82f6",fontWeight:600}}>กำลังโหลดระบบ...</div>
      </div>
    </div>
  );
  if(!currentUser) return (
    <div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#dc2626",fontSize:16,fontWeight:600}}>❌ กรุณาเข้าสู่ระบบก่อน</div>
    </div>
  );

  const tabs = isAdmin
  ? [
      {key:"assess", label:"✏️ ประเมินรายห้อง"},
      {key:"class",  label:"📋 รายห้องเรียน"},
      {key:"compare",label:"📊 เปรียบเทียบเทอม"},
      {key:"admin",  label:"🏫 ภาพรวมโรงเรียน"},
      ...(isRealAdmin?[{key:"managers",label:"⚙️ ผู้ดูแลโครงการ"}]:[]),
    ]
  : [
      {key:"assess", label:"✏️ ประเมินรายห้อง"},
      {key:"class",  label:"📋 รายห้องเรียน"},
      {key:"compare",label:"📊 เปรียบเทียบเทอม"},
    ];

  const roleLabel={homeroom_teacher:"ครูประจำชั้น",subject_teacher:"ครูผู้สอน",
    admin:"ผู้ดูแลระบบ",director:"ผู้อำนวยการ",deputy_director:"รองผู้อำนวยการ",
    dept_head:"หัวหน้าฝ่าย",grade_head:"หัวหน้าระดับ"}[currentUser.role]||currentUser.role;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={()=>router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
        <div style={{flex:1,minWidth:0}}>
          <h1 style={S.headerTitle}>🌱 ระบบประเมินภาวะโภชนาการนักเรียน</h1>
          <p style={S.headerSub}>{currentUser.title}{currentUser.first_name} {currentUser.last_name} · {roleLabel}{isProjectManager&&!isRealAdmin?" · ผู้ดูแลโครงการ":""}</p>
        </div>
        <div style={{background:"rgba(255,255,255,0.2)",borderRadius:10,
          padding:"6px 14px",color:"#fff",fontSize:13,fontWeight:600,flexShrink:0}}>
          โรงเรียนวัดเขียนเขต
        </div>
      </div>

      <style>{`div::-webkit-scrollbar{display:none}
        @media print{.no-print{display:none!important}}`}</style>

      <div style={S.tabBar}>
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={S.tab(tab===t.key)}>{t.label}</button>
        ))}
      </div>

      <div style={S.content}>
        {tab==="assess" && <ClassAssessPage currentUser={currentUser}/>}
        {tab==="class"   && <ClassPage   currentUser={currentUser} isAdmin={isAdmin}/>}
        {tab==="compare" && <ComparePage currentUser={currentUser} isAdmin={isAdmin}/>}
        {tab==="admin"   && isAdmin && <AdminPage currentUser={currentUser}/>}
        {tab==="managers"&& isRealAdmin && <ManagersPage currentUser={currentUser}/>}
      </div>
    </div>
  );
}

// ── ClassAssessPage — layout 2 คอลัมน์ ──────────────────────────────────────
function ClassAssessPage({currentUser}) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [term, setTerm] = useState("term1");
  const [measuredDate, setMeasuredDate] = useState(format(new Date(),"yyyy-MM-dd"));
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [detailStudent, setDetailStudent] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const printRef = useRef(null);

  useEffect(()=>{
    if(!selectedClass) return;
    const cid=selectedClass.classroom_id||selectedClass.id;
    setLoadingStudents(true);
    setStudents([]); setValues({}); setDetailStudent(null);
    supabase.rpc("get_my_students",{p_classroom_id:cid}).then(({data})=>{
      setStudents(data||[]);
      setLoadingStudents(false);
    });
  },[selectedClass]);

  useEffect(()=>{
    if(!currentUser) return;
    setLoadingRooms(true);
    fetchMyClassrooms(currentUser.id).then(rooms=>{
      setClassrooms(rooms);
      if(rooms.length>0) setSelectedClass(rooms[0]);
      setLoadingRooms(false);
    });
  },[currentUser]);

  useEffect(()=>{
    if(!selectedClass||students.length===0) return;
    const cid=selectedClass.classroom_id||selectedClass.id;
    supabase.from("v_nutrition_student_detail").select("*")
      .eq("classroom_id",cid).eq("term",term)
      .then(({data})=>{
        const map={};
        (data||[]).forEach(r=>{map[r.student_id]=r;});
        setValues(prev=>{
          const next={...prev};
          students.forEach(s=>{
            const key=s.student_id||s.id;
            const ex=map[key];
            if(!next[key]) next[key]={};
            if(ex?.weight_kg) next[key].weight=String(ex.weight_kg);
            if(ex?.height_cm) next[key].height=String(ex.height_cm);
            next[key].seat=s.seat_number||"";
          });
          return next;
        });
      });
  },[selectedClass,students,term]);

  function setVal(key,field,val){
    setValues(prev=>({...prev,[key]:{...(prev[key]||{}),[field]:val}}));
  }

  const rows=useMemo(()=>{
    return students.map((s,i)=>{
      const key=s.student_id||s.id;
      const v=values[key]||{};
      const w=parseFloat(v.weight),h=parseFloat(v.height);
      let result=null;
      if(w>=5&&h>=50) result={...calcNutrition(s,w,h,measuredDate),weight_kg:w,height_cm:h};
      return {student:s,key,v,result,idx:i};
    });
  },[students,values,measuredDate]);

  const filledCount=rows.filter(r=>r.result).length;

  const handleSaveAll=async()=>{
    if(!selectedClass) return;
    const cid=selectedClass.classroom_id||selectedClass.id;
    const ay=selectedClass.academic_year_id;
    const toSave=rows.filter(r=>r.result).map(r=>({
      student_id:r.student.student_id||r.student.id,
      classroom_id:cid,academic_year_id:ay,
      recorded_by:currentUser.id,term,measured_date:measuredDate,
      weight_kg:r.result.weight_kg,height_cm:r.result.height_cm,
      age_months:r.result.age_months,median_height:r.result.median_height,
      median_weight_for_height:r.result.median_weight_for_height,
      ibw_kg:r.result.ibw_kg,pct_height_for_age:r.result.pct_height_for_age,
      pct_weight_for_height:r.result.pct_weight_for_height,
      ha_status: r.result.ha_status.label,  // ✅ เอาแค่ label
      wh_status: r.result.wh_status.label,  // ✅ เอาแค่ label
    }));
    if(toSave.length===0){setSaveMsg("⚠️ กรุณากรอกน้ำหนัก/ส่วนสูงอย่างน้อย 1 คน");return;}
    setSaving(true);setSaveMsg("");
    const {error}=await supabase.from("nutrition_records")
      .upsert(toSave,{onConflict:"student_id,academic_year_id,term"});
    setSaving(false);
    setSaveMsg(error?`❌ ${error.message}`:`✅ บันทึกสำเร็จ ${toSave.length} คน`);
  };

  // Print report สำหรับห้องนี้
  const handlePrint=()=>{
    const termLabel=term==="term1"?"ครั้งที่ 1 (เทอม 1)":"ครั้งที่ 2 (เทอม 2)";
    const html=`
      <h3 style="margin:0 0 4px">${selectedClass?.room_name} — ${termLabel} — วันที่ ${format(new Date(measuredDate),"dd/MM/yyyy",{locale:th})}</h3>
      <table>
        <thead><tr>
          <th>เลขที่</th><th>ชื่อ-นามสกุล</th><th>อายุ</th><th>น้ำหนัก</th><th>ส่วนสูง</th>
          <th>IBW</th><th>%HA</th><th>%WH</th><th>ภาวะ WH</th><th>ภาวะ HA</th>
        </tr></thead>
        <tbody>
          ${rows.map((r,i)=>{
            const s=r.student;
            const wh=r.result?getWHStatus(r.result.pct_weight_for_height):null;
            const ha=r.result?getHAStatus(r.result.pct_height_for_age):null;
            const whCls=wh?(wh.label.includes("สมส่วน")?"normal":wh.label.includes("เตี้ย")||wh.label.includes("ผอม")?"danger":"warn"):"";
            const haCls=ha?(ha.label.includes("ตามเกณฑ์")?"normal":ha.label.includes("เตี้ย")?"danger":"blue"):"";
            return `<tr>
              <td style="text-align:center">${r.v.seat||s.seat_number||(i+1)}</td>
              <td>${genderPrefix(s.gender, selectedClass?.room_name)} ${s.first_name} ${s.last_name}</td>
              <td>${formatAge(s.birth_date)}</td>
              <td>${r.result?r.result.weight_kg:"—"}</td>
              <td>${r.result?r.result.height_cm:"—"}</td>
              <td>${r.result?r.result.ibw_kg:"—"}</td>
              <td>${r.result?r.result.pct_height_for_age+"%":"—"}</td>
              <td>${r.result?r.result.pct_weight_for_height+"%":"—"}</td>
              <td>${wh?`<span class="badge ${whCls}">${wh.label}</span>`:"—"}</td>
              <td>${ha?`<span class="badge ${haCls}">${ha.label}</span>`:"—"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <p style="margin-top:16px;font-size:11px;color:#6b7280">
        สมส่วน: ${rows.filter(r=>r.result?.wh_status==="สมส่วน").length} คน &nbsp;|&nbsp;
        ตามเกณฑ์ (HA): ${rows.filter(r=>r.result?.ha_status==="ตามเกณฑ์").length} คน &nbsp;|&nbsp;
        รวมทั้งหมด: ${students.length} คน วัดแล้ว: ${filledCount} คน
      </p>`;
    const w=window.open("","_blank","width=1000,height=700");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายงานโภชนาการ ${selectedClass?.room_name}</title>
      <style>body{font-family:'Sarabun',sans-serif;font-size:12px;margin:20px}
      h2,h3{color:#1e40af}table{width:100%;border-collapse:collapse}
      th{background:#1e40af;color:#fff;padding:6px 8px;font-size:11px;text-align:left}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}
      tr:nth-child(even)td{background:#f8faff}
      .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}
      .normal{background:#dcfce7;color:#166534}.warn{background:#fef9c3;color:#854d0e}
      .danger{background:#fee2e2;color:#991b1b}.blue{background:#dbeafe;color:#1e40af}
      @media print{button{display:none}}</style></head>
      <body><h2>โรงเรียนวัดเขียนเขต — รายงานภาวะโภชนาการนักเรียน</h2>${html}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  if(loadingRooms) return (
    <div style={{...S.card,textAlign:"center",padding:48}}>
      <div style={{fontSize:32,marginBottom:12}}>⏳</div>
      <div style={{color:"#6b7280",fontWeight:600}}>กำลังโหลดห้องเรียน...</div>
    </div>
  );
  if(classrooms.length===0) return (
    <div style={{...S.card,textAlign:"center",padding:48}}>
      <div style={{fontSize:64,marginBottom:16}}>🏫</div>
      <div style={{color:"#6b7280",fontSize:15,fontWeight:600}}>
        ไม่พบห้องเรียนที่คุณเป็นครูประจำชั้น<br/>
        <span style={{fontSize:13,color:"#9ca3af"}}>กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบข้อมูลครูประจำชั้น</span>
      </div>
    </div>
  );

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 420px",gap:20,alignItems:"start"}}>
      {/* ── คอลัมน์ซ้าย: ตารางกรอก ── */}
      <div>
        {/* controls */}
        <div style={S.card}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
            {classrooms.length>1?(
              <div style={{flex:1,minWidth:140}}>
                <label style={S.label}>ห้องเรียน</label>
                <select style={S.select} value={selectedClass?.classroom_id||selectedClass?.id||""}
                  onChange={e=>setSelectedClass(classrooms.find(c=>(c.classroom_id||c.id)===e.target.value))}>
                  {classrooms.map(c=>(
                    <option key={c.classroom_id||c.id} value={c.classroom_id||c.id}>{c.room_name}</option>
                  ))}
                </select>
              </div>
            ):(
              <div style={{flex:1,background:"#eff6ff",borderRadius:10,padding:"10px 14px",color:"#1e40af",fontWeight:700,fontSize:14}}>
                📚 {classrooms[0].room_name}
              </div>
            )}
            <div style={{minWidth:140}}>
              <label style={S.label}>ครั้งที่วัด</label>
              <select style={S.select} value={term} onChange={e=>setTerm(e.target.value)}>
                <option value="term1">🌸 ครั้งที่ 1</option>
                <option value="term2">🍂 ครั้งที่ 2</option>
              </select>
            </div>
            <div style={{minWidth:140}}>
              <label style={S.label}>วันที่วัด</label>
              <input type="date" style={S.input} value={measuredDate} onChange={e=>setMeasuredDate(e.target.value)}/>
            </div>
          </div>
        </div>

        {/* stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          <StatCard label="นักเรียนทั้งหมด" value={students.length} color="#3b82f6" icon="👨‍👩‍👧‍👦" sub="คน"/>
          <StatCard label="กรอกข้อมูลแล้ว"  value={filledCount}     color="#16a34a" icon="✅"        sub="คน"/>
          <StatCard label="ยังไม่กรอก"       value={students.length-filledCount} color="#f59e0b" icon="⏳" sub="คน"/>
        </div>

        {/* table */}
        <div style={S.card}>
          <div style={{...S.cardTitle,justifyContent:"space-between"}}>
            <span>📝 {selectedClass?.room_name} — บันทึกน้ำหนัก/ส่วนสูง</span>
            <button onClick={handlePrint} style={S.btnPrint} className="no-print">
              🖨️ พิมพ์รายงาน
            </button>
          </div>

          {loadingStudents?(
            <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>⏳ กำลังโหลดรายชื่อนักเรียน...</div>
          ):students.length===0?(
            <div style={{textAlign:"center",padding:40,color:"#9ca3af"}}>📭 ไม่พบนักเรียนในห้องนี้</div>
          ):(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:620}}>
                <thead>
                  <tr style={{background:"linear-gradient(135deg,#1e40af,#3b82f6)"}}>
                    {["เลขที่","ชื่อ-นามสกุล","อายุ","น้ำหนัก(กก.)","ส่วนสูง(ซม.)","ภาวะ WH","ภาวะ HA",""].map(h=>(
                      <th key={h} style={{padding:"8px 6px",textAlign:"left",color:"#fff",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>{
                    const s=r.student;
                    const isActive=detailStudent&&(detailStudent.student_id||detailStudent.id)===(s.student_id||s.id);
                    return (
                      <tr key={r.key} style={{background:isActive?"#eff6ff":i%2===0?"#f8faff":"#fff",
                        cursor:"pointer",transition:"background 0.1s"}}
                        onClick={()=>setDetailStudent(isActive?null:s)}>
                        <td style={{padding:"6px",textAlign:"center",color:"#6b7280",fontWeight:700,fontSize:12,width:44}}>
                          {r.v.seat||s.seat_number||(i+1)}
                        </td>
                        <td style={{padding:"6px 8px",fontWeight:600,color:isActive?"#1e40af":"#1e3a8a",whiteSpace:"nowrap",fontSize:12}}>
                          {isActive?"▶ ":""}{genderPrefix(s.gender, selectedClass?.room_name)} {s.first_name} {s.last_name}
                          {s.nick_name&&<span style={{color:"#9ca3af",fontWeight:400}}> ({s.nick_name})</span>}
                        </td>
                        <td style={{padding:"6px 8px",color:"#6b7280",whiteSpace:"nowrap",fontSize:11}}>{formatAge(s.birth_date)}</td>
                        <td style={{padding:"4px 6px",width:95}} onClick={e=>e.stopPropagation()}>
                          <input type="number" step="0.1" placeholder="0.0" value={r.v.weight??""}
                            onChange={e=>setVal(r.key,"weight",e.target.value)}
                            style={{...S.input,padding:"5px 7px",width:82,fontSize:13}}/>
                        </td>
                        <td style={{padding:"4px 6px",width:95}} onClick={e=>e.stopPropagation()}>
                          <input type="number" step="0.1" placeholder="0.0" value={r.v.height??""}
                            onChange={e=>setVal(r.key,"height",e.target.value)}
                            style={{...S.input,padding:"5px 7px",width:82,fontSize:13}}/>
                        </td>
                        <td style={{padding:"6px 8px"}}>
  {r.result ? <Badge status={getWHStatus(r.result.z_weight_for_height)}/> 
             : <span style={{color:"#d1d5db",fontSize:11}}>—</span>}
</td>
<td style={{padding:"6px 8px"}}>
  {r.result ? <Badge status={getHAStatus(r.result.z_height_for_age)}/>
             : <span style={{color:"#d1d5db",fontSize:11}}>—</span>}
</td>
                        <td style={{padding:"6px 8px"}} onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>setDetailStudent(isActive?null:s)}
                            style={{...S.btnSm,background:isActive?"#e0e7ff":"",color:isActive?"#3730a3":"",
                              border:isActive?"1px solid #c7d2fe":"none"}}>
                            {isActive?"✕ ปิด":"📈 ดู"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {students.length>0&&(
            <div style={{marginTop:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <button onClick={handleSaveAll} disabled={saving} style={{...S.btn,opacity:saving?0.6:1}}>
                {saving?"⏳ กำลังบันทึก...":`💾 บันทึกทั้งห้อง (${filledCount} คน)`}
              </button>
              {saveMsg&&(
                <div style={{padding:"7px 14px",borderRadius:10,fontWeight:700,fontSize:13,
                  background:saveMsg.includes("✅")?"#f0fdf4":saveMsg.includes("⚠️")?"#fffbeb":"#fef2f2",
                  color:saveMsg.includes("✅")?"#16a34a":saveMsg.includes("⚠️")?"#b45309":"#dc2626"}}>
                  {saveMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── คอลัมน์ขวา: กราฟรายบุคคล ── */}
      <div style={{position:"sticky",top:80}}>
        {detailStudent?(
          <StudentDetailPanel
            student={detailStudent}
            currentResult={rows.find(r=>(r.student.student_id||r.student.id)===(detailStudent.student_id||detailStudent.id))?.result}
            measuredDate={measuredDate}
            onClose={()=>setDetailStudent(null)}
            roomName={selectedClass?.room_name}
          />
        ):(
          <div style={{...S.card,textAlign:"center",padding:48,border:"2px dashed #c7d2fe"}}>
            <div style={{fontSize:48,marginBottom:12}}>📈</div>
            <div style={{color:"#6b7280",fontSize:14,fontWeight:600}}>คลิกชื่อนักเรียนเพื่อดูกราฟและรายละเอียด</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── StudentDetailPanel ────────────────────────────────────────────────────────
function StudentDetailPanel({student,currentResult,measuredDate,onClose,roomName}) {
  const [records,setRecords]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setLoading(true);
    const sid=student.student_id||student.id;
    supabase.from("v_nutrition_student_detail").select("*")
      .eq("student_id",sid).order("term")
      .then(({data})=>{setRecords(data||[]);setLoading(false);});
  },[student]);

  const latest=records[records.length-1];
  const g=gKey(student.gender);

  // ใช้ currentResult ถ้ายังไม่ได้บันทึก (กรอกไว้แล้ว)
  const displayResult = currentResult || (latest ? {
  weight_kg: latest.weight_kg,
  height_cm: latest.height_cm,
  ibw_kg: latest.ibw_kg,
  age_months: latest.age_months,
  pct_height_for_age: latest.pct_height_for_age,
  pct_weight_for_height: latest.pct_weight_for_height,
  // ✅ เพิ่ม z-score จาก DB ถ้ามี หรือคำนวณจาก pct
  z_weight_for_height: latest.z_weight_for_height ?? null,
  z_height_for_age: latest.z_height_for_age ?? null,
} : null);

  return (
    <div style={{...S.card,border:"2px solid #c7d2fe"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontWeight:700,color:"#1e3a8a",fontSize:14}}>
          {genderPrefix(student.gender, roomName)==="นาย"||genderPrefix(student.gender, roomName)==="ด.ช."?"เด็กชาย":"เด็กหญิง"} {student.first_name} {student.last_name}
          {student.nick_name&&<span style={{color:"#9ca3af",fontWeight:400}}> ({student.nick_name})</span>}
        </div>
        <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,
          width:28,height:28,cursor:"pointer",fontSize:14,color:"#6b7280"}}>✕</button>
      </div>
      <div style={{color:"#6b7280",fontSize:12,marginBottom:12}}>
        {formatAge(student.birth_date)} · {student.student_code}
        {student.seat_number?` · เลขที่ ${student.seat_number}`:""}
      </div>

      {loading?(
        <div style={{textAlign:"center",padding:24,color:"#6b7280"}}>⏳ กำลังโหลด...</div>
      ):(
        <>
          {/* ผลปัจจุบัน */}
          {displayResult&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[
                ["น้ำหนัก",`${displayResult.weight_kg} กก.`],
                ["ส่วนสูง",`${displayResult.height_cm} ซม.`],
                ["IBW",`${displayResult.ibw_kg} กก.`],
                ["อายุ",`${displayResult.age_months} เดือน`],
              ].map(([l,v])=>(
                <div key={l} style={{background:"#f8faff",borderRadius:10,padding:"8px 10px",border:"1px solid #e0e7ff"}}>
                  <div style={{fontSize:10,color:"#6b7280",fontWeight:600}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#1e3a8a"}}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Badge สถานะ */}
          {displayResult&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              <Badge status={displayResult.z_weight_for_height != null 
  ? getWHStatus(displayResult.z_weight_for_height) 
  : whStatusFromLabel(latest?.wh_status)}/>
<Badge status={displayResult.z_height_for_age != null 
  ? getHAStatus(displayResult.z_height_for_age) 
  : haStatusFromLabel(latest?.ha_status)}/>
            </div>
          )}

          {/* เปรียบเทียบ 2 เทอม */}
          {records.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(records.length,2)},1fr)`,gap:8,marginBottom:12}}>
              {records.map(r=>(
                <div key={r.term} style={{background:"#f8faff",borderRadius:10,padding:"8px 10px",border:"1px solid #e0e7ff"}}>
                  <div style={{fontWeight:700,color:"#1e40af",fontSize:12,marginBottom:4}}>
                    {r.term==="term1"?"🌸 ครั้งที่ 1":"🍂 ครั้งที่ 2"}
                  </div>
                  <InfoRow label="น้ำหนัก" value={`${r.weight_kg} กก.`}/>
                  <InfoRow label="ส่วนสูง" value={`${r.height_cm} ซม.`}/>
                  <InfoRow label="%WH" value={`${r.pct_weight_for_height}%`}/>
                  <InfoRow label="%HA" value={`${r.pct_height_for_age}%`}/>
                </div>
              ))}
            </div>
          )}

          {/* กราฟ HA */}
          {displayResult&&(
            <>
              <div style={{fontWeight:700,color:"#1e3a8a",fontSize:12,marginBottom:4}}>📐 ส่วนสูงตามเกณฑ์อายุ</div>
              <HAChart student={student} actualHeight={displayResult.height_cm} ageMonths={displayResult.age_months}/>
              <div style={{fontWeight:700,color:"#1e3a8a",fontSize:12,margin:"10px 0 4px"}}>⚖️ น้ำหนักตามเกณฑ์ส่วนสูง</div>
              <WHChart actualWeight={displayResult.weight_kg} actualHeight={displayResult.height_cm} gender={g}/>
            </>
          )}

          {!displayResult&&records.length===0&&(
            <div style={{textAlign:"center",padding:20,color:"#9ca3af",fontSize:13}}>📭 ยังไม่มีข้อมูลการวัด</div>
          )}
        </>
      )}
    </div>
  );
}

// ── ClassPage ─────────────────────────────────────────────────────────────────
function ClassPage({currentUser, isAdmin}) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [term, setTerm] = useState("term1");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);

// useEffect 2 — โหลดห้องเรียน (อยู่ใน ClassPage)
useEffect(() => {
  if (!currentUser) return;
  const loadRooms = async () => {
    let rooms = [];
    if (isAdmin) {
      const { data } = await supabase.from("classrooms").select("id,room_name,room_number,academic_year_id");
      rooms = sortClassrooms((data || []).map(c => ({ ...c, classroom_id: c.id })));
    } else {
      rooms = await fetchMyClassrooms(currentUser.id);
    }
    setClassrooms(rooms);
    if (rooms.length === 1) setSelectedClass(rooms[0]);
  };
  loadRooms();
}, [currentUser, isAdmin])

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);

    const classroomId = selectedClass.classroom_id || selectedClass.id;

    const { data: nutritionData } = await supabase
      .from("v_nutrition_student_detail")
      .select("*")
      .eq("classroom_id", classroomId)
      .eq("term", term);

    const studentIds = (nutritionData || []).map(r => r.student_id).filter(Boolean);

    let seatMap = {};
    if (studentIds.length > 0) {
      const { data: studentData } = await supabase
        .from("students")
        .select("id, seat_number")
        .in("id", studentIds);
      (studentData || []).forEach(s => { seatMap[s.id] = s.seat_number; });
    }

    const merged = (nutritionData || [])
      .map(r => ({ ...r, seat_number: seatMap[r.student_id] ?? null }))
      .sort((a, b) => {
        const sa = a.seat_number, sb = b.seat_number;
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return Number(sa) - Number(sb);
      });

    setRecords(merged);
    setLoading(false);
  }, [selectedClass, term]);

  function classifyWH(whStatus) {
    if (!whStatus) return null;
    if (whStatus === "สมส่วน") return "normal";
    if (whStatus.includes("ผอม") && !whStatus.includes("แห้ง")) return "risk";
    return "urgent";
  }

  const displayRecords = useMemo(() => {
    if (!statusFilter) return records;
    return records.filter(r => classifyWH(r.wh_status) === statusFilter);
  }, [records, statusFilter]);

  const summary = useMemo(() => {
    let normal = 0, risk = 0, urgent = 0;
    records.forEach(r => {
      if (!r.wh_status) return;
      if (r.wh_status === "สมส่วน") normal++;
      else if (r.wh_status.includes("ผอม") && !r.wh_status.includes("แห้ง")) risk++;
      else urgent++;
    });
    return { total: records.length, normal, risk, urgent };
  }, [records]);

  const handlePrint = () => {
    const termLabel = term === "term1" ? "ครั้งที่ 1" : "ครั้งที่ 2";
    const html = `<h3>${selectedClass?.room_name} — ${termLabel}</h3>
    <table><thead><tr>
      <th>เลขที่</th><th>ชื่อ-นามสกุล</th><th>อายุ</th><th>เพศ</th>
      <th>น้ำหนัก</th><th>ส่วนสูง</th><th>IBW</th><th>%HA</th><th>%WH</th><th>ภาวะ WH</th><th>ภาวะ HA</th>
    </tr></thead><tbody>
      ${displayRecords.map((r, i) => {
        const wh = r.result ? getWHStatus(r.result.z_weight_for_height) : null;
        const ha = r.result ? getHAStatus(r.result.z_height_for_age) : null;
        return `<tr>
          <td style="text-align:center">${r.seat_number ?? (i + 1)}</td>
          <td>${genderPrefix(r.gender, selectedClass?.room_name)} ${r.first_name} ${r.last_name}</td>
          <td>${r.birth_date ? formatAge(r.birth_date) : "—"}</td>
          <td>${genderLabel(r.gender)}</td>
          <td>${r.weight_kg ?? "—"}</td><td>${r.height_cm ?? "—"}</td>
          <td>${r.ibw_kg ?? "—"}</td>
          <td>${r.pct_height_for_age ? r.pct_height_for_age + "%" : "—"}</td>
          <td>${r.pct_weight_for_height ? r.pct_weight_for_height + "%" : "—"}</td>
          <td>${wh ? `<span class="badge ${wh.label.includes("สมส่วน") ? "normal" : wh.label.includes("ผอม") || wh.label.includes("อ้วน") ? "danger" : "warn"}">${wh.label}</span>` : "—"}</td>
          <td>${ha ? `<span class="badge ${ha.label.includes("ตามเกณฑ์") ? "normal" : ha.label.includes("เตี้ย") ? "danger" : "blue"}">${ha.label}</span>` : "—"}</td>
        </tr>`;
      }).join("")}
    </tbody></table>
    <p style="margin-top:12px;font-size:11px;color:#6b7280">สมส่วน ${summary.normal} คน | เสี่ยง ${summary.risk} คน | เร่งด่วน ${summary.urgent} คน | รวม ${summary.total} คน</p>`;
    const w = window.open("", "_blank", "width=1100,height=750");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายงาน ${selectedClass?.room_name}</title>
      <style>body{font-family:'Sarabun',sans-serif;font-size:12px;margin:20px}h2,h3{color:#1e40af}
      table{width:100%;border-collapse:collapse}th{background:#1e40af;color:#fff;padding:6px 8px;font-size:11px;text-align:left}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}tr:nth-child(even)td{background:#f8faff}
      .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}
      .normal{background:#dcfce7;color:#166534}.warn{background:#fef9c3;color:#854d0e}
      .danger{background:#fee2e2;color:#991b1b}.blue{background:#dbeafe;color:#1e40af}
      @media print{button{display:none}}</style></head>
      <body><h2>โรงเรียนวัดเขียนเขต — รายงานภาวะโภชนาการนักเรียน</h2>${html}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
          {(isAdmin || classrooms.length > 1) ? (
            <div style={{flex:1,minWidth:160}}>
              <label style={S.label}>ห้องเรียน</label>
              <select style={S.select} value={selectedClass?.classroom_id||selectedClass?.id||""}
                onChange={e => setSelectedClass(classrooms.find(c => (c.classroom_id||c.id) === e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c => <option key={c.classroom_id||c.id} value={c.classroom_id||c.id}>{c.room_name}</option>)}
              </select>
            </div>
          ) : (
            <div style={{flex:1,background:"#eff6ff",borderRadius:10,padding:"10px 14px",color:"#1e40af",fontWeight:700,fontSize:14}}>
              📚 {classrooms[0]?.room_name}
            </div>
          )}
          <div style={{minWidth:140}}>
            <label style={S.label}>ครั้งที่</label>
            <select style={S.select} value={term} onChange={e => setTerm(e.target.value)}>
              <option value="term1">🌸 ครั้งที่ 1</option>
              <option value="term2">🍂 ครั้งที่ 2</option>
            </select>
          </div>
          <button onClick={load} style={S.btn}>🔍 แสดงผล</button>
          {records.length > 0 && <button onClick={handlePrint} style={S.btnPrint}>🖨️ พิมพ์รายงาน</button>}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <div onClick={() => setStatusFilter(null)} style={{cursor:"pointer"}}>
          <StatCard label="ทั้งหมด" value={summary.total} color="#3b82f6" icon="👨‍👩‍👧‍👦"/>
        </div>
        <div onClick={() => setStatusFilter(statusFilter==="normal"?null:"normal")} style={{cursor:"pointer"}}>
          <StatCard label="สมส่วน" value={summary.normal} color="#16a34a" icon="✅"/>
        </div>
        <div onClick={() => setStatusFilter(statusFilter==="risk"?null:"risk")} style={{cursor:"pointer"}}>
          <StatCard label="เสี่ยงโภชนาการ" value={summary.risk} color="#f59e0b" icon="⚠️"/>
        </div>
        <div onClick={() => setStatusFilter(statusFilter==="urgent"?null:"urgent")} style={{cursor:"pointer"}}>
          <StatCard label="ต้องดูแลเร่งด่วน" value={summary.urgent} color="#dc2626" icon="🚨"/>
        </div>
      </div>

      {statusFilter && (
        <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,color:"#1e40af",fontWeight:700}}>
            🔍 กรองแสดง: {statusFilter==="normal"?"สมส่วน":statusFilter==="risk"?"เสี่ยงโภชนาการ":"ต้องดูแลเร่งด่วน"}
          </span>
          <button onClick={() => setStatusFilter(null)} style={{...S.btnSm,background:"#f1f5f9",color:"#6b7280"}}>✕ ล้างตัวกรอง</button>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>⏳ กำลังโหลด...</div>
      ) : (
        <div style={S.card}>
          <div style={S.cardTitle}>📋 รายชื่อนักเรียน ({records.length} คน)</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:800}}>
              <thead>
                <tr style={{background:"linear-gradient(135deg,#1e40af,#3b82f6)"}}>
                  {["เลขที่","ชื่อ-นามสกุล","อายุ","เพศ","น้ำหนัก","ส่วนสูง","IBW","% HA","% WH","ภาวะ WH","ภาวะ HA"].map(h => (
                    <th key={h} style={{padding:"9px 8px",textAlign:"left",color:"#fff",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r, i) => (
                  <tr key={r.student_id+r.term} style={{background:i%2===0?"#f8faff":"#fff"}}>
                    <td style={{padding:"7px 8px",color:"#6b7280",textAlign:"center",fontWeight:700}}>{r.seat_number ?? (i + 1)}</td>
                    <td style={{padding:"7px 8px",fontWeight:600,color:"#1e3a8a",whiteSpace:"nowrap"}}>
                      {genderPrefix(r.gender, selectedClass?.room_name)} {r.first_name} {r.last_name}
                    </td>
                    <td style={{padding:"7px 8px",color:"#6b7280"}}>{r.birth_date ? formatAge(r.birth_date) : "—"}</td>
                    <td style={{padding:"7px 8px"}}>{genderLabel(r.gender)}</td>
                    <td style={{padding:"7px 8px",fontWeight:700}}>{r.weight_kg ?? "—"}</td>
                    <td style={{padding:"7px 8px",fontWeight:700}}>{r.height_cm ?? "—"}</td>
                    <td style={{padding:"7px 8px"}}>{r.ibw_kg ?? "—"}</td>
                    <td style={{padding:"7px 8px"}}>{r.pct_height_for_age ? r.pct_height_for_age+"%" : "—"}</td>
                    <td style={{padding:"7px 8px"}}>{r.pct_weight_for_height ? r.pct_weight_for_height+"%" : "—"}</td>
                    <td style={{padding:"7px 8px"}}><Badge status={whStatusFromLabel(r.wh_status)}/></td>
                    <td style={{padding:"7px 8px"}}><Badge status={haStatusFromLabel(r.ha_status)}/></td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={11} style={{textAlign:"center",padding:32,color:"#9ca3af"}}>
                    📭 กด "แสดงผล" เพื่อโหลดข้อมูล
                  </td></tr>
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
function ComparePage({currentUser,isAdmin}) {
  const [classrooms,setClassrooms]=useState([]);
  const [selectedClass,setSelectedClass]=useState(null);
  const [term1Data,setTerm1Data]=useState([]);
  const [term2Data,setTerm2Data]=useState([]);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    if(!currentUser) return;
    const load=async()=>{
      let rooms=[];
      if(isAdmin){
        const {data}=await supabase.from("classrooms").select("id,room_name").order("room_number");
        rooms=sortClassrooms((data||[]).map(c=>({...c,classroom_id:c.id})));
      } else rooms=await fetchMyClassrooms(currentUser.id);
      setClassrooms(rooms);
      if(rooms.length===1) setSelectedClass(rooms[0]);
    };
    load();
  },[currentUser,isAdmin]);

  const load=useCallback(async()=>{
    if(!selectedClass) return;
    setLoading(true);
    const cid=selectedClass.classroom_id||selectedClass.id;
    const [r1,r2]=await Promise.all([
      supabase.from("v_nutrition_student_detail").select("*").eq("classroom_id",cid).eq("term","term1"),
      supabase.from("v_nutrition_student_detail").select("*").eq("classroom_id",cid).eq("term","term2"),
    ]);
    setTerm1Data(r1.data||[]); setTerm2Data(r2.data||[]);
    setLoading(false);
  },[selectedClass]);

  const chartData=useMemo(()=>{
    const map={};
    term1Data.forEach(r=>{map[r.student_id]={name:r.first_name,w1:r.weight_kg,h1:r.height_cm};});
    term2Data.forEach(r=>{
      if(!map[r.student_id]) map[r.student_id]={name:r.first_name};
      map[r.student_id].w2=r.weight_kg; map[r.student_id].h2=r.height_cm;
    });
    return Object.values(map).slice(0,20);
  },[term1Data,term2Data]);

  const handlePrint=()=>{
    if(!selectedClass) return;
    const html=`<h3>${selectedClass.room_name} — เปรียบเทียบครั้งที่ 1 และ 2</h3>
    <table><thead><tr><th>ชื่อ</th><th>น้ำหนัก ครั้ง 1</th><th>น้ำหนัก ครั้ง 2</th><th>เพิ่มขึ้น</th><th>ส่วนสูง ครั้ง 1</th><th>ส่วนสูง ครั้ง 2</th><th>เพิ่มขึ้น</th></tr></thead>
    <tbody>${chartData.map(d=>`<tr>
      <td>${d.name}</td>
      <td>${d.w1??"—"}</td><td>${d.w2??"—"}</td>
      <td>${d.w1&&d.w2?+(d.w2-d.w1).toFixed(1):"—"}</td>
      <td>${d.h1??"—"}</td><td>${d.h2??"—"}</td>
      <td>${d.h1&&d.h2?+(d.h2-d.h1).toFixed(1):"—"}</td>
    </tr>`).join("")}</tbody></table>`;
    const w=window.open("","_blank","width=900,height=650");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:'Sarabun',sans-serif;font-size:12px;margin:20px}h2,h3{color:#1e40af}
      table{width:100%;border-collapse:collapse}th{background:#1e40af;color:#fff;padding:6px 8px;font-size:11px}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}tr:nth-child(even)td{background:#f8faff}
      @media print{button{display:none}}</style></head>
      <body><h2>โรงเรียนวัดเขียนเขต — รายงานเปรียบเทียบโภชนาการ</h2>${html}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
          {(isAdmin||classrooms.length>1)?(
            <div style={{flex:1}}>
              <label style={S.label}>ห้องเรียน</label>
              <select style={S.select} value={selectedClass?.classroom_id||selectedClass?.id||""}
                onChange={e=>setSelectedClass(classrooms.find(c=>(c.classroom_id||c.id)===e.target.value))}>
                <option value="">— เลือกห้องเรียน —</option>
                {classrooms.map(c=><option key={c.classroom_id||c.id} value={c.classroom_id||c.id}>{c.room_name}</option>)}
              </select>
            </div>
          ):(
            <div style={{flex:1,background:"#eff6ff",borderRadius:10,padding:"10px 14px",color:"#1e40af",fontWeight:700}}>
              📚 {classrooms[0]?.room_name}
            </div>
          )}
          <button onClick={load} style={S.btn}>📊 เปรียบเทียบ</button>
          {chartData.length>0&&<button onClick={handlePrint} style={S.btnPrint}>🖨️ พิมพ์รายงาน</button>}
        </div>
      </div>

      {loading?<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>⏳ กำลังโหลด...</div>
        :chartData.length>0&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
              <StatCard label="วัดครั้งที่ 1" value={term1Data.length} color="#3b82f6" icon="🌸"/>
              <StatCard label="วัดครั้งที่ 2" value={term2Data.length} color="#8b5cf6" icon="🍂"/>
              <StatCard label="น้ำหนักเพิ่ม" value={chartData.filter(d=>d.w1&&d.w2&&d.w2>d.w1).length} color="#16a34a" icon="📈"/>
              <StatCard label="ส่วนสูงเพิ่ม" value={chartData.filter(d=>d.h1&&d.h2&&d.h2>d.h1).length} color="#0891b2" icon="🚀"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={S.card}>
                <div style={S.cardTitle}>⚖️ น้ำหนัก (กก.)</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{top:4,right:8,left:0,bottom:35}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff"/>
                    <XAxis dataKey="name" tick={{fontSize:10}} angle={-35} textAnchor="end"/>
                    <YAxis tick={{fontSize:11}} unit=" กก."/>
                    <Tooltip contentStyle={{borderRadius:10,border:"1px solid #c7d2fe"}}/>
                    <Bar dataKey="w1" name="ครั้งที่ 1" fill="#3b82f6" radius={[4,4,0,0]}/>
                    <Bar dataKey="w2" name="ครั้งที่ 2" fill="#8b5cf6" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={S.card}>
                <div style={S.cardTitle}>📐 ส่วนสูง (ซม.)</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{top:4,right:8,left:0,bottom:35}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff"/>
                    <XAxis dataKey="name" tick={{fontSize:10}} angle={-35} textAnchor="end"/>
                    <YAxis tick={{fontSize:11}} unit=" ซม."/>
                    <Tooltip contentStyle={{borderRadius:10,border:"1px solid #c7d2fe"}}/>
                    <Bar dataKey="h1" name="ครั้งที่ 1" fill="#f59e0b" radius={[4,4,0,0]}/>
                    <Bar dataKey="h2" name="ครั้งที่ 2" fill="#10b981" radius={[4,4,0,0]}/>
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
const GRADE_GROUPS = ["อนุบาล","ประถมศึกษา","มัธยมศึกษาตอนต้น","มัธยมศึกษาตอนปลาย"];

function AdminPage({currentUser}) {
  const [gradeGroup, setGradeGroup] = useState("");
  const [classrooms, setClassrooms] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [term, setTerm] = useState("term1");
  const [loading, setLoading] = useState(false);
  const [chartFilter, setChartFilter] = useState(null); // null|"normal"|"risk"|"urgent"

  useEffect(() => {
    supabase.from("classrooms")
      .select("id,room_name,room_number,student_count,academic_year_id")
      .then(({ data }) => {
        const sorted = sortClassrooms(data || []);
        setClassrooms(sorted);
        if (sorted?.[0]) setSelectedYear(sorted[0].academic_year_id);
      });
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_grade_summary", {
      p_academic_year_id: selectedYear,
      p_term: term,
      p_grade_group: gradeGroup || null
    });
    // sort ตามลำดับ อ→ป→ม
    const sorted = sortClassrooms((data || []).map(r => ({ ...r, room_name: r.room_name })));
    setSummary(sorted);
    setLoading(false);
  };

  const totals = useMemo(() => {
    const normalCount  = summary.reduce((s,r) => s + Number(r.wh_normal_count  || 0), 0);
    const riskCount    = summary.reduce((s,r) => s + Number(r.wh_risk_count    || 0), 0);
    const urgentCount  = summary.reduce((s,r) => s + Number(r.wh_urgent_count  || 0), 0);
    const measured     = summary.reduce((s,r) => s + Number(r.measured_count   || 0), 0);
    return {
      total: classrooms.reduce((s,c) => s + (c.student_count||0), 0),
      measured,
      normalCount,
      normalPct: measured ? Math.round(normalCount / measured * 100) : 0,
      riskCount,
      riskPct:   measured ? Math.round(riskCount   / measured * 100) : 0,
      urgentCount,
      urgentPct: measured ? Math.round(urgentCount / measured * 100) : 0,
    };
  }, [classrooms, summary]);

  // กรอง summary ตาม chartFilter สำหรับกราฟ
  const chartDataKey = chartFilter === "normal"  ? "wh_normal_pct"
                     : chartFilter === "risk"    ? "wh_risk_pct"
                     : chartFilter === "urgent"  ? "wh_urgent_pct"
                     : null; // null = แสดงทั้งหมด

  return (
    <div>
      {/* Filter bar */}
      <div style={S.card}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:160}}>
            <label style={S.label}>สายชั้น</label>
            <select style={S.select} value={gradeGroup} onChange={e=>setGradeGroup(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {GRADE_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{minWidth:140}}>
            <label style={S.label}>ครั้งที่</label>
            <select style={S.select} value={term} onChange={e=>setTerm(e.target.value)}>
              <option value="term1">🌸 ครั้งที่ 1</option>
              <option value="term2">🍂 ครั้งที่ 2</option>
            </select>
          </div>
          <button onClick={load} style={S.btn}>📊 โหลดข้อมูล</button>
        </div>
      </div>

      {/* Summary cards — กดได้ */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:16}}>
        <StatCard label="นักเรียนทั้งหมด" value={totals.total.toLocaleString()} color="#3b82f6" icon="👨‍👩‍👧‍👦" sub="คน"/>
        <StatCard label="วัดแล้ว" value={totals.measured.toLocaleString()} color="#8b5cf6" icon="📏" sub="คน"/>

        {/* กดการ์ดสมส่วน */}
        <div onClick={() => setChartFilter(chartFilter==="normal"?null:"normal")}
          style={{cursor:"pointer", outline: chartFilter==="normal"?"3px solid #16a34a":"none", borderRadius:14}}>
          <StatCard label="สมส่วน" value={`${totals.normalCount} คน`} color="#16a34a" icon="✅" sub={`${totals.normalPct}% ของที่วัดแล้ว`}/>
        </div>

        {/* กดการ์ดเสี่ยง */}
        <div onClick={() => setChartFilter(chartFilter==="risk"?null:"risk")}
          style={{cursor:"pointer", outline: chartFilter==="risk"?"3px solid #f59e0b":"none", borderRadius:14}}>
          <StatCard label="เสี่ยงโภชนาการ" value={`${totals.riskCount} คน`} color="#f59e0b" icon="⚠️" sub={`${totals.riskPct}% ของที่วัดแล้ว`}/>
        </div>

        {/* กดการ์ดเร่งด่วน */}
        <div onClick={() => setChartFilter(chartFilter==="urgent"?null:"urgent")}
          style={{cursor:"pointer", outline: chartFilter==="urgent"?"3px solid #dc2626":"none", borderRadius:14}}>
          <StatCard label="ต้องดูแลเร่งด่วน" value={`${totals.urgentCount} คน`} color="#dc2626" icon="🚨" sub={`${totals.urgentPct}% ของที่วัดแล้ว`}/>
        </div>
      </div>

      {/* แสดง label การกรอง */}
      {chartFilter && (
        <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:chartFilter==="normal"?"#16a34a":chartFilter==="risk"?"#f59e0b":"#dc2626"}}>
            {chartFilter==="normal"?"✅ กราฟ: สมส่วน":chartFilter==="risk"?"⚠️ กราฟ: เสี่ยง":"🚨 กราฟ: เร่งด่วน"}
          </span>
          <button onClick={()=>setChartFilter(null)} style={{...S.btnSm,background:"#f1f5f9",color:"#6b7280"}}>✕ ดูทั้งหมด</button>
        </div>
      )}

      {/* กราฟ */}
      {loading
        ? <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>⏳ กำลังโหลด...</div>
        : summary.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>
              🏫 สรุปรายห้องเรียน
              {chartFilter && <span style={{fontSize:12,fontWeight:400,color:"#6b7280",marginLeft:8}}>
                (แสดงเฉพาะ: {chartFilter==="normal"?"สมส่วน":chartFilter==="risk"?"เสี่ยง":"เร่งด่วน"})
              </span>}
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={summary} margin={{top:8,right:16,left:0,bottom:60}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff"/>
                <XAxis dataKey="room_name" tick={{fontSize:11}} angle={-40} textAnchor="end" interval={0}/>
                <YAxis tick={{fontSize:11}} unit="%" domain={[0,100]}/>
                <Tooltip contentStyle={{borderRadius:10,fontSize:12}} formatter={(v,name)=>[`${v??0}%`,name]}/>
                <Legend verticalAlign="top" height={36}/>
                {/* ถ้ากดการ์ด แสดงเฉพาะ bar นั้น */}
                {(!chartFilter || chartFilter==="normal") && (
                  <Bar dataKey="wh_normal_pct" name="✅ สมส่วน" fill="#16a34a"
                    stackId={chartFilter ? undefined : "a"} radius={chartFilter?[4,4,0,0]:undefined}/>
                )}
                {(!chartFilter || chartFilter==="risk") && (
                  <Bar dataKey="wh_risk_pct" name="⚠️ เสี่ยง" fill="#f59e0b"
                    stackId={chartFilter ? undefined : "a"} radius={chartFilter?[4,4,0,0]:undefined}/>
                )}
                {(!chartFilter || chartFilter==="urgent") && (
                  <Bar dataKey="wh_urgent_pct" name="🚨 เร่งด่วน" fill="#dc2626"
                    stackId={chartFilter ? undefined : "a"} radius={[4,4,0,0]}/>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }

      {/* ตารางสรุป */}
      {summary.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>📋 ตารางสรุปรายห้องเรียน</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"linear-gradient(135deg,#1e40af,#3b82f6)"}}>
                  {["ห้องเรียน","วัดแล้ว","✅ สมส่วน","% สมส่วน","⚠️ เสี่ยง","% เสี่ยง","🚨 เร่งด่วน","% เร่งด่วน"].map(h=>(
                    <th key={h} style={{padding:"8px",color:"#fff",fontWeight:700,fontSize:11,textAlign:"center"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((r,i) => (
                  <tr key={r.room_name} style={{background:i%2===0?"#f8faff":"#fff",textAlign:"center"}}>
                    <td style={{padding:"7px 8px",fontWeight:700,color:"#1e3a8a"}}>{r.room_name}</td>
                    <td style={{padding:"7px 8px"}}>{r.measured_count ?? "-"}</td>
                    <td style={{padding:"7px 8px",color:"#16a34a",fontWeight:700}}>{r.wh_normal_count ?? "-"}</td>
                    <td style={{padding:"7px 8px"}}>
                      <span style={{background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700}}>
                        {r.wh_normal_pct ?? 0}%
                      </span>
                    </td>
                    <td style={{padding:"7px 8px",color:"#f59e0b",fontWeight:700}}>{r.wh_risk_count ?? "-"}</td>
                    <td style={{padding:"7px 8px"}}>
                      <span style={{background:"#fef9c3",color:"#854d0e",padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700}}>
                        {r.wh_risk_pct ?? 0}%
                      </span>
                    </td>
                    <td style={{padding:"7px 8px",color:"#dc2626",fontWeight:700}}>{r.wh_urgent_count ?? "-"}</td>
                    <td style={{padding:"7px 8px"}}>
                      <span style={{background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700}}>
                        {r.wh_urgent_pct ?? 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ManagersPage — จัดการผู้ดูแลโครงการ ─────────────────────────────────────
function ManagersPage({currentUser}) {
  const [managers,setManagers]=useState([]);
  const [allUsers,setAllUsers]=useState([]);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    // ดึง managers แยก — ไม่ join เพื่อหลีกเลี่ยง FK ชื่อผิด
    const { data: mgData } = await supabase
      .from("nutrition_project_managers")
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false });

    const { data: usrData } = await supabase
      .from("users")
      .select("id, first_name, last_name, title, role")
      .order("first_name");

    // merge ด้วย JS
    const userMap = {};
    (usrData || []).forEach(u => { userMap[u.id] = u; });

    const merged = (mgData || []).map(m => ({
      ...m,
      user: userMap[m.user_id] || null,
    }));

    setManagers(merged);
    setAllUsers(usrData || []);
    setLoading(false);
  }, []);

  useEffect(()=>{loadData();},[loadData]);

  const managerIds=useMemo(()=>new Set(managers.map(m=>m.user_id)),[managers]);

  const filtered=useMemo(()=>{
    if(!search) return [];
    const q=search.toLowerCase();
    return allUsers.filter(u=>
      !managerIds.has(u.id)&&
      (`${u.first_name} ${u.last_name}`.toLowerCase().includes(q)||
       (u.title||"").toLowerCase().includes(q))
    ).slice(0,8);
  },[allUsers,search,managerIds]);

  const handleAdd = async (userToAdd) => {
    setAdding(true);
    const { error } = await supabase
      .from("nutrition_project_managers")
      .upsert(
        [{ user_id: userToAdd.id, added_by: currentUser.id }],
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    if (error) {
      alert("❌ " + error.message);
    } else {
      setSearch("");
      await loadData();
    }
    setAdding(false);
  };

  const handleRemove=async(id)=>{
    if(!confirm("ยืนยันการลบผู้ดูแลโครงการคนนี้?")) return;
    await supabase.from("nutrition_project_managers").delete().eq("id",id);
    await loadData();
  };

  const roleLabel={homeroom_teacher:"ครูประจำชั้น",subject_teacher:"ครูผู้สอน",
    admin:"ผู้ดูแลระบบ",director:"ผู้อำนวยการ",deputy_director:"รองผู้อำนวยการ",
    dept_head:"หัวหน้าฝ่าย",grade_head:"หัวหน้าระดับ"};

  return (
    <div style={{maxWidth:700}}>
      <div style={{...S.card,background:"linear-gradient(135deg,#fffbeb,#fef3c7)",border:"1px solid #fcd34d",marginBottom:16}}>
        <div style={{fontWeight:700,color:"#92400e",fontSize:14,marginBottom:4}}>⚙️ ผู้ดูแลโครงการโภชนาการ</div>
        <div style={{color:"#92400e",fontSize:13}}>ผู้ดูแลโครงการสามารถดูข้อมูลสรุปภาพรวมรายห้อง/รายสายชั้น/ทั้งโรงเรียนได้ เหมือนผู้บริหาร</div>
      </div>

      {/* ค้นหาและเพิ่ม */}
      <div style={S.card}>
        <div style={S.cardTitle}>➕ เพิ่มผู้ดูแลโครงการ</div>
        <div style={{position:"relative"}}>
          <input
            type="text" value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 พิมพ์ชื่อหรือนามสกุลเพื่อค้นหา..."
            style={{...S.input,marginBottom:0}}
          />
          {filtered.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",
              border:"1.5px solid #c7d2fe",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",
              zIndex:50,overflow:"hidden",marginTop:4}}>
              {filtered.map(u=>(
                <button key={u.id} onClick={()=>handleAdd(u)} disabled={adding}
                  style={{width:"100%",padding:"10px 14px",border:"none",background:"transparent",
                    textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",
                    justifyContent:"space-between",gap:8,fontFamily:"inherit",
                    borderBottom:"1px solid #f0f4ff"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div>
                    <span style={{fontWeight:700,color:"#1e3a8a",fontSize:14}}>
                      {u.title}{u.first_name} {u.last_name}
                    </span>
                    <span style={{color:"#6b7280",fontSize:12,marginLeft:8}}>
                      {roleLabel[u.role]||u.role}
                    </span>
                  </div>
                  <span style={{color:"#3b82f6",fontWeight:700,fontSize:12,flexShrink:0}}>+ เพิ่ม</span>
                </button>
              ))}
            </div>
          )}
          {search.length>0&&filtered.length===0&&(
            <div style={{padding:"12px 14px",color:"#9ca3af",fontSize:13,marginTop:4,
              background:"#f8faff",borderRadius:10,border:"1px solid #e0e7ff"}}>
              ไม่พบผู้ใช้ หรืออาจเป็นผู้ดูแลโครงการอยู่แล้ว
            </div>
          )}
        </div>
      </div>

      {/* รายชื่อผู้ดูแล */}
      <div style={S.card}>
        <div style={S.cardTitle}>👥 ผู้ดูแลโครงการปัจจุบัน ({managers.length} คน)</div>
        {loading?(
          <div style={{textAlign:"center",padding:24,color:"#6b7280"}}>⏳ กำลังโหลด...</div>
        ):managers.length===0?(
          <div style={{textAlign:"center",padding:24,color:"#9ca3af"}}>ยังไม่มีผู้ดูแลโครงการ</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {managers.map(m=>{
              const u=m.user;
              return (
                <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 14px",background:"#f8faff",borderRadius:12,border:"1px solid #e0e7ff"}}>
                  <div>
                    <span style={{fontWeight:700,color:"#1e3a8a",fontSize:14}}>
                      {u?.title}{u?.first_name} {u?.last_name}
                    </span>
                    <span style={{color:"#6b7280",fontSize:12,marginLeft:8}}>
                      {roleLabel[u?.role]||u?.role}
                    </span>
                  </div>
                  <button onClick={()=>handleRemove(m.id)} style={S.btnDanger}>
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

// ── Charts ────────────────────────────────────────────────────────────────────
function HAChart({student,actualHeight,ageMonths}) {
  const g=gKey(student.gender);
  const points=[];
  for(let a=ageMonths-18;a<=ageMonths+18;a+=6){
    if(a<0) continue;
    const m=medH(a,g);
    points.push({age:`${Math.floor(a/12)}ปี${a%12}ด`,med:m,
      p90:+(m*0.90).toFixed(1),p85:+(m*0.85).toFixed(1),p110:+(m*1.10).toFixed(1),
      actual:a===ageMonths?actualHeight:undefined});
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={points} margin={{top:4,right:8,left:0,bottom:20}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff"/>
        <XAxis dataKey="age" tick={{fontSize:9}} angle={-30} textAnchor="end"/>
        <YAxis tick={{fontSize:10}} unit=" ซม." width={45}/>
        <Tooltip contentStyle={{borderRadius:10,fontSize:11}}/>
        <Line type="monotone" dataKey="med"    name="มาตรฐาน" stroke="#3b82f6" strokeWidth={2} dot={false}/>
        <Line type="monotone" dataKey="p90"    name="-2SD"     stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} dot={false}/>
        <Line type="monotone" dataKey="p85"    name="-3SD"     stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} dot={false}/>
        <Line type="monotone" dataKey="p110"   name="+2SD"     stroke="#8b5cf6" strokeDasharray="4 3" strokeWidth={1} dot={false}/>
        <Line type="monotone" dataKey="actual" name="นักเรียน" stroke="#1e40af" strokeWidth={0}
          dot={{r:7,fill:"#1e40af",stroke:"#fff",strokeWidth:2}}/>
      </LineChart>
    </ResponsiveContainer>
  );
}
function WHChart({actualWeight,actualHeight,gender}) {
  const points=[];
  for(let h=actualHeight-20;h<=actualHeight+20;h+=5){
    const m=medW(h,gender);
    points.push({h:`${h}`,med:m,p80:+(m*0.80).toFixed(1),p110:+(m*1.10).toFixed(1),p120:+(m*1.20).toFixed(1),
      actual:Math.abs(h-actualHeight)<2.6?actualWeight:undefined});
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={points} margin={{top:4,right:8,left:0,bottom:16}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff"/>
        <XAxis dataKey="h" tick={{fontSize:10}} unit=" ซม."/>
        <YAxis tick={{fontSize:10}} unit=" กก." width={40}/>
        <Tooltip contentStyle={{borderRadius:10,fontSize:11}}/>
        <Line type="monotone" dataKey="med"    name="มาตรฐาน" stroke="#3b82f6" strokeWidth={2} dot={false}/>
        <Line type="monotone" dataKey="p80"    name="-2SD"     stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} dot={false}/>
        <Line type="monotone" dataKey="p110"   name="+2SD"     stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} dot={false}/>
        <Line type="monotone" dataKey="p120"   name="+3SD"     stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} dot={false}/>
        <Line type="monotone" dataKey="actual" name="นักเรียน" stroke="#1e40af" strokeWidth={0}
          dot={{r:7,fill:"#1e40af",stroke:"#fff",strokeWidth:2}}/>
      </LineChart>
    </ResponsiveContainer>
  );
}