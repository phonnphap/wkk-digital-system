// app/homeroom/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Users, ClipboardCheck, NotebookPen, UtensilsCrossed,
  UserCheck, FileEdit, HeartHandshake, Home, ArrowRight,
  type LucideIcon,
} from "lucide-react";

const supabase = createClient();

type Classroom = {
  classroom_id: string;
  room_name: string;
  room_number?: number;
};

type MenuStatus = "live" | "in_progress";

type SubMenuItem = {
  key: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  path: string;
  status: MenuStatus;
};

// ★ เมนูย่อยทั้งหมดของครูประจำชั้น — เพิ่ม/ลบ/แก้ path ที่นี่ที่เดียว
const SUBMENUS: SubMenuItem[] = [
  { key: "students", name: "ทะเบียนนักเรียน", desc: "รายชื่อ ข้อมูลพื้นฐาน และผู้ปกครอง", icon: Users, color: "bg-blue-600", path: "/students", status: "live" },
  { key: "attendance", name: "บันทึกเช็คชื่อ", desc: "มาเรียน / ขาด / ลา / มาสาย รายวัน", icon: ClipboardCheck, color: "bg-indigo-600", path: "/attendance", status: "live" },
  { key: "homeroom-notes", name: "บันทึกโฮมรูม", desc: "ประเด็น/กิจกรรมโฮมรูมประจำวัน", icon: NotebookPen, color: "bg-violet-600", path: "/homeroom-notes", status: "in_progress" },
  { key: "meals", name: "บันทึกอาหารและนม", desc: "การรับอาหารกลางวัน/ดื่มนมรายวัน", icon: UtensilsCrossed, color: "bg-orange-500", path: "/meals", status: "in_progress" },
  { key: "nutrition", name: "ประเมินโภชนาการ", desc: "ส่วนสูง น้ำหนัก สรุปภาวะโภชนาการ", icon: UserCheck, color: "bg-emerald-600", path: "/nutrition", status: "live" },
  { key: "reading_writing", name: "ประเมินการอ่าน-เขียน", desc: "บันทึกความสามารถอ่าน-เขียนรายบุคคล", icon: FileEdit, color: "bg-sky-500", path: "/reading_writing", status: "live" },
  { key: "behavior", name: "บันทึกพฤติกรรม", desc: "บันทึกความดี / บันทึกความประพฤติ", icon: HeartHandshake, color: "bg-rose-500", path: "/behavior", status: "in_progress" },
  { key: "home_visit", name: "เยี่ยมบ้าน", desc: "บันทึกข้อมูลการเยี่ยมบ้านนักเรียน", icon: Home, color: "bg-teal-600", path: "/home_visit", status: "in_progress" },
];

const STATUS_LABEL: Record<MenuStatus, { text: string; cls: string }> = {
  live: { text: "ใช้งานได้", cls: "bg-emerald-100 text-emerald-700" },
  in_progress: { text: "กำลังพัฒนา", cls: "bg-amber-100 text-amber-700" },
};

// ★ แก้ path นี้ให้ตรงกับหน้า dashboard จริงของระบบ (เช่น "/dashboard")
const DASHBOARD_PATH = "/dashboard";

export default function HomeroomHubPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("get_my_classrooms").then(({ data }: { data: Classroom[] | null }) => {
      setClassrooms(data ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">ครูประจำชั้น</h1>
        <Link
          href={DASHBOARD_PATH}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Home className="h-4 w-4" /> กลับหน้าแดชบอร์ด
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {loading ? (
          <span className="text-sm text-slate-400">กำลังโหลดข้อมูลห้อง...</span>
        ) : classrooms.length === 0 ? (
          <span className="text-sm text-slate-400">ยังไม่พบห้องที่คุณเป็นครูประจำชั้น</span>
        ) : (
          classrooms.map((c) => (
            <span
              key={c.classroom_id}
              className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
            >
              ห้อง {c.room_name}
            </span>
          ))
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUBMENUS.map((item) => {
          const Icon = item.icon;
          const badge = STATUS_LABEL[item.status];
          return (
            <Link key={item.key} href={item.path}>
              <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:border-blue-200">
                <div className="flex items-start justify-between">
                  <div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                    {badge.text}
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-bold text-slate-800">{item.name}</h3>
                <p className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">{item.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-blue-600">
                  เปิดใช้งาน <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}