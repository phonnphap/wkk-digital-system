"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ScanLine, Camera, Search, CheckCircle2, AlertTriangle, X, Loader2, Lock } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const supabase = createClient();
const CAMERA_REGION_ID = "council-camera-region";

type Classroom = { classroom_id: string; room_name: string; grade_level: string | null };
type StudentRow = {
  id: string; seat_number: number | null; prefix: string | null; first_name: string; last_name: string;
  nick_name: string | null; gender: string | null; birth_date: string | null; student_code: string | null;
  room_name?: string; grade_level?: string;
};
type MarkedResult = { first_name: string; last_name: string; nick_name: string | null; seat_number: number | null; room_label: string; already_marked: boolean };

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว กรุณาขอลิงก์ใหม่จากครูเวร",
  COUNCIL_DISABLED: "ระบบปิดใช้งานชั่วคราวโดยแอดมิน",
  OUTSIDE_TIME_WINDOW: "ขณะนี้อยู่นอกช่วงเวลาที่อนุญาตให้บันทึก",
  STUDENT_NOT_FOUND: "ไม่พบนักเรียนรหัส/เลขบัตรนี้ในระบบ",
};

function formatClassLabel(grade?: string, room?: string) {
  if (grade && room) return `${grade}/${room}`;
  return grade || room || "";
}

export default function CouncilLateCheckinPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [scanValue, setScanValue] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<MarkedResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionLog, setSessionLog] = useState<MarkedResult[]>([]);
  const [blockedMsg, setBlockedMsg] = useState("");

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [gradeLevel, setGradeLevel] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomStudents, setRoomStudents] = useState<StudentRow[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentRow[]>([]);
  const [alreadyLateIds, setAlreadyLateIds] = useState<Set<string>>(new Set());

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);

  function translateRpcError(msg: string) {
    return ERROR_MESSAGES[msg] ?? msg;
  }

  async function loadClassrooms() {
    const { data, error } = await supabase.rpc("council_list_classrooms", { p_token: token });
    if (error) { setBlockedMsg(translateRpcError(error.message)); return; }
    setClassrooms((data ?? []).map((r: any) => ({ classroom_id: r.classroom_id, room_name: r.room_name, grade_level: r.grade_level })));
  }
  async function loadLateIds() {
    const { data, error } = await supabase.rpc("council_today_late_ids", { p_token: token });
    if (error) return;
    setAlreadyLateIds(new Set((data ?? []).map((r: any) => r.student_id)));
  }

  useEffect(() => { loadClassrooms(); loadLateIds(); }, []);

  const gradeLevels = useMemo(() => Array.from(new Set(classrooms.map((c) => c.grade_level).filter(Boolean))) as string[], [classrooms]);
  const roomsInGrade = useMemo(() => classrooms.filter((c) => c.grade_level === gradeLevel), [classrooms, gradeLevel]);

  useEffect(() => {
    if (!roomId) { setRoomStudents([]); return; }
    setLoadingRoom(true);
    supabase.rpc("council_list_students", { p_token: token, p_classroom_id: roomId }).then(({ data, error }) => {
      if (error) { setErrorMsg(translateRpcError(error.message)); setLoadingRoom(false); return; }
      setRoomStudents(data ?? []);
      setLoadingRoom(false);
    });
  }, [roomId]);

  useEffect(() => {
    const q = query.trim();
    if (roomId || q.length < 2) { setSearchResults([]); return; }
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("council_search_students", { p_token: token, p_query: q });
      if (error) { setErrorMsg(translateRpcError(error.message)); return; }
      setSearchResults(data ?? []);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, roomId]);

  const filteredRoomStudents = useMemo(() => {
    if (!query.trim()) return roomStudents;
    const q = query.trim().toLowerCase();
    return roomStudents.filter((s) => `${s.first_name} ${s.last_name} ${s.nick_name ?? ""} ${s.student_code ?? ""}`.toLowerCase().includes(q));
  }, [roomStudents, query]);

  useEffect(() => {
    if (!scannerOpen) return;
    scanHandledRef.current = false;
    setCameraError("");
    setCameraStarting(true);
    const qr = new Html5Qrcode(CAMERA_REGION_ID, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.ITF],
      verbose: false,
    });
    html5QrRef.current = qr;
    qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      (text) => { if (!scanHandledRef.current) { scanHandledRef.current = true; setScannerOpen(false); submitCode(text.replace(/\D/g, "") || text); } },
      () => {}
    ).then(() => setCameraStarting(false))
     .catch((err) => { setCameraStarting(false); setCameraError("เปิดกล้องไม่สำเร็จ: " + String(err)); });

    return () => {
      const cur = html5QrRef.current; html5QrRef.current = null;
      if (cur) cur.stop().then(() => cur.clear()).catch(() => {});
    };
  }, [scannerOpen]);

  async function submitCode(code: string) {
    if (!code.trim()) return;
    setErrorMsg(""); setSaving(true);
    const { data, error } = await supabase.rpc("mark_late_via_share_link", { p_token: token, p_code: code.trim() });
    setSaving(false); setScanValue("");
    if (error) { setErrorMsg(translateRpcError(error.message)); return; }
    applyResult(Array.isArray(data) ? data[0] : data);
  }

  async function submitStudentId(studentId: string) {
    setErrorMsg(""); setSaving(true);
    const { data, error } = await supabase.rpc("mark_late_via_share_link_by_id", { p_token: token, p_student_id: studentId });
    setSaving(false);
    if (error) { setErrorMsg(translateRpcError(error.message)); return; }
    applyResult(Array.isArray(data) ? data[0] : data);
    setQuery("");
  }

  function applyResult(row: any) {
    if (!row) { setErrorMsg("ไม่พบข้อมูลนักเรียน"); return; }
    const entry: MarkedResult = {
      first_name: row.out_first_name, last_name: row.out_last_name, nick_name: row.out_nick_name,
      seat_number: row.out_seat_number, room_label: row.out_room_label, already_marked: row.out_already_marked,
    };
    setResult(entry);
    setSessionLog((prev) => [entry, ...prev]);
    setAlreadyLateIds((prev) => new Set(prev)); // จะรีเฟรชจริงตอนปิด result
  }

  useEffect(() => { if (!scannerOpen && !result) scanInputRef.current?.focus(); }, [scannerOpen, result]);

  if (blockedMsg) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          <Lock className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 text-sm font-bold text-slate-700">{blockedMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">สภานักเรียน</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-800">บันทึกนักเรียนมาสาย</h1>
        <p className="mt-1 text-sm text-slate-500">สแกนบัตร เลือกชั้น/ห้อง หรือพิมพ์ค้นหาชื่อ</p>

        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <form onSubmit={(e) => { e.preventDefault(); submitCode(scanValue); }} className="flex flex-1 items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
              <ScanLine className="h-5 w-5" />
            </span>
            <input
              ref={scanInputRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              placeholder="รหัสนักเรียน/เลขบัตร แล้วกด Enter"
              className="w-full border-none bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
            />
          </form>
          <button onClick={() => setScannerOpen(true)} className="flex shrink-0 items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-4 text-sm font-semibold text-white shadow-md sm:w-auto">
            <Camera className="h-5 w-5" /> เปิดกล้องสแกน
          </button>
        </div>

        <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-3 py-2.5 focus-within:border-indigo-400">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์ค้นหาชื่อ นามสกุล ชื่อเล่น หรือรหัสนักเรียน..."
              className="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500"><X className="h-4 w-4" /></button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {gradeLevels.map((g) => (
              <button
                key={g}
                onClick={() => { setGradeLevel(g); setRoomId(""); setQuery(""); }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${gradeLevel === g ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"}`}
              >
                {g}
              </button>
            ))}
          </div>

          {gradeLevel && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roomsInGrade.map((r) => (
                <button
                  key={r.classroom_id}
                  onClick={() => setRoomId(r.classroom_id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${roomId === r.classroom_id ? "bg-sky-500 text-white shadow-sm" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200 hover:bg-sky-50 hover:text-sky-600"}`}
                >
                  {r.room_name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {loadingRoom ? (
              <p className="col-span-full py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
            ) : roomId ? (
              filteredRoomStudents.length === 0 ? (
                <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียนที่ตรงกับคำค้นหา</p>
              ) : (
                filteredRoomStudents.map((s) => (
                  <StudentRow key={s.id} s={s} isLate={alreadyLateIds.has(s.id)} onPick={() => submitStudentId(s.id)} />
                ))
              )
            ) : query.trim().length >= 2 ? (
              searchResults.length === 0 ? (
                <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียนที่ตรงกับคำค้นหา</p>
              ) : (
                searchResults.map((s) => (
                  <StudentRow key={s.id} s={s} isLate={alreadyLateIds.has(s.id)} showClass onPick={() => submitStudentId(s.id)} />
                ))
              )
            ) : (
              <p className="col-span-full py-6 text-center text-sm text-slate-400">เลือกระดับชั้น/ห้อง หรือพิมพ์ค้นหาชื่อนักเรียน (อย่างน้อย 2 ตัวอักษร)</p>
            )}
          </div>
        </div>

        {sessionLog.length > 0 && (
          <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-bold text-slate-500">บันทึกโดยคุณในรอบนี้ ({sessionLog.length} คน)</p>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {sessionLog.map((e, i) => (
                <div key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  {e.first_name} {e.last_name} {e.nick_name && `(${e.nick_name})`} — {e.room_label} เลขที่ {e.seat_number}
                  {e.already_marked && <span className="ml-2 text-[10px] text-amber-600">(บันทึกซ้ำ)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {scannerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-800">สแกนบัตรนักเรียน</p>
                <button onClick={() => setScannerOpen(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="relative mt-4 overflow-hidden rounded-2xl bg-slate-900">
                <div id={CAMERA_REGION_ID} className="w-full" />
                {cameraStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>
                )}
              </div>
              {cameraError && <p className="mt-2 text-xs text-rose-500">{cameraError}</p>}
            </div>
          </div>
        )}

        {result && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <p className="mt-3 text-lg font-extrabold text-slate-800">{result.first_name} {result.last_name}</p>
              <p className="text-sm text-slate-500">{result.room_label} · เลขที่ {result.seat_number}</p>
              {result.already_marked && <p className="mt-1 text-xs font-bold text-amber-600">บันทึกไว้อยู่แล้ววันนี้</p>}
              <button
                onClick={() => { setResult(null); loadLateIds(); }}
                className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                ตกลง สแกนคนต่อไป
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentRow({ s, isLate, showClass, onPick }: { s: StudentRow; isLate: boolean; showClass?: boolean; onPick: () => void }) {
  const prefix = s.prefix ?? "";
  const classLabel = formatClassLabel(s.grade_level, s.room_name);
  return (
    <button
      onClick={onPick}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${isLate ? "bg-rose-50 ring-1 ring-rose-200" : "bg-slate-50 hover:bg-indigo-50"}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white">
        {s.seat_number ?? "-"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800">
          {prefix}{s.first_name} {s.last_name}
          {s.nick_name && <span className="ml-1 font-normal text-slate-400">({s.nick_name})</span>}
        </p>
        <p className="truncate text-[11px] text-slate-400">
          {showClass && classLabel ? `${classLabel} · ` : ""}เลขที่ {s.seat_number ?? "-"}
          {s.student_code ? ` · ${s.student_code}` : ""}
        </p>
      </div>
      {isLate && <span className="shrink-0 text-[10px] font-black text-rose-500">มาสายแล้ว</span>}
    </button>
  );
}