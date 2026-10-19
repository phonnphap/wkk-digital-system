"use client";

import { useRouter } from "next/navigation";
import { Home, ClipboardList, ScanLine, UserCheck, ChevronRight } from "lucide-react";

const DASHBOARD_PATH = "/dashboard";

const MENU = [
  { name: "รายงานเวรประจำวัน", desc: "ดูสรุปผล/บันทึกรายงานเวร", icon: ClipboardList, color: "from-orange-500 to-amber-400", path: "/duty-report/report" },
  { name: "จับสาย", desc: "บันทึกนักเรียนมาสายหน้าประตู", icon: ScanLine, color: "from-rose-600 to-rose-400", path: "/late-checkin" },
  { name: "บุคคลภายนอก", desc: "บันทึกผู้มาติดต่อเข้า-ออกโรงเรียน", icon: UserCheck, color: "from-teal-600 to-emerald-400", path: "/visitors" },
];

export default function DutyReportHubPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
        <button
          onClick={() => router.push(DASHBOARD_PATH)}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-indigo-600 hover:shadow-md"
        >
          <Home className="h-4.5 w-4.5" />
        </button>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">งานเวรประจำวัน</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">เมนูงานเวร</h1>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.path}
                onClick={() => router.push(m.path)}
                className="group flex items-center gap-4 rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${m.color} text-white shadow-sm`}>
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-800">{m.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{m.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}