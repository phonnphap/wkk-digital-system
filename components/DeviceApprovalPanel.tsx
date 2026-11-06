"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface DeviceRow {
  id: string;
  user_id: string;
  full_name: string;
  device_id: string;
  approved: boolean;
  created_at: string;
}

export default function DeviceApprovalPanel() {
  const supabase = createClient();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('admin_list_devices');
    if (error) {
      setError(error.message === 'forbidden' ? 'บัญชีนี้ไม่มีสิทธิ์แอดมิน' : error.message);
      setRows([]);
    } else {
      setRows((data as DeviceRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (fn: string, id: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    const { error } = await supabase.rpc(fn, { p_id: id });
    setBusyId(null);
    if (error) { window.alert("ผิดพลาด: " + error.message); return; }
    await load();
  };

  const shown = rows.filter(r =>
    filter === 'all' ? true : filter === 'approved' ? r.approved : !r.approved
  );
  const pendingCount = rows.filter(r => !r.approved).length;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
    });

  return (
    <div className="bg-white rounded-3xl border border-black/5 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-semibold text-[#1D1D1F]">
          อนุมัติเครื่องสแกน
          {pendingCount > 0 && (
            <span className="ml-2 text-xs bg-[#FF9F0A]/15 text-[#B8720A] px-2 py-0.5 rounded-full">
              รออนุมัติ {pendingCount}
            </span>
          )}
        </h3>
        <button type="button" onClick={load}
          className="text-xs text-[#0A84FF] font-medium">รีเฟรช</button>
      </div>

      <div className="grid grid-cols-3 gap-1 bg-black/[0.045] p-1 rounded-xl mb-4">
        {([['pending', 'รออนุมัติ'], ['approved', 'อนุมัติแล้ว'], ['all', 'ทั้งหมด']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`py-2 rounded-lg text-[13px] font-semibold transition-all ${filter === k ? 'bg-white shadow-sm text-[#1D1D1F]' : 'text-[#86868B]'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-[#FF3B30] mb-3">{error}</p>}
      {loading && <p className="text-sm text-[#86868B] text-center py-6">กำลังโหลด...</p>}

      {!loading && !error && shown.length === 0 && (
        <p className="text-sm text-[#AEAEB2] text-center py-6">ไม่มีรายการ</p>
      )}

      <div className="space-y-2">
        {shown.map(r => (
          <div key={r.id} className="p-4 bg-black/[0.025] rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#1D1D1F] break-words">
                  {r.full_name || 'ไม่ทราบชื่อ'}
                </p>
                <p className="text-[12px] text-[#86868B]">ลงทะเบียนเมื่อ {fmt(r.created_at)}</p>
                <p className="text-[11px] text-[#AEAEB2] font-mono mt-0.5">
                  รหัสเครื่อง …{r.device_id.slice(-8)}
                </p>
              </div>
              <span className={`shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-lg ${r.approved ? 'bg-[#30D158]/10 text-[#1E8E3E]' : 'bg-[#FF9F0A]/15 text-[#B8720A]'}`}>
                {r.approved ? 'อนุมัติแล้ว' : 'รออนุมัติ'}
              </span>
            </div>

            <div className="flex gap-2 mt-3">
              {!r.approved ? (
                <button type="button" disabled={busyId === r.id}
                  onClick={() => act('admin_approve_device', r.id,
                    `อนุมัติเครื่องนี้ให้ ${r.full_name || 'ผู้ใช้นี้'}?\n(ถ้ามีเครื่องเดิมที่อนุมัติอยู่ จะถูกเพิกถอนอัตโนมัติ)`)}
                  className="flex-1 py-2 rounded-xl text-[13px] font-semibold bg-[#0A84FF] text-white disabled:opacity-50">
                  อนุมัติ
                </button>
              ) : (
                <button type="button" disabled={busyId === r.id}
                  onClick={() => act('admin_revoke_device', r.id, `เพิกถอนการอนุมัติเครื่องของ ${r.full_name}?`)}
                  className="flex-1 py-2 rounded-xl text-[13px] font-semibold bg-black/[0.05] text-[#B8720A] disabled:opacity-50">
                  เพิกถอน
                </button>
              )}
              <button type="button" disabled={busyId === r.id}
                onClick={() => act('admin_delete_device', r.id, `ลบเครื่องนี้ของ ${r.full_name}? (เครื่องจะต้องลงทะเบียนใหม่)`)}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-black/[0.05] text-[#FF3B30] disabled:opacity-50">
                ลบ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}