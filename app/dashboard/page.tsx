"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client"; 
import { 
  LayoutDashboard, UserCheck, CalendarDays, FileText,
  Wrench, Car, FolderOpen, Calendar, RefreshCw, Users, LogOut, Bell, Settings 
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient(); 

  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [fullName, setFullName] = useState<string>("");

  const [userPrefix, setUserPrefix] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
  async function checkUserRole() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }

      // 1. ดึง first_name และ last_name เพิ่มเติมจากตาราง users
      const { data: profile } = await supabase
        .from("users")
        .select("first_name, last_name, role")
        .eq("id", user.id)
        .single();

      if (profile) {
        // ดึงค่าชื่อและนามสกุลมาเก็บไว้ (ถ้าใน DB ไม่มี ให้ fallback ไปดึงค่าจาก metadata)
        const firstName = profile.first_name || user.user_metadata?.first_name || "";
        const lastName = profile.last_name || user.user_metadata?.last_name || "";
        
        // รวมร่างชื่อและนามสกุลแบบมีเว้นวรรคตรงกลาง
        const combinedName = `${firstName} ${lastName}`.trim();

        // 2. กำหนดเงื่อนไขคำนำหน้า และ การจัดฟอร์แมตชื่อตามสิทธิ์ (Role)
        let prefix = "คุณครู";
        let finalName = combinedName;

        switch (profile.role) {
          case "director":
            prefix = "ผอ.";
            break;
          case "deputy_director":
            prefix = "รอง";
            break;
          case "admin":
            prefix = "Admin";
            break;
          case "staff":
            prefix = "คุณ";
            break;
          case "homeroom_teacher":
            prefix = "คุณครู";
            break;
          
          // สำหรับ Role อื่นๆ ที่เหลือ (เช่น dept_head, grade_head, subject_teacher) 
          // หากไม่มีระบุในเงื่อนไข จะตั้ง Default ไว้ที่ "คุณครู"
          default:
            prefix = "คุณครู";
        }

        // นำ prefix มาต่อกับชื่อที่ดึงมาได้
        setUserPrefix(prefix);
        setUserName(finalName);
        setIsAdmin(profile.role === "admin");
      }

    } catch (err) {
      console.error("ตรวจสอบสิทธิ์ผิดพลาด:", err);
    }
  }
  checkUserRole();
}, [supabase, router]);

  // ✅ ฟังก์ชันเหล่านี้ต้องอยู่นอก useEffect
  const handleAdminMenuClick = (targetPath: string) => {
    if (isAdmin) {
      router.push(targetPath);
    } else {
      alert("🔒 ขออภัย ระบบนี้จำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น");
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.refresh();
      router.push("/login");
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการออกจากระบบ:", error);
    }
  };

  // โครงสร้างกลุ่มเมนูหลัก
  const menuGroups = [
    {
      title: "📅 ระบบลางานและสารบรรณ",
      items: [
        { name: "ใบลา / ไปราชการ", icon: <CalendarDays className="w-6 h-6" />, color: "bg-blue-500", path: "/leave" },
        { name: "ขอออกนอกโรงเรียน", icon: <LogOut className="w-6 h-6" />, color: "bg-amber-500", path: "/gate-pass" },
        { name: "เลขเกียรติบัตร/คำสั่ง/บันทึก", icon: <FileText className="w-6 h-6" />, color: "bg-indigo-500", path: "/document-reg" },
        { name: "รายงานการอบรมรายบุคคล", icon: <FolderOpen className="w-6 h-6" />, color: "bg-violet-500", path: "/training-report" },
      ]
    },
    {
      title: "🏫 ระบบจัดการห้องเรียนและงานสอน",
      items: [
        { name: "เช็คชื่อนักเรียน-ครูประจำวิชา", icon: <UserCheck className="w-6 h-6" />, color: "bg-emerald-500", path: "/attendance" },
        { name: "ครูประจำชั้น", icon: <Users className="w-6 h-6" />, color: "bg-teal-500", path: "/homeroom" },
        { name: "ตารางสอน", icon: <Calendar className="w-6 h-6" />, color: "bg-purple-500", path: "/schedule" },
        { name: "แลกคาบ & สอนแทน", icon: <RefreshCw className="w-6 h-6" />, color: "bg-pink-500", path: "/substitution" },
        { name: "ระบบบันทึกชั่วโมง PLC", icon: <Users className="w-6 h-6" />, color: "bg-teal-500", path: "/plc" },
        { name: "นิเทศการสอน", icon: <Settings className="w-6 h-6" />, color: "bg-rose-500", path: "/supervision" },
        { name: "คลังสื่อการสอน", icon: <FolderOpen className="w-6 h-6" />, color: "bg-cyan-500", path: "/media-lib" },
      ]
    },
    {
      title: "🛠️ ระบบสนับสนุนและยานพาหนะ",
      items: [
        { name: "รายงานเวรประจำวัน", icon: <Calendar className="w-6 h-6" />, color: "bg-orange-500", path: "/duty-report" },
        { name: "ประเมินโภชนาการนักเรียน", icon: <UserCheck className="w-6 h-6" />, color: "bg-emerald-600", path: "/nutrition" },
        { name: "จองรถ & ห้องประชุม", icon: <Car className="w-6 h-6" />, color: "bg-blue-600", path: "/booking" },
        { name: "แจ้งซ่อม (Helpdesk)", icon: <Wrench className="w-6 h-6" />, color: "bg-rose-600", path: "/repair" },
      ]
    }
  ];

  const shortcuts = [
    { name: "ลงเวลาปฏิบัติงาน", icon: "📸", bg: "bg-blue-50 border-blue-100 text-blue-700", path: "/face-scan" },
    { name: "ปฏิทินงาน", icon: "🗓️", bg: "bg-indigo-50 border-indigo-100 text-indigo-700", path: "/calendar" },
    { name: "เช็คชื่อนักเรียน", icon: "📋", bg: "bg-emerald-50 border-emerald-100 text-emerald-700", path: "/attendance" },
    { name: "ยื่นใบลา", icon: "📅", bg: "bg-amber-50 border-amber-100 text-amber-700", path: "/leave" },
    { name: "แจ้งซ่อม", icon: "🔧", bg: "bg-rose-50 border-rose-100 text-rose-700", path: "/repair" },
    { name: "จองรถ / ห้องประชุม", icon: "🚌", bg: "bg-cyan-50 border-cyan-100 text-cyan-700", path: "/booking" },
  ];

  const [schoolEvents, setSchoolEvents] = useState<{date: string; title: string; color: string}[]>([]);

useEffect(() => {
  async function loadEvents() {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("calendar_events")
      .select("title, start_date, category")
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5);

    if (data) {
      const colorMap: Record<string, string> = {
        academic: "bg-blue-500",
        student:  "bg-emerald-500",
        meeting:  "bg-amber-500",
        holiday:  "bg-rose-500",
        training: "bg-violet-500",
        document: "bg-teal-500",
        other:    "bg-slate-500",
      };
      setSchoolEvents(data.map(ev => {
        const d = new Date(ev.start_date + "T00:00:00");
        const day = d.getDate();
        const month = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()];
        return {
          date: `${day} ${month}`,
          title: ev.title,
          color: colorMap[ev.category] ?? "bg-slate-500",
        };
      }));
    }
  }
  loadEvents();
}, [supabase]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      
      {/* Sidebar เมนูฝั่งซ้าย */}
      <aside className="hidden lg:flex lg:w-72 bg-white border-r border-slate-200 flex-col justify-between shrink-0 shadow-sm z-10">
        <div>
          <div className="p-6 border-b border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
              พ
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">โรงเรียนวัดเขียนเขต</h2>
              <span className="text-xs text-slate-400 font-medium">ระบบบริหารจัดการ</span>
            </div>
          </div>

          <nav className="p-4 space-y-1.5 flex-1 overflow-y-visible">
            <button 
              onClick={() => router.push("/dashboard")}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold bg-blue-50 text-blue-600 transition-all"
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>แดชบอร์ด</span>
            </button>
            
            <button 
              onClick={() => router.push("/face-scan")}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all"
            >
              <UserCheck className="w-5 h-5 text-emerald-500" />
              <span className="flex-1 text-left">ลงเวลาปฏิบัติงาน</span>
              <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">LIVE</span>
            </button>

            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition-all border border-rose-100"
            >
              <LogOut className="w-5 h-5" />
              <span>ออกจากระบบ</span>
            </button>

            <div className="pt-5 pb-1 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">ระบบบริการทั่วไป</div>
            {menuGroups.flatMap(g => g.items).map((item, idx) => (
              <button 
                key={idx}
                onClick={() => router.push(item.path)}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
              >
                <div className="text-slate-400">{item.icon}</div>
                <span className="text-left">{item.name}</span>
              </button>
            ))}

            {/* 🛠️ ส่วนควบคุมสำหรับ ADMIN - แสดงผลให้ทุกคนเห็นปกติ */}
            <div className="pt-5 pb-1 px-4 text-xs font-bold text-rose-500 uppercase tracking-wider"> ส่วนผู้ดูแลระบบ </div>
            
            {/* ปุ่มจัดการข้อมูลผู้ใช้ */}
            <button 
              onClick={() => handleAdminMenuClick("/admin")}
              className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all w-full text-left"
            >
              <Users className="w-5 h-5 text-slate-400" />
              <span>จัดการข้อมูลผู้ใช้</span>
            </button>

            {/* ปุ่มตั้งค่าระบบของโรงเรียน */}
            <button
              onClick={() => handleAdminMenuClick("/admin/settings")}
              className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all w-full text-left"
            >
              <Settings className="w-5 h-5 text-slate-400" />
              <span>ตั้งค่าระบบโรงเรียน</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* พื้นที่เนื้อหาหลักฝั่งขวา */}
      <main className="flex-1 w-full p-4 md:p-8 lg:p-10 space-y-8 overflow-y-auto">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-500 font-bold flex items-center gap-2">
            <span>โรงเรียนวัดเขียนเขต</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-extrabold">แดชบอร์ด</span>
          </div>
          <button className="p-2.5 text-slate-400 hover:text-slate-600 bg-white rounded-xl border border-slate-200 shadow-sm relative transition-all">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
          </button>
        </div>

        {/* แทนที่ block เดิมด้วยโค้ดนี้ */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 rounded-2xl p-8 md:p-10 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
            <LayoutDashboard className="w-72 h-72 translate-x-12 translate-y-12" />
          </div>
          <span className="text-xs font-bold text-blue-200 bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-sm">
            {new Date().toLocaleDateString("th-TH", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric"
            })}
          </span>
          <h1 className="text-3xl md:text-4xl font-black mt-4 tracking-tight">
            สวัสดี {userPrefix}{userName} 👋
          </h1>
          <p className="text-sm md:text-base text-blue-100 mt-2 font-semibold opacity-90">
            ยินดีต้อนรับสู่ระบบสารสนเทศอัจฉริยะ โรงเรียนวัดเขียนเขต
          </p>
          
          <div 
            onClick={() => router.push("/face-scan")}
            className="mt-5 inline-flex items-center gap-2 text-xs bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-xl shadow-sm cursor-pointer hover:bg-emerald-600 transition-all"
          >
            <UserCheck className="w-4 h-4" />
            <span>คลิกเพื่อเข้าสู่หน้าลงเวลาปฏิบัติงาน</span>
          </div>
        </div>

        {/* ทางลัดเมนูด่วน */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">ทางลัดเมนูด่วน</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {shortcuts.map((shortcut, idx) => (
              <button 
                key={idx} 
                onClick={() => router.push(shortcut.path)}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${shortcut.bg}`}
              >
                <span className="text-2xl mb-1.5">{shortcut.icon}</span>
                <span className="text-xs font-extrabold leading-snug">{shortcut.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* แผงข้อมูลสถิติ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl font-bold">✓</div>
            <div>
              <span className="text-xs font-bold text-slate-400 block">นักเรียนมาวันนี้</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">847</span>
                <span className="text-xs text-slate-400 font-bold">/ 920 คน</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl font-bold">✕</div>
            <div>
              <span className="text-xs font-bold text-slate-400 block">ขาดเรียนวันนี้</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-rose-600">28</span>
                <span className="text-xs text-rose-400 font-bold">(3.0%)</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">📅</div>
            <div>
              <span className="text-xs font-bold text-slate-400 block">ครูลางาน</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">4</span>
                <span className="text-xs text-slate-400 font-medium">มีสอนแทน 3</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl font-bold">📌</div>
            <div>
              <span className="text-xs font-bold text-slate-400 block">รอดำเนินการ</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-purple-600">12</span>
                <span className="text-xs text-slate-400 font-bold">รายการ</span>
              </div>
            </div>
          </div>
        </div>

        {/* ปฏิทินปฏิบัติงาน */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            📅 ปฏิทินปฏิบัติงาน ภาคเรียนที่ 1/2569
          </h3>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 overflow-x-auto">
            {schoolEvents.length === 0 ? (
              <p className="text-sm text-slate-400">ไม่มีกิจกรรมที่กำลังจะมาถึง</p>
            ) : (
              schoolEvents.map((event, idx) => (
                <div key={idx} className="flex-shrink-0 flex items-center gap-3 pr-6 border-r border-slate-100 last:border-0">
                  <div className={`${event.color} w-12 h-12 rounded-xl text-white flex flex-col items-center justify-center text-[10px] font-bold leading-none`}>
                    <span>{event.date.split(" ")[0]}</span>
                    <span>{event.date.split(" ")[1]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{event.title}</p>
                    <p className="text-[10px] text-slate-400 font-medium">โรงเรียนวัดเขียนเขต</p>
                  </div>
                </div>
              ))
            )}

            {/* ✅ เปลี่ยนจากปุ่ม + เป็น ดูเพิ่มเติม */}
            <button
              onClick={() => router.push("/calendar")}
              className="flex-shrink-0 px-4 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-500 text-xs font-bold transition-all border border-slate-200 hover:border-blue-200 whitespace-nowrap"
            >
              ดูเพิ่มเติม →
            </button>
          </div>
        </div>

        {/* รายการระบบงาน */}
        <div className="space-y-5 pt-2">
          <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            🎛️ ศูนย์รวมระบบงานสารสนเทศและบริการบุคลากร
          </h3>
          <div className="space-y-6">
            {menuGroups.map((group, gIdx) => (
              <div key={gIdx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h4 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-2.5">
                  {group.title}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {group.items.map((item, iIdx) => (
                    <button
                      key={iIdx}
                      onClick={() => router.push(item.path)}
                      className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-blue-400 hover:shadow-md transition-all group text-left"
                    >
                      <div className={`w-11 h-11 rounded-xl ${item.color} text-white flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 shrink-0`}>
                        {item.icon}
                      </div>
                      <div className="truncate">
                        <span className="block text-sm font-extrabold text-slate-700 group-hover:text-blue-600 transition-colors">
                          {item.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}