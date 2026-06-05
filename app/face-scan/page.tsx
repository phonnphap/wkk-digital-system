'use client';

import dynamic from 'next/dynamic';

const FaceScanClient = dynamic(() => import('./FaceScanClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#0b1329] flex items-center justify-center text-white">
      กำลังโหลด...
    </div>
  ),
});

export default function FaceScanPage() {
  return <FaceScanClient />;
}