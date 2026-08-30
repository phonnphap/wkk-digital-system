"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, ShieldCheck, Save } from "lucide-react";
import { THAI_DOW, WORKING_DOW, Teacher, HeadSetting } from "@/lib/duty-helpers";

const supabase = createClient();

export default function DutyHeadSettingsPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({}); // key: `${dow}-${role}` -> teacher_id
  const [sameEveryDay, setSameEveryDay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("users").select("id, full_name").order("full_name"),
      supabase.from("duty_head_settings").select("day_of_week, role, teacher_id"),
    ]).then(([teacherRes, settingsRes]) => {
      setTeachers(teacherRes.data ?? []);
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
                    <select
                      value={settingsMap[`${dow}-head`] ?? ""}
                      onChange={(e) => setValue(dow, "head", e.target.value)}
                      className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">-- เลือกครู --</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">รองหัวหน้าเวร</label>
                    <select
                      value={settingsMap[`${dow}-deputy`] ?? ""}
                      onChange={(e) => setValue(dow, "deputy", e.target.value)}
                      className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">-- เลือกครู --</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
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