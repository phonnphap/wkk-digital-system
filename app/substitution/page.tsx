"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO, addDays } from "date-fns";
import { th } from "date-fns/locale";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "academic_head"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface User {
  id: string; first_name: string; last_name: string;
  title?: string; role: string; position?: string; academic_level?: string;
}
interface TimeSlot {
  id: string; slot_number: number; start_time: string; end_time: string;
  slot_label: string; is_break: boolean;
}
interface Classroom {
  id: string; room_name: string; room_number: number;
}
interface Subject {
  id: string; name: string; code?: string;
}
interface TimetableEntry {
  id: string; classroom_id: string; subject_id: string; teacher_id: string;
  day_of_week: number; time_slot_id: string; academic_year_id: string;
  classroom?: Classroom; subject?: Subject; teacher?: User; time_slot?: TimeSlot;
}
interface SwapRequest {
  id: string; requester_id: string; target_teacher_id: string;
  requester_entry_id: string; target_entry_id: string;
  swap_date: string; reason?: string; status: string;
  responded_at?: string; created_at: string;
  requester?: User; target_teacher?: User;
  requester_entry?: TimetableEntry; target_entry?: TimetableEntry;
}
interface SubRecord {
  id: string; leave_request_id?: string; absent_teacher_id: string;
  substitute_teacher_id?: string; timetable_entry_id?: string;
  substitute_date: string; time_slot_id?: string; classroom_id?: string;
  subject_id?: string; hours_count: number; assigned_by?: string;
  status: string; note?: string; academic_year_id?: string; created_at: string;
  absent_teacher?: User; substitute_teacher?: User;
  timetable_entry?: TimetableEntry; time_slot?: TimeSlot;
  classroom?: Classroom; subject?: Subject; assigner?: User;
}
interface LeaveRequest {
  id: string; user_id: string; leave_type: string; start_date: string;
  end_date: string; days_count: number; reason?: string; status: string;
  user?: User;
}
interface AcademicYear { id: string; year_name: string; is_current: boolean; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const TH_DAYS = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function fullName(u?: User|null) {
  if (!u) return "—";
  return `${u.title??""} ${u.first_name} ${u.last_name}`.trim();
}
function thaiDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s+"T00:00:00");
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
}
function thaiTime(t?: string) { return t ? t.slice(0,5)+" น." : "—"; }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const STATUS_SWAP: Record<string,{label:string;cls:string}> = {
  pending:  { label:"รออนุมัติ",  cls:"bg-amber-50 text-amber-700 border-amber-300" },
  accepted: { label:"ตกลงแล้ว",  cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  rejected: { label:"ปฏิเสธ",    cls:"bg-red-50 text-red-700 border-red-300" },
  cancelled:{ label:"ยกเลิก",    cls:"bg-slate-100 text-slate-500 border-slate-300" },
};
const STATUS_SUB: Record<string,{label:string;cls:string}> = {
  assigned:  { label:"จัดแล้ว",  cls:"bg-blue-50 text-blue-700 border-blue-300" },
  confirmed: { label:"ยืนยัน",   cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  done:      { label:"เสร็จสิ้น",cls:"bg-slate-100 text-slate-600 border-slate-300" },
};

// ── Print helpers ─────────────────────────────────────────────────────────────
function printSubOrder(records: SubRecord[], periodLabel: string) {
  const rows = records.map((r,i) => `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${thaiDate(r.substitute_date)}</td>
      <td>${r.time_slot ? r.time_slot.slot_label : "—"}</td>
      <td>${r.classroom?.room_name ?? "—"}</td>
      <td>${r.subject?.name ?? r.timetable_entry?.subject?.name ?? "—"}</td>
      <td>${fullName(r.absent_teacher)}</td>
      <td>${fullName(r.substitute_teacher)}</td>
      <td style="text-align:center">${r.hours_count}</td>
      <td>${r.note ?? ""}</td>
    </tr>`).join("");

  const w = window.open("","_blank","width=1050,height=780");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { font-family: 'Sarabun','TH SarabunNew',sans-serif; font-size: 14pt; color: #111; }
    h2 { text-align:center; font-size:16pt; margin-bottom:2px; }
    h3 { text-align:center; font-size:14pt; margin-top:2px; margin-bottom:14px; }
    table { width:100%; border-collapse:collapse; font-size:12pt; }
    th { background:#1e3a8a; color:#fff; padding:6px 8px; font-size:11pt; text-align:left; }
    td { padding:5px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    tr:nth-child(even) td { background:#f8faff; }
    .sign-row { display:flex; justify-content:space-between; margin-top:40px; }
    .sign-box { text-align:center; flex:1; }
    .sign-line { margin:48px auto 6px; width:180px; }
    @media print { button { display:none; } }
  </style></head>
  <body>
    <h2>โรงเรียนวัดเขียนเขต</h2>
    <h3>ใบคำสั่งสอนแทน — ${periodLabel}</h3>
    <table>
      <thead><tr>
        <th style="width:32px">ที่</th>
        <th>วันที่</th><th>คาบ</th><th>ห้อง</th><th>วิชา</th>
        <th>ครูเจ้าของคาบ</th><th>ครูสอนแทน</th>
        <th style="width:50px;text-align:center">ชม.</th><th>หมายเหตุ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign-row">
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>ผู้รับคำสั่ง</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>(นางสาวฐิติมา กาบแก้ว)</div>
        <div>รองผู้อำนวยการกลุ่มบริหารวิชาการ</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>(นายธนณัฐ ศิระวงษ์)</div>
        <div>ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
      </div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}

function printTeacherSubStat(records: SubRecord[], users: User[]) {
  const map: Record<string,{name:string;hours:number;count:number}> = {};
  for (const r of records) {
    if (!r.substitute_teacher_id) continue;
    if (!map[r.substitute_teacher_id]) {
      map[r.substitute_teacher_id] = { name: fullName(r.substitute_teacher), hours:0, count:0 };
    }
    map[r.substitute_teacher_id].hours += Number(r.hours_count);
    map[r.substitute_teacher_id].count += 1;
  }
  const rows = Object.values(map).sort((a,b)=>b.hours-a.hours).map((t,i)=>`
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${t.name}</td>
      <td style="text-align:center">${t.count}</td>
      <td style="text-align:center">${t.hours}</td>
    </tr>`).join("");

  const w = window.open("","_blank","width=800,height=640");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { font-family:'Sarabun','TH SarabunNew',sans-serif; font-size:14pt; }
    h2,h3 { text-align:center; }
    table { width:100%; border-collapse:collapse; font-size:12pt; margin-top:16px; }
    th { background:#1e3a8a; color:#fff; padding:6px 8px; }
    td { padding:5px 8px; border-bottom:1px solid #e2e8f0; }
    tr:nth-child(even)td { background:#f8faff; }
    @media print { button{display:none} }
  </style></head>
  <body>
    <h2>โรงเรียนวัดเขียนเขต</h2>
    <h3>สถิติการสอนแทน (เพื่อคิดขั้นเงินเดือน)</h3>
    <table><thead><tr>
      <th style="width:40px">ที่</th><th>ชื่อ-นามสกุล</th>
      <th>จำนวนครั้ง</th><th>รวมชั่วโมง</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}

// ── SwapRequestModal ──────────────────────────────────────────────────────────
function SwapRequestModal({ user, teachers, myEntries, allEntries, academicYearId, onSave, onClose }: {
  user: User; teachers: User[]; myEntries: TimetableEntry[];
  allEntries: TimetableEntry[]; academicYearId: string;
  onSave: () => void; onClose: () => void;
}) {
  const [targetTeacherId, setTargetTeacherId] = useState("");
  const [myEntryId, setMyEntryId] = useState("");
  const [targetEntryId, setTargetEntryId] = useState("");
  const [swapDate, setSwapDate] = useState(ymd(new Date()));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string,boolean>>({});

  const targetEntries = useMemo(() =>
    allEntries.filter(e => e.teacher_id === targetTeacherId)
  ,[allEntries, targetTeacherId]);

  const validate = () => {
    const e: Record<string,boolean> = {};
    if (!myEntryId) e.myEntryId = true;
    if (!targetTeacherId) e.targetTeacherId = true;
    if (!targetEntryId) e.targetEntryId = true;
    if (!swapDate) e.swapDate = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const { error } = await supabase.from("class_swap_requests").insert([{
      requester_id: user.id, target_teacher_id: targetTeacherId,
      requester_entry_id: myEntryId, target_entry_id: targetEntryId,
      swap_date: swapDate, reason, status: "pending", academic_year_id: academicYearId,
    }]);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    onSave();
  };

  const iCls = (err?: boolean) =>
    `w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors bg-white
    ${err ? "border-red-400 bg-red-50" : "border-blue-200 focus:border-blue-500 text-slate-800"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">🔄 ขอแลกคาบสอน</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* คาบของฉัน */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              คาบของฉันที่ต้องการแลก <span className="text-red-400">*</span>
            </label>
            <select value={myEntryId} onChange={e=>setMyEntryId(e.target.value)} className={iCls(errors.myEntryId)}>
              <option value="">— เลือกคาบ —</option>
              {myEntries.map(e=>(
                <option key={e.id} value={e.id}>
                  {TH_DAYS[e.day_of_week]} {e.time_slot?.slot_label} — {e.subject?.name} ({e.classroom?.room_name})
                </option>
              ))}
            </select>
            {errors.myEntryId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกคาบของคุณ</p>}
          </div>
          {/* ครูที่ต้องการแลก */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              ครูที่ต้องการแลกด้วย <span className="text-red-400">*</span>
            </label>
            <select value={targetTeacherId} onChange={e=>{setTargetTeacherId(e.target.value);setTargetEntryId("");}} className={iCls(errors.targetTeacherId)}>
              <option value="">— เลือกครู —</option>
              {teachers.filter(t=>t.id!==user.id).map(t=>(
                <option key={t.id} value={t.id}>{fullName(t)}</option>
              ))}
            </select>
            {errors.targetTeacherId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกครู</p>}
          </div>
          {/* คาบของครูที่ต้องการ */}
          {targetTeacherId && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                คาบที่ต้องการแลก (ของครูคนนั้น) <span className="text-red-400">*</span>
              </label>
              <select value={targetEntryId} onChange={e=>setTargetEntryId(e.target.value)} className={iCls(errors.targetEntryId)}>
                <option value="">— เลือกคาบ —</option>
                {targetEntries.map(e=>(
                  <option key={e.id} value={e.id}>
                    {TH_DAYS[e.day_of_week]} {e.time_slot?.slot_label} — {e.subject?.name} ({e.classroom?.room_name})
                  </option>
                ))}
              </select>
              {errors.targetEntryId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกคาบ</p>}
            </div>
          )}
          {/* วันที่ */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              วันที่ต้องการแลก <span className="text-red-400">*</span>
            </label>
            <input type="date" value={swapDate} onChange={e=>setSwapDate(e.target.value)} className={iCls(errors.swapDate)} />
          </div>
          {/* เหตุผล */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เหตุผล</label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
              placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)" className={iCls()+" resize-none"} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-medium">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังส่ง..." : "📤 ส่งคำขอ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AssignSubModal ────────────────────────────────────────────────────────────
function AssignSubModal({ leaveRequest, teachers, entries, academicYearId, currentUser, onSave, onClose }: {
  leaveRequest: LeaveRequest; teachers: User[];
  entries: TimetableEntry[]; academicYearId: string;
  currentUser: User; onSave: () => void; onClose: () => void;
}) {
  const absentId = leaveRequest.user_id;
  const absentEntries = entries.filter(e => e.teacher_id === absentId);
  const leaveDates: string[] = [];
  const start = new Date(leaveRequest.start_date+"T00:00:00");
  const end   = new Date(leaveRequest.end_date+"T00:00:00");
  for (let d=new Date(start); d<=end; d=addDays(d,1)) {
    if (d.getDay()>=1&&d.getDay()<=5) leaveDates.push(ymd(d));
  }

  const [assignments, setAssignments] = useState<Record<string, string>>(
    () => Object.fromEntries(absentEntries.flatMap(e =>
      leaveDates.map(dt => [`${e.id}_${dt}`, ""])
    ))
  );
  const [saving, setSaving] = useState(false);

  function setAsgn(key: string, val: string) {
    setAssignments(prev => ({ ...prev, [key]: val }));
  }

  const handleSave = async () => {
    setSaving(true);
    const records = Object.entries(assignments)
      .filter(([,v]) => v)
      .map(([key, subId]) => {
        const [entryId, date] = key.split("_");
        const entry = absentEntries.find(e => e.id === entryId);
        return {
          leave_request_id: leaveRequest.id,
          absent_teacher_id: absentId,
          substitute_teacher_id: subId,
          timetable_entry_id: entryId,
          substitute_date: date,
          time_slot_id: entry?.time_slot_id,
          classroom_id: entry?.classroom_id,
          subject_id: entry?.subject_id,
          hours_count: 1,
          assigned_by: currentUser.id,
          status: "assigned",
          academic_year_id: academicYearId,
        };
      });
    if (records.length === 0) { alert("กรุณาเลือกครูสอนแทนอย่างน้อย 1 คาบ"); setSaving(false); return; }
    const { error } = await supabase.from("substitute_records").insert(records);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">📋 จัดครูสอนแทน</h3>
            <p className="text-sm text-slate-500">{fullName(leaveRequest.user)} ลา {thaiDate(leaveRequest.start_date)}
              {leaveRequest.start_date !== leaveRequest.end_date ? ` – ${thaiDate(leaveRequest.end_date)}` : ""}
              {" "}({leaveRequest.days_count} วัน)
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {absentEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของครูคนนี้</div>
          ) : (
            <div className="space-y-6">
              {leaveDates.map(date => {
                const dayOfWeek = new Date(date+"T00:00:00").getDay();
                const dayEntries = absentEntries.filter(e => e.day_of_week === dayOfWeek);
                if (dayEntries.length === 0) return null;
                return (
                  <div key={date}>
                    <h4 className="font-bold text-slate-700 text-sm mb-3 pb-2 border-b border-slate-200">
                      📅 {TH_DAYS[dayOfWeek]} {thaiDate(date)}
                    </h4>
                    <div className="space-y-2">
                      {dayEntries.map(entry => {
                        const key = `${entry.id}_${date}`;
                        return (
                          <div key={key} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            <div className="shrink-0 text-center w-16">
                              <div className="text-xs font-bold text-blue-700">{entry.time_slot?.slot_label}</div>
                              <div className="text-[10px] text-slate-400">{thaiTime(entry.time_slot?.start_time)}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{entry.subject?.name}</div>
                              <div className="text-xs text-slate-400">{entry.classroom?.room_name}</div>
                            </div>
                            <div className="shrink-0 w-48">
                              <select value={assignments[key]||""} onChange={e=>setAsgn(key,e.target.value)}
                                className="w-full border-2 border-blue-200 rounded-xl px-2 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                                <option value="">— เลือกครูสอนแทน —</option>
                                {teachers.filter(t=>t.id!==absentId).map(t=>(
                                  <option key={t.id} value={t.id}>{fullName(t)}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการสอนแทน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SubstitutionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"swap"|"substitute"|"stat">("swap");
  const [academicYear, setAcademicYear] = useState<AcademicYear|null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [myEntries, setMyEntries] = useState<TimetableEntry[]>([]);
  const [allEntries, setAllEntries] = useState<TimetableEntry[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [subRecords, setSubRecords] = useState<SubRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [assignLeave, setAssignLeave] = useState<LeaveRequest|null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");

  const isAdmin = useMemo(() => ADMIN_ROLES.includes(user?.role ?? ""), [user]);

  // ── Load user ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) { setLoading(false); return; }
      let { data } = await supabase.from("users")
        .select("id,first_name,last_name,title,role,position,academic_level")
        .eq("auth_id", au.id).maybeSingle();
      if (!data && au.email) {
        const r = await supabase.from("users")
          .select("id,first_name,last_name,title,role,position,academic_level")
          .eq("email", au.email).maybeSingle();
        data = r.data;
        if (data) await supabase.from("users").update({ auth_id: au.id }).eq("id", (data as any).id);
      }
      if (data) setUser(data as User);
      setLoading(false);
    };
    init();
  }, []);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;

    // Academic year
    const { data: years } = await supabase.from("academic_years")
      .select("id,year_name,is_current").order("year_name", { ascending: false });
    const ay = (years ?? []).find((y: any) => y.is_current) ?? years?.[0];
    setAcademicYear(ay ?? null);
    const ayId = ay?.id;

    // Teachers
    const { data: tch } = await supabase.from("users")
      .select("id,first_name,last_name,title,role,position,academic_level")
      .in("role", ["teacher","homeroom_teacher","subject_teacher"])
      .order("first_name");
    setTeachers((tch ?? []) as User[]);

    // Timetable entries
    const entriesQuery = supabase.from("timetable_entries")
      .select(`id,classroom_id,subject_id,teacher_id,day_of_week,time_slot_id,academic_year_id,
        classroom:classrooms(id,room_name,room_number),
        subject:subjects(id,name,code),
        teacher:users(id,first_name,last_name,title),
        time_slot:time_slots(id,slot_number,start_time,end_time,slot_label,is_break)`)
      .eq("academic_year_id", ayId);
    const { data: entries } = await entriesQuery;
    const allE = (entries ?? []) as unknown as TimetableEntry[];
    setAllEntries(allE);
    setMyEntries(allE.filter(e => e.teacher_id === user.id));

    // Swap requests
    const swapQ = supabase.from("class_swap_requests")
      .select(`*,
        requester:users!requester_id(id,first_name,last_name,title),
        target_teacher:users!target_teacher_id(id,first_name,last_name,title)`)
      .order("created_at", { ascending: false }).limit(100);
    const { data: swaps } = await swapQ;
    setSwapRequests((swaps ?? []) as SwapRequest[]);

    // Substitute records
    const { data: subs } = await supabase.from("substitute_records")
      .select(`*,
        absent_teacher:users!absent_teacher_id(id,first_name,last_name,title),
        substitute_teacher:users!substitute_teacher_id(id,first_name,last_name,title),
        time_slot:time_slots(id,slot_label,start_time,end_time),
        classroom:classrooms(id,room_name),
        subject:subjects(id,name),
        timetable_entry:timetable_entries(id,subject:subjects(id,name),classroom:classrooms(id,room_name))`)
      .order("substitute_date", { ascending: false }).limit(200);
    setSubRecords((subs ?? []) as SubRecord[]);

    // Leave requests (approved, within next 30 days)
    const from = ymd(new Date());
    const to   = ymd(addDays(new Date(), 30));
    const { data: leaves } = await supabase.from("leave_requests")
      .select(`*,user:users!user_id(id,first_name,last_name,title,role)`)
      .eq("status", "approved")
      .gte("end_date", from).lte("start_date", to)
      .order("start_date");
    setLeaveRequests((leaves ?? []) as LeaveRequest[]);
  }, [user]);

  useEffect(() => { if (!loading && user) loadData(); }, [loading, user, loadData]);

  // ── Swap actions ───────────────────────────────────────────────────────────
  const handleSwapRespond = async (id: string, accept: boolean) => {
    const status = accept ? "accepted" : "rejected";
    await supabase.from("class_swap_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", id);
    await loadData();
  };

  const handleSwapCancel = async (id: string) => {
    if (!confirm("ยืนยันการยกเลิกคำขอ?")) return;
    await supabase.from("class_swap_requests").update({ status: "cancelled" }).eq("id", id);
    await loadData();
  };

  // ── Filtered data ──────────────────────────────────────────────────────────
  const mySwaps = useMemo(() =>
    swapRequests.filter(r => r.requester_id === user?.id || r.target_teacher_id === user?.id)
  , [swapRequests, user]);

  const incomingSwaps = useMemo(() =>
    swapRequests.filter(r => r.target_teacher_id === user?.id && r.status === "pending")
  , [swapRequests, user]);

  const filteredSubs = useMemo(() => {
    let list = subRecords;
    if (filterDate) list = list.filter(r => r.substitute_date === filterDate);
    if (filterTeacher) list = list.filter(r =>
      r.absent_teacher_id === filterTeacher || r.substitute_teacher_id === filterTeacher);
    if (!isAdmin) list = list.filter(r =>
      r.absent_teacher_id === user?.id || r.substitute_teacher_id === user?.id);
    return list;
  }, [subRecords, filterDate, filterTeacher, isAdmin, user]);

  // ── Stat ───────────────────────────────────────────────────────────────────
  const statMap = useMemo(() => {
    const m: Record<string, { name: string; asAbsent: number; asSub: number; hours: number }> = {};
    for (const r of subRecords) {
      if (r.absent_teacher_id) {
        if (!m[r.absent_teacher_id]) m[r.absent_teacher_id] = { name: fullName(r.absent_teacher), asAbsent: 0, asSub: 0, hours: 0 };
        m[r.absent_teacher_id].asAbsent++;
      }
      if (r.substitute_teacher_id) {
        if (!m[r.substitute_teacher_id]) m[r.substitute_teacher_id] = { name: fullName(r.substitute_teacher), asAbsent: 0, asSub: 0, hours: 0 };
        m[r.substitute_teacher_id].asSub++;
        m[r.substitute_teacher_id].hours += Number(r.hours_count);
      }
    }
    return Object.entries(m).sort((a,b) => b[1].hours - a[1].hours);
  }, [subRecords]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-lg animate-pulse">กำลังโหลด...</p>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-lg">กรุณาเข้าสู่ระบบ</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-600 via-pink-500 to-rose-400 px-5 py-4 flex items-center gap-3 shadow-lg shrink-0">
        <button onClick={() => router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold text-lg shrink-0">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight">🔄 แลกคาบ & สอนแทน</h1>
          <p className="text-pink-100 text-sm">{fullName(user)} · {academicYear?.year_name}</p>
        </div>
        <button onClick={() => setShowSwapModal(true)}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-bold rounded-xl border border-white/30">
          + ขอแลกคาบ
        </button>
      </div>

      {/* Incoming swap badge */}
      {incomingSwaps.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-3">
          <span className="text-amber-600 font-bold text-sm">⏳ มีคำขอแลกคาบรอการตอบรับ {incomingSwaps.length} รายการ</span>
          <button onClick={() => setTab("swap")} className="text-xs text-amber-700 underline font-bold">ดู</button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 flex overflow-x-auto shrink-0">
        {([
          ["swap",       "🔄 แลกคาบ"],
          ["substitute", "📋 สอนแทน"],
          ["stat",       "📊 สถิติ"],
        ] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-3.5 text-sm font-bold border-b-2 whitespace-nowrap transition-all
              ${tab===k ? "border-pink-500 text-pink-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
            {l}
            {k==="swap" && incomingSwaps.length > 0 && (
              <span className="ml-1.5 bg-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{incomingSwaps.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Tab: แลกคาบ ── */}
        {tab === "swap" && (
          <div className="max-w-3xl mx-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">คำขอแลกคาบของฉัน</h2>
              <button onClick={() => setShowSwapModal(true)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold rounded-xl">
                + ขอแลกคาบใหม่
              </button>
            </div>

            {/* Incoming */}
            {incomingSwaps.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">⏳ รอตอบรับ ({incomingSwaps.length})</h3>
                <div className="space-y-3">
                  {incomingSwaps.map(r => (
                    <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-bold text-slate-800">{fullName(r.requester)} <span className="text-slate-400 font-normal">ขอแลกคาบ</span></p>
                          <p className="text-sm text-slate-500">📅 {thaiDate(r.swap_date)}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${STATUS_SWAP[r.status]?.cls}`}>
                          {STATUS_SWAP[r.status]?.label}
                        </span>
                      </div>
                      {r.reason && <p className="text-sm text-slate-600 mb-3 bg-white rounded-xl px-3 py-2">{r.reason}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => handleSwapRespond(r.id, true)}
                          className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold">
                          ✅ ตกลง
                        </button>
                        <button onClick={() => handleSwapRespond(r.id, false)}
                          className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold">
                          ❌ ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My requests */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">คำขอทั้งหมดของฉัน</h3>
              {mySwaps.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400">
                  <p className="text-4xl mb-2">🔄</p>
                  <p className="text-sm">ยังไม่มีคำขอแลกคาบ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mySwaps.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm">
                            {r.requester_id === user?.id
                              ? <span>ขอแลกกับ <span className="text-blue-600">{fullName(r.target_teacher)}</span></span>
                              : <span><span className="text-blue-600">{fullName(r.requester)}</span> ขอแลกกับคุณ</span>
                            }
                          </p>
                          <p className="text-xs text-slate-400">📅 {thaiDate(r.swap_date)}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border shrink-0 ${STATUS_SWAP[r.status]?.cls}`}>
                          {STATUS_SWAP[r.status]?.label}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-slate-500 mb-2">{r.reason}</p>}
                      {r.requester_id === user?.id && r.status === "pending" && (
                        <button onClick={() => handleSwapCancel(r.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-bold underline">ยกเลิกคำขอ</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: สอนแทน ── */}
        {tab === "substitute" && (
          <div className="max-w-4xl mx-auto p-5 space-y-5">
            {/* Admin: จัดสอนแทนจากใบลา */}
            {isAdmin && leaveRequests.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  📋 ครูที่ลา (รอจัดสอนแทน) — {leaveRequests.length} คน
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {leaveRequests.map(lr => {
                    const alreadyAssigned = subRecords.some(r => r.leave_request_id === lr.id);
                    return (
                      <div key={lr.id} className={`rounded-2xl border p-4 ${alreadyAssigned ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{fullName(lr.user)}</p>
                            <p className="text-xs text-slate-400">{thaiDate(lr.start_date)} – {thaiDate(lr.end_date)} ({lr.days_count} วัน)</p>
                            <p className="text-xs text-slate-400 mt-0.5">{{sick:"ลาป่วย",personal:"ลากิจ",official:"ลาราชการ",maternity:"ลาคลอด",ordination:"ลาอุปสมบท"}[lr.leave_type]??lr.leave_type}</p>
                          </div>
                          {alreadyAssigned ? (
                            <span className="text-xs font-bold px-2 py-1 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300 shrink-0">จัดแล้ว ✓</span>
                          ) : (
                            <button onClick={() => setAssignLeave(lr)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shrink-0">
                              จัดสอนแทน
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filter + Print */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-3 items-end justify-between">
                <div className="flex gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">วันที่</label>
                    <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
                      className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none" />
                  </div>
                  {isAdmin && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">ครู</label>
                      <select value={filterTeacher} onChange={e=>setFilterTeacher(e.target.value)}
                        className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                        <option value="">ทั้งหมด</option>
                        {teachers.map(t=><option key={t.id} value={t.id}>{fullName(t)}</option>)}
                      </select>
                    </div>
                  )}
                  {(filterDate||filterTeacher) && (
                    <button onClick={()=>{setFilterDate("");setFilterTeacher("");}}
                      className="px-3 py-2 text-xs text-slate-400 hover:text-slate-600 underline self-end">ล้างตัวกรอง</button>
                  )}
                </div>
                {isAdmin && filteredSubs.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={()=>printSubOrder(filteredSubs, filterDate?thaiDate(filterDate):"ทั้งหมด")}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                      🖨️ พิมพ์ใบคำสั่ง
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sub records table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm">รายการสอนแทน ({filteredSubs.length})</h3>
              </div>
              {filteredSubs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">ไม่มีข้อมูล</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{minWidth:700}}>
                    <thead>
                      <tr className="bg-gradient-to-r from-blue-800 to-blue-600 text-white text-xs">
                        {["วันที่","คาบ","ห้อง","วิชา","ครูเจ้าของคาบ","ครูสอนแทน","ชม.","สถานะ"].map(h=>(
                          <th key={h} className="px-3 py-3 text-left font-bold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubs.map((r,i)=>(
                        <tr key={r.id} className={i%2===0?"bg-slate-50":"bg-white"}>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">{thaiDate(r.substitute_date)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs font-bold text-blue-700">{r.time_slot?.slot_label??"-"}</td>
                          <td className="px-3 py-2.5 text-xs">{r.classroom?.room_name??r.timetable_entry?.classroom?.room_name??"-"}</td>
                          <td className="px-3 py-2.5 text-xs">{r.subject?.name??r.timetable_entry?.subject?.name??"-"}</td>
                          <td className="px-3 py-2.5 text-xs font-medium">{fullName(r.absent_teacher)}</td>
                          <td className="px-3 py-2.5 text-xs font-medium text-emerald-700">{fullName(r.substitute_teacher)}</td>
                          <td className="px-3 py-2.5 text-center text-xs font-bold">{r.hours_count}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${STATUS_SUB[r.status]?.cls}`}>
                              {STATUS_SUB[r.status]?.label??r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: สถิติ ── */}
        {tab === "stat" && (
          <div className="max-w-3xl mx-auto p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">📊 สถิติการสอนแทน</h2>
              {isAdmin && (
                <button onClick={()=>printTeacherSubStat(subRecords, teachers)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl flex items-center gap-1.5">
                  🖨️ พิมพ์สถิติ (คิดขั้นเงินเดือน)
                </button>
              )}
            </div>

            {/* My stat card */}
            {!isAdmin && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label:"ครั้งที่ขาด/ลา", value: subRecords.filter(r=>r.absent_teacher_id===user.id).length, color:"#dc2626", icon:"📋" },
                  { label:"ครั้งที่สอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id).length, color:"#16a34a", icon:"✅" },
                  { label:"ชั่วโมงสอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id).reduce((s,r)=>s+Number(r.hours_count),0), color:"#2563eb", icon:"⏰" },
                  { label:"คำขอแลกคาบ", value: mySwaps.length, color:"#7c3aed", icon:"🔄" },
                ].map(c=>(
                  <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                    <span className="text-3xl">{c.icon}</span>
                    <div>
                      <div className="text-2xl font-black" style={{color:c.color}}>{c.value}</div>
                      <div className="text-xs text-slate-400 font-medium">{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* All teachers stat table (admin) */}
            {isAdmin && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="font-bold text-slate-700 text-sm">สรุปรายบุคคล</h3>
                </div>
                {statMap.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-slate-700 to-slate-600 text-white text-xs">
                          <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                          <th className="px-3 py-3 text-center">ครั้งที่ขาด</th>
                          <th className="px-3 py-3 text-center">ครั้งสอนแทน</th>
                          <th className="px-3 py-3 text-center">รวมชั่วโมง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statMap.map(([id,s],i)=>(
                          <tr key={id} className={i%2===0?"bg-slate-50":"bg-white"}>
                            <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                            <td className="px-3 py-3 text-center text-red-600 font-bold">{s.asAbsent}</td>
                            <td className="px-3 py-3 text-center text-emerald-600 font-bold">{s.asSub}</td>
                            <td className="px-3 py-3 text-center">
                              <span className="font-black text-blue-600 text-base">{s.hours}</span>
                              <span className="text-slate-400 text-xs"> ชม.</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showSwapModal && academicYear && (
        <SwapRequestModal
          user={user} teachers={teachers}
          myEntries={myEntries} allEntries={allEntries}
          academicYearId={academicYear.id}
          onSave={async()=>{ setShowSwapModal(false); await loadData(); }}
          onClose={()=>setShowSwapModal(false)}
        />
      )}
      {assignLeave && academicYear && (
        <AssignSubModal
          leaveRequest={assignLeave}
          teachers={teachers} entries={allEntries}
          academicYearId={academicYear.id}
          currentUser={user}
          onSave={async()=>{ setAssignLeave(null); await loadData(); }}
          onClose={()=>setAssignLeave(null)}
        />
      )}
    </div>
  );
}