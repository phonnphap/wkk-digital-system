'use client';

import { useEffect, useState } from 'react';
import {
  getAllTeachers,
  listProjectSupervisors,
  addProjectSupervisor,
  removeProjectSupervisor,
} from '@/lib/repair-permissions';

function fullName(u: any) {
  return u?.full_name || `${u?.title ?? ''} ${u?.first_name ?? ''} ${u?.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

export default function ManageSupervisorsButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [supervisorIds, setSupervisorIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isAdmin) return null;

  async function load() {
    setLoading(true);
    const [allTeachers, supervisors] = await Promise.all([getAllTeachers(), listProjectSupervisors()]);
    setTeachers(allTeachers);
    setSupervisorIds(new Set(supervisors.map((s: any) => s.user_id)));
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function toggle(userId: string) {
    setBusyId(userId);
    try {
      if (supervisorIds.has(userId)) {
        await removeProjectSupervisor(userId);
      } else {
        await addProjectSupervisor(userId);
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const filtered = teachers.filter((t) => fullName(t).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-xl"
      >
        👷 เพิ่มผู้ดูแลโครงการ
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-black text-slate-800">👷 ผู้ดูแลโครงการ (เห็นทุกอาคาร)</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-500">✕</button>
            </div>

            <div className="px-4 py-3 border-b border-slate-100 shrink-0">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 ค้นหาชื่อครู..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-10 text-slate-400 text-sm">กำลังโหลด...</div>
              ) : (
                filtered.map((t) => {
                  const active = supervisorIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id)}
                      disabled={busyId === t.id}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50 disabled:opacity-50"
                    >
                      <div className="text-left">
                        <p className="font-bold text-slate-800 text-sm">{fullName(t)}</p>
                        <p className="text-xs text-slate-400">{t.position}</p>
                      </div>
                      <span
                        className={`text-xs font-black px-3 py-1.5 rounded-lg border-2 ${
                          active
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-400'
                        }`}
                      >
                        {busyId === t.id ? '...' : active ? '✓ เป็นผู้ดูแล' : '+ เพิ่ม'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}