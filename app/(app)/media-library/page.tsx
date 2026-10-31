"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ══════════════════════════════════════════════════════════════════════════════
// ── Constants ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_ROLES = ["admin", "director", "deputy_director"]; // ผู้บริหาร/แอดมิน/ผู้ดูแลโครงการ

// ★ ตารางคลังแผน — ถ้าชื่อตารางของโรงเรียนต่างจากนี้ ให้แก้ที่นี่ที่เดียว (ดู normPlan ด้านล่างสำหรับชื่อคอลัมน์)
const LESSON_PLAN_TABLE = "lesson_plans";
// ★ โฟลเดอร์รากบน OneDrive สำหรับรูปสื่อ/รูปรายงาน
const MEDIA_REPORT_ROOT = "รายงานการใช้สื่อ";

const GRADE_LEVELS = [
  "อ.2", "อ.3",
  "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6",
  "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6",
];

const MEDIA_TYPES: { value: string; badge: string }[] = [
  { value: "สื่อดิจิทัล", badge: "bg-pink-100 text-pink-700 border-pink-300" },
  { value: "สื่ออุปกรณ์", badge: "bg-green-100 text-green-700 border-green-300" },
];
function mediaTypeBadge(v?: string) {
  return MEDIA_TYPES.find(t => t.value === v)?.badge ?? "bg-slate-100 text-slate-600 border-slate-300";
}

const STATUS_OPTIONS: { value: string; badge: string }[] = [
  { value: "ใช้งานได้", badge: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "ชำรุด", badge: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "เลิกใช้งาน", badge: "bg-slate-200 text-slate-500 border-slate-300" },
];
function statusBadge(v?: string) {
  return STATUS_OPTIONS.find(s => s.value === v)?.badge ?? "bg-slate-100 text-slate-600 border-slate-300";
}

const SUBJECT_GROUP_COLORS = [
  "bg-red-100 text-red-700", "bg-blue-100 text-blue-700", "bg-green-100 text-green-700",
  "bg-yellow-100 text-yellow-700", "bg-purple-100 text-purple-700", "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700", "bg-orange-100 text-orange-700", "bg-teal-100 text-teal-700",
];

// ══════════════════════════════════════════════════════════════════════════════
// ── Types ─────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
type UserProfile = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string; department_id?: string;
};
type Department = { id: string; name?: string; name_th?: string };
type LessonPlan = { id: string; title: string; unit_no?: string; subject_name?: string; teacher_id?: string };
type MediaItem = {
  id: string;
  registered_date: string;        // วันที่ลงทะเบียน
  media_type: string;             // ประเภทสื่อ/อุปกรณ์
  title: string;                  // ชื่อสื่อ/รายละเอียด
  subject?: string;                // วิชา
  grade_level?: string;            // ระดับชั้น
  lesson_plan_id?: string;         // ★ ผูกคลังแผน
  unit_no?: string;                // ★ เลขที่หน่วย
  media_no?: string;               // ★ เลขสื่อ
  subject_group?: string;          // ★ กลุ่มสาระฯ
  media_url?: string;              // ★ ลิงก์สื่อ
  image_item_id?: string;          // OneDrive item id ของรูปภาพ
  image_name?: string;
  attachment_item_id?: string;     // OneDrive item id ของไฟล์สื่อแนบ
  attachment_name?: string;
  attachment_web_url?: string;
  attachment_size?: number;
  source?: string;                 // แหล่งที่มา/ผู้ผลิต
  storage_location?: string;       // สถานที่จัดเก็บ
  owner_id?: string;               // ผู้รับผิดชอบ
  status: string;                  // สถานะการใช้งาน
  note?: string;                   // หมายเหตุ
  created_at?: string;
  owner?: UserProfile;
};
type ReportImage = { item_id: string; name: string };
type MediaReport = {
  id: string;
  media_id: string;
  academic_year: number;
  teacher_id?: string;
  subject_group?: string;
  used_date: string;
  grade_level?: string;
  student_count?: number;
  lesson_plan_id?: string;
  unit_no?: string;
  media_no?: string;
  objective?: string;
  usage_method?: string;
  results?: string;
  problems?: string;
  images?: ReportImage[];
  created_at?: string;
  media?: MediaItem;
  teacher?: UserProfile;
};

// ══════════════════════════════════════════════════════════════════════════════
// ── Helpers ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// ★ เพิ่มคำนำหน้า (title) ต่อท้ายชื่อเสมอ เช่น "นางสาววรัญญา ยอดมณี"
function displayName(u?: any) {
  if (!u) return "—";
  const title = (u.title ?? "").trim();
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn || ln) return `${title}${fn} ${ln}`.trim();
  return u.full_name ?? u.email ?? "—";
}
function formatDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function subjectColor(subject?: string) {
  if (!subject) return SUBJECT_GROUP_COLORS[0];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = (hash + subject.charCodeAt(i)) % SUBJECT_GROUP_COLORS.length;
  return SUBJECT_GROUP_COLORS[hash];
}
// วันที่ท้องถิ่น (YYYY-MM-DD) — toISOString() เป็น UTC จึงผิดวันช่วงเช้าในไทย
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// ★ ปีการศึกษา (พ.ศ.) — เริ่มพฤษภาคม: ต.ค. 2026 → 2569, มี.ค. 2026 → 2568
function academicYearOf(d: Date = new Date()) {
  const y = d.getFullYear();
  return (d.getMonth() >= 4 ? y : y - 1) + 543;
}
function groupNameOf(u: UserProfile | undefined, depts: Department[]) {
  if (!u?.department_id) return "";
  const d = depts.find(x => x.id === u.department_id);
  return String(d?.name ?? d?.name_th ?? "");
}
// map แถวจากตารางคลังแผน → LessonPlan (รองรับชื่อคอลัมน์หลายแบบ ปรับได้ตามจริง)
function normPlan(p: any): LessonPlan {
  return {
    id: String(p.id),
    title: String(p.title ?? p.name ?? p.topic ?? p.plan_name ?? "(ไม่มีชื่อแผน)"),
    unit_no: String(p.unit_no ?? p.unit_number ?? p.unit ?? "") || undefined,
    subject_name: p.subject_name ?? p.subject ?? undefined,
    teacher_id: p.teacher_id ?? p.owner_id ?? p.created_by ?? undefined,
  };
}
function planLabel(p: LessonPlan) {
  return `${p.unit_no ? `หน่วย ${p.unit_no} · ` : ""}${p.title}`;
}

// บัญชี OneDrive ปลายทาง — ต้องตรงกับ MICROSOFT_TARGET_EMAIL ฝั่งเซิร์ฟเวอร์ (lib/onedrive.ts) เสมอ
const ONEDRIVE_ACCOUNT = "academic@khienkhet.ac.th";

// รูปภาพ/ไฟล์ที่อัปโหลดขึ้น OneDrive แสดงผ่าน endpoint นี้เสมอ
// (proxy สตรีมเนื้อไฟล์จริงกลับมา ไม่ใช่ redirect ไปลิงก์ชั่วคราว จึงไม่มีวันหมดอายุ)
function onedriveSrc(itemId?: string) {
  return itemId ? `/api/onedrive-file?account=${encodeURIComponent(ONEDRIVE_ACCOUNT)}&itemId=${encodeURIComponent(itemId)}` : "";
}

// ★ แปลงรหัสวิชา (เช่น "ว11282") เป็นระดับชั้นตามกติกา:
// ตัวเลขหลังอักษรแรก (หลักที่ 1) = กลุ่มระดับ → 0=อนุบาล, 1=ประถม, 2=ม.ต้น, 3=ม.ปลาย
// ตัวเลขถัดมา (หลักที่ 2) = ลำดับภายในกลุ่ม → เช่น กลุ่ม "1" เลข "1" = ป.1, เลข "2" = ป.2 ฯลฯ
function gradeFromSubjectCode(code?: string): string | undefined {
  if (!code) return undefined;
  const cleaned = code.trim();
  const m = cleaned.match(/^[ก-ฮA-Za-z]*\s*(\d)(\d)/);
  if (!m) return undefined;
  const levelDigit = m[1];
  const orderDigit = parseInt(m[2], 10);
  switch (levelDigit) {
    case "0":
      if (orderDigit === 2) return "อ.2";
      if (orderDigit === 3) return "อ.3";
      return undefined;
    case "1":
      return orderDigit >= 1 && orderDigit <= 6 ? `ป.${orderDigit}` : undefined;
    case "2":
      return orderDigit >= 1 && orderDigit <= 3 ? `ม.${orderDigit}` : undefined;
    case "3":
      return orderDigit >= 1 && orderDigit <= 3 ? `ม.${orderDigit + 3}` : undefined;
    default:
      return undefined;
  }
}

// ★ ดึง "วิชา → รหัสวิชา" ที่ครูคนนี้สอนอยู่จริงจาก timetable_entries
async function loadTeacherSubjectCodeMap(teacherId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!teacherId) return map;
  const { data: rows } = await (supabase.from("timetable_entries") as any)
    .select("subject_id, teacher_id, teacher_id_2")
    .or(`teacher_id.eq.${teacherId},teacher_id_2.eq.${teacherId}`);
  const entries = (rows ?? []) as any[];
  if (entries.length === 0) return map;

  const subjectIds = [...new Set(entries.map(e => e.subject_id))];
  const { data: subjectsData } = await supabase.from("subjects")
    .select("id,subject_code,name_th")
    .in("id", subjectIds.length ? subjectIds : ["_none_"]);

  (subjectsData ?? []).forEach((s: any) => { map.set(s.name_th, s.subject_code); });
  return map;
}

// ★ ไฟล์ภาพ (ใช้ตัดสินใจว่าจะแสดงเป็นรูปตัวอย่าง หรือไอคอนตามประเภทไฟล์)
function isImageExt(name?: string) {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
}
function attachmentIcon(name?: string) {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📕";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["ppt", "pptx"].includes(ext)) return "📙";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📗";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "🎬";
  if (["mp3", "wav", "m4a"].includes(ext)) return "🎵";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  return "📎";
}
// ชื่อโฟลเดอร์ OneDrive ต้องไม่มีอักขระต้องห้ามของระบบไฟล์
function sanitizeFolderName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

// ★ ขอลำดับไฟล์ถัดไปของครูคนนี้ในวันนี้แบบ atomic (ใช้กับไฟล์แนบสื่อ)
async function getNextOneDriveSeq(teacherId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("increment_onedrive_counter", { p_teacher_id: teacherId, p_date: today });
  if (error) throw new Error("ขอลำดับไฟล์ไม่สำเร็จ: " + error.message);
  return data as number;
}

// อัปโหลดไฟล์ไปยัง OneDrive ผ่าน endpoint กลางของโรงเรียน
// ★ ใช้ field "path" เพื่อให้สร้างโฟลเดอร์ซ้อนได้ถูกต้อง
async function uploadFileToOneDriveWithPath(file: File, path: string): Promise<{
  itemId: string; name: string; webUrl: string; size: number; account: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("account", ONEDRIVE_ACCOUNT);
  formData.append("path", path);

  const res = await fetch("/api/upload-onedrive", { method: "POST", body: formData });
  const data = await res.json();
  if (!data.ok) {
    const msg = typeof data.error === "string" ? data.error : (data.error?.message ?? "อัปโหลดไม่สำเร็จ");
    throw new Error(msg);
  }
  return { itemId: data.itemId, name: file.name, webUrl: data.webUrl, size: file.size, account: data.account };
}

// ★ ไฟล์แนบสื่อ → โฟลเดอร์ประจำตัว "ครูที่อัพ" (วันที่_ลำดับ) เหมือนเดิม
async function uploadToTeacherFolder(file: File, uploader: UserProfile) {
  const seq = await getNextOneDriveSeq(uploader.id);
  const dateStr = new Date().toISOString().slice(0, 10);
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const fileName = `${dateStr}_${String(seq).padStart(2, "0")}.${ext}`;
  const folder = sanitizeFolderName(displayName(uploader));
  return uploadFileToOneDriveWithPath(file, `คลังสื่อการสอน/${folder}/${fileName}`);
}

// ★ รูปภาพของสื่อ/รายงาน → OneDrive academic@khienkhet.ac.th
//   รายงานการใช้สื่อ / ชื่อกลุ่มสาระ / ชื่อครู / เลขที่หน่วย_เลขสื่อ.นามสกุล
//   (suffix ใช้แยกรูปในรายงาน เช่น "_ใช้1" เพื่อไม่ทับรูปประจำสื่อ)
async function uploadToMediaReportFolder(
  file: File, group: string, teacherName: string, unitNo: string, mediaNo: string, suffix = ""
) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const fileName = `${sanitizeFolderName(unitNo)}_${sanitizeFolderName(mediaNo)}${suffix}.${ext}`;
  const path = [
    MEDIA_REPORT_ROOT,
    sanitizeFolderName(group || "ไม่ระบุกลุ่มสาระ"),
    sanitizeFolderName(teacherName),
    fileName,
  ].join("/");
  return uploadFileToOneDriveWithPath(file, path);
}

// ── ตัวช่วยจัดรูปข้อมูลที่วาง/นำเข้า ──
function normalizeEnum(v: string, options: { value: string }[]): string {
  const t = v.trim();
  if (!t) return "";
  const exact = options.find(o => o.value === t);
  if (exact) return exact.value;
  const loose = options.find(o => o.value.includes(t) || t.includes(o.value));
  return loose ? loose.value : t; // ไม่รู้จัก → คงค่าเดิมไว้ให้ตรวจตอนบันทึก
}
function normalizeGrade(v: string): string {
  const t = v.trim().replace(/\s+/g, "");
  if (!t) return "";
  if (GRADE_LEVELS.includes(t)) return t;
  const m = t.match(/^(อ|ป|ม)\.?(?:ที่)?(\d)$/);
  if (m && GRADE_LEVELS.includes(`${m[1]}.${m[2]}`)) return `${m[1]}.${m[2]}`;
  const m2 = t.match(/^(อนุบาล|ประถม|มัธยม)(?:ศึกษา)?(?:ปีที่)?(\d)$/);
  if (m2) {
    const p = m2[1] === "อนุบาล" ? "อ" : m2[1] === "ประถม" ? "ป" : "ม";
    if (GRADE_LEVELS.includes(`${p}.${m2[2]}`)) return `${p}.${m2[2]}`;
  }
  return v.trim();
}
function normalizeUrl(v: string): string {
  const u = v.trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Lightbox (ดูรูปขยาย) ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 text-slate-700 font-black text-lg">✕</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ตารางลงทะเบียนสื่อ (เต็มจอ / วางข้อมูลจาก Excel ได้) ──────────────────────
// ══════════════════════════════════════════════════════════════════════════════
type Row = {
  key: string; id?: string;
  media_type: string; title: string; subject: string; grade_level: string;
  lesson_plan_id: string; unit_no: string; media_no: string;
  source: string; storage_location: string; media_url: string; status: string; note: string;
  image_item_id: string; image_name: string; image_preview: string; image_uploading: boolean;
  att_item_id: string; att_name: string; att_web_url: string; att_size: number; att_preview: string; att_uploading: boolean;
  error?: string;
};

// คอลัมน์ข้อความ — ลำดับต้องตรงกับแบบฟอร์ม Excel (วางหลายช่องแล้วเรียงตามนี้)
type TextCol =
  | "media_type" | "title" | "subject" | "grade_level" | "unit_no" | "media_no"
  | "source" | "storage_location" | "media_url" | "status" | "note";
const TEXT_COLS: { col: TextCol; label: string; w: number; list?: string; req?: boolean; ph?: string }[] = [
  { col: "media_type",       label: "ประเภทสื่อ",          w: 120, list: "dl-type" },
  { col: "title",            label: "ชื่อสื่อ/รายละเอียด", w: 260, req: true, ph: "เช่น Power Point เรื่อง ..." },
  { col: "subject",          label: "วิชา",                w: 170, list: "dl-subject" },
  { col: "grade_level",      label: "ระดับชั้น",           w: 90,  list: "dl-grade" },
  { col: "unit_no",          label: "เลขที่หน่วย",         w: 90,  req: true },
  { col: "media_no",         label: "เลขสื่อ",             w: 80,  ph: "อัตโนมัติ" },
  { col: "source",           label: "แหล่งที่มา/ผู้ผลิต",  w: 160 },
  { col: "storage_location", label: "สถานที่จัดเก็บ",      w: 160 },
  { col: "media_url",        label: "ลิงก์สื่อ",           w: 220, ph: "https://..." },
  { col: "status",           label: "สถานะ",               w: 110, list: "dl-status" },
  { col: "note",             label: "หมายเหตุ",            w: 180 },
];

// หัวคอลัมน์ Excel ที่รับได้ (เทียบแบบไม่สนช่องว่าง/ดอกจัน/ตัวพิมพ์)
const HEADER_ALIASES: Record<TextCol, string[]> = {
  media_type: ["ประเภทสื่อ", "ประเภท", "ประเภทสื่อ/อุปกรณ์"],
  title: ["ชื่อสื่อ", "ชื่อสื่อ/รายละเอียด", "รายการสื่อ", "รายละเอียด"],
  subject: ["วิชา", "ชื่อวิชา"],
  grade_level: ["ระดับชั้น", "ชั้น"],
  unit_no: ["เลขที่หน่วย", "หน่วย", "หน่วยที่", "หน่วยการเรียนรู้"],
  media_no: ["เลขสื่อ", "สื่อที่", "ลำดับสื่อ", "ลำดับ"],
  source: ["แหล่งที่มา", "แหล่งที่มา/ผู้ผลิต", "ผู้ผลิต"],
  storage_location: ["สถานที่จัดเก็บ", "ที่เก็บ"],
  media_url: ["ลิงก์สื่อ", "ลิ้งค์สื่อ", "ลิงก์", "ลิ้งค์", "url", "link"],
  status: ["สถานะ", "สถานะการใช้งาน"],
  note: ["หมายเหตุ"],
};
const normHeader = (h: string) => h.replace(/[\s*＊]/g, "").toLowerCase();

let rowSeq = 0;
function emptyRow(): Row {
  return {
    key: `r${Date.now()}_${rowSeq++}`,
    media_type: MEDIA_TYPES[0].value, title: "", subject: "", grade_level: "",
    lesson_plan_id: "", unit_no: "", media_no: "",
    source: "", storage_location: "", media_url: "", status: STATUS_OPTIONS[0].value, note: "",
    image_item_id: "", image_name: "", image_preview: "", image_uploading: false,
    att_item_id: "", att_name: "", att_web_url: "", att_size: 0, att_preview: "", att_uploading: false,
  };
}
function rowFromItem(i: MediaItem): Row {
  return {
    ...emptyRow(), id: i.id,
    media_type: i.media_type ?? "", title: i.title ?? "", subject: i.subject ?? "", grade_level: i.grade_level ?? "",
    lesson_plan_id: i.lesson_plan_id ?? "", unit_no: i.unit_no ?? "", media_no: i.media_no ?? "",
    source: i.source ?? "", storage_location: i.storage_location ?? "", media_url: i.media_url ?? "",
    status: i.status ?? "", note: i.note ?? "",
    image_item_id: i.image_item_id ?? "", image_name: i.image_name ?? "", image_preview: onedriveSrc(i.image_item_id),
    att_item_id: i.attachment_item_id ?? "", att_name: i.attachment_name ?? "", att_web_url: i.attachment_web_url ?? "",
    att_size: i.attachment_size ?? 0, att_preview: isImageExt(i.attachment_name) ? onedriveSrc(i.attachment_item_id) : "",
  };
}
// แถวที่ "มีข้อมูลจริง" (ไม่นับค่าเริ่มต้นของประเภท/สถานะ)
function isRowFilled(r: Row) {
  return !!(r.title.trim() || r.subject.trim() || r.unit_no.trim() || r.source.trim() || r.storage_location.trim()
    || r.media_url.trim() || r.note.trim() || r.image_item_id || r.att_item_id);
}

function MediaGridModal({ item, currentUser, isAdmin, teachers, departments, lessonPlans, existingItems, onSave, onClose }: {
  item?: MediaItem; currentUser: UserProfile; isAdmin: boolean; teachers: UserProfile[];
  departments: Department[]; lessonPlans: LessonPlan[]; existingItems: MediaItem[];
  onSave: (payloads: Record<string, any>[], isEdit: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const isEdit = !!item;
  const [ownerId, setOwnerId] = useState(item?.owner_id ?? currentUser.id);
  const [registeredDate, setRegisteredDate] = useState(item?.registered_date ?? todayStr());
  const [rows, setRows] = useState<Row[]>(() => item ? [rowFromItem(item)] : Array.from({ length: 5 }, emptyRow));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── วิชาที่ผู้รับผิดชอบสอนจริง (ตารางสอน) → datalist + ผูกระดับชั้นอัตโนมัติ ──
  const [subjectCodeMap, setSubjectCodeMap] = useState<Map<string, string>>(new Map());
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoadingSubjects(true);
    loadTeacherSubjectCodeMap(ownerId).then(map => { if (!cancelled) { setSubjectCodeMap(map); setLoadingSubjects(false); } });
    return () => { cancelled = true; };
  }, [ownerId]);
  const availableSubjects = useMemo(() => [...subjectCodeMap.keys()].sort(), [subjectCodeMap]);

  const owner = teachers.find(t => t.id === ownerId) ?? currentUser;
  const subjectGroup = groupNameOf(owner, departments);
  const ownerPlans = useMemo(() => lessonPlans.filter(p => !p.teacher_id || p.teacher_id === ownerId), [lessonPlans, ownerId]);

  // ── แก้ไขเซลล์ ──
  function patchRow(key: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  }
  function applyCell(r: Row, col: TextCol, raw: string): Row {
    let v = raw;
    if (col === "media_type") v = normalizeEnum(raw, MEDIA_TYPES);
    else if (col === "status") v = normalizeEnum(raw, STATUS_OPTIONS);
    else if (col === "grade_level") v = normalizeGrade(raw);
    else if (col === "unit_no" || col === "media_no") v = raw.trim();
    const next: Row = { ...r, [col]: v, error: undefined };
    if (col === "subject") {
      const g = gradeFromSubjectCode(subjectCodeMap.get(v.trim()));
      if (g && !next.grade_level) next.grade_level = g;
    }
    return next;
  }
  function setCell(key: string, col: TextCol, value: string) {
    setRows(rs => rs.map(r => {
      if (r.key !== key) return r;
      const next: Row = { ...r, [col]: value, error: undefined };
      if (col === "subject") {
        const g = gradeFromSubjectCode(subjectCodeMap.get(value.trim()));
        if (g) next.grade_level = g; // เลือกวิชาจากตารางสอน → ผูกชั้นอัตโนมัติ
      }
      return next;
    }));
  }
  function setPlan(key: string, planId: string) {
    const p = ownerPlans.find(x => x.id === planId);
    setRows(rs => rs.map(r => {
      if (r.key !== key) return r;
      const next: Row = { ...r, lesson_plan_id: planId, error: undefined };
      if (p?.unit_no && !next.unit_no) next.unit_no = p.unit_no;
      if (p?.subject_name && !next.subject) next.subject = p.subject_name;
      return next;
    }));
  }

  // ── วางข้อมูลหลายช่อง/หลายแถวจาก Excel / Google Sheets ──
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) {
    const text = e.clipboardData.getData("text/plain");
    const body = text.replace(/\r\n/g, "\n").replace(/\n$/, "");
    if (!body.includes("\t") && !body.includes("\n")) return; // ค่าเดียว → วางตามปกติ
    e.preventDefault();
    const grid = body.split("\n").map(l => l.split("\t"));
    setRows(rs => {
      const out = [...rs];
      grid.forEach((cells, li) => {
        const ri = rowIdx + li;
        if (out.length <= ri) {
          if (isEdit) return;
          while (out.length <= ri) out.push(emptyRow());
        }
        let r = out[ri];
        cells.forEach((v, ci) => {
          const def = TEXT_COLS[colIdx + ci];
          if (def) r = applyCell(r, def.col, v);
        });
        out[ri] = r;
      });
      return out;
    });
  }
  function focusCell(r: number, c: number) {
    document.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`)?.focus();
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    if (e.key === "Enter") { e.preventDefault(); focusCell(e.shiftKey ? r - 1 : r + 1, c); }
  }

  // เติมค่าลงล่าง (แบบ Ctrl+D ใน Excel): ช่องว่างรับค่าจากช่องบนที่ไม่ว่างที่ใกล้ที่สุด
  function fillDown(col: TextCol) {
    setRows(rs => {
      let last = "";
      return rs.map(r => {
        const cur = String(r[col] ?? "");
        if (cur.trim()) { last = cur; return r; }
        return last ? { ...r, [col]: last, error: undefined } : r;
      });
    });
  }
  function duplicateRow(key: string) {
    setRows(rs => {
      const i = rs.findIndex(r => r.key === key);
      if (i < 0) return rs;
      const src = rs[i];
      const copy: Row = {
        ...emptyRow(),
        media_type: src.media_type, title: src.title, subject: src.subject, grade_level: src.grade_level,
        lesson_plan_id: src.lesson_plan_id, unit_no: src.unit_no, media_no: "", // เลขสื่อใหม่ (อัตโนมัติ)
        source: src.source, storage_location: src.storage_location, media_url: src.media_url,
        status: src.status, note: src.note,
      };
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });
  }
  function removeRow(key: string) {
    setRows(rs => rs.length <= 1 ? [emptyRow()] : rs.filter(r => r.key !== key));
  }
  function addRows(n: number) { setRows(rs => [...rs, ...Array.from({ length: n }, emptyRow)]); }

  async function copyAllTsv() {
    const filled = rowsRef.current.filter(isRowFilled);
    const lines = [TEXT_COLS.map(c => c.label).join("\t"), ...filled.map(r => TEXT_COLS.map(c => String(r[c.col]).replace(/[\t\n]/g, " ")).join("\t"))];
    try { await navigator.clipboard.writeText(lines.join("\n")); alert(`📋 คัดลอก ${filled.length} แถวแล้ว — วางใน Excel/Google Sheets ได้เลย`); }
    catch { alert("คัดลอกไม่สำเร็จ (เบราว์เซอร์ไม่อนุญาต)"); }
  }

  // ── เลขสื่ออัตโนมัติ (ไม่ซ้ำภายในหน่วยเดียวกันของผู้รับผิดชอบคนเดียวกัน) ──
  function autoNumber(list: Row[]): Row[] {
    const used = new Map<string, Set<string>>(); // unit → set of media_no
    const add = (u: string, n: string) => { if (!used.has(u)) used.set(u, new Set()); used.get(u)!.add(n); };
    existingItems.forEach(i => {
      if (i.owner_id === ownerId && i.id !== item?.id && i.unit_no && i.media_no) add(i.unit_no, i.media_no);
    });
    list.forEach(r => { if (r.unit_no.trim() && r.media_no.trim()) add(r.unit_no.trim(), r.media_no.trim()); });
    return list.map(r => {
      const u = r.unit_no.trim();
      if (!u || r.media_no.trim() || !isRowFilled(r)) return r;
      let n = 1;
      while (used.get(u)?.has(String(n))) n++;
      add(u, String(n));
      return { ...r, media_no: String(n) };
    });
  }

  // ── Excel: แบบฟอร์ม + นำเข้า ──
  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const header = TEXT_COLS.map(c => c.label);
    const example = ["สื่อดิจิทัล", "PowerPoint เรื่อง ...", "วิทยาศาสตร์", "ป.1", "1", "1", "ไฟล์ PowerPoint", "OneDrive กลุ่มสาระฯ", "https://...", "ใช้งานได้", ""];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    ws["!cols"] = TEXT_COLS.map(c => ({ wch: Math.round(c.w / 8) }));
    const help = XLSX.utils.aoa_to_sheet([
      ["คำอธิบาย"],
      ["ประเภทสื่อ", MEDIA_TYPES.map(t => t.value).join(" / ")],
      ["ระดับชั้น", GRADE_LEVELS.join(" ")],
      ["สถานะ", STATUS_OPTIONS.map(s => s.value).join(" / ")],
      ["เลขที่หน่วย", "จำเป็น — ใช้ตั้งชื่อรูปบน OneDrive (เลขที่หน่วย_เลขสื่อ)"],
      ["เลขสื่อ", "เว้นว่างได้ ระบบจะรันเลขต่อให้ภายในหน่วยเดียวกัน"],
      ["รูปภาพ/ไฟล์แนบ", "ไม่อยู่ใน Excel — ต้องแนบทีละสื่อในตารางหลังนำเข้า"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายการสื่อ");
    XLSX.utils.book_append_sheet(wb, help, "คำอธิบาย");
    XLSX.writeFile(wb, "แบบฟอร์มรายการสื่อ.xlsx");
  }
  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
      if (data.length === 0) { alert("ไม่พบข้อมูลในไฟล์ (ต้องมีแถวหัวคอลัมน์ในแถวแรก)"); return; }

      const colByHeader = new Map<string, TextCol>();
      (Object.keys(HEADER_ALIASES) as TextCol[]).forEach(col => {
        HEADER_ALIASES[col].forEach(a => colByHeader.set(normHeader(a), col));
      });
      const mapped: { header: string; col: TextCol }[] = [];
      Object.keys(data[0]).forEach(h => {
        const col = colByHeader.get(normHeader(h));
        if (col && !mapped.some(m => m.col === col)) mapped.push({ header: h, col });
      });
      if (!mapped.some(m => m.col === "title")) {
        alert("ไม่พบคอลัมน์ 'ชื่อสื่อ' — กรุณาใช้แบบฟอร์ม (ปุ่ม 'ดาวน์โหลดแบบฟอร์ม Excel')");
        return;
      }

      const imported: Row[] = [];
      data.forEach(rec => {
        let r = emptyRow();
        mapped.forEach(m => { r = applyCell(r, m.col, String(rec[m.header] ?? "")); });
        if (r.title.trim()) imported.push(r);
      });
      if (imported.length === 0) { alert("ไม่พบแถวที่มีชื่อสื่อ"); return; }

      const keep = rowsRef.current.filter(isRowFilled);
      setRows(autoNumber([...keep, ...imported]));
      alert(`📥 นำเข้า ${imported.length} รายการแล้ว\n\nกรุณาแนบ "รูปภาพ" ของแต่ละสื่อในตาราง (คอลัมน์ 🖼️) ด้วยตนเอง`);
    } catch (err: any) {
      alert("⚠️ อ่านไฟล์ Excel ไม่สำเร็จ: " + (err?.message ?? err));
    } finally {
      setImporting(false);
    }
  }

  // ── อัปโหลดรูป / ไฟล์ของแต่ละแถว ──
  async function handleImage(key: string, f: File) {
    const row = rowsRef.current.find(r => r.key === key);
    if (!row) return;
    const unit = row.unit_no.trim();
    if (!unit) { alert("กรุณากรอก 'เลขที่หน่วย' ของแถวนี้ก่อนแนบรูป (ใช้ตั้งชื่อไฟล์บน OneDrive)"); return; }
    const mediaNo = (autoNumber(rowsRef.current).find(r => r.key === key)?.media_no) || row.media_no.trim() || "1";
    patchRow(key, { media_no: mediaNo, image_preview: URL.createObjectURL(f), image_uploading: true });
    try {
      const res = await uploadToMediaReportFolder(f, subjectGroup, displayName(owner), unit, mediaNo);
      patchRow(key, { image_item_id: res.itemId, image_name: res.name });
    } catch (err: any) {
      alert("⚠️ อัปโหลดรูปไป OneDrive ไม่สำเร็จ: " + err.message);
      patchRow(key, { image_preview: onedriveSrc(row.image_item_id) });
    } finally {
      patchRow(key, { image_uploading: false });
    }
  }
  async function handleAttachment(key: string, f: File) {
    patchRow(key, { att_name: f.name, att_size: f.size, att_preview: isImageExt(f.name) ? URL.createObjectURL(f) : "", att_uploading: true });
    try {
      const res = await uploadToTeacherFolder(f, currentUser);
      patchRow(key, { att_item_id: res.itemId, att_name: res.name, att_web_url: res.webUrl, att_size: res.size });
    } catch (err: any) {
      alert("⚠️ อัปโหลดไฟล์สื่อไป OneDrive ไม่สำเร็จ: " + err.message);
      patchRow(key, { att_name: "", att_size: 0, att_preview: "" });
    } finally {
      patchRow(key, { att_uploading: false });
    }
  }

  // ── บันทึก ──
  async function handleSubmit() {
    if (rowsRef.current.some(r => r.image_uploading || r.att_uploading)) {
      alert("กรุณารอให้อัปโหลดไฟล์ขึ้น OneDrive เสร็จก่อนบันทึก"); return;
    }
    const prepared = autoNumber(rowsRef.current.map(r => {
      let n = r;
      (["media_type", "status", "grade_level"] as TextCol[]).forEach(c => { n = applyCell(n, c, r[c]); });
      return { ...n, media_url: normalizeUrl(n.media_url) };
    }));
    const filled = prepared.filter(isRowFilled);
    if (filled.length === 0) { alert("ยังไม่มีข้อมูลที่จะบันทึก"); return; }

    const taken = new Set<string>();
    existingItems.forEach(i => {
      if (i.owner_id === ownerId && i.id !== item?.id && i.unit_no && i.media_no) taken.add(`${i.unit_no}|${i.media_no}`);
    });
    const errs = new Map<string, string>();
    filled.forEach(r => {
      const e: string[] = [];
      if (!r.title.trim()) e.push("ไม่มีชื่อสื่อ");
      if (!r.unit_no.trim()) e.push("ไม่มีเลขที่หน่วย");
      if (r.media_type && !MEDIA_TYPES.some(t => t.value === r.media_type)) e.push(`ประเภท "${r.media_type}" ไม่ถูกต้อง`);
      if (r.status && !STATUS_OPTIONS.some(s => s.value === r.status)) e.push(`สถานะ "${r.status}" ไม่ถูกต้อง`);
      if (r.grade_level && !GRADE_LEVELS.includes(r.grade_level)) e.push(`ระดับชั้น "${r.grade_level}" ไม่ถูกต้อง`);
      const k = `${r.unit_no.trim()}|${r.media_no.trim()}`;
      if (r.unit_no.trim() && r.media_no.trim()) {
        if (taken.has(k)) e.push(`หน่วย ${r.unit_no}/สื่อ ${r.media_no} ซ้ำ`);
        taken.add(k);
      }
      if (e.length) errs.set(r.key, e.join(", "));
    });
    setRows(prepared.map(r => ({ ...r, error: errs.get(r.key) })));
    if (errs.size > 0) {
      alert(`❌ มี ${errs.size} แถวที่ต้องแก้ไข (ไฮไลต์สีแดงในตาราง)\n\n` +
        [...errs.values()].slice(0, 5).join("\n") + (errs.size > 5 ? "\n..." : ""));
      return;
    }

    const payloads = filled.map(r => {
      const p: Record<string, any> = {
        registered_date: registeredDate,
        media_type: r.media_type || MEDIA_TYPES[0].value,
        title: r.title.trim(),
        subject: r.subject.trim() || null, grade_level: r.grade_level || null,
        lesson_plan_id: r.lesson_plan_id || null, unit_no: r.unit_no.trim(), media_no: r.media_no.trim(),
        subject_group: subjectGroup || null,
        source: r.source.trim() || null, storage_location: r.storage_location.trim() || null,
        media_url: r.media_url.trim() || null,
        owner_id: ownerId, status: r.status || STATUS_OPTIONS[0].value, note: r.note.trim() || null,
        image_item_id: r.image_item_id || null, image_name: r.image_name || null,
        attachment_item_id: r.att_item_id || null, attachment_name: r.att_name || null,
        attachment_web_url: r.att_web_url || null, attachment_size: r.att_size || null,
      };
      if (isEdit) p.id = item!.id;
      return p;
    });
    setSaving(true);
    const ok = await onSave(payloads, isEdit);
    setSaving(false);
    if (!ok) return;
  }

  const filledCount = rows.filter(isRowFilled).length;
  const noImageCount = rows.filter(r => isRowFilled(r) && !r.image_item_id).length;
  const busy = saving || importing || rows.some(r => r.image_uploading || r.att_uploading);
  const th = "border border-slate-300 bg-slate-100 px-2 py-2 text-[11px] font-black text-slate-600 text-left whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}

      {/* Header */}
      <div className="bg-blue-600 px-5 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <h3 className="text-lg font-black text-white flex-1 min-w-[200px]">
          {isEdit ? "✏️ แก้ไขสื่อการสอน" : "➕ ลงทะเบียนสื่อการสอน (ตาราง)"}
        </h3>
        <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-sm">✕ ปิด</button>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-end gap-3 flex-wrap shrink-0">
        <div>
          <label className="block text-[10px] font-black text-slate-500 mb-1">ผู้รับผิดชอบ</label>
          {isAdmin && !isEdit ? (
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold">
              {teachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
          ) : (
            <div className="bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-600">{displayName(owner)}</div>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-500 mb-1">กลุ่มสาระฯ</label>
          <div className="bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-600 min-w-[120px]">
            {subjectGroup || <span className="text-amber-600">ไม่พบ (จะใช้ "ไม่ระบุกลุ่มสาระ")</span>}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-500 mb-1">วันที่ลงทะเบียน</label>
          <input type="date" value={registeredDate} onChange={e => setRegisteredDate(e.target.value)}
            className="bg-white border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold" />
        </div>
        {!isEdit && (
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <button onClick={downloadTemplate} className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-xs">⬇️ ดาวน์โหลดแบบฟอร์ม Excel</button>
            <label className="px-3 py-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-emerald-700 font-black text-xs cursor-pointer">
              {importing ? "⏳ กำลังอ่านไฟล์..." : "📥 นำเข้าจาก Excel"}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportExcel} disabled={importing} />
            </label>
            <button onClick={copyAllTsv} className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-xs">📋 คัดลอกทั้งตาราง</button>
            <button onClick={() => addRows(1)} className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-xs">＋ 1 แถว</button>
            <button onClick={() => addRows(5)} className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-xs">＋ 5 แถว</button>
          </div>
        )}
      </div>
      <div className="px-4 py-1.5 text-[11px] text-slate-500 font-bold bg-blue-50 border-b border-blue-100 shrink-0">
        💡 คัดลอกหลายช่อง/หลายแถวจาก Excel หรือ Google Sheets แล้ววางที่ช่องไหนก็ได้ (เรียงตามคอลัมน์) · Enter = ลงช่องล่าง · ปุ่ม ⬇ ที่หัวคอลัมน์ = เติมค่าลงช่องว่างด้านล่าง · รูปภาพต้องแนบทีละสื่อ (ต้องมีเลขที่หน่วยก่อน)
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <datalist id="dl-type">{MEDIA_TYPES.map(t => <option key={t.value} value={t.value} />)}</datalist>
        <datalist id="dl-grade">{GRADE_LEVELS.map(g => <option key={g} value={g} />)}</datalist>
        <datalist id="dl-status">{STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} />)}</datalist>
        <datalist id="dl-subject">{availableSubjects.map(s => <option key={s} value={s} />)}</datalist>

        <table className="border-collapse text-sm min-w-max">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={th + " w-10 text-center"}>#</th>
              <th className={th} style={{ minWidth: 170 }}>🖼️ รูปภาพสื่อ</th>
              <th className={th} style={{ minWidth: 200 }}>📎 ไฟล์สื่อ</th>
              {TEXT_COLS.map(c => (
                <th key={c.col} className={th} style={{ minWidth: c.w }}>
                  {c.label}{c.req && <span className="text-red-500"> *</span>}
                  {c.col === "subject" && loadingSubjects && <span className="font-normal text-slate-400"> (โหลด...)</span>}
                  {!isEdit && (
                    <button title="เติมค่าลงช่องว่างด้านล่าง" onClick={() => fillDown(c.col)}
                      className="ml-1 text-blue-500 hover:text-blue-700">⬇</button>
                  )}
                </th>
              ))}
              <th className={th} style={{ minWidth: 200 }}>🔗 คลังแผน</th>
              {!isEdit && <th className={th + " w-16 text-center"}>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.key} className={r.error ? "bg-red-50" : ri % 2 ? "bg-slate-50/50" : "bg-white"}>
                <td className="border border-slate-200 text-center text-xs font-black text-slate-400 align-middle">
                  {ri + 1}
                </td>

                {/* รูปภาพ */}
                <td className="border border-slate-200 px-2 py-1.5 align-middle">
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!r.image_preview} onClick={() => setPreview(r.image_preview)}
                      className="w-14 h-14 rounded-lg bg-slate-100 border border-dashed border-slate-300 overflow-hidden flex items-center justify-center shrink-0 relative">
                      {r.image_preview ? <img src={r.image_preview} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-xl">🖼️</span>}
                      {r.image_uploading && <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs animate-pulse">⏳</span>}
                    </button>
                    <div className="text-[10px] font-bold leading-tight">
                      <label className="inline-block px-2 py-1 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 cursor-pointer">
                        {r.image_item_id || r.image_preview ? "เปลี่ยนรูป" : "เลือกรูป"}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImage(r.key, f); }} />
                      </label>
                      <p className={`mt-1 ${r.image_uploading ? "text-amber-500" : r.image_item_id ? "text-emerald-600" : "text-slate-300"}`}>
                        {r.image_uploading ? "กำลังอัปโหลด..." : r.image_item_id ? "✅ อยู่บน OneDrive" : "ยังไม่มีรูป"}
                      </p>
                    </div>
                  </div>
                </td>

                {/* ไฟล์สื่อ */}
                <td className="border border-slate-200 px-2 py-1.5 align-middle">
                  <div className="flex items-center gap-2">
                    {r.att_name ? (
                      <button type="button" disabled={r.att_uploading}
                        onClick={() => r.att_preview ? setPreview(r.att_preview) : r.att_item_id && window.open(onedriveSrc(r.att_item_id), "_blank")}
                        title={r.att_preview ? "ดูภาพขยาย" : "เปิดดูตัวอย่างไฟล์"}
                        className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 text-2xl">
                        {r.att_preview ? <img src={r.att_preview} alt="" className="w-full h-full object-cover" /> : (r.att_uploading ? "⏳" : attachmentIcon(r.att_name))}
                      </button>
                    ) : null}
                    <div className="text-[10px] font-bold leading-tight min-w-0">
                      {r.att_name && <p className="text-slate-700 truncate max-w-[120px]" title={r.att_name}>{r.att_name}</p>}
                      {r.att_name && <p className="text-slate-400">{r.att_uploading ? "กำลังอัปโหลด..." : `${formatFileSize(r.att_size)} · ✅ OneDrive`}</p>}
                      <label className="inline-block mt-0.5 px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 cursor-pointer">
                        {r.att_name ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
                        <input type="file" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleAttachment(r.key, f); }} />
                      </label>
                    </div>
                  </div>
                </td>

                {/* คอลัมน์ข้อความ (วางได้) */}
                {TEXT_COLS.map((c, ci) => {
                  // ★ ช่องที่มีตัวเลือกตายตัวใช้ dropdown จริง (datalist จะกรองเหลือแต่ค่าที่ตรงกับที่พิมพ์/เลือกไว้)
                  const opts: string[] | undefined =
                    c.col === "media_type" ? MEDIA_TYPES.map(t => t.value)
                    : c.col === "grade_level" ? GRADE_LEVELS
                    : c.col === "status" ? STATUS_OPTIONS.map(s => s.value)
                    : c.col === "subject" && availableSubjects.length > 0 ? availableSubjects
                    : undefined;
                  if (opts) {
                    const cur = String(r[c.col]);
                    return (
                      <td key={c.col} className="border border-slate-200 p-0 align-middle">
                        <select
                          data-cell={`${ri}-${ci}`}
                          value={cur}
                          onChange={e => setCell(r.key, c.col, e.target.value)}
                          title={r.error}
                          style={{ minWidth: c.w }}
                          className="w-full px-2 py-2.5 text-sm font-bold bg-transparent text-slate-800 focus:bg-blue-50 focus:outline-none"
                        >
                          <option value="">—</option>
                          {cur && !opts.includes(cur) && <option value={cur}>{cur} (ไม่อยู่ในรายการ)</option>}
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                    );
                  }
                  return (
                  <td key={c.col} className="border border-slate-200 p-0 align-middle">
                    <input
                      data-cell={`${ri}-${ci}`}
                      list={c.list}
                      value={r[c.col]}
                      placeholder={c.ph}
                      onChange={e => setCell(r.key, c.col, e.target.value)}
                      onPaste={e => handlePaste(e, ri, ci)}
                      onKeyDown={e => handleKeyDown(e, ri, ci)}
                      title={r.error}
                      style={{ minWidth: c.w }}
                      className={`w-full px-2 py-2.5 text-sm font-bold bg-transparent text-slate-800 focus:bg-blue-50 focus:outline focus:outline-2 focus:outline-blue-400 focus:-outline-offset-2 ${r.error && ["title", "unit_no"].includes(c.col) && !r[c.col].trim() ? "bg-red-100" : ""}`}
                    />
                  </td>
                  );
                })}

                {/* คลังแผน */}
                <td className="border border-slate-200 p-0 align-middle">
                  <select value={r.lesson_plan_id} onChange={e => setPlan(r.key, e.target.value)}
                    className="w-full px-2 py-2.5 text-sm font-bold bg-transparent text-slate-700 focus:bg-blue-50 focus:outline-none" style={{ minWidth: 200 }}>
                    <option value="">— ไม่ผูกแผน —</option>
                    {ownerPlans.map(p => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}
                  </select>
                </td>

                {!isEdit && (
                  <td className="border border-slate-200 text-center whitespace-nowrap align-middle">
                    <button title="ทำซ้ำแถวนี้" onClick={() => duplicateRow(r.key)} className="px-1.5 text-slate-400 hover:text-blue-600">⧉</button>
                    <button title="ลบแถว" onClick={() => removeRow(r.key)} className="px-1.5 text-slate-400 hover:text-red-600">🗑️</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {ownerPlans.length === 0 && (
          <p className="px-4 py-2 text-[11px] text-slate-400 font-bold">ℹ️ ไม่พบแผนของผู้รับผิดชอบในคลังแผน (ยังเลือกผูกแผนไม่ได้ — กรอกเลขที่หน่วยเองได้)</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center gap-3 flex-wrap shrink-0">
        <p className="text-xs font-bold text-slate-500 flex-1 min-w-[200px]">
          {filledCount} รายการ
          {noImageCount > 0 && <span className="text-amber-600"> · ยังไม่แนบรูป {noImageCount} รายการ</span>}
        </p>
        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
        <button onClick={handleSubmit} disabled={busy}
          className="px-8 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
          {saving ? "⏳ กำลังบันทึก..." : busy ? "⏳ กำลังอัปโหลดไฟล์..." : `💾 บันทึก ${filledCount} รายการ`}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Media Detail Modal ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MediaDetailModal({ item, canEdit, plan, report, year, onEdit, onDelete, onReport, onViewReport, onClose }: {
  item: MediaItem; canEdit: boolean; plan?: LessonPlan; report?: MediaReport; year: number;
  onEdit: () => void; onDelete: () => Promise<void>;
  onReport: () => void; onViewReport: () => void; onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="overflow-y-auto">
          <div className="w-full h-72 bg-slate-100 overflow-hidden">
            {item.image_item_id
              ? <img src={onedriveSrc(item.image_item_id)} alt={item.title} onClick={() => setZoom(onedriveSrc(item.image_item_id))} className="w-full h-full object-contain cursor-zoom-in" />
              : <div className="w-full h-full flex items-center justify-center text-slate-300 text-5xl">🖼️</div>}
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-black px-2 py-1 rounded-lg border ${mediaTypeBadge(item.media_type)}`}>{item.media_type}</span>
              <span className={`text-xs font-black px-2 py-1 rounded-lg border ${statusBadge(item.status)}`}>{item.status}</span>
              {report
                ? <span className="text-xs font-black px-2 py-1 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300">📝 รายงานปี {year} แล้ว</span>
                : <span className="text-xs font-black px-2 py-1 rounded-lg border bg-amber-50 text-amber-700 border-amber-300">⏳ ยังไม่มีรายงานปี {year}</span>}
            </div>
            <h3 className="text-lg font-black text-slate-800 leading-snug">{item.title}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs font-black text-slate-400 uppercase">วิชา</p><p className="font-bold text-slate-700">{item.subject || "—"}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">ระดับชั้น</p><p className="font-bold text-slate-700">{item.grade_level || "—"}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">หน่วย / เลขสื่อ</p><p className="font-bold text-slate-700">{item.unit_no || "—"} / {item.media_no || "—"}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">กลุ่มสาระฯ</p><p className="font-bold text-slate-700">{item.subject_group || "—"}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">วันที่ลงทะเบียน</p><p className="font-bold text-slate-700">{formatDate(item.registered_date)}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">ผู้รับผิดชอบ</p><p className="font-bold text-slate-700">{displayName(item.owner)}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">แหล่งที่มา/ผู้ผลิต</p><p className="font-bold text-slate-700">{item.source || "—"}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">สถานที่จัดเก็บ</p><p className="font-bold text-slate-700">{item.storage_location || "—"}</p></div>
              <div><p className="text-xs font-black text-slate-400 uppercase">คลังแผน</p><p className="font-bold text-slate-700">{plan ? planLabel(plan) : "—"}</p></div>
            </div>
            {item.media_url && (
              <a href={item.media_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 hover:bg-indigo-100 transition-all">
                <span className="text-lg shrink-0">🔗</span>
                <div className="min-w-0">
                  <p className="text-[10px] text-indigo-400 font-bold">ลิงก์สื่อ</p>
                  <p className="text-xs font-bold text-indigo-700 truncate">{item.media_url}</p>
                </div>
              </a>
            )}
            {item.attachment_item_id && (
              <a href={onedriveSrc(item.attachment_item_id)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 hover:bg-blue-100 transition-all">
                {isImageExt(item.attachment_name) ? (
                  <img src={onedriveSrc(item.attachment_item_id)} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="text-3xl shrink-0">{attachmentIcon(item.attachment_name)}</span>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-blue-700 truncate">{item.attachment_name}</p>
                  <p className="text-[10px] text-blue-400 font-bold">{formatFileSize(item.attachment_size)} · เปิด/ดาวน์โหลดจาก OneDrive</p>
                </div>
              </a>
            )}
            {item.note && <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-600">💬 {item.note}</div>}
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4 flex-wrap shrink-0">
          {canEdit && (
            <button onClick={async () => { if (confirm("ลบสื่อนี้ออกจากคลัง? (รายงานการใช้สื่อของสื่อนี้จะถูกลบด้วย)")) { setDeleting(true); await onDelete(); setDeleting(false); } }}
              disabled={deleting}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm disabled:opacity-50">
              {deleting ? "⏳" : "🗑️ ลบ"}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ปิด</button>
          {report ? (
            <button onClick={onViewReport} className="px-4 py-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-emerald-700 font-black text-sm">📝 ดูรายงานปี {year}</button>
          ) : canEdit && (
            <button onClick={onReport} className="px-4 py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-700 font-black text-sm">📝 ทำรายงานการใช้สื่อ</button>
          )}
          {canEdit && (
            <button onClick={onEdit} className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">✏️ แก้ไข</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Media Card ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MediaCard({ item, reported, onClick }: { item: MediaItem; reported: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="w-full h-32 bg-slate-100 overflow-hidden relative">
        {item.image_item_id
          ? <img src={onedriveSrc(item.image_item_id)} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-slate-300 text-3xl">🖼️</div>}
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {item.media_url && <span className="bg-white/90 rounded-md px-1.5 py-0.5 text-[10px] font-black text-slate-500">🔗</span>}
          {item.attachment_item_id && <span className="bg-white/90 rounded-md px-1.5 py-0.5 text-[10px] font-black text-slate-500">📎</span>}
          {reported && <span className="bg-emerald-500 rounded-md px-1.5 py-0.5 text-[10px] font-black text-white">📝</span>}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${mediaTypeBadge(item.media_type)}`}>{item.media_type}</span>
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${statusBadge(item.status)}`}>{item.status}</span>
        </div>
        <p className="font-black text-slate-800 text-sm leading-snug line-clamp-2 mb-1">{item.title}</p>
        {item.subject && <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${subjectColor(item.subject)} mb-1`}>{item.subject}</span>}
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold mt-1">
          <span>{item.grade_level || "—"}{item.unit_no ? ` · ห.${item.unit_no}/${item.media_no ?? "-"}` : ""}</span>
          <span className="truncate ml-1">{displayName(item.owner)}</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── รายงานการใช้สื่อ: ฟอร์ม ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
type RImg = { item_id: string; name: string; preview: string; uploading: boolean };
const MAX_REPORT_IMAGES = 3;

function ReportFormModal({ report, presetMediaId, currentUser, isAdmin, items, reports, year, departments, lessonPlans, onSave, onClose }: {
  report?: MediaReport; presetMediaId?: string; currentUser: UserProfile; isAdmin: boolean;
  items: MediaItem[]; reports: MediaReport[]; year: number; departments: Department[]; lessonPlans: LessonPlan[];
  onSave: (d: Record<string, any>, isEdit: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const isEdit = !!report;
  const reportedIds = useMemo(
    () => new Set(reports.filter(r => r.academic_year === year).map(r => r.media_id)), [reports, year]);
  // ★ 1 สื่อ / 1 รายงาน / 1 ปีการศึกษา → เลือกได้เฉพาะสื่อที่ยังไม่มีรายงานปีนี้
  const selectable = useMemo(
    () => items.filter(i => (isAdmin || i.owner_id === currentUser.id) && (!reportedIds.has(i.id) || i.id === report?.media_id)),
    [items, isAdmin, currentUser.id, reportedIds, report?.media_id]);

  const [mediaId, setMediaId] = useState(report?.media_id ?? presetMediaId ?? "");
  const media = items.find(i => i.id === mediaId);
  const [usedDate, setUsedDate] = useState(report?.used_date ?? todayStr());
  const [gradeLevel, setGradeLevel] = useState(report?.grade_level ?? media?.grade_level ?? "");
  const [studentCount, setStudentCount] = useState(report?.student_count != null ? String(report.student_count) : "");
  const [objective, setObjective] = useState(report?.objective ?? "");
  const [usageMethod, setUsageMethod] = useState(report?.usage_method ?? "");
  const [results, setResults] = useState(report?.results ?? "");
  const [problems, setProblems] = useState(report?.problems ?? "");
  const [images, setImages] = useState<RImg[]>(
    (report?.images ?? []).map(i => ({ item_id: i.item_id, name: i.name, preview: onedriveSrc(i.item_id), uploading: false })));
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const plan = lessonPlans.find(p => p.id === media?.lesson_plan_id);
  const owner = media?.owner;
  const group = media?.subject_group || groupNameOf(owner, departments);
  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none";
  const lbl = "block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5";

  function pickMedia(id: string) {
    setMediaId(id);
    const m = items.find(i => i.id === id);
    if (m?.grade_level) setGradeLevel(m.grade_level);
  }

  async function addImage(f: File) {
    if (!media) { alert("กรุณาเลือกสื่อก่อน"); return; }
    if (!media.unit_no || !media.media_no) {
      alert("สื่อนี้ยังไม่มี 'เลขที่หน่วย/เลขสื่อ' — กรุณาแก้ไขรายการสื่อให้ครบก่อนแนบรูปรายงาน"); return;
    }
    if (images.length >= MAX_REPORT_IMAGES) { alert(`แนบรูปได้สูงสุด ${MAX_REPORT_IMAGES} รูป`); return; }
    const n = images.length + 1;
    const tempKey = `tmp${Date.now()}`;
    const preview = URL.createObjectURL(f);
    setImages(a => [...a, { item_id: tempKey, name: f.name, preview, uploading: true }]);
    try {
      const res = await uploadToMediaReportFolder(f, group, displayName(owner), media.unit_no, media.media_no, `_ใช้${n}`);
      setImages(a => a.map(x => x.item_id === tempKey ? { ...x, item_id: res.itemId, name: res.name, uploading: false } : x));
    } catch (err: any) {
      alert("⚠️ อัปโหลดรูปไม่สำเร็จ: " + err.message);
      setImages(a => a.filter(x => x.item_id !== tempKey));
    }
  }

  async function handleSubmit() {
    if (!media) { alert("กรุณาเลือกสื่อ"); return; }
    if (!usedDate) { alert("กรุณาระบุวันที่ใช้สื่อ"); return; }
    if (!usageMethod.trim() || !results.trim()) { alert("กรุณากรอก 'วิธีการใช้สื่อ' และ 'ผลการใช้สื่อ'"); return; }
    if (images.length === 0) { alert("กรุณาแนบรูปภาพการใช้สื่ออย่างน้อย 1 รูป"); return; }
    if (images.some(i => i.uploading)) { alert("กรุณารอให้อัปโหลดรูปเสร็จก่อนบันทึก"); return; }
    setSaving(true);
    const ok = await onSave({
      id: report?.id,
      media_id: media.id,
      academic_year: report?.academic_year ?? year,
      teacher_id: media.owner_id ?? currentUser.id,
      subject_group: group || null,
      used_date: usedDate,
      grade_level: gradeLevel || null,
      student_count: studentCount.trim() ? Number(studentCount) : null,
      lesson_plan_id: media.lesson_plan_id ?? null,
      unit_no: media.unit_no ?? null, media_no: media.media_no ?? null,
      objective: objective.trim() || null, usage_method: usageMethod.trim(),
      results: results.trim(), problems: problems.trim() || null,
      images: images.map(i => ({ item_id: i.item_id, name: i.name })),
    }, isEdit);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-600 px-6 py-4">
          <h3 className="text-lg font-black text-white">{isEdit ? "✏️ แก้ไขรายงานการใช้สื่อ" : "📝 รายงานการใช้สื่อ"} · ปีการศึกษา {report?.academic_year ?? year}</h3>
          <p className="text-emerald-100 text-xs font-bold">ทำได้ปีการศึกษาละ 1 ครั้ง ต่อ 1 สื่อ</p>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className={lbl}>เลือกสื่อ *</label>
            <select value={mediaId} onChange={e => pickMedia(e.target.value)} disabled={isEdit} className={inp}>
              <option value="">— เลือกสื่อที่ยังไม่ได้ทำรายงานปีนี้ —</option>
              {selectable.map(i => (
                <option key={i.id} value={i.id}>
                  {i.unit_no ? `[ห.${i.unit_no}/${i.media_no ?? "-"}] ` : ""}{i.title}{isAdmin ? ` — ${displayName(i.owner)}` : ""}
                </option>
              ))}
            </select>
            {selectable.length === 0 && <p className="text-[11px] text-amber-600 font-bold mt-1">⚠️ ไม่มีสื่อที่ยังไม่ได้ทำรายงานในปีการศึกษานี้</p>}
          </div>

          {media && (
            <div className="flex gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                {media.image_item_id ? <img src={onedriveSrc(media.image_item_id)} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-2xl">🖼️</span>}
              </div>
              <div className="text-xs font-bold text-slate-600 space-y-0.5 min-w-0">
                <p className="text-sm font-black text-slate-800">{media.title}</p>
                <p>{media.subject || "—"} · {media.grade_level || "—"} · หน่วย {media.unit_no || "—"} / สื่อ {media.media_no || "—"}</p>
                <p>กลุ่มสาระฯ: {group || "—"} · ครู: {displayName(owner)}</p>
                <p>คลังแผน: {plan ? planLabel(plan) : "—"}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>วันที่ใช้สื่อ *</label>
              <input type="date" value={usedDate} onChange={e => setUsedDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>ระดับชั้นที่ใช้</label>
              <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className={inp}>
                <option value="">—</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>จำนวนนักเรียน</label>
              <input type="number" min={0} value={studentCount} onChange={e => setStudentCount(e.target.value)} className={inp} />
            </div>
          </div>

          <div>
            <label className={lbl}>จุดประสงค์/เนื้อหาที่ใช้สื่อ</label>
            <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={2} className={inp + " resize-none font-normal"} />
          </div>
          <div>
            <label className={lbl}>วิธีการใช้สื่อ *</label>
            <textarea value={usageMethod} onChange={e => setUsageMethod(e.target.value)} rows={3} className={inp + " resize-none font-normal"} />
          </div>
          <div>
            <label className={lbl}>ผลการใช้สื่อ *</label>
            <textarea value={results} onChange={e => setResults(e.target.value)} rows={3} className={inp + " resize-none font-normal"} />
          </div>
          <div>
            <label className={lbl}>ปัญหา/ข้อเสนอแนะ</label>
            <textarea value={problems} onChange={e => setProblems(e.target.value)} rows={2} className={inp + " resize-none font-normal"} />
          </div>

          <div>
            <label className={lbl}>รูปภาพการใช้สื่อ * (1–{MAX_REPORT_IMAGES} รูป · อัปขึ้น OneDrive)</label>
            <div className="flex gap-3 flex-wrap">
              {images.map((im, idx) => (
                <div key={im.item_id} className="relative w-28 h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <img src={im.preview} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setZoom(im.preview)} />
                  {im.uploading && <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white animate-pulse">⏳</span>}
                  {!im.uploading && (
                    <button onClick={() => setImages(a => a.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-red-600 text-xs font-black">✕</button>
                  )}
                </div>
              ))}
              {images.length < MAX_REPORT_IMAGES && (
                <label className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 text-xs font-black cursor-pointer hover:bg-slate-100">
                  <span className="text-2xl">＋</span>แนบรูป
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addImage(f); }} />
                </label>
              )}
            </div>
            {media?.unit_no && media.media_no && (
              <p className="text-[10px] text-slate-400 font-bold mt-1.5">
                📁 {MEDIA_REPORT_ROOT}/{group || "ไม่ระบุกลุ่มสาระ"}/{displayName(owner)}/{media.unit_no}_{media.media_no}_ใช้#
              </p>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={saving || images.some(i => i.uploading)}
            className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-50">
            {saving ? "⏳ กำลังบันทึก..." : "💾 บันทึกรายงาน"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportDetailModal({ report, canEdit, plan, onEdit, onDelete, onClose }: {
  report: MediaReport; canEdit: boolean; plan?: LessonPlan;
  onEdit: () => void; onDelete: () => Promise<void>; onClose: () => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const m = report.media;
  const field = (label: string, v?: string | number | null) => (
    <div><p className="text-xs font-black text-slate-400 uppercase">{label}</p><p className="font-bold text-slate-700 whitespace-pre-wrap">{v || v === 0 ? v : "—"}</p></div>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-600 px-6 py-4 shrink-0">
          <p className="text-emerald-100 text-xs font-bold">รายงานการใช้สื่อ · ปีการศึกษา {report.academic_year}</p>
          <h3 className="text-lg font-black text-white leading-snug">{m?.title ?? "(สื่อถูกลบแล้ว)"}</h3>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {field("ครู", displayName(report.teacher))}
            {field("กลุ่มสาระฯ", report.subject_group)}
            {field("หน่วย / เลขสื่อ", `${report.unit_no ?? "—"} / ${report.media_no ?? "—"}`)}
            {field("วันที่ใช้สื่อ", formatDate(report.used_date))}
            {field("ระดับชั้น", report.grade_level)}
            {field("จำนวนนักเรียน", report.student_count)}
            {field("คลังแผน", plan ? planLabel(plan) : undefined)}
          </div>
          {field("จุดประสงค์/เนื้อหา", report.objective)}
          {field("วิธีการใช้สื่อ", report.usage_method)}
          {field("ผลการใช้สื่อ", report.results)}
          {field("ปัญหา/ข้อเสนอแนะ", report.problems)}
          {(report.images ?? []).length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {(report.images ?? []).map(im => (
                <img key={im.item_id} src={onedriveSrc(im.item_id)} alt={im.name}
                  className="w-40 h-40 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                  onClick={() => setZoom(onedriveSrc(im.item_id))} />
              ))}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4 shrink-0">
          {canEdit && (
            <button disabled={deleting}
              onClick={async () => { if (confirm("ลบรายงานนี้? (ลบแล้วจะทำรายงานใหม่ของสื่อนี้ในปีนี้ได้)")) { setDeleting(true); await onDelete(); setDeleting(false); } }}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm disabled:opacity-50">
              {deleting ? "⏳" : "🗑️ ลบ"}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ปิด</button>
          {canEdit && <button onClick={onEdit} className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm">✏️ แก้ไข</button>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── รายงานการใช้สื่อ: หน้ารวม ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ReportsView({ items, reports, user, isAdmin, currentYear, year, setYear, onCreate, onOpen }: {
  items: MediaItem[]; reports: MediaReport[]; user: UserProfile; isAdmin: boolean;
  currentYear: number; year: number; setYear: (y: number) => void;
  onCreate: (mediaId?: string) => void; onOpen: (r: MediaReport) => void;
}) {
  const [scope, setScope] = useState<"mine" | "all">(isAdmin ? "all" : "mine");
  const years = useMemo(() => {
    const s = new Set<number>([currentYear, ...reports.map(r => r.academic_year)]);
    return [...s].sort((a, b) => b - a);
  }, [reports, currentYear]);

  const scopedItems = scope === "mine" ? items.filter(i => i.owner_id === user.id) : items;
  const yearReports = reports.filter(r => r.academic_year === year && (scope === "all" || r.teacher_id === user.id));
  const reportedIds = new Set(yearReports.map(r => r.media_id));
  const pending = scopedItems.filter(i => !reportedIds.has(i.id) && i.status !== "เลิกใช้งาน");
  const canActOn = (i: MediaItem) => isAdmin || i.owner_id === user.id;
  const total = scopedItems.filter(i => i.status !== "เลิกใช้งาน").length;
  const pct = total ? Math.round((yearReports.length / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-black text-slate-500 mb-1">ปีการศึกษา</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {(["mine", "all"] as const).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black ${scope === s ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
              {s === "mine" ? "👤 ของฉัน" : "👥 ทุกคน"}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-xs font-black text-slate-600 mb-1">ทำรายงานแล้ว {yearReports.length} / {total} สื่อ ({pct}%)</p>
          <div className="bg-slate-100 rounded-full h-3 overflow-hidden"><div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {year === currentYear && pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="font-black text-amber-800 text-sm mb-2">⏳ สื่อที่ยังไม่มีรายงานปี {year} ({pending.length})</h3>
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
            {pending.map(i => (
              <div key={i.id} className="flex items-center gap-2 bg-white rounded-xl border border-amber-100 px-3 py-1.5">
                <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                  {i.image_item_id ? <img src={onedriveSrc(i.image_item_id)} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300">🖼️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-700 truncate">{i.title}</p>
                  <p className="text-[10px] text-slate-400 font-bold truncate">{i.subject || "—"} · {i.grade_level || "—"} · {displayName(i.owner)}</p>
                </div>
                {canActOn(i) && (
                  <button onClick={() => onCreate(i.id)} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black shrink-0">📝 ทำรายงาน</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-slate-50 text-[11px] font-black text-slate-500 text-left">
              <th className="px-3 py-2">สื่อ</th><th className="px-3 py-2">กลุ่มสาระฯ</th><th className="px-3 py-2">ครู</th>
              <th className="px-3 py-2">หน่วย/สื่อ</th><th className="px-3 py-2">วันที่ใช้</th><th className="px-3 py-2">ชั้น</th><th className="px-3 py-2">รูป</th>
            </tr>
          </thead>
          <tbody>
            {yearReports.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400 font-bold">ยังไม่มีรายงานในปีการศึกษา {year}</td></tr>
            )}
            {yearReports.map(r => (
              <tr key={r.id} onClick={() => onOpen(r)} className="border-t border-slate-100 hover:bg-emerald-50/50 cursor-pointer">
                <td className="px-3 py-2 font-black text-slate-800 max-w-[260px] truncate">{r.media?.title ?? "(สื่อถูกลบแล้ว)"}</td>
                <td className="px-3 py-2 text-xs font-bold text-slate-600">{r.subject_group || "—"}</td>
                <td className="px-3 py-2 text-xs font-bold text-slate-600">{displayName(r.teacher)}</td>
                <td className="px-3 py-2 text-xs font-bold text-slate-600">{r.unit_no || "—"}/{r.media_no || "—"}</td>
                <td className="px-3 py-2 text-xs font-bold text-slate-600">{formatDate(r.used_date)}</td>
                <td className="px-3 py-2 text-xs font-bold text-slate-600">{r.grade_level || "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {(r.images ?? []).slice(0, 3).map(im => (
                      <img key={im.item_id} src={onedriveSrc(im.item_id)} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-200" loading="lazy" />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dashboard (Admin Summary) — วางทับ DashboardSummary เดิมทั้งตัว ───────────
// ══════════════════════════════════════════════════════════════════════════════

// ดึงข้อมูลทั้งตาราง (Supabase จำกัด 1,000 แถว/ครั้ง — timetable_entries อาจเกิน)
async function fetchAllRows(table: string, select: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabase.from(table) as any).select(select).range(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

type RegRow = { teacher: UserProfile | undefined; id: string; taught: string[]; registered: string[]; missing: string[] };
type PanelKey = "regPending" | "reportDone" | "reportPending" | null;

function DashboardSummary({ items, teachers, reports, year, onSelectOwner }: {
  items: MediaItem[]; teachers: UserProfile[]; reports: MediaReport[]; year: number;
  onSelectOwner: (ownerId: string) => void;
}) {
  const [teaching, setTeaching] = useState<Map<string, Set<string>>>(new Map()); // teacherId → ชื่อวิชาที่สอน
  const [loadingTeach, setLoadingTeach] = useState(true);
  const [panel, setPanel] = useState<PanelKey>(null);

  // ── ตารางสอน → วิชาที่ครูแต่ละคนสอนจริง ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await fetchAllRows("timetable_entries", "subject_id, teacher_id, teacher_id_2");
      const subjects = await fetchAllRows("subjects", "id,name_th");
      const nameById = new Map<string, string>();
      subjects.forEach(s => { if (s.name_th) nameById.set(s.id, s.name_th); });
      const map = new Map<string, Set<string>>();
      entries.forEach(e => {
        const name = nameById.get(e.subject_id);
        if (!name) return;
        [e.teacher_id, e.teacher_id_2].forEach(tid => {
          if (!tid) return;
          if (!map.has(tid)) map.set(tid, new Set());
          map.get(tid)!.add(name);
        });
      });
      if (!cancelled) { setTeaching(map); setLoadingTeach(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const teacherById = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const byName = (a: { teacher?: UserProfile }, b: { teacher?: UserProfile }) =>
    displayName(a.teacher).localeCompare(displayName(b.teacher), "th");

  // ── 1) การลงทะเบียนสื่อรายวิชา ──
  const regRows: RegRow[] = useMemo(() => {
    return [...teaching.entries()].map(([id, subs]) => {
      const taught = [...subs].sort((a, b) => a.localeCompare(b, "th"));
      const have = new Set(items.filter(i => i.owner_id === id && i.subject).map(i => i.subject!));
      const registered = taught.filter(s => have.has(s));
      const missing = taught.filter(s => !have.has(s));
      return { teacher: teacherById.get(id), id, taught, registered, missing };
    }).sort((a, b) => b.missing.length - a.missing.length || byName(a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teaching, items, teacherById]);
  const regPendingRows = regRows.filter(r => r.missing.length > 0);
  const regCompleteCount = regRows.length - regPendingRows.length;

  // รายวิชาที่ยังไม่มีสื่อเลย (ทั้งโรงเรียน)
  const subjectsNoMedia = useMemo(() => {
    const subjTeachers = new Map<string, string[]>();
    teaching.forEach((subs, tid) => subs.forEach(s => {
      if (!subjTeachers.has(s)) subjTeachers.set(s, []);
      subjTeachers.get(s)!.push(tid);
    }));
    const withMedia = new Set(items.map(i => i.subject).filter(Boolean) as string[]);
    return [...subjTeachers.entries()]
      .filter(([s]) => !withMedia.has(s))
      .map(([s, tids]) => ({ subject: s, teachers: tids.map(t => displayName(teacherById.get(t))) }))
      .sort((a, b) => a.subject.localeCompare(b.subject, "th"));
  }, [teaching, items, teacherById]);

  // ── 2) รายงานการใช้สื่อ: ครูแต่ละคนต้องทำ ≥ 1 ชิ้น/ปีการศึกษา ──
  const teacherPool = useMemo(() => {
    const ids = new Set<string>([...teaching.keys()]);
    items.forEach(i => { if (i.owner_id) ids.add(i.owner_id); });
    return [...ids];
  }, [teaching, items]);
  const reportCountByTeacher = useMemo(() => {
    const m = new Map<string, number>();
    reports.filter(r => r.academic_year === year).forEach(r => {
      const tid = r.teacher_id ?? r.media?.owner_id;
      if (tid) m.set(tid, (m.get(tid) ?? 0) + 1);
    });
    return m;
  }, [reports, year]);
  const reportDone = teacherPool.filter(id => (reportCountByTeacher.get(id) ?? 0) >= 1)
    .map(id => ({ teacher: teacherById.get(id), id, n: reportCountByTeacher.get(id) ?? 0 })).sort(byName);
  const reportPending = teacherPool.filter(id => (reportCountByTeacher.get(id) ?? 0) < 1)
    .map(id => ({ teacher: teacherById.get(id), id })).sort(byName);

  // ── สถิติรวม ──
  const total = items.length;
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => map.set(i.media_type, (map.get(i.media_type) ?? 0) + 1));
    return Array.from(map.entries());
  }, [items]);
  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => map.set(i.status, (map.get(i.status) ?? 0) + 1));
    return Array.from(map.entries());
  }, [items]);
  const bySubject = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => { const k = i.subject || "ไม่ระบุวิชา"; map.set(k, (map.get(k) ?? 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [items]);
  const byGrade = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => { const k = i.grade_level || "ไม่ระบุชั้น"; map.set(k, (map.get(k) ?? 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => GRADE_LEVELS.indexOf(a[0]) - GRADE_LEVELS.indexOf(b[0]));
  }, [items]);

  // ── 3) ผู้ลงทะเบียนมากที่สุด: แยกสื่อดิจิทัล (ฟ้า) / สื่ออุปกรณ์ (ชมพู) ──
  const byOwner = useMemo(() => {
    const map = new Map<string, { digital: number; equip: number; other: number }>();
    items.forEach(i => {
      if (!i.owner_id) return;
      const c = map.get(i.owner_id) ?? { digital: 0, equip: 0, other: 0 };
      if (i.media_type === "สื่อดิจิทัล") c.digital++;
      else if (i.media_type === "สื่ออุปกรณ์") c.equip++;
      else c.other++;
      map.set(i.owner_id, c);
    });
    return [...map.entries()]
      .map(([id, c]) => ({ id, owner: teacherById.get(id), ...c, count: c.digital + c.equip + c.other }))
      .sort((a, b) => b.count - a.count);
  }, [items, teacherById]);

  const maxSubject = Math.max(1, ...bySubject.map(([, v]) => v));
  const maxGrade = Math.max(1, ...byGrade.map(([, v]) => v));
  const maxOwner = Math.max(1, ...byOwner.map(o => o.count));

  const cardBase = "rounded-2xl p-4 text-center border-2 transition-all w-full";
  const toggle = (k: Exclude<PanelKey, null>) => setPanel(p => (p === k ? null : k));
  const ring = (k: PanelKey) => (panel === k ? " ring-4 ring-offset-1" : " hover:-translate-y-0.5 hover:shadow-md");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-800">📊 แดชบอร์ดคลังสื่อการสอน</h2>
        <p className="text-slate-400 text-sm">ภาพรวมสื่อการสอนและอุปกรณ์ทั้งโรงเรียน · ปีการศึกษา {year}</p>
      </div>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-blue-600">{total}</div>
          <div className="text-slate-400 text-[10px] font-bold">รายการสื่อทั้งหมด</div>
        </div>

        {/* ★ ครูลงทะเบียนสื่อครบทุกวิชาที่สอน (กดดูรายชื่อ) */}
        <button onClick={() => toggle("regPending")}
          className={`${cardBase} bg-indigo-50 border-indigo-200 text-indigo-700 ring-indigo-300${ring("regPending")}`}>
          <div className="text-3xl font-black">{loadingTeach ? "…" : regCompleteCount}<span className="text-base opacity-50">/{loadingTeach ? "…" : regRows.length}</span></div>
          <div className="text-[10px] font-bold opacity-70">ครูลงทะเบียนสื่อครบทุกวิชา</div>
          <div className="text-[10px] font-black mt-0.5">{panel === "regPending" ? "▲ ซ่อน" : `▼ ยังไม่ครบ ${loadingTeach ? "…" : regPendingRows.length} คน`}</div>
        </button>

        {/* ★ ครูที่ทำรายงานการใช้สื่ออย่างน้อย 1 ชิ้น (กดดูรายชื่อ) */}
        <button onClick={() => toggle("reportPending")}
          className={`${cardBase} bg-emerald-50 border-emerald-200 text-emerald-700 ring-emerald-300${ring("reportPending")}`}>
          <div className="text-3xl font-black">{reportDone.length}<span className="text-base opacity-50">/{teacherPool.length}</span></div>
          <div className="text-[10px] font-bold opacity-70">ครูที่ทำรายงานการใช้สื่อครบ (≥1 ชิ้น) ปี {year}</div>
          <div className="text-[10px] font-black mt-0.5">{panel === "reportPending" ? "▲ ซ่อน" : `▼ ยังไม่ทำ ${reportPending.length} คน`}</div>
        </button>
        <button onClick={() => toggle("reportDone")}
          className={`${cardBase} bg-white border-emerald-200 text-emerald-700 ring-emerald-300${ring("reportDone")}`}>
          <div className="text-3xl font-black">{reports.filter(r => r.academic_year === year).length}</div>
          <div className="text-[10px] font-bold opacity-70">รายงานที่ส่งแล้ว (ชิ้น)</div>
          <div className="text-[10px] font-black mt-0.5">{panel === "reportDone" ? "▲ ซ่อน" : "▼ ดูรายชื่อที่ทำแล้ว"}</div>
        </button>

        {byType.map(([type, count]) => (
          <div key={type} className={`rounded-2xl p-4 text-center border-2 ${mediaTypeBadge(type)}`}>
            <div className="text-3xl font-black">{count}</div>
            <div className="text-[10px] font-bold opacity-70">{type}</div>
          </div>
        ))}
        {byStatus.map(([s, count]) => (
          <div key={s} className={`rounded-2xl p-4 text-center border-2 ${statusBadge(s)}`}>
            <div className="text-3xl font-black">{count}</div>
            <div className="text-[10px] font-bold opacity-70">{s}</div>
          </div>
        ))}
      </div>

      {/* ★ แผงรายชื่อ: ลงทะเบียนสื่อไม่ครบ */}
      {panel === "regPending" && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
          <h3 className="font-black text-indigo-800 text-sm mb-3">
            📚 ครูที่ยังลงทะเบียนสื่อไม่ครบทุกวิชาที่สอน ({regPendingRows.length} คน)
          </h3>
          {regPendingRows.length === 0 ? (
            <p className="text-sm font-bold text-emerald-600">🎉 ครูทุกคนลงทะเบียนสื่อครบทุกวิชาที่สอนแล้ว</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {regPendingRows.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-indigo-100 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => onSelectOwner(r.id)} className="text-sm font-black text-slate-800 hover:text-blue-600 hover:underline">
                      {displayName(r.teacher)}
                    </button>
                    <span className="text-[11px] font-bold text-slate-500">
                      สอน {r.taught.length} วิชา · ลงทะเบียน {r.registered.length} · <span className="text-red-600">ขาด {r.missing.length}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.missing.map(s => <span key={s} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {subjectsNoMedia.length > 0 && (
            <div className="mt-4">
              <h4 className="font-black text-indigo-800 text-xs mb-2">🚫 รายวิชาที่ยังไม่มีสื่อเลย ({subjectsNoMedia.length} วิชา)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                {subjectsNoMedia.map(s => (
                  <div key={s.subject} className="bg-white rounded-lg border border-indigo-100 px-3 py-1.5">
                    <p className="text-xs font-black text-slate-700">{s.subject}</p>
                    <p className="text-[10px] font-bold text-slate-400 truncate">{s.teachers.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ★ แผงรายชื่อ: ยังไม่ทำรายงาน */}
      {panel === "reportPending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="font-black text-amber-800 text-sm mb-3">⏳ ครูที่ยังไม่ได้ทำรายงานการใช้สื่อ ปีการศึกษา {year} ({reportPending.length} คน)</h3>
          {reportPending.length === 0 ? (
            <p className="text-sm font-bold text-emerald-600">🎉 ครูทุกคนทำรายงานครบแล้ว</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-80 overflow-y-auto pr-1">
              {reportPending.map(r => (
                <button key={r.id} onClick={() => onSelectOwner(r.id)}
                  className="text-left bg-white rounded-xl border border-amber-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-amber-100 truncate">
                  {displayName(r.teacher)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ★ แผงรายชื่อ: ทำรายงานแล้ว */}
      {panel === "reportDone" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <h3 className="font-black text-emerald-800 text-sm mb-3">✅ ครูที่ทำรายงานการใช้สื่อแล้ว ปีการศึกษา {year} ({reportDone.length} คน)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-80 overflow-y-auto pr-1">
            {reportDone.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-emerald-100 px-3 py-2 text-xs font-black text-slate-700 flex justify-between gap-2">
                <span className="truncate">{displayName(r.teacher)}</span>
                <span className="text-emerald-600 shrink-0">{r.n} ชิ้น</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-black text-slate-700 text-sm mb-4">📚 สื่อการสอนตามวิชา (10 อันดับแรก)</h3>
          <div className="space-y-2">
            {bySubject.map(([subject, count]) => (
              <div key={subject} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-bold text-slate-600 truncate">{subject}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(4, (count / maxSubject) * 100)}%` }}>
                    <span className="text-white text-[10px] font-black">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-black text-slate-700 text-sm mb-4">🏫 สื่อการสอนตามระดับชั้น</h3>
          <div className="space-y-2">
            {byGrade.map(([grade, count]) => (
              <div key={grade} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs font-bold text-slate-600 truncate">{grade}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(4, (count / maxGrade) * 100)}%` }}>
                    <span className="text-white text-[10px] font-black">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ★ ผู้ลงทะเบียนสื่อมากที่สุด — แยกสี + คลิกชื่อดูสื่อของครูคนนั้น */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h3 className="font-black text-slate-700 text-sm flex-1">👩‍🏫 ผู้ลงทะเบียนสื่อมากที่สุด <span className="text-slate-400 font-bold text-xs">(คลิกชื่อเพื่อดูสื่อของครู)</span></h3>
          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500"><span className="w-3 h-3 rounded bg-blue-500" /> สื่อดิจิทัล</span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500"><span className="w-3 h-3 rounded bg-pink-500" /> สื่ออุปกรณ์</span>
        </div>
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {byOwner.map(o => (
            <div key={o.id} className="flex items-center gap-3">
              <button onClick={() => onSelectOwner(o.id)} title="ดูสื่อของครูคนนี้"
                className="w-40 shrink-0 text-left text-xs font-bold text-slate-600 hover:text-blue-600 hover:underline truncate">
                {displayName(o.owner)}
              </button>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className="h-full rounded-full overflow-hidden flex" style={{ width: `${Math.max(8, (o.count / maxOwner) * 100)}%` }}>
                  {o.digital > 0 && (
                    <div className="bg-blue-500 h-full flex items-center justify-center" style={{ flex: o.digital }}>
                      <span className="text-white text-[10px] font-black">{o.digital}</span>
                    </div>
                  )}
                  {o.equip > 0 && (
                    <div className="bg-pink-500 h-full flex items-center justify-center" style={{ flex: o.equip }}>
                      <span className="text-white text-[10px] font-black">{o.equip}</span>
                    </div>
                  )}
                  {o.other > 0 && (
                    <div className="bg-slate-400 h-full flex items-center justify-center" style={{ flex: o.other }}>
                      <span className="text-white text-[10px] font-black">{o.other}</span>
                    </div>
                  )}
                </div>
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-black text-slate-500">{o.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Page ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function MediaLibraryPage() {
  const router = useRouter();
  const [user, setUser]           = useState<UserProfile | null>(null);
  const [teachers, setTeachers]   = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [items, setItems]         = useState<MediaItem[]>([]);
  const [reports, setReports]     = useState<MediaReport[]>([]);
  const [loading, setLoading]     = useState(true);

  const currentYear = academicYearOf();
  const [reportYear, setReportYear] = useState(currentYear);

  const [viewMode, setViewMode]   = useState<"gallery" | "mine" | "reports" | "dashboard">("gallery");
  const [search, setSearch]       = useState("");
  const [filterType, setFilterType]     = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterGrade, setFilterGrade]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOwner, setFilterOwner]   = useState("");
  const [mineOwnerId, setMineOwnerId] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  const [detailItem, setDetailItem]   = useState<MediaItem | null>(null);
  const [reportForm, setReportForm]   = useState<{ report?: MediaReport; mediaId?: string } | null>(null);
  const [reportDetail, setReportDetail] = useState<MediaReport | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const meta = authUser.user_metadata ?? {};
      const email = authUser.email || meta.email || "";

      let profileData: any = null;
      const { data: byAuthId } = await supabase.from("users")
        .select("id,title,first_name,last_name,full_name,email,role,position,department_id")
        .eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;
      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id,title,first_name,last_name,full_name,email,role,position,department_id")
          .eq("email", email).maybeSingle();
        profileData = byEmail;
      }
      if (!profileData) profileData = { id: authUser.id, email: authUser.email ?? "", role: "subject_teacher" };
      setUser(profileData);

      const { data: allUsers } = await supabase.from("users")
        .select("id,title,first_name,last_name,full_name,email,role,position,department_id")
        .order("first_name");
      const teacherList = ((allUsers ?? []) as any[]).map(t => ({ ...t, full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() }));
      setTeachers(teacherList);

      // กลุ่มสาระฯ + คลังแผน: ถ้าตารางไม่มี/อ่านไม่ได้ จะได้ [] และระบบยังใช้งานได้ (กรอกเอง)
      const { data: deptData } = await (supabase.from("departments") as any).select("*");
      setDepartments((deptData ?? []) as Department[]);
      const { data: planData } = await (supabase.from(LESSON_PLAN_TABLE) as any).select("*");
      setLessonPlans(((planData ?? []) as any[]).map(normPlan));

      await loadItems(teacherList);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = useCallback(async (usersOverride?: any[]) => {
    const users = (usersOverride ?? teachers) as any[];
    const userMap: Record<string, UserProfile> = {};
    users.forEach(u => { userMap[u.id] = u; });

    const { data } = await (supabase.from("media_items") as any)
      .select("*")
      .order("registered_date", { ascending: false });
    const rows = ((data ?? []) as MediaItem[]).map(r => ({ ...r, owner: r.owner_id ? userMap[r.owner_id] : undefined }));
    setItems(rows);

    const { data: rep } = await (supabase.from("media_usage_reports") as any)
      .select("*")
      .order("used_date", { ascending: false });
    const mediaMap: Record<string, MediaItem> = {};
    rows.forEach(r => { mediaMap[r.id] = r; });
    setReports(((rep ?? []) as MediaReport[]).map(r => ({
      ...r,
      media: mediaMap[r.media_id],
      teacher: r.teacher_id ? userMap[r.teacher_id] : undefined,
    })));
  }, [teachers]);

  useEffect(() => { if (!loading) loadItems(); /* eslint-disable-next-line */ }, [teachers.length]);

  // ── Save media (insert / update) ─────────────────────────────────────────
  async function handleSaveMedia(payloads: Record<string, any>[], isEdit: boolean): Promise<boolean> {
    if (isEdit) {
      const { id, ...rest } = payloads[0];
      const { error } = await (supabase.from("media_items") as any).update(rest).eq("id", id);
      if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return false; }
    } else {
      const { error } = await (supabase.from("media_items") as any).insert(payloads);
      if (error) {
        const dup = error.code === "23505" || /duplicate/i.test(error.message ?? "");
        alert("❌ บันทึกไม่สำเร็จ: " + (dup ? "เลขที่หน่วย/เลขสื่อซ้ำกับที่มีอยู่แล้ว กรุณาตรวจสอบ" : error.message));
        return false;
      }
    }
    await loadItems();
    setShowForm(false);
    setEditingItem(undefined);
    return true;
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("media_items").delete().eq("id", id);
    if (error) { alert("❌ ลบไม่สำเร็จ: " + error.message); return; }
    await loadItems();
    setDetailItem(null);
  }

  // ── Save report ──────────────────────────────────────────────────────────
  async function handleSaveReport(data: Record<string, any>, isEdit: boolean): Promise<boolean> {
    if (isEdit) {
      const { id, ...rest } = data;
      const { error } = await (supabase.from("media_usage_reports") as any).update(rest).eq("id", id);
      if (error) { alert("❌ บันทึกรายงานไม่สำเร็จ: " + error.message); return false; }
    } else {
      // ตรวจซ้ำฝั่ง client ก่อน (มี unique constraint ในฐานข้อมูลเป็นด่านสุดท้าย)
      if (reports.some(r => r.media_id === data.media_id && r.academic_year === data.academic_year)) {
        alert("❌ สื่อนี้มีรายงานในปีการศึกษานี้แล้ว (ทำได้ปีละ 1 ครั้งต่อ 1 สื่อ)"); return false;
      }
      const { id: _id, ...rest } = data;
      const { error } = await (supabase.from("media_usage_reports") as any).insert([rest]);
      if (error) {
        const dup = error.code === "23505";
        alert("❌ บันทึกรายงานไม่สำเร็จ: " + (dup ? "สื่อนี้มีรายงานในปีการศึกษานี้แล้ว" : error.message));
        return false;
      }
    }
    await loadItems();
    return true;
  }
  async function handleDeleteReport(id: string) {
    const { error } = await (supabase.from("media_usage_reports") as any).delete().eq("id", id);
    if (error) { alert("❌ ลบรายงานไม่สำเร็จ: " + error.message); return; }
    await loadItems();
    setReportDetail(null);
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดคลังสื่อการสอน...</div></div>;
  if (!user)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</p></div>;

  const isAdmin = ADMIN_ROLES.includes(user.role);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const subjectOptions = [...new Set(items.map(i => i.subject).filter(Boolean))] as string[];
  const reportedNow = new Set(reports.filter(r => r.academic_year === currentYear).map(r => r.media_id));

  const viewOwnerId = mineOwnerId ?? user.id;
  const baseItems = viewMode === "mine" ? items.filter(i => i.owner_id === viewOwnerId) : items;
  const filteredItems = baseItems.filter(i => {
    if (search && !`${i.title} ${i.subject ?? ""} ${i.source ?? ""} ${i.unit_no ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && i.media_type !== filterType) return false;
    if (filterSubject && i.subject !== filterSubject) return false;
    if (filterGrade && i.grade_level !== filterGrade) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterOwner && i.owner_id !== filterOwner) return false;
    return true;
  });

  function canEditItem(i: MediaItem) { return isAdmin || i.owner_id === user!.id; }
  function canEditReport(r: MediaReport) { return isAdmin || r.teacher_id === user!.id; }
  const tabBtn = (m: typeof viewMode, label: string) => (
       <button onClick={() => { setViewMode(m); if (m === "mine") setMineOwnerId(null); }}
         className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === m ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
         {label}
       </button>
     );

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {showForm && (
        <MediaGridModal
          item={editingItem} currentUser={user} isAdmin={isAdmin} teachers={teachers}
          departments={departments} lessonPlans={lessonPlans} existingItems={items}
          onSave={handleSaveMedia}
          onClose={() => { setShowForm(false); setEditingItem(undefined); }}
        />
      )}
      {detailItem && (
        <MediaDetailModal
          item={detailItem} canEdit={canEditItem(detailItem)}
          plan={lessonPlans.find(p => p.id === detailItem.lesson_plan_id)}
          report={reports.find(r => r.media_id === detailItem.id && r.academic_year === currentYear)}
          year={currentYear}
          onEdit={() => { setEditingItem(detailItem); setDetailItem(null); setShowForm(true); }}
          onDelete={() => handleDelete(detailItem.id)}
          onReport={() => { setReportForm({ mediaId: detailItem.id }); setDetailItem(null); }}
          onViewReport={() => {
            const r = reports.find(x => x.media_id === detailItem.id && x.academic_year === currentYear);
            setDetailItem(null);
            if (r) setReportDetail(r);
          }}
          onClose={() => setDetailItem(null)}
        />
      )}
      {reportForm && (
        <ReportFormModal
          report={reportForm.report} presetMediaId={reportForm.mediaId}
          currentUser={user} isAdmin={isAdmin} items={items} reports={reports} year={currentYear}
          departments={departments} lessonPlans={lessonPlans}
          onSave={handleSaveReport}
          onClose={() => setReportForm(null)}
        />
      )}
      {reportDetail && (
        <ReportDetailModal
          report={reportDetail} canEdit={canEditReport(reportDetail)}
          plan={lessonPlans.find(p => p.id === reportDetail.lesson_plan_id)}
          onEdit={() => { setReportForm({ report: reportDetail }); setReportDetail(null); }}
          onDelete={() => handleDeleteReport(reportDetail.id)}
          onClose={() => setReportDetail(null)}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">คลังสื่อการสอน</h1>
            <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต · {items.length} รายการ · ปีการศึกษา {currentYear}</p>
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            {tabBtn("gallery", "🖼️ ทั้งหมด")}
            {tabBtn("mine", "👤 ของฉัน")}
            {tabBtn("reports", "📝 รายงานการใช้สื่อ")}
            {isAdmin && tabBtn("dashboard", "📊 แดชบอร์ด")}
          </div>
          {viewMode === "reports" ? (
            <button onClick={() => setReportForm({})}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm">📝 เพิ่มรายงาน</button>
          ) : (
            <button onClick={() => { setEditingItem(undefined); setShowForm(true); }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">➕ ลงทะเบียนสื่อ</button>
          )}
        </div>
      </div>

      <main className="p-4 max-w-7xl mx-auto">
        {viewMode === "dashboard" && isAdmin ? (
          <DashboardSummary items={items} teachers={teachers} reports={reports} year={currentYear}
       onSelectOwner={(id) => { setMineOwnerId(id); setViewMode("mine"); }} />
        ) : viewMode === "reports" ? (
          <ReportsView
            items={items} reports={reports} user={user} isAdmin={isAdmin}
            currentYear={currentYear} year={reportYear} setYear={setReportYear}
            onCreate={(mediaId) => setReportForm({ mediaId })}
            onOpen={setReportDetail}
          />
        ) : (
          <div>
            {/* Filters */}
            {viewMode === "mine" && mineOwnerId && mineOwnerId !== user.id && (
       <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 mb-3 flex items-center gap-3 print:hidden">
         <p className="text-sm font-black text-blue-700 flex-1">
           👤 กำลังดูสื่อของ {displayName(teachers.find(t => t.id === mineOwnerId))}
         </p>
         <button onClick={() => setMineOwnerId(null)} className="px-3 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-black">
           กลับไปดูของฉัน
         </button>
       </div>
     )}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 print:hidden">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อสื่อ..."
                  className="col-span-2 sm:col-span-1 lg:col-span-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 focus:outline-none" />
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
                  <option value="">ทุกประเภท</option>
                  {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
                </select>
                <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
                  <option value="">ทุกวิชา</option>
                  {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
                  <option value="">ทุกระดับชั้น</option>
                  {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
                  <option value="">ทุกสถานะ</option>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                </select>
                {viewMode === "gallery" && (
                  <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
                    <option value="">ทุกคน</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
                  </select>
                )}
              </div>
            </div>

            <p className="text-slate-400 text-xs font-bold mb-3">พบ {filteredItems.length} รายการ</p>

            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
                <p className="text-4xl mb-3">📭</p>
                <p className="font-bold">ยังไม่มีสื่อการสอนในหมวดนี้</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredItems.map(item => (
                  <MediaCard key={item.id} item={item} reported={reportedNow.has(item.id)} onClick={() => setDetailItem(item)} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { font-size: 10px; }
        }
      `}</style>
    </div>
  );
}