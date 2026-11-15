"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FolderOpen, FileText, CheckCircle2, XCircle, Printer, Loader2 } from "lucide-react";
import { FOLDERS, thaiDate, type ReportRow } from "@/lib/late-report/rows";

const supabase = createClient();

type Step = { id: string; step: number; step_label: string; status: string; approver_id: string; approver_name: string };
type Report = {
  id: string; report_date: string; status: string; total: number; reporter_name: string;
  rows: ReportRow[]; late_report_steps: Step[];
};

// ฝังในหน้า late-checkin: กล่อง "รอฉันอนุมัติ" + 2 โฟลเดอร์เอกสาร
export default function LateReportApprovals() {
  const [meId, setMeId] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  async function load() {
    const { data } = await supabase
      .from("late_reports")
      .select("id, report_date, status, total, reporter_name, rows, late_report_steps(id, step, step_label, status, approver_id, approver_name)")
      .order("report_date", { ascending: false })
      .limit(120);
    setReports((data as unknown as Report[]) ?? []);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("users").select("id").eq("auth_id", data.user.id).maybeSingle();
      if (p) setMeId(p.id);
    });
    load();
  }, []);

  const inbox = reports.filter(
    (r) => r.status === "pending" && r.late_report_steps.some((s) => s.status === "pending" && s.approver_id === meId)
  );
  const approved = reports.filter((r) => r.status === "approved");

  async function act(r: Report, action: "approve" | "reject") {
    if (action === "reject" && !comments[r.id]?.trim()) { alert("กรุณาระบุเหตุผลที่ไม่อนุมัติ"); return; }
    setBusy(r.id);
    const res = await fetch(`/api/late-report/${r.id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comment: comments[r.id] ?? "" }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) alert(j.error ?? "ทำรายการไม่สำเร็จ");
    load();
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-extrabold text-slate-800">รายงานจับสาย — อนุมัติ/เอกสาร</h2>
      {/* ── รออนุมัติของฉัน ── */}
      <section className="mt-5">
        <p className="text-m font-extrabold text-slate-700">รอฉันอนุมัติ ({inbox.length})</p>
        {inbox.length === 0 && <p className="mt-2 text-m text-slate-400">ไม่มีรายการค้าง</p>}
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {inbox.map((r) => (
            <div key={r.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-amber-200">
              <p className="text-m font-bold text-slate-800">{thaiDate(r.report_date)} · มาสายรวม {r.total} คน</p>
              <p className="text-[16px] text-slate-400">ผู้รายงาน: {r.reporter_name}</p>
              <a href={`/api/late-report/${r.id}/pdf?variant=unsigned`} target="_blank"
                className="mt-2 inline-flex items-center gap-1 text-[16px] font-semibold text-indigo-500 hover:underline">
                <Printer className="h-4 w-4" /> เปิดดูเอกสาร
              </a>
              <textarea
                value={comments[r.id] ?? ""} onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })}
                placeholder="ความเห็น (ไม่บังคับ — ถ้าไม่อนุมัติต้องระบุเหตุผล)" rows={2}
                className="mt-2 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-[16px] outline-none focus:border-indigo-400"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => act(r, "reject")} disabled={busy === r.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-rose-200 px-3 py-2 text-m font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-50">
                  <XCircle className="h-4 w-4" /> ไม่อนุมัติ
                </button>
                <button onClick={() => act(r, "approve")} disabled={busy === r.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-m font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} อนุมัติ + ลงลายเซน
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2 โฟลเดอร์ ── */}
      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        {(["signed", "unsigned"] as const).map((v) => (
          <div key={v} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-1.5 text-m font-extrabold text-slate-800">
              <FolderOpen className="h-4 w-4 text-indigo-500" /> {FOLDERS[v].label}
            </p>
            <div className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
              {approved.length === 0 && <p className="py-4 text-center text-m text-slate-400">ยังไม่มีไฟล์</p>}
              {approved.map((r) => (
                <a key={r.id} href={`/api/late-report/${r.id}/pdf?variant=${v}`} target="_blank"
                  className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-[16px] text-slate-700 hover:bg-indigo-50">
                  <FileText className="h-4 w-4 shrink-0 text-rose-500" />
                  <span className="truncate">{FOLDERS[v].label}_{r.report_date}.pdf</span>
                  <span className="ml-auto shrink-0 text-slate-400">{r.total} คน</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}