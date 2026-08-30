'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getTrainingAccess, getAllTeachers, getTargetHoursPerYear } from '@/lib/training-permissions';
import {
  fetchTrainingRecords, deleteTrainingRecord, TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS,
} from '@/lib/training-records';
import type { TrainingRecordWithUser, TrainingType } from '@/lib/training-records';
import { exportTrainingToXlsx, printIndividualReport } from '@/lib/training-export';
import TrainingFormModal from '@/components/training/TrainingFormModal';
import ManageTrainingSupervisorsButton from '@/components/training/ManageTrainingSupervisorsButton';

function fullName(r: any) {
  return r.full_name || `${r.title ?? ''} ${r.first_name ?? ''} ${r.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}
function thaiDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()]} ${d.getFullYear()+543}`;
}

export default function TrainingPage() {
  const router = useRouter();
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getTrainingAccess>> | null>(null);
  const [records, setRecords] = useState<TrainingRecordWithUser[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [targetHours, setTargetHours] = useState(20);
  const [tab, setTab] = useState<'dashboard' | 'list' | 'mine'>('list');
  const [filterType, setFilterType] = useState<TrainingType | 'All'>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TrainingRecordWithUser | null>(null);
  const [printingOwn, setPrintingOwn] = useState(false);

  const loadAll = useCallback(async () => {
    const acc = await getTrainingAccess();
    setAccess(acc);
    if (!acc.user) { setLoading(false); return; }
    const [recs, users, target] = await Promise.all([
      fetchTrainingRecords(), getAllTeachers(), getTargetHoursPerYear(),
    ]);
    setRecords(recs);
    setAllUsers(users);
    setTargetHours(target);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const myRecords = useMemo(() => records.filter((r) => r.user_id === access?.user?.id), [records, access]);

  // ✅ ทุกคนเห็นรายการทั้งหมดเสมอ (canViewAll เป็น true ตายตัวแล้วจากฝั่ง permissions)
  const visibleRecords = useMemo(() => {
    let list = records;
    if (filterType !== 'All') list = list.filter((r) => r.training_type === filterType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.course_name.toLowerCase().includes(q) || (r.organizer ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [records, filterType, search]);

  const chartData = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const r of records) byType[r.training_type] = (byType[r.training_type] ?? 0) + Number(r.hours);
    return Object.entries(byType).map(([type, hours]) => ({ name: TRAINING_TYPE_LABELS[type as TrainingType] ?? type, ชั่วโมง: hours }));
  }, [records]);

  // ✅ แก้ไข/ลบได้เฉพาะเจ้าของรายการเท่านั้น — ผู้ดูแลโครงการ/แอดมิน/ผู้บริหาร เห็นได้ทุกคนแต่แก้ไข/ลบไม่ได้
function canEditRecord(r: TrainingRecordWithUser): boolean {
  if (!access?.user) return false;
  return r.user_id === access.user.id;
}

  async function handleDelete(id: string) {
    if (!confirm('ยืนยันการลบรายงานนี้?')) return;
    await deleteTrainingRecord(id);
    await loadAll();
  }

  async function handlePrintOwn() {
    if (!access?.user) return;
    setPrintingOwn(true);
    try {
      await printIndividualReport(
        {
          full_name: access.user.full_name,
          position: allUsers.find(u => u.id === access.user!.id)?.position,
          grade_level: myRecords[0]?.grade_level,
          department_name: myRecords[0]?.department_name,
          signature_url: access.user.signature_url,
        },
        myRecords, targetHours
      );
    } finally {
      setPrintingOwn(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-400 animate-pulse">กำลังโหลด...</p></div>;
  if (!access?.user) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-400">กรุณาเข้าสู่ระบบ</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif" }}>
      <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 px-5 py-4 flex items-center gap-3 shadow-lg shrink-0">
        <button onClick={()=>router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight">📚 รายงานการอบรมรายบุคคล</h1>
          <p className="text-blue-100 text-sm">{access.user.full_name}{access.isManagement ? ' · ผู้ดูแลระบบ/โครงการ' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <ManageTrainingSupervisorsButton isAdmin={access.isAdmin} />
          {access.isManagement && (
            <button onClick={() => exportTrainingToXlsx(visibleRecords)}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl border border-white/30">
              📊 Export Excel
            </button>
          )}
          <button onClick={handlePrintOwn} disabled={printingOwn}
            className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl border border-white/30 disabled:opacity-50">
            {printingOwn ? '⏳ กำลังเตรียม...' : '📄 รายงานของฉัน (PDF)'}
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-4 py-2 bg-white text-blue-600 text-xs font-bold rounded-xl shadow-sm hover:bg-blue-50">
            + บันทึกการอบรม
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 flex shrink-0">
        {([
          ...(access.isManagement ? [['dashboard', '📊 แดชบอร์ด']] as const : []),
          ['list', '📋 รายการทั้งหมด'],
          ['mine', '📌 ของฉัน'],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-5 py-3.5 text-sm font-bold border-b-2 whitespace-nowrap transition-all ${
              tab === k ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'dashboard' && access.isManagement && (
          <div className="max-w-5xl mx-auto p-5 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'บุคลากรที่มีข้อมูล', value: new Set(records.map(r => r.user_id)).size, icon: '👥' },
                { label: 'จำนวนคอร์สรวม', value: records.length, icon: '📚' },
                { label: 'ชั่วโมงรวมทั้งหมด', value: records.reduce((s, r) => s + Number(r.hours), 0), icon: '⏱️' },
                { label: 'เป้าหมาย/ปี/คน', value: targetHours, icon: '🎯' },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                  <span className="text-3xl">{s.icon}</span>
                  <div>
                    <div className="text-2xl font-black text-blue-600">{s.value}</div>
                    <div className="text-xs text-slate-400 font-medium">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-700 text-sm mb-4">ชั่วโมงอบรมจำแนกตามประเภท</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontFamily: 'Sarabun', fontSize: 13, borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ชั่วโมง" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {(tab === 'list' || tab === 'mine') && (
          <div className="max-w-4xl mx-auto p-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">ประเภทการอบรม</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}
                  className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  <option value="All">ทั้งหมด</option>
                  {Object.entries(TRAINING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-bold text-slate-400 mb-1">ค้นหา</label>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="ชื่อหลักสูตร, สถาบัน..."
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none" />
              </div>
              <span className="text-xs text-slate-400 self-end">{(tab === 'mine' ? myRecords : visibleRecords).length} รายการ</span>
            </div>

            <div className="space-y-3">
              {(tab === 'mine' ? myRecords : visibleRecords).map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 text-sm">{r.course_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-1">
                        {tab === 'list' && <span>👤 {fullName(r)}</span>}
                        <span>🏷️ {TRAINING_TYPE_LABELS[r.training_type]}</span>
                        <span>📅 {thaiDate(r.start_date)} – {thaiDate(r.end_date)}</span>
                        <span>⏱️ {r.hours} ชม.</span>
                        <span>{TRAINING_STATUS_LABELS[r.status]}</span>
                      </div>
                      {(r.evidence_files ?? []).length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {r.evidence_files.map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:underline px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                              📎 {f.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* ✅ ปุ่มแก้ไข/ลบ แสดงเฉพาะเจ้าของรายการ หรือผู้บริหาร/ผู้ดูแลโครงการเท่านั้น — คนอื่นดูได้อย่างเดียว */}
                    {canEditRecord(r) ? (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => { setEditing(r); setShowForm(true); }}
                          className="text-xs font-bold text-amber-600 hover:text-amber-800 px-2 py-1 rounded-lg hover:bg-amber-50 border border-amber-200">✏️</button>
                        <button onClick={() => handleDelete(r.id)}
                          className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 border border-red-200">🗑️</button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-300 shrink-0 self-start px-2 py-1">🔒 ดูอย่างเดียว</span>
                    )}
                  </div>
                </div>
              ))}
              {(tab === 'mine' ? myRecords : visibleRecords).length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-400">
                  <p className="text-4xl mb-2">📚</p>
                  <p className="text-sm">ยังไม่มีรายงานการอบรม</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showForm && access.user && (
        <TrainingFormModal
          existing={editing}
          currentUser={access.user}
          allUsers={allUsers}
          canPickAnyUser={access.isManagement}
          onSave={async () => { setShowForm(false); setEditing(null); await loadAll(); }}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}