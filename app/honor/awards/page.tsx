'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAwards, fetchFilterOptions } from '@/lib/honor-awards';
import type { AwardFilters, AwardWithRecipients } from '@/types/honor';
import FilterBar from '@/components/honor/FilterBar';
import ExportButton from '@/components/honor/ExportButton';
import AwardCard from '@/components/honor/AwardCard';

export default function AwardsListPage() {
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
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow">คลังเกียรติยศ</p>
          <h1 className="font-display text-3xl font-semibold text-navy mt-1">รายการรางวัลทั้งหมด</h1>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton awards={awards} />
          <Link
            href="/awards/new"
            className="inline-flex items-center gap-2 rounded-md bg-gold text-navy-dark px-4 py-2 text-sm font-semibold hover:bg-gold-light transition-colors"
          >
            + บันทึกรางวัลใหม่
          </Link>
        </div>
      </header>

      <div className="mb-6">
        <FilterBar filters={filters} years={years} departments={departments} onChange={setFilters} />
      </div>

      <p className="text-sm text-muted mb-4">{resultCountLabel}</p>

      {error && (
        <div className="mb-6 rounded-md border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted text-sm">กำลังโหลด...</p>
      ) : awards.length === 0 ? (
        <div className="card-honor p-10 text-center">
          <p className="text-muted">ไม่พบรางวัลที่ตรงกับเงื่อนไขที่เลือก</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {awards.map((award) => (
            <AwardCard key={award.id} award={award} />
          ))}
        </div>
      )}
    </div>
  );
}
