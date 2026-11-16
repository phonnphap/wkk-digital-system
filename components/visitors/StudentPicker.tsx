// path: components/visitors/StudentPicker.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getDisplayPrefix } from "@/lib/student-prefix";

export type PickedStudent = { id: string; name: string } | null;
type S = {
  id: string; seat_number: number | null; prefix: string | null; first_name: string;
  last_name: string; nick_name: string | null; gender: string | null; birth_date: string | null;
};

export default function StudentPicker({
  classroomId, value, onChange, big = false,
}: { classroomId: string; value: PickedStudent; onChange: (s: PickedStudent) => void; big?: boolean }) {
  const [list, setList] = useState<S[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true); setQ(""); onChange(null);
    fetch(`/api/visitors/students?classroom_id=${classroomId}`, {
      headers: { "x-guard-key": localStorage.getItem("guard_key") ?? "" },
    })
      .then((r) => r.json())
      .then((j) => setList(j.students ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return list;
    return list.filter((s) => `${s.first_name} ${s.last_name} ${s.nick_name ?? ""}`.toLowerCase().includes(k));
  }, [list, q]);

  const full = (s: S) => `${getDisplayPrefix(s.gender, s.birth_date, s.prefix)}${s.first_name} ${s.last_name}`;

  return (
    <div className="space-y-2">
      <p className={`font-bold text-slate-600 ${big ? "text-xl" : "text-sm"}`}>
        มาหาใคร (นักเรียน) <span className="text-rose-500">*</span>
      </p>
      {list.length > 12 && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / ชื่อเล่น"
            className="w-full bg-transparent outline-none" />
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-3 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดรายชื่อ...</p>
      ) : shown.length === 0 ? (
        <p className="py-3 text-slate-400">ไม่พบรายชื่อนักเรียน</p>
      ) : (
        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {shown.map((s) => {
            const sel = value?.id === s.id;
            return (
              <button key={s.id} type="button" onClick={() => onChange(sel ? null : { id: s.id, name: full(s) })}
                className={`flex items-center gap-3 rounded-xl border-2 px-3 text-left font-bold ${big ? "py-4 text-xl" : "py-2.5 text-sm"} ${
                  sel ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                <span className={`grid shrink-0 place-items-center rounded-lg bg-slate-100 font-extrabold text-slate-600 ${big ? "h-10 w-10" : "h-8 w-8"}`}>
                  {s.seat_number ?? "-"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {full(s)}
                  {s.nick_name && <span className={`ml-1 font-normal ${sel ? "text-teal-100" : "text-slate-400"}`}>({s.nick_name})</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}