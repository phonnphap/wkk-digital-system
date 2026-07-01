'use client';

import { useRouter } from 'next/navigation';
import AwardForm from '@/components/honor/AwardForm';

export default function NewAwardPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-white">
      <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0 transition-colors"
            aria-label="กลับหน้าหลัก"
          >
            🏠
          </button>
          <div>
            <p className="eyebrow text-gold-dark font-semibold tracking-wide text-xs">✨ คลังเกียรติยศ</p>
            <h1 className="font-display text-3xl font-bold text-navy mt-1">บันทึกรางวัลใหม่</h1>
          </div>
        </header>
        <AwardForm />
      </div>
    </div>
  );
}