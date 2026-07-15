'use client';

// ══════════════════════════════════════════════════════════════════════════
// AwardCard.tsx — รวมส่วนแสดงผลรางวัลทั้งหมดไว้ไฟล์เดียว
// (เดิมแยกเป็น AwardCard.tsx + AwardTypeTag.tsx + RibbonBadge.tsx +
//  AwardImageGallery.tsx + DeleteAwardButton.tsx — 5 ไฟล์)
// ══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteAward } from '@/lib/honor-awards';
import type { AwardWithRecipients, AwardLevel, AwardType } from '@/types/honor';
import { CATEGORY_LABELS, AWARD_LEVEL_LABELS, AWARD_TYPE_LABELS } from '@/types/honor';

const THAI_FONT = "'TH Sarabun New', 'TH SarabunPSK', 'Sarabun', sans-serif";

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ══════════════════════════════════════════════════════════════════════════
// ── RibbonBadge (เดิม RibbonBadge.tsx) ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
export function RibbonBadge({ level }: { level: AwardLevel }) {
  return (
    <span className={`ribbon ribbon--${level}`} style={{ fontFamily: THAI_FONT }}>
      {AWARD_LEVEL_LABELS[level]}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── AwardTypeTag (เดิม AwardTypeTag.tsx) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
export function AwardTypeTag({ type }: { type: AwardType }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-navy/5 text-navy border border-navy/10"
      style={{ fontFamily: THAI_FONT }}
    >
      {AWARD_TYPE_LABELS[type]}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── AwardCard (เดิม AwardCard.tsx) — การ์ดสรุปรางวัลสำหรับหน้ารายการ/แดชบอร์ด ─
// ══════════════════════════════════════════════════════════════════════════
export default function AwardCard({ award }: { award: AwardWithRecipients }) {
  const names = award.recipients.map((r) => r.recipient_name).filter(Boolean);
  const displayNames =
    names.length === 0 ? '-' : names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} และอีก ${names.length - 2} คน`;

  return (
    <Link href={`/honor/awards/${award.id}`} className="card-honor group flex flex-col overflow-hidden focus-gold" style={{ fontFamily: THAI_FONT }}>
      <div className="relative aspect-[16/10] bg-parchment2 overflow-hidden">
        {award.image_cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={award.image_cover} alt={award.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-navy/20 font-display text-4xl">❖</div>
        )}
        <div className="absolute top-3 left-3">
          <RibbonBadge level={award.award_level} />
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <p className="eyebrow">{CATEGORY_LABELS[award.category]} · ปีการศึกษา {award.academic_year}</p>
        <h3 className="font-display font-semibold text-ink leading-snug line-clamp-2">{award.title}</h3>
        <p className="text-sm text-muted line-clamp-1">{displayNames}</p>

        <div className="mt-auto pt-2 flex items-center justify-between">
          <AwardTypeTag type={award.award_type} />
          <span className="text-xs text-muted font-mono">{formatThaiDate(award.date_received)}</span>
        </div>
      </div>
    </Link>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── AwardImageGallery (เดิม AwardImageGallery.tsx) — ใช้ในหน้ารายละเอียด ──
// แสดงภาพแนบครบทุกภาพ พร้อมดาวน์โหลดได้ทุกภาพ
// ══════════════════════════════════════════════════════════════════════════
export function AwardImageGallery({ images, coverFallback, title }: { images: string[]; coverFallback?: string; title?: string }) {
  const list = images && images.length > 0 ? images : coverFallback ? [coverFallback] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (list.length === 0) {
    return <div className="text-sm text-slate-400 italic py-6 text-center" style={{ fontFamily: THAI_FONT }}>ไม่มีภาพแนบ</div>;
  }

  return (
    <div className="space-y-3" style={{ fontFamily: THAI_FONT }}>
      <div className="relative rounded-2xl overflow-hidden border-2 border-blue-100 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={list[activeIndex]}
          alt={title ? `${title} - รูปที่ ${activeIndex + 1}` : `รูปที่ ${activeIndex + 1}`}
          className="w-full max-h-[480px] object-contain cursor-zoom-in"
          onClick={() => setLightbox(true)}
        />
        <a
          href={list[activeIndex]} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-bold flex items-center gap-1.5"
        >
          ⬇️ ดาวน์โหลดรูปนี้
        </a>
        {list.length > 1 && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs font-bold">
            {activeIndex + 1} / {list.length}
          </span>
        )}
      </div>

      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((url, i) => (
            <button key={url + i} type="button" onClick={() => setActiveIndex(i)}
              className={`shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${i === activeIndex ? 'border-orange-500 ring-2 ring-orange-200' : 'border-blue-100 hover:border-blue-300'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`thumb-${i}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {list.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {list.map((url, i) => (
            <a key={url + i} href={url} download target="_blank" rel="noopener noreferrer"
              className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100">
              ⬇️ รูปที่ {i + 1}
            </a>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[activeIndex]} alt="" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-xl">✕</button>
          {list.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setActiveIndex((activeIndex - 1 + list.length) % list.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-xl">‹</button>
              <button onClick={(e) => { e.stopPropagation(); setActiveIndex((activeIndex + 1) % list.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-xl">›</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── DeleteAwardButton (เดิม DeleteAwardButton.tsx) ──────────────────────
// ══════════════════════════════════════════════════════════════════════════
export function DeleteAwardButton({ id, canDelete }: { id: string; canDelete: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!canDelete) return null;

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} style={{ fontFamily: THAI_FONT }}
        className="rounded-xl border-2 border-red-300 bg-red-50 text-red-600 px-4 py-2.5 text-sm font-bold hover:bg-red-100 hover:border-red-400 transition-colors">
        🗑️ ลบรางวัลนี้
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 shadow-sm" style={{ fontFamily: THAI_FONT }}>
      <span className="text-sm text-red-700 font-bold">⚠️ ยืนยันการลบ?</span>
      <button
        disabled={deleting}
        onClick={async () => {
          setDeleting(true);
          await deleteAward(id);
          router.push('/honor/awards');
          router.refresh();
        }}
        className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-black hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 shadow-sm transition-all"
      >
        {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
      </button>
      <button onClick={() => setConfirming(false)} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
        ไม่ลบ
      </button>
    </div>
  );
}