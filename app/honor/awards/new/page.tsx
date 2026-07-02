'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AwardForm from '@/components/honor/AwardForm';

export default function NewAwardPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-orange-50/30">
      <div className="px-4 sm:px-6 md:px-10 py-8 w-full max-w-[1600px] mx-auto">
        <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
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
          </div>
          <Link
            href="/honor/awards"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-900 hover:bg-blue-50 hover:border-blue-300 transition-all shadow-sm"
          >
            🏆 ดูรางวัลทั้งหมด
          </Link>
        </header>
        <AwardForm />
      </div>
    </div>
  );
}