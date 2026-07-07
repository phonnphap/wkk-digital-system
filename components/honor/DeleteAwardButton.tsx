'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAward } from '@/lib/honor-awards';

export default function DeleteAwardButton({ id, canDelete }: { id: string; canDelete: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ★ ไม่ใช่ผู้บันทึกหรือแอดมิน → ไม่แสดงปุ่มลบเลย
  if (!canDelete) return null;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border-2 border-red-300 bg-red-50 text-red-600 px-4 py-2.5 text-sm font-bold hover:bg-red-100 hover:border-red-400 transition-colors"
      >
        🗑️ ลบรางวัลนี้
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 shadow-sm">
      <span className="text-sm text-red-700 font-bold">⚠️ ยืนยันการลบ?</span>
      <button
        disabled={deleting}
        onClick={async () => {
          setDeleting(true);
          await deleteAward(id);
          router.push('/honor/awards');
          router.refresh();
        }}
        className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-black hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 shadow-sm transition-all"
      >
        {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
      >
        ไม่ลบ
      </button>
    </div>
  );
}