// app/late-checkin/page.tsx
// ══════════════════════════════════════════════════════════
// ระบบบันทึกนักเรียนมาสาย (Late Attendance Module)
// ★ สร้างโดยอ้างอิงดีไซน์/แพทเทิร์นเดียวกับ app/students/page.tsx (การ์ดโค้งมน,
//   สี indigo→blue, ปุ่ม Home/กลับ) และ app/dashboard/page.tsx (การเชื่อมกับ
//   ตาราง attendance_records ที่มี status: "present" / "late" / "leave" / "absent"
//   ตามที่ระบุไว้ในคอมเมนต์ของหน้าแดชบอร์ด)
//
// หน้านี้ออกแบบให้ "สภานักเรียน" และ "ครูเวรประจำวัน" ใช้งานหน้าประตูโรงเรียนได้เร็ว:
//   1) สแกนบาร์โค้ด/คิวอาร์บัตรนักเรียน (เลขประจำตัว 13 หลัก) → ขึ้นชื่อ + บันทึกสาย
//   2) พิมพ์ค้นหาชื่อ-นามสกุล
//   3) เลือกระดับชั้น → ห้อง → คลิกเลือกจากรายชื่อ
//   4) มีปุ่มยืนยันก่อนบันทึกเสมอ + สามารถลบ/ยกเลิกสถานะที่บันทึกผิดได้ทันที
//
// ตารางที่ต้องมี (โปรดสร้าง/ตรวจสอบใน Supabase ก่อนใช้งานจริง):
//
//   attendance_records
//     id                uuid primary key default gen_random_uuid()
//     student_id        uuid references students(id)
//     classroom_id      uuid references classrooms(classroom_id)
//     attendance_date   date not null
//     status            text not null   -- 'present' | 'late' | 'leave' | 'absent'
//     recorded_by       uuid references users(id)
//     recorded_at       timestamptz default now()
//     note              text
//     unique (student_id, attendance_date)   -- ★ กันบันทึกซ้ำวันเดียวกัน ใช้ทำ upsert
//
//   classrooms ต้องมีคอลัมน์ grade_level (เช่น "ม.1") เพิ่มจากที่มีอยู่แล้ว
//   (classroom_id, room_name, room_number) เพื่อใช้กรองตามระดับชั้นในหน้านี้
//
// ตัวอย่าง RLS ที่ต้องเพิ่ม (รันใน Supabase SQL editor) — อนุญาตให้ครูเวร/สภานักเรียน
// ที่ล็อกอินแล้ว บันทึก/แก้ไข attendance_records ของ "วันนี้" ได้ทุกห้อง (ไม่ใช่แค่ห้องตัวเอง
// เหมือนครูประจำชั้น) เพราะงานเวรหน้าประตูต้องเห็นนักเรียนทุกห้อง:
//
//   create policy "duty staff can upsert today's attendance"
//     on attendance_records for all
//     using (attendance_date = current_date)
//     with check (attendance_date = current_date);
//
// ★ ส่วนการหักคะแนนความประพฤติอัตโนมัติ (ระเบียบฯ ข้อ 2.10) และแจ้งเตือนผู้ปกครองผ่าน
//   Line/SMS ยังไม่มีตารางจริงให้อ้างอิง จึงทำเป็น "hook" แบบ non-blocking ไว้ในฟังก์ชัน
//   markLate() ด้านล่าง — ถ้ามีตาราง behavior_score_logs / notification_queue แล้ว
//   ให้แก้ตรงจุดที่คอมเมนต์ TODO ไว้เพิ่มเติมได้เลย โดยไม่กระทบ flow หลัก
// ══════════════════════════════════════════════════════════

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ScanLine, Search, Home, ArrowLeft, Undo2, Clock, CheckCircle2,
  Users, ClipboardList, AlertTriangle, X,
} from "lucide-react";
import { getDisplayPrefix } from "@/lib/student-prefix";

const supabase = createClient();

const DASHBOARD_PATH = "/dashboard";
const DUTY_REPORT_PATH = "/duty-report"; // ★ ลิงก์ไปหน้ารายงานเวรประจำวันที่มีอยู่แล้ว ไม่สร้างซ้ำ

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
  prefix: string | null;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  birth_date: string | null;
  gender: string | null;
  classroom_id: string;
};

type LateEntry = {
  record_id: string;
  student: Student;
  room_name: string;
  recorded_at: string;
};

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

  const [pendingStudent, setPendingStudent] = useState<Student | null>(null); // ★ รอยืนยันก่อนบันทึก
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [lateToday, setLateToday] = useState<LateEntry[]>([]);
  const [loadingLate, setLoadingLate] = useState(true);
  const [myProfileId, setMyProfileId] = useState<string>("");

  // ── โหลดผู้ใช้ปัจจุบัน (ใช้บันทึก recorded_by) ─────────────────────
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

  // ── โหลดรายชื่อห้องทั้งหมด (ทุกระดับชั้น เพราะครูเวร/สภา นร. ต้องเห็นทุกห้อง) ──
  useEffect(() => {
    supabase
      .from("classrooms")
      .select("classroom_id, room_name, room_number, grade_level")
      .order("grade_level")
      .order("room_number")
      .then(({ data, error }) => {
        if (error) { console.warn("[late-checkin] โหลดห้องเรียนไม่สำเร็จ:", error.message); return; }
        setClassrooms(data ?? []);
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

  // ── โหลดนักเรียนของห้องที่เลือก ─────────────────────────────
  useEffect(() => {
    if (!roomId) { setStudents([]); return; }
    setLoadingStudents(true);
    supabase
      .from("students")
      .select("id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id")
      .eq("classroom_id", roomId)
      .order("seat_number")
      .then(({ data, error }) => {
        if (error) console.warn("[late-checkin] โหลดนักเรียนไม่สำเร็จ:", error.message);
        setStudents(data ?? []);
        setLoadingStudents(false);
      });
  }, [roomId]);

  // ── โหลดรายการที่ "มาสายวันนี้" ทั้งโรงเรียน (สำหรับพาเนลด้านขวา + สรุปยอด) ──
  async function loadLateToday() {
    setLoadingLate(true);
    const { data, error } = await supabase
      .from("attendance_records")
      .select(
        "id, recorded_at, student:students(id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id, classroom:classrooms(room_name))"
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
        room_name: r.student?.classroom?.room_name ?? "-",
        recorded_at: r.recorded_at,
      }));
    setLateToday(entries);
    setLoadingLate(false);
  }

  useEffect(() => { loadLateToday(); }, []);

  // ── ค้นหาด้วยการพิมพ์ชื่อ (กรองจากห้องที่เลือกอยู่ ถ้ายังไม่เลือกห้องจะค้นหาทั้งโรงเรียน) ──
  const [globalSearchResults, setGlobalSearchResults] = useState<Student[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (roomId || q.length < 2) { setGlobalSearchResults([]); return; }
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,nick_name.ilike.%${q}%,student_code.ilike.%${q}%`)
        .limit(20);
      if (error) { console.warn("[late-checkin] ค้นหานักเรียนไม่สำเร็จ:", error.message); return; }
      setGlobalSearchResults(data ?? []);
    }, 300); // debounce กันยิง query ถี่เกินไปตอนพิมพ์
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

  // ── สแกนบาร์โค้ด/คิวอาร์: รหัส นร. 13 หลัก + Enter → ค้นหาแล้วเปิดยืนยันทันที ──
  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = scanValue.trim();
    if (!code) return;
    setErrorMsg("");
    const { data, error } = await supabase
      .from("students")
      .select("id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, classroom_id")
      .eq("student_code", code)
      .maybeSingle();
    setScanValue("");
    if (error || !data) {
      setErrorMsg(`ไม่พบนักเรียนรหัส "${code}" ในระบบ กรุณาตรวจสอบบัตรอีกครั้ง`);
      return;
    }
    setPendingStudent(data);
  }

  // ★ auto-focus ช่องสแกนไว้เสมอ เพื่อให้เครื่องสแกนบาร์โค้ด (ทำงานเหมือนพิมพ์คีย์บอร์ด + Enter)
  //   ยิงเข้าช่องนี้ได้ตลอดโดยไม่ต้องคลิกเลือกก่อน
  useEffect(() => {
    if (!pendingStudent) scanInputRef.current?.focus();
  }, [pendingStudent]);

  // ── บันทึกสถานะ "มาสาย" (มีปุ่มยืนยันเสมอตามข้อกำหนดป้องกันการกดผิด) ──
  async function markLate(student: Student) {
    setSaving(true);
    setErrorMsg("");

    // upsert กันบันทึกซ้ำวันเดียวกัน (ใช้ unique constraint (student_id, attendance_date))
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

    // ★ TODO hook: หักคะแนนความประพฤติอัตโนมัติตามระเบียบฯ ข้อ 2.10 เมื่อมีตาราง
    //   behavior_score_logs แล้ว ให้ insert ตรงนี้ — ทำแบบ non-blocking (ไม่ throw)
    //   เพื่อไม่ให้การบันทึกมาสายล้มเหลวถ้าขั้นตอนนี้มีปัญหา
    // try {
    //   await supabase.from("behavior_score_logs").insert({
    //     student_id: student.id, points: -1, reason: "มาโรงเรียนสาย (ข้อ 2.10)",
    //     related_type: "attendance_records", related_id: savedRows[0].id,
    //   });
    // } catch (e) { console.warn("[late-checkin] หักคะแนนความประพฤติไม่สำเร็จ:", e); }

    // ★ TODO hook: ส่งแจ้งเตือนผู้ปกครองผ่าน Line/SMS เมื่อมีระบบคิวข้อความแล้ว
    // try { await fetch("/api/notify/guardian", { method: "POST", body: JSON.stringify({ studentId: student.id, kind: "late" }) }); }
    // catch (e) { console.warn("[late-checkin] แจ้งเตือนผู้ปกครองไม่สำเร็จ:", e); }

    setPendingStudent(null);
    setQuery("");
    loadLateToday();
  }

  // ── ยกเลิก/ลบสถานะมาสายที่บันทึกผิดพลาด ─────────────────────
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

  // ── สรุปยอดมาสายแยกตามห้อง (ใช้โชว์แถบสรุปด้านล่าง สำหรับงานเวร/ฝ่ายปกครอง) ──
  const summaryByRoom = useMemo(() => {
    const map = new Map<string, number>();
    lateToday.forEach((e) => map.set(e.room_name, (map.get(e.room_name) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [lateToday]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน */}
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
        </div>

        {errorMsg && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* ── ฝั่งซ้าย: สแกน/ค้นหา/เลือกห้อง (กินพื้นที่ 2 คอลัมน์) ───────── */}
          <div className="lg:col-span-2 space-y-5">
            {/* ช่องสแกนบาร์โค้ด/คิวอาร์ */}
            <form
              onSubmit={handleScanSubmit}
              className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-sm">
                <ScanLine className="h-5 w-5" />
              </span>
              <input
                ref={scanInputRef}
                autoFocus
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="สแกนบาร์โค้ด/คิวอาร์บัตรนักเรียน (เลขประจำตัว 13 หลัก) แล้วกด Enter"
                className="w-full border-none bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </form>

            {/* ค้นหาด้วยชื่อ + เลือกชั้น/ห้อง */}
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

              {/* รายชื่อนักเรียนให้คลิกเลือก */}
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {loadingStudents ? (
                  <p className="col-span-full py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
                ) : roomId ? (
                  filteredRoomStudents.length === 0 ? (
                    <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียนที่ตรงกับคำค้นหา</p>
                  ) : (
                    filteredRoomStudents.map((s) => (
                      <StudentPickRow key={s.id} student={s} isLate={alreadyLateIds.has(s.id)} onPick={() => setPendingStudent(s)} />
                    ))
                  )
                ) : query.trim().length >= 2 ? (
                  globalSearchResults.length === 0 ? (
                    <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่พบนักเรียนที่ตรงกับคำค้นหา</p>
                  ) : (
                    globalSearchResults.map((s) => (
                      <StudentPickRow key={s.id} student={s} isLate={alreadyLateIds.has(s.id)} onPick={() => setPendingStudent(s)} />
                    ))
                  )
                ) : (
                  <p className="col-span-full py-6 text-center text-sm text-slate-400">
                    เลือกระดับชั้น/ห้อง หรือพิมพ์ค้นหาชื่อนักเรียน (อย่างน้อย 2 ตัวอักษร)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── ฝั่งขวา: รายการมาสายวันนี้ + สรุปยอด ───────────────────── */}
          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                  <Clock className="h-4 w-4 text-rose-500" /> มาสายวันนี้ ({lateToday.length} คน)
                </p>
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
                            {e.room_name} · {timeThai(e.recorded_at)} น.
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

        {/* ── โมดัลยืนยันก่อนบันทึกเสมอ (ป้องกันการกดผิด) ───────────────── */}
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

function StudentPickRow({ student, isLate, onPick }: { student: Student; isLate: boolean; onPick: () => void }) {
  const displayPrefix = getDisplayPrefix(student.gender, student.birth_date, student.prefix);
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
        <p className="truncate text-[11px] text-slate-400">{student.student_code}</p>
      </div>
      {isLate && <span className="shrink-0 text-[10px] font-black text-rose-500">มาสายแล้ว</span>}
    </button>
  );
}