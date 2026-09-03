// app/students/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Phone, MapPin, Plus, Pencil, LogOut, X, Home, ArrowLeft, Printer } from "lucide-react";
// ★ ย้าย logic คำนวณคำนำหน้าไปไว้ไฟล์กลาง lib/student-prefix.ts เพื่อใช้ร่วมกันทุกหน้า
import { getAutoPrefix, getDisplayPrefix } from "@/lib/student-prefix";

const supabase = createClient();

// ★ แก้ path เหล่านี้ให้ตรงกับระบบจริง
const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

const PREFIX_OPTIONS = ["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"];

// ⚠️ สมมติฐานสคีมาใหม่ (ต้อง ALTER TABLE ก่อนใช้งานฟีเจอร์นี้):
//   alter table students
//     add column moved_out_at date,
//     add column moved_out_by uuid references auth.users(id),
//     add column moved_out_by_name text;
//   - moved_out_at    : วันที่นักเรียนย้ายออก (ครูประจำชั้นเป็นคนกรอก) — null แปลว่ายังเรียนอยู่
//   - moved_out_by    : auth_id ของครูที่กดย้ายออก (เผื่อ join เพิ่มเติมภายหลัง)
//   - moved_out_by_name : ชื่อครูที่กดย้ายออก ณ ตอนนั้น (เก็บ snapshot ไว้ กันชื่อเพี้ยนถ้าโปรไฟล์ครูถูกแก้ทีหลัง)
//   ถ้าชื่อคอลัมน์จริงต่างจากนี้ ให้แก้ selectStr / payload ในฟังก์ชันที่เกี่ยวข้องด้านล่าง

type Classroom = {
  classroom_id: string;
  room_name: string;
  room_number?: number;
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
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_phone: string | null;
  address: string | null;
  avatar_url: string | null;
};

type FormState = {
  seat_number: string;
  student_code: string;
  prefix: string;
  first_name: string;
  last_name: string;
  nick_name: string;
  birth_date: string;
  gender: string;
  guardian_name: string;
  guardian_relation: string;
  guardian_phone: string;
  address: string;
};

const EMPTY_FORM: FormState = {
  seat_number: "", student_code: "", prefix: "", first_name: "", last_name: "",
  nick_name: "", birth_date: "", gender: "",
  guardian_name: "", guardian_relation: "", guardian_phone: "", address: "",
};

// ★ วันที่วันนี้ในรูปแบบ yyyy-mm-dd สำหรับ default ของ input[type=date]
function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function StudentsPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // ★ ชื่อครูประจำชั้นที่ล็อกอินอยู่ตอนนี้ ใช้บันทึกว่า "ใครเป็นคนกดย้ายออก"
  const [currentAuthId, setCurrentAuthId] = useState<string | null>(null);
  const [teacherDisplayName, setTeacherDisplayName] = useState<string>("");

  // ★ modal ย้ายนักเรียนออก (แทนการลบจริง)
  const [movingOutStudent, setMovingOutStudent] = useState<Student | null>(null);
  const [moveOutDate, setMoveOutDate] = useState<string>(todayStr());
  const [movingOutSaving, setMovingOutSaving] = useState(false);
  const [movingOutError, setMovingOutError] = useState("");

  // ★ อัปเดตคำนำหน้าอัตโนมัติเมื่อวันเกิดหรือเพศเปลี่ยน (เฉพาะตอนที่ modal เปิดอยู่)
  useEffect(() => {
    if (!showForm) return;
    const autoPrefix = getAutoPrefix(form.gender, form.birth_date);
    if (autoPrefix && autoPrefix !== form.prefix) {
      setForm((f) => ({ ...f, prefix: autoPrefix }));
    }
  }, [form.gender, form.birth_date, showForm]);

  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data }: { data: Classroom[] | null }) => {
      setClassrooms(data ?? []);
      if (data?.length) setSelectedClass(data[0]);
    });
  }, []);

  // ★ ดึงชื่อครูประจำชั้นคนปัจจุบัน สำหรับบันทึกลง moved_out_by_name
  // (ไม่รู้ชื่อคอลัมน์ full name ที่แน่ชัดในตาราง users จึงลองไล่หลายคอลัมน์ที่เป็นไปได้ ก่อน fallback เป็น email)
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      setCurrentAuthId(authUser.id);
      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("auth_id", authUser.id)
        .maybeSingle();
      const p = (profile ?? {}) as Record<string, unknown>;
      const name =
        (p.full_name as string) ||
        (p.display_name as string) ||
        ([p.first_name, p.last_name].filter(Boolean).join(" ") || null) ||
        (p.name as string) ||
        authUser.email ||
        "ครูประจำชั้น";
      setTeacherDisplayName(name);
    })();
  }, []);

  function loadStudents(cid: string) {
    setLoading(true);
    supabase
      .from("students")
      .select(
        "id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, guardian_name, guardian_relation, guardian_phone, address, avatar_url"
      )
      .eq("classroom_id", cid)
      // ★ ซ่อนนักเรียนที่ย้ายออกไปแล้วจากหน้าครูประจำชั้น (soft-deleted)
      .is("moved_out_at", null)
      .order("seat_number")
      .then(({ data }: { data: Student[] | null }) => {
        setStudents(data ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    if (!selectedClass) return;
    loadStudents(selectedClass.classroom_id);
  }, [selectedClass]);

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError("");
    setAvatarFile(null);
    setAvatarPreview(null);
    setShowForm(true);
  }

  function openEditForm(s: Student) {
    setEditingId(s.id);
    setForm({
      seat_number: s.seat_number?.toString() ?? "",
      student_code: s.student_code ?? "",
      prefix: s.prefix ?? "",
      first_name: s.first_name ?? "",
      last_name: s.last_name ?? "",
      nick_name: s.nick_name ?? "",
      birth_date: s.birth_date ?? "",
      gender: s.gender ?? "",
      guardian_name: s.guardian_name ?? "",
      guardian_relation: s.guardian_relation ?? "",
      guardian_phone: s.guardian_phone ?? "",
      address: s.address ?? "",
    });
    setSaveError("");
    setAvatarFile(null);
    setAvatarPreview((s as any).avatar_url ?? null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!selectedClass) return;
    if (!form.first_name || !form.last_name) {
      alert("กรุณากรอกชื่อและนามสกุลนักเรียน");
      return;
    }
    setSaving(true);
    setSaveError("");
    const cid = selectedClass.classroom_id;
    const payload = {
      ...form,
      seat_number: form.seat_number ? Number(form.seat_number) : null,
      birth_date: form.birth_date || null,
      classroom_id: cid,
    };

    // ✅ เพิ่ม .select() เพื่อตรวจสอบว่ามีแถวถูกบันทึก/แก้ไขจริงกี่แถว
    // (เดิม: ถ้า RLS ของตาราง students ไม่อนุญาตให้แก้ไขแถวนี้ Supabase จะไม่โยน error
    //  แต่จะ "อัปเดตสำเร็จ 0 แถว" แบบเงียบๆ ทำให้ดูเหมือนบันทึกได้ทั้งที่ข้อมูลไม่เปลี่ยน)
    const query = editingId
      ? supabase.from("students").update(payload).eq("id", editingId).select()
      : supabase.from("students").insert(payload).select();

    const { data: savedRows, error } = await query;

    setSaving(false);

    if (error) {
      console.error("students save error:", error);
      setSaveError("บันทึกไม่สำเร็จ: " + error.message);
      alert("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }

    if (!savedRows || savedRows.length === 0) {
      const msg = editingId
        ? "ไม่สามารถบันทึกการแก้ไขได้ — ระบบไม่พบสิทธิ์ในการแก้ไขแถวข้อมูลนี้ กรุณาตรวจสอบ RLS policy (UPDATE) ของตาราง students หรือแจ้งผู้ดูแลระบบ"
        : "ไม่สามารถเพิ่มข้อมูลได้ — กรุณาตรวจสอบ RLS policy (INSERT) ของตาราง students";
      setSaveError(msg);
      alert(msg);
      return;
    }

    const savedId = editingId ?? savedRows[0]?.id;

    // ★ อัปโหลด avatar ถ้ามีการเลือกไฟล์ใหม่
    if (avatarFile && savedId) {
      const fd = new FormData();
      fd.append("file", avatarFile);
      const res = await fetch(`/api/students/${savedId}/avatar`, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json();
        alert("บันทึกข้อมูลนักเรียนสำเร็จ แต่อัปโหลดรูปไม่สำเร็จ: " + (j.error ?? ""));
      }
    }

    setShowForm(false);
    loadStudents(cid);
  }

  // ★ เปิด modal กรอกวันที่ย้ายออก (แทนการลบจริงแบบเดิม)
  function openMoveOutModal(s: Student) {
    setMovingOutStudent(s);
    setMoveOutDate(todayStr());
    setMovingOutError("");
  }

  // ★ ยืนยันย้ายนักเรียนออก — เป็นการ "soft delete": update วันที่/ผู้บันทึก แล้วซ่อนออกจากลิสต์
  //   (ไม่ใช้ .delete() อีกต่อไป เพื่อให้แอดมินยังเห็นประวัตินักเรียนคนนี้ได้)
  async function confirmMoveOut() {
    if (!movingOutStudent) return;
    if (!moveOutDate) {
      setMovingOutError("กรุณาเลือกวันที่ย้ายออก");
      return;
    }
    setMovingOutSaving(true);
    setMovingOutError("");

    const { data: updatedRows, error } = await supabase
      .from("students")
      .update({
        moved_out_at: moveOutDate,
        moved_out_by: currentAuthId,
        moved_out_by_name: teacherDisplayName || null,
      })
      .eq("id", movingOutStudent.id)
      .select();

    setMovingOutSaving(false);

    if (error) {
      setMovingOutError("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    if (!updatedRows || updatedRows.length === 0) {
      setMovingOutError(
        "ไม่สามารถบันทึกการย้ายออกได้ — ระบบไม่พบสิทธิ์ในการแก้ไขแถวข้อมูลนี้ กรุณาตรวจสอบ RLS policy (UPDATE) ของตาราง students หรือแจ้งผู้ดูแลระบบ"
      );
      return;
    }

    setMovingOutStudent(null);
    if (selectedClass) loadStudents(selectedClass.classroom_id);
  }

  // ★ ไปหน้าพิมพ์การ์ดนักเรียนของห้องที่เลือกอยู่
  function goToPrintCards() {
    if (!selectedClass) return;
    router.push(`/students/print?classroom=${selectedClass.classroom_id}`);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        {/* แถบนำทางด้านบน: กลับแดชบอร์ด + ย้อนกลับไปครูประจำชั้น */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(DASHBOARD_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <Home className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => router.push(HOMEROOM_PATH)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">ระบบดูแลนักเรียน</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
              ทะเบียนนักเรียน
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              รายชื่อ ข้อมูลพื้นฐาน และข้อมูลผู้ปกครองของนักเรียนในความดูแล
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrintCards}
              disabled={!selectedClass}
              className="flex items-center gap-1.5 rounded-2xl border-2 border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-md disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              <Printer className="h-4 w-4" /> พิมพ์การ์ด นร.
            </button>
            <button
              onClick={openAddForm}
              disabled={!selectedClass}
              className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" /> เพิ่มนักเรียน
            </button>
          </div>
        </div>

        {classrooms.length > 1 && (
          <div className="mt-5 max-w-xs">
            <select
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              value={selectedClass?.classroom_id ?? ""}
              onChange={(e) =>
                setSelectedClass(classrooms.find((c) => c.classroom_id === e.target.value) ?? null)
              }
            >
              {classrooms.map((c) => (
                <option key={c.classroom_id} value={c.classroom_id}>
                  {c.room_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <p className="col-span-full py-16 text-center text-sm text-slate-400">กำลังโหลด...</p>
          ) : students.length === 0 ? (
            <p className="col-span-full py-16 text-center text-sm text-slate-400">ไม่พบนักเรียนในห้องนี้</p>
          ) : (
            students.map((s) => {
              const active = expanded === s.id;
              const displayPrefix = getDisplayPrefix(s.gender, s.birth_date, s.prefix);
              return (
                <div
                  key={s.id}
                  className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:shadow-md ${
                    active ? "sm:col-span-2 xl:col-span-3 ring-indigo-200" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <button
                      onClick={() => setExpanded(active ? null : s.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white shadow-sm">
                        {s.seat_number ?? "-"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-800">
                          {displayPrefix}
                          {s.first_name} {s.last_name}
                          {s.nick_name && <span className="ml-1 font-normal text-slate-400">({s.nick_name})</span>}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">{s.student_code}</p>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => openEditForm(s)}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {/* ★ เปลี่ยนจาก "ลบ" ทันที เป็นเปิด modal ให้กรอกวันที่ย้ายออกก่อน (soft delete) */}
                      <button
                        onClick={() => openMoveOutModal(s)}
                        title="ย้ายออก"
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {active && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3.5 text-sm">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <p>
                          <span className="text-slate-400">ผู้ปกครอง: </span>
                          <span className="font-medium text-slate-700">
                            {s.guardian_name ?? "-"} ({s.guardian_relation ?? "-"})
                          </span>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-indigo-400" />
                          <span className="font-medium text-slate-700">{s.guardian_phone ?? "-"}</span>
                        </p>
                        <p className="flex items-center gap-1.5 sm:col-span-2">
                          <MapPin className="h-3.5 w-3.5 text-indigo-400" />
                          <span className="font-medium text-slate-700">{s.address ?? "-"}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ★ Modal ย้ายนักเรียนออก — กรอกวันที่แล้วยืนยัน */}
        {movingOutStudent && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
            onClick={() => !movingOutSaving && setMovingOutStudent(null)}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between bg-gradient-to-r from-rose-500 to-orange-400 px-6 py-4">
                <h2 className="text-base font-bold text-white">ย้ายนักเรียนออก</h2>
                <button
                  onClick={() => !movingOutSaving && setMovingOutStudent(null)}
                  className="rounded-lg p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6">
                <p className="text-sm text-slate-600">
                  ย้าย{" "}
                  <span className="font-bold text-slate-800">
                    {movingOutStudent.prefix ?? ""}
                    {movingOutStudent.first_name} {movingOutStudent.last_name}
                  </span>{" "}
                  ออกจากห้องเรียน
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  ข้อมูลนักเรียนจะไม่แสดงในรายชื่อห้องนี้อีก แต่แอดมินยังดูประวัติย้อนหลังได้
                </p>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-slate-500">วันที่ย้ายออก</label>
                  <input
                    type="date"
                    value={moveOutDate}
                    onChange={(e) => setMoveOutDate(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  />
                </div>

                {movingOutError && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-600">
                    ⚠️ {movingOutError}
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setMovingOutStudent(null)}
                    disabled={movingOutSaving}
                    className="rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={confirmMoveOut}
                    disabled={movingOutSaving}
                    className="rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                  >
                    {movingOutSaving ? "กำลังบันทึก..." : "ยืนยันย้ายออก"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-blue-500 px-6 py-4">
                <h2 className="text-base font-bold text-white">
                  {editingId ? "แก้ไขข้อมูลนักเรียน" : "เพิ่มนักเรียนใหม่"}
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6">
                {saveError && (
                  <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-600">
                    ⚠️ {saveError}
                  </div>
                )}
                {/* ★ Avatar picker */}
                <div className="mb-4 flex justify-center">
                  <label className="relative cursor-pointer group">
                    {avatarPreview ? (
                      <img src={avatarPreview} className="w-20 h-20 rounded-full object-cover border-4 border-slate-100" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-slate-100 border-4 border-slate-100 flex items-center justify-center text-2xl text-slate-300">👤</div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-black">
                      เปลี่ยนรูป
                    </div>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                      }} />
                  </label>
                </div>

                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-500">ข้อมูลนักเรียน</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="เลขที่" value={form.seat_number} onChange={(v) => setForm({ ...form, seat_number: v })} type="number" />
                  <Field label="รหัสนักเรียน" value={form.student_code} onChange={(v) => setForm({ ...form, student_code: v })} />

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      คำนำหน้า
                      {getAutoPrefix(form.gender, form.birth_date) && (
                        <span className="ml-1 text-[10px] font-normal text-indigo-400">(คำนวณอัตโนมัติจากอายุ)</span>
                      )}
                    </label>
                    <select
                      className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
                      value={form.prefix}
                      onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                      disabled={!!getAutoPrefix(form.gender, form.birth_date)}
                    >
                      <option value="">เลือก</option>
                      {PREFIX_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div />

                  <Field label="ชื่อ" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} required />
                  <Field label="นามสกุล" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
                  <Field label="ชื่อเล่น" value={form.nick_name} onChange={(v) => setForm({ ...form, nick_name: v })} />
                  <Field label="วันเกิด" value={form.birth_date} onChange={(v) => setForm({ ...form, birth_date: v })} type="date" />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">เพศ</label>
                    <select
                      className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    >
                      <option value="">เลือก</option>
                      <option value="male">ชาย</option>
                      <option value="female">หญิง</option>
                    </select>
                  </div>
                </div>

                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-indigo-500">ข้อมูลผู้ปกครอง</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="ชื่อผู้ปกครอง" value={form.guardian_name} onChange={(v) => setForm({ ...form, guardian_name: v })} />
                  <Field label="ความสัมพันธ์" value={form.guardian_relation} onChange={(v) => setForm({ ...form, guardian_relation: v })} placeholder="เช่น มารดา, บิดา, ป้า" />
                  <Field label="เบอร์โทรผู้ปกครอง" value={form.guardian_phone} onChange={(v) => setForm({ ...form, guardian_phone: v })} />
                  <Field label="ที่อยู่" value={form.address} onChange={(v) => setForm({ ...form, address: v })} full />
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className="rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                  >
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  full?: boolean;
  required?: boolean;
  placeholder?: string;
};

function Field({ label, value, onChange, type = "text", full = false, required = false, placeholder }: FieldProps) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
      />
    </div>
  );
}