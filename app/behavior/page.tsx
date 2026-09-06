"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDisplayPrefix } from "@/lib/student-prefix";
import {
  Home, ArrowLeft, Search, HeartHandshake, ThumbsDown, ThumbsUp,
  CheckCircle2, Undo2, Loader2, X, ChevronDown, PenLine, AlertTriangle,
} from "lucide-react";

const supabase = createClient();
const DASHBOARD_PATH = "/dashboard";

type Classroom = {
  classroom_id: string;
  room_name: string;
};

type Student = {
  id: string;
  seat_number: number | null;
  student_code: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  birth_date: string | null;
  gender: string | null;
  classroom_id: string;
  behavior_score: number;
};

type BehaviorAction = "deduct" | "add";

type Criteria = {
  id: string;
  name: string;
  action: BehaviorAction;
  points: number;
  category: string | null;
  is_variable_deduction: boolean;
};

type BehaviorRecord = {
  id: string;
  student_id: string;
  criteria_name: string;
  action: BehaviorAction;
  points: number;
  description: string | null;
  created_at: string;
  student?: { first_name: string; last_name: string; nick_name: string | null; seat_number: number | null };
};

const STUDENT_SELECT =
  "id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id, behavior_score";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
type BehaviorStatus = {
  label: string;
  detail: string | null; // ใครต้องพิจารณา (null = ปกติ ไม่ต้องแจ้งใคร)
  tone: "emerald" | "amber" | "orange" | "rose" | "red";
};

function getBehaviorStatus(score: number): BehaviorStatus {
  if (score >= 81) return { label: "ปกติ", detail: null, tone: "emerald" };
  if (score >= 61) return { label: "เฝ้าระวัง", detail: "ครูประจำชั้นแจ้งผู้ปกครอง", tone: "amber" };
  if (score >= 41) return { label: "ตักเตือนอย่างเป็นทางการ", detail: "หัวหน้าสายชั้นร่วมพิจารณา", tone: "orange" };
  if (score >= 21) return { label: "ทำทัณฑ์บน", detail: "หัวหน้างานปกครองพิจารณา", tone: "rose" };
  if (score >= 1) return { label: "เสี่ยงสูง", detail: "รองผู้อำนวยการพิจารณา", tone: "red" };
  return { label: "ขั้นวิกฤต", detail: "ผู้อำนวยการพิจารณา", tone: "red" };
}

const STATUS_STYLES: Record<BehaviorStatus["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200",
  amber: "bg-amber-50 text-amber-600 ring-1 ring-amber-200",
  orange: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",
  rose: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
  red: "bg-red-100 text-red-700 ring-1 ring-red-300",
};

function timeThai(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  } catch {
    return "";
  }
}

export default function BehaviorPage() {
  const router = useRouter();

  const [myProfileId, setMyProfileId] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [roomId, setRoomId] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [criteriaQuery, setCriteriaQuery] = useState("");
  const [selectedCriteria, setSelectedCriteria] = useState<Criteria | null>(null);

  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customAction, setCustomAction] = useState<BehaviorAction>("deduct");
  const [customPoints, setCustomPoints] = useState(5);
  const [customCategory, setCustomCategory] = useState("");

  const [points, setPoints] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [todayRecords, setTodayRecords] = useState<BehaviorRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [viewMode, setViewMode] = useState<"today" | "student" | "overview">("today");
const [historyStudentId, setHistoryStudentId] = useState<string>("");
const [studentHistory, setStudentHistory] = useState<BehaviorRecord[]>([]);
const [loadingHistory, setLoadingHistory] = useState(false);

const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
const [editAction, setEditAction] = useState<BehaviorAction>("deduct");
const [editPoints, setEditPoints] = useState<number>(0);

  // ── โปรไฟล์ผู้ใช้ + ห้องของครูประจำชั้น ─────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase.from("users").select("id").eq("auth_id", user.id).maybeSingle();
      if (profile) setMyProfileId(profile.id);
    });

    supabase.rpc("get_my_classrooms").then(({ data, error }: { data: Classroom[] | null; error: any }) => {
      if (error) { console.warn("[behavior] โหลดห้องไม่สำเร็จ:", error.message); return; }
      setClassrooms(data ?? []);
      if (data && data.length === 1) setRoomId(data[0].classroom_id);
    });

    supabase
      .from("behavior_criteria")
      .select("id, name, action, points, category, is_variable_deduction")
      .eq("is_active", true)
      .order("category")
      .order("points")
      .then(({ data, error }) => {
        if (error) { console.warn("[behavior] โหลดเกณฑ์ไม่สำเร็จ:", error.message); return; }
        setCriteriaList((data as unknown as Criteria[]) ?? []);
      });
  }, []);

  // ── นักเรียนในห้องที่เลือก ──────────────────────────────────
  useEffect(() => {
  if (!roomId) { setStudents([]); return; }
  setLoadingStudents(true);
  setSelectedStudentIds(new Set());
  setHistoryStudentId("");   // ★ ใหม่
  setStudentHistory([]);     // ★ ใหม่
  setEditingRecordId(null);  // ★ ใหม่
  supabase
    .from("students")
    .select(STUDENT_SELECT)
    .eq("classroom_id", roomId)
    .order("seat_number")
    .then(({ data, error }) => {
      if (error) console.warn("[behavior] โหลดนักเรียนไม่สำเร็จ:", error.message);
      setStudents((data as unknown as Student[]) ?? []);
      setLoadingStudents(false);
    });
  loadTodayRecords(roomId);
}, [roomId]);

useEffect(() => {
  if (viewMode !== "student" || !historyStudentId) { setStudentHistory([]); return; }
  loadStudentHistory(historyStudentId);
}, [viewMode, historyStudentId]);

async function loadStudentHistory(studentId: string) {
  setLoadingHistory(true);
  const { data, error } = await supabase
    .from("behavior_records")
    .select("id, student_id, criteria_name, action, points, description, created_at, student:students(first_name, last_name, nick_name, seat_number)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) { console.warn("[behavior] โหลดประวัตินักเรียนไม่สำเร็จ:", error.message); setLoadingHistory(false); return; }
  setStudentHistory((data as unknown as BehaviorRecord[]) ?? []);
  setLoadingHistory(false);
}

  async function loadTodayRecords(classroomId: string) {
    setLoadingRecords(true);
    const { data, error } = await supabase
  .from("behavior_records")
  .select("id, student_id, criteria_name, action, points, description, created_at, student:students(first_name, last_name, nick_name, seat_number)")
  .eq("classroom_id", classroomId)
  .gte("created_at", `${todayISO()}T00:00:00`)
  .order("created_at", { ascending: false });
    if (error) { console.warn("[behavior] โหลดประวัติวันนี้ไม่สำเร็จ:", error.message); setLoadingRecords(false); return; }
    setTodayRecords((data as unknown as BehaviorRecord[]) ?? []);
    setLoadingRecords(false);
  }

  // ── เมื่อเลือกเกณฑ์ ตั้งคะแนนตั้งต้นให้อัตโนมัติ (ปรับได้ทีหลัง) ──
  function pickCriteria(c: Criteria) {
    setSelectedCriteria(c);
    setCustomMode(false);
    setPoints(c.points);
    setNote("");
  }

  function startCustom() {
    setSelectedCriteria(null);
    setCustomMode(true);
    setCustomName("");
    setCustomAction("deduct");
    setCustomPoints(5);
    setCustomCategory("");
    setPoints(5);
  }

  const filteredCriteria = useMemo(() => {
    if (!criteriaQuery.trim()) return criteriaList;
    const q = criteriaQuery.trim().toLowerCase();
    return criteriaList.filter((c) => c.name.toLowerCase().includes(q) || (c.category ?? "").toLowerCase().includes(q));
  }, [criteriaList, criteriaQuery]);

  const groupedCriteria = useMemo(() => {
    const map = new Map<string, Criteria[]>();
    filteredCriteria.forEach((c) => {
      const key = c.category ?? "อื่น ๆ";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries());
  }, [filteredCriteria]);

  const filteredStudents = useMemo(() => {
    if (!studentQuery.trim()) return students;
    const q = studentQuery.trim().toLowerCase();
    return students.filter((s) => `${s.first_name} ${s.last_name} ${s.nick_name ?? ""}`.toLowerCase().includes(q));
  }, [students, studentQuery]);

  function toggleStudent(id: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedStudentIds.size === filteredStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
    }
  }

  const readyToSave = selectedStudentIds.size > 0 && (selectedCriteria || (customMode && customName.trim())) && points >= 0;

  async function handleSave() {
    if (!roomId || !readyToSave) return;
    setSaving(true);
    setErrorMsg("");

    const action: BehaviorAction = customMode ? customAction : selectedCriteria!.action;
    const name = customMode ? customName.trim() : selectedCriteria!.name;
    const category = customMode ? (customCategory.trim() || null) : selectedCriteria!.category;
    const criteriaId = customMode ? null : selectedCriteria!.id;

    const affectedIds = Array.from(selectedStudentIds); // ★ เก็บก่อนเคลียร์ฟอร์ม

const rows = affectedIds.map((studentId) => ({
  student_id: studentId,
  classroom_id: roomId,
  criteria_id: criteriaId,
  criteria_name: name,
  action,
  points,
  category,
  description: note.trim() || null,
  recorded_by: myProfileId || null,
  incident_date: todayISO(),
}));

const { error } = await supabase.from("behavior_records").insert(rows);
setSaving(false);

if (error) {
  setErrorMsg("บันทึกไม่สำเร็จ: " + error.message);
  return;
}

setSelectedStudentIds(new Set());
setSelectedCriteria(null);
setCustomMode(false);
setNote("");
setPoints(0);

const fresh = await refreshAfterChange();
notifyStatusChanges(fresh, affectedIds); // ★ แจ้งเตือนถ้าเข้าเกณฑ์
  }

  const classroomOverview = useMemo(() => {
  return [...students]
    .map((s) => ({ student: s, status: getBehaviorStatus(s.behavior_score) }))
    .sort((a, b) => a.student.behavior_score - b.student.behavior_score);
}, [students]);

const studentsNeedingAttention = useMemo(
  () => classroomOverview.filter((row) => row.status.detail !== null),
  [classroomOverview]
);
async function refreshAfterChange(): Promise<Student[]> {
  const { data: freshStudents } = await supabase
    .from("students")
    .select(STUDENT_SELECT)
    .eq("classroom_id", roomId)
    .order("seat_number");
  const list = (freshStudents as unknown as Student[]) ?? [];
  setStudents(list);
  loadTodayRecords(roomId);
  if (historyStudentId) loadStudentHistory(historyStudentId);
  return list;
}

function startEditRecord(r: BehaviorRecord) {
  setEditingRecordId(r.id);
  setEditAction(r.action);
  setEditPoints(r.points);
}

async function saveEditRecord(recordId: string, studentId: string) {
  if (editPoints < 0) { alert("คะแนนต้องไม่ติดลบ"); return; }
  const { error } = await supabase
    .from("behavior_records")
    .update({ action: editAction, points: editPoints })
    .eq("id", recordId);
  if (error) { alert("แก้ไขไม่สำเร็จ: " + error.message); return; }
  setEditingRecordId(null);
  const fresh = await refreshAfterChange();
  notifyStatusChanges(fresh, [studentId]);
}

function BehaviorRecordRow({
  record, editing, editAction, editPoints,
  onStartEdit, onCancelEdit, onChangeAction, onChangePoints, onSaveEdit, onUndo,
  showName = true, showDate = false,
}: {
  record: BehaviorRecord;
  editing: boolean;
  editAction: BehaviorAction;
  editPoints: number;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeAction: (a: BehaviorAction) => void;
  onChangePoints: (p: number) => void;
  onSaveEdit: () => void;
  onUndo: () => void;
  showName?: boolean;
  showDate?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {showName && (
            <p className="truncate text-[13px] font-semibold text-slate-700">
              {record.student ? `${record.student.first_name} ${record.student.last_name}` : "-"}
            </p>
          )}
          <p className="truncate text-[11px] text-slate-500">{record.criteria_name}</p>
          {record.description && (
            <p className="truncate text-[11px] text-slate-400">{record.description}</p>
          )}
          <p className="text-[11px] text-slate-400">
            {showDate
              ? new Date(record.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" })
              : `${timeThai(record.created_at)} น.`}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`text-xs font-black ${record.action === "deduct" ? "text-rose-500" : "text-emerald-500"}`}>
              {record.action === "deduct" ? "-" : "+"}{record.points}
            </span>
            <div className="flex gap-1">
              <button onClick={onStartEdit} className="rounded-lg p-1 text-slate-300 hover:bg-slate-200 hover:text-slate-600">
                <PenLine className="h-3.5 w-3.5" />
              </button>
              <button onClick={onUndo} className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
          <select
            value={editAction}
            onChange={(e) => onChangeAction(e.target.value as BehaviorAction)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="deduct">หักคะแนน</option>
            <option value="add">เพิ่มคะแนน</option>
          </select>
          <input
            type="number"
            min={0}
            value={editPoints}
            onChange={(e) => onChangePoints(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"
          />
          <button onClick={onSaveEdit} className="ml-auto rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-600">
            บันทึก
          </button>
          <button onClick={onCancelEdit} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:text-slate-600">
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  );
}

function notifyStatusChanges(studentList: Student[], ids: string[]) {
  const idSet = new Set(ids);
  const flagged = studentList
    .filter((s) => idSet.has(s.id))
    .map((s) => ({ student: s, status: getBehaviorStatus(s.behavior_score) }))
    .filter((x) => x.status.detail);
  if (flagged.length === 0) return;
  const msg = flagged
    .map((x) => `${x.student.first_name} ${x.student.last_name} — คะแนนคงเหลือ ${x.student.behavior_score} (${x.status.label}) → ${x.status.detail}`)
    .join("\n");
  alert("⚠️ นักเรียนต่อไปนี้เข้าเกณฑ์ต้องดำเนินการ:\n\n" + msg);
}

  async function undoRecord(recordId: string, studentId: string) {
    if (!confirm("ยืนยันยกเลิกรายการนี้? คะแนนคงเหลือของนักเรียนจะถูกคำนวณใหม่")) return;
    const { error } = await supabase.from("behavior_records").delete().eq("id", recordId);
    if (error) { alert("ยกเลิกไม่สำเร็จ: " + error.message); return; }
    const fresh = await refreshAfterChange();
    notifyStatusChanges(fresh, [studentId]);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-rose-50 via-white to-orange-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-rose-600"
          >
            <Home className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-rose-600"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-500">งานปกครอง / งานส่งเสริมวินัย</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">บันทึกพฤติกรรม</h1>
          <p className="mt-1 text-sm text-slate-500">เลือกนักเรียน → เลือกเกณฑ์หรือกรอกเอง → บันทึก คะแนนคงเหลือจะอัปเดตทันที</p>
        </div>

        {classrooms.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {classrooms.map((c) => (
              <button
                key={c.classroom_id}
                onClick={() => setRoomId(c.classroom_id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  roomId === c.classroom_id ? "bg-rose-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                }`}
              >
                ห้อง {c.room_name}
              </button>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {errorMsg}
          </div>
        )}

        {!roomId ? (
          <p className="mt-10 text-center text-sm text-slate-400">
            {classrooms.length === 0 ? "ไม่พบห้องที่คุณเป็นครูประจำชั้น" : "เลือกห้องเรียนด้านบนเพื่อเริ่มบันทึก"}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* ── คอลัมน์ซ้าย: เลือกนักเรียน + เกณฑ์ ───────────── */}
            <div className="lg:col-span-2 space-y-5">
              {/* เลือกนักเรียน */}
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-slate-800">1. เลือกนักเรียน</p>
                  {filteredStudents.length > 0 && (
                    <button onClick={toggleSelectAll} className="text-xs font-bold text-rose-600 hover:underline">
                      {selectedStudentIds.size === filteredStudents.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
                    </button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-3 py-2.5 focus-within:border-rose-400">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="ค้นหาชื่อนักเรียน..."
                    className="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 max-h-72 overflow-y-auto">
                  {loadingStudents ? (
                    <p className="col-span-full py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
                  ) : filteredStudents.length === 0 ? (
                    <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียน</p>
                  ) : (
                    filteredStudents.map((s) => {
                      const checked = selectedStudentIds.has(s.id);
                      const displayPrefix = getDisplayPrefix(s.gender, s.birth_date, s.prefix);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleStudent(s.id)}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                            checked ? "bg-rose-50 ring-2 ring-rose-300" : "bg-slate-50 hover:bg-rose-50/50"
                          }`}
                        >
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-white ${
                              checked ? "bg-rose-500" : "bg-gradient-to-br from-slate-400 to-slate-300"
                            }`}
                          >
                            {s.seat_number ?? "-"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-slate-800">
                              {displayPrefix}{s.first_name} {s.last_name}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">คะแนนคงเหลือ {s.behavior_score}</p>
                          </div>
                          {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-rose-500" />}
                        </button>
                      );
                    })
                  )}
                </div>
                {selectedStudentIds.size > 0 && (
                  <p className="mt-2 text-xs font-bold text-rose-600">เลือกแล้ว {selectedStudentIds.size} คน</p>
                )}
              </div>

              {/* เลือกเกณฑ์ */}
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-slate-800">2. เลือกเกณฑ์พฤติกรรม</p>
                  <button
                    onClick={startCustom}
                    className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      customMode ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    <PenLine className="h-3.5 w-3.5" /> กรอกเอง
                  </button>
                </div>

                {customMode ? (
                  <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-3.5">
                    <input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="ระบุพฤติกรรม..."
                      className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={customAction}
                        onChange={(e) => setCustomAction(e.target.value as BehaviorAction)}
                        className="rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="deduct">หักคะแนน</option>
                        <option value="add">เพิ่มคะแนน (ความดี)</option>
                      </select>
                      <input
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="หมวดหมู่ (ไม่บังคับ)"
                        className="rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-3 py-2.5 focus-within:border-rose-400">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        value={criteriaQuery}
                        onChange={(e) => setCriteriaQuery(e.target.value)}
                        placeholder="ค้นหาเกณฑ์..."
                        className="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
                      {groupedCriteria.map(([category, items]) => (
                        <div key={category}>
                          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">{category}</p>
                          <div className="space-y-1">
                            {items.map((c) => {
                              const active = selectedCriteria?.id === c.id;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => pickCriteria(c)}
                                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition ${
                                    active ? "bg-rose-50 ring-1 ring-rose-300" : "bg-slate-50 hover:bg-rose-50/50"
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5 text-slate-700">
                                    {c.action === "deduct" ? (
                                      <ThumbsDown className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                                    ) : (
                                      <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                    )}
                                    {c.name}
                                    {c.is_variable_deduction && (
                                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">ปรับได้</span>
                                    )}
                                  </span>
                                  <span className={`shrink-0 font-black ${c.action === "deduct" ? "text-rose-500" : "text-emerald-500"}`}>
                                    {c.action === "deduct" ? "-" : "+"}{c.points}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* คะแนน + หมายเหตุ + บันทึก */}
              {(selectedCriteria || customMode) && (
                <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm font-extrabold text-slate-800">3. คะแนนและหมายเหตุ</p>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-xs font-bold text-slate-500">คะแนน</label>
                    <input
                      type="number"
                      min={0}
                      value={points}
                      onChange={(e) => setPoints(Number(e.target.value))}
                      className="w-24 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-rose-400"
                    />
                    <span className="text-xs text-slate-400">
                      คะแนนตั้งต้น {customMode ? customPoints : selectedCriteria?.points} — ปรับได้ตามดุลพินิจ
                    </span>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="หมายเหตุ (ไม่บังคับ) เช่น รายละเอียดเหตุการณ์..."
                    rows={2}
                    className="mt-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!readyToSave || saving}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {saving ? "กำลังบันทึก..." : `บันทึกให้ ${selectedStudentIds.size} คน`}
                  </button>
                </div>
              )}
            </div>

            {/* ── คอลัมน์ขวา: ประวัติ + สถานะนักเรียน ─────────────────────── */}
<div className="space-y-5">
  {studentsNeedingAttention.length > 0 && (
    <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-extrabold text-amber-700">
        <AlertTriangle className="h-4 w-4" /> นักเรียนที่ต้องติดตาม ({studentsNeedingAttention.length})
      </p>
      <div className="mt-2 space-y-1.5">
        {studentsNeedingAttention.map(({ student: s, status }) => (
          <button
            key={s.id}
            onClick={() => { setViewMode("student"); setHistoryStudentId(s.id); }}
            className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-xs shadow-sm hover:bg-amber-50"
          >
            <span className="font-semibold text-slate-700">
              {s.first_name} {s.last_name} · {s.behavior_score} คะแนน
            </span>
            <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLES[status.tone]}`}>
              {status.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )}

  <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
    <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1">
      {([
        { key: "today", label: "วันนี้" },
        { key: "student", label: "รายคน" },
        { key: "overview", label: "ภาพรวมห้อง" },
      ] as const).map((tab) => (
        <button
          key={tab.key}
          onClick={() => setViewMode(tab.key)}
          className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
            viewMode === tab.key ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-rose-500"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>

    {viewMode === "today" && (
      <div className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
        {loadingRecords ? (
          <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : todayRecords.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีบันทึกวันนี้</p>
        ) : (
          todayRecords.map((r) => (
            <BehaviorRecordRow
              key={r.id}
              record={r}
              editing={editingRecordId === r.id}
              editAction={editAction}
              editPoints={editPoints}
              onStartEdit={() => startEditRecord(r)}
              onCancelEdit={() => setEditingRecordId(null)}
              onChangeAction={setEditAction}
              onChangePoints={setEditPoints}
              onSaveEdit={() => saveEditRecord(r.id, r.student_id)}
              onUndo={() => undoRecord(r.id, r.student_id)}
              showName
            />
          ))
        )}
      </div>
    )}

    {viewMode === "student" && (
      <div className="mt-3">
        <select
          value={historyStudentId}
          onChange={(e) => setHistoryStudentId(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
        >
          <option value="">เลือกนักเรียน...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              เลขที่ {s.seat_number ?? "-"} · {s.first_name} {s.last_name}
            </option>
          ))}
        </select>

        {historyStudentId && (() => {
          const s = students.find((x) => x.id === historyStudentId);
          if (!s) return null;
          const status = getBehaviorStatus(s.behavior_score);
          return (
            <div className={`mt-3 rounded-2xl p-3.5 ${STATUS_STYLES[status.tone]}`}>
              <p className="text-sm font-black">คะแนนคงเหลือ {s.behavior_score} · {status.label}</p>
              {status.detail && <p className="mt-0.5 text-xs font-semibold">{status.detail}</p>}
            </div>
          );
        })()}

        <div className="mt-3 max-h-[24rem] space-y-1.5 overflow-y-auto">
          {!historyStudentId ? (
            <p className="py-6 text-center text-sm text-slate-400">เลือกนักเรียนเพื่อดูประวัติทั้งหมด</p>
          ) : loadingHistory ? (
            <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
          ) : studentHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีประวัติ</p>
          ) : (
            studentHistory.map((r) => (
              <BehaviorRecordRow
                key={r.id}
                record={r}
                editing={editingRecordId === r.id}
                editAction={editAction}
                editPoints={editPoints}
                onStartEdit={() => startEditRecord(r)}
                onCancelEdit={() => setEditingRecordId(null)}
                onChangeAction={setEditAction}
                onChangePoints={setEditPoints}
                onSaveEdit={() => saveEditRecord(r.id, r.student_id)}
                onUndo={() => undoRecord(r.id, r.student_id)}
                showName={false}
                showDate
              />
            ))
          )}
        </div>
      </div>
    )}

    {viewMode === "overview" && (
      <div className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
        {classroomOverview.map(({ student: s, status }) => (
          <button
            key={s.id}
            onClick={() => { setViewMode("student"); setHistoryStudentId(s.id); }}
            className="flex w-full items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-left hover:bg-rose-50/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-800">
                เลขที่ {s.seat_number ?? "-"} · {s.first_name} {s.last_name}
              </p>
              <p className="text-[11px] text-slate-400">คะแนนคงเหลือ {s.behavior_score}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status.tone]}`}>
              {status.label}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
</div>
          </div>
        )}
      </div>
    </div>
  );
}
