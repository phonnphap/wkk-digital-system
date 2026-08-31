"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ScanLine, Search, Home, ArrowLeft, Undo2, Clock, CheckCircle2,
  Users, ClipboardList, AlertTriangle, X, Camera, Loader2,
} from "lucide-react";
import { getDisplayPrefix } from "@/lib/student-prefix";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Share2, Copy, Settings2, Lock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Zap } from "lucide-react";

const supabase = createClient();

const DASHBOARD_PATH = "/dashboard";
const DUTY_REPORT_PATH = "/duty-report/report"; 
const CAMERA_REGION_ID = "late-checkin-camera-region";

type ClassroomInfo = { room_name: string; grade_level: string | null } | null;

type Classroom = {
  classroom_id: string;
  room_name: string;
  room_number: number | null;
  grade_level: string | null;
};

type Student = {
  id: string;
  seat_number: number | null;
  student_code: string | null;
  national_id: string | null; // ★ เพิ่ม
  prefix: string | null;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  birth_date: string | null;
  gender: string | null;
  classroom_id: string;
  classroom?: ClassroomInfo; // ★ เพิ่ม — join มาเพื่อโชว์ ชั้น/ห้อง โดยไม่ต้อง query เพิ่ม
};

type LateEntry = {
  record_id: string;
  student: Student;
  room_name: string;
  recorded_at: string;
};

// ★ ใช้ select เดียวกันทุกจุด กันลืมฟิลด์ตกหล่น
const STUDENT_SELECT =
  "id, seat_number, student_code, national_id, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id, classroom:classrooms(room_name, grade_level:grade_group)";

  function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function timeThai(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("th-TH", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
    });
  } catch { return ""; }
}

// ★ "ม.1/1" — รวม grade_level + room_name แบบกันพลาดถ้าค่าใดค่าหนึ่งว่าง
function formatClassLabel(classroom?: ClassroomInfo) {
  if (!classroom) return "";
  const grade = classroom.grade_level ?? "";
  const room = classroom.room_name ?? "";
  if (grade && room) return `${grade}/${room}`;
  return grade || room;
}

export default function LateCheckinPage() {
  const router = useRouter();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [gradeLevel, setGradeLevel] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [scanValue, setScanValue] = useState("");
  const [query, setQuery] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [pendingStudent, setPendingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [lateToday, setLateToday] = useState<LateEntry[]>([]);
  const [loadingLate, setLoadingLate] = useState(true);
  const [myProfileId, setMyProfileId] = useState<string>("");

  // ── กล้องสแกนบาร์โค้ด/คิวอาร์ ─────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
const html5QrRef = useRef<Html5Qrcode | null>(null);
const scanHandledRef = useRef(false);
const [torchOn, setTorchOn] = useState(false);
const [torchSupported, setTorchSupported] = useState(false);

async function toggleTorch() {
  try {
    const qr = html5QrRef.current;
    if (!qr) return;
    const next = !torchOn;
    await qr.applyVideoConstraints({
      advanced: [{ torch: next } as any],
    });
    setTorchOn(next);
  } catch (err) {
    console.warn("เปิดไฟฉายไม่สำเร็จ:", err);
  }
}
  const [myRole, setMyRole] = useState<string>("");
const [settings, setSettings] = useState<{ council_enabled: boolean; open_time: string; close_time: string; share_token: string } | null>(null);
const [shareModalOpen, setShareModalOpen] = useState(false);
const [savingSettings, setSavingSettings] = useState(false);
const [openTimeDraft, setOpenTimeDraft] = useState("");
const [closeTimeDraft, setCloseTimeDraft] = useState("");

useEffect(() => {
  if (settings) {
    setOpenTimeDraft(settings.open_time?.slice(0, 5) ?? "");
    setCloseTimeDraft(settings.close_time?.slice(0, 5) ?? "");
  }
}, [settings]);

useEffect(() => {
  supabase.auth.getUser().then(async ({ data }) => {
    const user = data.user;
    if (!user) return;
    const { data: profile } = await supabase
      .from("users").select("id, role").eq("auth_id", user.id).maybeSingle();
    if (profile) { setMyProfileId(profile.id); setMyRole(profile.role ?? ""); }
  });
}, []);

async function loadSettings() {
  const { data } = await supabase.from("late_checkin_settings").select("*").eq("id", 1).maybeSingle();
  if (data) setSettings(data);
}
useEffect(() => { loadSettings(); }, []);

// ★ เฉพาะ role "council" เท่านั้นที่โดนล็อกเวลา — รปภ./ครูเวร/admin ใช้งานได้ตลอด
const isCouncilTimeLocked = useMemo(() => {
  if (myRole !== "council" || !settings) return false;
  if (!settings.council_enabled) return true;
  const now = new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Bangkok" });
  return now < settings.open_time || now > settings.close_time;
}, [myRole, settings]);

const shareUrl = useMemo(() => {
  if (!settings || typeof window === "undefined") return "";
  return `${window.location.origin}/late-checkin/council?token=${settings.share_token}`;
}, [settings]);

async function copyShareLink() {
  await navigator.clipboard.writeText(shareUrl);
  alert("คัดลอกลิงก์แล้ว");
}

async function saveSettings(patch: Partial<{ council_enabled: boolean; open_time: string; close_time: string }>) {
  setSavingSettings(true);
  const { error } = await supabase.from("late_checkin_settings").update(patch).eq("id", 1);
  setSavingSettings(false);
  if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); return; }
  loadSettings();
}

async function regenerateToken() {
  if (!confirm("สร้างลิงก์ใหม่? ลิงก์เก่าจะใช้ไม่ได้ทันที")) return;
  const { data, error } = await supabase.rpc("regenerate_council_share_token");
  if (error) { alert("ทำไม่สำเร็จ: " + error.message); return; }
  loadSettings();
}

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", user.id)
        .maybeSingle();
      if (profile) setMyProfileId(profile.id);
    });
  }, []);

  useEffect(() => {
  supabase
    .from("classrooms")
    .select("classroom_id:id, room_name, room_number, grade_level:grade_group")
    .order("grade_group")
    .order("room_number")
    .then(({ data, error }) => {
      if (error) { console.warn("[late-checkin] โหลดห้องเรียนไม่สำเร็จ:", error.message); return; }
      setClassrooms((data as unknown as Classroom[]) ?? []);
    });
}, []);

  const gradeLevels = useMemo(
    () => Array.from(new Set(classrooms.map((c) => c.grade_level).filter(Boolean))) as string[],
    [classrooms]
  );
  const roomsInGrade = useMemo(
    () => classrooms.filter((c) => c.grade_level === gradeLevel),
    [classrooms, gradeLevel]
  );

  useEffect(() => {
    if (!roomId) { setStudents([]); return; }
    setLoadingStudents(true);
    supabase
      .from("students")
      .select(STUDENT_SELECT)
      .eq("classroom_id", roomId)
      .order("seat_number")
      .then(({ data, error }) => {
        if (error) console.warn("[late-checkin] โหลดนักเรียนไม่สำเร็จ:", error.message);
        setStudents((data as unknown as Student[]) ?? []);
        setLoadingStudents(false);
      });
  }, [roomId]);

  async function loadLateToday() {
    setLoadingLate(true);
    const { data, error } = await supabase
  .from("attendance_records")
  .select(
    `id, recorded_at, student:students(id, seat_number, student_code, national_id, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id, classroom:classrooms(room_name, grade_level:grade_group))`
  )
  .eq("attendance_date", todayISO())
  .eq("status", "late")
  .order("recorded_at", { ascending: false });

    if (error) {
      console.warn("[late-checkin] โหลดรายการมาสายวันนี้ไม่สำเร็จ:", error.message);
      setLoadingLate(false);
      return;
    }

    const entries: LateEntry[] = (data ?? [])
      .filter((r: any) => r.student)
      .map((r: any) => ({
        record_id: r.id,
        student: r.student,
        room_name: formatClassLabel(r.student?.classroom) || "-",
        recorded_at: r.recorded_at,
      }));
    setLateToday(entries);
    setLoadingLate(false);
  }

  useEffect(() => { loadLateToday(); }, []);

  const [globalSearchResults, setGlobalSearchResults] = useState<Student[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (roomId || q.length < 2) { setGlobalSearchResults([]); return; }
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("students")
        .select(STUDENT_SELECT)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,nick_name.ilike.%${q}%,student_code.ilike.%${q}%`)
        .limit(20);
      if (error) { console.warn("[late-checkin] ค้นหานักเรียนไม่สำเร็จ:", error.message); return; }
      setGlobalSearchResults((data as unknown as Student[]) ?? []);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, roomId]);

  const filteredRoomStudents = useMemo(() => {
    if (!query.trim()) return students;
    const q = query.trim().toLowerCase();
    return students.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.nick_name ?? ""} ${s.student_code ?? ""}`.toLowerCase().includes(q)
    );
  }, [students, query]);

  const alreadyLateIds = useMemo(() => new Set(lateToday.map((e) => e.student.id)), [lateToday]);

  // ── ค้นหานักเรียนกลาง: รองรับทั้งรหัสนักเรียน (student_code) และเลขบัตร ปชช. (national_id) ──
  async function findStudentByCode(code: string) {
    return supabase
      .from("students")
      .select(STUDENT_SELECT)
      .or(`student_code.eq.${code},national_id.eq.${code}`)
      .maybeSingle();
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = scanValue.trim();
    if (!code) return;
    setErrorMsg("");
    const { data, error } = await findStudentByCode(code);
    setScanValue("");
    if (error || !data) {
      setErrorMsg(`ไม่พบนักเรียนรหัส/เลขบัตร "${code}" ในระบบ กรุณาตรวจสอบอีกครั้ง`);
      return;
    }
    setPendingStudent(data as unknown as Student);
  }

  useEffect(() => {
    if (!pendingStudent && !scannerOpen) scanInputRef.current?.focus();
  }, [pendingStudent, scannerOpen]);

  // ── เปิด/ปิดกล้องสแกน ────────────────────────────────────
  useEffect(() => {
    if (!scannerOpen) return;
    scanHandledRef.current = false;
    setCameraError("");
    setCameraStarting(true);

    const qr = new Html5Qrcode(CAMERA_REGION_ID, {
  formatsToSupport: [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.ITF,
  ],
  verbose: false,
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true, // ใช้ native API ของเบราว์เซอร์ถ้ารองรับ เร็ว/แม่นกว่า wasm มาก
  },
});
    html5QrRef.current = qr;

    qr.start(
      { facingMode: "environment" }, // กล้องหลังของมือถือ
      { fps: 10, qrbox: { width: 260, height: 160 } },
      (decodedText) => {
        if (scanHandledRef.current) return; // กันยิงซ้ำหลายเฟรมติดกัน
        scanHandledRef.current = true;
        handleScannedCode(decodedText);
      },
      () => { /* เฟรมที่อ่านไม่ออก ไม่ต้องแจ้ง error รัว ๆ */ }
    )
      .then(() => setCameraStarting(false))
      .then(() => {
  setCameraStarting(false);
  try {
    const capabilities = qr.getRunningTrackCameraCapabilities();
    setTorchSupported(!!(capabilities as any)?.torchFeature?.()?.isSupported?.());
  } catch { setTorchSupported(false); }
})
      .catch((err) => {
        setCameraStarting(false);
        setCameraError(
          "เปิดกล้องไม่สำเร็จ: กรุณาอนุญาตสิทธิ์กล้อง (Camera permission) และตรวจสอบว่าเข้าเว็บผ่าน HTTPS — " +
          String(err)
        );
      });

    return () => {
      const current = html5QrRef.current;
      html5QrRef.current = null;
      if (current) {
        current.stop().then(() => current.clear()).catch(() => { /* ปิดไปแล้วก็ไม่เป็นไร */ });
      }
    };
  }, [scannerOpen]);

  async function handleScannedCode(rawText: string) {
    const digitsOnly = rawText.replace(/\D/g, "");
    const code = digitsOnly.length >= 5 ? digitsOnly : rawText.trim(); // เผื่อบาร์โค้ดเป็นตัวอักษรผสม
    setScannerOpen(false); // ปิดกล้องทันทีที่อ่านได้ ป้องกันสแกนซ้ำ
    setErrorMsg("");

    const { data, error } = await findStudentByCode(code);
    if (error || !data) {
      setErrorMsg(`ไม่พบนักเรียนจากบาร์โค้ด "${rawText}" ในระบบ กรุณาตรวจสอบบัตรอีกครั้ง`);
      return;
    }
    setPendingStudent(data as unknown as Student);
  }

  async function markLate(student: Student) {
    setSaving(true);
    setErrorMsg("");

    const { data: savedRows, error } = await supabase
      .from("attendance_records")
      .upsert(
        {
          student_id: student.id,
          classroom_id: student.classroom_id,
          attendance_date: todayISO(),
          status: "late",
          recorded_source: "gate_scan",
          recorded_by: myProfileId || null,
          recorded_at: new Date().toISOString(),
        },
        { onConflict: "student_id,attendance_date" }
      )
      .select();

    setSaving(false);

    if (error) {
      setErrorMsg("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    if (!savedRows || savedRows.length === 0) {
      setErrorMsg("ไม่สามารถบันทึกได้ — ระบบไม่พบสิทธิ์ในการบันทึก กรุณาตรวจสอบ RLS policy ของตาราง attendance_records");
      return;
    }

    setPendingStudent(null);
    setQuery("");
    loadLateToday();
  }

  async function undoLate(recordId: string) {
    if (!confirm("ยืนยันยกเลิกสถานะ 'มาสาย' รายการนี้?")) return;
    const { data: deletedRows, error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", recordId)
      .select();
    if (error) { alert("ยกเลิกไม่สำเร็จ: " + error.message); return; }
    if (!deletedRows || deletedRows.length === 0) {
      alert("ไม่สามารถยกเลิกได้ — ระบบไม่พบสิทธิ์ในการแก้ไขรายการนี้");
      return;
    }
    loadLateToday();
  }

  const summaryByRoom = useMemo(() => {
    const map = new Map<string, number>();
    lateToday.forEach((e) => map.set(e.room_name, (map.get(e.room_name) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [lateToday]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <Home className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">งานเวรประจำวัน</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
              บันทึกนักเรียนมาสาย
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              สแกนบัตร พิมพ์ชื่อ หรือเลือกชั้น/ห้อง เพื่อบันทึกนักเรียนที่มาสายหน้าโรงเรียน
            </p>
          </div>
          <button
            onClick={() => router.push(DUTY_REPORT_PATH)}
            className="flex items-center gap-1.5 rounded-2xl border-2 border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-md"
          >
            <ClipboardList className="h-4 w-4" /> รายงานเวรประจำวัน
          </button>
          <button
  onClick={() => setShareModalOpen(true)}
  className="flex items-center gap-1.5 rounded-2xl border-2 border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md"
>
  <Share2 className="h-4 w-4" /> แชร์ให้สภานักเรียน
</button>
        </div>

        
        {errorMsg && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
  {isCouncilTimeLocked ? (
    <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto h-8 w-8 text-amber-500" />
      <p className="mt-2 text-sm font-bold text-amber-700">
        ระบบนี้ปิดสำหรับสภานักเรียนในขณะนี้
      </p>
      <p className="mt-1 text-xs text-amber-600">
        {settings?.council_enabled
          ? `เปิดให้ใช้งานเวลา ${settings?.open_time?.slice(0, 5)} - ${settings?.close_time?.slice(0, 5)} น.`
          : "ปิดใช้งานชั่วคราวโดยแอดมิน"}
      </p>
    </div>
  ) : (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          onSubmit={handleScanSubmit}
          className="flex flex-1 items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-sm">
            <ScanLine className="h-5 w-5" />
          </span>
          <input
            ref={scanInputRef}
            autoFocus
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            placeholder="สแกนบาร์โค้ด (เครื่องสแกน USB) หรือพิมพ์รหัส/เลขบัตร ปชช. แล้วกด Enter"
            className="w-full border-none bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />
        </form>

        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="flex shrink-0 items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-4 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-lg sm:w-auto"
        >
          <Camera className="h-5 w-5" /> เปิดกล้องสแกน
        </button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-3 py-2.5 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="พิมพ์ค้นหาชื่อ นามสกุล ชื่อเล่น หรือรหัสนักเรียน..."
            className="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {gradeLevels.map((g) => (
            <button
              key={g}
              onClick={() => { setGradeLevel(g); setRoomId(""); setQuery(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                gradeLevel === g
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
              }`}
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
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  roomId === r.classroom_id
                    ? "bg-sky-500 text-white shadow-sm"
                    : "bg-slate-50 text-slate-500 ring-1 ring-slate-200 hover:bg-sky-50 hover:text-sky-600"
                }`}
              >
                {r.room_name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {loadingStudents ? (
            <p className="col-span-full py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
          ) : roomId ? (
            filteredRoomStudents.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียนที่ตรงกับคำค้นหา</p>
            ) : (
              filteredRoomStudents.map((s) => (
                <StudentPickRow key={s.id} student={s} isLate={alreadyLateIds.has(s.id)} showClass={false} onPick={() => setPendingStudent(s)} />
              ))
            )
          ) : query.trim().length >= 2 ? (
            globalSearchResults.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียนที่ตรงกับคำค้นหา</p>
            ) : (
              globalSearchResults.map((s) => (
                <StudentPickRow key={s.id} student={s} isLate={alreadyLateIds.has(s.id)} showClass onPick={() => setPendingStudent(s)} />
              ))
            )
          ) : (
            <p className="col-span-full py-6 text-center text-sm text-slate-400">
              เลือกระดับชั้น/ห้อง หรือพิมพ์ค้นหาชื่อนักเรียน (อย่างน้อย 2 ตัวอักษร)
            </p>
          )}
        </div>
      </div>
    </>
  )}
</div>

          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
  <p className="text-sm font-extrabold text-slate-800">สแกนบัตรนักเรียน</p>
  <div className="flex items-center gap-2">
    {torchSupported && (
      <button
        onClick={toggleTorch}
        className={`rounded-xl p-1.5 ${torchOn ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:bg-slate-100"}`}
        title="เปิด/ปิดไฟฉาย"
      >
        <Zap className="h-4 w-4" />
      </button>
    )}
    <button onClick={() => setScannerOpen(false)}><X className="h-4 w-4" /></button>
  </div>
</div>
              <div className="mt-3 max-h-[26rem] space-y-1.5 overflow-y-auto">
                {loadingLate ? (
                  <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
                ) : lateToday.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีนักเรียนมาสายวันนี้</p>
                ) : (
                  lateToday.map((e) => {
                    const displayPrefix = getDisplayPrefix(e.student.gender, e.student.birth_date, e.student.prefix);
                    return (
                      <div key={e.record_id} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-slate-700">
                            {displayPrefix}{e.student.first_name} {e.student.last_name}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {e.room_name} · เลขที่ {e.student.seat_number ?? "-"} · {timeThai(e.recorded_at)} น.
                          </p>
                        </div>
                        <button
                          onClick={() => undoLate(e.record_id)}
                          title="ยกเลิกรายการนี้"
                          className="shrink-0 rounded-xl p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {summaryByRoom.length > 0 && (
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                  <Users className="h-4 w-4 text-indigo-500" /> สรุปตามห้อง
                </p>
                <div className="mt-3 space-y-1.5">
                  {summaryByRoom.map(([room, count]) => (
                    <div key={room} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{room}</span>
                      <span className="font-bold text-slate-700">{count} คน</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── โมดัลกล้องสแกน ─────────────────────────────────── */}
        {scannerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                  <Camera className="h-4 w-4 text-indigo-500" /> สแกนบาร์โค้ด/คิวอาร์บัตรนักเรียน
                </p>
                <button
                  onClick={() => setScannerOpen(false)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-2xl bg-slate-900">
                <div id={CAMERA_REGION_ID} className="w-full" />
                {cameraStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2 text-sm">กำลังเปิดกล้อง...</span>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{cameraError}</p>
              )}
              <p className="mt-3 text-center text-xs text-slate-400">
                วางบาร์โค้ด/คิวอาร์บนบัตรนักเรียนให้อยู่ในกรอบ ระบบจะบันทึกอัตโนมัติเมื่ออ่านสำเร็จ
              </p>
            </div>
          </div>
        )}
        {shareModalOpen && settings && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
          <Share2 className="h-4 w-4 text-emerald-500" /> ลิงก์สำหรับสภานักเรียน
        </p>
        <button onClick={() => setShareModalOpen(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex justify-center rounded-2xl bg-slate-50 p-4">
        <QRCodeSVG value={shareUrl} size={180} />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <p className="flex-1 truncate text-xs text-slate-500">{shareUrl}</p>
        <button onClick={copyShareLink} className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-white">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-400">
        ให้สภานักเรียนสแกน QR หรือกดลิงก์นี้ ไม่ต้องล็อกอิน — ใช้ได้เฉพาะช่วงเวลาที่กำหนดด้านล่าง
      </p>

      {/* ตั้งค่าเปิด/ปิด + ช่วงเวลา (แสดงให้ทุกคนเห็น แต่บันทึกได้เฉพาะ admin ผ่าน RLS) */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <Settings2 className="h-3.5 w-3.5" /> เปิดใช้งานสำหรับสภา
          </p>
          <button
            onClick={() => saveSettings({ council_enabled: !settings.council_enabled })}
            disabled={savingSettings}
            className={`h-6 w-11 rounded-full transition ${settings.council_enabled ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${settings.council_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-slate-400">เปิดเวลา</label>
            <input
  type="time"
  value={openTimeDraft}
  onChange={(e) => setOpenTimeDraft(e.target.value)}
  onBlur={() => { if (/^\d{2}:\d{2}$/.test(openTimeDraft)) saveSettings({ open_time: openTimeDraft + ":00" }); }}
  className="w-full rounded-xl border-2 border-slate-200 px-2 py-1.5 text-sm"
/>
          </div>
          <div>
            <label className="text-[11px] text-slate-400">ปิดเวลา</label>
            <input
  type="time"
  value={closeTimeDraft}
  onChange={(e) => setCloseTimeDraft(e.target.value)}
  onBlur={() => { if (/^\d{2}:\d{2}$/.test(closeTimeDraft)) saveSettings({ close_time: closeTimeDraft + ":00" }); }}
  className="w-full rounded-xl border-2 border-slate-200 px-2 py-1.5 text-sm"
/>
          </div>
        </div>

        <button
          onClick={regenerateToken}
          className="w-full rounded-xl border-2 border-rose-200 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50"
        >
          สร้างลิงก์ใหม่ (ยกเลิกลิงก์เก่า)
        </button>
      </div>
    </div>
  </div>
)}

        {/* ── โมดัลยืนยันก่อนบันทึกเสมอ ───────────────── */}
        {pendingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-500">
                <Clock className="h-7 w-7" />
              </span>
              <p className="mt-4 text-sm text-slate-400">ยืนยันบันทึกว่านักเรียนคนนี้มาสาย</p>
              <p className="mt-1 text-lg font-extrabold text-slate-800">
                {getDisplayPrefix(pendingStudent.gender, pendingStudent.birth_date, pendingStudent.prefix)}
                {pendingStudent.first_name} {pendingStudent.last_name}
              </p>
              {pendingStudent.nick_name && <p className="text-sm text-slate-400">({pendingStudent.nick_name})</p>}
              {/* ★ แสดง ชั้น/ห้อง + เลขที่ ให้ชัดเจนก่อนยืนยัน */}
              <p className="mt-1 text-sm font-semibold text-indigo-600">
                {formatClassLabel(pendingStudent.classroom) || "ไม่ระบุห้อง"} · เลขที่ {pendingStudent.seat_number ?? "-"}
              </p>
              {alreadyLateIds.has(pendingStudent.id) && (
                <p className="mt-2 text-xs font-bold text-amber-600">⚠️ นักเรียนคนนี้ถูกบันทึกว่ามาสายไปแล้ววันนี้</p>
              )}
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => setPendingStudent(null)}
                  className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => markLate(pendingStudent)}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "กำลังบันทึก..." : "ยืนยันมาสาย"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentPickRow({
  student, isLate, showClass, onPick,
}: { student: Student; isLate: boolean; showClass: boolean; onPick: () => void }) {
  const displayPrefix = getDisplayPrefix(student.gender, student.birth_date, student.prefix);
  const classLabel = formatClassLabel(student.classroom);
  return (
    <button
      onClick={onPick}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
        isLate ? "bg-rose-50 ring-1 ring-rose-200" : "bg-slate-50 hover:bg-indigo-50"
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white">
        {student.seat_number ?? "-"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800">
          {displayPrefix}{student.first_name} {student.last_name}
          {student.nick_name && <span className="ml-1 font-normal text-slate-400">({student.nick_name})</span>}
        </p>
        {/* ★ แสดง ชั้น/ห้อง (เมื่อเป็นผลค้นหาข้ามห้อง) + เลขที่ เป็นข้อความชัดเจน */}
        <p className="truncate text-[11px] text-slate-400">
          {showClass && classLabel ? `${classLabel} · ` : ""}เลขที่ {student.seat_number ?? "-"}
          {student.student_code ? ` · ${student.student_code}` : ""}
        </p>
      </div>
      {isLate && <span className="shrink-0 text-[10px] font-black text-rose-500">มาสายแล้ว</span>}
    </button>
  );
}