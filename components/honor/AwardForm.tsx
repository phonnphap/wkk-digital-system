'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAward } from '@/lib/honor-awards';
import { fieldCls } from '@/lib/form-styles';
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  AWARD_LEVEL_LABELS,
  AWARD_LEVEL_OPTIONS,
  AWARD_TYPE_LABELS,
  AWARD_TYPE_OPTIONS,
} from '@/types/honor';
import type { AwardCategory, AwardFormInput } from '@/types/honor';
import RecipientsEditor from './RecipientsEditor';
import TagInput from './TagInput';
import OneDriveMultiImageUpload, { type UploadedFile } from './OneDriveMultiImageUpload';
import OneDriveDocumentUpload from './OneDriveDocumentUpload';

const currentThaiYear = new Date().getFullYear() + 543;
const ONEDRIVE_ACCOUNT = 'hr@khienkhet.ac.th';

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

function urlToUploadedFile(url?: string | null): UploadedFile | null {
  if (!url) return null;
  const name = decodeURIComponent(url.split('/').pop() || 'ไฟล์แนบ');
  return { url, name };
}

export default function AwardForm({ initial }: { initial?: AwardFormInput }) {
  const router = useRouter();
  const [form, setForm] = useState<AwardFormInput>(initial ?? emptyForm());
  const [images, setImages] = useState<UploadedFile[]>(() => {
    const urls = initial?.award_images?.length ? initial.award_images : initial?.image_cover ? [initial.image_cover] : [];
    return urls.map((u) => urlToUploadedFile(u)).filter((f): f is UploadedFile => !!f);
  });
  const [document, setDocument] = useState<UploadedFile | null>(
    () => urlToUploadedFile(initial?.certificate_file)
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial?.id;

  const set = <K extends keyof AwardFormInput>(key: K, value: AwardFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleCategoryChange = (category: AwardCategory) => {
    setForm((f) => ({
      ...f,
      category,
      recipients: [{ recipient_name: '' }],
      kpi_standard: category === 'School' || category === 'Executive' ? f.kpi_standard : '',
    }));
  };

  // แยกโฟลเดอร์ใน OneDrive ตาม กลุ่มเป้าหมาย/ระดับรางวัล/ประเภทรางวัล
  const folderPath = useMemo(() => {
    const seg = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_');
    return [
      'คลังเกียรติยศและผลงาน',
      seg(CATEGORY_LABELS[form.category]),
      seg(AWARD_LEVEL_LABELS[form.award_level]),
      seg(AWARD_TYPE_LABELS[form.award_type]),
    ].join('/');
  }, [form.category, form.award_level, form.award_type]);

  const errors = {
    title: submitted && !form.title.trim(),
    date_received: submitted && !form.date_received,
    academic_year: submitted && !form.academic_year,
    award_level: submitted && !form.award_level,
    award_type: submitted && !form.award_type,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);

    if (!form.title.trim() || !form.date_received || !form.academic_year) {
      setError('กรุณากรอกข้อมูลในช่องที่มีเครื่องหมาย * ให้ครบก่อนบันทึก');
      return;
    }

    const cleanedRecipients = form.recipients.filter((r) => r.recipient_name.trim() !== '');
    if (cleanedRecipients.length === 0) {
      setError('กรุณากรอกชื่อผู้รับรางวัลอย่างน้อย 1 รายการ');
      return;
    }

    setSaving(true);
    try {
      const id = await saveAward({
        ...form,
        recipients: cleanedRecipients,
        award_images: images.map((i) => i.url),
        image_cover: images[0]?.url ?? '',
        certificate_file: document?.url ?? '',
      });
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
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <div className="rounded-md border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {error}
        </div>
      )}

      <section className="card-honor p-5 space-y-4">
        <h2 className="font-display font-semibold text-navy">ข้อมูลรางวัล</h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted font-medium">กลุ่มเป้าหมาย *</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleCategoryChange(c)}
                className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
                  form.category === c
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-navy border-sky-300 hover:border-navy/40'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted font-medium">ชื่อรางวัล *</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className={fieldCls(errors.title)}
          />
          {errors.title && <p className="text-xs text-red-500">กรุณากรอกชื่อรางวัล</p>}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">วันที่ได้รับรางวัล *</span>
            <input
              type="date"
              value={form.date_received}
              onChange={(e) => set('date_received', e.target.value)}
              className={fieldCls(errors.date_received)}
            />
            {errors.date_received && <p className="text-xs text-red-500">กรุณาเลือกวันที่</p>}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">ปีการศึกษา (พ.ศ.) *</span>
            <input
              type="number"
              value={form.academic_year}
              onChange={(e) => set('academic_year', Number(e.target.value))}
              className={fieldCls(errors.academic_year)}
            />
            {errors.academic_year && <p className="text-xs text-red-500">กรุณากรอกปีการศึกษา</p>}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">หน่วยงานที่จัด</span>
            <input
              type="text"
              value={form.organizer}
              onChange={(e) => set('organizer', e.target.value)}
              className={fieldCls(false)}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">ระดับของรางวัล *</span>
            <select
              value={form.award_level}
              onChange={(e) => set('award_level', e.target.value as AwardFormInput['award_level'])}
              className={fieldCls(errors.award_level)}
            >
              {AWARD_LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>{AWARD_LEVEL_LABELS[l]}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">ประเภทรางวัล *</span>
            <select
              value={form.award_type}
              onChange={(e) => set('award_type', e.target.value as AwardFormInput['award_type'])}
              className={fieldCls(errors.award_type)}
            >
              {AWARD_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{AWARD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
        </div>

        {showKpi && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">
              มาตรฐาน/ตัวชี้วัดที่เกี่ยวข้อง (สำหรับ SAR)
            </span>
            <textarea
              value={form.kpi_standard}
              onChange={(e) => set('kpi_standard', e.target.value)}
              rows={2}
              className={fieldCls(false)}
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted font-medium">แท็ก</span>
          <TagInput tags={form.tags} onChange={(tags) => set('tags', tags)} />
        </label>
      </section>

      <section className="card-honor p-5">
        <RecipientsEditor
          category={form.category}
          recipients={form.recipients}
          submitted={submitted}
          onChange={(recipients) => set('recipients', recipients)}
        />
      </section>

      <section className="card-honor p-5 space-y-5">
        <h2 className="font-display font-semibold text-navy">ไฟล์แนบและลิงก์</h2>
        <p className="text-xs text-muted -mt-3">
          อัปโหลดขึ้น OneDrive ({ONEDRIVE_ACCOUNT}) แยกโฟลเดอร์ตามกลุ่มเป้าหมาย/ระดับรางวัล/ประเภทรางวัลอัตโนมัติ
        </p>

        <OneDriveMultiImageUpload
          label="ภาพถ่ายเกียรติบัตร/รับรางวัล (สูงสุด 4 รูป)"
          value={images}
          onChange={setImages}
          folderPath={folderPath}
          max={4}
          account={ONEDRIVE_ACCOUNT}
        />

        <OneDriveDocumentUpload
          label="แนบไฟล์เอกสารที่เกี่ยวข้อง"
          value={document}
          onChange={setDocument}
          folderPath={folderPath}
          accept="application/pdf,image/*"
          account={ONEDRIVE_ACCOUNT}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted font-medium">ลิงก์ข่าวประชาสัมพันธ์</span>
          <input
            type="url"
            placeholder="https://..."
            value={form.pr_link}
            onChange={(e) => set('pr_link', e.target.value)}
            className={fieldCls(false)}
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-navy text-white px-6 py-2.5 text-sm font-semibold hover:bg-navy-light disabled:opacity-50 transition-colors"
        >
          {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรางวัล'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-navy/15 px-6 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5 transition-colors"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}