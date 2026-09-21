'use client';

import { useState } from 'react';
import {
  TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS, saveTrainingRecord,
} from '@/lib/training-records';
import type { TrainingRecordWithUser, TrainingType, TrainingStatus, EvidenceFile } from '@/lib/training-records';
import TrainingEvidenceUpload from './TrainingEvidenceUpload';

const TYPE_OPTIONS: TrainingType[] = ['Internal', 'External', 'Online', 'Workshop', 'Seminar'];
const STATUS_OPTIONS: TrainingStatus[] = ['attended', 'passed'];

// ★ ฟ้อนต์รวมทั้งฟอร์ม — TH Sarabun New (โหลดจาก /fonts/ ใน public)
const THAI_FONT = "'TH Sarabun New', 'TH SarabunPSK', 'Sarabun', sans-serif";

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

// ★ ช่องที่กรอกได้ = พื้นขาว ขอบฟ้าอ่อน พร้อมเงานุ่ม ๆ / เมื่อไม่ผ่าน validate = ขอบแดง พื้นแดงอ่อน
function fieldCls(err?: boolean) {
  return `w-full border-2 rounded-xl px-4 py-3 text-base font-medium bg-white focus:outline-none focus:ring-4 transition-all ${
    err
      ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 text-slate-800'
  }`;
}

// ★ หัวข้อกลุ่มฟิลด์ — ใช้แยกส่วนให้สแกนตาง่ายขึ้น
function SectionLabel({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{icon}</span>
      <h4 className="text-m font-bold text-slate-500 tracking-wide">{children}</h4>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-m font-bold text-slate-500 mb-1.5">{children}</label>;
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-m text-red-500 font-bold mt-1.5 flex items-center gap-1">⚠️ {children}</p>;
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
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      style={{ fontFamily: THAI_FONT }}
    >
      {/* ★ สำรอง @font-face ไว้ในคอมโพเนนต์ กันกรณียังไม่ได้ใส่ใน globals.css
          แนะนำให้ย้ายบล็อกนี้ไปไว้ใน globals.css แทน (ใส่ครั้งเดียวทั้งเว็บ) */}
      <style jsx global>{`
        @font-face {
          font-family: 'TH Sarabun New';
          src: url('/fonts/THSarabunNew.ttf') format('truetype');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'TH Sarabun New';
          src: url('/fonts/THSarabun-Bold.ttf') format('truetype');
          font-weight: 700;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'TH Sarabun New';
          src: url('/fonts/THSarabun-Italic.ttf') format('truetype');
          font-weight: 400;
          font-style: italic;
          font-display: swap;
        }
        @font-face {
          font-family: 'TH Sarabun New';
          src: url('/fonts/THSarabun-BoldItalic.ttf') format('truetype');
          font-weight: 700;
          font-style: italic;
          font-display: swap;
        }

        /* scrollbar บางและสวยขึ้นสำหรับ textarea / modal body */
        .thin-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .thin-scroll::-webkit-scrollbar-track { background: transparent; }
        .thin-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
        .thin-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      <div
        className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-7 py-5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-white text-xl flex items-center gap-2">
            {existing ? '✏️ แก้ไขรายงานการอบรม' : '📝 บันทึกรายงานการอบรม'}
          </h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xl transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto thin-scroll flex-1 px-7 py-6 space-y-7 bg-slate-50">
          {/* กลุ่ม 1: ข้อมูลหลักสูตร */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <SectionLabel icon="📚">ข้อมูลหลักสูตร</SectionLabel>

            {canPickAnyUser && (
              <div>
                <FieldLabel>บันทึกให้บุคลากร *</FieldLabel>
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={fieldCls()}>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{fullName(u)}{u.position ? ` · ${u.position}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <FieldLabel>ชื่อหลักสูตร/หัวข้อการอบรม *</FieldLabel>
              <input
                type="text"
                value={courseName}
                onChange={(e) => { setCourseName(e.target.value); if (errors.courseName) setErrors((er) => ({ ...er, courseName: false })); }}
                className={fieldCls(errors.courseName)}
                placeholder="เช่น การใช้ AI เพื่อการจัดการเรียนรู้"
              />
              {errors.courseName && <ErrorText>กรุณากรอกชื่อหลักสูตร/หัวข้อการอบรม</ErrorText>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>ประเภทการอบรม *</FieldLabel>
                <select value={trainingType} onChange={(e) => setTrainingType(e.target.value as TrainingType)} className={fieldCls()}>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TRAINING_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>สถานะ *</FieldLabel>
                <select value={status} onChange={(e) => setStatus(e.target.value as TrainingStatus)} className={fieldCls()}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TRAINING_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </div>

            <div>
              <FieldLabel>สถาบัน/วิทยากรผู้จัดอบรม *</FieldLabel>
              <input
                type="text"
                value={organizer}
                onChange={(e) => { setOrganizer(e.target.value); if (errors.organizer) setErrors((er) => ({ ...er, organizer: false })); }}
                className={fieldCls(errors.organizer)}
              />
              {errors.organizer && <ErrorText>กรุณากรอกสถาบัน/วิทยากรผู้จัดอบรม</ErrorText>}
            </div>
          </div>

          {/* กลุ่ม 2: วันที่และชั่วโมง */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <SectionLabel icon="🗓️">วันที่และระยะเวลา</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel>วันที่เริ่ม *</FieldLabel>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); if (errors.startDate) setErrors((er) => ({ ...er, startDate: false })); }}
                  className={fieldCls(errors.startDate)}
                />
                {errors.startDate && <ErrorText>กรุณาเลือกวันที่</ErrorText>}
              </div>
              <div>
                <FieldLabel>วันที่สิ้นสุด *</FieldLabel>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => { setEndDate(e.target.value); if (errors.endDate) setErrors((er) => ({ ...er, endDate: false })); }}
                  className={fieldCls(errors.endDate)}
                />
                {errors.endDate && <ErrorText>กรุณาเลือกวันที่</ErrorText>}
              </div>
              <div>
                <FieldLabel>ชั่วโมงรวม *</FieldLabel>
                <input
                  type="number"
                  step="0.5"
                  value={hours}
                  onChange={(e) => { setHours(Number(e.target.value)); if (errors.hours) setErrors((er) => ({ ...er, hours: false })); }}
                  className={fieldCls(errors.hours)}
                />
                {errors.hours && <ErrorText>กรุณากรอกจำนวนชั่วโมง</ErrorText>}
              </div>
            </div>
          </div>

          {/* กลุ่ม 3: สรุปผลและการนำไปใช้ */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <SectionLabel icon="🧠">สรุปผลและการนำไปใช้</SectionLabel>

            <div>
              <FieldLabel>สรุปองค์ความรู้ที่ได้รับ *</FieldLabel>
              <textarea
                value={keyTakeaways}
                onChange={(e) => { setKeyTakeaways(e.target.value); if (errors.keyTakeaways) setErrors((er) => ({ ...er, keyTakeaways: false })); }}
                rows={5}
                className={fieldCls(errors.keyTakeaways) + ' resize-y min-h-[120px] leading-relaxed thin-scroll'}
                placeholder="สรุปสาระสำคัญที่ได้เรียนรู้จากการอบรมนี้..."
              />
              {errors.keyTakeaways && <ErrorText>กรุณากรอกสรุปองค์ความรู้ที่ได้รับ</ErrorText>}
            </div>

            <div>
              <FieldLabel>การนำไปประยุกต์ใช้ในการทำงาน *</FieldLabel>
              <textarea
                value={actionPlan}
                onChange={(e) => { setActionPlan(e.target.value); if (errors.actionPlan) setErrors((er) => ({ ...er, actionPlan: false })); }}
                rows={5}
                className={fieldCls(errors.actionPlan) + ' resize-y min-h-[120px] leading-relaxed thin-scroll'}
                placeholder="อธิบายแนวทางนำความรู้ไปใช้จริงในการเรียนการสอน/การทำงาน..."
              />
              {errors.actionPlan && <ErrorText>กรุณากรอกการนำไปประยุกต์ใช้ในการทำงาน</ErrorText>}
            </div>
          </div>

          {/* กลุ่ม 4: ไฟล์หลักฐาน */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <SectionLabel icon="📎">ไฟล์หลักฐาน</SectionLabel>
            <TrainingEvidenceUpload
              teacherName={fullName(selectedUser)}
              trainingType={trainingType}
              startDate={startDate}
              value={evidenceFiles}
              onChange={setEvidenceFiles}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-slate-200 flex gap-3 justify-end shrink-0 bg-white">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-base font-bold hover:bg-slate-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-base font-bold shadow-sm disabled:opacity-50 transition-colors"
          >
            {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}