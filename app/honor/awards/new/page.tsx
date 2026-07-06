'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AwardForm from '@/components/honor/AwardForm';

export default function NewAwardPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-orange-50/40">
      <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-900 via-blue-800 to-slate-900 border-b border-blue-950 shadow-md px-4 sm:px-6 lg:px-10 py-4">
        <div className="w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg shrink-0 transition-colors backdrop-blur-sm"
              aria-label="กลับหน้าหลัก"
            >
              🏠
            </button>
            <div>
              <p className="text-orange-300 text-xs font-black tracking-wider">✨ คลังเกียรติยศ</p>
              <h1 className="text-xl font-black text-white leading-none mt-1">บันทึกรางวัลใหม่</h1>
            </div>
          </div>

          <Link
            href="/honor/awards"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 px-4 py-2.5 text-sm font-bold text-white transition-colors shrink-0"
          >
            🏆 ดูรางวัลทั้งหมด
          </Link>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-10 py-8">
        <AwardForm />
      </div>
    </div>
  );
}