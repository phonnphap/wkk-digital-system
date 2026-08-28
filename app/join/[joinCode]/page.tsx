"use client";
export const dynamic = "force-dynamic"; // ★ เพิ่ม: กัน error ตอน build เพราะเพิ่ม useSearchParams() เข้ามา
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation"; // ★ เพิ่ม useSearchParams
import { createClient } from "@/lib/supabase/client";
import ThaiDateSelect, { thaiDateToISO } from "@/components/shared/ThaiDateSelect";

const supabase = createClient();

type Entity = {
  type: "subject" | "classroom";
  classroomId: string;
  accessMode: string;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  seat_number: number;
  gender: string | null;
  birth_date: string | null;
};

// ★ เพิ่มใหม่: คำนวณคำนำหน้าจากอายุจริง (วันเกิด+เพศ) แทนค่า prefix ที่บันทึกไว้ในตาราง
// ชาย อายุ >= 15 = "นาย" / น้อยกว่า = "เด็กชาย" ・ หญิง อายุ >= 15 = "นางสาว" / น้อยกว่า = "เด็กหญิง"
function getAutoPrefix(gender: string | null, birthDateStr: string | null): string {
  if (!gender || !birthDateStr) return "";
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;
  if (gender === "male") return age >= 15 ? "นาย" : "เด็กชาย";
  if (gender === "female") return age >= 15 ? "นางสาว" : "เด็กหญิง";
  return "";
}

function studentFullLabel(s: Student) {
  return `${s.seat_number}. ${getAutoPrefix(s.gender, s.birth_date)}${s.first_name} ${s.last_name}`;
}

export default function JoinPage() {
  const router = useRouter();
  const { joinCode } = useParams() as { joinCode: string };
  const searchParams = useSearchParams(); // ★ เพิ่มใหม่

  const [entity, setEntity] = useState<Entity | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [prefilledCode, setPrefilledCode] = useState(false); // ★ เพิ่มใหม่: มาจากการสแกน QR การ์ด นร. หรือไม่
  const [dob, setDob] = useState<{ day: number | null; month: number | null; yearBE: number | null }>({ day: null, month: null, yearBE: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ★ เพิ่มใหม่: ช่องค้นหาชื่อนักเรียน (แทน select เดิม)
  const [nameQuery, setNameQuery] = useState("");
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const nameBoxRef = useRef<HTMLDivElement>(null);

  // ★ เพิ่มใหม่: ถ้ามาจากการ์ด QR จะแนบ ?code=รหัสนักเรียน มาด้วย เติมลงช่องให้อัตโนมัติ
  // เพื่อให้นักเรียนกรอกแค่วันเกิดอย่างเดียว (เฉพาะโหมด id_and_dob เท่านั้นที่ใช้ช่องนี้)
  useEffect(() => {
    const codeFromQr = searchParams.get("code");
    if (codeFromQr) {
      setStudentCode(codeFromQr);
      setPrefilledCode(true);
    }
  }, [searchParams]);

  // ★ เพิ่มใหม่: ปิด dropdown เมื่อคลิกนอกกล่อง
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (nameBoxRef.current && !nameBoxRef.current.contains(e.target as Node)) {
        setShowNameDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    (async () => {
      // 1) ลองหาเป็น "โค้ดรายวิชา" ก่อน (ของเดิม)
      const { data: sec } = await supabase
        .from("subject_sections")
        .select("id, classroom_id, student_access_mode, student_portal_enabled")
        .eq("join_code", joinCode)
        .maybeSingle();

      let resolvedEntity: Entity | null = null;

      if (sec && sec.student_portal_enabled) {
        resolvedEntity = { type: "subject", classroomId: sec.classroom_id, accessMode: sec.student_access_mode };
      } else {
        // 2) ไม่เจอ → ลองหาเป็น "โค้ดห้องเรียน" (โค้ดหลัก จากครูประจำชั้น)
        const { data: cls } = await supabase
          .from("classrooms")
          .select("id, student_access_mode, student_portal_enabled")
          .eq("join_code", joinCode)
          .maybeSingle();

        if (cls && cls.student_portal_enabled) {
          resolvedEntity = { type: "classroom", classroomId: cls.id, accessMode: cls.student_access_mode };
        }
      }

      if (!resolvedEntity) {
        setError("ไม่พบโค้ดนี้ หรือยังไม่เปิดให้เข้าใช้งาน");
        setLoading(false);
        return;
      }

      setEntity(resolvedEntity);

      if (resolvedEntity.accessMode !== "id_and_dob") {
        const { data: list } = await supabase
          .from("students")
          .select("id, first_name, last_name, seat_number, gender, birth_date") // ★ เพิ่ม gender, birth_date เพื่อคำนวณคำนำหน้า
          .eq("classroom_id", resolvedEntity.classroomId)
          .order("seat_number");
        setStudents(list ?? []);
      }
      setLoading(false);
    })();
  }, [joinCode]);

  // ★ เพิ่มใหม่: กรองรายชื่อตามคำค้นหา (ค้นได้ทั้งชื่อ นามสกุล และเลขที่)
  const filteredStudents = nameQuery.trim()
    ? students.filter((s) => {
        const q = nameQuery.trim().toLowerCase();
        return (
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q) ||
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
          String(s.seat_number).includes(q)
        );
      })
    : students;

  function handleSelectStudent(s: Student) {
    setSelectedStudentId(s.id);
    setNameQuery(studentFullLabel(s));
    setShowNameDropdown(false);
  }

  function handleNameQueryChange(value: string) {
    setNameQuery(value);
    setShowNameDropdown(true);
    // ถ้าพิมพ์แก้ไขหลังจากเลือกไปแล้ว ให้ล้างค่าที่เลือกไว้ จนกว่าจะเลือกใหม่
    if (selectedStudentId) setSelectedStudentId("");
  }

  async function handleSubmit() {
    if (!entity) return;
    setError("");
    const mode = entity.accessMode;

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

      // ★ ถ้ามี redirect_section_id (เข้าด้วยโค้ดรายวิชา) → เด้งตรงไปหน้าวิชานั้นเลย
      //   ถ้าไม่มี (เข้าด้วยโค้ดห้องเรียน) → เด้งไปตารางเรียนรวม
      if (json.redirect_section_id) {
        router.push(`/student-portal/${json.student_id}/subject/${json.redirect_section_id}`);
      } else {
        router.push(`/student-portal/${json.student_id}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">กำลังโหลด...</div>;
  if (!entity) return <div className="min-h-screen flex items-center justify-center font-bold text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-['TH_Sarabun_New',_sans-serif]">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full max-w-sm p-6 space-y-4">
        {/* ★ เพิ่มใหม่: โลโก้โรงเรียน ด้านบนตรงกลาง */}
        <div className="flex justify-center">
          {/* วางไฟล์โลโก้ไว้ที่ public/logo.png (หรือแก้ path ตามจริง) */}
          <img
            src="/school-logo.png"
            alt="โลโก้โรงเรียน"
            className="h-16 w-16 object-contain"
            onError={(e) => {
              // ถ้าไม่มีไฟล์โลโก้ ให้ซ่อนรูปแทนที่จะโชว์ไอคอนรูปหาย
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <h1 className="text-xl font-black text-slate-900 text-center">เข้าสู่ระบบนักเรียน</h1>

        {entity.accessMode !== "id_and_dob" && (
          // ★ แก้ไข: เปลี่ยนจาก <select> เป็นช่องพิมพ์ค้นหาชื่อ (combobox)
          <div className="relative" ref={nameBoxRef}>
            <input
              value={nameQuery}
              onChange={(e) => handleNameQueryChange(e.target.value)}
              onFocus={() => setShowNameDropdown(true)}
              placeholder="พิมพ์ชื่อ นามสกุล หรือเลขที่ เพื่อค้นหา"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-m font-bold"
              autoComplete="off"
            />
            {showNameDropdown && (
              <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border-2 border-slate-200 rounded-xl shadow-sm">
                {filteredStudents.length === 0 && (
                  <div className="px-3 py-2.5 text-m font-bold text-slate-400">ไม่พบชื่อที่ค้นหา</div>
                )}
                {filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectStudent(s)}
                    className={`w-full text-left px-3 py-2.5 text-m font-bold hover:bg-fuchsia-50 ${
                      selectedStudentId === s.id ? "bg-fuchsia-50 text-fuchsia-600" : "text-slate-900"
                    }`}
                  >
                    {studentFullLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(entity.accessMode === "name_and_id" || entity.accessMode === "id_and_dob") && (
          // ★ ถ้ามาจาก QR การ์ด นร. (มี ?code= แนบมา) ให้ล็อกช่องนี้ไว้ ไม่ต้องพิมพ์ซ้ำ
          //   กันพิมพ์รหัสตัวเองผิด/สลับกับเพื่อน และลดขั้นตอนเหลือแค่กรอกวันเกิดอย่างเดียว
          <div>
            <input
              value={studentCode}
              onChange={e => setStudentCode(e.target.value)}
              placeholder="รหัสนักเรียน"
              readOnly={prefilledCode}
              className={`w-full border-2 rounded-xl px-3 py-2.5 text-m font-bold ${
                prefilledCode ? "border-slate-100 bg-slate-50 text-slate-500" : "border-slate-200"
              }`}
            />
            {prefilledCode && (
              <p className="mt-1 text-[11px] font-bold text-slate-400">
                ระบุจากการ์ดนักเรียนแล้ว — กรอกแค่วันเกิดด้านล่าง
              </p>
            )}
          </div>
        )}

        {entity.accessMode === "id_and_dob" && (
          <ThaiDateSelect value={dob} onChange={setDob} />
        )}

        {error && <p className="text-xs font-black text-red-500 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-black text-m disabled:opacity-50"
        >
          {submitting ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
        </button>
      </div>
    </div>
  );
}