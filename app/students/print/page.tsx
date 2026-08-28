// app/students/print/page.tsx
"use client";

export const dynamic = "force-dynamic"; // ★ เพิ่ม: กัน error ตอน build จากการ prerender หน้าที่ใช้ useSearchParams()

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG } from "qrcode.react"; // ★ ต้องติดตั้ง: npm install qrcode.react
import { ArrowLeft, Printer, CheckSquare, Square } from "lucide-react";

const supabase = createClient();

// ★ แก้ให้ตรงกับระบบจริงถ้าจำเป็น
const SCHOOL_NAME = "โรงเรียนวัดเขียนเขต";
const SCHOOL_LOGO = "/school-logo.png";

type ClassroomInfo = {
  id: string;
  room_name: string;
  grade_group?: string | null;
  join_code: string | null;
  student_portal_enabled: boolean | null;
  student_access_mode: string | null; // "name_only" | "name_and_id" | "id_and_dob"
};

type Student = {
  id: string;
  seat_number: number | null;
  student_code: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
};

// ★ เหมือนกับ formatClassLabel ใน student-portal เพื่อให้ป้ายชั้นเรียนตรงกัน
function formatClassLabel(classroom: ClassroomInfo | null): string {
  if (!classroom) return "";
  const levelWord = (classroom.grade_group ?? "").trim();
  const roomCode = (classroom.room_name ?? "").trim();
  if (!levelWord && !roomCode) return "";
  const match = roomCode.match(/(\d+)\s*\/\s*(\d+)/);
  if (levelWord && match) {
    const [, year, room] = match;
    return `ชั้น${levelWord}ปีที่ ${year}/${room}`;
  }
  if (levelWord) return `ชั้น${levelWord}`;
  return roomCode;
}

export default function PrintStudentCardsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classroomId = searchParams.get("classroom") ?? "";

  const [classroom, setClassroom] = useState<ClassroomInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin); // ต้องอ่าน window ฝั่ง client เท่านั้น
  }, []);

  useEffect(() => {
    if (!classroomId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("classrooms")
        .select("id, room_name, grade_group, join_code, student_portal_enabled, student_access_mode")
        .eq("id", classroomId)
        .single(),
      supabase
        .from("students")
        .select("id, seat_number, student_code, prefix, first_name, last_name")
        .eq("classroom_id", classroomId)
        .order("seat_number"),
    ]).then(([classroomRes, studentsRes]) => {
      setClassroom((classroomRes.data as ClassroomInfo) ?? null);
      const list = (studentsRes.data as Student[]) ?? [];
      setStudents(list);
      setSelected(new Set(list.map((s) => s.id))); // ★ เลือกทุกคนไว้เป็นค่าเริ่มต้น
      setLoading(false);
    });
  }, [classroomId]);

  const classLabel = useMemo(() => formatClassLabel(classroom), [classroom]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))
    );
  }

  // ★ URL ที่ QR โค้ดจะพาไป: หน้า join จริงของระบบ อยู่ที่ app/join/[joinCode]/page.tsx
  // - โหมด id_and_dob: แนบรหัสนักเรียนมาให้ล่วงหน้า (?code=) เหลือให้นักเรียนกรอกแค่วันเกิด
  //   (หน้า JoinPage ต้องแก้ให้อ่าน ?code= แล้วเติมช่องรหัสนักเรียนอัตโนมัติ — ดูไฟล์แก้ไขที่แนบมาด้วย)
  // - โหมด name_only / name_and_id: หน้า JoinPage ยังไม่รองรับการแนบชื่อ/รหัสมาล่วงหน้า
  //   จึงพาไปแค่หน้า join เฉยๆ นักเรียนต้องเลือกชื่อเอง (ไม่ตรงกับที่ขอไว้ 100% แต่ใช้งานได้)
  function cardUrl(s: Student) {
    if (!classroom?.join_code) return "";
    const base = `${origin}/join/${classroom.join_code}`;
    if (classroom.student_access_mode === "id_and_dob") {
      return `${base}?code=${encodeURIComponent(s.student_code ?? "")}`;
    }
    return base;
  }

  const printList = students.filter((s) => selected.has(s.id));
  const missingJoinCode = !!classroomId && !loading && (!classroom?.join_code || !classroom?.student_portal_enabled);
  const isDobMode = classroom?.student_access_mode === "id_and_dob";
  const missingStudentCode = isDobMode && printList.some((s) => !s.student_code);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">ระบบดูแลนักเรียน</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
              พิมพ์การ์ดนักเรียน
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {classLabel || "เลือกห้องเรียน"} — เลือกนักเรียนที่ต้องการพิมพ์การ์ด แล้วกดพิมพ์
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              {selected.size === students.length ? (
                <CheckSquare className="h-4 w-4 text-indigo-500" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              เลือกทั้งหมด
            </button>
            <button
              onClick={() => window.print()}
              disabled={printList.length === 0 || missingJoinCode}
              className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              <Printer className="h-4 w-4" /> พิมพ์การ์ด ({printList.length})
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : !classroomId ? (
          <p className="py-16 text-center text-sm text-slate-400">ไม่พบห้องเรียนที่เลือก</p>
        ) : missingJoinCode ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            ⚠️ ห้องนี้ยังไม่ได้เปิดใช้งานระบบพอร์ทัลนักเรียน (student_portal_enabled) หรือยังไม่มีโค้ดเข้าห้อง (join_code)
            — กรุณาไปตั้งค่าที่หน้าตั้งค่าห้องเรียนก่อน แล้วค่อยกลับมาพิมพ์การ์ด
          </div>
        ) : students.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">ไม่พบนักเรียนในห้องนี้</p>
        ) : (
          <>
            {isDobMode && (
              <p className="mt-4 text-xs font-semibold text-indigo-500">
                ห้องนี้ตั้งค่าเป็นโหมด "รหัสนักเรียน + วันเกิด" — QR แต่ละใบจะแนบรหัสนักเรียนมาให้แล้ว
                นักเรียนสแกนแล้วกรอกแค่วันเกิดของตัวเอง
              </p>
            )}
            {missingStudentCode && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600">
                ⚠️ มีนักเรียนบางคนยังไม่มี "รหัสนักเรียน" ในระบบ QR ของคนนั้นจะใช้งานไม่ได้ กรุณาเพิ่มรหัสนักเรียนที่หน้าทะเบียนนักเรียนก่อน
              </div>
            )}
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {s.seat_number ?? "-"}. {s.prefix ?? ""}
                    {s.first_name} {s.last_name}
                    {isDobMode && !s.student_code && (
                      <span className="ml-1 text-rose-500">(ไม่มีรหัส นร.)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ★ พื้นที่สำหรับพิมพ์จริง: ซ่อนบนหน้าจอปกติ ไม่แสดงตอน preview เพื่อไม่ให้ซ้ำซ้อน */}
      <div className="hidden print:block">
        <div className="print-grid">
          {printList.map((s) => {
            const url = cardUrl(s);
            return (
              <div key={s.id} className="student-card">
                <div className="student-card-header">
                  <img src={SCHOOL_LOGO} alt="" className="student-card-logo" />
                  <span className="student-card-school">{SCHOOL_NAME}</span>
                </div>
                <div className="student-card-body">
                  <div className="student-card-qr">
                    {origin && url && <QRCodeSVG value={url} size={92} level="M" />}
                  </div>
                  <div className="student-card-info">
                    <p className="student-card-name">
                      {s.prefix ?? ""}
                      {s.first_name} {s.last_name}
                    </p>
                    <p className="student-card-meta">{classLabel}</p>
                    <p className="student-card-meta">เลขที่ {s.seat_number ?? "-"}</p>
                  </div>
                </div>
                <p className="student-card-hint">
                  สแกนเพื่อดูตารางเรียน / งานที่มอบหมาย{isDobMode ? " (ต้องกรอกวันเกิด)" : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            background: white !important;
          }
        }
        .print-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4mm;
        }
        .student-card {
          width: 90mm;
          height: 55mm;
          border: 1px solid #cbd5e1;
          border-radius: 4mm;
          padding: 4mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          page-break-inside: avoid;
          break-inside: avoid;
          font-family: "TH Sarabun New", sans-serif;
        }
        .student-card-header {
          display: flex;
          align-items: center;
          gap: 2mm;
        }
        .student-card-logo {
          width: 8mm;
          height: 8mm;
          object-fit: contain;
        }
        .student-card-school {
          font-size: 9pt;
          font-weight: 700;
          color: #334155;
        }
        .student-card-body {
          display: flex;
          align-items: center;
          gap: 4mm;
        }
        .student-card-qr {
          flex-shrink: 0;
        }
        .student-card-info {
          min-width: 0;
        }
        .student-card-name {
          font-size: 13pt;
          font-weight: 800;
          color: #1e293b;
          line-height: 1.2;
        }
        .student-card-meta {
          font-size: 10pt;
          color: #475569;
          margin-top: 1mm;
        }
        .student-card-hint {
          font-size: 7.5pt;
          color: #94a3b8;
          text-align: center;
        }
      `}</style>
    </div>
  );
}