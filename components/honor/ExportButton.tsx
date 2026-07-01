'use client';

import { exportAwardsToXlsx } from '@/lib/honor-export';
import type { AwardWithRecipients } from '@/types/honor';

export default function ExportButton({ awards }: { awards: AwardWithRecipients[] }) {
  const handleExport = () => {
    if (awards.length === 0) return;
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    exportAwardsToXlsx(awards, `honor-portfolio-${stamp}.xlsx`);
  };

  return (
    <button
      onClick={handleExport}
      disabled={awards.length === 0}
      className="inline-flex items-center gap-2 rounded-md bg-laurel text-white px-4 py-2 text-sm font-semibold hover:bg-laurel/90 disabled:opacity-40 disabled:cursor-not-allowed focus-gold transition-colors"
    >
      <span aria-hidden>⇩</span>
      ส่งออก Excel ({awards.length} รายการ)
    </button>
  );
}
