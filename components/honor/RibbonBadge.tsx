import type { AwardLevel } from '@/types/honor';
import { AWARD_LEVEL_LABELS } from '@/types/honor';

export default function RibbonBadge({ level }: { level: AwardLevel }) {
  return <span className={`ribbon ribbon--${level}`}>{AWARD_LEVEL_LABELS[level]}</span>;
}
