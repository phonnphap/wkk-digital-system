'use client';

import { useState } from 'react';

// ══════════════════════════════════════════════════════════════════════════
// AwardImageGallery
// แสดงภาพแนบ "ครบทุกภาพ" ในหน้ารายละเอียดรางวัล พร้อมดาวน์โหลดได้ทุกภาพ
//
// วิธีใช้ในหน้า detail (เช่น app/honor/awards/[id]/page.tsx):
//   แทนที่ <img src={award.image_cover} .../> เดิม ด้วย:
//
//   <AwardImageGallery
//     images={award.award_images ?? []}
//     coverFallback={award.image_cover}
//     title={award.title}
//   />
//
// หมายเหตุสำคัญ: ถ้า award.award_images เป็น undefined/ว่างเสมอแม้บันทึกไป 4 รูปแล้ว
// ให้ตรวจสอบ VIEW "awards_with_recipients" ใน Supabase ว่า SELECT คอลัมน์ award_images
// ออกมาด้วยหรือยัง (ไม่ใช่แค่ image_cover) — ถ้ายังไม่มีต้องแก้ SQL VIEW เพิ่มคอลัมน์นี้ก่อน
// ══════════════════════════════════════════════════════════════════════════

interface Props {
  images: string[];
  coverFallback?: string;
  title?: string;
}

export default function AwardImageGallery({ images, coverFallback, title }: Props) {
  const list = images && images.length > 0 ? images : coverFallback ? [coverFallback] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (list.length === 0) {
    return <div className="text-sm text-slate-400 italic py-6 text-center">ไม่มีภาพแนบ</div>;
  }

  return (
    <div className="space-y-3">
      {/* ภาพหลัก */}
      <div className="relative rounded-2xl overflow-hidden border-2 border-blue-100 bg-slate-50">
        <img
          src={list[activeIndex]}
          alt={title ? `${title} - รูปที่ ${activeIndex + 1}` : `รูปที่ ${activeIndex + 1}`}
          className="w-full max-h-[480px] object-contain cursor-zoom-in"
          onClick={() => setLightbox(true)}
        />
        <a
          href={list[activeIndex]}
          download
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
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

      {/* thumbnail strip — แสดงครบทุกรูปที่แนบ ไม่ใช่แค่รูปปก */}
      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                i === activeIndex ? 'border-orange-500 ring-2 ring-orange-200' : 'border-blue-100 hover:border-blue-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`thumb-${i}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ปุ่มดาวน์โหลดทุกภาพแยกทีละรูป */}
      {list.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {list.map((url, i) => (
            <a
              key={url + i}
              href={url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100"
            >
              ⬇️ รูปที่ {i + 1}
            </a>
          ))}
        </div>
      )}

      {/* Lightbox เต็มจอ */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={list[activeIndex]}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-xl"
          >
            ✕
          </button>
          {list.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((activeIndex - 1 + list.length) % list.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-xl"
              >
                ‹
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((activeIndex + 1) % list.length);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-xl"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}