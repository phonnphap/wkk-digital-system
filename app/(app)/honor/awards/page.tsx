'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAwards, fetchFilterOptions } from '@/lib/honor-awards';
import type { AwardFilters, AwardWithRecipients } from '@/types/honor';
import { FilterBar, ExportButton } from '@/components/honor/AwardListControls';
import AwardCard from '@/components/honor/AwardCard';

const THAI_FONT = "'TH Sarabun New', 'TH SarabunPSK', 'Sarabun', sans-serif";

export default function AwardsListPage() {
  const router = useRouter();
  const [awards, setAwards] = useState<AwardWithRecipients[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [filters, setFilters] = useState<AwardFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFilterOptions()
      .then(({ years, departments }) => {
        setYears(years);
        setDepartments(departments);
      })
      .catch(() => {
        /* ไม่ critical — filter dropdown จะแสดงว่างแทน */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAwards(filters)
      .then((data) => {
        if (!cancelled) setAwards(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const resultCountLabel = useMemo(() => `พบ ${awards.length} รายการ`, [awards.length]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-orange-50/30" style={{ fontFamily: THAI_FONT }}>
      <div className="px-4 sm:px-6 md:px-10 py-8 w-full max-w-[1600px] mx-auto">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
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
              <h1 className="font-black text-3xl text-blue-900 mt-1">รายการรางวัลทั้งหมด</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ExportButton awards={awards} />
            <Link
              href="/honor/awards/new"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 text-white px-5 py-2.5 text-sm font-black shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              🏆 บันทึกรางวัลใหม่
            </Link>
          </div>
        </header>

        <div className="mb-6 rounded-2xl bg-white border border-blue-100 shadow-sm p-4">
          <FilterBar filters={filters} years={years} departments={departments} onChange={setFilters} />
        </div>

        <p className="text-sm text-slate-500 mb-4 font-bold">{resultCountLabel}</p>

        {error && (
          <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-orange-500 font-black text-sm animate-pulse">กำลังโหลดรางวัล...</p>
          </div>
        ) : awards.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-white p-14 text-center">
            <p className="text-4xl mb-3">🏅</p>
            <p className="text-slate-500 font-bold">ไม่พบรางวัลที่ตรงกับเงื่อนไขที่เลือก</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {awards.map((award) => (
              <AwardCard key={award.id} award={award} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}