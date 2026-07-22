// app/students/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Phone, MapPin, Plus, Pencil, Trash2, X, Home, ArrowLeft } from "lucide-react";

const supabase = createClient();

// ★ แก้ path เหล่านี้ให้ตรงกับระบบจริง
const DASHBOARD_PATH = "/dashboard";
const HOMEROOM_PATH = "/homeroom";

const PREFIX_OPTIONS = ["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"];

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

  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data }: { data: Classroom[] | null }) => {
      setClassrooms(data ?? []);
      if (data?.length) setSelectedClass(data[0]);
    });
  }, []);

  function loadStudents(cid: string) {
    setLoading(true);
    supabase
      .from("students")
      .select(
        "id, seat_number, student_code, prefix, first_name, last_name, nick_name, birth_date, gender, guardian_name, guardian_relation, guardian_phone, address"
      )
      .eq("classroom_id", cid)
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

    setShowForm(false);
    loadStudents(cid);
  }

  async function handleDelete(id: string) {
    if (!confirm("ยืนยันการลบนักเรียนคนนี้?")) return;
    // ✅ เพิ่ม .select() เพื่อตรวจสอบว่ามีแถวถูกลบจริงกี่แถว
    // (เดิม: ถ้า RLS ของตาราง students ไม่อนุญาตให้ลบแถวนี้ Supabase จะไม่โยน error
    //  แต่จะ "ลบสำเร็จ 0 แถว" แบบเงียบๆ ทำให้ดูเหมือนลบได้ทั้งที่ข้อมูลยังอยู่)
    const { data: deletedRows, error } = await supabase.from("students").delete().eq("id", id).select();
    if (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      alert("ไม่สามารถลบข้อมูลได้ — ระบบไม่พบสิทธิ์ในการลบแถวข้อมูลนี้ กรุณาตรวจสอบ RLS policy (DELETE) ของตาราง students หรือแจ้งผู้ดูแลระบบ");
      return;
    }
    if (selectedClass) loadStudents(selectedClass.classroom_id);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 xl:max-w-7xl">
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
          <button
            onClick={openAddForm}
            disabled={!selectedClass}
            className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
          >
            <Plus className="h-4 w-4" /> เพิ่มนักเรียน
          </button>
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
                          {s.prefix ? `${s.prefix}` : ""}
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
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
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

                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-500">ข้อมูลนักเรียน</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="เลขที่" value={form.seat_number} onChange={(v) => setForm({ ...form, seat_number: v })} type="number" />
                  <Field label="รหัสนักเรียน" value={form.student_code} onChange={(v) => setForm({ ...form, student_code: v })} />

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">คำนำหน้า</label>
                    <select
                      className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                      value={form.prefix}
                      onChange={(e) => setForm({ ...form, prefix: e.target.value })}
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