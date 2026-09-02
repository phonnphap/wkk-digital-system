"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, UserCheck, CalendarDays, FileText,
  Wrench, Car, Monitor, FolderOpen, FileEdit, Trophy, Calendar, RefreshCw, Users, LogOut, Bell, Settings,
  User,
  GraduationCap,
  UploadCloud   // ★ เพิ่มบรรทัดนี้
} from "lucide-react";

// ══════════════════════════════════════════════════════════
// ── การแจ้งเตือน — ค่าคงที่ที่ใช้ระบุ "ผู้อนุมัติ" ตรงกับหน้าใบลา/ตารางสอน ──
// (ถ้าอีเมลผู้อนุมัติเปลี่ยน แก้ตรงนี้จุดเดียว)
// ══════════════════════════════════════════════════════════
const LEAVE_APPROVER_1_EMAIL = "phansa@khienkhet.ac.th";
const LEAVE_APPROVER_2_EMAIL = "titima@khienkhet.ac.th";
const LEAVE_APPROVER_3_EMAIL = "thananut@khienkhet.ac.th";
const ATTENDANCE_IMPORT_ALLOWED_EMAILS = [
  "sumalin@khienkhet.ac.th",
  // เพิ่มอีเมลคนอื่นที่ต้องการให้สิทธิ์ได้ที่นี่
];

// ★ ไฟล์เสียงแจ้งเตือน — วางไฟล์ไว้ที่ public/sounds/ui alert.mp3
// (แนะนำให้เปลี่ยนชื่อไฟล์เป็น ui-alert.mp3 ไม่มีเว้นวรรค จะปลอดภัยกว่า
//  แต่โค้ดนี้ encodeURI ให้แล้วเผื่อยังใช้ชื่อเดิมที่มีเว้นวรรค)
const NOTIF_SOUND_PATH = "/sounds/ui alert.mp3";

// ★ จำนวนวินาทีที่ให้ตรวจสอบแจ้งเตือนใหม่ซ้ำอัตโนมัติ (สำหรับเล่นเสียงเตือนตอนมีรายการใหม่)
const NOTIF_POLL_INTERVAL_MS = 60_000;

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

// ══════════════════════════════════════════════════════════
// ── การแจ้งเตือนที่ "ปิด/ดูแล้ว" ของผู้ใช้แต่ละคน — เก็บใน localStorage ──
// (เก็บแยกตามเครื่อง/เบราว์เซอร์ ไม่ sync ข้ามอุปกรณ์ — ถ้าต้องการ sync ข้ามอุปกรณ์
//  ในอนาคตค่อยย้ายไปเก็บเป็นตารางใน Supabase เช่น notification_reads)
// ══════════════════════════════════════════════════════════
function dismissedNotifStorageKey(profileId: string) {
  return `khienkhet_dismissed_notifs_${profileId}`;
}
function loadDismissedNotifIds(profileId: string): Set<string> {
  if (!profileId || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(dismissedNotifStorageKey(profileId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveDismissedNotifIds(profileId: string, ids: Set<string>) {
  if (!profileId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dismissedNotifStorageKey(profileId), JSON.stringify(Array.from(ids)));
  } catch {
    // เก็บไม่สำเร็จ (เช่น localStorage เต็ม/ถูกปิด) — ปล่อยผ่าน ไม่ critical
  }
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

type LoadNotifOpts = {
  profileId: string;
  email: string;
  role: string;
  extraRoles: string[];
  gradeLevel?: string | null; // ★ ใช้กรองครูในสายชั้นเดียวกัน (สำหรับหัวหน้าสายชั้น)
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userPrefix, setUserPrefix] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isMounted, setIsMounted] = useState<boolean>(false);
  // ── การแจ้งเตือน ──────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const [myProfileId, setMyProfileId] = useState<string>("");
  const [myRole, setMyRole] = useState<string>("");
  const [myGradeLevel, setMyGradeLevel] = useState<string | null>(null);
  // ★ อ้างอิงตัวเล่นเสียงแจ้งเตือน + รายการล่าสุดที่เคยเห็น เพื่อรู้ว่ามี "รายการใหม่" เมื่อไหร่
  const notifAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevNotifIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedNotifOnceRef = useRef(false);
  const notifOptsRef = useRef<LoadNotifOpts | null>(null);
  // ── สถิติการมาเรียน/ขาดเรียนวันนี้ — ดึงจากการเช็คชื่อโฮมรูมของครูประจำชั้น ──
  const [attendanceStats, setAttendanceStats] = useState<{ present: number; absent: number; total: number; checkedIn: number } | null>(null);
  // ── สถิติ "ครูลางาน" วันนี้ (ในสายชั้นตัวเอง ยกเว้นแอดมิน/ผู้บริหารเห็นทั้งโรงเรียน)
  //    + จำนวนคาบที่ตัวเองต้องสอนแทนวันนี้ (แอดมิน/ผู้บริหารไม่ต้องเห็นตัวเลขนี้) ──
  const [leaveTodayStats, setLeaveTodayStats] = useState<{
    onLeave: number;
    mySubPeriods: number;
    isAdminExec: boolean;
    scopeLabel: string;
  } | null>(null);

  // ★ เตรียมตัวเล่นเสียงแจ้งเตือนไว้ตั้งแต่โหลดหน้า (เล่นได้ก็ต่อเมื่อผู้ใช้เคยมีการโต้ตอบกับหน้าเว็บแล้ว
  //   ตามข้อจำกัด autoplay ของเบราว์เซอร์ — ถ้าเล่นไม่ได้จะเงียบไปเฉยๆ ไม่ error ค้าง)
  useEffect(() => {
    notifAudioRef.current = new Audio(encodeURI(NOTIF_SOUND_PATH));
    notifAudioRef.current.volume = 0.6;
  }, []);

  useEffect(() => {
  async function checkUserRole() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }
      setUserEmail((user.email || user.user_metadata?.email || "").toLowerCase());

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
        setMyProfileId(profile.id);
        setMyRole(profile.role || "");
        setMyGradeLevel(profile.grade_level || null);

        // ✅ โหลดการแจ้งเตือนหลังรู้ตัวตนผู้ใช้ครบแล้ว
        loadNotifications({
          profileId: profile.id,
          email: user.email || user.user_metadata?.email || "",
          role: profile.role || "",
          extraRoles: profile.extra_roles || [],
          gradeLevel: profile.grade_level || null,
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

  // ── ตรวจการแจ้งเตือนใหม่อัตโนมัติเป็นระยะ (สำหรับเล่นเสียงเตือนตอนมีรายการใหม่) ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (notifOptsRef.current) loadNotifications(notifOptsRef.current);
    }, NOTIF_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
  // ══════════════════════════════════════════════════════════
  // ── โหลดการแจ้งเตือน — รวมจากหลายระบบที่มีตารางข้อมูลรองรับแล้ว
  // ปัจจุบันเชื่อมกับ: ใบลา/ไปราชการ (leave_requests) และ คำขอแก้ไขตารางสอน
  // (timetable_change_requests) เพราะเป็น 2 ระบบที่มีสถานะ pending/approved
  // ชัดเจนอยู่แล้ว ระบบอื่น (แจ้งซ่อม/จองรถ/ขอออกนอกโรงเรียน ฯลฯ) ยังไม่มีให้ดูโครงสร้าง
  // ตาราง — เพิ่มเป็นบล็อกใหม่ในฟังก์ชันนี้ได้เลยเมื่อพร้อม (ดูคอมเมนต์ท้ายฟังก์ชัน)
  // ══════════════════════════════════════════════════════════
  async function loadNotifications(opts: LoadNotifOpts) {
    notifOptsRef.current = opts; // ★ จำ opts ล่าสุดไว้ ใช้ตอน refresh อัตโนมัติ/กดรีเฟรชเอง
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

// ══════════════════════════════════════════════════════════
// 11) ★ ใหม่ — ครูในสายชั้นเดียวกันลา / มีการจัดสอนแทน (สำหรับหัวหน้าสายชั้น)
// ใช้ users.grade_level เทียบกับของฉันเอง (เหมือนหน้าแลกคาบ&สอนแทนที่กรอง
// restrictToOwnGrade) — เห็นเฉพาะคนที่ role หรือ extra_roles มี "grade_head"
// ══════════════════════════════════════════════════════════
const isGradeHead = opts.role === "grade_head" || opts.extraRoles.includes("grade_head");
if (isGradeHead && opts.gradeLevel) {
  const { data: gradeTeachers, error: gtErr } = await supabase
    .from("users")
    .select("id, first_name, last_name, full_name")
    .eq("grade_level", opts.gradeLevel)
    .neq("id", opts.profileId);
  if (gtErr) console.warn("[loadNotifications] grade teachers query error:", gtErr.message);
  const gradeTeacherIds = (gradeTeachers || []).map((t: any) => t.id);
  const gradeTeacherName: Record<string, string> = Object.fromEntries(
    (gradeTeachers || []).map((t: any) => [t.id, t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "—"])
  );

  if (gradeTeacherIds.length > 0) {
    // 11a) ใบลาที่กำลังรออนุมัติของครูในสายชั้นเดียวกัน
    const { data: gradeLeaves, error: glErr } = await supabase
      .from("leave_requests")
      .select("id, days_count, start_date, status, user_id")
      .eq("status", "pending")
      .in("user_id", gradeTeacherIds);
    if (glErr) console.warn("[loadNotifications] grade leave query error:", glErr.message);
    (gradeLeaves || []).forEach((r: any) => {
      items.push({
        id: `gradeleave-${r.id}`,
        source: "leave_approval",
        title: "🧑‍🏫 ครูในสายชั้นยื่นใบลา",
        detail: `${gradeTeacherName[r.user_id] ?? "—"} · ${r.days_count} วัน`,
        date: r.start_date,
        path: "/leave",
        urgent: true,
      });
    });

    // 11b) การจัดสอนแทนล่าสุดที่เกี่ยวข้องกับครูในสายชั้นเดียวกัน (ยังไม่ยกเลิก)
    const { data: gradeSubs, error: gsErr } = await supabase
      .from("substitution_records")
      .select("id, substitute_date, status, created_at, absent_teacher_id, substitute_teacher_id")
      .in("absent_teacher_id", gradeTeacherIds)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(10);
    if (gsErr) console.warn("[loadNotifications] grade sub query error:", gsErr.message);
    (gradeSubs || []).forEach((r: any) => {
      const subName = r.substitute_teacher_id ? (gradeTeacherName[r.substitute_teacher_id] ?? "ครูท่านอื่น") : "ยังไม่ได้จัด";
      items.push({
        id: `gradesub-${r.id}`,
        source: "sub_assigned",
        title: "📋 มีการจัดสอนแทนในสายชั้น",
        detail: `${gradeTeacherName[r.absent_teacher_id] ?? "—"} วันที่ ${toThaiDateShort(r.substitute_date)} · สอนแทนโดย ${subName}`,
        date: r.created_at,
        path: "/substitution",
        urgent: true,
      });
    });
  }
}

      // ── กรองรายการที่ผู้ใช้ "ดูแล้ว/กดแล้ว" ทิ้งไป (เก็บสถานะไว้ใน localStorage) ──
      const dismissed = loadDismissedNotifIds(opts.profileId);
      const visibleItems = items.filter(it => !dismissed.has(it.id));
      // เก็บเฉพาะ id ที่ยังปรากฏอยู่จริง กัน localStorage บวมขึ้นเรื่อยๆ
      const currentIds = new Set(items.map(it => it.id));
      const prunedDismissed = new Set(Array.from(dismissed).filter(id => currentIds.has(id)));
      saveDismissedNotifIds(opts.profileId, prunedDismissed);

      visibleItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // ── ตรวจว่ามีรายการ "ใหม่" ที่ไม่เคยเห็นมาก่อนหรือไม่ ถ้ามีให้เล่นเสียงแจ้งเตือน ──
      const newIdSet = new Set(visibleItems.map(it => it.id));
      const hasNewItem = Array.from(newIdSet).some(id => !prevNotifIdsRef.current.has(id));
      if (hasNewItem && hasLoadedNotifOnceRef.current) {
        notifAudioRef.current?.play().catch(() => { /* เบราว์เซอร์บล็อก autoplay — ข้ามไปเงียบๆ */ });
      }
      prevNotifIdsRef.current = newIdSet;
      hasLoadedNotifOnceRef.current = true;

      setNotifications(visibleItems);
    } catch (err) {
      console.error("[loadNotifications] unexpected error:", err);
    }
    setNotifLoading(false);
  }

  // ★ ปิดแจ้งเตือนรายการนี้ทิ้งถาวร (ใช้ตอนกดดู/กดปิด) — ไม่ต้องรอ query รอบถัดไป
  function dismissNotification(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
    prevNotifIdsRef.current.delete(id);
    if (myProfileId) {
      const cur = loadDismissedNotifIds(myProfileId);
      cur.add(id);
      saveDismissedNotifIds(myProfileId, cur);
    }
  }

  const urgentCount = notifications.filter(n => n.urgent).length;
  const canImportAttendance =
  isAdmin || ATTENDANCE_IMPORT_ALLOWED_EMAILS.includes(userEmail);

const handleAttendanceImportClick = () => {
  if (canImportAttendance) {
    router.push("/admin/attendance-import");
  } else {
    alert("🔒 ขออภัย คุณไม่มีสิทธิ์นำเข้าข้อมูลลงเวลา");
  }
};

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
        { name: "ประวัติส่วนตัวและสถิติการปฏิบัติงาน", icon: <User className="w-6 h-6" />, color: "bg-sky-500", path: "/portfolio", status: "live" as ItemStatus },
        { name: "ใบลา/ไปราชการ", icon: <CalendarDays className="w-6 h-6" />, color: "bg-blue-500", path: "/leave", status: "live" as ItemStatus },
        { name: "ขอออกนอกโรงเรียน", icon: <LogOut className="w-6 h-6" />, color: "bg-amber-500", path: "/gate-pass" },
        { name: "เลขเกียรติบัตร/คำสั่ง/บันทึก", icon: <FileText className="w-6 h-6" />, color: "bg-indigo-500", path: "/document-reg" },
        { name: "รายงานการอบรมรายบุคคล", icon: <FolderOpen className="w-6 h-6" />, color: "bg-violet-500", path: "/training", status: "live" as ItemStatus },
        { name: "คลังเกียรติยศและผลงาน", icon: <Trophy className="w-6 h-6" />, color: "bg-yellow-500", path: "/honor/awards", status: "live" as ItemStatus },        
      ]
    },
    {
      title: "🏫 ระบบจัดการห้องเรียนและงานสอน",
      items: [
        { name: "Smart Class", icon: <UserCheck className="w-6 h-6" />, color: "bg-emerald-500", path: "/smartclass", status: "live" as ItemStatus },
        { name: "ครูประจำชั้น", icon: <Users className="w-6 h-6" />, color: "bg-teal-500", path: "/homeroom", status: "live" as ItemStatus },
        { name: "ตารางสอน", icon: <Calendar className="w-6 h-6" />, color: "bg-purple-500", path: "/schedule", status: "live"  as ItemStatus },
        { name: "แลกคาบ & สอนแทน", icon: <RefreshCw className="w-6 h-6" />, color: "bg-pink-500", path: "/substitution", status: "live"  as ItemStatus },
        { name: "PLC", icon: <Users className="w-6 h-6" />, color: "bg-teal-500", path: "/plc", status: "live" as ItemStatus },
        { name: "นิเทศการสอน", icon: <Settings className="w-6 h-6" />, color: "bg-rose-500", path: "/supervision" },
        { name: "คลังสื่อการสอน", icon: <FolderOpen className="w-6 h-6" />, color: "bg-cyan-500", path: "/media-library", status: "wip" as ItemStatus },
      ]
    },
    {
      title: "🛠️ ระบบสนับสนุนและยานพาหนะ",
      items: [
        { name: "รายงานเวรประจำวัน", icon: <Calendar className="w-6 h-6" />, color: "bg-orange-500", path: "/duty-report", status: "live"  as ItemStatus },
        { name: "จองรถ & ห้องประชุม", icon: <Car className="w-6 h-6" />, color: "bg-blue-600", path: "/booking" },
        { name: "ยืม-คืน อุปกรณ์ ICT", icon: <Monitor className="w-6 h-6" />, color: "bg-sky-600", path: "/ict-borrow", status: "wip"  as ItemStatus },
        { name: "แจ้งซ่อม (Helpdesk)", icon: <Wrench className="w-6 h-6" />, color: "bg-rose-600", path: "/repair", status: "wip"  as ItemStatus },
      ]
    }
  ];

  const shortcuts = [
    { name: "ลงเวลาปฏิบัติงาน", icon: "📸", bg: "bg-blue-50 border-blue-100 text-blue-700", path: "/face-scan", status: "beta"  as ItemStatus },
    { name: "ปฏิทินงาน", icon: "🗓️", bg: "bg-indigo-50 border-indigo-100 text-indigo-700", path: "/calendar", status: "live" as ItemStatus },
    { name: "เช็คชื่อนักเรียน", icon: "📋", bg: "bg-emerald-50 border-emerald-100 text-emerald-700", path: "/attendance", status: "live" as ItemStatus },
    { name: "ยื่นใบลา", icon: "📅", bg: "bg-amber-50 border-amber-100 text-amber-700", path: "/leave", status: "live" as ItemStatus },
    { name: "แจ้งซ่อม", icon: "🔧", bg: "bg-rose-50 border-rose-100 text-rose-700", path: "/repair", status: "live" as ItemStatus },
    { name: "จองรถ/ห้องประชุม", icon: "🚌", bg: "bg-cyan-50 border-cyan-100 text-cyan-700", path: "/booking" },
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

  type AttendanceSummary = {
  present: number;
  absent: number;
  checked_in: number;
  total: number;
};

useEffect(() => {
  async function loadSchoolEvents() {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, title, start_date, categories, color_override")
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5);

    if (error) {
      console.warn("[loadSchoolEvents] โหลดปฏิทินไม่สำเร็จ:", error.message);
      return;
    }

    const CATEGORY_COLORS: Record<string, string> = {
      academic: "#185FA5", budget: "#0F6E56", general: "#6B7280",
      personnel: "#854F0B", parent: "#534AB7", student: "#3B6D11",
      holiday: "#A32D2D", meeting: "#1e40af", training: "#7c3aed",
      important: "#b45309",
    };
    const TH_MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

    setSchoolEvents((data || []).map((ev: any) => {
      const d = new Date(ev.start_date + "T00:00:00");
      return {
        date: `${d.getDate()} ${TH_MONTH_SHORT[d.getMonth()]}`,
        title: ev.title,
        color: "bg-blue-500", // fallback (ไม่ได้ใช้จริงเพราะมี colorHex override)
        colorHex: ev.color_override || CATEGORY_COLORS[ev.categories?.[0]] || "#6B7280",
      };
    }));
  }
  loadSchoolEvents();
}, [supabase]);

useEffect(() => {
  async function loadAttendanceStats() {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .rpc("get_attendance_summary", { target_date: today })
      .single();

    if (error) {
      console.warn("[loadAttendanceStats] โหลดสถิติการมาเรียนไม่สำเร็จ:", error.message);
      return;
    }

    const summary = data as AttendanceSummary | null;

    setAttendanceStats({
      present: summary?.present ?? 0,
      absent: summary?.absent ?? 0,
      total: summary?.total ?? 0,
      checkedIn: summary?.checked_in ?? 0,
    });
  }
  loadAttendanceStats();
}, [supabase]);

// ══════════════════════════════════════════════════════════
// ── สถิติ นร.มาเรียนวันนี้ / ขาดเรียนวันนี้ — ดึงจากการเช็คชื่อโฮมรูมของครูประจำชั้น
// (ตาราง attendance_records: student_id, classroom_id, attendance_date, status
//  ตรงกับ app/attendance/page.tsx — status เป็น "present" / "late" / "leave" / "absent")
//
// ⚠️ "total" ใช้จำนวนนักเรียนที่ลงทะเบียนจริงจากตาราง students (ไม่ใช่แค่จำนวนแถวที่
//    เช็คชื่อแล้ววันนี้) เพราะถ้ายังเช็คไม่ครบทุกห้อง จำนวนจากแถว attendance_records
//    อย่างเดียวจะน้อยกว่าความจริงเสมอ — checkedIn เก็บไว้เผื่ออยากโชว์ "เช็คแล้วกี่คน"
//
// ⚠️ ถ้าตัวเลขที่แอดมินเห็นยังไม่ตรง ให้ตรวจ RLS policy ของตาราง attendance_records
//    และ students ก่อน — เพราะถ้า policy อนุญาตให้อ่านได้เฉพาะ "ครูประจำชั้นของห้องนั้น"
//    ตอนแอดมินโหลดจะได้แถวว่างๆ กลับมาแบบไม่ error (query ผ่านแต่ไม่มีข้อมูล)
//    ตัวอย่าง policy ที่ต้องมีเพิ่ม (รันใน Supabase SQL editor):
//
//    create policy "admins can view all attendance"
//      on attendance_records for select
//      using (exists (
//        select 1 from users u
//        where u.auth_id = auth.uid()
//        and u.role in ('admin','director','deputy_director')
//      ));
//
//    create policy "admins can view all students"
//      on students for select
//      using (exists (
//        select 1 from users u
//        where u.auth_id = auth.uid()
//        and u.role in ('admin','director','deputy_director')
//      ));
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// ── สถิติ "ครูลางาน" วันนี้ — ดึงจากตาราง leave_requests / substitution_records จริง
// (ตารางเดียวกับที่หน้า /substitution ใช้อยู่แล้ว)
//
// กฎการแสดงผล:
// - แอดมิน/ผอ./รองผอ. (ADMIN_EXEC_ROLES) → เห็นจำนวนครูลา "ทั้งโรงเรียน" และไม่ต้องขึ้นจำนวนคาบสอนแทน
// - ครูทั่วไป/หัวหน้าสายชั้น/หัวหน้าหมวด → เห็นจำนวนครูลาเฉพาะ "สายชั้นเดียวกับตัวเอง" (grade_level)
//   และขึ้นจำนวนคาบที่ตัวเอง (ผู้ล็อกอิน) ถูกจัดให้สอนแทนวันนี้เท่านั้น
// ══════════════════════════════════════════════════════════
const ADMIN_EXEC_ROLES = ["admin", "director", "deputy_director"];

useEffect(() => {
  if (!myProfileId) return; // รอให้โหลดโปรไฟล์ (role/grade_level) เสร็จก่อน

  async function loadLeaveTodayStats() {
    const today = new Date().toISOString().split("T")[0];
    const isAdminExec = ADMIN_EXEC_ROLES.includes(myRole);

    // ── แอดมิน/ผู้บริหาร: ไม่กรองสายชั้น เห็นครูลาทั้งโรงเรียน ──
    // ── ครูทั่วไป: กรองเฉพาะครูที่ grade_level เดียวกับตัวเอง ──
    let sameGradeTeacherIds: string[] | null = null;
    if (!isAdminExec) {
      if (!myGradeLevel) {
        // ไม่มีสายชั้นระบุไว้ในโปรไฟล์ — ไม่มีใครเข้าเงื่อนไข ให้ขึ้น 0 ไปก่อน
        setLeaveTodayStats({ onLeave: 0, mySubPeriods: 0, isAdminExec: false, scopeLabel: "สายชั้นของคุณ" });
        return;
      }
      const { data: gradeTeachers, error: gtErr } = await supabase
        .from("users")
        .select("id")
        .eq("grade_level", myGradeLevel);
      if (gtErr) {
        console.warn("[loadLeaveTodayStats] โหลดรายชื่อครูในสายชั้นไม่สำเร็จ:", gtErr.message);
        return;
      }
      sameGradeTeacherIds = (gradeTeachers || []).map((t: any) => t.id);
      if (sameGradeTeacherIds.length === 0) {
        setLeaveTodayStats({ onLeave: 0, mySubPeriods: 0, isAdminExec: false, scopeLabel: "สายชั้นของคุณ" });
        return;
      }
    }

    // 1) ครูที่ลาแบบอนุมัติแล้ว และวันนี้อยู่ในช่วงวันลา (กรองสายชั้นถ้าไม่ใช่แอดมิน/ผู้บริหาร)
    let leaveQuery = supabase
      .from("leave_requests")
      .select("id, user_id")
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today);
    if (sameGradeTeacherIds) leaveQuery = leaveQuery.in("user_id", sameGradeTeacherIds);

    const { data: leaves, error: leaveErr } = await leaveQuery;
    if (leaveErr) {
      console.warn("[loadLeaveTodayStats] โหลดใบลาวันนี้ไม่สำเร็จ:", leaveErr.message);
      return;
    }
    const onLeave = (leaves || []).length;

    // 2) จำนวนคาบที่ "ตัวเอง" ถูกจัดให้สอนแทนวันนี้ — เฉพาะครูทั่วไป (แอดมิน/ผู้บริหารไม่ต้องเห็น)
    let mySubPeriods = 0;
    if (!isAdminExec) {
      const { data: mySubs, error: subErr } = await supabase
        .from("substitution_records")
        .select("id")
        .eq("substitute_teacher_id", myProfileId)
        .eq("substitute_date", today)
        .neq("status", "cancelled");
      if (subErr) {
        console.warn("[loadLeaveTodayStats] โหลดคาบสอนแทนของตัวเองไม่สำเร็จ:", subErr.message);
      } else {
        mySubPeriods = (mySubs || []).length;
      }
    }

    setLeaveTodayStats({
      onLeave,
      mySubPeriods,
      isAdminExec,
      scopeLabel: isAdminExec ? "ทั้งโรงเรียน" : "สายชั้นของคุณ",
    });
  }
  loadLeaveTodayStats();
}, [supabase, myProfileId, myRole, myGradeLevel]);

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
                  onClick={() => { if (notifOptsRef.current) loadNotifications(notifOptsRef.current); }}
                  title="รีเฟรชการแจ้งเตือน"
                  className="text-xs text-slate-400 hover:text-blue-600 font-bold flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${notifLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center text-slate-400 text-sm">
                  {notifLoading ? "⏳ กำลังตรวจสอบ..." : "✅ ไม่มีการแจ้งเตือนใหม่"}
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-2 group"
                    >
                      <button
                        onClick={() => { setNotifOpen(false); dismissNotification(n.id); router.push(n.path); }}
                        className="flex-1 min-w-0 flex flex-col gap-0.5 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-800">{n.title}</span>
                          {n.urgent && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">ต้องดำเนินการ</span>}
                        </div>
                        <span className="text-xs text-slate-500 line-clamp-1">{n.detail}</span>
                        <span className="text-[10px] text-slate-400">{toThaiDateShort(n.date)}</span>
                      </button>
                      {/* ★ ปิดแจ้งเตือนนี้โดยไม่ต้องเปิดหน้าไปดู — เผื่อดำเนินการ/เห็นแล้วจากที่อื่น */}
                      <button
                        onClick={() => dismissNotification(n.id)}
                        title="ทำเครื่องหมายว่าดูแล้ว"
                        className="shrink-0 w-6 h-6 mt-0.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
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
  {
    icon: "✓", bg: "bg-emerald-100", color: "text-emerald-600", label: "นักเรียนมาวันนี้",
    value: attendanceStats ? String(attendanceStats.present) : "-",
    sub: attendanceStats
      ? `/ ${attendanceStats.total} คน (เช็คแล้ว ${attendanceStats.checkedIn})`
      : "รอข้อมูล",
    subColor: "text-slate-400",
    href: "/admin/attendance-overview",
  },
  {
    icon: "✕", bg: "bg-rose-100", color: "text-rose-600", label: "ขาดเรียนวันนี้",
    value: attendanceStats ? String(attendanceStats.absent) : "-",
    sub: attendanceStats && attendanceStats.total > 0
      ? `(${((attendanceStats.absent / attendanceStats.total) * 100).toFixed(1)}%)`
      : "รอข้อมูล",
    subColor: "text-rose-400",
    href: "/admin/attendance-overview", // ★ เพิ่มให้กดดูสถิติรวมได้เหมือนกัน
  },
  {
    icon: "📅", bg: "bg-blue-100", color: "text-blue-600",
    label: leaveTodayStats ? `ครูลางาน (${leaveTodayStats.scopeLabel})` : "ครูลางาน",
    value: leaveTodayStats ? String(leaveTodayStats.onLeave) : "-",
    sub: !leaveTodayStats
      ? "รอข้อมูล"
      : leaveTodayStats.isAdminExec
        ? ""
        : `คุณสอนแทน ${leaveTodayStats.mySubPeriods} คาบ`,
    subColor: "text-slate-400",
  },
  { icon:"📌", bg:"bg-purple-100", color:"text-purple-600", label:"รอดำเนินการ", value:String(urgentCount), sub:"รายการ", subColor:"text-slate-400" },
].map((s, i) => (
  <div
    key={i}
    onClick={() => { if ((s as any).href) router.push((s as any).href); }}
    className={`bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm transition-all ${
      (s as any).href ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300" : ""
    }`}
  >
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
              <button onClick={() => handleAdminMenuClick("/admin/teachers")}
  className="flex items-center gap-4 p-4 rounded-xl border border-rose-100 bg-white hover:border-rose-400 hover:shadow-md transition-all group text-left">
  <div className="w-11 h-11 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
    <GraduationCap className="w-6 h-6" />
  </div>
  <span className="text-sm font-extrabold text-slate-700 group-hover:text-rose-600">ข้อมูลครูทั้งหมด</span>
</button>
<button onClick={handleAttendanceImportClick}
                className="flex items-center gap-4 p-4 rounded-xl border border-rose-100 bg-white hover:border-rose-400 hover:shadow-md transition-all group text-left">
                <div className="w-11 h-11 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <span className="text-sm font-extrabold text-slate-700 group-hover:text-rose-600">นำเข้าข้อมูล</span>
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