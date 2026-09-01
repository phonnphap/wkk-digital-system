// app/homeroom/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Users, ClipboardCheck, NotebookPen, UtensilsCrossed,
  UserCheck, FileEdit, Home, HeartHandshake, ArrowRight,
  CalendarOff, BarChart3, FileText, KeyRound, Copy, QrCode,
  type LucideIcon,
} from "lucide-react";

const supabase = createClient();

type Classroom = {
  classroom_id: string;
  room_name: string;
  room_number?: number;
  join_code?: string | null;
  student_portal_enabled?: boolean | null;
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

const SUBMENUS: SubMenuItem[] = [
  { key: "students", name: "ทะเบียนนักเรียน", desc: "รายชื่อ ข้อมูลพื้นฐาน และผู้ปกครอง", icon: Users, color: "bg-blue-600", path: "/students", status: "live" },
  { key: "attendance", name: "บันทึกเช็คชื่อ", desc: "มาเรียน / ขาด / ลา / มาสาย รายวัน", icon: ClipboardCheck, color: "bg-indigo-600", path: "/attendance", status: "live" },
  { key: "homeroom-notes", name: "บันทึกโฮมรูม", desc: "ประเด็น/กิจกรรมโฮมรูมประจำวัน", icon: NotebookPen, color: "bg-violet-600", path: "/homeroom-notes", status: "in_progress" },
  { key: "meals", name: "บันทึกอาหารและนม", desc: "การรับอาหารกลางวัน/ดื่มนมรายวัน", icon: UtensilsCrossed, color: "bg-orange-500", path: "/meals", status: "in_progress" },
  { key: "nutrition", name: "ประเมินโภชนาการ", desc: "ส่วนสูง น้ำหนัก สรุปภาวะโภชนาการ", icon: UserCheck, color: "bg-emerald-600", path: "/nutrition", status: "live" },
  { key: "reading_writing", name: "ประเมินการอ่าน-เขียน", desc: "บันทึกความสามารถอ่าน-เขียนรายบุคคล", icon: FileEdit, color: "bg-sky-500", path: "/reading_writing", status: "live" },
  { key: "behavior", name: "บันทึกพฤติกรรม", desc: "บันทึกความดี / บันทึกความประพฤติ", icon: HeartHandshake, color: "bg-rose-500", path: "/behavior", status: "live" },
  { key: "home_visit", name: "เยี่ยมบ้าน", desc: "บันทึกข้อมูลการเยี่ยมบ้านนักเรียน", icon: Home, color: "bg-teal-600", path: "/home_visit", status: "in_progress" },
  { key: "por5", name: "ปพ.5", desc: "รายวิชา · สรุปผลคะแนน/การมาเรียน/เชิงลึกของทุกวิชา", icon: FileText, color: "bg-cyan-600", path: "/homeroom/por5", status: "live" },
];

const ADMIN_SUBMENUS: SubMenuItem[] = [
  { key: "students_overview", name: "ทะเบียนนักเรียนทั้งโรงเรียน", desc: "ดูรายชื่อนักเรียนทุกห้อง เลือกกรองทีละห้องได้", icon: Users, color: "bg-blue-700", path: "/admin/students-overview", status: "live" },
  { key: "attendance_overview", name: "สถิติการมาเรียนทั้งโรงเรียน", desc: "ภาพรวมการมา/ขาด/ลา/สาย ทุกห้องเรียน", icon: BarChart3, color: "bg-purple-600", path: "/admin/attendance-overview", status: "live" },
  { key: "holidays", name: "จัดการวันหยุดเรียน", desc: "เพิ่ม/ลบวันหยุด เชื่อมกับเช็คชื่อ/สถิติ/ปฏิทินโรงเรียน", icon: CalendarOff, color: "bg-slate-700", path: "/admin/holidays", status: "live" },
];

const STATUS_LABEL: Record<MenuStatus, { text: string; cls: string }> = {
  live: { text: "ใช้งานได้", cls: "bg-emerald-100 text-emerald-700" },
  in_progress: { text: "กำลังพัฒนา", cls: "bg-amber-100 text-amber-700" },
};

const DASHBOARD_PATH = "/dashboard";
const ADMIN_ROLES = new Set(["admin", "director", "deputy_director"]);
const HIDDEN_FOR_ADMIN_KEYS = new Set(["attendance", "students"]);

function MenuCard({ item }: { item: SubMenuItem }) {
  const Icon = item.icon;
  const badge = STATUS_LABEL[item.status];
  return (
    <Link href={item.path}>
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
}

function ClassroomCodeCard({
  classroom,
  onShowQr,
}: {
  classroom: Classroom;
  onShowQr: (c: Classroom) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!classroom.join_code) return null;

  async function copyInviteLink() {
    const inviteUrl = `${window.location.origin}/join/${classroom.join_code}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API ใช้ไม่ได้ — เงียบไว้ ไม่บล็อกครู
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shrink-0">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            รหัสเข้าห้อง {classroom.room_name}
            {classroom.student_portal_enabled === false && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                ยังไม่เปิดให้นักเรียนเข้า
              </span>
            )}
          </p>
          <p className="font-black text-slate-800 font-mono tracking-[0.2em] text-lg leading-tight">
            {classroom.join_code}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={copyInviteLink}
          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "คัดลอกแล้ว ✅" : "คัดลอกลิงก์เชิญ"}
        </button>
        <button
          onClick={() => onShowQr(classroom)}
          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
        >
          <QrCode className="h-3.5 w-3.5" />
          QR
        </button>
      </div>
    </div>
  );
}

function ClassroomQrModal({ classroom, onClose }: { classroom: Classroom; onClose: () => void }) {
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${classroom.join_code}` : "";
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(inviteUrl)}`;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 text-lg mb-3">📷 QR ห้อง {classroom.room_name}</h3>
        <img src={qrSrc} alt="QR Code" className="mx-auto rounded-xl border-2 border-slate-100" width={260} height={260} />
        <p className="text-slate-400 text-xs mt-3">สแกนเพื่อเข้าร่วมห้องนี้</p>
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">
          ปิด
        </button>
      </div>
    </div>
  );
}

export default function HomeroomHubPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [qrClassroom, setQrClassroom] = useState<Classroom | null>(null);

  useEffect(() => {
    // ★ ตอนนี้ get_my_classrooms() ส่ง join_code / student_portal_enabled มาให้ในก้อนเดียว
    //   ไม่ต้อง query ตาราง classrooms แยกรอบสองอีกแล้ว
    supabase.rpc("get_my_classrooms").then(({ data }: { data: Classroom[] | null }) => {
      setClassrooms(data ?? []);
      setLoading(false);
    });

    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", authUser.id)
        .maybeSingle();
      if (profile?.role && ADMIN_ROLES.has(profile.role)) setIsAdmin(true);
    })();
  }, []);

  const visibleSubmenus = isAdmin ? SUBMENUS.filter((item) => !HIDDEN_FOR_ADMIN_KEYS.has(item.key)) : SUBMENUS;

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      {qrClassroom && <ClassroomQrModal classroom={qrClassroom} onClose={() => setQrClassroom(null)} />}

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(DASHBOARD_PATH)}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg"
        >
          🏠
        </button>
        <h1 className="text-lg font-bold text-slate-800">ครูประจำชั้น</h1>
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

      {!loading && classrooms.length > 0 && (
        <div className="mt-4 space-y-2">
          {classrooms.map((c) => (
            <ClassroomCodeCard key={c.classroom_id} classroom={c} onShowQr={setQrClassroom} />
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {visibleSubmenus.map((item) => <MenuCard key={item.key} item={item} />)}
      </div>

      {isAdmin && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-3 py-1">
              🛡️ สำหรับผู้ดูแลระบบ
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ADMIN_SUBMENUS.map((item) => <MenuCard key={item.key} item={item} />)}
          </div>
        </div>
      )}
    </div>
  );
}