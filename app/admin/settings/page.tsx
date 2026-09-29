// app/admin/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Users, BarChart3, CalendarOff, ArrowRight, ArrowLeft, ShieldAlert,
  type LucideIcon,
} from "lucide-react";

const supabase = createClient();

// ── สิทธิ์เข้าหน้านี้ — ใช้เงื่อนไขเดียวกับ isDashboardAdminViewer ในหน้า dashboard ──
// (ถ้าแก้รายชื่อที่ dashboard ให้แก้ที่นี่ด้วย)
const ADMIN_ROLES = ["admin", "director", "deputy_director"];
const ADMIN_EMAILS = ["sumalin@khienkhet.ac.th", "phonnapha@khienkhet.ac.th"];

type SettingItem = {
  key: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  path: string;
};

type SettingGroup = {
  title: string;
  items: SettingItem[];
};

// ── กลุ่มเมนูในหน้าตั้งค่า — จะเพิ่มกลุ่ม/เมนูใหม่ในอนาคตให้เพิ่มที่นี่ที่เดียว ──
const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "🏫 ข้อมูลนักเรียนและการมาเรียน",
    items: [
      {
        key: "students_overview",
        name: "ทะเบียนนักเรียนทั้งโรงเรียน",
        desc: "ดูรายชื่อนักเรียนทุกห้อง เลือกกรองทีละห้องได้",
        icon: Users,
        color: "bg-blue-700",
        path: "/admin/students-overview",
      },
      {
        key: "attendance_overview",
        name: "สถิติการมาเรียนทั้งโรงเรียน",
        desc: "ภาพรวมการมา/ขาด/ลา/สาย ทุกห้องเรียน",
        icon: BarChart3,
        color: "bg-purple-600",
        path: "/admin/attendance-overview",
      },
      {
        key: "holidays",
        name: "จัดการวันหยุดเรียน",
        desc: "เพิ่ม/ลบวันหยุด เชื่อมกับเช็คชื่อ/สถิติ/ปฏิทินโรงเรียน",
        icon: CalendarOff,
        color: "bg-slate-700",
        path: "/admin/holidays",
      },
    ],
  },
];

function SettingCard({ item }: { item: SettingItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.path}>
      <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
        <div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${item.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-[15px] font-bold text-slate-800">{item.name}</h3>
        <p className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">{item.desc}</p>
        <div className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-blue-600">
          เปิดใช้งาน <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

export default function AdminSettingsPage() {
  const router = useRouter();
  // null = กำลังตรวจสิทธิ์, true = ผ่าน, false = ไม่มีสิทธิ์
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const email = (user.email || user.user_metadata?.email || "").trim().toLowerCase();

      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", user.id)
        .maybeSingle();

      const ok =
        (profile?.role && ADMIN_ROLES.includes(profile.role)) ||
        (email && ADMIN_EMAILS.includes(email));

      setAllowed(!!ok);
    })();
  }, [router]);

  // ── กำลังตรวจสิทธิ์ ──
  if (allowed === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-400">
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  // ── ไม่มีสิทธิ์ ──
  if (!allowed) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-rose-100 text-rose-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-base font-bold text-slate-800">ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p className="mt-1 text-sm text-slate-500">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            กลับหน้าแดชบอร์ด
          </button>
        </div>
      </div>
    );
  }

  // ── หน้าตั้งค่า ──
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            title="กลับหน้าแดชบอร์ด"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">ตั้งค่าระบบโรงเรียน</h1>
            <p className="text-xs text-slate-400">เมนูสำหรับผู้ดูแลระบบ</p>
          </div>
        </div>

        {SETTING_GROUPS.map((group) => (
          <section key={group.title} className="mt-8">
            <h2 className="mb-3 text-sm font-extrabold text-slate-800">{group.title}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <SettingCard key={item.key} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}