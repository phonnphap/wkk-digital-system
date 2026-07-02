'use client';

import type { AwardCategory, Recipient } from '@/types/honor';
import { RECIPIENT_ROLE_LABELS, RECIPIENT_ROLE_OPTIONS } from '@/types/honor';
import { fieldCls } from '@/lib/form-styles';

interface Props {
  category: AwardCategory;
  recipients: Recipient[];
  submitted: boolean;
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

export default function RecipientsEditor({ category, recipients, submitted, onChange }: Props) {
  const supportsTeam = category === 'Teacher' || category === 'Student';

  const update = (index: number, patch: Partial<Recipient>) => {
    const next = recipients.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const addRow = () => onChange([...recipients, { ...emptyRecipient }]);
  const removeRow = (index: number) => {
    if (recipients.length === 1) return;
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
        {recipients.map((r, i) => {
          const nameInvalid = submitted && !r.recipient_name.trim();
          return (
            <div key={i} className="rounded-md border border-navy/10 bg-parchment2/40 p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted font-medium">
                    {category === 'School' ? 'ชื่อโรงเรียน *' : category === 'Executive' ? 'ชื่อผู้บริหาร *' : 'ชื่อ-สกุล *'}
                  </span>
                  <input
                    type="text"
                    value={r.recipient_name}
                    onChange={(e) => update(i, { recipient_name: e.target.value })}
                    className={fieldCls(nameInvalid)}
                  />
                  {nameInvalid && <p className="text-xs text-red-500">กรุณากรอกชื่อผู้รับรางวัล</p>}
                </label>

                {category === 'Student' && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">รหัสนักเรียน</span>
                      <input
                        type="text"
                        value={r.student_id ?? ''}
                        onChange={(e) => update(i, { student_id: e.target.value })}
                        className={fieldCls(false, 'font-mono')}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">ระดับชั้น</span>
                      <input
                        type="text"
                        placeholder="เช่น ม.3"
                        value={r.grade_level ?? ''}
                        onChange={(e) => update(i, { grade_level: e.target.value })}
                        className={fieldCls(false)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">ห้องเรียน</span>
                      <input
                        type="text"
                        placeholder="เช่น ห้อง 1"
                        value={r.classroom ?? ''}
                        onChange={(e) => update(i, { classroom: e.target.value })}
                        className={fieldCls(false)}
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
                        className={fieldCls(false)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-muted font-medium">บทบาทในรางวัล</span>
                      <select
                        value={r.role ?? ''}
                        onChange={(e) => update(i, { role: (e.target.value || null) as Recipient['role'] })}
                        className={fieldCls(false)}
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
          );
        })}
      </div>
    </div>
  );
}