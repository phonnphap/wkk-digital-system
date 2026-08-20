"use client";

import { useEffect, useState } from "react";

type Unit = {
  unit_no: number;
  unit_name: string;
  indicators: string;
  learning_hours: number | null;
  score_points: number | null;
  note: string | null;
};

function emptyUnit(no: number): Unit {
  return { unit_no: no, unit_name: "", indicators: "", learning_hours: null, score_points: null, note: "" };
}

export default function Vp71Tool({
  subjectId, academicYearId, subjectTitle, subjectCode, currentUserId, readOnly, onBack,
}: {
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  currentUserId?: string;
  readOnly?: boolean;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ subject_id: subjectId, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
        const res = await fetch(`/api/subject-teaching-units?${qs.toString()}`);
        const json = await res.json();
        const rows: Unit[] = (json.units ?? []).map((u: any) => ({
          unit_no: u.unit_no, unit_name: u.unit_name, indicators: u.indicators,
          learning_hours: u.learning_hours, score_points: u.score_points, note: u.note,
        }));
        setUnits(rows.length > 0 ? rows : [emptyUnit(1)]);
      } catch {
        setUnits([emptyUnit(1)]);
      } finally {
        setLoading(false);
      }
    })();
  }, [subjectId, academicYearId]);

  function updateUnit(i: number, field: keyof Unit, value: any) {
    setUnits(prev => prev.map((u, idx) => (idx === i ? { ...u, [field]: value } : u)));
  }
  function addUnit() {
    setUnits(prev => [...prev, emptyUnit(prev.length + 1)]);
  }
  function removeUnit(i: number) {
    setUnits(prev => prev.filter((_, idx) => idx !== i).map((u, idx) => ({ ...u, unit_no: idx + 1 })));
  }

  const totalHours = units.reduce((s, u) => s + (Number(u.learning_hours) || 0), 0);
  const totalScore = units.reduce((s, u) => s + (Number(u.score_points) || 0), 0);

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    try {
      const res = await fetch("/api/subject-teaching-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId,
          academic_year_id: academicYearId ?? null,
          rows: units,
          updated_by: currentUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setSavedAt(Date.now());
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <button onClick={onBack} className="text-xs font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          <h2 className="font-black text-slate-800 text-lg">วผ.7.1 แผนการวัดและประเมินผล</h2>
          <p className="text-slate-400 text-xs font-bold">
            {subjectCode} · {subjectTitle} · ข้อมูลนี้ใช้ร่วมกันทุกห้อง/ทุกครูที่สอนวิชานี้
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm">
            🖨️ พิมพ์
          </button>
          {!readOnly && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 text-white font-black text-sm">
              {saving ? "กำลังบันทึก..." : "💾 บันทึกทั้งหมด"}
            </button>
          )}
        </div>
      </div>
      {savedAt && !saving && (
        <p className="text-xs font-black text-emerald-500 print:hidden">✅ บันทึกแล้ว</p>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-sm">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-auto">
          <table className="w-full min-w-[880px] border-collapse text-xs">
            <thead className="bg-gradient-to-r from-indigo-50 to-fuchsia-50">
              <tr>
                <th className="px-2 py-3 font-black text-slate-600 w-10">หน่วยที่</th>
                <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[180px]">ชื่อหน่วยการเรียนรู้</th>
                <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[280px]">ตัวชี้วัด (พิมพ์ 1 บรรทัดต่อ 1 ข้อ)</th>
                <th className="px-2 py-3 font-black text-slate-600 w-24">จำนวนชั่วโมง</th>
                <th className="px-2 py-3 font-black text-slate-600 w-24">คะแนนเก็บ</th>
                <th className="px-3 py-3 text-left font-black text-slate-600 min-w-[140px]">หมายเหตุ</th>
                <th className="px-2 py-3 w-8 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="text-center px-2 py-2 font-black text-slate-500">{u.unit_no}</td>
                  <td className="px-2 py-2">
                    <input
                      value={u.unit_name} disabled={readOnly}
                      onChange={e => updateUnit(i, "unit_name", e.target.value)}
                      placeholder="เช่น หน่วยที่ 1 ระบบคอมพิวเตอร์"
                      className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <textarea
                      value={u.indicators} disabled={readOnly} rows={3}
                      onChange={e => updateUnit(i, "indicators", e.target.value)}
                      placeholder={"ว 4.2 ป.1/1 ...\nว 4.2 ป.1/2 ..."}
                      className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold resize-y disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number" min={0} value={u.learning_hours ?? ""} disabled={readOnly}
                      onChange={e => updateUnit(i, "learning_hours", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-full text-center border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number" min={0} value={u.score_points ?? ""} disabled={readOnly}
                      onChange={e => updateUnit(i, "score_points", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-full text-center border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={u.note ?? ""} disabled={readOnly}
                      onChange={e => updateUnit(i, "note", e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-lg px-2 py-1.5 font-bold disabled:bg-slate-50"
                    />
                  </td>
                  <td className="text-center px-1 py-2 print:hidden">
                    {!readOnly && units.length > 1 && (
                      <button onClick={() => removeUnit(i)} className="text-red-400 hover:text-red-600 font-black">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-black">
                <td colSpan={3} className="px-3 py-2 text-right">รวม</td>
                <td className="text-center px-2 py-2">{totalHours || "-"}</td>
                <td className="text-center px-2 py-2">{totalScore || "-"}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!readOnly && (
        <button onClick={addUnit} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-500 font-black text-xs print:hidden">
          + เพิ่มหน่วยการเรียนรู้
        </button>
      )}
    </div>
  );
}