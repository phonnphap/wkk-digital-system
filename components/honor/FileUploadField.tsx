'use client';

import { useState } from 'react';
import { uploadAwardFile } from '@/lib/honor-awards';

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  bucket: 'award-images' | 'award-certificates';
  accept: string;
}

export default function FileUploadField({ label, value, onChange, bucket, accept }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const url = await uploadAwardFile(file, bucket);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไฟล์ไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-muted font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <label className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-dashed border-navy/25 bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-parchment2 transition-colors">
          {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์'}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gold-dark hover:underline truncate max-w-[200px]"
          >
            ดูไฟล์ที่อัปโหลดแล้ว ↗
          </a>
        )}
      </div>
      <input
        type="text"
        placeholder="หรือวางลิงก์ URL โดยตรง"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-navy/15 bg-white px-3 py-2 text-xs focus-gold focus:outline-none"
      />
      {error && <p className="text-xs text-clay">{error}</p>}
    </div>
  );
}
