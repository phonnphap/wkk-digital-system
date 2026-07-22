'use client';

import { useRef, useState } from 'react';
import { buildTrainingFileName, sanitizeSegment } from '@/lib/training-file-naming';
import type { EvidenceFile } from '@/lib/training-records';

const ONEDRIVE_ACCOUNT = 'hr@khienkhet.ac.th';

export default function TrainingEvidenceUpload({
  teacherName,
  startDate,
  value,
  onChange,
}: {
  teacherName: string;
  startDate: string;
  value: EvidenceFile[];
  onChange: (files: EvidenceFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (!startDate) {
      setError('กรุณาเลือกวันที่เริ่มอบรมก่อนแนบไฟล์');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded: EvidenceFile[] = [];
      let seq = value.length;
      const folder = sanitizeSegment(teacherName || 'ไม่ระบุชื่อ');
      for (const file of Array.from(fileList)) {
        const fileName = buildTrainingFileName(startDate, file.name, seq);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('path', `${folder}/${fileName}`);
        fd.append('account', ONEDRIVE_ACCOUNT);

        const res = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error?.message || data.error || 'อัปโหลดไม่สำเร็จ');

        uploaded.push({ url: data.url, name: fileName });
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
      <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">
        ไฟล์หลักฐาน (ใบประกาศ/รูปถ่าย/เอกสารประกอบ)
      </span>

      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map((f, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-xl border-2 border-blue-100 bg-blue-50/50 px-3 py-2">
              <a href={f.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-800 hover:underline truncate">
                📎 {f.name}
              </a>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 text-red-500 font-black text-xs shrink-0 hover:bg-red-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
          <>📎 แนบไฟล์หลักฐาน (เลือกได้หลายไฟล์)</>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {error && <p className="text-xs text-red-600 font-bold">⚠️ {error}</p>}
    </div>
  );
}