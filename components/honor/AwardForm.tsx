'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { saveAward } from '@/lib/honor-awards';
import { SCHOOL_NAME } from '@/lib/school-info';
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  AWARD_LEVEL_LABELS,
  AWARD_LEVEL_OPTIONS,
  AWARD_TYPE_LABELS,
  AWARD_TYPE_OPTIONS,
} from '@/types/honor';
import type { AwardCategory, AwardFormInput, Recipient } from '@/types/honor';
import RecipientsEditor from './RecipientsEditor';
import TagInput from './TagInput';
import OneDriveMultiImageUpload, { type UploadedFile } from './OneDriveMultiImageUpload';
import OneDriveDocumentUpload from './OneDriveDocumentUpload';

const supabase = createClient();
const currentThaiYear = new Date().getFullYear() + 543;

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

function fieldCls(hasError?: boolean) {
  return hasError
    ? 'rounded-xl border-2 border-red-400 bg-red-50 px-3.5 py-2.5 text-sm text-slate-800 focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all'
    : 'rounded-xl border-2 border-blue-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all';
}

// ★ ตัดอักขระที่ OneDrive path ห้ามใช้ออก (เช่น '/' ใน "ศิลปะ/วัฒนธรรม") กันสร้างโฟลเดอร์เกินชั้นที่ตั้งใจ
function sanitizeFolderSegment(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '-');
}

type FormErrors = Partial<Record<'title' | 'date_received' | 'academic_year' | 'recipients', string>>;

export default function AwardForm({ initial }: { initial?: AwardFormInput }) {
  const router = useRouter();
  const [form, setForm] = useState<AwardFormInput>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // ★ state รูปภาพ/เอกสาร แยกจาก form เพื่อเก็บชื่อไฟล์ไว้แสดง preview ด้วย
  const [images, setImages] = useState<UploadedFile[]>(() => {
    const urls =
      initial?.award_images && initial.award_images.length > 0
        ? initial.award_images
        : initial?.image_cover
        ? [initial.image_cover]
        : [];
    return urls.map((url) => ({ url, name: 'รูปภาพ' }));
  });
  const [certificate, setCertificate] = useState<UploadedFile | null>(
    initial?.certificate_file ? { url: initial.certificate_file, name: 'เอกสารแนบ' } : null
  );

  const isEdit = !!initial?.id;

  const set = <K extends keyof AwardFormInput>(key: K, value: AwardFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ★ path แยกโฟลเดอร์ตาม กลุ่มเป้าหมาย/ระดับ/ประเภท ตามหมวดที่เลือกอยู่ตอนนี้
  const folderPath = [
    'คลังเกียรติยศ',
    sanitizeFolderSegment(CATEGORY_LABELS[form.category]),
    sanitizeFolderSegment(AWARD_LEVEL_LABELS[form.award_level]),
    sanitizeFolderSegment(AWARD_TYPE_LABELS[form.award_type]),
  ].join('/');

  function handleImagesChange(files: UploadedFile[]) {
    setImages(files);
    setForm((f) => ({
      ...f,
      image_cover: files[0]?.url ?? '',
      award_images: files.map((fl) => fl.url),
    }));
  }

  function handleCertificateChange(file: UploadedFile | null) {
    setCertificate(file);
    set('certificate_file', file?.url ?? '');
  }

  const handleCategoryChange = async (category: AwardCategory) => {
    if (category === 'School') {
      setForm((f) => ({
        ...f,
        category,
        recipients: [{ recipient_name: SCHOOL_NAME }],
      }));
      return;
    }

    if (category === 'Executive') {
  setForm((f) => ({
    ...f,
    category,
    recipients: [{ recipient_name: '' }],
  }));
  return;
}

    setForm((f) => ({
      ...f,
      category,
      recipients: [{ recipient_name: '' }],
      kpi_standard: '',
    }));
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
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
          <span className="text-lg">⚠️</span>{error}
        </div>
      )}

      {/* หมวดข้อมูลพื้นฐาน */}
      <section className="rounded-2xl border border-blue-100 bg-white shadow-sm p-6 space-y-5">
        <h2 className="font-bold text-blue-900 text-lg flex items-center gap-2">
          <span className="text-orange-500">📋</span> ข้อมูลรางวัล
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>กลุ่มเป้าหมาย *</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleCategoryChange(c)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                  form.category === c
                    ? 'bg-blue-900 text-white border-blue-900 shadow-md scale-[1.02]'
                    : 'bg-white text-blue-900 border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>ชื่อรางวัล *</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => {
              set('title', e.target.value);
              if (errors.title) setErrors((er) => ({ ...er, title: undefined }));
            }}
            className={fieldCls(!!errors.title)}
          />
          {errors.title && <span className="text-xs text-red-600 font-bold">{errors.title}</span>}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>วันที่ได้รับรางวัล *</span>
            <input
              type="date"
              value={form.date_received}
              onChange={(e) => {
                set('date_received', e.target.value);
                if (errors.date_received) setErrors((er) => ({ ...er, date_received: undefined }));
              }}
              className={fieldCls(!!errors.date_received)}
            />
            {errors.date_received && <span className="text-xs text-red-600 font-bold">{errors.date_received}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>ปีการศึกษา (พ.ศ.) *</span>
            <input
              type="number"
              value={form.academic_year}
              onChange={(e) => {
                set('academic_year', Number(e.target.value));
                if (errors.academic_year) setErrors((er) => ({ ...er, academic_year: undefined }));
              }}
              className={fieldCls(!!errors.academic_year)}
            />
            {errors.academic_year && <span className="text-xs text-red-600 font-bold">{errors.academic_year}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>หน่วยงานที่จัด</span>
            <input
              type="text"
              value={form.organizer}
              onChange={(e) => set('organizer', e.target.value)}
              className={fieldCls(false)}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>ระดับของรางวัล *</span>
            <select
              value={form.award_level}
              onChange={(e) => set('award_level', e.target.value as AwardFormInput['award_level'])}
              className={fieldCls(false)}
            >
              {AWARD_LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>{AWARD_LEVEL_LABELS[l]}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>ประเภทรางวัล *</span>
            <select
              value={form.award_type}
              onChange={(e) => set('award_type', e.target.value as AwardFormInput['award_type'])}
              className={fieldCls(false)}
            >
              {AWARD_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{AWARD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
        </div>

        {showKpi && (
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>มาตรฐาน/ตัวชี้วัดที่เกี่ยวข้อง (สำหรับ SAR)</span>
            <textarea
              value={form.kpi_standard}
              onChange={(e) => set('kpi_standard', e.target.value)}
              rows={2}
              className={`${fieldCls(false)} resize-none`}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>แท็ก</span>
          <TagInput tags={form.tags} onChange={(tags) => set('tags', tags)} />
        </label>
      </section>

      {/* ผู้รับรางวัล */}
      <section
        className={`rounded-2xl border bg-white shadow-sm p-6 transition-all ${
          errors.recipients ? 'border-red-400 ring-4 ring-red-100' : 'border-blue-100'
        }`}
      >
        {errors.recipients && (
          <p className="text-xs text-red-600 font-bold mb-3">⚠️ {errors.recipients}</p>
        )}
        <RecipientsEditor
          category={form.category}
          recipients={form.recipients}
          submitted={submitted}
          onChange={(recipients) => {
            set('recipients', recipients);
            if (errors.recipients) setErrors((er) => ({ ...er, recipients: undefined }));
          }}
        />
      </section>

      {/* ไฟล์แนบ — อัปโหลดขึ้น OneDrive แยกโฟลเดอร์ตาม กลุ่มเป้าหมาย/ระดับ/ประเภท */}
      <section className="rounded-2xl border border-blue-100 bg-white shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-blue-900 text-lg flex items-center gap-2">
          <span className="text-orange-500">📎</span> ไฟล์แนบและลิงก์
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OneDriveMultiImageUpload
            label="ภาพถ่ายเกียรติบัตร/รับรางวัล (อัปโหลดได้สูงสุด 4 รูป)"
            value={images}
            onChange={handleImagesChange}
            folderPath={folderPath}
            max={4}
          />
          <OneDriveDocumentUpload
            label="แนบไฟล์เอกสารที่เกี่ยวข้อง"
            value={certificate}
            onChange={handleCertificateChange}
            folderPath={folderPath}
            accept="application/pdf,image/*,.doc,.docx"
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>ลิงก์ข่าวประชาสัมพันธ์</span>
          <input
            type="url"
            placeholder="https://..."
            value={form.pr_link}
            onChange={(e) => set('pr_link', e.target.value)}
            className={fieldCls(false)}
          />
        </label>
      </section>

      {/* ── ปุ่มบันทึก / ยกเลิก ── */}
      <div className="sticky bottom-0 -mx-6 md:-mx-10 px-6 md:px-10 py-4 bg-white/95 backdrop-blur border-t border-blue-100 flex items-center gap-3 rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 sm:flex-none sm:min-w-[200px] rounded-xl bg-orange-500 text-white px-8 py-3.5 text-base font-black shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            <>💾 {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรางวัล'}</>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border-2 border-blue-200 bg-white px-6 py-3.5 text-base font-bold text-blue-900 hover:bg-blue-50 hover:border-blue-300 active:scale-[0.98] transition-all"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}