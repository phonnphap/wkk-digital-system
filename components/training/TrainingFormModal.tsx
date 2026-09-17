'use client';

import { useState } from 'react';
import {
  TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS, saveTrainingRecord,
} from '@/lib/training-records';
import type { TrainingRecordWithUser, TrainingType, TrainingStatus, EvidenceFile } from '@/lib/training-records';
import TrainingEvidenceUpload from './TrainingEvidenceUpload';

const TYPE_OPTIONS: TrainingType[] = ['Internal', 'External', 'Online', 'Workshop', 'Seminar'];
const STATUS_OPTIONS: TrainingStatus[] = ['attended', 'passed'];

// ★ ฟ้อนต์รวมทั้งฟอร์ม — TH Saraban
const THAI_FONT = "'TH Saraban New', 'TH SarabunPSK', 'Sarabun', sans-serif";

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

// ★ ช่องที่กรอกได้ = พื้นขาว ขอบฟ้า / เมื่อไม่ผ่าน validate = ขอบแดง พื้นแดงอ่อน
function fieldCls(err?: boolean) {
  return `w-full border-2 rounded-xl px-3.5 py-2.5 text-sm font-medium bg-white focus:outline-none transition-colors ${
    err ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-blue-200 focus:border-blue-500 text-slate-800'
  }`;
}

export default function TrainingFormModal({
  existing, currentUser, allUsers, canPickAnyUser, onSave, onClose,
}: {
  existing?: TrainingRecordWithUser | null;
  currentUser: { id: string; full_name: string };
  allUsers: any[];
  canPickAnyUser: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState(existing?.user_id ?? currentUser.id);
  const [courseName, setCourseName] = useState(existing?.course_name ?? '');
  const [trainingType, setTrainingType] = useState<TrainingType>(existing?.training_type ?? 'Internal');
  const [organizer, setOrganizer] = useState(existing?.organizer ?? '');
  const [startDate, setStartDate] = useState(existing?.start_date ?? '');
  const [endDate, setEndDate] = useState(existing?.end_date ?? '');
  const [hours, setHours] = useState(existing?.hours ?? 0);
  const [status, setStatus] = useState<TrainingStatus>(existing?.status ?? 'attended');
  const [keyTakeaways, setKeyTakeaways] = useState(existing?.key_takeaways ?? '');
  const [actionPlan, setActionPlan] = useState(existing?.action_plan ?? '');
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>(existing?.evidence_files ?? []);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const selectedUser = allUsers.find((u) => u.id === userId) ?? currentUser;

  // ★ บังคับกรอกทุกช่อง (ยกเว้นประเภท/สถานะ ที่เลือกไว้แล้วเสมอโดย default)
  function validate() {
    const e: Record<string, boolean> = {};
    if (!courseName.trim()) e.courseName = true;
    if (!organizer.trim()) e.organizer = true;
    if (!startDate) e.startDate = true;
    if (!endDate) e.endDate = true;
    if (!hours || hours <= 0) e.hours = true;
    if (!keyTakeaways.trim()) e.keyTakeaways = true;
    if (!actionPlan.trim()) e.actionPlan = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveTrainingRecord({
        id: existing?.id,
        user_id: userId,
        course_name: courseName.trim(),
        training_type: trainingType,
        organizer: organizer.trim(),
        start_date: startDate,
        end_date: endDate,
        hours: Number(hours),
        status,
        key_takeaways: keyTakeaways.trim(),
        action_plan: actionPlan.trim(),
        evidence_files: evidenceFiles,
      });
      onSave();
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ fontFamily: THAI_FONT }}
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">{existing ? '✏️ แก้ไขรายงานการอบรม' : '📝 บันทึกรายงานการอบรม'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {canPickAnyUser && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">บันทึกให้บุคลากร *</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={fieldCls()}>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{fullName(u)}{u.position ? ` · ${u.position}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ชื่อหลักสูตร/หัวข้อการอบรม *</label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => { setCourseName(e.target.value); if (errors.courseName) setErrors((er) => ({ ...er, courseName: false })); }}
              className={fieldCls(errors.courseName)}
            />
            {errors.courseName && <p className="text-xs text-red-500 font-bold mt-1">กรุณากรอกชื่อหลักสูตร/หัวข้อการอบรม</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ประเภทการอบรม *</label>
              <select value={trainingType} onChange={(e) => setTrainingType(e.target.value as TrainingType)} className={fieldCls()}>
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TRAINING_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">สถานะ *</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TrainingStatus)} className={fieldCls()}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TRAINING_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">สถาบัน/วิทยากรผู้จัดอบรม *</label>
            <input
              type="text"
              value={organizer}
              onChange={(e) => { setOrganizer(e.target.value); if (errors.organizer) setErrors((er) => ({ ...er, organizer: false })); }}
              className={fieldCls(errors.organizer)}
            />
            {errors.organizer && <p className="text-xs text-red-500 font-bold mt-1">กรุณากรอกสถาบัน/วิทยากรผู้จัดอบรม</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">วันที่เริ่ม *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); if (errors.startDate) setErrors((er) => ({ ...er, startDate: false })); }}
                className={fieldCls(errors.startDate)}
              />
              {errors.startDate && <p className="text-xs text-red-500 font-bold mt-1">กรุณาเลือกวันที่</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">วันที่สิ้นสุด *</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => { setEndDate(e.target.value); if (errors.endDate) setErrors((er) => ({ ...er, endDate: false })); }}
                className={fieldCls(errors.endDate)}
              />
              {errors.endDate && <p className="text-xs text-red-500 font-bold mt-1">กรุณาเลือกวันที่</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ชั่วโมงรวม *</label>
              <input
                type="number"
                step="0.5"
                value={hours}
                onChange={(e) => { setHours(Number(e.target.value)); if (errors.hours) setErrors((er) => ({ ...er, hours: false })); }}
                className={fieldCls(errors.hours)}
              />
              {errors.hours && <p className="text-xs text-red-500 font-bold mt-1">กรุณากรอกจำนวนชั่วโมง</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">สรุปองค์ความรู้ที่ได้รับ *</label>
            <textarea
              value={keyTakeaways}
              onChange={(e) => { setKeyTakeaways(e.target.value); if (errors.keyTakeaways) setErrors((er) => ({ ...er, keyTakeaways: false })); }}
              rows={3}
              className={fieldCls(errors.keyTakeaways) + ' resize-none'}
            />
            {errors.keyTakeaways && <p className="text-xs text-red-500 font-bold mt-1">กรุณากรอกสรุปองค์ความรู้ที่ได้รับ</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">การนำไปประยุกต์ใช้ในการทำงาน *</label>
            <textarea
              value={actionPlan}
              onChange={(e) => { setActionPlan(e.target.value); if (errors.actionPlan) setErrors((er) => ({ ...er, actionPlan: false })); }}
              rows={3}
              className={fieldCls(errors.actionPlan) + ' resize-none'}
            />
            {errors.actionPlan && <p className="text-xs text-red-500 font-bold mt-1">กรุณากรอกการนำไปประยุกต์ใช้ในการทำงาน</p>}
          </div>

          <TrainingEvidenceUpload
            teacherName={fullName(selectedUser)}
            trainingType={trainingType}
            startDate={startDate}
            value={evidenceFiles}
            onChange={setEvidenceFiles}
          />
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}