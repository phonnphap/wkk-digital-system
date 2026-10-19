import type { ReactNode } from "react";
import {
  LayoutDashboard, UserCheck, CalendarDays, FileText, Wrench, Car, Monitor,
  FolderOpen, Trophy, Calendar, RefreshCw, Users, LogOut, Settings, User,
  GraduationCap, UploadCloud, MapPin,
} from "lucide-react";

export type ItemStatus = "live" | "beta" | "wip" | undefined;

export type MenuItem = {
  name: string;
  path: string;
  icon: ReactNode;
  status?: ItemStatus;
  adminOnly?: boolean;
};

export type MenuGroup = {
  title: string;
  items: MenuItem[];
};

const ic = "w-5 h-5 shrink-0";

// ✏️ เพิ่ม/ลบ/แก้เมนูได้ที่ไฟล์นี้ไฟล์เดียว — ทุกหน้าจะเปลี่ยนตามทันที
export const MENU_GROUPS: MenuGroup[] = [
  {
    title: "ลางานและสารบรรณ",
    items: [
      { name: "ประวัติส่วนตัวและสถิติ", path: "/portfolio", icon: <User className={ic} />, status: "live" },
      { name: "ใบลา/ไปราชการ", path: "/leave", icon: <CalendarDays className={ic} />, status: "live" },
      { name: "ขอออกนอกโรงเรียน", path: "/gate-pass", icon: <LogOut className={ic} /> },
      { name: "เลขเกียรติบัตร/คำสั่ง", path: "/document-reg", icon: <FileText className={ic} /> },
      { name: "รายงานการอบรม", path: "/training", icon: <FolderOpen className={ic} />, status: "live" },
      { name: "คลังเกียรติยศและผลงาน", path: "/honor/awards", icon: <Trophy className={ic} />, status: "live" },
    ],
  },
  {
    title: "ห้องเรียนและงานสอน",
    items: [
      { name: "Smart Class", path: "/smartclass", icon: <UserCheck className={ic} />, status: "live" },
      { name: "ครูประจำชั้น", path: "/homeroom", icon: <Users className={ic} />, status: "live" },
      { name: "ตารางสอน", path: "/schedule", icon: <Calendar className={ic} />, status: "live" },
      { name: "แลกคาบ & สอนแทน", path: "/substitution", icon: <RefreshCw className={ic} />, status: "live" },
      { name: "PLC", path: "/plc", icon: <Users className={ic} />, status: "live" },
      { name: "นิเทศการสอน", path: "/supervision", icon: <Settings className={ic} /> },
      { name: "คลังสื่อการสอน", path: "/media-library", icon: <FolderOpen className={ic} />, status: "wip" },
    ],
  },
  {
    title: "สนับสนุนและยานพาหนะ",
    items: [
      { name: "รายงานเวรประจำวัน", path: "/duty-report", icon: <Calendar className={ic} />, status: "live" },
      { name: "จองรถ & ห้องประชุม", path: "/booking", icon: <Car className={ic} /> },
      { name: "ยืม-คืน อุปกรณ์ ICT", path: "/ict-borrow", icon: <Monitor className={ic} />, status: "wip" },
      { name: "แจ้งซ่อม (Helpdesk)", path: "/repair", icon: <Wrench className={ic} />, status: "beta" },
      { name: "แผนผังโรงเรียน 3D", path: "/map3d", icon: <MapPin className={ic} />, status: "beta" },
    ],
  },
  {
    title: "ผู้ดูแลระบบ",
    items: [
      { name: "จัดการข้อมูลผู้ใช้", path: "/admin", icon: <Users className={ic} />, adminOnly: true },
      { name: "ข้อมูลครูทั้งหมด", path: "/admin/teachers", icon: <GraduationCap className={ic} />, adminOnly: true },
      { name: "นำเข้าข้อมูล", path: "/admin/attendance-import", icon: <UploadCloud className={ic} />, adminOnly: true },
      { name: "ตั้งค่าระบบโรงเรียน", path: "/admin/settings", icon: <Settings className={ic} />, adminOnly: true },
    ],
  },
];

export const DASHBOARD_ITEM: MenuItem = {
  name: "แดชบอร์ด",
  path: "/dashboard",
  icon: <LayoutDashboard className={ic} />,
};