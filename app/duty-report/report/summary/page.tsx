"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, BarChart3, AlertTriangle, ShieldAlert } from "lucide-react";
import { THAI_DOW, jsDateToDow, todayISO } from "@/lib/duty-helpers";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

const supabase = createClient();
const DAYS_BACK = 14; // ★ ช่วงข้อมูลย้อนหลังที่ใช้สรุป ปรับได้ตามต้องการ

function isoDateNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function DutySummaryDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [trendData, setTrendData] = useState<{ date: string; label: string; total: number; done: number; percent: number }[]>([]);
  const [byPointData, setByPointData] = useState<{ name: string; total: number; done: number }[]>([]);
  const [gpsIssues, setGpsIssues] = useState<any[]>([]);

  // ★ ตรวจสิทธิ์: เฉพาะแอดมิน/ผู้บริหารเท่านั้นที่เห็นหน้านี้
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) { setAuthorized(false); return; }
      const { data: profile } = await supabase
        .from("users").select("role, email").eq("auth_id", user.id).maybeSingle();
      const role = (profile as any)?.role ?? "";
      const email = (profile as any)?.email ?? "";
      const ok = ["admin", "director", "deputy_director", "admin_general"].includes(role) || email === "chanidapa@khienkhet.ac.th";
      setAuthorized(ok);
    });
  }, []);

  useEffect(() => {
    if (authorized) loadSummary();
  }, [authorized]);

  async function loadSummary() {
    setLoading(true);
    setErrorMsg("");

    const startDate = isoDateNDaysAgo(DAYS_BACK - 1);
    const endDate = todayISO();

    // ทุกช่วงเวลาที่ตั้งไว้ (เพื่อรู้ว่าวันไหน "ควรมี" กี่จุด)
    const { data: slotsAll, error: slotsErr } = await supabase
      .from("duty_time_slots")
      .select("id, day_of_week, duty_point_id, duty_point:duty_points(id, point_number, title)");
    if (slotsErr) { setErrorMsg("โหลดข้อมูลช่วงเวลาไม่สำเร็จ: " + slotsErr.message); setLoading(false); return; }

    // บันทึกการเซ็นชื่อในช่วงวันที่สรุป
    const { data: logsData, error: logsErr } = await supabase
      .from("duty_daily_logs")
      .select("id, log_date, status, gps_status, distance_meters, time_slot_id, signed_at, signer:users!duty_daily_logs_signed_by_fkey(id, title, first_name, last_name), time_slot:duty_time_slots(id, day_of_week, duty_point_id, duty_point:duty_points(id, point_number, title))")
      .gte("log_date", startDate)
      .lte("log_date", endDate);
    if (logsErr) { setErrorMsg("โหลดข้อมูลการเซ็นชื่อไม่สำเร็จ: " + logsErr.message); setLoading(false); return; }

    const slots = slotsAll ?? [];
    const logs = logsData ?? [];

    // --- กราฟเส้น: % ความคืบหน้ารายวัน ย้อนหลัง DAYS_BACK วัน ---
    const trend: { date: string; label: string; total: number; done: number; percent: number }[] = [];
    for (let i = DAYS_BACK - 1; i >= 0; i--) {
      const iso = isoDateNDaysAgo(i);
      const dow = jsDateToDow(new Date(iso + "T00:00:00"));
      const total = slots.filter((s: any) => s.day_of_week === dow).length;
      const done = logs.filter((l: any) => l.log_date === iso && l.status === "done").length;
      trend.push({
        date: iso,
        label: `${THAI_DOW[dow]} ${iso.slice(5)}`,
        total,
        done,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      });
    }
    setTrendData(trend);

    // --- กราฟแท่ง: สรุปตามจุดเวร (รวมทั้งช่วง) ---
    const pointMap = new Map<string, { name: string; total: number; done: number }>();
    slots.forEach((s: any) => {
      const p = s.duty_point;
      if (!p) return;
      if (!pointMap.has(p.id)) pointMap.set(p.id, { name: `${p.point_number}. ${p.title}`, total: 0, done: 0 });
    });
    // นับจำนวนครั้งที่ "ควรมี" ต่อจุดตลอดช่วง DAYS_BACK วัน
    for (let i = DAYS_BACK - 1; i >= 0; i--) {
      const iso = isoDateNDaysAgo(i);
      const dow = jsDateToDow(new Date(iso + "T00:00:00"));
      slots.filter((s: any) => s.day_of_week === dow).forEach((s: any) => {
        const p = s.duty_point;
        if (!p) return;
        const entry = pointMap.get(p.id);
        if (entry) entry.total += 1;
      });
    }
    logs.filter((l: any) => l.status === "done").forEach((l: any) => {
      const p = l.time_slot?.duty_point;
      if (!p) return;
      const entry = pointMap.get(p.id);
      if (entry) entry.done += 1;
    });
    setByPointData(Array.from(pointMap.values()).sort((a, b) => (a.total - a.done) - (b.total - b.done) < 0 ? 1 : -1));

    // --- รายการเช็คอินนอกระยะ (ให้ผู้บริหารตรวจสอบ) ---
    const issues = logs
      .filter((l: any) => l.gps_status === "out_of_range")
      .sort((a: any, b: any) => (a.log_date < b.log_date ? 1 : -1))
      .slice(0, 20);
    setGpsIssues(issues);

    setLoading(false);
  }

  const overallPercent = useMemo(() => {
    if (byPointData.length === 0) return 0;
    const total = byPointData.reduce((s, p) => s + p.total, 0);
    const done = byPointData.reduce((s, p) => s + p.done, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [byPointData]);

  if (authorized === false) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4">
        <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-400" />
          <p className="mt-3 text-sm font-bold text-slate-700">หน้านี้สำหรับผู้บริหาร/แอดมินเท่านั้น</p>
          <button onClick={() => router.push("/duty-report/report")} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/duty-report")} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <Home className="h-4.5 w-4.5" />
          </button>
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-indigo-600">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">งานเวรประจำวัน</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-800 sm:text-3xl">
            <BarChart3 className="h-6 w-6 text-indigo-500" /> แดชบอร์ดสรุปเวร
          </h1>
          <p className="mt-1 text-sm text-slate-500">ข้อมูลย้อนหลัง {DAYS_BACK} วัน</p>
        </div>

        {errorMsg && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}

        {loading || authorized === null ? (
          <p className="mt-10 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-xs font-bold text-slate-500">ความสำเร็จโดยรวม ({DAYS_BACK} วันล่าสุด)</p>
              <p className="mt-1 text-3xl font-black text-slate-800">{overallPercent}%</p>
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-sm font-extrabold text-slate-800">แนวโน้มความคืบหน้ารายวัน</p>
              <div className="mt-4 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Line type="monotone" dataKey="percent" name="เสร็จตามกำหนด" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-sm font-extrabold text-slate-800">สรุปตามจุดเวร (เรียงจากที่ค้างมากสุด)</p>
              <div className="mt-4 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byPointData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="done" name="เซ็นแล้ว" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="total" name="ทั้งหมด" stackId="b" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-sm font-extrabold text-slate-800">เช็คอินนอกระยะจุดเวร (20 รายการล่าสุด)</p>
              {gpsIssues.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">ไม่พบรายการที่เช็คอินนอกระยะในช่วงนี้</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {gpsIssues.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs">
                      <div>
                        <p className="font-semibold text-slate-700">{l.time_slot?.duty_point?.title ?? "-"}</p>
                        <p className="text-slate-500">{l.log_date} · {l.signer ? `${l.signer.title ?? ""}${l.signer.first_name} ${l.signer.last_name}` : "ไม่ทราบผู้เซ็น"}</p>
                      </div>
                      <span className="font-bold text-amber-600">{Math.round(l.distance_meters ?? 0)} ม.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}