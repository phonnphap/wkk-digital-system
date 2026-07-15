'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchAwardById } from '@/lib/honor-awards';
import { getCurrentUserProfile, ADMIN_ROLES, type CurrentUserProfile } from '@/lib/current-user';
import type { AwardWithRecipients } from '@/types/honor';
import {
  CATEGORY_LABELS,
  AWARD_TYPE_LABELS,
  RECIPIENT_ROLE_LABELS,
} from '@/types/honor';
import { RibbonBadge, DeleteAwardButton } from '@/components/honor/AwardCard';

const THAI_FONT = "'TH Sarabun New', 'TH SarabunPSK', 'Sarabun', sans-serif";

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Supabase Storage public URL รองรับ query param ?download เพื่อบังคับดาวน์โหลด
// (ไฟล์จาก OneDrive proxy /api/onedrive-file เป็น same-origin อยู่แล้ว ใช้ attribute download ตรงๆ ได้)
function downloadHref(url: string) {
  if (url.includes('supabase.co/storage')) {
    return url.includes('?') ? `${url}&download` : `${url}?download`;
  }
  return url;
}

export default function AwardDetailPage() {
  const params = useParams<{ id: string }>();
  const [award, setAward] = useState<AwardWithRecipients | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAwardById(params.id), getCurrentUserProfile()])
      .then(([awardData, userData]) => {
        setAward(awardData);
        setCurrentUser(userData);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto text-slate-400 text-sm" style={{ fontFamily: THAI_FONT }}>กำลังโหลด...</div>;
  }

  if (error || !award) {
    return (
      <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto" style={{ fontFamily: THAI_FONT }}>
        <p className="text-red-500 text-sm">{error ?? 'ไม่พบรางวัลนี้'}</p>
        <Link href="/honor/awards" className="text-sm text-orange-500 hover:underline">← กลับไปหน้ารายการ</Link>
      </div>
    );
  }

  // ★ สิทธิ์แก้ไข/ลบ: เฉพาะผู้บันทึก (created_by ตรงกับผู้ใช้ปัจจุบัน) หรือแอดมิน
  const canManage =
    !!currentUser &&
    (currentUser.id === award.created_by || ADMIN_ROLES.includes(currentUser.role));

  // ★ รวมรูปทั้งหมด: หน้าปก + รูปเพิ่มเติม, ตัดตัวซ้ำออก
  const galleryImages = [award.image_cover, ...(award.award_images ?? [])].filter(
    (u, idx, arr): u is string => !!u && arr.indexOf(u) === idx
  );

  return (
    <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto" style={{ fontFamily: THAI_FONT }}>
      <Link href="/honor/awards" className="text-sm text-slate-500 hover:text-blue-900">← กลับไปหน้ารายการ</Link>

      <div className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden mt-4">
        <div className="relative aspect-[21/9] bg-slate-100 group">
          {galleryImages[0] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={galleryImages[0]} alt={award.title} className="w-full h-full object-cover" />
              <a
                href={downloadHref(galleryImages[0])}
                download
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              >
                <span className="text-white text-sm font-black bg-blue-900/80 px-4 py-2 rounded-xl">
                  ⬇️ ดาวน์โหลดภาพนี้
                </span>
              </a>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-blue-900/20 text-6xl">❖</div>
          )}
          <div className="absolute top-4 left-4">
            <RibbonBadge level={award.award_level} />
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div>
            <p className="text-orange-500 font-black text-xs uppercase tracking-wide">
              {CATEGORY_LABELS[award.category]} · ปีการศึกษา {award.academic_year}
            </p>
            <h1 className="font-black text-2xl md:text-3xl text-blue-900 mt-1">{award.title}</h1>
            <p className="text-slate-500 mt-2">
              {AWARD_TYPE_LABELS[award.award_type]} · {formatThaiDate(award.date_received)}
              {award.organizer && ` · จัดโดย ${award.organizer}`}
            </p>
            {award.created_by_name && (
              <p className="text-slate-400 text-xs mt-1 font-bold">📝 บันทึกโดย {award.created_by_name}</p>
            )}
          </div>

          {/* ★ แกลเลอรีรูปภาพทั้งหมด — ดาวน์โหลดได้ทีละรูป */}
          {galleryImages.length > 0 && (
            <div>
              <h2 className="font-bold text-sm text-blue-900 mb-2">
                ภาพทั้งหมด ({galleryImages.length} รูป)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {galleryImages.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative group/img aspect-square rounded-xl overflow-hidden border-2 border-blue-100 bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`ภาพที่ ${idx + 1}`} className="w-full h-full object-cover" />
                    <a
                      href={downloadHref(url)}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 bg-black/0 group-hover/img:bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all"
                    >
                      <span className="text-white text-xs font-black bg-blue-900/80 px-3 py-1.5 rounded-lg">
                        ⬇️ ดาวน์โหลด
                      </span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-bold text-sm text-blue-900 mb-2">ผู้รับรางวัล</h2>
            <div className="flex flex-wrap gap-2">
              {award.recipients.map((r) => (
                <div key={r.id} className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2 text-sm">
                  <span className="font-bold text-slate-800">{r.recipient_name}</span>
                  <span className="text-slate-400 text-xs ml-2">
                    {[
                      r.grade_level,
                      r.classroom,
                      r.student_id,
                      r.department,
                      r.role ? RECIPIENT_ROLE_LABELS[r.role] : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {award.kpi_standard && (
            <div>
              <h2 className="font-bold text-sm text-blue-900 mb-1">มาตรฐาน/ตัวชี้วัด (SAR)</h2>
              <p className="text-sm text-slate-500 whitespace-pre-line">{award.kpi_standard}</p>
            </div>
          )}

          {award.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {award.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-blue-50 text-blue-900 text-xs font-bold px-2.5 py-1">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* ไฟล์แนบ / ลิงก์ */}
          <div className="flex flex-wrap gap-3 text-sm">
            {award.certificate_file && (
              <a
                href={downloadHref(award.certificate_file)}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50/50 px-4 py-2.5 font-bold text-blue-800 hover:bg-blue-100 transition-colors"
              >
                📄 ดูเอกสารแนบ
              </a>
            )}
            {award.pr_link && (
              <a
                href={award.pr_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50/50 px-4 py-2.5 font-bold text-blue-800 hover:bg-blue-100 transition-colors"
              >
                🔗 ข่าวประชาสัมพันธ์
              </a>
            )}
          </div>

          {/* ★ แก้ไข/ลบ — เฉพาะผู้บันทึกหรือแอดมิน */}
          <div className="flex items-center justify-between pt-4 border-t border-blue-100">
            {canManage ? (
              <Link
                href={`/honor/awards/${award.id}/edit`}
                className="rounded-xl bg-blue-900 text-white px-4 py-2.5 text-sm font-bold hover:bg-blue-800 transition-colors"
              >
                แก้ไขรางวัลนี้
              </Link>
            ) : (
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                🔒 เฉพาะผู้บันทึกหรือแอดมินเท่านั้นที่แก้ไข/ลบได้
              </span>
            )}
            <DeleteAwardButton id={award.id} canDelete={canManage} />
          </div>
        </div>
      </div>
    </div>
  );
}