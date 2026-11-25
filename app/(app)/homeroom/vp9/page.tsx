// app/homeroom/vp9/page.tsx
// วางคู่กับ Vp9Report.tsx ในโฟลเดอร์เดียวกัน: app/homeroom/vp9/Vp9Report.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getViewableClassrooms } from "@/lib/classrooms/getViewableClassrooms";
import Vp9Report, { mapStudentRow } from "./Vp9Report";

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
  signatureBucket: "signatures",
  signatureBucketGuesses: ["user-signatures", "user_signatures", "teacher-signatures", "signature", "avatars", "public"],   // ★ bucket ใน Storage (ใช้เฉพาะเมื่อค่าลายเซ็นเป็น path ไม่ใช่ URL) — แก้ให้ตรงของจริง
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

/* หาลายเซ็นจากแถว users: คอลัมน์ที่ชื่อมี signature → URL / data URI / path ใน Storage */
async function signatureOf(row: any): Promise<{ url: string; keys: string[] }> {
  const keys = row ? Object.keys(row) : [];
  if (!row) return { url: "", keys };
  const key = keys.find(k => /signature|sign_?(url|img|image|path)/i.test(k) && typeof row[k] === "string" && row[k].trim());
  if (!key) return { url: "", keys };
  const v: string = row[key].trim();
  if (/^(https?:|data:|\/)/.test(v)) return { url: v, keys };
  const path = v.replace(/^\/+/, "");
  for (const b of [DB.signatureBucket, ...DB.signatureBucketGuesses]) {
    const rel = path.startsWith(b + "/") ? path.slice(b.length + 1) : path;
    try {
      const r = await supabase.storage.from(b).createSignedUrl(rel, 3600);
      if (r.data?.signedUrl) return { url: r.data.signedUrl, keys };
    } catch { /* ลอง bucket ถัดไป */ }
  }
  return { url: supabase.storage.from(DB.signatureBucket).getPublicUrl(path).data.publicUrl, keys };
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
  const [info, setInfo] = useState<{ teachers: { name: string; sig: string }[]; head: { name: string; sig: string } }>({ teachers: [], head: { name: "", sig: "" } });
  const [mySig, setMySig] = useState("");
  const [sigNote, setSigNote] = useState("");
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

  // 1.1) ลายเซ็น ผอ. จากตาราง users (อีเมล ผอ.)
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from(DB.usersTable).select("*").eq("email", DB.principalEmail).maybeSingle();
        if (error || !data) { setSigNote(`ลายเซ็น ผอ.: อ่านแถว users ของ ${DB.principalEmail} ไม่ได้ (${error?.message ?? "ไม่พบแถว/สิทธิ์ไม่พอ"})`); return; }
        const { url, keys } = await signatureOf(data);
        if (url) { setSignatureUrl(url); setSigNote(""); }
        else setSigNote(`ลายเซ็น ผอ.: ไม่พบคอลัมน์ลายเซ็นในแถว users — คอลัมน์ที่มี: ${keys.join(", ")}`);
      } catch (e: any) { setSigNote(`ลายเซ็น ผอ.: ${e?.message ?? "error"}`); }
    })();
  }, []);

  // 1.2) ลายเซ็นของผู้ใช้ที่ล็อกอิน (ครูประจำชั้น)
  useEffect(() => {
    if (!me) return;
    signatureOf(me).then(r => setMySig(r.url)).catch(() => {});
  }, [me]);

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
        .map((r: any) => mapStudentRow(r, cur?.room_name ?? ""));
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
      const teachers: { name: string; sig: string }[] = [];
      let head = { name: "", sig: "" };
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
          for (const u of (us ?? []) as any[]) {
            const n = userDisplayName(u);
            if (n && !teachers.some(t => t.name === n)) teachers.push({ name: n, sig: (await signatureOf(u)).url });
          }
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
        if (cands.length >= 1) head = { name: userDisplayName(cands[0]), sig: (await signatureOf(cands[0])).url };
      } catch { /* ข้าม */ }

      if (!active) return;
      setInfo({ teachers, head });
    })();
    return () => { active = false; };
  }, [selected, levelLabel, me, isAdmin]);

  // ครูทั่วไป: ชื่อตัวเองอยู่คนแรก · แอดมิน: ใช้เฉพาะครูประจำชั้นของห้องที่เลือก (ไม่ใส่ชื่อแอดมิน)
  const teacherInfos = useMemo(() => {
    const myName = userDisplayName(me);
    if (isAdmin) return info.teachers.slice(0, 2);
    const rest = info.teachers.filter(t => t.name !== myName);
    const mine = info.teachers.find(t => t.name === myName);
    return (myName ? [{ name: myName, sig: mySig || mine?.sig || "" }, ...rest] : rest).slice(0, 2);
  }, [info.teachers, me, isAdmin, mySig]);

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

      {sigNote && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 print:hidden">
          ⚠️ {sigNote}
        </div>
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
          homeroomTeacherNames={teacherInfos.map(t => t.name)}
          homeroomTeacherSignatures={teacherInfos.map(t => t.sig)}
          levelHeadName={info.head.name}
          levelHeadSignature={info.head.sig}
          principalSignatureUrl={signatureUrl}
          onBack={() => router.push("/homeroom")}
        />
      )}
    </div>
  );
}