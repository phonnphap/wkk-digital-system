'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchAwards, fetchStats } from '@/lib/honor-awards';
import type { AwardWithRecipients } from '@/types/honor';
import StatsCards from '@/components/honor/StatsCards';
import AwardCard from '@/components/honor/AwardCard';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<AwardWithRecipients[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [stats, awards] = await Promise.all([fetchStats(), fetchAwards()]);
        setByCategory(stats.byCategory);
        setRecent(awards.slice(0, 6));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <p className="eyebrow">ภาพรวมระบบ</p>
        <h1 className="font-display text-3xl font-semibold text-navy mt-1">
          คลังเกียรติยศและผลงาน
        </h1>
        <p className="text-muted mt-2 max-w-2xl">
          รวบรวมรางวัลและผลงานของโรงเรียน ผู้บริหาร ครู และนักเรียน ไว้ในที่เดียว
          พร้อมสำหรับการสืบค้นและจัดทำรายงานประกันคุณภาพ (SAR)
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          โหลดข้อมูลไม่สำเร็จ: {error} — ตรวจสอบว่าตั้งค่า .env.local และรัน supabase/schema.sql แล้วหรือยัง
        </div>
      )}

      <StatsCards byCategory={byCategory} />

      <div className="flex items-center justify-between mt-10 mb-4">
        <h2 className="font-display text-xl font-semibold text-navy">รางวัลล่าสุด</h2>
        <Link href="/awards" className="text-sm font-semibold text-gold-dark hover:underline">
          ดูทั้งหมด →
        </Link>
      </div>

      {loading ? (
        <p className="text-muted text-sm">กำลังโหลด...</p>
      ) : recent.length === 0 ? (
        <div className="card-honor p-10 text-center">
          <p className="text-muted">ยังไม่มีรางวัลในระบบ</p>
          <Link
            href="/awards/new"
            className="inline-block mt-4 rounded-md bg-navy text-white px-4 py-2 text-sm font-semibold hover:bg-navy-light"
          >
            + บันทึกรางวัลแรก
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recent.map((award) => (
            <AwardCard key={award.id} award={award} />
          ))}
        </div>
      )}
    </div>
  );
}
