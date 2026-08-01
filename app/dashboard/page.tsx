"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, UserCheck, CalendarDays, FileText,
  Wrench, Car, Monitor, FolderOpen, FileEdit, Trophy, Calendar, RefreshCw, Users, LogOut, Bell, Settings
} from "lucide-react";

// ══════════════════════════════════════════════════════════
// ── การแจ้งเตือน — ค่าคงที่ที่ใช้ระบุ "ผู้อนุมัติ" ตรงกับหน้าใบลา/ตารางสอน ──
// (ถ้าอีเมลผู้อนุมัติเปลี่ยน แก้ตรงนี้จุดเดียว)
// ══════════════════════════════════════════════════════════
const LEAVE_APPROVER_1_EMAIL = "phansa@khienkhet.ac.th";
const LEAVE_APPROVER_2_EMAIL = "titima@khienkhet.ac.th";
const LEAVE_APPROVER_3_EMAIL = "thananut@khienkhet.ac.th";

function leaveApproverSlotByEmail(email: string): 1 | 2 | 3 | null {
  const e = (email || "").toLowerCase().trim();
  if (e === LEAVE_APPROVER_1_EMAIL) return 1;
  if (e === LEAVE_APPROVER_2_EMAIL) return 2;
  if (e === LEAVE_APPROVER_3_EMAIL) return 3;
  return null;
}

function toThaiDateShort(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
  } catch { return ""; }
}

type NotifSource = "leave_approval" | "leave_status" | "timetable_request" | "swap_request" | "swap_status" | "sub_assigned"
  | "subject_request" | "subject_status" | "timetable_status" | "schedule_conflict";
type NotifItem = {
  id: string;
  source: NotifSource;
  title: string;
  detail: string;
  date: string;   // ISO date ใช้เรียงลำดับ + แสดงผล
  path: string;    // หน้าไปเมื่อคลิก
  urgent?: boolean; // นับรวมใน badge สีแดง (แปลว่า "ต้องดำเนินการ")
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [userPrefix, setUserPrefix] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  const [isMounted, setIsMounted] = useState<boolean>(false);

  // ── การแจ้งเตือน ──────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
  async function checkUserRole() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }

      // 1. ดึง first_name และ last_name เพิ่มเติมจากตาราง users
      // ✅ เพิ่ม id, extra_roles, grade_level เข้ามาด้วย — ใช้ตอนดึงการแจ้งเตือนที่เกี่ยวกับผู้ใช้คนนี้
      let profile: any = null;

      const { data: byAuthId } = await supabase
        .from("users")
        .select("id, first_name, last_name, role, extra_roles, grade_level")
        .eq("auth_id", user.id)
        .maybeSingle();

      if (byAuthId) {
        profile = byAuthId;
      } else {
        const email = user.email || user.user_metadata?.email || "";
        if (email) {
          const { data: byEmail } = await supabase
            .from("users")
            .select("id, first_name, last_name, role, extra_roles, grade_level")
            .eq("email", email)
            .maybeSingle();
          profile = byEmail;
        }
      }

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

        // ✅ โหลดการแจ้งเตือนหลังรู้ตัวตนผู้ใช้ครบแล้ว
        loadNotifications({
          profileId: profile.id,
          email: user.email || user.user_metadata?.email || "",
          role: profile.role || "",
          extraRoles: profile.extra_roles || [],
        });
      }

    } catch (err) {
      console.error("ตรวจสอบสิทธิ์ผิดพลาด:", err);
    }
  }
  checkUserRole();
  setIsMounted(true);
}, [supabase, router]);
  // ── ปิด dropdown แจ้งเตือนเมื่อคลิกนอกกล่อง ──────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  // ══════════════════════════════════════════════════════════
  // ── โหลดการแจ้งเตือน — รวมจากหลายระบบที่มีตารางข้อมูลรองรับแล้ว
  // ปัจจุบันเชื่อมกับ: ใบลา/ไปราชการ (leave_requests) และ คำขอแก้ไขตารางสอน
  // (timetable_change_requests) เพราะเป็น 2 ระบบที่มีสถานะ pending/approved
  // ชัดเจนอยู่แล้ว ระบบอื่น (แจ้งซ่อม/จองรถ/ขอออกนอกโรงเรียน ฯลฯ) ยังไม่มีให้ดูโครงสร้าง
  // ตาราง — เพิ่มเป็นบล็อกใหม่ในฟังก์ชันนี้ได้เลยเมื่อพร้อม (ดูคอมเมนต์ท้ายฟังก์ชัน)
  // ══════════════════════════════════════════════════════════
  async function loadNotifications(opts: { profileId: string; email: string; role: string; extraRoles: string[] }) {
    setNotifLoading(true);
    const items: NotifItem[] = [];
    try {
      const leaveSlot = leaveApproverSlotByEmail(opts.email);
      const isTimetableApprover =
        ["admin", "director", "deputy_director"].includes(opts.role) ||
        opts.extraRoles.includes("dept_head") ||
        opts.extraRoles.includes("grade_head");

      // 1) ใบลาที่ "รอฉันอนุมัติ" ในลำดับปัจจุบัน
      if (leaveSlot) {
        const { data: leaveReqs, error } = await supabase
          .from("leave_requests")
          .select("id, days_count, start_date, status, approver_1_status, approver_2_status, approver_3_status, user:users!leave_requests_user_id_fkey(first_name,last_name,full_name)")
          .eq("status", "pending");
        if (error) console.warn("[loadNotifications] leave approval query error:", error.message);
        (leaveReqs || []).forEach((r: any) => {
          const myStatus = leaveSlot === 1 ? r.approver_1_status : leaveSlot === 2 ? r.approver_2_status : r.approver_3_status;
          const readyForMe =
            leaveSlot === 1 ||
            (leaveSlot === 2 && r.approver_1_status === "approved") ||
            (leaveSlot === 3 && r.approver_2_status === "approved");
          if (myStatus === "pending" && readyForMe) {
            const u = r.user;
            const name = u?.full_name || `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || "—";
            items.push({
              id: `leave-${r.id}`,
              source: "leave_approval",
              title: "📅 ใบลารออนุมัติ",
              detail: `${name} · ${r.days_count} วัน`,
              date: r.start_date,
              path: "/leave",
              urgent: true,
            });
          }
        });
      }
      // 2) คำขอแก้ไขตารางสอนที่ "รอฉันอนุมัติ" (แอดมิน/หัวหน้าสาย/หัวหน้าหมวด)
      if (isTimetableApprover) {
        const { data: ttReqs, error } = await supabase
          .from("timetable_change_requests")
          .select("id, created_at, requester:users!timetable_change_requests_requester_id_fkey(first_name,last_name,full_name)")
          .eq("status", "pending");
        if (error) console.warn("[loadNotifications] timetable request query error:", error.message);
        (ttReqs || []).forEach((r: any) => {
          const u = r.requester;
          const name = u?.full_name || `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || "—";
          items.push({
            id: `tt-${r.id}`,
            source: "timetable_request",
            title: "🗓️ คำขอแก้ไขตารางสอน",
            detail: `${name} ยื่นคำขอแก้ไขคาบเรียน`,
            date: r.created_at,
            path: "/schedule",
            urgent: true,
          });
        });
      }
      // 3) สถานะใบลาของฉันเอง — อนุมัติ/ไม่อนุมัติล่าสุด (แจ้งผลให้เจ้าตัวรู้)
      if (opts.profileId) {
        const { data: myLeaves, error } = await supabase
          .from("leave_requests")
          .select("id, status, start_date, reject_reason")
          .eq("user_id", opts.profileId)
          .in("status", ["approved", "rejected"])
          .order("start_date", { ascending: false })
          .limit(3);
        if (error) console.warn("[loadNotifications] my leave status query error:", error.message);
        (myLeaves || []).forEach((r: any) => {
          items.push({
            id: `myleave-${r.id}`,
            source: "leave_status",
            title: r.status === "approved" ? "✅ ใบลาของคุณได้รับการอนุมัติ" : "❌ ใบลาของคุณไม่ได้รับการอนุมัติ",
            detail: r.status === "rejected" && r.reject_reason ? r.reject_reason : `วันที่ลา ${toThaiDateShort(r.start_date)}`,
            date: r.start_date,
            path: "/leave",
          });
        });
      }
      // ── ตัวอย่างจุดที่จะเพิ่มระบบอื่นในอนาคต (แจ้งซ่อม/จองรถ/ขอออกนอกโรงเรียน) ──
      // เมื่อทราบชื่อตาราง+คอลัมน์สถานะแล้ว เพิ่ม query แบบเดียวกับด้านบน แล้ว push
      // เข้า items ได้เลย โครงสร้าง NotifItem รองรับ source ใหม่ได้ทันที (แค่เพิ่ม type)
      // 4) คำขอแลกคาบที่ "รอฉันตอบรับ"   ← เพิ่มบล็อกนี้ตรงนี้
      if (opts.profileId) {
        const { data: swapReqs, error } = await supabase
          .from("class_swap_requests")
          .select("id, swap_date, created_at, requester:users!requester_id(first_name,last_name)")
          .eq("target_teacher_id", opts.profileId)
          .eq("status", "pending");
        if (error) console.warn("[loadNotifications] swap request query error:", error.message);
        (swapReqs || []).forEach((r: any) => {
          const u = r.requester;
          const name = `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || "—";
          items.push({
            id: `swap-${r.id}`,
            source: "swap_request",
            title: "🔄 มีคำขอแลกคาบสอน",
            detail: `${name} ขอให้คุณสอนแทนวันที่ ${toThaiDateShort(r.swap_date)}`,
            date: r.created_at,
            path: "/substitution",
            urgent: true,
          });
        });
      }
      // 5) คำขอเพิ่มรายวิชาใหม่ที่ "รอแอดมินอนุมัติ"
      const isAdminApprover = ["admin", "director", "deputy_director"].includes(opts.role);
      if (isAdminApprover) {
        const { data: subjReqs, error } = await supabase
          .from("subject_addition_requests")
          .select("id, subject_code, name_th, created_at, requester:users!subject_addition_requests_requester_id_fkey(first_name,last_name,full_name)")
          .eq("status", "pending");
        if (error) console.warn("[loadNotifications] subject request query error:", error.message);
        (subjReqs || []).forEach((r: any) => {
          const u = r.requester;
          const name = u?.full_name || `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || "—";
          items.push({
            id: `subj-${r.id}`, source: "subject_request",
            title: "📚 คำขอเพิ่มรายวิชาใหม่",
            detail: `${name} ขอเพิ่ม ${r.subject_code} ${r.name_th}`,
            date: r.created_at, path: "/schedule", urgent: true,
          });
        });
      }

      // 6) สถานะคำขอเพิ่มรายวิชาของฉันเอง — ★ urgent:true เพื่อให้ขึ้นจุดแดง
      if (opts.profileId) {
        const { data: mySubjReqs, error } = await supabase
          .from("subject_addition_requests")
          .select("id, subject_code, name_th, status, reject_reason, reviewed_at")
          .eq("requester_id", opts.profileId)
          .in("status", ["approved", "rejected"])
          .order("reviewed_at", { ascending: false })
          .limit(3);
        if (error) console.warn("[loadNotifications] my subject request status query error:", error.message);
        (mySubjReqs || []).forEach((r: any) => {
          items.push({
            id: `mysubj-${r.id}`, source: "subject_status",
            title: r.status === "approved" ? "✅ คำขอเพิ่มวิชาของคุณได้รับการอนุมัติ" : "❌ คำขอเพิ่มวิชาของคุณถูกปฏิเสธ",
            detail: r.status === "rejected" && r.reject_reason ? r.reject_reason : `${r.subject_code} ${r.name_th}`,
            date: r.reviewed_at ?? new Date().toISOString(), path: "/schedule", urgent: true,
          });
        });
      }

      // 7) สถานะคำขอแก้ไขตารางสอนของฉันเอง — ★ urgent:true เพื่อให้ขึ้นจุดแดง
      if (opts.profileId) {
        const { data: myTtReqs, error } = await supabase
          .from("timetable_change_requests")
          .select("id, status, reject_reason, reviewed_at, day_of_week")
          .eq("requester_id", opts.profileId)
          .in("status", ["approved", "rejected"])
          .order("reviewed_at", { ascending: false })
          .limit(3);
        if (error) console.warn("[loadNotifications] my timetable status query error:", error.message);
        (myTtReqs || []).forEach((r: any) => {
          items.push({
            id: `mytt-${r.id}`, source: "timetable_status",
            title: r.status === "approved" ? "✅ คำขอแก้ตารางสอนของคุณได้รับการอนุมัติ" : "❌ คำขอแก้ตารางสอนของคุณถูกปฏิเสธ",
            detail: r.status === "rejected" && r.reject_reason ? r.reject_reason : "ตารางสอนถูกอัปเดตแล้ว",
            date: r.reviewed_at ?? new Date().toISOString(), path: "/schedule", urgent: true,
          });
        });
      }

      // 8) คาบซ้ำ/ครูสอนซ้อนคาบ — แจ้งแอดมินในแดชบอร์ด
      if (isAdminApprover) {
        const { data: allEntries, error } = await supabase
          .from("timetable_entries")
          .select("id, classroom_id, day_of_week, time_slot_id");
        if (error) console.warn("[loadNotifications] conflict check query error:", error.message);
        const map = new Map<string, number>();
        (allEntries || []).forEach((e: any) => {
          const key = `${e.classroom_id}|${e.day_of_week}|${e.time_slot_id}`;
          map.set(key, (map.get(key) ?? 0) + 1);
        });
        const dupCount = Array.from(map.values()).filter(c => c > 1).length;
        if (dupCount > 0) {
          items.push({
            id: `conflict-summary`, source: "schedule_conflict",
            title: "🧹 พบคาบซ้ำในตารางสอน",
            detail: `พบ ${dupCount} จุดที่มีคาบซ้ำ ต้องตรวจสอบ`,
            date: new Date().toISOString(), path: "/schedule", urgent: true,
          });
        }
      }
      // 9) สถานะคำขอแลกคาบของฉันเอง
if (opts.profileId) {
  const { data: mySwapReqs, error } = await supabase
    .from("class_swap_requests")
    .select("id, swap_date, status, responded_at, target_teacher:users!target_teacher_id(first_name,last_name)")
    .eq("requester_id", opts.profileId)
    .in("status", ["accepted", "rejected"])
    .order("responded_at", { ascending: false })
    .limit(3);
  if (error) console.warn("[loadNotifications] my swap status query error:", error.message);
  (mySwapReqs || []).forEach((r: any) => {
    const u = r.target_teacher;
    const name = `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || "—";
    items.push({
      id: `myswap-${r.id}`,
      source: "swap_status",
      title: r.status === "accepted" ? "✅ คำขอแลกคาบของคุณได้รับการตอบรับ" : "❌ คำขอแลกคาบของคุณถูกปฏิเสธ",
      detail: `${name} · วันที่ ${toThaiDateShort(r.swap_date)}`,
      date: r.responded_at ?? new Date().toISOString(),
      path: "/substitution",
      urgent: true,
    });
  });
}

// 10) คุณถูกจัดให้สอนแทน
if (opts.profileId) {
  const { data: newSubs, error } = await supabase
    .from("substitution_records")
    .select("id, substitute_date, created_at, status, absent_teacher:users!absent_teacher_id(first_name,last_name)")
    .eq("substitute_teacher_id", opts.profileId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) console.warn("[loadNotifications] my sub assignment query error:", error.message);
  (newSubs || []).forEach((r: any) => {
    const u = r.absent_teacher;
    const name = `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || "—";
    items.push({
      id: `mysubassign-${r.id}`,
      source: "sub_assigned",
      title: "📋 คุณถูกจัดให้สอนแทน",
      detail: `แทน ${name} วันที่ ${toThaiDateShort(r.substitute_date)}`,
      date: r.created_at,
      path: "/substitution",
      urgent: true,
    });
  });
}

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setNotifications(items);
    } catch (err) {
      console.error("[loadNotifications] unexpected error:", err);
    }
    setNotifLoading(false);
  }

  const urgentCount = notifications.filter(n => n.urgent).length;

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

  // เพิ่ม type สถานะ
type ItemStatus = "live" | "beta" | "wip" | undefined;

// เพิ่ม badge component
function StatusBadge({ status }: { status: ItemStatus }) {
  if (!status) return null;
  const cfg = {
    live: { label: "ใช้งานได้", cls: "bg-emerald-100 text-emerald-700 border-emerald-300", dot: "bg-emerald-500" },
    beta: { label: "ทดลองใช้",  cls: "bg-amber-100 text-amber-700 border-amber-300",   dot: "bg-amber-400"  },
    wip:  { label: "กำลังพัฒนา",   cls: "bg-slate-100 text-slate-500 border-slate-300",   dot: "bg-slate-400"  },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === "live" ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

  // โครงสร้างกลุ่มเมนูหลัก
  const menuGroups = [
    {
      title: "📅 ระบบลางานและสารบรรณ",
      items: [
        { name: "ใบลา/ ไปราชการ", icon: <CalendarDays className="w-6 h-6" />, color: "bg-blue-500", path: "/leave", status: "live" as ItemStatus },
        { name: "ขอออกนอกโรงเรียน", icon: <LogOut className="w-6 h-6" />, color: "bg-amber-500", path: "/gate-pass" },
        { name: "เลขเกียรติบัตร/คำสั่ง/บันทึก", icon: <FileText className="w-6 h-6" />, color: "bg-indigo-500", path: "/document-reg" },
        { name: "รายงานการอบรมรายบุคคล", icon: <FolderOpen className="w-6 h-6" />, color: "bg-violet-500", path: "/training" },
        { name: "คลังเกียรติยศและผลงาน", icon: <Trophy className="w-6 h-6" />, color: "bg-yellow-500", path: "/honor/awards", status: "live" as ItemStatus },
      ]
    },
    {
      title: "🏫 ระบบจัดการห้องเรียนและงานสอน",
      items: [
        { name: "เช็คชื่อนักเรียน-ครูประจำวิชา", icon: <UserCheck className="w-6 h-6" />, color: "bg-emerald-500", path: "/attendance" },
        { name: "ครูประจำชั้น", icon: <Users className="w-6 h-6" />, color: "bg-teal-500", path: "/homeroom", status: "live" as ItemStatus },
        { name: "ตารางสอน", icon: <Calendar className="w-6 h-6" />, color: "bg-purple-500", path: "/schedule", status: "live"  as ItemStatus },
        { name: "แลกคาบ & สอนแทน", icon: <RefreshCw className="w-6 h-6" />, color: "bg-pink-500", path: "/substitution", status: "wip"  as ItemStatus },
        { name: "ระบบบันทึกชั่วโมง PLC", icon: <Users className="w-6 h-6" />, color: "bg-teal-500", path: "/plc", status: "live" as ItemStatus },
        { name: "นิเทศการสอน", icon: <Settings className="w-6 h-6" />, color: "bg-rose-500", path: "/supervision" },
        { name: "คลังสื่อการสอน", icon: <FolderOpen className="w-6 h-6" />, color: "bg-cyan-500", path: "/media-library", status: "wip" as ItemStatus },
      ]
    },
    {
      title: "🛠️ ระบบสนับสนุนและยานพาหนะ",
      items: [
        { name: "รายงานเวรประจำวัน", icon: <Calendar className="w-6 h-6" />, color: "bg-orange-500", path: "/duty-report" },
        { name: "จองรถ & ห้องประชุม", icon: <Car className="w-6 h-6" />, color: "bg-blue-600", path: "/booking" },
        { name: "ยืม-คืน อุปกรณ์ ICT", icon: <Monitor className="w-6 h-6" />, color: "bg-sky-600", path: "/ict-borrow" },
        { name: "แจ้งซ่อม (Helpdesk)", icon: <Wrench className="w-6 h-6" />, color: "bg-rose-600", path: "/repair", status: "wip"  as ItemStatus },
      ]
    }
  ];

  const shortcuts = [
    { name: "ลงเวลาปฏิบัติงาน", icon: "📸", bg: "bg-blue-50 border-blue-100 text-blue-700", path: "/face-scan", status: "beta"  as ItemStatus },
    { name: "ปฏิทินงาน", icon: "🗓️", bg: "bg-indigo-50 border-indigo-100 text-indigo-700", path: "/calendar", status: "live" as ItemStatus },
    { name: "เช็คชื่อนักเรียน", icon: "📋", bg: "bg-emerald-50 border-emerald-100 text-emerald-700", path: "/attendance" },
    { name: "ยื่นใบลา", icon: "📅", bg: "bg-amber-50 border-amber-100 text-amber-700", path: "/leave", status: "live" as ItemStatus },
    { name: "แจ้งซ่อม", icon: "🔧", bg: "bg-rose-50 border-rose-100 text-rose-700", path: "/repair" },
    { name: "จองรถ / ห้องประชุม", icon: "🚌", bg: "bg-cyan-50 border-cyan-100 text-cyan-700", path: "/booking" },
  ];

  {/* Legend */}
<div className="flex items-center gap-4 flex-wrap">
  {[
    { status: "live" as ItemStatus, desc: "ใช้งานได้แล้ว" },
    { status: "beta" as ItemStatus, desc: "ช่วงทดลองใช้" },
    { status: "wip"  as ItemStatus, desc: "กำลังพัฒนา" },
  ].map(({ status, desc }) => (
    <div key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
      <StatusBadge status={status} />
      <span>{desc}</span>
    </div>
  ))}
</div>

  const [schoolEvents, setSchoolEvents] = useState<{date: string; title: string; color: string; colorHex: string | null}[]>([]);

useEffect(() => {
  async function loadEvents() {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("calendar_events")
      .select("title, start_date, categories, color_override")
      .eq("status", "approved")              // ★ เฉพาะที่อนุมัติแล้ว ตามที่ขอ
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5);                              // ★ 5 รายการตามที่ขอ

    if (error) {
      console.error("loadEvents error:", error.message);
      return;
    }

    if (data) {
      const colorMap: Record<string, string> = {
        academic:  "bg-blue-500",
        student:   "bg-emerald-500",
        meeting:   "bg-amber-500",
        holiday:   "bg-rose-500",
        training:  "bg-violet-500",
        personnel: "bg-amber-700",
        parent:    "bg-violet-600",
        budget:    "bg-teal-600",
        important: "bg-orange-500",
        general:   "bg-slate-500",
      };

      setSchoolEvents(data.map(ev => {
        const d = new Date(ev.start_date + "T00:00:00");
        const day = d.getDate();
        const month = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()];

        // ★ categories เป็น array — ดึงตัวแรกมาเทียบกับ colorMap
        const firstCat = (ev.categories ?? [])[0] ?? "general";
        const bgClass = colorMap[firstCat] ?? "bg-slate-500";

        return {
          date: `${day} ${month}`,
          title: ev.title,
          // ★ ถ้ามี color_override (hex สีที่ admin เลือกเอง) ให้ใช้ inline style แทน class
          color: ev.color_override ? "" : bgClass,
          colorHex: ev.color_override ?? null,
        };
      }));
    }
  }
  loadEvents();
}, [supabase]);

return (
  <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">

    {/* Top bar */}
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-base shadow-sm">พ</div>
        <div>
          <h2 className="text-sm font-black text-slate-900 leading-tight">โรงเรียนวัดเขียนเขต</h2>
          <span className="text-xs text-slate-400">ระบบบริหารจัดการ</span>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 border border-rose-100 transition-all"
      >
        <LogOut className="w-4 h-4" />
        <span>ออกจากระบบ</span>
      </button>
    </div>

    {/* Main content */}
    <main className="w-full p-4 md:p-8 lg:p-10 space-y-8">
      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-500 font-bold flex items-center gap-2">
          <span>โรงเรียนวัดเขียนเขต</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-extrabold">แดชบอร์ด</span>
        </div>

        {/* ✅ ศูนย์การแจ้งเตือน — เชื่อมกับใบลา/คำขอแก้ไขตารางสอน */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="p-2.5 text-slate-400 hover:text-slate-600 bg-white rounded-xl border border-slate-200 shadow-sm relative transition-all"
          >
            <Bell className="w-5 h-5" />
            {urgentCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 rounded-full text-[10px] text-white font-black flex items-center justify-center border-2 border-white">
                {urgentCount > 9 ? "9+" : urgentCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[26rem] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl z-50">
              <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-black text-slate-800 text-sm">🔔 การแจ้งเตือน</p>
                <button
                  onClick={() => loadNotifications({
                    profileId: "", email: "", role: "", extraRoles: [],
                  })}
                  className="hidden"
                />
                {notifLoading && <span className="text-xs text-slate-400 animate-pulse">กำลังโหลด...</span>}
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center text-slate-400 text-sm">
                  {notifLoading ? "⏳ กำลังตรวจสอบ..." : "✅ ไม่มีการแจ้งเตือนใหม่"}
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { setNotifOpen(false); router.push(n.path); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-800">{n.title}</span>
                        {n.urgent && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">ต้องดำเนินการ</span>}
                      </div>
                      <span className="text-xs text-slate-500 line-clamp-1">{n.detail}</span>
                      <span className="text-[10px] text-slate-400">{toThaiDateShort(n.date)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 rounded-2xl p-8 md:p-10 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
          <LayoutDashboard className="w-72 h-72 translate-x-12 translate-y-12" />
        </div>
        <span className="text-xs font-bold text-blue-200 bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-sm">
          {new Date().toLocaleDateString("th-TH", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
        </span>
        <h1 className="text-3xl md:text-4xl font-black mt-4 tracking-tight">
          {isMounted ? `สวัสดี ${userPrefix} ${userName} 👋` : "สวัสดี 👋"}
        </h1>
        <p className="text-sm md:text-base text-blue-100 mt-2 font-semibold opacity-90">
          ยินดีต้อนรับสู่ระบบสารสนเทศอัจฉริยะ โรงเรียนวัดเขียนเขต
        </p>
        <div onClick={() => router.push("/face-scan")}
          className="mt-5 inline-flex items-center gap-2 text-xs bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-xl shadow-sm cursor-pointer hover:bg-emerald-600 transition-all">
          <UserCheck className="w-4 h-4" />
          <span>คลิกเพื่อเข้าสู่หน้าลงเวลาปฏิบัติงาน</span>
        </div>
      </div>

{/* Shortcuts */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">ทางลัดเมนูด่วน</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {shortcuts.map((shortcut, idx) => (
            <button key={idx} onClick={() => router.push(shortcut.path)}
              // 1. เพิ่มคำว่า relative เข้าไปใน className
              className={`relative flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${shortcut.bg}`}>
              
              {/* 2. เพิ่ม StatusBadge พร้อมจัดตำแหน่งให้อยู่มุมบนขวา */}
              <div className="absolute top-1.5 right-1.5">
                <StatusBadge status={shortcut.status} />
              </div>

              <span className="text-2xl mb-1.5">{shortcut.icon}</span>
              <span className="text-xs font-extrabold leading-snug">{shortcut.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon:"✓", bg:"bg-emerald-100", color:"text-emerald-600", label:"นักเรียนมาวันนี้", value:"847", sub:"/ 920 คน", subColor:"text-slate-400" },
          { icon:"✕", bg:"bg-rose-100",    color:"text-rose-600",    label:"ขาดเรียนวันนี้",  value:"28",  sub:"(3.0%)",  subColor:"text-rose-400"  },
          { icon:"📅", bg:"bg-blue-100",   color:"text-blue-600",   label:"ครูลางาน",         value:"4",   sub:"มีสอนแทน 3", subColor:"text-slate-400" },
          { icon:"📌", bg:"bg-purple-100", color:"text-purple-600", label:"รอดำเนินการ",      value:String(urgentCount),  sub:"รายการ",  subColor:"text-slate-400" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className={`w-12 h-12 rounded-xl ${s.bg} ${s.color} flex items-center justify-center text-xl font-bold`}>{s.icon}</div>
            <div>
              <span className="text-xs font-bold text-slate-400 block">{s.label}</span>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black ${s.color}`}>{s.value}</span>
                <span className={`text-xs font-bold ${s.subColor}`}>{s.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar */}
<div className="space-y-3">
  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">📅 ปฏิทินปฏิบัติงาน ภาคเรียนที่ 1/2569</h3>
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 overflow-x-auto">
    {schoolEvents.length === 0 ? (
      <p className="text-sm text-slate-400">ไม่มีกิจกรรมที่กำลังจะมาถึง</p>
    ) : schoolEvents.map((event, idx) => (
      <div key={idx} className="flex-shrink-0 flex items-center gap-3 pr-6 border-r border-slate-100 last:border-0">
        <div
          className={`${event.color} w-12 h-12 rounded-xl text-white flex flex-col items-center justify-center text-[10px] font-bold leading-none`}
          style={event.colorHex ? { background: event.colorHex } : undefined}
        >
          <span>{event.date.split(" ")[0]}</span>
          <span>{event.date.split(" ")[1]}</span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">{event.title}</p>
          <p className="text-[10px] text-slate-400 font-medium">โรงเรียนวัดเขียนเขต</p>
        </div>
      </div>
    ))}
    <button onClick={() => router.push("/calendar")}
      className="flex-shrink-0 px-4 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-500 text-xs font-bold transition-all border border-slate-200 hover:border-blue-200 whitespace-nowrap">
      ดูเพิ่มเติม →
    </button>
  </div>
</div>

      {/* Menu groups */}
      <div className="space-y-5 pt-2">
        <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-wider">🎛️ ศูนย์รวมระบบงานสารสนเทศและบริการบุคลากร</h3>
        <div className="space-y-6">
          {menuGroups.map((group, gIdx) => (
            <div key={gIdx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-2.5">{group.title}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {group.items.map((item, iIdx) => (
  <button key={iIdx} onClick={() => router.push(item.path)}
    className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-blue-400 hover:shadow-md transition-all group text-left">
    <div className={`w-11 h-11 rounded-xl ${item.color} text-white flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 shrink-0`}>
      {item.icon}
    </div>
    <div className="flex-1 min-w-0">
      <span className="block text-sm font-extrabold text-slate-700 group-hover:text-blue-600 transition-colors truncate">
        {item.name}
      </span>
      <StatusBadge status={item.status} />
    </div>
  </button>
))}
              </div>
            </div>
          ))}

          {/* ส่วนผู้ดูแลระบบ — ด้านล่างสุด */}
          <div className="bg-rose-50 p-5 rounded-2xl border border-rose-200 shadow-sm space-y-4">
            <h4 className="text-sm font-extrabold text-rose-700 border-b border-rose-200 pb-2.5">🛠️ ส่วนผู้ดูแลระบบ</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => handleAdminMenuClick("/admin")}
                className="flex items-center gap-4 p-4 rounded-xl border border-rose-100 bg-white hover:border-rose-400 hover:shadow-md transition-all group text-left">
                <div className="w-11 h-11 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <span className="text-sm font-extrabold text-slate-700 group-hover:text-rose-600">จัดการข้อมูลผู้ใช้</span>
              </button>
              <button onClick={() => handleAdminMenuClick("/admin/settings")}
                className="flex items-center gap-4 p-4 rounded-xl border border-rose-100 bg-white hover:border-rose-400 hover:shadow-md transition-all group text-left">
                <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                  <Settings className="w-6 h-6" />
                </div>
                <span className="text-sm font-extrabold text-slate-700 group-hover:text-rose-600">ตั้งค่าระบบโรงเรียน</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </main>
  </div>
);
}