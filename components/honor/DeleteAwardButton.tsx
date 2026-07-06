'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAward } from '@/lib/honor-awards';

export default function DeleteAwardButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-clay/30 text-clay px-4 py-2 text-sm font-semibold hover:bg-clay/5 transition-colors"
      >
        ลบรางวัลนี้
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-clay">ยืนยันการลบ?</span>
      <button
        disabled={deleting}
        onClick={async () => {
          setDeleting(true);
          await deleteAward(id);
          router.push('/honor/awards');
          router.refresh();
        }}
        className="rounded-md bg-clay text-white px-3 py-1.5 text-xs font-semibold hover:bg-clay/90 disabled:opacity-50"
      >
        {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-md border border-navy/15 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5"
      >
        ไม่ลบ
      </button>
    </div>
  );
}
