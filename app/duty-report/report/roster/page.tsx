"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, CalendarRange, Plus, Trash2, Copy, Save, Search, X } from "lucide-react";
import { THAI_DOW, WORKING_DOW, teacherName, Teacher, DutyPoint, DutyTimeSlot, DutyAssignment } from "@/lib/duty-helpers";
import { isExcludedTeacher } from "@/lib/duty-helpers";

const supabase = createClient();

type SlotDraft = {
  id: string; // ถ้าขึ้นต้นด้วย "new-" คือยังไม่ถูกบันทึก
  start_time: string;
  end_time: string;
  teacher_ids: string[];
};
type PointDraft = DutyPoint & { slots: SlotDraft[] };

function TeacherPicker({
  teachers, selectedIds, onToggle,
}: { teachers: Teacher[]; selectedIds: string[]; onToggle: (teacherId: string) => void }) {
  const [query, setQuery] = useState("");

  const selectedTeachers = teachers.filter((t) => selectedIds.includes(t.id));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return teachers
      .filter((t) => {
        const name = `${t.title ?? ""}${t.first_name} ${t.last_name}`.toLowerCase();
        return name.includes(q);
      })
      .slice(0, 15);
  }, [teachers, query]);

  return (
    <div className="mt-2">
      {/* ชื่อที่เลือกแล้ว */}
      {selectedTeachers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedTeachers.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white">
              {t.title ?? ""}{t.first_name} {t.last_name}
              <button onClick={() => onToggle(t.id)} className="ml-0.5 hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ช่องพิมพ์ค้นหา */}
      <div className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="พิมพ์ค้นหาชื่อครู..."
          className="w-full border-none bg-transparent text-xs outline-none placeholder:text-slate-400"
        />
      </div>

      {/* ผลค้นหา */}
      {query.trim() && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-slate-400">ไม่พบชื่อครูที่ตรงกับคำค้นหา</p>
          ) : (
            filtered.map((t) => {
              const active = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => { onToggle(t.id); setQuery(""); }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    active ? "bg-indigo-100 text-indigo-600 ring-1 ring-indigo-300" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-indigo-50"
                  }`}
                >
                  {t.title ?? ""}{t.first_name} {t.last_name}{active ? " ✓" : ""}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function DutyRosterPage() {
  const router = useRouter();
  const [dow, setDow] = useState(1);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [points, setPoints] = useState<PointDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
  supabase.from("users").select("id, title, first_name, last_name, role").order("first_name").then(({ data }) => {
  setTeachers((data ?? []).filter((t) => !isExcludedTeacher(t)));
});
}, []);

  async function loadForDow(targetDow: number) {
    setLoading(true);
    const { data, error } = await supabase
      .from("duty_points")
      .select(
  "id, point_number, title, location_note, sort_order, slots:duty_time_slots(id, day_of_week, start_time, end_time, sort_order, assignments:duty_slot_assignments(teacher_id))"
)
      .order("sort_order");

    if (error) { console.warn("[roster] โหลดไม่สำเร็จ:", error.message); setLoading(false); return; }

    const built: PointDraft[] = (data ?? []).map((p: any) => ({
      id: p.id, point_number: p.point_number, title: p.title, location_note: p.location_note, sort_order: p.sort_order,
      slots: (p.slots ?? [])
        .filter((s: any) => s.day_of_week === targetDow)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((s: any) => ({ id: s.id, start_time: s.start_time?.slice(0, 5), end_time: s.end_time?.slice(0, 5), teacher_ids: (s.assignments ?? []).map((a: any) => a.teacher_id) })),
    }));
    setPoints(built);
    setLoading(false);
  }

  useEffect(() => { loadForDow(dow); }, [dow]);

  function addSlot(pointId: string) {
    setPoints((prev) => prev.map((p) => p.id === pointId
      ? { ...p, slots: [...p.slots, { id: `new-${Date.now()}`, start_time: "07:00", end_time: "08:00", teacher_ids: [] }] }
      : p));
  }
  function removeSlot(pointId: string, slotId: string) {
    setPoints((prev) => prev.map((p) => p.id === pointId ? { ...p, slots: p.slots.filter((s) => s.id !== slotId) } : p));
  }
  function updateSlot(pointId: string, slotId: string, patch: Partial<SlotDraft>) {
    setPoints((prev) => prev.map((p) => p.id === pointId
      ? { ...p, slots: p.slots.map((s) => s.id === slotId ? { ...s, ...patch } : s) }
      : p));
  }
  function toggleTeacher(pointId: string, slotId: string, teacherId: string) {
    setPoints((prev) => prev.map((p) => p.id === pointId
      ? { ...p, slots: p.slots.map((s) => s.id === slotId
          ? { ...s, teacher_ids: s.teacher_ids.includes(teacherId) ? s.teacher_ids.filter((id) => id !== teacherId) : [...s.teacher_ids, teacherId] }
          : s) }
      : p));
  }

  async function handleSaveDay() {
    setSaving(true); setSavedMsg("");
    try {
      for (const p of points) {
        // ลบ slot เดิมของวันนี้ที่ไม่อยู่ใน draft แล้ว (ผู้ใช้กดลบ)
        const keepIds = p.slots.filter((s) => !s.id.startsWith("new-")).map((s) => s.id);
        await supabase.from("duty_time_slots").delete().eq("duty_point_id", p.id).eq("day_of_week", dow)
          .then(async (existing) => existing); // no-op guard
        const { data: existingSlots } = await supabase.from("duty_time_slots").select("id").eq("duty_point_id", p.id).eq("day_of_week", dow);
        const toDelete = (existingSlots ?? []).map((s: any) => s.id).filter((id: string) => !keepIds.includes(id));
        if (toDelete.length) await supabase.from("duty_time_slots").delete().in("id", toDelete);

        for (let i = 0; i < p.slots.length; i++) {
          const s = p.slots[i];
          let slotId = s.id;
          if (slotId.startsWith("new-")) {
            const { data: inserted, error } = await supabase.from("duty_time_slots")
              .insert({ duty_point_id: p.id, day_of_week: dow, start_time: s.start_time + ":00", end_time: s.end_time + ":00", sort_order: i })
              .select("id").single();
            if (error) throw new Error(error.message);
            slotId = inserted.id;
          } else {
            const { error } = await supabase.from("duty_time_slots")
              .update({ start_time: s.start_time + ":00", end_time: s.end_time + ":00", sort_order: i })
              .eq("id", slotId);
            if (error) throw new Error(error.message);
          }
          // sync ผู้รับผิดชอบ: ลบของเดิมทั้งหมดแล้วใส่ใหม่ตาม draft (ง่ายและชัวร์)
          await supabase.from("duty_slot_assignments").delete().eq("time_slot_id", slotId);
if (s.teacher_ids.length) {
  await supabase.from("duty_slot_assignments").insert(
    s.teacher_ids.map((tid, idx) => ({ time_slot_id: slotId, teacher_id: tid, sort_order: idx }))
  );
}
        }
      }
      setSavedMsg(`บันทึกตารางวัน${THAI_DOW[dow]}เรียบร้อยแล้ว`);
      loadForDow(dow);
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(""), 3000);
    }
  }

  // ★ คัดลอกตารางจากวันอื่นมาที่วันนี้ — ใช้ทั้งตอนตั้งครั้งแรก (จ. → อ.-ศ.) และแก้ไขทีหลัง
  async function copyFromDow(sourceDow: number) {
    if (sourceDow === dow) return;
    if (!confirm(`คัดลอกตารางเวรจากวัน${THAI_DOW[sourceDow]} มาทับวัน${THAI_DOW[dow]}? ข้อมูลเดิมของวัน${THAI_DOW[dow]}จะถูกแทนที่`)) return;
    setLoading(true);
    const { data } = await supabase
      .from("duty_time_slots")
      .select("duty_point_id, start_time, end_time, sort_order, assignments:duty_slot_assignments(teacher_id)")
      .eq("day_of_week", sourceDow);

    const draft: Record<string, SlotDraft[]> = {};
    (data ?? []).forEach((s: any) => {
      if (!draft[s.duty_point_id]) draft[s.duty_point_id] = [];
      draft[s.duty_point_id].push({
        id: `new-${Math.random()}`,
        start_time: s.start_time?.slice(0, 5),
        end_time: s.end_time?.slice(0, 5),
        teacher_ids: (s.assignments ?? []).map((a: any) => a.teacher_id),
      });
    });
    setPoints((prev) => prev.map((p) => ({ ...p, slots: draft[p.id] ?? [] })));
    setLoading(false);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/duty-report/report")} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <Home className="h-4.5 w-4.5" />
          </button>
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">งานเวรประจำวัน</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-800 sm:text-3xl">
            <CalendarRange className="h-6 w-6 text-indigo-500" /> จัดตารางเวร 7 วัน
          </h1>
          <p className="mt-1 text-sm text-slate-500">ตั้งค่าครั้งแรกให้ครบทุกจุด แล้วแก้ไข/สลับคนได้ตลอดเวลา</p>
        </div>

        {/* แท็บวัน */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {WORKING_DOW.map((d) => (
            <button key={d} onClick={() => setDow(d)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dow === d ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-indigo-50"}`}>
              {THAI_DOW[d]}
            </button>
          ))}
        </div>

        {/* คัดลอกจากวันอื่น */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <Copy className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-500">คัดลอกตารางจาก:</span>
          {WORKING_DOW.filter((d) => d !== dow).map((d) => (
            <button key={d} onClick={() => copyFromDow(d)} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-indigo-100 hover:text-indigo-600">
              วัน{THAI_DOW[d]}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-slate-400">(ใช้สำหรับตั้งค่าครั้งแรกให้ครบ 5 วันเร็ว ๆ ได้)</span>
        </div>

        {loading ? (
          <p className="mt-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : (
          <div className="mt-4 space-y-3">
            {points.map((p) => (
              <div key={p.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-slate-800">
                    <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-xs text-indigo-600">{p.point_number}</span>
                    {p.title}
                  </p>
                  <button onClick={() => addSlot(p.id)} className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100">
                    <Plus className="h-3.5 w-3.5" /> เพิ่มช่วงเวลา
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {p.slots.length === 0 && <p className="text-xs text-slate-400">ยังไม่มีช่วงเวลาในวันนี้</p>}
                  {p.slots.map((s) => (
                    <div key={s.id} className="rounded-2xl bg-slate-50 p-3">
                      <div className="flex items-center gap-2">
                        <input type="time" value={s.start_time} onChange={(e) => updateSlot(p.id, s.id, { start_time: e.target.value })} className="rounded-lg border-2 border-slate-200 px-2 py-1 text-xs" />
                        <span className="text-xs text-slate-400">ถึง</span>
                        <input type="time" value={s.end_time} onChange={(e) => updateSlot(p.id, s.id, { end_time: e.target.value })} className="rounded-lg border-2 border-slate-200 px-2 py-1 text-xs" />
                        <button onClick={() => removeSlot(p.id, s.id)} className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <TeacherPicker
  teachers={teachers}
  selectedIds={s.teacher_ids}
  onToggle={(teacherId) => toggleTeacher(p.id, s.id, teacherId)}
/>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="sticky bottom-4 flex items-center justify-end gap-3">
              {savedMsg && <span className="text-sm font-semibold text-emerald-600">{savedMsg}</span>}
              <button onClick={handleSaveDay} disabled={saving} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? "กำลังบันทึก..." : `บันทึกตารางวัน${THAI_DOW[dow]}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}