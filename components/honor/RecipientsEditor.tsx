'use client';

import type { AwardCategory, Recipient } from '@/types/honor';
import { RECIPIENT_ROLE_LABELS, RECIPIENT_ROLE_OPTIONS } from '@/types/honor';

interface Props {
  category: AwardCategory;
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
}

const emptyRecipient: Recipient = {
  recipient_name: '',
  student_id: '',
  grade_level: '',
  classroom: '',
  department: '',
  role: null,
};

export default function RecipientsEditor({ category, recipients, onChange }: Props) {
  const supportsTeam = category === 'Teacher' || category === 'Student';

  const update = (index: number, patch: Partial<Recipient>) => {
    const next = recipients.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const addRow = () => onChange([...recipients, { ...emptyRecipient }]);
  const removeRow = (index: number) => {
    if (recipients.length === 1) return; // ต้องมีอย่างน้อย 1 คนเสมอ
    onChange(recipients.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-ink">
          ผู้รับรางวัล {supportsTeam && <span className="text-muted font-normal">(รองรับรางวัลประเภททีม)</span>}
        </h3>
        {supportsTeam && (
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-semibold text-gold-dark hover:underline"
          >
            + เพิ่มผู้รับรางวัล
          </button>
        )}
      </div>

      <div className="space-y-3">
        {recipients.map((r, i) => (
          <div key={i} className="rounded-md border border-navy/10 bg-parchment2/40 p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted font-medium">
                  {category === 'School' ? 'ชื่อโรงเรียน' : category === 'Executive' ? 'ชื่อผู้บริหาร' : 'ชื่อ-สกุล'}
                </span>
                <input
                  required
                  type="text"
                  value={r.recipient_name}
                  onChange={(e) => update(i, { recipient_name: e.target.value })}
                  className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
                />
              </label>

              {category === 'Student' && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">รหัสนักเรียน</span>
                    <input
                      type="text"
                      value={r.student_id ?? ''}
                      onChange={(e) => update(i, { student_id: e.target.value })}
                      className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">ระดับชั้น</span>
                    <input
                      type="text"
                      placeholder="เช่น ม.3"
                      value={r.grade_level ?? ''}
                      onChange={(e) => update(i, { grade_level: e.target.value })}
                      className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">ห้องเรียน</span>
                    <input
                      type="text"
                      placeholder="เช่น ห้อง 1"
                      value={r.classroom ?? ''}
                      onChange={(e) => update(i, { classroom: e.target.value })}
                      className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
                    />
                  </label>
                </>
              )}

              {category === 'Teacher' && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">กลุ่มสาระ/ฝ่ายงาน</span>
                    <input
                      type="text"
                      value={r.department ?? ''}
                      onChange={(e) => update(i, { department: e.target.value })}
                      className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-muted font-medium">บทบาทในรางวัล</span>
                    <select
                      value={r.role ?? ''}
                      onChange={(e) => update(i, { role: (e.target.value || null) as Recipient['role'] })}
                      className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm focus-gold focus:outline-none"
                    >
                      <option value="">— เลือก —</option>
                      {RECIPIENT_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{RECIPIENT_ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            {supportsTeam && recipients.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="mt-2 text-xs text-clay hover:underline"
              >
                − ลบผู้รับรางวัลคนนี้
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
