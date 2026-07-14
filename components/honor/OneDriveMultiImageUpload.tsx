'use client';

import { useRef, useState } from 'react';

export type UploadedFile = { url: string; name: string; itemId?: string };

function sanitizeSegment(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function buildSequentialFileName(originalName: string, seq: number) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyyBE = now.getFullYear() + 543;
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  const seqStr = String(seq).padStart(2, '0');
  return `${dd}${mm}${yyyyBE}_${seqStr}${ext}`;
}

export default function OneDriveMultiImageUpload({
  label,
  value,
  onChange,
  folderPath,
  max = 4,
  account = 'hr@khienkhet.ac.th',
}: {
  label: string;
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  folderPath: string;
  max?: number;
  account?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = max - value.length;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const files = Array.from(fileList).slice(0, remaining);
    if (files.length < fileList.length) {
      setError(`อัปโหลดได้สูงสุด ${max} รูป — เลือกมาเกิน จึงอัปโหลดแค่ ${files.length} รูปแรก`);
    }

    setUploading(true);
try {
  const uploaded: UploadedFile[] = [];
  let seq = value.length + 1; // ★ นับต่อจากรูปที่มีอยู่แล้ว กันชื่อไฟล์ซ้ำ
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('path', `${folderPath}/${buildSequentialFileName(file.name, seq)}`);
    fd.append('account', account);

    const res = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error?.message || data.error || 'อัปโหลดไม่สำเร็จ');

    uploaded.push({ url: data.url, name: file.name, itemId: data.itemId });
    seq++;
  }
  onChange([...value, ...uploaded]);
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
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{label}</span>
        <span className="text-xs text-slate-400 font-bold">{value.length}/{max} รูป</span>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {value.map((f, idx) => (
            <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border-2 border-blue-100 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow hover:bg-red-600 opacity-90 hover:opacity-100 transition-opacity"
                aria-label="ลบรูปนี้"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
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
            <>📷 เพิ่มรูป ({remaining} รูปที่เหลือ)</>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-600 font-bold">⚠️ {error}</p>}
    </div>
  );
}