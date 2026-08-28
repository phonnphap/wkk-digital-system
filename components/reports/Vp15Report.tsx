"use client";

import { useEffect, useState } from "react";

const GRADE_LEVELS = ["0", "1", "1.5", "2", "2.5", "3", "3.5", "4"];

export default function Vp15Report({
  subjectId, academicYearId, subjectTitle, subjectCode, onBack,
}: {
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ subject_id: subjectId, ...(academicYearId ? { academic_year_id: academicYearId } : {}) });
        const res = await fetch(`/api/subject-grades/vp15-summary?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows(json.rows ?? []);
        setGrandTotal(json.grandTotal ?? null);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [subjectId, academicYearId]);

  function handlePrint() {
    window.print();
  }

  const gradedTotal = grandTotal ? GRADE_LEVELS.reduce((s, g) => s + (grandTotal.counts[g] ?? 0), 0) : 0;
  const level3to4 = grandTotal ? (grandTotal.counts["3"] + grandTotal.counts["3.5"] + grandTotal.counts["4"]) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <button onClick={onBack} className="text-m font-black text-slate-400 hover:text-slate-600 mb-1">← กลับ</button>
          <h2 className="font-black text-slate-800 text-lg">แบบวัดผล 15 — สรุปผลสัมฤทธิ์ทางการเรียน</h2>
          <p className="text-slate-400 text-m font-bold">{subjectCode} · {subjectTitle} · ทุกห้องเรียนของวิชานี้</p>
        </div>
        <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-base">
          🖨️ พิมพ์
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-300 font-bold text-base">กำลังโหลด...</div>
      ) : error ? (
        <p className="text-red-600 text-m font-bold bg-red-50 border-2 border-red-200 rounded-xl px-5 py-3">❌ {error}</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-slate-400 font-bold text-base py-10">ยังไม่มีห้องเรียนของวิชานี้</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 print:p-0 print:border-none print:shadow-none">
          <div className="text-center mb-4">
            <p className="font-black text-slate-700">แบบรายงานผลสัมฤทธิ์นักเรียน</p>
            <p className="text-m font-bold text-slate-400">รายวิชา {subjectCode} {subjectTitle}</p>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-m text-center">
              <thead>
                <tr className="bg-slate-50">
                  <th rowSpan={2} className="border border-slate-200 px-2 py-2">ห้องเรียน</th>
                  <th rowSpan={2} className="border border-slate-200 px-2 py-2">จำนวน<br/>นักเรียนที่เข้าสอบ</th>
                  <th colSpan={GRADE_LEVELS.length} className="border border-slate-200 px-2 py-2">ระดับผลการเรียน (จำนวนคน)</th>
                  <th rowSpan={2} className="border border-slate-200 px-2 py-2">ระดับผล<br/>เฉลี่ย</th>
                  <th colSpan={2} className="border border-slate-200 px-2 py-2">คะแนนสอบปลาย</th>
                </tr>
                <tr className="bg-slate-50">
                  {GRADE_LEVELS.map(g => <th key={g} className="border border-slate-200 px-2 py-1">{g}</th>)}
                  <th className="border border-slate-200 px-2 py-1">คะแนนรวม</th>
                  <th className="border border-slate-200 px-2 py-1">ร้อยละ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.section_id} className="hover:bg-slate-50/60">
                    <td className="border border-slate-200 px-2 py-1.5 font-bold">{r.room_label}</td>
                    <td className="border border-slate-200 px-2 py-1.5 font-black">{r.total_students}</td>
                    {GRADE_LEVELS.map(g => (
                      <td key={g} className="border border-slate-200 px-2 py-1.5">{r.counts[g] ?? 0}</td>
                    ))}
                    <td className="border border-slate-200 px-2 py-1.5 font-black">{r.avg_grade.toFixed(2)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 font-black">{r.score_sum}</td>
                    <td className="border border-slate-200 px-2 py-1.5 font-black">
                      {r.total_students > 0 ? (r.score_sum / r.total_students).toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
                {grandTotal && (
                  <tr className="bg-amber-50 font-black">
                    <td className="border border-slate-200 px-2 py-1.5">รวม</td>
                    <td className="border border-slate-200 px-2 py-1.5">{grandTotal.total_students}</td>
                    {GRADE_LEVELS.map(g => (
                      <td key={g} className="border border-slate-200 px-2 py-1.5">{grandTotal.counts[g] ?? 0}</td>
                    ))}
                    <td className="border border-slate-200 px-2 py-1.5">{grandTotal.avg_grade.toFixed(2)}</td>
                    <td className="border border-slate-200 px-2 py-1.5">{grandTotal.score_sum}</td>
                    <td className="border border-slate-200 px-2 py-1.5">
                      {grandTotal.total_students > 0 ? (grandTotal.score_sum / grandTotal.total_students).toFixed(2) : "-"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {grandTotal && (
            <div className="mt-4 flex flex-wrap gap-6 text-m font-bold text-slate-600">
              <p>จำนวนที่ได้ระดับ 3–4: <span className="font-black text-emerald-600">{level3to4}</span> คน</p>
              <p>คิดเป็นร้อยละ: <span className="font-black text-emerald-600">{gradedTotal > 0 ? ((level3to4 / gradedTotal) * 100).toFixed(2) : "0.00"}%</span></p>
            </div>
          )}

          {/* ช่องลงชื่อสำหรับพิมพ์ */}
          <div className="mt-10 space-y-8 text-m font-bold text-slate-600 print:mt-16">
            {["ครูประจำวิชา", "หัวหน้ากลุ่มสาระ", "หัวหน้ากลุ่มบริหารวิชาการ", "รองผู้อำนวยการโรงเรียน", "ผู้อำนวยการโรงเรียน"].map(role => (
              <p key={role} className="text-right pr-10">ลงชื่อ..................................................... {role}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}