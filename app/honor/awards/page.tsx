'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAwards, fetchFilterOptions } from '@/lib/honor-awards';
import type { AwardFilters, AwardWithRecipients } from '@/types/honor';
import FilterBar from '@/components/honor/FilterBar';
import ExportButton from '@/components/honor/ExportButton';
import AwardCard from '@/components/honor/AwardCard';

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
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-white">
      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0 transition-colors"
              aria-label="กลับหน้าหลัก"
            >
              🏠
            </button>
            <div>
              <p className="eyebrow text-gold-dark font-semibold tracking-wide text-xs">✨ คลังเกียรติยศ</p>
              <h1 className="font-display text-3xl font-bold text-navy mt-1">รายการรางวัลทั้งหมด</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ExportButton awards={awards} />
            <Link
              href="/honor/awards/new"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-light text-navy-dark px-5 py-2.5 text-sm font-bold shadow-sm hover:shadow-md hover:brightness-105 transition-all"
            >
              🏆 บันทึกรางวัลใหม่
            </Link>
          </div>
        </header>

        <div className="mb-6 rounded-2xl bg-white border border-navy/10 shadow-sm p-4">
          <FilterBar filters={filters} years={years} departments={departments} onChange={setFilters} />
        </div>

        <p className="text-sm text-muted mb-4 font-medium">{resultCountLabel}</p>

        {error && (
          <div className="mb-6 rounded-xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-gold-dark font-bold text-sm animate-pulse">กำลังโหลดรางวัล...</p>
          </div>
        ) : awards.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-navy/15 bg-white p-14 text-center">
            <p className="text-4xl mb-3">🏅</p>
            <p className="text-muted font-medium">ไม่พบรางวัลที่ตรงกับเงื่อนไขที่เลือก</p>
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