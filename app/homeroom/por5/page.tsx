"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { BookOpen, LayoutGrid, ArrowRight } from "lucide-react";

const POR5_MENUS = [
  { key: "subjects", name: "รายวิชา", desc: "แสดงทุกวิชาที่นักเรียนในห้องเรียน — เลือกวิชาเพื่อดูเช็คชื่อ / คะแนนรวม / เชิงลึก (ดูอย่างเดียว)", icon: BookOpen, color: "bg-blue-600", path: "/homeroom/por5/subjects" },
  { key: "summary", name: "สรุปผล", desc: "คะแนนรวม / การมาเรียน / เชิงลึก ของทุกวิชา รวมในตารางเดียว", icon: LayoutGrid, color: "bg-fuchsia-600", path: "/homeroom/por5/summary" },
];

export default function Por5HubPage() {
  const router = useRouter();
  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/homeroom")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">←</button>
        <h1 className="text-lg font-bold text-slate-800">ปพ.5</h1>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {POR5_MENUS.map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => router.push(m.path)}
              className="group text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-blue-200 transition"
            >
              <div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${m.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[15px] font-bold text-slate-800">{m.name}</h3>
              <p className="mt-1 text-[13px] text-slate-500">{m.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-blue-600">
                เปิดใช้งาน <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}