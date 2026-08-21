"use client";
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export default function ThaiDateSelect({
  value, onChange,
}: {
  value: { day: number | null; month: number | null; yearBE: number | null };
  onChange: (v: { day: number | null; month: number | null; yearBE: number | null }) => void;
}) {
  const currentBE = new Date().getFullYear() + 543;
  const years = Array.from({ length: 80 }, (_, i) => currentBE - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={value.day ?? ""} onChange={e => onChange({ ...value, day: Number(e.target.value) || null })}
        className="border-2 border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold bg-white">
        <option value="">วัน</option>
        {days.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={value.month ?? ""} onChange={e => onChange({ ...value, month: Number(e.target.value) || null })}
        className="border-2 border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold bg-white">
        <option value="">เดือน</option>
        {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select value={value.yearBE ?? ""} onChange={e => onChange({ ...value, yearBE: Number(e.target.value) || null })}
        className="border-2 border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold bg-white">
        <option value="">ปี พ.ศ.</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

// helper แปลง {day, month, yearBE} -> "YYYY-MM-DD" (ค.ศ.) สำหรับส่งไป API
export function thaiDateToISO(v: { day: number | null; month: number | null; yearBE: number | null }): string | null {
  if (!v.day || !v.month || !v.yearBE) return null;
  const ceYear = v.yearBE - 543;
  const mm = String(v.month).padStart(2, "0");
  const dd = String(v.day).padStart(2, "0");
  return `${ceYear}-${mm}-${dd}`;
}