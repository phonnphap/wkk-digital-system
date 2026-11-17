"use client";

import { useEffect, useState } from "react";
import { FileText, Send, Printer, CheckCircle2, XCircle, Clock, Loader2, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bangkokToday, thaiDate } from "@/lib/late-report/rows";
import { authHeaders, openAuthedPdf } from "@/lib/visitors/client-auth";
import SignatureCard from "@/components/visitors/SignatureCard";

const supabase = createClient();

type Step = { step: number; step_label: string; status: string; approver_name: string };
type Report = { id: string; status: string; total: number; reject_reason: string | null; reporter_name: string; late_report_steps: Step[] };
type Elig = { date: string; isAdmin: boolean; isDuty: boolean; canCreate: boolean; teachers: { id: string; name: string; hasSignature: boolean }[]; debug?: any; ver?: string };

// วางใต้ปุ่มหัวเพจ:  <LateReportPanel />   (สิทธิ์ตรวจฝั่ง server — ไม่ต้องส่ง canCreate แล้ว)
export default function LateReportPanel(_props: { canCreate?: boolean }) {
  const today = bangkokToday();
  const [date, setDate] = useState(today);
  const [elig, setElig] = useState<Elig | null>(null);
  const [reporterId, setReporterId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load(d: string) {
    setLoading(true);
    const [{ data }, er] = await Promise.all([
      supabase.from("late_reports")
        .select("id, status, total, reject_reason, reporter_name, late_report_steps(step, step_label, status, approver_name)")
        .eq("report_date", d).maybeSingle(),
      fetch(`/api/late-report/eligibility?date=${d}`, { headers: await authHeaders() })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setReport((data as unknown as Report) ?? null);
    setElig(er);
    setReporterId(er?.teachers?.[0]?.id ?? "");
    setLoading(false);
  }
  useEffect(() => { load(date); }, [date]);

  const isAdmin = !!elig?.isAdmin;
  const teacher = elig?.teachers.find((t) => t.id === reporterId) ?? elig?.teachers[0];

  async function submit() {
    const label = date === today ? "วันนี้" : thaiDate(date);
    if (!confirm(`ยืนยันสร้างและส่งรายงานจับสาย ${label}?\nระบบจะนับยอดนักเรียนมาสายของวันนั้น และส่งให้ผู้บังคับบัญชาอนุมัติ`)) return;
    setBusy(true);
    const res = await fetch("/api/late-report/submit", {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ date, reporter_id: isAdmin ? reporterId || undefined : undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(j.error ?? "ส่งรายงานไม่สำเร็จ"); return; }
    alert(`✅ ส่งรายงานแล้ว (ผู้รายงาน: ${j.reporter ?? "-"}) รอรองผู้อำนวยการอนุมัติ`);
    load(date);
  }

  async function cancelReport() {
    if (!report) return;
    const warn = report.status === "approved"
      ? "รายงานนี้อนุมัติครบแล้ว!\nยกเลิกจะลบรายงานและไฟล์ PDF ใน Supabase (ไฟล์ที่ส่งขึ้น Google Drive ต้องลบเอง)\n\nยืนยันยกเลิก?"
      : "ยืนยันยกเลิกรายงานนี้? ผู้อนุมัติจะไม่เห็นรายการนี้อีก และสามารถสร้างใหม่ได้";
    if (!confirm(warn)) return;
    setBusy(true);
    const res = await fetch(`/api/late-report/${report.id}/cancel`, { method: "POST", headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(j.error ?? "ยกเลิกไม่สำเร็จ"); return; }
    load(date);
  }

  const steps = [...(report?.late_report_steps ?? [])].sort((a, b) => a.step - b.step);
  const icon = (s: string) =>
    s === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : s === "rejected" ? <XCircle className="h-4 w-4 text-rose-500" />
    : s === "pending" ? <Clock className="h-4 w-4 text-amber-500" />
    : <Clock className="h-4 w-4 text-slate-300" />;

  const canPress = !report || report.status === "rejected";
  const canCreate = !!elig?.canCreate && (!isAdmin || (elig.teachers.length > 0 && !!teacher?.hasSignature));

  return (
    <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-indigo-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-base font-extrabold text-slate-800">
          <FileText className="h-5 w-5 text-indigo-500" /> รายงานจับสายประจำวัน (บันทึกข้อความ)
        </p>
        {isAdmin && (
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-[16px] font-semibold text-slate-600">
            <CalendarDays className="h-4 w-4 text-indigo-500" /> วันที่
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[16px]" />
          </label>
        )}
      </div>
      {isAdmin && <p className="mt-1 text-[16px] text-slate-400">แอดมินเลือกวันย้อนหลังได้ — ผู้รายงานจะเป็นครูเวรจับสายของวันนั้น (ใช้ชื่อและลายเซนของครูเวร)</p>}

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-400">กำลังโหลด...</p>
      ) : (
        <div className="mt-3 space-y-3">
          {isAdmin && canPress && (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-[16px]">
              <p className="font-bold text-slate-600">ครูเวรจับสาย {date === today ? "วันนี้" : thaiDate(date)}</p>
              {elig!.teachers.length === 0 ? (
                <>
                  <p className="text-rose-600">ไม่พบครูเวรในตารางเวรของวันที่นี้</p>
                  <details className="mt-1 text-[14px] text-slate-500">
                    <summary className="cursor-pointer font-semibold text-indigo-600">ดูรายละเอียดการตรวจเวร (ส่งให้ผู้พัฒนา)</summary>
                    <p className="mt-1 font-bold">
                      รุ่นโค้ดฝั่งเซิร์ฟเวอร์: {elig!.ver ?? "เก่า ❌ (ยังไม่ได้วาง eligibility/route.ts และ duty.ts ตัวล่าสุด)"}
                    </p>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2">{elig!.debug ? JSON.stringify(elig!.debug, null, 2) : "(ไม่มีข้อมูลวินิจฉัย)"}</pre>
                  </details>
                </>
              ) : elig!.teachers.length === 1 ? (
                <p className={teacher?.hasSignature ? "text-slate-700" : "text-rose-600"}>
                  {teacher?.name} {teacher?.hasSignature ? "· มีลายเซน ✓" : "· ยังไม่มีลายเซน ✗ (ให้ครูท่านนี้เซ็นก่อน)"}
                </p>
              ) : (
                <select value={reporterId} onChange={(e) => setReporterId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                  {elig!.teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} {t.hasSignature ? "✓ ลายเซน" : "✗ ไม่มีลายเซน"}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {report && (
            <div className="space-y-1.5">
              <p className="text-[16px] text-slate-500">ผู้รายงาน: <span className="font-semibold text-slate-700">{report.reporter_name || "-"}</span> · มาสายรวม {report.total} คน</p>
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
            {canPress && (
              <button onClick={submit} disabled={busy || !canCreate}
                className={`flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-extrabold shadow-md ${
                  canCreate ? "bg-gradient-to-r from-indigo-600 to-blue-500 text-white hover:-translate-y-0.5" : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
                } disabled:opacity-70`}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                {isAdmin && date !== today ? `สร้างรายงานย้อนหลัง ${thaiDate(date)}` : "สร้างและส่งรายงานจับสาย"}
              </button>
            )}
            {report && (
              <button type="button" onClick={() => openAuthedPdf(`/api/late-report/${report.id}/pdf?variant=unsigned`)}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <Printer className="h-4 w-4" /> ปริ้นท์ (ไม่มีลายเซนผู้อนุมัติ)
              </button>
            )}
            {report && isAdmin && (
              <button type="button" onClick={cancelReport} disabled={busy}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <XCircle className="h-4 w-4" /> ยกเลิกรายงานนี้ (แอดมิน)
              </button>
            )}
            {report?.status === "approved" && (
              <button type="button" onClick={() => openAuthedPdf(`/api/late-report/${report.id}/pdf?variant=signed`)}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-600 hover:bg-emerald-50">
                <FileText className="h-4 w-4" /> ฉบับมีลายเซน
              </button>
            )}
          </div>

          {canPress && !elig && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[16px] font-semibold text-amber-700">ตรวจสอบสิทธิ์ไม่สำเร็จ ลองรีเฟรชหน้า (Ctrl+F5) หรือตรวจว่าเข้าสู่ระบบอยู่</p>
          )}
          {canPress && elig && !elig.canCreate && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[16px] font-semibold text-amber-700">
              ระบบไม่พบชื่อคุณในเวรจุด "ดูแลนักเรียนมาสาย" ของวันนี้ — ตรวจตารางเวร หรือให้แอดมินสร้างแทน
            </p>
          )}
        </div>
      )}
      <SignatureCard />
    </div>
  );
}