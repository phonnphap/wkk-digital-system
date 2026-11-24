// app/homeroom/vp9/page.tsx
// วางคู่กับ Vp9Report.tsx ในโฟลเดอร์เดียวกัน: app/homeroom/vp9/Vp9Report.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getViewableClassrooms } from "@/lib/classrooms/getViewableClassrooms";
import Vp9Report from "./Vp9Report";

const supabase = createClient();

type Classroom = { classroom_id: string; room_name: string; room_number?: number };
type Student = {
  id: string; prefix?: string; first_name: string; last_name: string; seat_number: number; student_code?: string;
};

/* ===== ชื่อตาราง/คอลัมน์ — แก้ให้ตรงกับ Supabase จริง ===== */
const DB = {
  studentsTable: "students",
  studentRoomCol: "classroom_id",
  classroomsTable: "classrooms",   // ใช้หาครูประจำชั้นคนที่ 2
  classroomIdCol: "id",
  usersTable: "users",
  levelHeadRole: "level_head",     // ★ ค่าใน users.extra_roles ของ "หัวหน้าสายชั้น" (ยืนยันค่าจริงอีกครั้ง)
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function userDisplayName(u: any): string {
  if (!u) return "";
  const base = `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (base) return base;
  const full = u.full_name ?? u.name ?? u.display_name;
  return full ? String(full).trim() : "";
}
function hasRole(u: any, role: string): boolean {
  const r = u?.extra_roles;
  if (!r) return false;
  return Array.isArray(r) ? r.includes(role) : String(r).includes(role);
}

export default function HomeroomVp9Page() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [studentsByRoom, setStudentsByRoom] = useState<Record<string, Student[]>>({});
  const [myName, setMyName] = useState("");
  const [info, setInfo] = useState<{ teachers: string[]; head: string }>({ teachers: [], head: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1) ห้องที่ดูได้ (เหมือนหน้า ปพ.5) + นักเรียนทุกห้อง + ชื่อครูที่ล็อกอิน
  useEffect(() => {
    (async () => {
      const { classrooms: mine } = await getViewableClassrooms(supabase);
      const seen = new Set<string>();
      const list = (mine as Classroom[]).filter(c => (seen.has(c.classroom_id) ? false : (seen.add(c.classroom_id), true)));
      setClassrooms(list);

      const map: Record<string, Student[]> = {};
      if (list.length > 0) {
        const res = await supabase.from(DB.studentsTable).select("*")
          .in(DB.studentRoomCol, list.map(c => c.classroom_id));
        if (res.error) setError(res.error.message);
        (res.data ?? []).forEach((r: any) => {
          (map[r[DB.studentRoomCol]] ??= []).push({
            id: r.id,
            prefix: r.prefix ?? r.title ?? "",
            first_name: r.first_name,
            last_name: r.last_name,
            seat_number: r.seat_number ?? r.number ?? 0,
            student_code: r.student_code ?? r.student_number ?? r.student_no ?? undefined,
          });
        });
      }
      setStudentsByRoom(map);
      const first = list.find(c => (map[c.classroom_id]?.length ?? 0) > 0) ?? list[0];
      if (first) setSelected(first.classroom_id);
      setLoading(false);
    })();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from(DB.usersTable).select("*").eq("auth_id", user.id).maybeSingle();
      setMyName(userDisplayName(profile));
    })();
  }, []);

  const room = classrooms.find(c => c.classroom_id === selected);
  const students = useMemo(() => (selected ? studentsByRoom[selected] ?? [] : []), [selected, studentsByRoom]);
  const levelLabel = room?.room_name.includes("/") ? room.room_name.split("/")[0] : room?.room_name ?? "";

  // 2) ครูประจำชั้นคนอื่น + หัวหน้าสายชั้น — ดึงไม่ได้ก็ปล่อยให้กรอกเอง
  useEffect(() => {
    if (!selected) return;
    let active = true;
    (async () => {
      const teachers: string[] = [];
      let head = "";
      try {
        const { data: cr } = await supabase.from(DB.classroomsTable).select("*").eq(DB.classroomIdCol, selected).maybeSingle();
        const ids = new Set<string>();
        if (cr) {
          Object.entries(cr).forEach(([k, v]) => {
            if (!/teacher/i.test(k)) return;
            (Array.isArray(v) ? v : [v]).forEach(x => { if (typeof x === "string" && UUID.test(x)) ids.add(x); });
          });
        }
        if (ids.size > 0) {
          const { data: us } = await supabase.from(DB.usersTable).select("*").in("id", [...ids]);
          (us ?? []).forEach((u: any) => { const n = userDisplayName(u); if (n && !teachers.includes(n)) teachers.push(n); });
        }
      } catch { /* ข้าม */ }

      try {
        const { data: all } = await supabase.from(DB.usersTable).select("*").not("extra_roles", "is", null);
        let cands = (all ?? []).filter((u: any) => hasRole(u, DB.levelHeadRole));
        if (cands.length > 1) {
          const no = levelLabel.replace(/^ม\.?\s*/, "");
          const byLevel = cands.filter((u: any) =>
            Object.entries(u).some(([k, v]) => /level|grade/i.test(k) && v != null && [levelLabel, no].includes(String(v).trim())));
          if (byLevel.length >= 1) cands = byLevel;
        }
        if (cands.length === 1) head = userDisplayName(cands[0]);
      } catch { /* ข้าม */ }

      if (!active) return;
      setInfo({ teachers, head });
    })();
    return () => { active = false; };
  }, [selected, levelLabel]);

  // ชื่อครูที่ล็อกอินอยู่ต้องอยู่ในรายการเสมอ (และอยู่คนแรก)
  const teacherNames = useMemo(() => {
    const rest = info.teachers.filter(n => n !== myName);
    return (myName ? [myName, ...rest] : rest).slice(0, 2);
  }, [info.teachers, myName]);

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8 space-y-4">
      {/* สลับห้อง (เฉพาะกรณีดูได้หลายห้อง) — เทอม 1/2 สลับในหน้า วผ.9 เอง */}
      {classrooms.length > 1 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {classrooms.map(c => (
            <button key={c.classroom_id} onClick={() => setSelected(c.classroom_id)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                selected === c.classroom_id ? "bg-fuchsia-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              ห้อง {c.room_name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 print:hidden">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-slate-300 font-bold">กำลังโหลด...</div>
      ) : !room ? (
        <div className="text-center py-10 text-slate-400 font-bold">ยังไม่พบห้องที่คุณเป็นครูประจำชั้น</div>
      ) : (
        <Vp9Report
          key={room.classroom_id}
          classroomId={room.classroom_id}
          classroomLabel={room.room_name}
          students={students}
          homeroomTeacherNames={teacherNames}
          levelHeadName={info.head}
          onBack={() => router.push("/homeroom")}
        />
      )}
    </div>
  );
}