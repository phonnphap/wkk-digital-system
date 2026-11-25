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
  gradeCol: "grade_level",         // สายชั้นของครู
  gradeHeadRole: "grade_head",     // ค่าใน users.extra_roles ของ หัวหน้าสายชั้น
  principalEmail: "thananut@khienkhet.ac.th", // ผอ. — ดึงลายเซ็นจากแถว users ของอีเมลนี้
  signatureBucket: "signatures",   // ★ bucket ใน Storage (ใช้เฉพาะเมื่อค่าลายเซ็นเป็น path ไม่ใช่ URL) — แก้ให้ตรงของจริง
};
const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [studentsByRoom, setStudentsByRoom] = useState<Record<string, Student[]>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [termOf, setTermOf] = useState<Record<string, string>>({}); // classroom_id -> เทอม (เฉพาะห้องชื่อซ้ำ)
  const [signatureUrl, setSignatureUrl] = useState("");
  const [info, setInfo] = useState<{ teachers: string[]; head: string }>({ teachers: [], head: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1) บทบาท → ห้องที่เห็น: แอดมิน/ผู้บริหาร = ทั้งโรงเรียน · ครูทั่วไป = เฉพาะห้องที่เป็นครูประจำชั้น
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let profile: any = null;
      if (user) {
        const r = await supabase.from(DB.usersTable).select("*").eq("auth_id", user.id).maybeSingle();
        profile = r.data;
      }
      setMe(profile);
      const admin = !!profile?.role && ADMIN_ROLES.has(profile.role);
      setIsAdmin(admin);

      let raw: Classroom[] = [];
      if (admin) {
        const { classrooms: all } = await getViewableClassrooms(supabase);
        raw = (all ?? []) as Classroom[];
      } else {
        const { data, error } = await supabase.rpc("get_my_classrooms");
        if (error) setError(error.message);
        raw = (data ?? []) as Classroom[];
      }
      const seen = new Set<string>();
      const list = raw
        .filter(c => (seen.has(c.classroom_id) ? false : (seen.add(c.classroom_id), true)))
        .sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true }));
      setClassrooms(list);
      if (list[0]) setSelected(list[0].classroom_id);
      setLoading(false);
    })();
  }, []);

  // 1.1) ลายเซ็น ผอ. จากตาราง users (คอลัมน์ที่ชื่อมี signature) — เป็น URL / data URI / path ใน Storage ก็ได้
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from(DB.usersTable).select("*").eq("email", DB.principalEmail).maybeSingle();
        if (!data) return;
        const key = Object.keys(data).find(k => /signature|sign_?(url|img|image)/i.test(k) && typeof (data as any)[k] === "string" && (data as any)[k]);
        if (!key) return;
        const v: string = (data as any)[key];
        if (/^(https?:|data:|\/)/.test(v)) { setSignatureUrl(v); return; }
        const path = v.replace(/^\/+/, "");
        const signed = await supabase.storage.from(DB.signatureBucket).createSignedUrl(path, 3600);
        setSignatureUrl(signed.data?.signedUrl ?? supabase.storage.from(DB.signatureBucket).getPublicUrl(path).data.publicUrl);
      } catch { /* ไม่มีลายเซ็นก็เว้นที่ว่างให้เซ็นมือ */ }
    })();
  }, []);

  // 2) นักเรียนของห้องที่เลือก (โหลดทีละห้อง — กันชนเพดาน 1,000 แถวของ Supabase ตอนแอดมินดูทั้งโรงเรียน)
  //    ห้องชื่อเดียวกันหลายแถว (คนละเทอม) ถ้าแถวนี้ไม่มีนักเรียนผูกอยู่ → ใช้รายชื่อจากแถวพี่น้องของห้องเดียวกัน
  useEffect(() => {
    if (!selected || studentsByRoom[selected]) return;
    let active = true;
    (async () => {
      setLoadingStudents(true);
      const cur = classrooms.find(c => c.classroom_id === selected);
      const sibIds = classrooms.filter(c => c.room_name === cur?.room_name && c.classroom_id !== selected).map(c => c.classroom_id);
      let res = await supabase.from(DB.studentsTable).select("*").eq(DB.studentRoomCol, selected).limit(1000);
      if (!res.error && (res.data ?? []).length === 0 && sibIds.length > 0) {
        res = await supabase.from(DB.studentsTable).select("*").in(DB.studentRoomCol, sibIds).limit(1000);
      }
      if (!active) return;
      if (res.error) setError(res.error.message);
      const seenIds = new Set<string>();
      const rows: Student[] = (res.data ?? [])
        .filter((r: any) => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)))
        .map((r: any) => ({
          id: r.id,
          prefix: r.prefix ?? r.title ?? "",
          first_name: r.first_name,
          last_name: r.last_name,
          seat_number: r.seat_number ?? r.number ?? 0,
          student_code: r.student_code ?? r.student_number ?? r.student_no ?? undefined,
        }));
      setStudentsByRoom(prev => ({ ...prev, [selected]: rows }));
      setLoadingStudents(false);
    })();
    return () => { active = false; };
  }, [selected, studentsByRoom, classrooms]);

  // 2.1) ห้องชื่อซ้ำ → หาว่าแถวไหนคือเทอมไหน: คอลัมน์ semester/term ของห้อง → ไม่มีก็ดูเลขท้ายรหัสวิชาของ section (คี่=1, คู่=2)
  useEffect(() => {
    const cur = classrooms.find(c => c.classroom_id === selected);
    if (!cur) return;
    const group = classrooms.filter(c => c.room_name === cur.room_name);
    if (group.length < 2) return;
    let active = true;
    (async () => {
      const ids = group.map(g => g.classroom_id);
      const out: Record<string, string> = {};
      try {
        const cr = await supabase.from(DB.classroomsTable).select("*").in(DB.classroomIdCol, ids);
        (cr.data ?? []).forEach((r: any) => {
          for (const [k, v] of Object.entries(r)) {
            if (/semester|(^|_)term(_|$)/i.test(k) && /^[12]$/.test(String(v))) { out[r[DB.classroomIdCol]] = String(v); break; }
          }
        });
        const need = ids.filter(id => !out[id]);
        if (need.length > 0) {
          const sr = await supabase.from("subject_sections").select("classroom_id, subjects(subject_code)").in("classroom_id", need);
          const tally: Record<string, { 1: number; 2: number }> = {};
          (sr.data ?? []).forEach((x: any) => {
            const subj = Array.isArray(x.subjects) ? x.subjects[0] : x.subjects;
            const last = String(subj?.subject_code ?? "").replace(/\D/g, "").slice(-1);
            if (!last) return;
            const t = Number(last) % 2 === 1 ? 1 : 2;
            (tally[x.classroom_id] ??= { 1: 0, 2: 0 })[t]++;
          });
          need.forEach(id => { const t = tally[id]; if (t && t[1] !== t[2]) out[id] = t[1] > t[2] ? "1" : "2"; });
        }
      } catch { /* ใช้ลำดับ (1)(2) แทน */ }
      if (active) setTermOf(prev => ({ ...prev, ...out }));
    })();
    return () => { active = false; };
  }, [selected, classrooms]);

  const room = classrooms.find(c => c.classroom_id === selected);
  const students = useMemo(() => (selected ? studentsByRoom[selected] ?? [] : []), [selected, studentsByRoom]);
  const levelLabel = room?.room_name.includes("/") ? room.room_name.split("/")[0] : room?.room_name ?? ""; // ป.1/3 → ป.1

  // 3) ครูประจำชั้นคนอื่น (จากแถวห้องเรียน) + หัวหน้าสายชั้น (grade_level เดียวกัน + extra_roles มี grade_head)
  useEffect(() => {
    if (!selected || !me) return;
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
        const heads = (all ?? []).filter((u: any) => hasRole(u, DB.gradeHeadRole));
        const norm = (v: any) => String(v ?? "").trim();
        const myGrade = !isAdmin ? norm(me[DB.gradeCol]) : "";
        const no = levelLabel.replace(/^[^\d]*/, ""); // ป.1 → 1
        let cands = myGrade ? heads.filter((u: any) => norm(u[DB.gradeCol]) === myGrade) : [];
        if (cands.length === 0) {
          // แอดมิน/ไม่มี grade ของตัวเอง → จับคู่จากชั้นของห้องที่เลือก
          cands = heads.filter((u: any) => norm(u[DB.gradeCol]) === levelLabel);
          if (cands.length === 0) cands = heads.filter((u: any) => norm(u[DB.gradeCol]) === no);
        }
        if (cands.length >= 1) head = userDisplayName(cands[0]);
      } catch { /* ข้าม */ }

      if (!active) return;
      setInfo({ teachers, head });
    })();
    return () => { active = false; };
  }, [selected, levelLabel, me, isAdmin]);

  // ครูทั่วไป: ชื่อตัวเองอยู่คนแรก · แอดมิน: ใช้เฉพาะครูประจำชั้นของห้องที่เลือก (ไม่ใส่ชื่อแอดมิน)
  const teacherNames = useMemo(() => {
    const myName = userDisplayName(me);
    if (isAdmin) return info.teachers.slice(0, 2);
    const rest = info.teachers.filter(n => n !== myName);
    return (myName ? [myName, ...rest] : rest).slice(0, 2);
  }, [info.teachers, me, isAdmin]);

  // ชื่อห้องซ้ำ → ต่อท้าย "(เทอม N)" ตามข้อมูลจริง · ยังระบุเทอมไม่ได้ → ต่อท้ายลำดับ
  const optionLabel = (c: Classroom, _i: number) => {
    const dup = classrooms.filter(x => x.room_name === c.room_name);
    if (dup.length < 2) return c.room_name;
    const t = termOf[c.classroom_id];
    return t ? `${c.room_name} (เทอม ${t})` : `${c.room_name} (${dup.indexOf(c) + 1})`;
  };
  const shownRooms = useMemo(() => [...classrooms].sort((a, b) =>
    a.room_name.localeCompare(b.room_name, "th", { numeric: true }) ||
    (termOf[a.classroom_id] ?? "9").localeCompare(termOf[b.classroom_id] ?? "9")), [classrooms, termOf]);

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8 space-y-4">
      {classrooms.length > 1 && (
        isAdmin ? (
          <label className="flex items-center gap-2 text-sm font-bold text-slate-500 print:hidden">
            เลือกห้อง
            <select value={selected ?? ""} onChange={e => setSelected(e.target.value)}
              className="border-2 border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-700 bg-white">
              {shownRooms.map((c, i) => (
                <option key={c.classroom_id} value={c.classroom_id}>ห้อง {optionLabel(c, i)}</option>
              ))}
            </select>
            <span className="text-slate-400 font-bold">({classrooms.length} ห้อง)</span>
          </label>
        ) : (
          <div className="flex flex-wrap gap-2 print:hidden">
            {shownRooms.map((c, i) => (
              <button key={c.classroom_id} onClick={() => setSelected(c.classroom_id)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                  selected === c.classroom_id ? "bg-fuchsia-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                ห้อง {optionLabel(c, i)}
              </button>
            ))}
          </div>
        )
      )}

      {error && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 print:hidden">
          ⚠️ {error}
        </div>
      )}

      {loading || (selected && loadingStudents && !studentsByRoom[selected]) ? (
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
          principalSignatureUrl={signatureUrl}
          onBack={() => router.push("/homeroom")}
        />
      )}
    </div>
  );
}