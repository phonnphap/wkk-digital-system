import type { AwardType } from '@/types/honor';
import { AWARD_TYPE_LABELS } from '@/types/honor';

export default function AwardTypeTag({ type }: { type: AwardType }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-navy/5 text-navy border border-navy/10">
      {AWARD_TYPE_LABELS[type]}
    </span>
  );
}
