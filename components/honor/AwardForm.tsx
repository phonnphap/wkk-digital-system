'use client';

// ══════════════════════════════════════════════════════════════════════════
// AwardForm.tsx — รวมทุกอย่างที่เกี่ยวกับ "ฟอร์มบันทึก/แก้ไขรางวัล" ไว้ไฟล์เดียว
// (เดิมแยกเป็น AwardForm.tsx + RecipientsEditor.tsx + TagInput.tsx +
//  OneDriveMultiImageUpload.tsx + OneDriveDocumentUpload.tsx — 5 ไฟล์)
// รวมเพื่อให้แก้โค้ดง่ายขึ้น ไม่ต้องสลับไฟล์ไปมา
// ══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { saveAward } from '@/lib/honor-awards';
import { SCHOOL_NAME } from '@/lib/school-info';
import { fieldCls } from '@/lib/form-styles';
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  AWARD_LEVEL_LABELS,
  AWARD_LEVEL_OPTIONS,
  AWARD_TYPE_LABELS,
  AWARD_TYPE_OPTIONS,
  RECIPIENT_ROLE_LABELS,
  RECIPIENT_ROLE_OPTIONS,
} from '@/types/honor';
import type { AwardCategory, AwardFormInput, Recipient } from '@/types/honor';

const supabase = createClient();
const currentThaiYear = new Date().getFullYear() + 543;

// ★ ฟ้อนต์รวมทั้งฟอร์ม — TH Sarabun
const THAI_FONT = "'TH Sarabun New', 'TH SarabunPSK', 'Sarabun', sans-serif";

// ══════════════════════════════════════════════════════════════════════════
// ── Helpers ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

function emptyForm(): AwardFormInput {
  return {
    category: 'Student',
    title: '',
    date_received: new Date().toISOString().slice(0, 10),
    academic_year: currentThaiYear,
    organizer: '',
    award_level: 'Local',
    award_type: 'Academic',
    image_cover: '',
    certificate_file: '',
    award_images: [],
    pr_link: '',
    tags: [],
    kpi_standard: '',
    recipients: [{ recipient_name: '' }],
  };
}

const labelCls = 'text-xs text-slate-500 font-bold uppercase tracking-wide';

// ★ ตัดอักขระที่ OneDrive path ห้ามใช้ออก (เช่น '/' ใน "ศิลปะ/วัฒนธรรม") กันสร้างโฟลเดอร์เกินชั้นที่ตั้งใจ
function sanitizeFolderSegment(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '-');
}

// ★ ตั้งชื่อไฟล์ = วันที่อัปโหลด_ลำดับที่ (เช่น 14-07-2569_01.jpg, 14-07-2569_02.jpg)
//   seq คือลำดับที่ (นับต่อจากไฟล์ที่มีอยู่แล้ว + ตำแหน่งในชุดที่กำลังอัปโหลดรอบนี้)
function buildDatedFileName(seq: number, originalName: string) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear() + 543; // พ.ศ. ให้ตรงกับปีการศึกษาที่ใช้ในระบบ
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  return `${dd}-${mm}-${yyyy}_${String(seq).padStart(2, '0')}${ext}`;
}

// ★ ดึงรายชื่อผู้บริหาร (director, deputy_director) จากตาราง users มาเป็นค่าเริ่มต้นตอนเลือกหมวด "ผู้บริหาร"
//   ตำแหน่งเก็บเป็นข้อความตรงๆ ในคอลัมน์ users.academic_level (ไม่มีตารางแยก ไม่ต้อง join)
//   ★ แก้บั๊ก: เดิมพยายาม join กับตาราง academic_levels ทำให้ตำแหน่งว่างเปล่าเสมอ
//   ตอนนี้อ่านค่าตรงๆ เหมือนกับตอนค้นหาผู้บริหารด้วยตนเอง (ดู searchExecutives ด้านล่าง) ให้ตรงกัน
async function fetchExecutiveRecipients(): Promise<Recipient[]> {
  const { data: users, error } = await supabase
    .from('users')
    .select('id,title,first_name,last_name,full_name,role,academic_level')
    .in('role', ['director', 'deputy_director'])
    .order('role', { ascending: true });

  if (error) {
    console.error('[fetchExecutiveRecipients] query failed:', error.message, error);
  }
  if (error || !users || users.length === 0) {
    return [{ recipient_name: '' }];
  }

  return users.map((u: any) => {
    const assembled = `${u.title ?? ''}${u.first_name ?? ''} ${u.last_name ?? ''}`
      .replace(/\s+/g, ' ')
      .trim();
    return {
      recipient_name: assembled || u.full_name || '',
      department: u.academic_level ?? '', // ★ ตำแหน่ง — ข้อความตรงๆ จาก users.academic_level
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ── TagInput (เดิม TagInput.tsx) ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const value = draft.trim();
    if (value && !tags.includes(value)) {
      onChange([...tags, value]);
    }
    setDraft('');
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy/15 bg-white px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-gold">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-navy/8 text-navy text-xs font-medium px-2.5 py-1"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`ลบแท็ก ${tag}`}
            className="text-navy/50 hover:text-navy"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? 'พิมพ์แท็กแล้วกด Enter เช่น สพฐ, STEM' : 'เพิ่มแท็ก...'}
        className="flex-1 min-w-[120px] text-sm outline-none py-1"
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── OneDrive uploads (เดิม OneDriveMultiImageUpload.tsx + OneDriveDocumentUpload.tsx) ─
// ══════════════════════════════════════════════════════════════════════════
export type UploadedFile = { url: string; name: string; itemId?: string };

function OneDriveMultiImageUpload({
  label, value, onChange, folderPath, max = 4, account = 'hr@khienkhet.ac.th',
}: {
  label: string; value: UploadedFile[]; onChange: (files: UploadedFile[]) => void;
  folderPath: string; max?: number; account?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = max - value.length;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const files = Array.from(fileList).slice(0, remaining);
    if (files.length < fileList.length) {
      setError(`อัปโหลดได้สูงสุด ${max} รูป — เลือกมาเกิน จึงอัปโหลดแค่ ${files.length} รูปแรก`);
    }

    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fd = new FormData();
        fd.append('file', file);
        // ★ ตั้งชื่อไฟล์ = วันที่_ลำดับ (นับต่อจากรูปที่มีอยู่แล้วในฟอร์มนี้)
        const datedName = buildDatedFileName(value.length + i + 1, file.name);
        fd.append('path', `${folderPath}/${datedName}`);
        fd.append('account', account);

        const res = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
        const data = await res.json();
        if (!data.ok) {
          console.error('[OneDriveMultiImageUpload] upload failed:', data.error);
          throw new Error(data.error?.message || data.error || 'อัปโหลดไม่สำเร็จ');
        }

        uploaded.push({ url: data.url, name: datedName, itemId: data.itemId });
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{label}</span>
        <span className="text-xs text-slate-400 font-bold">{value.length}/{max} รูป</span>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {value.map((f, idx) => (
            <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border-2 border-blue-100 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow hover:bg-red-600 opacity-90 hover:opacity-100 transition-opacity"
                aria-label="ลบรูปนี้"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <label
          className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-bold cursor-pointer transition-all ${
            uploading
              ? 'border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'
              : 'border-blue-200 bg-blue-50/50 text-blue-700 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
              กำลังอัปโหลด...
            </>
          ) : (
            <>📷 เพิ่มรูป ({remaining} รูปที่เหลือ)</>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-600 font-bold">⚠️ {error}</p>}
    </div>
  );
}

function isImageName(name: string) {
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
}
function fileIcon(name: string) {
  if (/\.pdf$/i.test(name)) return '📕';
  if (/\.docx?$/i.test(name)) return '📘';
  if (/\.xlsx?$/i.test(name)) return '📗';
  return '📄';
}

function OneDriveDocumentUpload({
  label, value, onChange, folderPath, accept = 'application/pdf,image/*', account = 'hr@khienkhet.ac.th',
}: {
  label: string; value: UploadedFile | null; onChange: (file: UploadedFile | null) => void;
  folderPath: string; accept?: string; account?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // ★ ตั้งชื่อไฟล์ = วันที่_01 (เอกสารแนบมีได้ทีละไฟล์ จึงเป็นลำดับ 01 เสมอ)
      const datedName = buildDatedFileName(1, file.name);
      fd.append('path', `${folderPath}/${datedName}`);
      fd.append('account', account);

      const res = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) {
        console.error('[OneDriveDocumentUpload] upload failed:', data.error);
        throw new Error(data.error?.message || data.error || 'อัปโหลดไม่สำเร็จ');
      }

      onChange({ url: data.url, name: datedName, itemId: data.itemId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{label}</span>

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border-2 border-blue-100 bg-blue-50/50 px-3 py-2.5">
          {isImageName(value.name) ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden border border-blue-200 shrink-0 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.url} alt={value.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg border border-blue-200 shrink-0 bg-white flex items-center justify-center text-2xl">
              {fileIcon(value.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <a
              href={value.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-blue-800 hover:underline truncate block"
            >
              {value.name}
            </a>
            <span className="text-xs text-slate-400 font-medium">อัปโหลดแล้ว · เปิดดูไฟล์</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-500 font-black text-sm shrink-0 hover:bg-red-100 transition-colors"
            aria-label="ลบไฟล์นี้"
          >
            ✕
          </button>
        </div>
      ) : (
        <label
          className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-bold cursor-pointer transition-all ${
            uploading
              ? 'border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'
              : 'border-blue-200 bg-blue-50/50 text-blue-700 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
              กำลังอัปโหลด...
            </>
          ) : (
            <>📎 เลือกไฟล์เอกสาร</>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files)}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-600 font-bold">⚠️ {error}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── RecipientsEditor (เดิม RecipientsEditor.tsx) — รวม TeacherName/ExecutiveName/
//    StudentName search fields ทั้งหมดไว้ในนี้ ──
// ══════════════════════════════════════════════════════════════════════════

const emptyRecipient: Recipient = {
  recipient_name: '', student_id: '', grade_level: '', classroom: '', department: '', role: null,
};

type TeacherHit = { id: string; displayName: string; department: string };

async function searchTeachers(query: string, deptMap: Record<string, string>): Promise<{ hits: TeacherHit[]; errorMessage?: string }> {
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

// ★ ตำแหน่ง: users.academic_level เป็นข้อความอยู่แล้ว ไม่มีตารางแยก ดึงมาโชว์ตรงๆ
type ExecutiveHit = { id: string; displayName: string; position: string };

async function searchExecutives(query: string): Promise<{ hits: ExecutiveHit[]; errorMessage?: string }> {
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
  if (age !== null && age >= 15) return isMale ? 'นาย' : 'นางสาว';
  return isMale ? 'เด็กชาย' : 'เด็กหญิง';
}

type ClassroomInfo = { grade_level: string; classroom: string };

async function searchStudents(query: string, classroomMap: Record<string, ClassroomInfo>): Promise<{ hits: StudentHit[]; errorMessage?: string }> {
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
    return { id: s.id, displayName, student_id: s.student_code ?? '', grade_level: info.grade_level, classroom: info.classroom };
  });
  return { hits };
}

function TeacherNameField({ value, deptMap, invalid, onTextChange, onSelect }: {
  value: string; deptMap: Record<string, string>; invalid: boolean;
  onTextChange: (v: string) => void; onSelect: (hit: TeacherHit) => void;
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
      setResults(hits); setErrorMsg(errorMessage ?? null); setLoading(false);
    }, 300);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อ/นามสกุลเพื่อค้นหาในระบบ..." className={fieldCls(invalid)} />
      {open && (loading || results.length > 0 || errorMsg) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? <div className="px-3 py-2.5 text-xs text-slate-400">🔍 กำลังค้นหา...</div>
            : errorMsg ? <div className="px-3 py-2.5 text-xs text-red-600 font-bold">⚠️ ค้นหาไม่สำเร็จ: {errorMsg}</div>
            : results.map((hit) => (
              <button type="button" key={hit.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(hit); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0">
                <span className="font-bold text-slate-800">{hit.displayName}</span>
                {hit.department && <span className="text-xs text-slate-400">{hit.department}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function ExecutiveNameField({ value, invalid, onTextChange, onSelect }: {
  value: string; invalid: boolean; onTextChange: (v: string) => void; onSelect: (hit: ExecutiveHit) => void;
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
      setResults(hits); setErrorMsg(errorMessage ?? null); setLoading(false);
    }, 300);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อ/นามสกุลเพื่อค้นหาในระบบ..." className={fieldCls(invalid)} />
      {open && (loading || results.length > 0 || errorMsg) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? <div className="px-3 py-2.5 text-xs text-slate-400">🔍 กำลังค้นหา...</div>
            : errorMsg ? <div className="px-3 py-2.5 text-xs text-red-600 font-bold">⚠️ ค้นหาไม่สำเร็จ: {errorMsg}</div>
            : results.map((hit) => (
              <button type="button" key={hit.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(hit); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0">
                <span className="font-bold text-slate-800">{hit.displayName}</span>
                {hit.position && <span className="text-xs text-slate-400">{hit.position}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function StudentNameField({ value, classroomMap, invalid, onTextChange, onSelect }: {
  value: string; classroomMap: Record<string, ClassroomInfo>; invalid: boolean;
  onTextChange: (v: string) => void; onSelect: (hit: StudentHit) => void;
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
      setResults(hits); setErrorMsg(errorMessage ?? null); setLoading(false);
    }, 300);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อ/นามสกุล/รหัสนักเรียนเพื่อค้นหา..." className={fieldCls(invalid)} />
      {open && (loading || results.length > 0 || errorMsg) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? <div className="px-3 py-2.5 text-xs text-slate-400">🔍 กำลังค้นหา...</div>
            : errorMsg ? <div className="px-3 py-2.5 text-xs text-red-600 font-bold">⚠️ ค้นหาไม่สำเร็จ: {errorMsg}</div>
            : results.map((hit) => (
              <button type="button" key={hit.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(hit); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0">
                <span className="font-bold text-slate-800">{hit.displayName}</span>
                <span className="text-xs text-slate-400">{[hit.student_id, hit.grade_level, hit.classroom].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function RecipientsEditor({ category, recipients, submitted, onChange }: {
  category: AwardCategory; recipients: Recipient[]; submitted: boolean; onChange: (recipients: Recipient[]) => void;
}) {
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
      const { data, error } = await supabase.from('classrooms').select('id, room_name, grade_group');
      if (error) {
        console.error('[RecipientsEditor] โหลดตาราง classrooms ไม่สำเร็จ:', error.message, error);
        setLoadError((prev) => prev ?? `โหลดตารางห้องเรียน (classrooms) ไม่สำเร็จ: ${error.message}`);
        return;
      }
      const map: Record<string, ClassroomInfo> = {};
      (data || []).forEach((c: any) => { map[c.id] = { grade_level: c.grade_group ?? '', classroom: c.room_name ?? '' }; });
      setClassroomMap(map);
    })();
  }, []);

  const update = (index: number, patch: Partial<Recipient>) => {
    onChange(recipients.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addRow = () => onChange([...recipients, { ...emptyRecipient }]);
  const removeRow = (index: number) => {
    if (recipients.length === 1) return;
    onChange(recipients.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {loadError && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">⚠️ {loadError}</div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-ink">
          ผู้รับรางวัล {supportsTeam && <span className="text-muted font-normal">(รองรับรางวัลประเภททีม)</span>}
        </h3>
        {supportsTeam && (
          <button type="button" onClick={addRow} className="text-xs font-semibold text-gold-dark hover:underline">+ เพิ่มผู้รับรางวัล</button>
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
                    <input type="text" value={SCHOOL_NAME} readOnly className={fieldCls(false, 'bg-slate-100 text-slate-600 cursor-not-allowed')} />
                  ) : category === 'Teacher' ? (
                    <TeacherNameField value={r.recipient_name} deptMap={deptMap} invalid={nameInvalid}
                      onTextChange={(v) => update(i, { recipient_name: v })}
                      onSelect={(hit) => update(i, { recipient_name: hit.displayName, department: hit.department })} />
                  ) : category === 'Executive' ? (
                    <ExecutiveNameField value={r.recipient_name} invalid={nameInvalid}
                      onTextChange={(v) => update(i, { recipient_name: v })}
                      onSelect={(hit) => update(i, { recipient_name: hit.displayName, department: hit.position })} />
                  ) : category === 'Student' ? (
                    <StudentNameField value={r.recipient_name} classroomMap={classroomMap} invalid={nameInvalid}
                      onTextChange={(v) => update(i, { recipient_name: v })}
                      onSelect={(hit) => update(i, { recipient_name: hit.displayName, student_id: hit.student_id, grade_level: hit.grade_level, classroom: hit.classroom })} />
                  ) : (
                    <input type="text" value={r.recipient_name} onChange={(e) => update(i, { recipient_name: e.target.value })} className={fieldCls(nameInvalid)} />
                  )}

                  {nameInvalid && <p className="text-xs text-red-500">กรุณากรอกชื่อผู้รับรางวัล</p>}
                  {isSchool && <p className="text-xs text-muted">ชื่อโรงเรียนถูกกำหนดอัตโนมัติ ไม่สามารถแก้ไขได้</p>}
                </label>

                {category === 'Student' && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">รหัสนักเรียน</span>
                      <input type="text" value={r.student_id ?? ''} onChange={(e) => update(i, { student_id: e.target.value })} className={fieldCls(false, 'font-mono')} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">ระดับชั้น</span>
                      <input type="text" placeholder="เช่น มัธยมศึกษาตอนต้น" value={r.grade_level ?? ''} onChange={(e) => update(i, { grade_level: e.target.value })} className={fieldCls(false)} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">ห้องเรียน</span>
                      <input type="text" placeholder="เช่น ม.3/1" value={r.classroom ?? ''} onChange={(e) => update(i, { classroom: e.target.value })} className={fieldCls(false)} />
                    </label>
                  </>
                )}

                {category === 'Teacher' && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">กลุ่มสาระ/ฝ่ายงาน</span>
                      <input type="text" value={r.department ?? ''} onChange={(e) => update(i, { department: e.target.value })} className={fieldCls(false)} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">บทบาทในรางวัล</span>
                      <select value={r.role ?? ''} onChange={(e) => update(i, { role: (e.target.value || null) as Recipient['role'] })} className={fieldCls(false)}>
                        <option value="">— เลือก —</option>
                        {RECIPIENT_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{RECIPIENT_ROLE_LABELS[role]}</option>)}
                      </select>
                    </label>
                  </>
                )}

                {category === 'Executive' && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">ตำแหน่ง</span>
                    <input type="text" value={r.department ?? ''} onChange={(e) => update(i, { department: e.target.value })} className={fieldCls(false)} />
                  </label>
                )}
              </div>

              {supportsTeam && recipients.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} className="mt-2 text-xs text-clay hover:underline">− ลบผู้รับรางวัลคนนี้</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── AwardForm (main export) ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

type FormErrors = Partial<Record<'title' | 'date_received' | 'academic_year' | 'recipients', string>>;

export default function AwardForm({ initial }: { initial?: AwardFormInput }) {
  const router = useRouter();
  const [form, setForm] = useState<AwardFormInput>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const [images, setImages] = useState<UploadedFile[]>(() => {
    const urls = initial?.award_images && initial.award_images.length > 0
      ? initial.award_images
      : initial?.image_cover ? [initial.image_cover] : [];
    return urls.map((url) => ({ url, name: 'รูปภาพ' }));
  });
  const [certificate, setCertificate] = useState<UploadedFile | null>(
    initial?.certificate_file ? { url: initial.certificate_file, name: 'เอกสารแนบ' } : null
  );

  const isEdit = !!initial?.id;

  const set = <K extends keyof AwardFormInput>(key: K, value: AwardFormInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const folderPath = [
    'คลังเกียรติยศ',
    sanitizeFolderSegment(CATEGORY_LABELS[form.category]),
    sanitizeFolderSegment(AWARD_LEVEL_LABELS[form.award_level]),
    sanitizeFolderSegment(AWARD_TYPE_LABELS[form.award_type]),
  ].join('/');

  function handleImagesChange(files: UploadedFile[]) {
    setImages(files);
    setForm((f) => ({ ...f, image_cover: files[0]?.url ?? '', award_images: files.map((fl) => fl.url) }));
  }

  function handleCertificateChange(file: UploadedFile | null) {
    setCertificate(file);
    set('certificate_file', file?.url ?? '');
  }

  const handleCategoryChange = async (category: AwardCategory) => {
    if (category === 'School') {
      setForm((f) => ({ ...f, category, recipients: [{ recipient_name: SCHOOL_NAME }] }));
      return;
    }
    if (category === 'Executive') {
      setForm((f) => ({ ...f, category, recipients: [{ recipient_name: 'กำลังโหลดรายชื่อผู้บริหาร...' }] }));
      const execs = await fetchExecutiveRecipients();
      setForm((f) => (f.category === 'Executive' ? { ...f, recipients: execs } : f));
      return;
    }
    setForm((f) => ({ ...f, category, recipients: [{ recipient_name: '' }], kpi_standard: '' }));
  };

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.title.trim()) e.title = 'กรุณากรอกชื่อรางวัล';
    if (!form.date_received) e.date_received = 'กรุณาเลือกวันที่ได้รับรางวัล';
    if (!form.academic_year) e.academic_year = 'กรุณากรอกปีการศึกษา';
    const hasRecipient = form.recipients.some((r) => r.recipient_name.trim() !== '');
    if (!hasRecipient) e.recipients = 'กรุณากรอกชื่อผู้รับรางวัลอย่างน้อย 1 รายการ';
    return e;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setError('กรุณากรอกข้อมูลในช่องที่มีกรอบสีแดงให้ครบถ้วน');
      return;
    }
    setErrors({});
    setSaving(true);
    setError(null);
    try {
      const cleanedRecipients = form.recipients.filter((r) => r.recipient_name.trim() !== '');
      const id = await saveAward({ ...form, recipients: cleanedRecipients });
      router.push(`/honor/awards/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const showKpi = form.category === 'School' || form.category === 'Executive';

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" style={{ fontFamily: THAI_FONT }}>
      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
          <span className="text-lg">⚠️</span>{error}
        </div>
      )}

      <section className="rounded-2xl border border-blue-100 bg-white shadow-sm p-6 space-y-5">
        <h2 className="font-bold text-blue-900 text-lg flex items-center gap-2">
          <span className="text-orange-500">📋</span> ข้อมูลรางวัล
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>กลุ่มเป้าหมาย *</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((c) => (
              <button key={c} type="button" onClick={() => handleCategoryChange(c)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                  form.category === c ? 'bg-blue-900 text-white border-blue-900 shadow-md scale-[1.02]' : 'bg-white text-blue-900 border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                }`}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>ชื่อรางวัล *</span>
          <input type="text" value={form.title}
            onChange={(e) => { set('title', e.target.value); if (errors.title) setErrors((er) => ({ ...er, title: undefined })); }}
            className={fieldCls(!!errors.title)} />
          {errors.title && <span className="text-xs text-red-600 font-bold">{errors.title}</span>}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>วันที่ได้รับรางวัล *</span>
            <input type="date" value={form.date_received}
              onChange={(e) => { set('date_received', e.target.value); if (errors.date_received) setErrors((er) => ({ ...er, date_received: undefined })); }}
              className={fieldCls(!!errors.date_received)} />
            {errors.date_received && <span className="text-xs text-red-600 font-bold">{errors.date_received}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>ปีการศึกษา (พ.ศ.) *</span>
            <input type="number" value={form.academic_year}
              onChange={(e) => { set('academic_year', Number(e.target.value)); if (errors.academic_year) setErrors((er) => ({ ...er, academic_year: undefined })); }}
              className={fieldCls(!!errors.academic_year)} />
            {errors.academic_year && <span className="text-xs text-red-600 font-bold">{errors.academic_year}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>หน่วยงานที่จัด</span>
            <input type="text" value={form.organizer} onChange={(e) => set('organizer', e.target.value)} className={fieldCls(false)} />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>ระดับของรางวัล *</span>
            <select value={form.award_level} onChange={(e) => set('award_level', e.target.value as AwardFormInput['award_level'])} className={fieldCls(false)}>
              {AWARD_LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{AWARD_LEVEL_LABELS[l]}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>ประเภทรางวัล *</span>
            <select value={form.award_type} onChange={(e) => set('award_type', e.target.value as AwardFormInput['award_type'])} className={fieldCls(false)}>
              {AWARD_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{AWARD_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
        </div>

        {showKpi && (
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>มาตรฐาน/ตัวชี้วัดที่เกี่ยวข้อง (สำหรับ SAR)</span>
            <textarea value={form.kpi_standard} onChange={(e) => set('kpi_standard', e.target.value)} rows={2} className={`${fieldCls(false)} resize-none`} />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>แท็ก</span>
          <TagInput tags={form.tags} onChange={(tags) => set('tags', tags)} />
        </label>
      </section>

      <section className={`rounded-2xl border bg-white shadow-sm p-6 transition-all ${errors.recipients ? 'border-red-400 ring-4 ring-red-100' : 'border-blue-100'}`}>
        {errors.recipients && <p className="text-xs text-red-600 font-bold mb-3">⚠️ {errors.recipients}</p>}
        <RecipientsEditor
          category={form.category}
          recipients={form.recipients}
          submitted={submitted}
          onChange={(recipients) => { set('recipients', recipients); if (errors.recipients) setErrors((er) => ({ ...er, recipients: undefined })); }}
        />
      </section>

      <section className="rounded-2xl border border-blue-100 bg-white shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-blue-900 text-lg flex items-center gap-2">
          <span className="text-orange-500">📎</span> ไฟล์แนบและลิงก์
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OneDriveMultiImageUpload label="ภาพถ่ายเกียรติบัตร/รับรางวัล (อัปโหลดได้สูงสุด 4 รูป)" value={images} onChange={handleImagesChange} folderPath={folderPath} max={4} />
          <OneDriveDocumentUpload label="แนบไฟล์เอกสารที่เกี่ยวข้อง" value={certificate} onChange={handleCertificateChange} folderPath={folderPath} accept="application/pdf,image/*,.doc,.docx" />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>ลิงก์ข่าวประชาสัมพันธ์</span>
          <input type="url" placeholder="https://..." value={form.pr_link} onChange={(e) => set('pr_link', e.target.value)} className={fieldCls(false)} />
        </label>
      </section>

      <div className="sticky bottom-0 -mx-6 md:-mx-10 px-6 md:px-10 py-4 bg-white/95 backdrop-blur border-t border-blue-100 flex items-center gap-3 rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button type="submit" disabled={saving}
          className="flex-1 sm:flex-none sm:min-w-[200px] rounded-xl bg-orange-500 text-white px-8 py-3.5 text-base font-black shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2">
          {saving ? (<><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังบันทึก...</>) : (<>💾 {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรางวัล'}</>)}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-xl border-2 border-blue-200 bg-white px-6 py-3.5 text-base font-bold text-blue-900 hover:bg-blue-50 hover:border-blue-300 active:scale-[0.98] transition-all">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}