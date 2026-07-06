import Link from 'next/link';
import type { AwardWithRecipients } from '@/types/honor';
import { CATEGORY_LABELS } from '@/types/honor';
import RibbonBadge from './RibbonBadge';
import AwardTypeTag from './AwardTypeTag';

function formatThaiDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AwardCard({ award }: { award: AwardWithRecipients }) {
  const names = award.recipients.map((r) => r.recipient_name).filter(Boolean);
  const displayNames =
    names.length === 0
      ? '-'
      : names.length <= 2
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} และอีก ${names.length - 2} คน`;

  return (
    <Link
      href={`/honor/awards/${award.id}`}
      className="card-honor group flex flex-col overflow-hidden focus-gold"
    >
      <div className="relative aspect-[16/10] bg-parchment2 overflow-hidden">
        {award.image_cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={award.image_cover}
            alt={award.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-navy/20 font-display text-4xl">
            ❖
          </div>
        )}
        <div className="absolute top-3 left-3">
          <RibbonBadge level={award.award_level} />
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <p className="eyebrow">{CATEGORY_LABELS[award.category]} · ปีการศึกษา {award.academic_year}</p>
        <h3 className="font-display font-semibold text-ink leading-snug line-clamp-2">
          {award.title}
        </h3>
        <p className="text-sm text-muted line-clamp-1">{displayNames}</p>

        <div className="mt-auto pt-2 flex items-center justify-between">
          <AwardTypeTag type={award.award_type} />
          <span className="text-xs text-muted font-mono">{formatThaiDate(award.date_received)}</span>
        </div>
      </div>
    </Link>
  );
}
