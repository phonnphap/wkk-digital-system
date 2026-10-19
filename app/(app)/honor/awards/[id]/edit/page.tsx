'use client';

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation';
import { fetchAwardById } from '@/lib/honor-awards';
import type { AwardFormInput } from '@/types/honor';
import AwardForm from '@/components/honor/AwardForm';

export default function EditAwardPage() {
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<AwardFormInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAwardById(params.id)
      .then((award) => {
        if (!award) {
          setError('ไม่พบรางวัลนี้');
          return;
        }
        setInitial({
          id: award.id,
          category: award.category,
          title: award.title,
          date_received: award.date_received,
          academic_year: award.academic_year,
          organizer: award.organizer ?? '',
          award_level: award.award_level,
          award_type: award.award_type,
          image_cover: award.image_cover ?? '',
          certificate_file: award.certificate_file ?? '',
          pr_link: award.pr_link ?? '',
          tags: award.tags ?? [],
          kpi_standard: award.kpi_standard ?? '',
          recipients: award.recipients.length > 0 ? award.recipients : [{ recipient_name: '' }],
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <p className="eyebrow">คลังเกียรติยศ</p>
        <h1 className="font-display text-3xl font-semibold text-navy mt-1">แก้ไขรางวัล</h1>
      </header>

      {loading && <p className="text-muted text-sm">กำลังโหลด...</p>}
      {error && <p className="text-clay text-sm">{error}</p>}
      {initial && <AwardForm initial={initial} />}
    </div>
  );
}
