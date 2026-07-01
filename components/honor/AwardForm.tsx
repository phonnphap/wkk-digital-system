'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAward } from '@/lib/honor-awards';
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
import FileUploadField from './FileUploadField';

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
    pr_link: '',
    tags: [],
    kpi_standard: '',
    recipients: [{ recipient_name: '' }],
  };
}

export default function AwardForm({ initial }: { initial?: AwardFormInput }) {
  const router = useRouter();
  const [form, setForm] = useState<AwardFormInput>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial?.id;

  const set = <K extends keyof AwardFormInput>(key: K, value: AwardFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleCategoryChange = (category: AwardCategory) => {
    setForm((f) => ({
      ...f,
      category,
      // ล้างผู้รับรางวัลใหม่เมื่อสลับกลุ่ม เพื่อไม่ให้ฟิลด์เฉพาะกลุ่มเดิมค้าง
      recipients: [{ recipient_name: '' }],
      kpi_standard: category === 'School' || category === 'Executive' ? f.kpi_standard : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const cleanedRecipients = form.recipients.filter((r) => r.recipient_name.trim() !== '');
      if (cleanedRecipients.length === 0) {
        throw new Error('กรุณากรอกชื่อผู้รับรางวัลอย่างน้อย 1 รายการ');
      }
      const id = await saveAward({ ...form, recipients: cleanedRecipients });
      router.push(`/awards/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const showKpi = form.category === 'School' || form.category === 'Executive';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {error}
        </div>
      )}

      {/* หมวดข้อมูลพื้นฐาน */}
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
                    : 'bg-white text-navy border-navy/15 hover:border-navy/40'
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
            required
            type="text"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">วันที่ได้รับรางวัล *</span>
            <input
              required
              type="date"
              value={form.date_received}
              onChange={(e) => set('date_received', e.target.value)}
              className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">ปีการศึกษา (พ.ศ.) *</span>
            <input
              required
              type="number"
              value={form.academic_year}
              onChange={(e) => set('academic_year', Number(e.target.value))}
              className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">หน่วยงานที่จัด</span>
            <input
              type="text"
              value={form.organizer}
              onChange={(e) => set('organizer', e.target.value)}
              className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted font-medium">ระดับของรางวัล *</span>
            <select
              value={form.award_level}
              onChange={(e) => set('award_level', e.target.value as AwardFormInput['award_level'])}
              className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
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
              className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
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
              className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted font-medium">แท็ก</span>
          <TagInput tags={form.tags} onChange={(tags) => set('tags', tags)} />
        </label>
      </section>

      {/* ผู้รับรางวัล */}
      <section className="card-honor p-5">
        <RecipientsEditor
          category={form.category}
          recipients={form.recipients}
          onChange={(recipients) => set('recipients', recipients)}
        />
      </section>

      {/* ไฟล์แนบ */}
      <section className="card-honor p-5 space-y-4">
        <h2 className="font-display font-semibold text-navy">ไฟล์แนบและลิงก์</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileUploadField
            label="ภาพถ่ายรับรางวัล / ภาพปก"
            value={form.image_cover}
            onChange={(url) => set('image_cover', url)}
            bucket="award-images"
            accept="image/*"
          />
          <FileUploadField
            label="ไฟล์เกียรติบัตร (PDF)"
            value={form.certificate_file}
            onChange={(url) => set('certificate_file', url)}
            bucket="award-certificates"
            accept="application/pdf"
          />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted font-medium">ลิงก์ข่าวประชาสัมพันธ์</span>
          <input
            type="url"
            placeholder="https://..."
            value={form.pr_link}
            onChange={(e) => set('pr_link', e.target.value)}
            className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
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
