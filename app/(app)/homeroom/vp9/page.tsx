// app/homeroom/vp9/page.tsx
// วางคู่กับ Vp9Report.tsx ในโฟลเดอร์เดียวกัน: app/homeroom/vp9/Vp9Report.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Vp9Report from "./Vp9Report";

const supabase = createClient();

type Classroom = { classroom_id: string; room_name: string };
type Student = {
  id: string; prefix?: string; first_name: string; last_name: string; seat_number: number; student_code?: string;
};

/* ===== ชื่อตาราง/คอลัมน์นักเรียน — แก้ให้ตรงกับ Supabase จริง ===== */
const DB = {
  studentsTable: "students",
  studentRoomCol: "classroom_id",
};

function userDisplayName(u: any): string {
  if (!u) return "";
  const base = `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (base) return base;
  const full = u.full_name ?? u.name ?? u.display_name;
  return full ? String(full).trim() : "";
}

export default function HomeroomVp9Page() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [myName, setMyName] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ห้องที่เป็นครูประจำชั้น + ชื่อครูที่ล็อกอิน
  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data, error }: { data: Classroom[] | null; error: any }) => {
      if (error) setError(error.message);
      const list = data ?? [];
      setClassrooms(list);
      if (list.length > 0) setSelected(list[0].classroom_id);
      setLoadingRooms(false);
    });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("users").select("*").eq("auth_id", user.id).maybeSingle();
      setMyName(userDisplayName(profile));
    })();
  }, []);

  // นักเรียนของห้องที่เลือก
  useEffect(() => {
    if (!selected) return;
    let active = true;
    (async () => {
      setLoadingStudents(true);
      const { data, error } = await supabase
        .from(DB.studentsTable).select("*").eq(DB.studentRoomCol, selected);
      if (!active) return;
      if (error) { setError(error.message); setStudents([]); }
      else {
        setError(null);
        setStudents((data ?? []).map((r: any): Student => ({
          id: r.id,
          prefix: r.prefix ?? r.title ?? "",
          first_name: r.first_name,
          last_name: r.last_name,
          seat_number: r.seat_number ?? r.number ?? 0,
          student_code: r.student_code ?? r.student_number ?? r.student_no ?? undefined,
        })));
      }
      setLoadingStudents(false);
    })();
    return () => { active = false; };
  }, [selected]);

  const room = classrooms.find(c => c.classroom_id === selected);

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8 space-y-4">
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

      {loadingRooms || loadingStudents ? (
        <div className="text-center py-10 text-slate-300 font-bold">กำลังโหลด...</div>
      ) : !room ? (
        <div className="text-center py-10 text-slate-400 font-bold">ยังไม่พบห้องที่คุณเป็นครูประจำชั้น</div>
      ) : (
        <Vp9Report
          key={room.classroom_id}
          classroomId={room.classroom_id}
          classroomLabel={room.room_name}
          students={students}
          homeroomTeacherNames={myName ? [myName] : []}
          onBack={() => router.push("/homeroom")}
        />
      )}
    </div>
  );
}