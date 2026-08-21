"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThaiDateSelect, { thaiDateToISO } from "@/components/shared/ThaiDateSelect";

const supabase = createClient();

export default function JoinPage() {
  const router = useRouter();
  const { joinCode } = useParams() as { joinCode: string };

  const [section, setSection] = useState<{ id: string; classroom_id: string; student_access_mode: string } | null>(null);
  const [students, setStudents] = useState<{ id: string; first_name: string; last_name: string; seat_number: number }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [dob, setDob] = useState<{ day: number | null; month: number | null; yearBE: number | null }>({ day: null, month: null, yearBE: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sec } = await supabase
        .from("subject_sections")
        .select("id, classroom_id, student_access_mode, student_portal_enabled")
        .eq("join_code", joinCode)
        .maybeSingle();
      if (!sec || !sec.student_portal_enabled) { setError("ไม่พบวิชานี้ หรือยังไม่เปิดให้เข้าใช้งาน"); setLoading(false); return; }
      setSection(sec as any);

      if (sec.student_access_mode !== "id_and_dob") {
        const { data: list } = await supabase
          .from("students")
          .select("id, first_name, last_name, seat_number")
          .eq("classroom_id", sec.classroom_id)
          .order("seat_number");
        setStudents(list ?? []);
      }
      setLoading(false);
    })();
  }, [joinCode]);

  async function handleSubmit() {
    if (!section) return;
    setError("");
    const mode = section.student_access_mode;

    const payload: any = { join_code: joinCode, mode };
    if (mode === "name_only" || mode === "name_and_id") {
      if (!selectedStudentId) { setError("กรุณาเลือกชื่อของตัวเอง"); return; }
      payload.student_id = selectedStudentId;
    }
    if (mode === "name_and_id") {
      if (!studentCode.trim()) { setError("กรุณากรอกรหัสนักเรียน"); return; }
      payload.student_code = studentCode.trim();
    }
    if (mode === "id_and_dob") {
      const iso = thaiDateToISO(dob);
      if (!studentCode.trim() || !iso) { setError("กรุณากรอกรหัสนักเรียนและวันเกิดให้ครบ"); return; }
      payload.student_code = studentCode.trim();
      payload.birth_date = iso;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/student-auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      router.push(`/student-portal/${json.student_id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">กำลังโหลด...</div>;
  if (!section) return <div className="min-h-screen flex items-center justify-center font-bold text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-['TH_Sarabun_New',_sans-serif]">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full max-w-sm p-6 space-y-4">
        <h1 className="text-lg font-black text-slate-800 text-center">เข้าสู่ระบบนักเรียน</h1>

        {section.student_access_mode !== "id_and_dob" && (
          <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold">
            <option value="">-- เลือกชื่อของคุณ --</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.seat_number}. {s.first_name} {s.last_name}</option>
            ))}
          </select>
        )}

        {(section.student_access_mode === "name_and_id" || section.student_access_mode === "id_and_dob") && (
          <input
            value={studentCode}
            onChange={e => setStudentCode(e.target.value)}
            placeholder="รหัสนักเรียน"
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
          />
        )}

        {section.student_access_mode === "id_and_dob" && (
          <ThaiDateSelect value={dob} onChange={setDob} />
        )}

        {error && <p className="text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-black text-sm disabled:opacity-50"
        >
          {submitting ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
        </button>
      </div>
    </div>
  );
}