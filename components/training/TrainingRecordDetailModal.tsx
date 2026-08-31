'use client';

import { useEffect, useState } from 'react';
import type { TrainingRecordWithUser } from '@/lib/training-records';
import { TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS } from '@/lib/training-records';
import { resolveEvidenceFiles, type ResolvedEvidence } from '@/lib/training-evidence';

function fullName(r: TrainingRecordWithUser) {
  return r.full_name || `${r.title ?? ''} ${r.first_name ?? ''} ${r.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}
function thaiDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()]} ${d.getFullYear()+543}`;
}

export default function TrainingRecordDetailModal({ record, onClose }: {
  record: TrainingRecordWithUser;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<ResolvedEvidence[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingEvidence(true);
    (async () => {
      const resolved = await resolveEvidenceFiles(record.evidence_files ?? []);
      if (!cancelled) { setEvidence(resolved); setLoadingEvidence(false); }
    })();
    return () => { cancelled = true; };
  }, [record.id]);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
            <div className="flex-1 min-w-0">
              <span className="text-xs font-black px-2 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
                {TRAINING_TYPE_LABELS[record.training_type]}
              </span>
              <h3 className="font-black text-slate-800 text-lg leading-snug mt-2">{record.course_name}</h3>
              <p className="text-slate-400 text-xs mt-1">
                👤 {fullName(record)}{record.position ? ` · ${record.position}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg shrink-0">✕</button>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <InfoBox label="สถาบัน/วิทยากร" value={record.organizer || '—'} />
              <InfoBox label="ช่วงวันที่" value={`${thaiDate(record.start_date)} – ${thaiDate(record.end_date)}`} />
              <InfoBox label="ชั่วโมง" value={`${record.hours} ชม.`} />
              <InfoBox label="สถานะ" value={TRAINING_STATUS_LABELS[record.status]} />
            </div>

            {(record.grade_level || record.department_name) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {record.grade_level && (
                  <span className="px-2 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-700 font-bold">🎓 {record.grade_level}</span>
                )}
                {record.department_name && (
                  <span className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold">📚 {record.department_name}</span>
                )}
              </div>
            )}

            {record.key_takeaways && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <p className="text-xs font-black text-slate-500 mb-1.5">💡 องค์ความรู้ที่ได้รับ</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{record.key_takeaways}</p>
              </div>
            )}
            {record.action_plan && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <p className="text-xs font-black text-slate-500 mb-1.5">🚀 การนำไปประยุกต์ใช้</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{record.action_plan}</p>
              </div>
            )}
            {!record.key_takeaways && !record.action_plan && (
              <p className="text-slate-400 text-xs text-center py-2">ไม่มีข้อมูลสรุปเพิ่มเติม</p>
            )}

            <div>
              <p className="text-xs font-black text-slate-500 mb-2">
                📎 ไฟล์แนบ/หลักฐาน ({(record.evidence_files ?? []).length})
              </p>
              {loadingEvidence ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Array.from({ length: Math.max((record.evidence_files ?? []).length, 1) }).map((_, i) => (
                    <div key={i} className="w-full aspect-square rounded-xl border border-slate-200 bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : evidence.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่มีไฟล์แนบ</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {evidence.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => f.thumbnailUrl ? setLightbox(f.originalUrl) : window.open(f.originalUrl, '_blank')}
                      className="group relative aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-50"
                    >
                      {f.thumbnailUrl ? (
                        <img src={f.thumbnailUrl} alt={f.name}
                          className={`w-full h-full ${f.isPdf ? 'object-contain bg-white' : 'object-cover'} group-hover:opacity-90`}
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs px-1 text-center gap-1">
                          <span className="text-2xl">📄</span>
                          <span className="line-clamp-2">{f.name}</span>
                        </div>
                      )}
                      {f.isPdf && f.thumbnailUrl && (
                        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">PDF</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="preview" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white text-lg font-bold flex items-center justify-center">✕</button>
          <a href={lightbox} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className="absolute bottom-4 right-4 px-4 py-2 rounded-xl bg-white/90 hover:bg-white text-slate-700 text-xs font-bold">
            เปิดเต็มขนาด ↗
          </a>
        </div>
      )}
    </>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
      <p className="text-slate-400 font-bold mb-0.5">{label}</p>
      <p className="text-slate-700 font-black truncate">{value}</p>
    </div>
  );
}