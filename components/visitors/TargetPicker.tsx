// path: components/visitors/TargetPicker.tsx
"use client";
import { useState } from "react";

export type Targets = { rooms: { id: string; label: string; grade: string }[]; admins: string[] };
export type Target = { type: "class" | "admin"; classroom_id?: string; label: string } | null;

export default function TargetPicker({
  targets, value, onChange, big = false,
}: { targets: Targets; value: Target; onChange: (t: Target) => void; big?: boolean }) {
  const [tab, setTab] = useState<"class" | "admin">(value?.type ?? "class");
  const [grade, setGrade] = useState<string>("");
  const grades = Array.from(new Set(targets.rooms.map(r => r.grade)));
  const sz = big ? "py-5 text-2xl" : "py-3 text-base";
  const on = "bg-teal-600 border-teal-600 text-white";
  const off = "bg-white border-slate-300 text-slate-700";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setTab("class")} className={`rounded-2xl border-2 font-extrabold ${sz} ${tab === "class" ? on : off}`}>🏫 ชั้นเรียน</button>
        <button type="button" onClick={() => setTab("admin")} className={`rounded-2xl border-2 font-extrabold ${sz} ${tab === "admin" ? on : off}`}>🏛️ ฝ่ายบริหาร</button>
      </div>

      {tab === "class" && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {grades.map(g => (
              <button key={g} type="button" onClick={() => setGrade(g)}
                className={`rounded-xl border-2 font-bold ${big ? "py-4 text-xl" : "py-2.5 text-sm"} ${grade === g ? "bg-sky-500 border-sky-500 text-white" : off}`}>{g}</button>
            ))}
          </div>
          {grade && (
            <div className="grid grid-cols-2 gap-2">
              {targets.rooms.filter(r => r.grade === grade).map(r => {
                const sel = value?.classroom_id === r.id;
                return (
                  <button key={r.id} type="button"
                    onClick={() => onChange({ type: "class", classroom_id: r.id, label: r.label })}
                    className={`rounded-xl border-2 font-bold ${big ? "py-4 text-xl" : "py-2.5 text-sm"} ${sel ? on : off}`}>{r.label}</button>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "admin" && (
        <div className="grid grid-cols-2 gap-2">
          {targets.admins.map(a => {
            const sel = value?.type === "admin" && value.label === a;
            return (
              <button key={a} type="button" onClick={() => onChange({ type: "admin", label: a })}
                className={`rounded-xl border-2 font-bold ${big ? "py-4 text-xl" : "py-2.5 text-sm"} ${sel ? on : off}`}>{a}</button>
            );
          })}
        </div>
      )}

      {value && (
        <p className={`font-extrabold text-teal-700 ${big ? "text-2xl" : "text-base"}`}>✔ เลือกแล้ว: {value.label}</p>
      )}
    </div>
  );
}