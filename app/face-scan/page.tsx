'use client';

export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';

const FaceScanClient = dynamicImport(() => import('./FaceScanClient'), {
  ssr: false,
  loading: () => (
    <div
      className="min-h-screen flex items-center justify-center text-[#1D1D1F] font-semibold"
      style={{
        background: 'linear-gradient(180deg, #EAF3FF 0%, #F6F4FF 50%, #FFF3F8 100%)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Thai', 'Sarabun', 'Noto Sans Thai', sans-serif",
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <span className="w-8 h-8 border-2 border-[#0A84FF]/25 border-t-[#0A84FF] rounded-full animate-spin" />
        กำลังโหลด...
      </div>
    </div>
  ),
});

export default function FaceScanPage() {
  return <FaceScanClient />;
}