// app/students/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Phone, MapPin, Plus, Pencil, Trash2, X } from "lucide-react";

const supabase = createClient();

type Classroom = {
  classroom_id: string;
  room_name: string;
  room_number?: number;
};

type Student = {
  id: string;
  seat_number: number | null;
  student_code: string | null;
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
  seat_number: "", student_code: "", first_name: "", last_name: "",
  nick_name: "", birth_date: "", gender: "",
  guardian_name: "", guardian_relation: "", guardian_phone: "", address: "",
};

export default function StudentsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
        "id, seat_number, student_code, first_name, last_name, nick_name, birth_date, gender, guardian_name, guardian_relation, guardian_phone, address"
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
    setShowForm(true);
  }

  function openEditForm(s: Student) {
    setEditingId(s.id);
    setForm({
      seat_number: s.seat_number?.toString() ?? "",
      student_code: s.student_code ?? "",
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
    setShowForm(true);
  }

  async function handleSave() {
    if (!selectedClass) return;
    if (!form.first_name || !form.last_name) {
      alert("กรุณากรอกชื่อและนามสกุลนักเรียน");
      return;
    }
    setSaving(true);
    const cid = selectedClass.classroom_id;
    const payload = {
      ...form,
      seat_number: form.seat_number ? Number(form.seat_number) : null,
      birth_date: form.birth_date || null,
      classroom_id: cid,
    };

    const { error } = editingId
      ? await supabase.from("students").update(payload).eq("id", editingId)
      : await supabase.from("students").insert(payload);

    setSaving(false);
    if (error) {
      alert("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    setShowForm(false);
    loadStudents(cid);
  }

  async function handleDelete(id: string) {
    if (!confirm("ยืนยันการลบนักเรียนคนนี้?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
      return;
    }
    if (selectedClass) loadStudents(selectedClass.classroom_id);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">ทะเบียนนักเรียน</h1>
          <p className="mt-1 text-sm text-slate-500">รายชื่อ ข้อมูลพื้นฐาน และข้อมูลผู้ปกครองของนักเรียนในความดูแล</p>
        </div>
        <button
          onClick={openAddForm}
          disabled={!selectedClass}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> เพิ่มนักเรียน
        </button>
      </div>

      {classrooms.length > 1 && (
        <div className="mt-4 max-w-xs">
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : students.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">ไม่พบนักเรียนในห้องนี้</p>
        ) : (
          students.map((s) => {
            const active = expanded === s.id;
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpanded(active ? null : s.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                      {s.seat_number}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {s.first_name} {s.last_name}
                        {s.nick_name && <span className="ml-1 font-normal text-slate-400">({s.nick_name})</span>}
                      </p>
                      <p className="text-xs text-slate-400">{s.student_code}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditForm(s)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {active && (
                  <div className="border-t border-slate-100 px-4 py-3 text-sm">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <p>
                        <span className="text-slate-400">ผู้ปกครอง: </span>
                        <span className="font-medium text-slate-700">
                          {s.guardian_name ?? "-"} ({s.guardian_relation ?? "-"})
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-700">{s.guardian_phone ?? "-"}</span>
                      </p>
                      <p className="flex items-center gap-1.5 sm:col-span-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">
                {editingId ? "แก้ไขข้อมูลนักเรียน" : "เพิ่มนักเรียนใหม่"}
              </h2>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="เลขที่" value={form.seat_number} onChange={(v) => setForm({ ...form, seat_number: v })} type="number" />
              <Field label="รหัสนักเรียน" value={form.student_code} onChange={(v) => setForm({ ...form, student_code: v })} />
              <Field label="ชื่อ" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} required />
              <Field label="นามสกุล" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
              <Field label="ชื่อเล่น" value={form.nick_name} onChange={(v) => setForm({ ...form, nick_name: v })} />
              <Field label="วันเกิด" value={form.birth_date} onChange={(v) => setForm({ ...form, birth_date: v })} type="date" />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">เพศ</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">เลือก</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
              <Field label="ชื่อผู้ปกครอง" value={form.guardian_name} onChange={(v) => setForm({ ...form, guardian_name: v })} />
              <Field label="ความสัมพันธ์" value={form.guardian_relation} onChange={(v) => setForm({ ...form, guardian_relation: v })} placeholder="เช่น มารดา, บิดา, ป้า" />
              <Field label="เบอร์โทรผู้ปกครอง" value={form.guardian_phone} onChange={(v) => setForm({ ...form, guardian_phone: v })} />
              <Field label="ที่อยู่" value={form.address} onChange={(v) => setForm({ ...form, address: v })} full />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
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
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </div>
  );
}