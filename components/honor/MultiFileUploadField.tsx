'use client';

import { useRef, useState } from 'react';
import { uploadAwardFile } from '@/lib/honor-awards';

interface MultiFileUploadFieldProps {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}

function isPdfUrl(url: string) {
  return url.toLowerCase().split('?')[0].endsWith('.pdf');
}

export default function MultiFileUploadField({ label, value, onChange, max = 4 }: MultiFileUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = max - value.length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      setError(`แนบได้อีก ${remaining} ไฟล์เท่านั้น (สูงสุด ${max} ไฟล์)`);
    } else {
      setError(null);
    }
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of list) {
        if (file.size > 5 * 1024 * 1024) {
          setError(`"${file.name}" ขนาดเกิน 5MB`);
          continue;
        }
        const isPdf = file.type === 'application/pdf';
        const isImage = file.type.startsWith('image/');
        if (!isPdf && !isImage) {
          setError(`"${file.name}" ต้องเป็นไฟล์รูปภาพหรือ PDF เท่านั้น`);
          continue;
        }
        const bucket = isPdf ? 'award-certificates' : 'award-images';
        const url = await uploadAwardFile(file, bucket);
        uploadedUrls.push(url);
      }
      if (uploadedUrls.length > 0) {
        onChange([...value, ...uploadedUrls]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
        {label} <span className="text-slate-400 font-normal normal-case">(สูงสุด {max} ไฟล์ · รูปภาพหรือ PDF)</span>
      </span>

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {value.map((url, i) => (
            <div key={i} className="relative group aspect-square rounded-xl border-2 border-blue-100 bg-white overflow-hidden">
              {isPdfUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-full flex flex-col items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <span className="text-3xl">📄</span>
                  <span className="text-[10px] font-bold px-1 text-center">ดู PDF</span>
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={`ไฟล์แนบ ${i + 1}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => window.open(url, '_blank')}
                />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                aria-label="ลบไฟล์นี้"
              >
                ×
              </button>
            </div>
          ))}
          {Array.from({ length: Math.max(0, max - value.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-2xl"
            >
              +
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-rose-600 text-xs font-bold flex-1">⚠️ {error}</p>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 text-xs font-black">
            ✕
          </button>
        </div>
      )}

      {remaining > 0 ? (
        <label
          className={`flex items-center gap-3 cursor-pointer bg-white border-2 border-dashed rounded-xl px-4 py-3 transition-colors ${
            uploading ? 'opacity-70 pointer-events-none border-amber-300' : 'border-blue-200 hover:border-blue-400'
          }`}
        >
          <span className="text-2xl">{uploading ? '⏳' : '📎'}</span>
          <div>
            <p className="font-bold text-slate-600 text-sm">
              {uploading ? 'กำลังอัปโหลด...' : `เพิ่มไฟล์ (เหลืออีก ${remaining} ไฟล์)`}
            </p>
            <p className="text-slate-400 text-xs">รองรับ JPG, PNG, PDF ขนาดไม่เกิน 5MB ต่อไฟล์</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
      ) : (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <span>✅</span>
          <p className="text-emerald-700 text-sm font-bold">แนบครบ {max} ไฟล์แล้ว</p>
        </div>
      )}
    </div>
  );
}