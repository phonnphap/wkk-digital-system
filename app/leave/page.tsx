"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LeaveType, LeaveStatus, LeaveRequest,
  LEAVE_TYPE_CONFIG, LEAVE_STATUS_CONFIG,
  getCurrentFiscalYear, isInFiscalYear,
} from "../../lib/leave-config";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const supabase = createClient();
const HR_EMAIL = "hr@khienkhet.ac.th";

// ─── Fixed approvers ──────────────────────────────────────────────────────────
const FIXED_APPROVERS = [
  { email: "phansa@khienkhet.ac.th",  label: "หัวหน้ากลุ่มบริหารงานบุคคล" },
  { email: "titima@khienkhet.ac.th",  label: "รองผู้อำนวยการกลุ่มบริหารงานบุคคล" },
  { email: "",                         label: "ผู้อำนวยการโรงเรียน", role: "director" },
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function toThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
function fiscalYearLabel(fy: number) { return `ปีงบประมาณ ${fy + 543}`; }
function daysBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(Math.round(ms / 86400000) + 1, 0);
}
function fullName(u: any) {
  if (!u) return "";
  if (u.full_name) return u.full_name;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
}
function getEvalRound(dateStr: string): "1" | "2" {
  const m = new Date(dateStr).getMonth() + 1;
  return m >= 10 || m <= 3 ? "1" : "2";
}

async function sendNotificationEmail(payload: { to: string; subject: string; body: string }) {
  try {
    await fetch("/api/send-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.error("Email failed:", e); }
}

async function createNotification(userId: string, message: string, leaveId: string) {
  try {
    await (supabase.from("notifications") as any).insert([{
      user_id: userId, message, reference_id: leaveId,
      reference_type: "leave_request", is_read: false,
    }]);
  } catch {}
}

// ─── Types ────────────────────────────────────────────────────────────────────
type UserProfile = {
  id: string; first_name?: string; last_name?: string;
  full_name?: string; email: string; role: string;
  position?: string; signature_url?: string; grade_level?: string;
};
type ApproverInfo = { id: string; full_name: string; position?: string; email?: string };
type DutyOfficer  = { id: string; full_name: string; position?: string; email?: string };

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  sick:       { bg:"bg-red-50",    border:"border-red-200",    text:"text-red-700",    activeBg:"bg-red-100",    dot:"bg-red-400",    ring:"ring-red-300"    },
  personal:   { bg:"bg-amber-50",  border:"border-amber-200",  text:"text-amber-700",  activeBg:"bg-amber-100",  dot:"bg-amber-400",  ring:"ring-amber-300"  },
  maternity:  { bg:"bg-pink-50",   border:"border-pink-200",   text:"text-pink-700",   activeBg:"bg-pink-100",   dot:"bg-pink-400",   ring:"ring-pink-300"   },
  ordination: { bg:"bg-violet-50", border:"border-violet-200", text:"text-violet-700", activeBg:"bg-violet-100", dot:"bg-violet-400", ring:"ring-violet-300" },
  official:   { bg:"bg-sky-50",    border:"border-sky-200",    text:"text-sky-700",    activeBg:"bg-sky-100",    dot:"bg-sky-400",    ring:"ring-sky-300"    },
  other:      { bg:"bg-slate-50",  border:"border-slate-200",  text:"text-slate-700",  activeBg:"bg-slate-100",  dot:"bg-slate-400",  ring:"ring-slate-300"  },
};

const LEAVE_TYPE_LIST: { key: LeaveType; label: string; icon: string }[] = [
  { key:"sick",       label:"ลาป่วย",                           icon:"🤒" },
  { key:"personal",   label:"ลากิจส่วนตัว",                     icon:"📋" },
  { key:"maternity",  label:"ลาคลอดบุตร / ช่วยเหลือภริยาคลอด", icon:"👶" },
  { key:"ordination", label:"ลาอุปสมบท / ประกอบพิธีฮัจย์",      icon:"🙏" },
  { key:"official",   label:"ไปราชการ",                          icon:"🏛️" },
  { key:"other" as LeaveType, label:"ลาประเภทอื่นๆ",            icon:"📌" },
];

// ══════════════════════════════════════════════════════════════════════════════
// ─── SignaturePad (real canvas implementation) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function SignaturePad({ initialUrl, onSave, onClose }: {
  initialUrl: string; onSave: (dataUrl: string) => void; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!initialUrl);
  const lastPos = useRef<{x:number;y:number}|null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e3a8a"; ctx.lineWidth = 2.5;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (initialUrl) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight); };
      img.src = initialUrl;
    }
  }, []);

  function getXY(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }
  function onStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const pos = getXY(e, canvas);
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; setDrawing(true); setIsEmpty(false);
  }
  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); if (!drawing) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getXY(e, canvas);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  }
  function onEnd(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); setDrawing(false); lastPos.current = null; }
  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    setIsEmpty(true);
  }
  function save() {
    if (isEmpty) { alert("กรุณาวาดลายเซ็นก่อน"); return; }
    onSave(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" style={{zIndex:9999}}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-800 text-base">✍️ เซ็นลายเซ็น</h3>
            <p className="text-xs text-slate-400">วาดลายเซ็นของคุณในกล่องด้านล่าง</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">✕</button>
        </div>
        <div className="p-4">
          <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white" style={{touchAction:"none"}}>
            <canvas ref={canvasRef} style={{width:"100%",height:180,display:"block",cursor:"crosshair"}}
              onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
              onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} />
          </div>
          <p className="text-xs text-slate-300 text-center mt-2 mb-1">— วาดลายเซ็นในกล่องด้านบน —</p>
        </div>
        <div className="px-4 pb-4 flex gap-3">
          <button onClick={clear} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm hover:bg-slate-50">🗑️ ล้าง</button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={isEmpty} className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">💾 บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── LeavePDFPreview (real HTML preview) ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function LeavePDFPreview({ data, signatureUrl, onConfirm, onCancel, onUpdateSignature }: {
  data: any; signatureUrl: string;
  onConfirm: (sig: string) => void; onCancel: () => void; onUpdateSignature: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const thaiDate = (iso: string) => iso ? new Date(iso).toLocaleDateString("th-TH", {
    day:"numeric", month:"long", year:"numeric", timeZone:"Asia/Bangkok",
  }) : "";

  const now  = new Date();
  const thDay   = now.getDate();
  const thMonth = now.toLocaleDateString("th-TH", { month:"long", timeZone:"Asia/Bangkok" });
  const thYear  = now.getFullYear() + 543;

  const isSick     = data.leaveType === "sick";
  const isPersonal = data.leaveType === "personal";
  const isMat      = data.leaveType === "maternity";
  const isOther    = data.leaveType === "other";
  const daysDisplay = data.halfDay ? "0.5" : String(data.days);
  const halfDayText = data.halfDay === "morning" ? " (ครึ่งวันเช้า)" : data.halfDay === "afternoon" ? " (ครึ่งวันบ่าย)" : "";
  const leaveLabel  = isOther && data.otherLeaveName ? data.otherLeaveName : data.leaveTypeName;

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun',Arial,sans-serif;font-size:14pt;color:#000;padding:16mm 18mm;background:white}
.center{text-align:center}.right{text-align:right}
.title{font-size:16pt;font-weight:bold;text-align:center;margin:8px 0}
.sub{text-align:right;margin-bottom:10px;line-height:1.7;font-size:13pt}
.ul{text-decoration:underline;display:inline-block;min-width:60px}
table.stat{border-collapse:collapse;font-size:12pt;width:48%}
table.stat td,table.stat th{border:1px solid #000;padding:4px 8px;text-align:center}
table.stat th{background:#f0f0f0;font-weight:bold}
.chk{display:inline-block;width:14px;height:14px;border:1.5px solid #000;vertical-align:middle;margin-right:4px;text-align:center;font-size:11pt;line-height:1.1}
.apv{border:1px solid #999;border-radius:4px;padding:10px 12px;font-size:12pt;min-height:100px}
.dotline{border-bottom:1px dotted #666;height:22px;margin:3px 0}
.sigimg{width:120px;height:55px;object-fit:contain;display:block;margin:0 auto 3px}
.sigline{border-bottom:1px solid #000;width:180px;margin:0 auto 3px}
</style></head><body>
<div class="center" style="margin-bottom:6px">
  <img src="https://system.khienkhet.ac.th/logo.png" style="width:65px;height:65px" onerror="this.style.display='none'"/>
</div>
<div class="title">แบบใบลาป่วย ลากิจส่วนตัว ลาคลอดบุตร</div>
<div class="sub">โรงเรียนวัดเขียนเขต ตำบลบึงยี่โถ<br>อำเภอธัญบุรี จังหวัดปทุมธานี</div>
<div class="right" style="margin-bottom:14px">
  วันที่ <span class="ul">&nbsp;${thDay}&nbsp;</span>
  เดือน <span class="ul">&nbsp;${thMonth}&nbsp;</span>
  พ.ศ. <span class="ul">&nbsp;${thYear}&nbsp;</span>
</div>
<div style="margin-bottom:6px">เรื่อง <span class="ul">&nbsp;&nbsp;ขอ${leaveLabel}${halfDayText}&nbsp;&nbsp;</span></div>
<div style="margin-bottom:14px">เรียน ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
<div style="margin-bottom:8px">ข้าพเจ้า <span class="ul">&nbsp;&nbsp;${data.fullName}&nbsp;&nbsp;</span> ตำแหน่ง <span class="ul">&nbsp;&nbsp;${data.position}&nbsp;&nbsp;</span></div>
<div style="margin-bottom:10px">สังกัดโรงเรียนวัดเขียนเขต สำนักงานเขตพื้นที่การศึกษาประถมศึกษาปทุมธานี เขต 2</div>
<div style="margin-bottom:8px;line-height:2.3">
  <span class="chk">${isSick?"✓":""}</span> ลาป่วย<br>
  <span class="chk">${isPersonal||isOther?"✓":""}</span> ลากิจส่วนตัว
  เนื่องจาก <span class="ul">&nbsp;&nbsp;${isPersonal||isOther?data.reason.replace(/\[.+?\]/g,"").trim():""}&nbsp;&nbsp;</span><br>
  ${isOther&&data.otherLeaveName?`<span style="margin-left:20px;font-size:12pt">(ประเภท: <strong>${data.otherLeaveName}</strong>)</span><br>`:""}
  <span class="chk">${isMat?"✓":""}</span> ลาคลอดบุตร
</div>
<div style="line-height:2.2;margin-bottom:8px">
  ตั้งแต่วันที่ <span class="ul">&nbsp;&nbsp;${thaiDate(data.startDate)}&nbsp;&nbsp;</span>
  ถึงวันที่ <span class="ul">&nbsp;&nbsp;${thaiDate(data.endDate)}&nbsp;&nbsp;</span>
  มีกำหนด <span class="ul">&nbsp;&nbsp;${daysDisplay}&nbsp;&nbsp;</span> วัน${halfDayText}
</div>
<div style="line-height:2.2;margin-bottom:8px">
  ข้าพเจ้า ได้ <span class="chk"></span> ลาป่วย <span class="chk"></span> ลากิจส่วนตัว <span class="chk"></span> ลาคลอดบุตร ครั้งสุดท้าย<br>
  ตั้งแต่วันที่ <span class="ul">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
  ถึงวันที่ <span class="ul">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
  มีกำหนด <span class="ul">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> วัน
</div>
<div style="margin-bottom:20px;line-height:2">
  ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ <span class="ul" style="min-width:300px">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
</div>
<div class="right" style="margin-bottom:6px">ขอแสดงความนับถือ</div>
<div style="text-align:right;margin-right:10%">
  ${signatureUrl?`<img src="${signatureUrl}" class="sigimg" alt="ลายเซ็น"/>`:`<div style="height:55px"></div>`}
  <div class="sigline"></div>
  <div style="text-align:center;font-size:13pt;margin-top:2px">(${data.fullName})</div>
</div>
<div style="margin-top:18px">
  <div style="font-weight:bold;text-decoration:underline;margin-bottom:6px">สถิติการลาในปีงบประมาณนี้</div>
  <table class="stat">
    <tr><th>ประเภทการลา</th><th>ลามาแล้ว</th><th>ลาครั้งนี้</th><th>รวมเป็น</th></tr>
    <tr><td>ลาป่วย</td><td></td><td>${isSick?daysDisplay:""}</td><td></td></tr>
    <tr><td>ลากิจส่วนตัว</td><td></td><td>${isPersonal||isOther?daysDisplay:""}</td><td></td></tr>
    <tr><td>ลาคลอดบุตร</td><td></td><td>${isMat?daysDisplay:""}</td><td></td></tr>
  </table>
</div>
<div style="display:flex;gap:20px;margin-top:16px">
  <div class="apv" style="flex:1">
    <div style="font-weight:bold;margin-bottom:8px">ความเห็นของรอง.ผอ.กลุ่มบริหารงานบุคคล</div>
    <div class="dotline"></div><div class="dotline"></div>
    <div style="text-align:center;margin-top:8px;font-size:12pt">
      ลงชื่อ................................<br>(นางลัดดา จำปาแดง)<br>ตำแหน่ง รองผู้อำนวยการกลุ่มบริหารงานบุคคล
    </div>
  </div>
  <div class="apv" style="flex:1">
    <div style="font-weight:bold;margin-bottom:6px">ความเห็นของผู้บังคับบัญชา</div>
    <div style="font-size:12pt">
      ลงชื่อ........................ผู้ตรวจสอบ<br>(นางสาวพรรษา แก้วใหญ่)<br>ตำแหน่ง ครู&nbsp;&nbsp;วันที่..............................<br><br>
      <strong>คำสั่ง</strong> &nbsp;<span class="chk"></span> อนุญาต &nbsp;&nbsp;<span class="chk"></span> ไม่อนุญาต<br>
      <div class="dotline"></div>
      ลงชื่อ<br>(นายธนณัฐ ศิระวงษ์)<br>ตำแหน่ง ผู้อำนวยการโรงเรียนวัดเขียนเขต<br>วันที่..............................
    </div>
  </div>
</div>
</body></html>`;

  useEffect(() => {
    const iframe = iframeRef.current; if (!iframe) return;
    const doc = iframe.contentDocument; if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => setReady(true), 600);
  }, [html]);

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-black/70 overflow-y-auto p-4" style={{zIndex:9998}}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-auto overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-black text-slate-800 text-base">📄 ตรวจสอบใบลาก่อนส่ง</h3>
            <p className="text-xs text-slate-400">กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-xl bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600 text-lg font-bold">✕</button>
        </div>
        <div className="p-4 bg-slate-100">
          {!ready && <div className="text-center py-8 text-slate-400 font-bold animate-pulse">⏳ กำลังสร้างใบลา...</div>}
          <iframe ref={iframeRef} title="ใบลา"
            style={{ width:"100%", height:680, border:"none", borderRadius:12, background:"white", display:ready?"block":"none", boxShadow:"0 2px 20px rgba(0,0,0,.15)" }} />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-slate-700 text-sm">✍️ ลายเซ็น</p>
              <p className="text-xs text-slate-400">{signatureUrl ? "ใช้ลายเซ็นที่บันทึกไว้" : "ยังไม่มีลายเซ็น — กรุณาเพิ่มลายเซ็น"}</p>
            </div>
            <button onClick={onUpdateSignature}
              className="px-4 py-2 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-600 text-sm font-bold hover:bg-blue-100 transition-all">
              {signatureUrl ? "✏️ เซ็นใหม่" : "✍️ เพิ่มลายเซ็น"}
            </button>
          </div>
          {signatureUrl && (
            <div className="border-2 border-slate-200 rounded-xl p-3 bg-slate-50 inline-block">
              <img src={signatureUrl} alt="ลายเซ็น" style={{height:50, maxWidth:180, objectFit:"contain"}}/>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50">
            ← แก้ไข
          </button>
          <button onClick={() => onConfirm(signatureUrl)}
            className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
            📤 ยืนยันส่งใบลา
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StepIndicator ────────────────────────────────────────────────────────────
function StepIndicator({ step, label, active, done }: { step:number; label:string; active:boolean; done:boolean }) {
  return (
    <div className={`flex items-center gap-2 ${active?"opacity-100":done?"opacity-70":"opacity-40"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${done?"bg-green-500 border-green-500 text-white":active?"bg-blue-500 border-blue-500 text-white":"bg-white border-slate-300 text-slate-500"}`}>
        {done?"✓":step}
      </div>
      <span className={`text-xs font-bold hidden sm:block ${active?"text-blue-600":done?"text-green-600":"text-slate-400"}`}>{label}</span>
    </div>
  );
}

// ─── DutyOfficerAlert ─────────────────────────────────────────────────────────
function DutyOfficerAlert({ officer, isOwnDuty }: { officer:DutyOfficer|null; isOwnDuty:boolean }) {
  if (!officer) return null;
  return (
    <div className={`rounded-xl border-2 px-4 py-3 flex items-start gap-3 ${isOwnDuty?"bg-red-50 border-red-300":"bg-amber-50 border-amber-300"}`}>
      <span className="text-xl mt-0.5">{isOwnDuty?"⚠️":"ℹ️"}</span>
      <div>
        <p className={`font-black text-sm ${isOwnDuty?"text-red-700":"text-amber-700"}`}>
          {isOwnDuty?"คุณมีเวรในวันที่ลา!":"หัวหน้าเวรวันนี้:"}
        </p>
        <p className="text-slate-600 text-sm font-bold">{officer.full_name} {officer.position?`· ${officer.position}`:""}</p>
        {isOwnDuty&&<p className="text-red-600 text-xs mt-1">กรุณาหาผู้มาเวรแทนและแจ้งในหมายเหตุ</p>}
      </div>
    </div>
  );
}

// ─── FileUploadButton ─────────────────────────────────────────────────────────
function FileUploadButton({ file, accept, label, hint, onChange, color="slate" }: {
  file:File|null; accept:string; label:string; hint:string;
  onChange:(f:File|null)=>void; color?:"slate"|"sky";
}) {
  const bc = color==="sky"?"border-sky-200 hover:border-sky-400 hover:bg-sky-50":"border-slate-300 hover:border-blue-400 hover:bg-blue-50";
  return (
    <label className={`flex items-center gap-3 cursor-pointer border-2 border-dashed ${bc} rounded-xl px-4 py-3 transition-colors`}>
      <span className="text-xl">📎</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-600 truncate">{file?file.name:label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
      {file&&<button type="button" onClick={e=>{e.preventDefault();onChange(null);}} className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-black flex items-center justify-center hover:bg-red-200 shrink-0">✕</button>}
      <input type="file" accept={accept} className="hidden" onChange={e=>onChange(e.target.files?.[0]??null)}/>
    </label>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── LeaveForm ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function LeaveForm({ user, approvers, allTeachers, savedSignature, onSubmit, onCancel }: {
  user:UserProfile; approvers:ApproverInfo[]; allTeachers:UserProfile[];
  savedSignature:string; onSubmit:(data:any)=>Promise<void>; onCancel:()=>void;
}) {
  const [leaveType,     setLeaveType]     = useState<LeaveType>("sick");
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [reason,        setReason]        = useState("");
  const [docFile,       setDocFile]       = useState<File|null>(null);
  const [tripDest,      setTripDest]      = useState("");
  const [vehicle,       setVehicle]       = useState<"school"|"personal">("school");
  const [companions,    setCompanions]    = useState("");
  const [officialDoc,   setOfficialDoc]   = useState<File|null>(null);
  const [missedPeriods, setMissedPeriods] = useState<string[]>([]);
  const [substitute,    setSubstitute]    = useState("");
  const [dutyOfficer,   setDutyOfficer]   = useState<DutyOfficer|null>(null);
  const [isOwnDuty,     setIsOwnDuty]     = useState(false);
  const [activeSection, setActiveSection] = useState(1);
  const [loading,       setLoading]       = useState(false);
  const [dutyLoading,   setDutyLoading]   = useState(false);
  const [halfDay,       setHalfDay]       = useState<"morning"|"afternoon"|null>(null);
  const [otherName,     setOtherName]     = useState("");
  const [showSigPad,    setShowSigPad]    = useState(false);
  const [showPreview,   setShowPreview]   = useState(false);
  const [sigUrl,        setSigUrl]        = useState(savedSignature ?? "");
  const [pendingPayload,setPendingPayload]= useState<any>(null);

  // นับวัน — ครึ่งวัน 2 ครั้ง = 1 วัน (นับเป็น 0.5 ต่อครั้ง)
  const rawDays  = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const days     = rawDays === 1 && halfDay ? 0.5 : rawDays;
  const personalWarning = leaveType==="personal"&&startDate
    ? (()=>{ const d=(new Date(startDate).getTime()-Date.now())/86400000; return d<3?"⚠️ ลากิจต้องยื่นก่อนวันลาอย่างน้อย 3 วัน":""; })() : "";

  useEffect(()=>{
    if(!startDate){setDutyOfficer(null);setIsOwnDuty(false);return;}
    const fetch = async()=>{
      setDutyLoading(true);
      try{
        const {data}=await supabase.from("duty_assignments")
          .select("morning_teachers,afternoon_teachers").eq("duty_date",startDate).maybeSingle();
        if(data){
          const all=[...((data as any).morning_teachers||[]),...((data as any).afternoon_teachers||[])];
          setIsOwnDuty(all.includes(user.id));
          if(all[0]){
            const {data:od}=await supabase.from("users")
              .select("id,first_name,last_name,full_name,position,email").eq("id",all[0]).maybeSingle();
            if(od) setDutyOfficer({...(od as any),full_name:(od as any).full_name||`${(od as any).first_name??""} ${(od as any).last_name??""}`.trim()});
            else setDutyOfficer(null);
          } else setDutyOfficer(null);
        } else { setDutyOfficer(null); setIsOwnDuty(false); }
      }catch{setDutyOfficer(null);}
      setDutyLoading(false);
    };
    fetch();
  },[startDate,user.id]);

  const PERIODS=["1","2","3","4","5","6","7","8"];
  const togglePeriod=(p:string)=>setMissedPeriods(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p]);

  async function handleSubmit(isDraft=false){
    if(!isDraft&&(!startDate||!endDate||!reason)){alert("กรุณากรอกข้อมูลให้ครบ");return;}
    if(!isDraft&&leaveType==="other"&&!otherName.trim()){alert("กรุณาระบุประเภทการลา");return;}
    const reasonFull = leaveType==="official"
      ? `[ปลายทาง: ${tripDest}] [พาหนะ: ${vehicle==="school"?"รถโรงเรียน":"รถส่วนตัว"}] [ผู้ร่วมเดินทาง: ${companions||"-"}] ${reason}`
      : reason;
    const payload={
      leave_type:leaveType, start_date:startDate, end_date:endDate,
      days_count:days, reason:reasonFull,
      other_leave_name:leaveType==="other"?otherName:null,
      half_day:rawDays===1?halfDay:null,
      document_url:null, status:isDraft?"draft":"pending",
      missed_periods:missedPeriods.join(","), substitute_id:substitute||null,
      duty_officer_id:dutyOfficer?.id??null,
      approver_1_id:approvers[0]?.id??null,
      approver_2_id:approvers[1]?.id??null,
      approver_3_id:approvers[2]?.id??null,
      approver_1_status:approvers[0]?"pending":null,
      approver_2_status:approvers[1]?"pending":null,
      approver_3_status:approvers[2]?"pending":null,
    };
    if(isDraft){setLoading(true);await onSubmit(payload);setLoading(false);return;}
    setPendingPayload(payload);
    setShowPreview(true);
  }

  async function confirmSubmit(finalSig:string){
    if(!pendingPayload)return;
    setLoading(true);setShowPreview(false);
    await onSubmit({...pendingPayload,signature_url:finalSig});
    setLoading(false);
  }

  const typeColor=COLORS[leaveType as keyof typeof COLORS]??COLORS.other;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Modals — z-index สูงกว่าทุกอย่าง */}
      {showSigPad&&(
        <SignaturePad initialUrl={sigUrl}
          onSave={async(dataUrl)=>{
            setSigUrl(dataUrl);setShowSigPad(false);
            await (supabase.from("users") as any).update({signature_url:dataUrl}).eq("id",user.id);
          }}
          onClose={()=>setShowSigPad(false)}/>
      )}
      {showPreview&&pendingPayload&&(
        <LeavePDFPreview
          data={{
            fullName:fullName(user), position:user.position??user.role,
            leaveType:pendingPayload.leave_type,
            leaveTypeName:LEAVE_TYPE_LIST.find(t=>t.key===pendingPayload.leave_type)?.label??"",
            otherLeaveName:pendingPayload.other_leave_name,
            startDate:pendingPayload.start_date, endDate:pendingPayload.end_date,
            days:pendingPayload.days_count, halfDay:pendingPayload.half_day,
            reason:pendingPayload.reason, signatureUrl:sigUrl,
            submittedDate:new Date().toISOString(),
          }}
          signatureUrl={sigUrl}
          onConfirm={confirmSubmit}
          onCancel={()=>setShowPreview(false)}
          onUpdateSignature={()=>{setShowPreview(false);setShowSigPad(true);}}
        />
      )}

      {/* Full-screen form */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onCancel} className="w-10 h-10 rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 text-lg shadow-sm">←</button>
          <div className="flex-1">
            <h2 className="text-2xl font-black text-slate-800">ยื่นคำขอลา / ไปราชการ</h2>
            <p className="text-slate-500 text-sm">{fullName(user)} · {user.position}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <StepIndicator step={1} label="พื้นฐาน" active={activeSection===1} done={activeSection>1}/>
            <div className="w-6 h-px bg-slate-300"/>
            {leaveType==="official"&&<><StepIndicator step={2} label="ราชการ" active={activeSection===2} done={activeSection>2}/><div className="w-6 h-px bg-slate-300"/></>}
            <StepIndicator step={leaveType==="official"?3:2} label="ภาระงาน"
              active={activeSection===(leaveType==="official"?3:2)} done={activeSection>(leaveType==="official"?3:2)}/>
          </div>
        </div>

        {/* Section 1 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
          <button className="w-full bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2 hover:bg-slate-100 transition-colors"
            onClick={()=>setActiveSection(activeSection===1?0:1)}>
            <span className={`w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center ${activeSection>=1?"bg-blue-500":"bg-slate-300"}`}>1</span>
            <span className="font-black text-slate-700 flex-1 text-left">ข้อมูลพื้นฐาน</span>
            <span className="text-slate-400">{activeSection===1?"▲":"▼"}</span>
          </button>
          {activeSection===1&&(
            <div className="p-6 space-y-5">
              {/* ประเภทการลา */}
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">ประเภทการลา <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LEAVE_TYPE_LIST.map(({key,label,icon})=>{
                    const c=COLORS[key as keyof typeof COLORS]??COLORS.other;
                    const active=leaveType===key;
                    return(
                      <button key={key} type="button" onClick={()=>{setLeaveType(key);setActiveSection(1);}}
                        className={`p-3.5 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-2.5 ${active?`${c.activeBg} ${c.border} ${c.text} ring-2 ${c.ring}`:"bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        <span className="text-xl">{icon}</span>
                        <span className="leading-tight text-sm">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {leaveType==="other"&&(
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">ระบุประเภทการลา <span className="text-red-500">*</span></label>
                  <input type="text" value={otherName} onChange={e=>setOtherName(e.target.value)}
                    placeholder="เช่น ลากิจฉุกเฉิน, ลาพักผ่อน..."
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-400 focus:outline-none focus:bg-white"/>
                </div>
              )}
              {/* วันที่ */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">วันที่เริ่มลา <span className="text-red-500">*</span></label>
                  <input type="date" value={startDate}
                    onChange={e=>{setStartDate(e.target.value);if(!endDate||e.target.value>endDate)setEndDate(e.target.value);}}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">วันที่สิ้นสุด <span className="text-red-500">*</span></label>
                  <input type="date" value={endDate} min={startDate}
                    onChange={e=>setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none"/>
                </div>
              </div>
              {/* ครึ่งวัน */}
              {rawDays===1&&(
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">ลาครึ่งวัน <span className="text-slate-400 font-normal">(2 ครั้ง = 1 วัน)</span></label>
                  <div className="flex gap-2">
                    {[{val:null,label:"🗓️ เต็มวัน (1 วัน)"},{val:"morning",label:"🌅 ครึ่งวันเช้า (0.5 วัน)"},{val:"afternoon",label:"🌇 ครึ่งวันบ่าย (0.5 วัน)"}].map(opt=>(
                      <button key={String(opt.val)} type="button" onClick={()=>setHalfDay(opt.val as any)}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${halfDay===opt.val?"bg-blue-50 border-blue-400 text-blue-700":"bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* จำนวนวัน */}
              {days>0&&(
                <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border-2 ${typeColor.bg} ${typeColor.border}`}>
                  <span className="text-3xl font-black text-slate-800">{days}</span>
                  <span className={`font-bold ${typeColor.text}`}>วัน{rawDays===1&&halfDay?" (ครึ่งวัน)":""}</span>
                  {personalWarning&&<span className="text-red-600 text-xs font-black bg-red-50 border border-red-200 px-2 py-1 rounded-lg ml-2">{personalWarning}</span>}
                </div>
              )}
              {dutyLoading&&startDate&&<div className="text-xs text-slate-400 font-bold animate-pulse">⏳ ตรวจสอบตารางเวร...</div>}
              {!dutyLoading&&<DutyOfficerAlert officer={dutyOfficer} isOwnDuty={isOwnDuty}/>}
              {/* เหตุผล */}
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">
                  {leaveType==="official"?"รายละเอียดการไปราชการ":"เหตุผลการลา"} <span className="text-red-500">*</span>
                </label>
                <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={4}
                  placeholder={leaveType==="official"?"ระบุวัตถุประสงค์...":"ระบุเหตุผล..."}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:border-blue-400 focus:outline-none focus:bg-white resize-none"/>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">แนบเอกสาร / รูปภาพ (ถ้ามี)</label>
                <FileUploadButton file={docFile} accept=".pdf,.jpg,.jpeg,.png"
                  label="คลิกเพื่อเลือกไฟล์" hint="PDF, JPG, PNG (ไม่เกิน 10MB)" onChange={setDocFile}/>
              </div>
              <div className="flex justify-end">
                <button onClick={()=>setActiveSection(leaveType==="official"?2:3)} disabled={!startDate||!endDate||!reason}
                  className="px-8 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-black text-sm disabled:opacity-40 transition-all">
                  ถัดไป →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Official */}
        {leaveType==="official"&&(
          <div className="bg-white rounded-2xl border border-sky-200 shadow-sm mb-4 overflow-hidden">
            <button className="w-full bg-sky-50 border-b border-sky-200 px-5 py-4 flex items-center gap-2 hover:bg-sky-100 transition-colors"
              onClick={()=>setActiveSection(activeSection===2?0:2)}>
              <span className={`w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center ${activeSection>=2?"bg-sky-500":"bg-slate-300"}`}>2</span>
              <span className="font-black text-sky-700 flex-1 text-left">ข้อมูลการไปราชการ</span>
              <span className="text-sky-400">{activeSection===2?"▲":"▼"}</span>
            </button>
            {activeSection===2&&(
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">สถานที่ / หน่วยงานที่ไป <span className="text-red-500">*</span></label>
                  <input type="text" value={tripDest} onChange={e=>setTripDest(e.target.value)} placeholder="เช่น กระทรวงศึกษาธิการ กรุงเทพฯ"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-bold focus:border-sky-400 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">ประเภทพาหนะ</label>
                  <div className="flex gap-3">
                    {[["school","🚌 รถโรงเรียน"],["personal","🚗 รถส่วนตัว"]].map(([v,l])=>(
                      <label key={v} className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 cursor-pointer font-bold text-sm transition-all ${vehicle===v?"bg-sky-100 border-sky-400 text-sky-700":"bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        <input type="radio" name="vehicle" value={v} checked={vehicle===v} onChange={()=>setVehicle(v as any)} className="accent-sky-500"/>{l}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">ผู้ร่วมเดินทาง (ถ้ามี)</label>
                  <input type="text" value={companions} onChange={e=>setCompanions(e.target.value)} placeholder="เช่น นายสมชาย ใจดี"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-bold focus:border-sky-400 focus:outline-none"/>
                </div>
                <FileUploadButton file={officialDoc} accept=".pdf,.jpg,.jpeg,.png" label="แนบไฟล์คำสั่งไปราชการ" hint="PDF หรือรูปภาพ" onChange={setOfficialDoc} color="sky"/>
                <div className="flex justify-between">
                  <button onClick={()=>setActiveSection(1)} className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50">← ย้อนกลับ</button>
                  <button onClick={()=>setActiveSection(3)} className="px-8 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-sm">ถัดไป →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 2/3: ภาระงาน */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
          <button className="w-full bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2 hover:bg-slate-100 transition-colors"
            onClick={()=>setActiveSection(activeSection===(leaveType==="official"?3:2)?0:(leaveType==="official"?3:2))}>
            <span className={`w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center ${activeSection>=(leaveType==="official"?3:2)?"bg-blue-500":"bg-slate-300"}`}>{leaveType==="official"?"3":"2"}</span>
            <span className="font-black text-slate-700 flex-1 text-left">ข้อมูลภาระงาน</span>
            <span className="text-slate-400">{activeSection===(leaveType==="official"?3:2)?"▲":"▼"}</span>
          </button>
          {activeSection===(leaveType==="official"?3:2)&&(
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">คาบสอนที่จะขาด <span className="text-slate-400 font-normal">(เลือกได้หลายคาบ)</span></label>
                <div className="flex flex-wrap gap-2">
                  {PERIODS.map(p=>(
                    <button key={p} type="button" onClick={()=>togglePeriod(p)}
                      className={`w-12 h-12 rounded-xl font-black text-sm border-2 transition-all ${missedPeriods.includes(p)?"bg-blue-500 border-blue-500 text-white shadow-md":"bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {p}
                    </button>
                  ))}
                </div>
                {missedPeriods.length>0&&(
                  <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-xs text-blue-600 font-black">เลือก: คาบ {missedPeriods.sort((a,b)=>+a-+b).join(", ")} · รวม {missedPeriods.length} คาบ</p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">ครูสอนแทน</label>
                <select value={substitute} onChange={e=>setSubstitute(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none appearance-none">
                  <option value="">— เลือกครูสอนแทน —</option>
                  {allTeachers.filter(t=>t.id!==user.id).map(t=>(
                    <option key={t.id} value={t.id}>{fullName(t)}{t.position?` · ${t.position}`:""}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between">
                <button onClick={()=>setActiveSection(leaveType==="official"?2:1)} className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50">← ย้อนกลับ</button>
              </div>
            </div>
          )}
        </div>

        {/* ลำดับการอนุมัติ */}
        {approvers.length>0&&(
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5">
            <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-3">ลำดับการอนุมัติ</p>
            <div className="flex items-center gap-2 flex-wrap">
              {approvers.slice(0,3).map((a,i)=>(
                <div key={a.id} className="flex items-center gap-1.5">
                  <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-xl px-3 py-2 shadow-sm">
                    <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-black flex items-center justify-center">{i+1}</span>
                    <span className="text-slate-700 font-bold text-sm">{a.full_name}</span>
                    {a.position&&<span className="text-slate-400 text-xs hidden sm:inline">({a.position})</span>}
                  </div>
                  {i<approvers.slice(0,3).length-1&&<span className="text-blue-300 font-bold">→</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notification summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">เมื่อส่งใบลา ระบบจะแจ้งเตือน</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-slate-600 font-bold"><span className="text-green-500">📧</span> ฝ่ายบุคคล ({HR_EMAIL})</div>
            {approvers.slice(0,3).map((a,i)=>(
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 font-bold"><span className="text-blue-500">📧</span> ผู้อนุมัติลำดับที่ {i+1}: {a.full_name}</div>
            ))}
            {isOwnDuty&&dutyOfficer&&<div className="flex items-center gap-2 text-sm text-red-600 font-bold"><span>⚠️</span> หัวหน้าเวร: {dutyOfficer.full_name}</div>}
          </div>
        </div>

        {/* ปุ่ม */}
        <div className="flex gap-3">
          <button onClick={()=>handleSubmit(true)} disabled={loading}
            className="flex-1 py-4 rounded-2xl border-2 border-slate-300 bg-white text-slate-700 font-black text-sm hover:bg-slate-50 disabled:opacity-50">
            💾 บันทึกร่าง
          </button>
          <button onClick={()=>handleSubmit(false)} disabled={loading||!startDate||!endDate||!reason}
            className="flex-[2] py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading?<><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>กำลังส่ง...</>:"📤 ส่งใบลา"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({status}:{status:LeaveStatus}){
  const cfg=LEAVE_STATUS_CONFIG[status];
  const cls:Record<LeaveStatus,string>={
    pending:"bg-amber-100 text-amber-700 border-amber-300",
    approved:"bg-green-100 text-green-700 border-green-300",
    rejected:"bg-red-100 text-red-700 border-red-300",
    cancelled:"bg-slate-100 text-slate-600 border-slate-300",
  };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border ${cls[status]}`}>{cfg.icon} {cfg.label}</span>;
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── TeacherDashboard ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function TeacherDashboard({ user, approvers, allTeachers, savedSignature }: {
  user:UserProfile; approvers:ApproverInfo[]; allTeachers:UserProfile[]; savedSignature:string;
}) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterFY, setFilterFY] = useState(0);
  useEffect(()=>{setFilterFY(getCurrentFiscalYear());},[]);
  const [filterEval, setFilterEval] = useState<"all"|"1"|"2">("all");
  const [filterType, setFilterType] = useState<LeaveType|"all">("all");
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async()=>{
    setLoading(true);
    const {data}=await supabase.from("leave_requests").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
    setRequests((data as LeaveRequest[])||[]);
    setLoading(false);
  },[user.id]);
  useEffect(()=>{loadRequests();},[loadRequests]);

  async function submitLeave(payload:any){
    const {data,error}=await (supabase.from("leave_requests") as any)
      .insert([{...payload,user_id:user.id}]).select().single();
    if(error){alert("❌ "+error.message);return;}
    if(data){
      const typeLabel=LEAVE_TYPE_LIST.find(t=>t.key===payload.leave_type)?.label??payload.leave_type;
      for(const ap of approvers.slice(0,3)){
        await createNotification(ap.id,`📋 ${fullName(user)} ยื่นใบขอ${typeLabel} ${payload.days_count} วัน รอการอนุมัติ`,data.id);
      }
    }
    alert("✅ ส่งคำขอลาสำเร็จ");
    setShowForm(false);
    await loadRequests();
  }

  const fyReqs=requests.filter(r=>isInFiscalYear(r.start_date,filterFY)&&r.status!=="rejected"&&r.status!=="cancelled");
  const usedByType=Object.fromEntries(
    (Object.keys(LEAVE_TYPE_CONFIG) as LeaveType[]).map(t=>[t,fyReqs.filter(r=>r.leave_type===t).reduce((s,r)=>s+Number(r.days_count),0)])
  ) as Record<LeaveType,number>;

  const filtered=requests.filter(r=>{
    const inFY=isInFiscalYear(r.start_date,filterFY);
    const inType=filterType==="all"||r.leave_type===filterType;
    const inEval=filterEval==="all"||getEvalRound(r.start_date)===filterEval;
    return inFY&&inType&&inEval;
  });

  // ── คำนวณสถิติเพื่อเตือน ──────────────────────────────────────────────────
  const evalRequests = filterEval === "all"
    ? fyReqs
    : fyReqs.filter(r => getEvalRound(r.start_date) === filterEval);
  const sickPersonalReqs = evalRequests.filter(r => r.leave_type === "sick" || r.leave_type === "personal");
  const sickPersonalTimes = sickPersonalReqs.length;
  const sickPersonalDays  = sickPersonalReqs.reduce((s,r)=>s+Number(r.days_count),0);
  const overTimes = sickPersonalTimes >= 6;
  const overDays  = sickPersonalDays >= 23;

  if(showForm){
    return(
      <LeaveForm user={user} approvers={approvers} allTeachers={allTeachers}
        savedSignature={savedSignature} onSubmit={submitLeave} onCancel={()=>setShowForm(false)}/>
    );
  }

  return(
    <div className="w-full space-y-5">
      {/* Greeting Card — ปุ่มยื่นใบลาอยู่ขวา */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200 flex items-center justify-between gap-4">
        <div>
          <p className="text-blue-100 text-sm font-bold mb-1">ยินดีต้อนรับ</p>
          <h2 className="text-2xl font-black">{fullName(user)}</h2>
          <p className="text-blue-200 text-sm mt-0.5">{user.position}</p>
        </div>
        {/* ✅ ปุ่มยื่นใบลาขวา ขนาดใหญ่ */}
        <button onClick={()=>setShowForm(true)}
          className="shrink-0 px-6 py-4 bg-white text-blue-700 rounded-2xl font-black text-base shadow-lg hover:bg-blue-50 transition-all active:scale-95 flex flex-col items-center gap-1 min-w-[120px]">
          <span className="text-2xl">✍️</span>
          <span>ยื่นใบลา</span>
          <span className="text-xs font-bold opacity-70">/ ไปราชการ</span>
        </button>
      </div>

      {/* ตัวกรอง */}
      <div className="flex gap-2 flex-wrap">
        <select value={filterFY} onChange={e=>setFilterFY(Number(e.target.value))}
          className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none focus:border-blue-400">
          {[0,1,2].map(i=>{const fy=getCurrentFiscalYear()-i;return<option key={fy} value={fy}>{fiscalYearLabel(fy)}</option>;})}
        </select>
        <select value={filterEval} onChange={e=>setFilterEval(e.target.value as any)}
          className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none focus:border-blue-400">
          <option value="all">ทุกรอบประเมิน</option>
          <option value="1">รอบ 1 (ต.ค. – มี.ค.)</option>
          <option value="2">รอบ 2 (เม.ย. – ก.ย.)</option>
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value as any)}
          className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none focus:border-blue-400">
          <option value="all">ทุกประเภท</option>
          {(Object.entries(LEAVE_TYPE_CONFIG) as any[]).map(([k,v])=>(
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
      </div>

      {/* การ์ดโควต้า */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {(Object.entries(LEAVE_TYPE_CONFIG) as [LeaveType,any][]).map(([type,cfg])=>{
          const used=usedByType[type]??0;
          const quota=cfg.quota;
          const remaining=quota!==null?quota-used:null;
          const pct=quota?Math.min((used/quota)*100,100):0;
          const c=COLORS[type as keyof typeof COLORS]??COLORS.other;
          return(
            <div key={type} className={`bg-white border-2 ${c.border} rounded-2xl p-3 shadow-sm flex-1 min-w-[140px]`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">{cfg.icon}</span>
                <span className={`text-xs font-black ${c.text} ${c.bg} px-2 py-0.5 rounded-lg border ${c.border}`}>{cfg.label}</span>
              </div>
              <div className="flex items-end gap-1 mt-2 mb-2">
                {remaining!==null?(<><span className="text-2xl font-black text-slate-800 leading-none">{remaining}</span><span className="text-slate-400 text-xs mb-0.5 font-bold">/ {quota} วัน</span></>):(<><span className="text-2xl font-black text-slate-800 leading-none">{used}</span><span className="text-slate-400 text-xs mb-0.5 font-bold">วัน</span></>)}
              </div>
              {quota&&<div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c.dot} transition-all`} style={{width:`${pct}%`}}/></div>}
            </div>
          );
        })}
      </div>

      {/* ⚠️ แจ้งเตือนเกิน 6 ครั้ง หรือ 23 วัน */}
      {(overTimes||overDays)&&(
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-black text-red-700 text-sm mb-1">แจ้งเตือน: การลาอาจส่งผลต่อการเลื่อนเงินเดือน</p>
              <p className="text-red-600 text-xs font-bold">
                ในรอบการประเมินนี้ คุณมีการลาป่วย + ลากิจส่วนตัว:
                <strong className={overTimes?"text-red-700":""}>  {sickPersonalTimes} ครั้ง {overTimes?"(เกิน 6 ครั้ง ⚠️)":""}</strong> /
                <strong className={overDays?"text-red-700":""}> {sickPersonalDays} วัน {overDays?"(เกิน 23 วัน ⚠️)":""}</strong>
              </p>
              <p className="text-red-500 text-xs mt-1">หากลาป่วย + ลากิจรวมกันเกิน 6 ครั้ง หรือ 23 วัน ใน 1 รอบการประเมิน จะส่งผลต่อการพิจารณาเลื่อนเงินเดือน</p>
            </div>
          </div>
        </div>
      )}
      {!overTimes&&!overDays&&sickPersonalTimes>3&&(
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">💡</span>
            <p className="text-amber-700 text-sm font-bold">
              คุณลาป่วย + ลากิจ {sickPersonalTimes} ครั้ง ({sickPersonalDays} วัน) ในรอบนี้ — หากเกิน 6 ครั้ง หรือ 23 วัน จะส่งผลต่อการเลื่อนเงินเดือน
            </p>
          </div>
        </div>
      )}

      {/* ประวัติ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
          <h3 className="font-black text-slate-700 text-sm">📋 ประวัติการลา</h3>
        </div>
        {loading?<div className="text-center py-10 text-slate-400 text-sm">กำลังโหลด...</div>
          :filtered.length===0?<div className="text-center py-10 text-slate-400 text-sm">ยังไม่มีรายการ</div>
          :(
            <div className="divide-y divide-slate-100">
              {filtered.map(r=>{
                const typeCfg=LEAVE_TYPE_CONFIG[r.leave_type];
                const c=COLORS[r.leave_type as keyof typeof COLORS]??COLORS.other;
                return(
                  <div key={r.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${c.bg} ${c.border} ${c.text}`}>{typeCfg?.icon} {typeCfg?.label}</span>
                          <span className="text-slate-400 text-xs">{r.days_count} วัน{(r as any).half_day?" ("+((r as any).half_day==="morning"?"เช้า":"บ่าย")+")":""}</span>
                        </div>
                        <span className="text-slate-700 font-bold text-sm">{toThaiDate(r.start_date)}{r.start_date!==r.end_date&&` – ${toThaiDate(r.end_date)}`}</span>
                        <span className="text-slate-400 text-xs line-clamp-1">{r.reason}</span>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <StatusBadge status={r.status}/>
                        <div className="flex gap-1">
                          {[r.approver_1_status,r.approver_2_status,r.approver_3_status].filter(Boolean).map((s,i)=>(
                            <span key={i} className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center border ${s==="approved"?"bg-green-100 border-green-300 text-green-700":s==="rejected"?"bg-red-100 border-red-300 text-red-700":"bg-amber-100 border-amber-300 text-amber-700"}`}>{i+1}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── AdminDashboard ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({user}:{user:UserProfile}){
  const [requests,     setRequests]     = useState<LeaveRequest[]>([]);
  const [filterFY,     setFilterFY]     = useState(0);
  useEffect(()=>{setFilterFY(getCurrentFiscalYear());},[]);
  const [filterEval,   setFilterEval]   = useState<"all"|"1"|"2">("all");
  const [filterType,   setFilterType]   = useState<LeaveType|"all">("all");
  const [filterStatus, setFilterStatus] = useState<LeaveStatus|"all">("pending");
  const [filterGrade,  setFilterGrade]  = useState("all");
  const [tab,          setTab]          = useState<"pending"|"history"|"official"|"graph">("pending");
  const [loading,      setLoading]      = useState(true);

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const {data}=await supabase.from("leave_requests")
      .select("*, user:users(first_name,last_name,full_name,position,email,grade_level)")
      .order("created_at",{ascending:false});
    setRequests((data as LeaveRequest[])||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{loadAll();},[loadAll]);

  async function handleApprove(id:string,slot:1|2|3,action:"approved"|"rejected"){
    const req=requests.find(r=>r.id===id)!;
    const updates:any={[`approver_${slot}_status`]:action};
    const slots=[slot===1?action:req.approver_1_status,slot===2?action:req.approver_2_status,slot===3?action:req.approver_3_status];
    const filled=slots.filter((s,i)=>[req.approver_1_id,req.approver_2_id,req.approver_3_id][i]);
    if(action==="rejected")updates.status="rejected";
    else if(filled.every(s=>s==="approved"))updates.status="approved";
    const {error}=await (supabase.from("leave_requests") as any).update(updates).eq("id",id);
    if(error){alert("❌ "+error.message);return;}
    await createNotification(req.user_id,`ใบลาของคุณ${action==="approved"?"อนุมัติแล้ว ✅":"ไม่อนุมัติ ❌"} โดย ${fullName(user)}`,id);
    await loadAll();
  }

  const fyAll=requests.filter(r=>isInFiscalYear(r.start_date,filterFY)&&r.status!=="cancelled");
  const summaryByType=Object.fromEntries(
    (Object.keys(LEAVE_TYPE_CONFIG) as LeaveType[]).map(t=>[t,{
      approved:fyAll.filter(r=>r.leave_type===t&&r.status==="approved").reduce((s,r)=>s+Number(r.days_count),0),
      pending:fyAll.filter(r=>r.leave_type===t&&r.status==="pending").length,
    }])
  ) as Record<LeaveType,{approved:number;pending:number}>;

  const pendingList=requests.filter(r=>r.status==="pending");
  const officialList=requests.filter(r=>r.leave_type==="official"&&isInFiscalYear(r.start_date,filterFY)&&(filterEval==="all"||getEvalRound(r.start_date)===filterEval));
  const historyList=requests.filter(r=>{
    const inFY=isInFiscalYear(r.start_date,filterFY);
    const inType=filterType==="all"||r.leave_type===filterType;
    const inStat=filterStatus==="all"||r.status===filterStatus;
    const inEval=filterEval==="all"||getEvalRound(r.start_date)===filterEval;
    const inGrade=filterGrade==="all"||(r as any).user?.grade_level===filterGrade;
    return inFY&&inType&&inStat&&inEval&&inGrade;
  });

  function mySlot(r:LeaveRequest):1|2|3|null{
    if(r.approver_1_id===user.id)return 1;
    if(r.approver_2_id===user.id)return 2;
    if(r.approver_3_id===user.id)return 3;
    return null;
  }

  // ── Graph data ─────────────────────────────────────────────────────────────
  const TH_MONTHS_SHORT=["ต.ค.","พ.ย.","ธ.ค.","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย."];

  // สายชั้นที่มีในข้อมูล
  const allGrades=["all",...Array.from(new Set(requests.map(r=>(r as any).user?.grade_level).filter(Boolean)))];

  const graphData=TH_MONTHS_SHORT.map((month,i)=>{
    const calMonth=i<3?i+10:i-2;
    const calYear=i<3?filterFY-1:filterFY;
    const monthReqs=requests.filter(r=>{
      const d=new Date(r.start_date);
      const inDate=d.getFullYear()===calYear&&(d.getMonth()+1)===calMonth&&r.status!=="cancelled";
      const inGrade=filterGrade==="all"||(r as any).user?.grade_level===filterGrade;
      return inDate&&inGrade;
    });
    return{
      month,
      "ลาป่วย":   monthReqs.filter(r=>r.leave_type==="sick").reduce((s,r)=>s+Number(r.days_count),0),
      "ลากิจ":    monthReqs.filter(r=>r.leave_type==="personal").reduce((s,r)=>s+Number(r.days_count),0),
      "ไปราชการ": monthReqs.filter(r=>r.leave_type==="official").reduce((s,r)=>s+Number(r.days_count),0),
      "อื่นๆ":    monthReqs.filter(r=>!["sick","personal","official"].includes(r.leave_type)).reduce((s,r)=>s+Number(r.days_count),0),
    };
  });

  const TABS=[{key:"pending",label:"รออนุมัติ",icon:"⏳"},{key:"history",label:"ทั้งหมด",icon:"📋"},{key:"official",label:"ไปราชการ",icon:"🏛️"},{key:"graph",label:"กราฟ",icon:"📊"}] as const;

  return(
    <div className="w-full max-w-3xl mx-auto space-y-5">
      {/* Greeting */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-indigo-200 text-sm font-bold">แดชบอร์ดผู้บริหาร</p>
          <h2 className="text-2xl font-black">{fullName(user)}</h2>
          <p className="text-indigo-200 text-sm">{user.position}</p>
        </div>
        <select value={filterFY} onChange={e=>setFilterFY(Number(e.target.value))}
          className="bg-white/20 border border-white/30 rounded-xl px-4 py-2 text-white text-sm font-bold focus:outline-none backdrop-blur-sm">
          {[0,1,2].map(i=>{const fy=getCurrentFiscalYear()-i;return<option key={fy} value={fy} className="text-slate-800">{fiscalYearLabel(fy)}</option>;})}
        </select>
      </div>

      {/* รอบประเมิน */}
      <div className="flex gap-2 flex-wrap">
        {(["all","1","2"] as const).map(v=>(
          <button key={v} onClick={()=>setFilterEval(v)}
            className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${filterEval===v?"bg-indigo-500 border-indigo-500 text-white":"bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {v==="all"?"ทุกรอบ":v==="1"?"รอบ 1 (ต.ค.–มี.ค.)":"รอบ 2 (เม.ย.–ก.ย.)"}
          </button>
        ))}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {(Object.entries(LEAVE_TYPE_CONFIG) as [LeaveType,any][]).map(([type,cfg])=>{
          const stats=summaryByType[type];
          const c=COLORS[type as keyof typeof COLORS]??COLORS.other;
          return(
            <div key={type} className={`bg-white border-2 ${c.border} rounded-2xl p-3 text-center shadow-sm`}>
              <div className="text-2xl mb-1">{cfg.icon}</div>
              <div className={`text-2xl font-black ${c.text}`}>{stats.approved}</div>
              <div className="text-slate-500 text-[10px] font-bold mt-0.5 leading-tight">{cfg.label}</div>
              {stats.pending>0&&<div className="mt-1 text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-300 rounded-lg px-1 py-0.5">รอ {stats.pending}</div>}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        {TABS.map(({key,label,icon})=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${tab===key?"bg-white text-slate-800 shadow border border-slate-200":"text-slate-500 hover:text-slate-700"}`}>
            {icon} {label}
            {key==="pending"&&pendingList.length>0&&<span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{pendingList.length}</span>}
          </button>
        ))}
      </div>

      {/* Tab: รออนุมัติ */}
      {tab==="pending"&&(
        <div className="space-y-3">
          {loading?<div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
            :pendingList.length===0?<div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">✅ ไม่มีรายการรออนุมัติ</div>
            :pendingList.map(r=>{
              const typeCfg=LEAVE_TYPE_CONFIG[r.leave_type];
              const c=COLORS[r.leave_type as keyof typeof COLORS]??COLORS.other;
              const slot=mySlot(r);
              const myStatus=slot===1?r.approver_1_status:slot===2?r.approver_2_status:slot===3?r.approver_3_status:null;
              return(
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`${c.bg} border-b ${c.border} px-5 py-3 flex items-center justify-between`}>
                    <span className={`font-black text-sm ${c.text}`}>{typeCfg?.icon} {typeCfg?.label}</span>
                    <span className={`font-black text-sm ${c.text}`}>{r.days_count} วัน</span>
                  </div>
                  <div className="p-5">
                    <p className="font-black text-slate-800 text-base">{fullName(r.user as any)}</p>
                    <p className="text-slate-500 text-sm">{(r.user as any)?.position}</p>
                    <p className="text-slate-600 text-sm font-bold mt-2">{toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</p>
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">{r.reason}</p>
                    {(r as any).missed_periods&&<p className="text-xs text-blue-600 font-bold mt-1">📚 คาบที่ขาด: {(r as any).missed_periods}</p>}
                    <div className="flex gap-2 mt-3">
                      {[r.approver_1_status,r.approver_2_status,r.approver_3_status].map((s,i)=>{
                        if(![r.approver_1_id,r.approver_2_id,r.approver_3_id][i])return null;
                        return<span key={i} className={`w-7 h-7 rounded-full border-2 text-xs font-black flex items-center justify-center ${s==="approved"?"bg-green-100 border-green-300 text-green-700":s==="rejected"?"bg-red-100 border-red-300 text-red-700":"bg-amber-100 border-amber-300 text-amber-700"}`}>{i+1}</span>;
                      })}
                    </div>
                    {slot&&myStatus==="pending"&&(
                      <div className="flex gap-2 mt-4">
                        <button onClick={()=>handleApprove(r.id,slot,"approved")} className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-black text-sm">✅ อนุมัติ</button>
                        <button onClick={()=>handleApprove(r.id,slot,"rejected")} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm">❌ ไม่อนุมัติ</button>
                      </div>
                    )}
                    {slot&&myStatus!=="pending"&&<div className={`mt-3 text-center text-sm font-black py-2 rounded-xl ${myStatus==="approved"?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>{myStatus==="approved"?"✅ คุณอนุมัติแล้ว":"❌ คุณไม่อนุมัติ"}</div>}
                    {!slot&&<p className="mt-3 text-xs text-slate-400 text-center">คุณไม่ใช่ผู้อนุมัติในรายการนี้</p>}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Tab: ทั้งหมด */}
      {tab==="history"&&(
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <select value={filterGrade} onChange={e=>setFilterGrade(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
              {allGrades.map(g=><option key={g} value={g}>{g==="all"?"ทุกสายชั้น":g}</option>)}
            </select>
            <select value={filterType} onChange={e=>setFilterType(e.target.value as any)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
              <option value="all">ทุกประเภท</option>
              {(Object.entries(LEAVE_TYPE_CONFIG) as any[]).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
              <option value="all">ทุกสถานะ</option>
              {(Object.entries(LEAVE_STATUS_CONFIG) as any[]).map(([k,v])=><option key={k} value={k}>{(v as any).icon} {(v as any).label}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading?<div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
              :historyList.length===0?<div className="text-center py-10 text-slate-400">ไม่พบข้อมูล</div>
              :<div className="divide-y divide-slate-100">
                {historyList.map(r=>{
                  const typeCfg=LEAVE_TYPE_CONFIG[r.leave_type];
                  const c=COLORS[r.leave_type as keyof typeof COLORS]??COLORS.other;
                  return(
                    <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="font-black text-slate-800 text-sm">{fullName(r.user as any)}</p>
                        <p className="text-slate-500 text-xs">{(r.user as any)?.position} {(r.user as any)?.grade_level?`· ${(r.user as any).grade_level}`:""}</p>
                        <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-lg border ${c.bg} ${c.border} ${c.text}`}>{typeCfg?.icon} {typeCfg?.label} · {r.days_count} วัน</span>
                        <p className="text-slate-400 text-xs mt-1">{toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</p>
                      </div>
                      <StatusBadge status={r.status}/>
                    </div>
                  );
                })}
              </div>}
          </div>
        </div>
      )}

      {/* Tab: ไปราชการ */}
      {tab==="official"&&(
        <div className="space-y-3">
          {loading?<div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
            :officialList.length===0?<div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">ไม่มีข้อมูล</div>
            :officialList.map(r=>{
              const destMatch=r.reason?.match(/\[ปลายทาง: (.+?)\]/);
              const vehicleMatch=r.reason?.match(/\[พาหนะ: (.+?)\]/);
              const compMatch=r.reason?.match(/\[ผู้ร่วมเดินทาง: (.+?)\]/);
              return(
                <div key={r.id} className="bg-white rounded-2xl border border-sky-200 shadow-sm overflow-hidden">
                  <div className="bg-sky-50 border-b border-sky-200 px-5 py-3 flex items-center justify-between">
                    <div><p className="font-black text-slate-800">{fullName(r.user as any)}</p><p className="text-slate-500 text-xs">{(r.user as any)?.position}</p></div>
                    <StatusBadge status={r.status}/>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-400 font-bold">วันที่:</span> <span className="text-slate-700 font-black">{toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</span></div>
                    <div><span className="text-slate-400 font-bold">จำนวน:</span> <span className="text-sky-600 font-black">{r.days_count} วัน</span></div>
                    <div><span className="text-slate-400 font-bold">ปลายทาง:</span> <span className="text-slate-700 font-bold">{destMatch?.[1]??"-"}</span></div>
                    <div><span className="text-slate-400 font-bold">พาหนะ:</span> <span className="text-slate-700 font-bold">{vehicleMatch?.[1]??"-"}</span></div>
                    <div className="col-span-2"><span className="text-slate-400 font-bold">ผู้ร่วมเดินทาง:</span> <span className="text-slate-700 font-bold">{compMatch?.[1]??"-"}</span></div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Tab: กราฟ */}
      {tab==="graph"&&(
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h4 className="font-black text-slate-700 text-sm">📊 สถิติการลารายเดือน {fiscalYearLabel(filterFY)}</h4>
            <select value={filterGrade} onChange={e=>setFilterGrade(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
              {allGrades.map(g=><option key={g} value={g}>{g==="all"?"📊 ภาพรวมทั้งโรงเรียน":"สายชั้น: "+g}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={graphData} margin={{top:5,right:10,left:0,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="month" tick={{fontSize:11,fontFamily:"Sarabun"}}/>
              <YAxis tick={{fontSize:11}} label={{value:"วัน",angle:-90,position:"insideLeft",fontSize:11}}/>
              <Tooltip contentStyle={{fontFamily:"Sarabun",fontSize:13,borderRadius:12,border:"1.5px solid #e2e8f0"}} formatter={(v:any,n:any)=>[`${v??0} วัน`,n]}/>
              <Legend wrapperStyle={{fontSize:12,fontFamily:"Sarabun"}}/>
              <Bar dataKey="ลาป่วย"   fill="#ef4444" radius={[4,4,0,0]}/>
              <Bar dataKey="ลากิจ"    fill="#f59e0b" radius={[4,4,0,0]}/>
              <Bar dataKey="ไปราชการ" fill="#3b82f6" radius={[4,4,0,0]}/>
              <Bar dataKey="อื่นๆ"    fill="#8b5cf6" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {label:"ลาป่วยรวม",  val:graphData.reduce((s,d)=>s+d["ลาป่วย"],0),   color:"text-red-600",  bg:"bg-red-50",  border:"border-red-200"},
              {label:"ลากิจรวม",   val:graphData.reduce((s,d)=>s+d["ลากิจ"],0),    color:"text-amber-600",bg:"bg-amber-50",border:"border-amber-200"},
              {label:"ไปราชการรวม",val:graphData.reduce((s,d)=>s+d["ไปราชการ"],0), color:"text-blue-600", bg:"bg-blue-50", border:"border-blue-200"},
              {label:"รวมทั้งหมด", val:graphData.reduce((s,d)=>s+d["ลาป่วย"]+d["ลากิจ"]+d["ไปราชการ"]+d["อื่นๆ"],0),color:"text-slate-700",bg:"bg-slate-50",border:"border-slate-200"},
            ].map(stat=>(
              <div key={stat.label} className={`${stat.bg} border-2 ${stat.border} rounded-xl p-3 text-center`}>
                <div className={`text-2xl font-black ${stat.color}`}>{stat.val}</div>
                <div className="text-xs text-slate-500 font-bold mt-0.5">{stat.label} (วัน)</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function LeavePage(){
  const router=useRouter();
  const [user,           setUser]           = useState<UserProfile|null>(null);
  const [approvers,      setApprovers]      = useState<ApproverInfo[]>([]);
  const [allTeachers,    setAllTeachers]    = useState<UserProfile[]>([]);
  const [savedSignature, setSavedSignature] = useState("");
  const [loading,        setLoading]        = useState(true);

  useEffect(()=>{
    const init=async()=>{
      const {data:{user:authUser}}=await supabase.auth.getUser();
      if(!authUser){setLoading(false);return;}
      const meta=authUser.user_metadata??{};
      const claims=meta.custom_claims??{};
      const email=authUser.email||meta.email||meta.preferred_username||meta.upn||claims.email||claims.preferred_username||claims.upn||claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]||"";
      let data:any=null;
      const {data:d1}=await supabase.from("users").select("id,first_name,last_name,email,role,position,signature_url,grade_level").eq("auth_id",authUser.id).maybeSingle();
      if(d1){data=d1;}else if(email){
        const {data:d2}=await supabase.from("users").select("id,first_name,last_name,email,role,position,signature_url,grade_level").eq("email",email).maybeSingle();
        data=d2;
        if(data)await (supabase.from("users") as any).update({auth_id:authUser.id}).eq("id",(data as any).id);
      }
      if(data){
        const profile:UserProfile={...(data as any),full_name:(data as any).full_name||`${(data as any).first_name??""} ${(data as any).last_name??""}`.trim()};
        setUser(profile);
        if((data as any).signature_url)setSavedSignature((data as any).signature_url);

        const teacherRoles=["homeroom_teacher","subject_teacher","staff","teacher"];

        // ── โหลด approvers ตาม email ที่กำหนด ─────────────────────────────
        const apvEmails=["phansa@khienkhet.ac.th","titima@khienkhet.ac.th"];
        const {data:apvByEmail}=await supabase.from("users")
          .select("id,first_name,last_name,full_name,position,email").in("email",apvEmails);
        const {data:director}=await supabase.from("users")
          .select("id,first_name,last_name,full_name,position,email").eq("role","director").maybeSingle();

        const apvList:ApproverInfo[]=[
          ...(apvByEmail||[]).map((a:any)=>({...a,full_name:a.full_name||`${a.first_name??""} ${a.last_name??""}`.trim()})),
          ...(director?[{...director as any,full_name:(director as any).full_name||`${(director as any).first_name??""} ${(director as any).last_name??""}`.trim()}]:[]),
        ];
        setApprovers(apvList.slice(0,3));

        if(teacherRoles.includes((data as any).role)){
          const {data:teachRes}=await supabase.from("users").select("id,first_name,last_name,full_name,position,role,email").in("role",teacherRoles);
          setAllTeachers((teachRes as UserProfile[])||[]);
        }
      }
      setLoading(false);
    };
    init();
  },[]);

  if(loading)return<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดระบบ...</div></div>;
  if(!user)return<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-red-500 font-black text-lg">❌ กรุณาเข้าสู่ระบบก่อน</div></div>;

  const isTeacher=["homeroom_teacher","subject_teacher","staff","teacher"].includes(user.role);
  const roleLabel=user.role==="director"?"👔 ผู้อำนวยการ":user.role==="deputy_director"?"👔 รองผู้อำนวยการ":user.role==="admin"?"🔧 ผู้ดูแลระบบ":"👩‍🏫 ครู";

  return(
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={()=>router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors font-bold text-lg" title="กลับหน้าหลัก">🏠</button>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-none">ระบบลา / ไปราชการ</h1>
              <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต</p>
            </div>
          </div>
          <span className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 ${isTeacher?"bg-blue-50 text-blue-600 border-blue-200":"bg-indigo-50 text-indigo-600 border-indigo-200"}`}>{roleLabel}</span>
        </div>
      </div>
      <div className="px-4 py-6" suppressHydrationWarning>
        {isTeacher?(
          <TeacherDashboard user={user} approvers={approvers.slice(0,3)} allTeachers={allTeachers} savedSignature={savedSignature}/>
        ):(
          <AdminDashboard user={user}/>
        )}
      </div>
    </div>
  );
}