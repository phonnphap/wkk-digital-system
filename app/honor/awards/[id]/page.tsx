'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchAwardById } from '@/lib/honor-awards';
import type { AwardWithRecipients } from '@/types/honor';
import {
  CATEGORY_LABELS,
  AWARD_TYPE_LABELS,
  RECIPIENT_ROLE_LABELS,
} from '@/types/honor';
import RibbonBadge from '@/components/honor/RibbonBadge';
import DeleteAwardButton from '@/components/honor/DeleteAwardButton';

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function AwardDetailPage() {
  const params = useParams<{ id: string }>();
  const [award, setAward] = useState<AwardWithRecipients | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAwardById(params.id)
      .then(setAward)
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto text-muted text-sm">กำลังโหลด...</div>;
  }

  if (error || !award) {
    return (
      <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto">
        <p className="text-clay text-sm">{error ?? 'ไม่พบรางวัลนี้'}</p>
        <Link href="/honor/awards" className="text-sm text-gold-dark hover:underline">← กลับไปหน้ารายการ</Link>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto">
      <Link href="/honor/awards" className="text-sm text-muted hover:text-navy">← กลับไปหน้ารายการ</Link>

      <div className="card-honor overflow-hidden mt-4">
        <div className="relative aspect-[21/9] bg-parchment2">
          {award.image_cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={award.image_cover} alt={award.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-navy/20 font-display text-6xl">❖</div>
          )}
          <div className="absolute top-4 left-4">
            <RibbonBadge level={award.award_level} />
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div>
            <p className="eyebrow">{CATEGORY_LABELS[award.category]} · ปีการศึกษา {award.academic_year}</p>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-navy mt-1">{award.title}</h1>
            <p className="text-muted mt-2">
              {AWARD_TYPE_LABELS[award.award_type]} · {formatThaiDate(award.date_received)}
              {award.organizer && ` · จัดโดย ${award.organizer}`}
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-sm text-ink mb-2">ผู้รับรางวัล</h2>
            <div className="flex flex-wrap gap-2">
              {award.recipients.map((r) => (
                <div key={r.id} className="rounded-md border border-navy/10 bg-parchment2/50 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{r.recipient_name}</span>
                  <span className="text-muted text-xs ml-2">
                    {[
                      r.grade_level,
                      r.classroom,
                      r.student_id,
                      r.department,
                      r.role ? RECIPIENT_ROLE_LABELS[r.role] : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {award.kpi_standard && (
            <div>
              <h2 className="font-semibold text-sm text-ink mb-1">มาตรฐาน/ตัวชี้วัด (SAR)</h2>
              <p className="text-sm text-muted whitespace-pre-line">{award.kpi_standard}</p>
            </div>
          )}

          {award.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {award.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-navy/5 text-navy text-xs font-medium px-2.5 py-1">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {award.certificate_file && (
              <a href={award.certificate_file} target="_blank" rel="noreferrer" className="text-gold-dark font-semibold hover:underline">
                📄 ดูเกียรติบัตร
              </a>
            )}
            {award.pr_link && (
              <a href={award.pr_link} target="_blank" rel="noreferrer" className="text-gold-dark font-semibold hover:underline">
                🔗 ข่าวประชาสัมพันธ์
              </a>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-navy/10">
            <Link
              href={`/honor/awards/${award.id}/edit`}
              className="rounded-md bg-navy text-white px-4 py-2 text-sm font-semibold hover:bg-navy-light transition-colors"
            >
              แก้ไขรางวัลนี้
            </Link>
            <DeleteAwardButton id={award.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
