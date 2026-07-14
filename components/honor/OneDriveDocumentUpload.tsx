'use client';

import { useRef, useState } from 'react';
import type { UploadedFile } from './OneDriveMultiImageUpload';

function sanitizeSegment(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function buildSequentialFileName(originalName: string, seq = 1) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyyBE = now.getFullYear() + 543;
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  const seqStr = String(seq).padStart(2, '0');
  return `${dd}${mm}${yyyyBE}_${seqStr}${ext}`;
}

function isImageName(name: string) {
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
}

function fileIcon(name: string) {
  if (/\.pdf$/i.test(name)) return '📕';
  if (/\.docx?$/i.test(name)) return '📘';
  if (/\.xlsx?$/i.test(name)) return '📗';
  return '📄';
}

export default function OneDriveDocumentUpload({
  label,
  value,
  onChange,
  folderPath,
  accept = 'application/pdf,image/*',
  account = 'hr@khienkhet.ac.th',
}: {
  label: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  folderPath: string;
  accept?: string;
  account?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
fd.append('path', `${folderPath}/${buildSequentialFileName(file.name)}`);
      fd.append('account', account);

      const res = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || data.error || 'อัปโหลดไม่สำเร็จ');

      onChange({ url: data.url, name: file.name, itemId: data.itemId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{label}</span>

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border-2 border-blue-100 bg-blue-50/50 px-3 py-2.5">
          {isImageName(value.name) ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden border border-blue-200 shrink-0 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.url} alt={value.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg border border-blue-200 shrink-0 bg-white flex items-center justify-center text-2xl">
              {fileIcon(value.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <a
              href={value.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-blue-800 hover:underline truncate block"
            >
              {value.name}
            </a>
            <span className="text-xs text-slate-400 font-medium">อัปโหลดแล้ว · เปิดดูไฟล์</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-500 font-black text-sm shrink-0 hover:bg-red-100 transition-colors"
            aria-label="ลบไฟล์นี้"
          >
            ✕
          </button>
        </div>
      ) : (
        <label
          className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-bold cursor-pointer transition-all ${
            uploading
              ? 'border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'
              : 'border-blue-200 bg-blue-50/50 text-blue-700 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
              กำลังอัปโหลด...
            </>
          ) : (
            <>📎 เลือกไฟล์เอกสาร</>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files)}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-600 font-bold">⚠️ {error}</p>}
    </div>
  );
}