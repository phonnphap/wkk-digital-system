"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const GRADE_LEVELS = ["0", "1", "1.5", "2", "2.5", "3", "3.5", "4"];

// ★ ต่อ title + ชื่อ + สกุล เป็นชื่อเต็มพร้อมคำนำหน้า (รูปแบบเดียวกับที่ใช้ใน Vp3Report/Vp4Report)
function buildNameWithTitle(person: {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
} | null | undefined): string {
  if (!person) return "";
  const title = person.title ?? "";
  const base =
    person.full_name?.trim() ||
    `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  if (!base) return "";
  if (title && base.startsWith(title)) return base;
  return `${title}${base}`;
}

// ★ เช็คว่า extra_roles (array) มี role ที่ต้องการอยู่หรือไม่
function hasRole(extraRoles: unknown, role: string): boolean {
  return Array.isArray(extraRoles) && extraRoles.some(r => typeof r === "string" && r.includes(role));
}

// ★ ดึงเลขห้องท้ายสุดจาก room_label เพื่อใช้เรียงลำดับ เช่น "ม.1/7" -> 7, "ป.4/12" -> 12
// ถ้าหา /เลข ไม่เจอ ให้ถือว่าเป็นค่ามากสุด (Infinity) จะได้ถูกเรียงไปอยู่ท้ายตารางเสมอ ไม่ปนกับห้องปกติ
function getRoomSortKey(roomLabel: string): number {
  const match = roomLabel.match(/\/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

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

  // ★ ชื่อผู้ลงนามแต่ละตำแหน่ง — ดึงจากฐานข้อมูลเพื่อโชว์เป็นวงเล็บใต้ตำแหน่งตอนพิมพ์
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const [deptHeadName, setDeptHeadName] = useState("");
  const [academicHeadName, setAcademicHeadName] = useState("");
  const [deputyDirectorName, setDeputyDirectorName] = useState("");
  const [directorName, setDirectorName] = useState("");

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

  // ★ เรียงห้องจากน้อยไปมากตามเลขท้าย room_label (/1, /2, ... /7) ก่อนแสดงผล
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => getRoomSortKey(a.room_label) - getRoomSortKey(b.room_label));
  }, [rows]);

  // ★ ดึงชื่อผู้ลงนามทั้ง 5 ตำแหน่งสำหรับใส่วงเล็บใต้ตำแหน่งตอนพิมพ์
  useEffect(() => {
    (async () => {
      try {
        // 1) ครูประจำวิชา — เอาจากทุกห้อง (subject_sections) ของวิชานี้ ตัดชื่อซ้ำออก
        //    ถ้ามีมากกว่า 1 คน (สอนคนละห้อง) จะรวมเป็น "ชื่อครู1 / ชื่อครู2"
        let sectionQuery = supabase
          .from("subject_sections")
          .select("teacher_id")
          .eq("subject_id", subjectId);
        if (academicYearId) sectionQuery = sectionQuery.eq("academic_year_id", academicYearId);
        const { data: sectionRows } = await sectionQuery;

        const teacherIds = Array.from(
          new Set((sectionRows ?? []).map((s: any) => s.teacher_id).filter(Boolean))
        );

        let teacherNameList: string[] = [];
        if (teacherIds.length > 0) {
          const { data: teacherRows } = await supabase
            .from("users")
            .select("id, title, first_name, last_name, full_name")
            .in("id", teacherIds);
          teacherNameList = (teacherRows ?? [])
            .map((t: any) => buildNameWithTitle(t))
            .filter(Boolean);
        }
        setTeacherNames(teacherNameList);

        // 2) หา department_id ของวิชานี้ เพื่อใช้จับคู่ "หัวหน้ากลุ่มสาระ" ให้ตรงกลุ่มสาระของวิชา
        const { data: subjectRow } = await supabase
          .from("subjects")
          .select("department_id")
          .eq("id", subjectId)
          .maybeSingle();
        const subjectDeptId = (subjectRow as any)?.department_id ?? null;

        // 3) ดึงผู้ใช้ทุกคนที่มี extra_roles เพื่อหาตำแหน่งบริหารทั้ง 4 ตำแหน่งที่เหลือ
        const { data: roleUsers } = await supabase
          .from("users")
          .select("title, first_name, last_name, full_name, extra_roles, department_id")
          .not("extra_roles", "is", null);

        const users = roleUsers ?? [];

        // หัวหน้ากลุ่มสาระ: extra_roles มี "department_head" และ department_id ตรงกับวิชานี้
        const deptHead = subjectDeptId
          ? users.find((u: any) => hasRole(u.extra_roles, "department_head") && u.department_id === subjectDeptId)
          : null;
        setDeptHeadName(buildNameWithTitle(deptHead as any));

        // หัวหน้ากลุ่มบริหารวิชาการ: ตำแหน่งเดียวทั้งโรงเรียน ไม่ผูกกับกลุ่มสาระ
        const academicHead = users.find((u: any) => hasRole(u.extra_roles, "academic_head"));
        setAcademicHeadName(buildNameWithTitle(academicHead as any));

        // รองผู้อำนวยการโรงเรียน
        const deputyDirector = users.find((u: any) => hasRole(u.extra_roles, "deputy_director"));
        setDeputyDirectorName(buildNameWithTitle(deputyDirector as any));

        // ผู้อำนวยการโรงเรียน
        const director = users.find((u: any) => hasRole(u.extra_roles, "director"));
        setDirectorName(buildNameWithTitle(director as any));
      } catch (e) {
        console.error("[Vp15Report] โหลดชื่อผู้ลงนามไม่สำเร็จ:", e);
      }
    })();
  }, [subjectId, academicYearId]);

  // ★ รวมชื่อผู้ลงนามแต่ละตำแหน่งเข้ากับ role สำหรับ render ใต้เส้นลงชื่อ
  const signatureRoles = useMemo(
    () => [
      { role: "ครูประจำวิชา", name: teacherNames.join(" / ") },
      { role: "หัวหน้ากลุ่มสาระ", name: deptHeadName },
      { role: "หัวหน้ากลุ่มบริหารวิชาการ", name: academicHeadName },
      { role: "รองผู้อำนวยการโรงเรียน", name: deputyDirectorName },
      { role: "ผู้อำนวยการโรงเรียน", name: directorName },
    ],
    [teacherNames, deptHeadName, academicHeadName, deputyDirectorName, directorName]
  );

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
      ) : sortedRows.length === 0 ? (
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
                {sortedRows.map(r => (
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

          {/* ช่องลงชื่อสำหรับพิมพ์ — มีวงเล็บชื่อผู้ลงนามแสดงอยู่ใต้ตำแหน่งแต่ละช่อง */}
          <div className="mt-10 space-y-6 text-m font-bold text-slate-600 print:mt-16">
            {signatureRoles.map(({ role, name }) => (
              <div key={role}>
                <p className="text-right pr-10">ลงชื่อ..................................................... {role}</p>
                <p className="text-right pr-10 text-slate-400 font-bold">
                  ({name || "..............................."})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}