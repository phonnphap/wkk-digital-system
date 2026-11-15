"use client";

import { useEffect, useState } from "react";
import { FileText, Send, Printer, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bangkokToday } from "@/lib/late-report/rows";

const supabase = createClient();

type Step = { step: number; step_label: string; status: string; approver_name: string };
type Report = { id: string; status: string; total: number; reject_reason: string | null; late_report_steps: Step[] };

// วางในคอลัมน์ขวาของหน้า late-checkin:  <LateReportPanel canCreate={isDutyToday || myRole === "admin"} />
export default function LateReportPanel({ canCreate }: { canCreate: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("late_reports")
      .select("id, status, total, reject_reason, late_report_steps(step, step_label, status, approver_name)")
      .eq("report_date", bangkokToday())
      .maybeSingle();
    setReport((data as unknown as Report) ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!confirm("ยืนยันสร้างและส่งรายงานจับสายประจำวันนี้?\nระบบจะนับยอดนักเรียนมาสาย ณ ตอนนี้ และส่งให้ผู้บังคับบัญชาอนุมัติ")) return;
    setBusy(true);
    const res = await fetch("/api/late-report/submit", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(j.error ?? "ส่งรายงานไม่สำเร็จ"); return; }
    load();
  }

  const steps = [...(report?.late_report_steps ?? [])].sort((a, b) => a.step - b.step);
  const icon = (s: string) =>
    s === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : s === "rejected" ? <XCircle className="h-4 w-4 text-rose-500" />
    : s === "pending" ? <Clock className="h-4 w-4 text-amber-500" />
    : <Clock className="h-4 w-4 text-slate-300" />;

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-m font-extrabold text-slate-800">
          <FileText className="h-4 w-4 text-indigo-500" /> รายงานจับสายประจำวัน
        </p>
      </div>

      {loading ? (
        <p className="py-4 text-center text-m text-slate-400">กำลังโหลด...</p>
      ) : (
        <div className="mt-3 space-y-3">
          {report && (
            <div className="space-y-1.5">
              {steps.map((s) => (
                <div key={s.step} className="flex items-center gap-2 text-[16px] text-slate-600">
                  {icon(s.status)} <span className="truncate">{s.step_label.replace("ความเห็น", "")}</span>
                  <span className="ml-auto shrink-0 text-slate-400">{s.approver_name}</span>
                </div>
              ))}
              {report.status === "rejected" && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-[16px] font-semibold text-rose-600">
                  ถูกตีกลับ: {report.reject_reason} — แก้ไขแล้วสร้างใหม่ได้
                </p>
              )}
              {report.status === "approved" && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[16px] font-semibold text-emerald-600">อนุมัติครบแล้ว</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canCreate && (!report || report.status === "rejected") && (
              <button onClick={submit} disabled={busy}
                className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-m font-semibold text-white shadow-md disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} สร้างและส่งรายงาน
              </button>
            )}
            {report && (
              <a href={`/api/late-report/${report.id}/pdf?variant=unsigned`} target="_blank"
                className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-m font-semibold text-slate-600 hover:bg-slate-50">
                <Printer className="h-4 w-4" /> ปริ้นท์ (ไม่มีลายเซนผู้อนุมัติ)
              </a>
            )}
            {report?.status === "approved" && (
              <a href={`/api/late-report/${report.id}/pdf?variant=signed`} target="_blank"
                className="flex items-center gap-1.5 rounded-2xl border-2 border-emerald-200 px-4 py-2.5 text-m font-semibold text-emerald-600 hover:bg-emerald-50">
                <FileText className="h-4 w-4" /> ฉบับมีลายเซน
              </a>
            )}
          </div>
          {!report && !canCreate && (
            <p className="text-[16px] text-slate-400">เฉพาะครูเวรจับสายของวันนี้เท่านั้นที่สร้างรายงานได้</p>
          )}
        </div>
      )}
    </div>
  );
}