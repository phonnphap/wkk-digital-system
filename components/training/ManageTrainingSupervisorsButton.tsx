'use client';
import { useEffect, useState } from 'react';
import {
  getAllTeachers, listTrainingSupervisors, addTrainingSupervisor, removeTrainingSupervisor,
} from '@/lib/training-permissions';

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

export default function ManageTrainingSupervisorsButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!isAdmin) return null;

  async function load() {
    setLoading(true);
    const [t, s] = await Promise.all([getAllTeachers(), listTrainingSupervisors()]);
    setTeachers(t);
    setSupervisors(s);
    setLoading(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  const supervisorUserIds = new Set(supervisors.map((s: any) => s.user_id));
  const filtered = teachers.filter((t) => !supervisorUserIds.has(t.id) && fullName(t).toLowerCase().includes(search.toLowerCase()));

  async function handleAdd(userId: string) {
    setBusyId(userId);
    await addTrainingSupervisor(userId);
    await load();
    setBusyId(null);
  }
  async function handleRemove(rowId: string) {
    if (!confirm('ยืนยันการลบผู้ดูแลโครงการ?')) return;
    await removeTrainingSupervisor(rowId);
    await load();
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl border border-white/30">
        ⚙️ ผู้ดูแลโครงการ
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-base">⚙️ ผู้ดูแลโครงการอบรม</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                ผู้ดูแลโครงการเห็นรายงานการอบรมของทุกคน และสามารถบันทึก/แก้ไขแทนได้
              </div>
              <div className="relative">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 พิมพ์ชื่อครู..."
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white" />
                {search && filtered.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10 overflow-hidden mt-1 max-h-56 overflow-y-auto">
                    {filtered.map((t) => (
                      <button key={t.id} onClick={() => handleAdd(t.id)} disabled={busyId === t.id}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 border-b border-slate-100 last:border-0 flex items-center justify-between">
                        <span>{fullName(t)}</span>
                        <span className="text-blue-500 font-bold text-xs">{busyId === t.id ? '...' : '+ เพิ่ม'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ผู้ดูแลปัจจุบัน ({supervisors.length} คน)</p>
                {loading ? (
                  <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด...</div>
                ) : supervisors.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">ยังไม่มีผู้ดูแลโครงการ</div>
                ) : (
                  <div className="space-y-2">
                    {supervisors.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                        <p className="font-bold text-slate-800 text-sm">{fullName(s.users)}</p>
                        <button onClick={() => handleRemove(s.id)}
                          className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">🗑️ ลบ</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}