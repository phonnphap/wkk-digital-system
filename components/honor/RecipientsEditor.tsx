'use client';

import { useEffect, useRef, useState } from 'react';
import type { AwardCategory, Recipient } from '@/types/honor';
import { RECIPIENT_ROLE_LABELS, RECIPIENT_ROLE_OPTIONS } from '@/types/honor';
import { fieldCls } from '@/lib/form-styles';
import { SCHOOL_NAME } from '@/lib/school-info';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

interface Props {
  category: AwardCategory;
  recipients: Recipient[];
  submitted: boolean;
  onChange: (recipients: Recipient[]) => void;
}

const emptyRecipient: Recipient = {
  recipient_name: '',
  student_id: '',
  grade_level: '',
  classroom: '',
  department: '',
  role: null,
};

// ══════════════════════════════════════════════════════════
// ค้นหาครู/บุคลากร — ดึงจากตาราง users
// กลุ่มสาระ: users.department_id -> ตาราง "departments" คอลัมน์ name
// ══════════════════════════════════════════════════════════
type TeacherHit = { id: string; displayName: string; department: string };

async function searchTeachers(
  query: string,
  deptMap: Record<string, string>
): Promise<{ hits: TeacherHit[]; errorMessage?: string }> {
  const q = query.trim();
  if (!q) return { hits: [] };
  const { data, error } = await supabase
    .from('users')
    .select('id, title, first_name, last_name, full_name, department_id')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,full_name.ilike.%${q}%`)
    .limit(10);
  if (error) {
    console.error('[searchTeachers] query failed:', error.message, error);
    return { hits: [], errorMessage: error.message };
  }
  if (!data) return { hits: [] };
  const hits = (data as any[]).map((u) => {
    const assembled = `${u.title ?? ''}${u.first_name ?? ''} ${u.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
    const department = deptMap[u.department_id] ?? '';
    return { id: u.id, displayName: assembled || u.full_name || '', department };
  });
  return { hits };
}

// ══════════════════════════════════════════════════════════
// ★ ค้นหาผู้บริหาร — ดึงจากตาราง users เหมือนครู
// ตำแหน่ง: users.academic_level เป็นข้อความอยู่แล้ว (ไม่มีตาราง academic_level แยก)
//   ดึงมาโชว์ตรงๆ ไม่ต้อง join
// ══════════════════════════════════════════════════════════
type ExecutiveHit = { id: string; displayName: string; position: string };

async function searchExecutives(
  query: string
): Promise<{ hits: ExecutiveHit[]; errorMessage?: string }> {
  const q = query.trim();
  if (!q) return { hits: [] };
  const { data, error } = await supabase
    .from('users')
    .select('id, title, first_name, last_name, full_name, academic_level')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,full_name.ilike.%${q}%`)
    .limit(10);
  if (error) {
    console.error('[searchExecutives] query failed:', error.message, error);
    return { hits: [], errorMessage: error.message };
  }
  if (!data) return { hits: [] };
  const hits = (data as any[]).map((u) => {
    const assembled = `${u.title ?? ''}${u.first_name ?? ''} ${u.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
    return { id: u.id, displayName: assembled || u.full_name || '', position: u.academic_level ?? '' };
  });
  return { hits };
}

// ══════════════════════════════════════════════════════════
// ค้นหานักเรียน — ตาราง students:
//   id, student_code, first_name, last_name, birth_date, gender, classroom_id
//   classroom_id -> ตาราง "classrooms" คอลัมน์ grade_group (ระดับชั้น) + room_name (ห้อง) แยกกัน
// คำนำหน้าคำนวณเอง:
//   อายุ < 15 ปี  -> male: เด็กชาย / female: เด็กหญิง
//   อายุ >= 15 ปี -> male: นาย     / female: นางสาว
// ══════════════════════════════════════════════════════════
type StudentHit = { id: string; displayName: string; student_id: string; grade_level: string; classroom: string };

function computeThaiTitle(gender: string | null | undefined, birthDate: string | null | undefined): string {
  const isMale = gender === 'male';
  let age: number | null = null;
  if (birthDate) {
    const b = new Date(birthDate);
    const now = new Date();
    age = now.getFullYear() - b.getFullYear();
    const monthDiff = now.getMonth() - b.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < b.getDate())) age--;
  }
  if (age !== null && age >= 15) {
    return isMale ? 'นาย' : 'นางสาว';
  }
  return isMale ? 'เด็กชาย' : 'เด็กหญิง';
}

// ★ classroomMap เก็บทั้ง grade_level (grade_group) และ classroom (room_name) แยกกัน
type ClassroomInfo = { grade_level: string; classroom: string };

async function searchStudents(
  query: string,
  classroomMap: Record<string, ClassroomInfo>
): Promise<{ hits: StudentHit[]; errorMessage?: string }> {
  const q = query.trim();
  if (!q) return { hits: [] };
  const { data, error } = await supabase
    .from('students')
    .select('id, student_code, first_name, last_name, birth_date, gender, classroom_id')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_code.ilike.%${q}%`)
    .limit(10);
  if (error) {
    console.error('[searchStudents] query failed:', error.message, error);
    return { hits: [], errorMessage: error.message };
  }
  if (!data) return { hits: [] };
  const hits = (data as any[]).map((s) => {
    const title = computeThaiTitle(s.gender, s.birth_date);
    const displayName = `${title}${s.first_name ?? ''} ${s.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
    const info = classroomMap[s.classroom_id] ?? { grade_level: '', classroom: '' };
    return {
      id: s.id,
      displayName,
      student_id: s.student_code ?? '',
      grade_level: info.grade_level,
      classroom: info.classroom,
    };
  });
  return { hits };
}

// ══════════════════════════════════════════════════════════
// ช่องค้นหาชื่อครู
// ══════════════════════════════════════════════════════════
function TeacherNameField({
  value, deptMap, invalid, onTextChange, onSelect,
}: {
  value: string;
  deptMap: Record<string, string>;
  invalid: boolean;
  onTextChange: (v: string) => void;
  onSelect: (hit: TeacherHit) => void;
}) {
  const [results, setResults] = useState<TeacherHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    onTextChange(v);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setErrorMsg(null); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const { hits, errorMessage } = await searchTeachers(v, deptMap);
      setResults(hits);
      setErrorMsg(errorMessage ?? null);
      setLoading(false);
    }, 300);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อ/นามสกุลเพื่อค้นหาในระบบ..."
        className={fieldCls(invalid)}
      />
      {open && (loading || results.length > 0 || errorMsg) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2.5 text-xs text-slate-400">🔍 กำลังค้นหา...</div>
          ) : errorMsg ? (
            <div className="px-3 py-2.5 text-xs text-red-600 font-bold">⚠️ ค้นหาไม่สำเร็จ: {errorMsg}</div>
          ) : (
            results.map((hit) => (
              <button
                type="button"
                key={hit.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(hit); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0"
              >
                <span className="font-bold text-slate-800">{hit.displayName}</span>
                {hit.department && <span className="text-xs text-slate-400">{hit.department}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ★ ช่องค้นหาชื่อผู้บริหาร แบบพิมพ์แล้วแสดงรายชื่อ+ตำแหน่งให้เลือก
// ══════════════════════════════════════════════════════════
function ExecutiveNameField({
  value, invalid, onTextChange, onSelect,
}: {
  value: string;
  invalid: boolean;
  onTextChange: (v: string) => void;
  onSelect: (hit: ExecutiveHit) => void;
}) {
  const [results, setResults] = useState<ExecutiveHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    onTextChange(v);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setErrorMsg(null); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const { hits, errorMessage } = await searchExecutives(v);
      setResults(hits);
      setErrorMsg(errorMessage ?? null);
      setLoading(false);
    }, 300);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อ/นามสกุลเพื่อค้นหาในระบบ..."
        className={fieldCls(invalid)}
      />
      {open && (loading || results.length > 0 || errorMsg) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2.5 text-xs text-slate-400">🔍 กำลังค้นหา...</div>
          ) : errorMsg ? (
            <div className="px-3 py-2.5 text-xs text-red-600 font-bold">⚠️ ค้นหาไม่สำเร็จ: {errorMsg}</div>
          ) : (
            results.map((hit) => (
              <button
                type="button"
                key={hit.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(hit); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0"
              >
                <span className="font-bold text-slate-800">{hit.displayName}</span>
                {hit.position && <span className="text-xs text-slate-400">{hit.position}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ช่องค้นหาชื่อนักเรียน — โชว์ทั้งระดับชั้นและห้องเรียนแยกกัน
// ══════════════════════════════════════════════════════════
function StudentNameField({
  value, classroomMap, invalid, onTextChange, onSelect,
}: {
  value: string;
  classroomMap: Record<string, ClassroomInfo>;
  invalid: boolean;
  onTextChange: (v: string) => void;
  onSelect: (hit: StudentHit) => void;
}) {
  const [results, setResults] = useState<StudentHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    onTextChange(v);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setErrorMsg(null); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const { hits, errorMessage } = await searchStudents(v, classroomMap);
      setResults(hits);
      setErrorMsg(errorMessage ?? null);
      setLoading(false);
    }, 300);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อ/นามสกุล/รหัสนักเรียนเพื่อค้นหา..."
        className={fieldCls(invalid)}
      />
      {open && (loading || results.length > 0 || errorMsg) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2.5 text-xs text-slate-400">🔍 กำลังค้นหา...</div>
          ) : errorMsg ? (
            <div className="px-3 py-2.5 text-xs text-red-600 font-bold">⚠️ ค้นหาไม่สำเร็จ: {errorMsg}</div>
          ) : (
            results.map((hit) => (
              <button
                type="button"
                key={hit.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(hit); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0"
              >
                <span className="font-bold text-slate-800">{hit.displayName}</span>
                <span className="text-xs text-slate-400">
                  {[hit.student_id, hit.grade_level, hit.classroom].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function RecipientsEditor({ category, recipients, submitted, onChange }: Props) {
  const isSchool = category === 'School';
  const supportsTeam = category === 'Teacher' || category === 'Student' || category === 'Executive';

  const [deptMap, setDeptMap] = useState<Record<string, string>>({});
  const [classroomMap, setClassroomMap] = useState<Record<string, ClassroomInfo>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('departments').select('id, name');
      if (error) {
        console.error('[RecipientsEditor] โหลดตาราง departments ไม่สำเร็จ:', error.message, error);
        setLoadError((prev) => prev ?? `โหลดตารางกลุ่มสาระ (departments) ไม่สำเร็จ: ${error.message}`);
        return;
      }
      const map: Record<string, string> = {};
      (data || []).forEach((d: any) => { map[d.id] = d.name; });
      setDeptMap(map);
    })();

    (async () => {
      // ★ ดึงทั้ง grade_group (ระดับชั้น) และ room_name (ห้องเรียน) แยกกัน
      const { data, error } = await supabase.from('classrooms').select('id, room_name, grade_group');
      if (error) {
        console.error('[RecipientsEditor] โหลดตาราง classrooms ไม่สำเร็จ:', error.message, error);
        setLoadError((prev) => prev ?? `โหลดตารางห้องเรียน (classrooms) ไม่สำเร็จ: ${error.message}`);
        return;
      }
      const map: Record<string, ClassroomInfo> = {};
      (data || []).forEach((c: any) => {
        map[c.id] = { grade_level: c.grade_group ?? '', classroom: c.room_name ?? '' };
      });
      setClassroomMap(map);
    })();
  }, []);

  const update = (index: number, patch: Partial<Recipient>) => {
    const next = recipients.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const addRow = () => onChange([...recipients, { ...emptyRecipient }]);
  const removeRow = (index: number) => {
    if (recipients.length === 1) return;
    onChange(recipients.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {loadError && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          ⚠️ {loadError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-ink">
          ผู้รับรางวัล {supportsTeam && <span className="text-muted font-normal">(รองรับรางวัลประเภททีม)</span>}
        </h3>
        {supportsTeam && (
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-semibold text-gold-dark hover:underline"
          >
            + เพิ่มผู้รับรางวัล
          </button>
        )}
      </div>

      <div className="space-y-3">
        {recipients.map((r, i) => {
          const nameInvalid = submitted && !isSchool && !r.recipient_name.trim();
          return (
            <div key={i} className="rounded-md border border-navy/10 bg-parchment2/40 p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted font-medium">
                    {category === 'School' ? 'ชื่อโรงเรียน *' : category === 'Executive' ? 'ชื่อผู้บริหาร *' : 'ชื่อ-สกุล *'}
                  </span>

                  {isSchool ? (
                    <input
                      type="text"
                      value={SCHOOL_NAME}
                      readOnly
                      className={fieldCls(false, 'bg-slate-100 text-slate-600 cursor-not-allowed')}
                    />
                  ) : category === 'Teacher' ? (
                    <TeacherNameField
                      value={r.recipient_name}
                      deptMap={deptMap}
                      invalid={nameInvalid}
                      onTextChange={(v) => update(i, { recipient_name: v })}
                      onSelect={(hit) => update(i, { recipient_name: hit.displayName, department: hit.department })}
                    />
                  ) : category === 'Executive' ? (
                    // ★ ค้นหาจาก users เหมือนครู แล้วดึงตำแหน่งจาก academic_level มา autofill ช่องตำแหน่ง
                    <ExecutiveNameField
                      value={r.recipient_name}
                      invalid={nameInvalid}
                      onTextChange={(v) => update(i, { recipient_name: v })}
                      onSelect={(hit) => update(i, { recipient_name: hit.displayName, department: hit.position })}
                    />
                  ) : category === 'Student' ? (
                    <StudentNameField
                      value={r.recipient_name}
                      classroomMap={classroomMap}
                      invalid={nameInvalid}
                      onTextChange={(v) => update(i, { recipient_name: v })}
                      onSelect={(hit) =>
                        update(i, {
                          recipient_name: hit.displayName,
                          student_id: hit.student_id,
                          grade_level: hit.grade_level,
                          classroom: hit.classroom, // ★ เพิ่ม — ตอนก่อนหน้าไม่เคย set ค่านี้เลย
                        })
                      }
                    />
                  ) : (
                    <input
                      type="text"
                      value={r.recipient_name}
                      onChange={(e) => update(i, { recipient_name: e.target.value })}
                      className={fieldCls(nameInvalid)}
                    />
                  )}

                  {nameInvalid && <p className="text-xs text-red-500">กรุณากรอกชื่อผู้รับรางวัล</p>}
                  {isSchool && (
                    <p className="text-xs text-muted">ชื่อโรงเรียนถูกกำหนดอัตโนมัติ ไม่สามารถแก้ไขได้</p>
                  )}
                </label>

                {category === 'Student' && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">รหัสนักเรียน</span>
                      <input
                        type="text"
                        value={r.student_id ?? ''}
                        onChange={(e) => update(i, { student_id: e.target.value })}
                        className={fieldCls(false, 'font-mono')}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">ระดับชั้น</span>
                      <input
                        type="text"
                        placeholder="เช่น มัธยมศึกษาตอนต้น"
                        value={r.grade_level ?? ''}
                        onChange={(e) => update(i, { grade_level: e.target.value })}
                        className={fieldCls(false)}
                      />
                    </label>
                    {/* ★ เพิ่มช่องห้องเรียน — เดิมไม่มีเลยแม้ type จะรองรับ */}
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">ห้องเรียน</span>
                      <input
                        type="text"
                        placeholder="เช่น ม.3/1"
                        value={r.classroom ?? ''}
                        onChange={(e) => update(i, { classroom: e.target.value })}
                        className={fieldCls(false)}
                      />
                    </label>
                  </>
                )}

                {category === 'Teacher' && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">กลุ่มสาระ/ฝ่ายงาน</span>
                      <input
                        type="text"
                        value={r.department ?? ''}
                        onChange={(e) => update(i, { department: e.target.value })}
                        className={fieldCls(false)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">บทบาทในรางวัล</span>
                      <select
                        value={r.role ?? ''}
                        onChange={(e) => update(i, { role: (e.target.value || null) as Recipient['role'] })}
                        className={fieldCls(false)}
                      >
                        <option value="">— เลือก —</option>
                        {RECIPIENT_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{RECIPIENT_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                {category === 'Executive' && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">ตำแหน่ง</span>
                    <input
                      type="text"
                      value={r.department ?? ''}
                      onChange={(e) => update(i, { department: e.target.value })}
                      className={fieldCls(false)}
                    />
                  </label>
                )}
              </div>

              {supportsTeam && recipients.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="mt-2 text-xs text-clay hover:underline"
                >
                  − ลบผู้รับรางวัลคนนี้
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}