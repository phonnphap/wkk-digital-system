'use client';

import { useRouter } from 'next/navigation';
import AwardForm from '@/components/honor/AwardForm';

export default function NewAwardPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-orange-50/30">
      <div className="px-4 sm:px-6 md:px-10 py-8 max-w-4xl xl:max-w-5xl mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-10 h-10 rounded-xl bg-white border border-blue-100 shadow-sm hover:bg-blue-50 flex items-center justify-center text-slate-600 text-lg shrink-0 transition-colors"
            aria-label="กลับหน้าหลัก"
          >
            🏠
          </button>
          <div>
            <p className="text-orange-500 font-black tracking-wide text-xs uppercase">✨ คลังเกียรติยศ</p>
            <h1 className="font-black text-3xl text-blue-900 mt-1">บันทึกรางวัลใหม่</h1>
          </div>
        </header>
        <AwardForm />
      </div>
    </div>
  );
}