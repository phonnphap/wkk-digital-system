"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, ShieldCheck, Save, Search, X, Check } from "lucide-react";
import { THAI_DOW, WORKING_DOW } from "@/lib/duty-helpers";

const supabase = createClient();

type Teacher = {
  id: string;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
};

// ★ ประกอบชื่อแสดงผล: ใช้ full_name ถ้ามีข้อมูลจริง ไม่งั้น fallback ไปประกอบจาก title+first+last
function displayName(t: Teacher) {
  if (t.full_name && t.full_name.trim()) return t.full_name.trim();
  const parts = [t.title ?? "", t.first_name ?? "", t.last_name ?? ""].join(" ").replace(/\s+/g, " ").trim();
  return parts || "(ไม่มีชื่อ)";
}

export default function DutyHeadSettingsPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});
  const [sameEveryDay, setSameEveryDay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("users").select("id, title, first_name, last_name").order("first_name"),
      supabase.from("duty_head_settings").select("day_of_week, role, teacher_id"),
    ]).then(([teacherRes, settingsRes]) => {
      if (teacherRes.error) console.warn("[duty-head-settings] โหลดรายชื่อครูไม่สำเร็จ:", teacherRes.error.message);
      const list = (teacherRes.data ?? []) as Teacher[];
      list.sort((a, b) => displayName(a).localeCompare(displayName(b), "th"));
      setTeachers(list);

      const map: Record<string, string> = {};
      (settingsRes.data ?? []).forEach((r: any) => { if (r.teacher_id) map[`${r.day_of_week}-${r.role}`] = r.teacher_id; });
      setSettingsMap(map);
      setLoading(false);
    });
  }, []);

  function setValue(dow: number, role: "head" | "deputy", teacherId: string) {
    setSettingsMap((prev) => {
      const next = { ...prev, [`${dow}-${role}`]: teacherId };
      if (sameEveryDay) WORKING_DOW.forEach((d) => { next[`${d}-${role}`] = teacherId; });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setSavedMsg("");
    const rows = WORKING_DOW.flatMap((dow) =>
      (["head", "deputy"] as const)
        .filter((role) => settingsMap[`${dow}-${role}`])
        .map((role) => ({ day_of_week: dow, role, teacher_id: settingsMap[`${dow}-${role}`] }))
    );
    const { error } = await supabase.from("duty_head_settings").upsert(rows, { onConflict: "day_of_week,role" });
    setSaving(false);
    if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); return; }
    setSavedMsg("บันทึกเรียบร้อยแล้ว");
    setTimeout(() => setSavedMsg(""), 2500);
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
            <ShieldCheck className="h-6 w-6 text-indigo-500" /> ตั้งค่าหัวหน้าเวร
          </h1>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={sameEveryDay} onChange={(e) => setSameEveryDay(e.target.checked)} className="h-4 w-4 rounded" />
          ใช้หัวหน้าเวร/รองหัวหน้าเวรชุดเดียวกันทุกวัน
        </label>

        {loading ? (
          <p className="mt-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : (
          <div className="mt-4 space-y-3">
            {WORKING_DOW.map((dow) => (
              <div key={dow} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <p className="text-sm font-extrabold text-slate-800">วัน{THAI_DOW[dow]}</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold text-slate-500">หัวหน้าเวร</label>
                    <TeacherSearchSelect
                      teachers={teachers}
                      value={settingsMap[`${dow}-head`] ?? ""}
                      onChange={(id) => setValue(dow, "head", id)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">รองหัวหน้าเวร</label>
                    <TeacherSearchSelect
                      teachers={teachers}
                      value={settingsMap[`${dow}-deputy`] ?? ""}
                      onChange={(id) => setValue(dow, "deputy", id)}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="sticky bottom-4 flex items-center justify-end gap-3">
              {savedMsg && <span className="text-sm font-semibold text-emerald-600">{savedMsg}</span>}
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ★ ช่องค้นหาแบบ autocomplete แทน <select> เดิม — พิมพ์ค้นหาได้ทั้งคำนำหน้า ชื่อ นามสกุล
function TeacherSearchSelect({
  teachers, value, onChange,
}: { teachers: Teacher[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = teachers.find((t) => t.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers.slice(0, 30); // ไม่พิมพ์อะไร โชว์ 30 คนแรกกันลิสต์ยาวเกิน
    return teachers
      .filter((t) => {
        const name = displayName(t).toLowerCase();
        const first = (t.first_name ?? "").toLowerCase();
        const last = (t.last_name ?? "").toLowerCase();
        const title = (t.title ?? "").toLowerCase();
        return name.includes(q) || first.includes(q) || last.includes(q) || title.includes(q);
      })
      .slice(0, 30);
  }, [teachers, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative mt-1">
      <div className="flex items-center gap-2 rounded-xl border-2 border-slate-200 px-3 py-2 focus-within:border-indigo-400">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          value={open ? query : selected ? displayName(selected) : ""}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          placeholder="พิมพ์ค้นหาชื่อครู..."
          className="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {selected && !open && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-slate-300 hover:text-slate-500">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">ไม่พบชื่อครูที่ตรงกับคำค้นหา</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onChange(t.id); setQuery(""); setOpen(false); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                <span className="text-slate-700">{displayName(t)}</span>
                {t.id === value && <Check className="h-3.5 w-3.5 text-indigo-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}