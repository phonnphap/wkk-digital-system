"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ══════════════════════════════════════════════════════════════════════════════
// ── Constants ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_ROLES = ["admin", "director", "deputy_director"]; // ผู้บริหาร/แอดมิน/ผู้ดูแลโครงการ

const GRADE_LEVELS = [
  "อ.1", "อ.2", "อ.3",
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
type MediaItem = {
  id: string;
  registered_date: string;        // วันที่ลงทะเบียน
  media_type: string;             // ประเภทสื่อ/อุปกรณ์
  title: string;                  // ชื่อสื่อ/รายละเอียด
  subject?: string;                // วิชา
  grade_level?: string;            // ระดับชั้น
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
// บัญชี OneDrive ปลายทาง — ต้องตรงกับ MICROSOFT_TARGET_EMAIL ฝั่งเซิร์ฟเวอร์ (lib/onedrive.ts) เสมอ
const ONEDRIVE_ACCOUNT = "academic@khienkhet.ac.th";

// รูปภาพ/ไฟล์ที่อัปโหลดขึ้น OneDrive แสดงผ่าน endpoint นี้เสมอ
// (proxy สตรีมเนื้อไฟล์จริงกลับมา ไม่ใช่ redirect ไปลิงก์ชั่วคราว จึงไม่มีวันหมดอายุ)
function onedriveSrc(itemId?: string) {
  return itemId ? `/api/onedrive-file?account=${encodeURIComponent(ONEDRIVE_ACCOUNT)}&itemId=${encodeURIComponent(itemId)}` : "";
}

// ★ ดึง "วิชา → ชุดระดับชั้น" ที่ครูคนนี้สอนอยู่จริงจากตารางสอน (timetable_entries)
// เพื่อให้เลือกชื่อวิชาได้เฉพาะวิชาที่ครูผู้ล็อกอิน (หรือผู้รับผิดชอบที่เลือก) สอนอยู่ และผูกระดับชั้นอัตโนมัติ
async function loadTeacherSubjectGradeMap(teacherId: string): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!teacherId) return map;
  const { data: rows } = await (supabase.from("timetable_entries") as any)
    .select("subject_id, classroom_id, teacher_id, teacher_id_2")
    .or(`teacher_id.eq.${teacherId},teacher_id_2.eq.${teacherId}`);
  const entries = (rows ?? []) as any[];
  if (entries.length === 0) return map;

  const subjectIds   = [...new Set(entries.map(e => e.subject_id))];
  const classroomIds = [...new Set(entries.map(e => e.classroom_id))];
  const [{ data: subjectsData }, { data: classroomsData }] = await Promise.all([
    supabase.from("subjects").select("id,name_th").in("id", subjectIds.length ? subjectIds : ["_none_"]),
    supabase.from("classrooms").select("id,grade_group").in("id", classroomIds.length ? classroomIds : ["_none_"]),
  ]);
  const subjectNameMap: Record<string, string> = {};
  (subjectsData ?? []).forEach((s: any) => { subjectNameMap[s.id] = s.name_th; });
  const classroomGradeMap: Record<string, string> = {};
  (classroomsData ?? []).forEach((c: any) => { classroomGradeMap[c.id] = c.grade_group; });

  entries.forEach(e => {
    const name  = subjectNameMap[e.subject_id];
    const grade = classroomGradeMap[e.classroom_id];
    if (!name) return;
    if (!map.has(name)) map.set(name, new Set());
    if (grade) map.get(name)!.add(grade);
  });
  return map;
}

// อัปโหลดไฟล์ไปยัง OneDrive ผ่าน endpoint กลางของโรงเรียน (ใช้ร่วมกับระบบลา/ปฏิทินกิจกรรม)
// ★ ใช้ field "path" (ไม่ใช่ "folder") เพราะ endpoint นี้ encode "folder" เป็น segment เดียว
// ถ้ามี "/" ใน folder จะถูก escape เป็น %2F แทนที่จะสร้างโฟลเดอร์ย่อยจริงๆ
// "path" จะ split ด้วย "/" แล้ว encode ทีละ segment ให้ถูกต้อง จึงใช้สร้างโครงสร้างโฟลเดอร์ซ้อนได้
async function uploadFileToOneDrive(file: File, kind: "images" | "files"): Promise<{
  itemId: string; name: string; webUrl: string; size: number; account: string;
}> {
  const subFolder = kind === "images" ? "รูปภาพ" : "ไฟล์สื่อแนบ";
  const safeName = file.name.replace(/[\\/:*?"<>|]/g, "_");
  const path = `คลังสื่อการสอน/${subFolder}/${Date.now()}_${safeName}`;

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
  // ★ ชื่อไฟล์และขนาดรู้อยู่แล้วจากฝั่ง client ก่อนอัปโหลด ไม่ต้องรอ endpoint ส่งกลับ
  return { itemId: data.itemId, name: file.name, webUrl: data.webUrl, size: file.size, account: data.account };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Media Form Modal (Add / Edit) ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MediaFormModal({ item, currentUser, isAdmin, teachers, onSave, onClose }: {
  item?: MediaItem; currentUser: UserProfile; isAdmin: boolean; teachers: UserProfile[];
  onSave: (d: Partial<MediaItem>) => Promise<void>;
  onClose: () => void;
}) {
  const [registeredDate, setRegisteredDate] = useState(item?.registered_date ?? new Date().toISOString().slice(0, 10));
  const [mediaType, setMediaType]     = useState(item?.media_type ?? MEDIA_TYPES[0].value);
  const [title, setTitle]             = useState(item?.title ?? "");
  const [subject, setSubject]         = useState(item?.subject ?? "");
  const [gradeLevel, setGradeLevel]   = useState(item?.grade_level ?? "");
  const [source, setSource]           = useState(item?.source ?? "");
  const [storageLocation, setStorageLocation] = useState(item?.storage_location ?? "");
  const [ownerId, setOwnerId]         = useState(item?.owner_id ?? currentUser.id);
  const [status, setStatus]           = useState(item?.status ?? STATUS_OPTIONS[0].value);
  const [note, setNote]               = useState(item?.note ?? "");

  // ── รูปภาพ: preview ทันทีแบบ local ก่อน แล้วอัปขึ้น OneDrive เบื้องหลัง ──
  const [imagePreview, setImagePreview] = useState(onedriveSrc(item?.image_item_id) || "");
  const [imageItemId, setImageItemId]   = useState(item?.image_item_id ?? "");
  const [imageName, setImageName]       = useState(item?.image_name ?? "");
  const [imageUploading, setImageUploading] = useState(false);

  // ── ไฟล์สื่อแนบ (เอกสาร/วิดีโอ/ไฟล์อื่นๆ) → OneDrive เช่นกัน ──
  const [attachmentItemId, setAttachmentItemId] = useState(item?.attachment_item_id ?? "");
  const [attachmentName, setAttachmentName]     = useState(item?.attachment_name ?? "");
  const [attachmentWebUrl, setAttachmentWebUrl] = useState(item?.attachment_web_url ?? "");
  const [attachmentSize, setAttachmentSize]     = useState(item?.attachment_size ?? 0);
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  const [loading, setLoading] = useState(false);

  // ── วิชาที่ผู้รับผิดชอบสอนอยู่จริง (ผูกจากตารางสอน) → ใช้กรองช่องวิชา + ผูกระดับชั้นอัตโนมัติ ──
  const [subjectGradeMap, setSubjectGradeMap] = useState<Map<string, Set<string>>>(new Map());
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingSubjects(true);
    loadTeacherSubjectGradeMap(ownerId).then(map => { if (!cancelled) { setSubjectGradeMap(map); setLoadingSubjects(false); } });
    return () => { cancelled = true; };
  }, [ownerId]);

  const availableSubjects = [...subjectGradeMap.keys()].sort();
  const availableGradesForSubject = subject && subjectGradeMap.has(subject)
    ? [...subjectGradeMap.get(subject)!].sort((a, b) => GRADE_LEVELS.indexOf(a) - GRADE_LEVELS.indexOf(b))
    : GRADE_LEVELS;

  // ★ เลือกวิชา → ผูกระดับชั้นอัตโนมัติ (ถ้าครูสอนวิชานี้ระดับเดียว เลือกให้ทันที)
  function handleSubjectChange(v: string) {
    setSubject(v);
    const grades = v && subjectGradeMap.has(v) ? [...subjectGradeMap.get(v)!] : [];
    if (grades.length === 1) setGradeLevel(grades[0]);
    else if (grades.length > 0 && !grades.includes(gradeLevel)) setGradeLevel("");
  }

  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none";
  const canPickOwner = isAdmin;

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImagePreview(URL.createObjectURL(f)); // ★ แสดงตัวอย่างภาพทันที ไม่ต้องรออัปโหลดเสร็จ
    setImageUploading(true);
    try {
      const result = await uploadFileToOneDrive(f, "images");
      setImageItemId(result.itemId);
      setImageName(result.name);
    } catch (err: any) {
      alert("⚠️ อัปโหลดรูปไป OneDrive ไม่สำเร็จ: " + err.message);
    } finally {
      setImageUploading(false);
    }
  }

  async function handleAttachmentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAttachmentName(f.name);
    setAttachmentSize(f.size);
    setAttachmentUploading(true);
    try {
      const result = await uploadFileToOneDrive(f, "files");
      setAttachmentItemId(result.itemId);
      setAttachmentName(result.name);
      setAttachmentWebUrl(result.webUrl);
      setAttachmentSize(result.size);
    } catch (err: any) {
      alert("⚠️ อัปโหลดไฟล์สื่อไป OneDrive ไม่สำเร็จ: " + err.message);
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim() || !mediaType) { alert("กรุณากรอกชื่อสื่อ/รายละเอียด และเลือกประเภท"); return; }
    if (imageUploading || attachmentUploading) { alert("กรุณารอให้อัปโหลดไฟล์ขึ้น OneDrive เสร็จก่อนบันทึก"); return; }
    setLoading(true);
    await onSave({
      id: item?.id,
      registered_date: registeredDate, media_type: mediaType, title: title.trim(),
      subject: subject.trim() || undefined, grade_level: gradeLevel || undefined,
      source: source.trim() || undefined, storage_location: storageLocation.trim() || undefined,
      owner_id: ownerId, status, note: note.trim() || undefined,
      image_item_id: imageItemId || undefined, image_name: imageName || undefined,
      attachment_item_id: attachmentItemId || undefined, attachment_name: attachmentName || undefined,
      attachment_web_url: attachmentWebUrl || undefined, attachment_size: attachmentSize || undefined,
    });
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 px-6 py-4">
          <h3 className="text-lg font-black text-white">{item ? "✏️ แก้ไขสื่อการสอน" : "➕ ลงทะเบียนสื่อการสอนใหม่"}</h3>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* รูปภาพ */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">รูปภาพ (อัปโหลดขึ้น OneDrive)</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden flex items-center justify-center shrink-0 relative">
                {imagePreview
                  ? <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  : <span className="text-slate-300 text-2xl">🖼️</span>}
                {imageUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-[10px] font-black animate-pulse">⏳</span>
                  </div>
                )}
              </div>
              <div>
                <input type="file" accept="image/*" onChange={handleImageFile} className="text-xs" />
                <p className={`text-[11px] font-bold mt-1 ${imageUploading ? "text-amber-500" : "text-emerald-600"}`}>
                  {imageUploading ? "⏳ กำลังอัปโหลดขึ้น OneDrive..." : imageItemId ? "✅ อัปโหลดขึ้น OneDrive แล้ว" : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">วันที่ลงทะเบียน *</label>
              <input type="date" value={registeredDate} onChange={e => setRegisteredDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ประเภทสื่อ/อุปกรณ์ *</label>
              <select value={mediaType} onChange={e => setMediaType(e.target.value)} className={inp}>
                {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ชื่อสื่อ/รายละเอียด *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="เช่น Power Point เรื่อง ..." className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                วิชา {loadingSubjects && <span className="text-slate-300 normal-case font-normal">(กำลังโหลด...)</span>}
              </label>
              {availableSubjects.length > 0 ? (
                <select value={subject} onChange={e => handleSubjectChange(e.target.value)} className={inp}>
                  <option value="">— เลือกวิชา —</option>
                  {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <div>
                  <input value={subject} onChange={e => handleSubjectChange(e.target.value)} placeholder="พิมพ์ชื่อวิชา" className={inp} />
                  {!loadingSubjects && (
                    <p className="text-[11px] text-amber-600 font-bold mt-1">⚠️ ไม่พบวิชาของผู้รับผิดชอบคนนี้ในตารางสอน กรุณาพิมพ์เอง</p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                ระดับชั้น {subject && subjectGradeMap.has(subject) && <span className="text-slate-400 normal-case font-normal">(ตามตารางสอน)</span>}
              </label>
              <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className={inp}>
                <option value="">— เลือกระดับชั้น —</option>
                {availableGradesForSubject.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">แหล่งที่มา/ผู้ผลิต</label>
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="เช่น ไฟล์ Power Point, ไฟล์ Canva" className={inp} />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">สถานที่จัดเก็บ</label>
            <input value={storageLocation} onChange={e => setStorageLocation(e.target.value)} placeholder="เช่น OneDrive กลุ่มสาระฯ, ตู้เก็บสื่อ ห้อง 3" className={inp} />
          </div>

          {/* ไฟล์สื่อแนบ */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">แนบไฟล์สื่อ (อัปโหลดขึ้น OneDrive)</label>
            <input type="file" onChange={handleAttachmentFile} className="text-xs" />
            {attachmentName && (
              <div className="mt-2 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-lg shrink-0">{attachmentUploading ? "⏳" : "📎"}</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{attachmentName}</p>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {attachmentUploading ? "กำลังอัปโหลดขึ้น OneDrive..." : `${formatFileSize(attachmentSize)} · อัปโหลดขึ้น OneDrive แล้ว`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ผู้รับผิดชอบ</label>
              {canPickOwner ? (
                <select value={ownerId} onChange={e => { setOwnerId(e.target.value); setSubject(""); setGradeLevel(""); }} className={inp}>
                  {teachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
                </select>
              ) : (
                <div className={inp + " bg-slate-100 text-slate-500"}>{displayName(currentUser)}</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">สถานะการใช้งาน</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inp}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm resize-none focus:border-blue-400 focus:outline-none" />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading || imageUploading || attachmentUploading}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳ กำลังบันทึก..." : (imageUploading || attachmentUploading) ? "⏳ กำลังอัปโหลดไฟล์..." : "💾 บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Media Detail Modal ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MediaDetailModal({ item, canEdit, onEdit, onDelete, onClose }: {
  item: MediaItem; canEdit: boolean;
  onEdit: () => void; onDelete: () => Promise<void>; onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="w-full h-56 bg-slate-100 overflow-hidden">
          {item.image_item_id
            ? <img src={onedriveSrc(item.image_item_id)} alt={item.title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-slate-300 text-5xl">🖼️</div>}
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-black px-2 py-1 rounded-lg border ${mediaTypeBadge(item.media_type)}`}>{item.media_type}</span>
            <span className={`text-xs font-black px-2 py-1 rounded-lg border ${statusBadge(item.status)}`}>{item.status}</span>
          </div>
          <h3 className="text-lg font-black text-slate-800 leading-snug">{item.title}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs font-black text-slate-400 uppercase">วิชา</p><p className="font-bold text-slate-700">{item.subject || "—"}</p></div>
            <div><p className="text-xs font-black text-slate-400 uppercase">ระดับชั้น</p><p className="font-bold text-slate-700">{item.grade_level || "—"}</p></div>
            <div><p className="text-xs font-black text-slate-400 uppercase">วันที่ลงทะเบียน</p><p className="font-bold text-slate-700">{formatDate(item.registered_date)}</p></div>
            <div><p className="text-xs font-black text-slate-400 uppercase">ผู้รับผิดชอบ</p><p className="font-bold text-slate-700">{displayName(item.owner)}</p></div>
            <div><p className="text-xs font-black text-slate-400 uppercase">แหล่งที่มา/ผู้ผลิต</p><p className="font-bold text-slate-700">{item.source || "—"}</p></div>
            <div><p className="text-xs font-black text-slate-400 uppercase">สถานที่จัดเก็บ</p><p className="font-bold text-slate-700">{item.storage_location || "—"}</p></div>
          </div>
          {item.attachment_item_id && (
            <a href={onedriveSrc(item.attachment_item_id)} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 hover:bg-blue-100 transition-all">
              <span className="text-lg">📎</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-700 truncate">{item.attachment_name}</p>
                <p className="text-[10px] text-blue-400 font-bold">{formatFileSize(item.attachment_size)} · เปิด/ดาวน์โหลดจาก OneDrive</p>
              </div>
            </a>
          )}
          {item.note && <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-600">💬 {item.note}</div>}
        </div>
        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          {canEdit && (
            <button onClick={async () => { if (confirm("ลบสื่อนี้ออกจากคลัง?")) { setDeleting(true); await onDelete(); setDeleting(false); } }}
              disabled={deleting}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm disabled:opacity-50">
              {deleting ? "⏳" : "🗑️ ลบ"}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ปิด</button>
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
function MediaCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="w-full h-32 bg-slate-100 overflow-hidden relative">
        {item.image_item_id
          ? <img src={onedriveSrc(item.image_item_id)} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-slate-300 text-3xl">🖼️</div>}
        {item.attachment_item_id && (
          <span className="absolute top-1.5 right-1.5 bg-white/90 rounded-md px-1.5 py-0.5 text-[10px] font-black text-slate-500">📎</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${mediaTypeBadge(item.media_type)}`}>{item.media_type}</span>
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${statusBadge(item.status)}`}>{item.status}</span>
        </div>
        <p className="font-black text-slate-800 text-sm leading-snug line-clamp-2 mb-1">{item.title}</p>
        {item.subject && <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${subjectColor(item.subject)} mb-1`}>{item.subject}</span>}
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold mt-1">
          <span>{item.grade_level || "—"}</span>
          <span className="truncate ml-1">{displayName(item.owner)}</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dashboard (Admin Summary) ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function DashboardSummary({ items, teachers }: { items: MediaItem[]; teachers: UserProfile[] }) {
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

  const byOwner = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => { if (i.owner_id) map.set(i.owner_id, (map.get(i.owner_id) ?? 0) + 1); });
    return Array.from(map.entries())
      .map(([id, count]) => ({ owner: teachers.find(t => t.id === id), count }))
      .sort((a, b) => b.count - a.count);
  }, [items, teachers]);

  const maxSubject = Math.max(1, ...bySubject.map(([, v]) => v));
  const maxGrade   = Math.max(1, ...byGrade.map(([, v]) => v));
  const maxOwner   = Math.max(1, ...byOwner.map(o => o.count));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-800">📊 แดชบอร์ดคลังสื่อการสอน</h2>
        <p className="text-slate-400 text-sm">ภาพรวมสื่อการสอนและอุปกรณ์ทั้งโรงเรียน</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-blue-600">{total}</div>
          <div className="text-slate-400 text-[10px] font-bold">รายการสื่อทั้งหมด</div>
        </div>
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-black text-slate-700 text-sm mb-4">👩‍🏫 ผู้ลงทะเบียนสื่อมากที่สุด</h3>
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {byOwner.map(({ owner, count }) => (
            <div key={owner?.id ?? Math.random()} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs font-bold text-slate-600 truncate">{displayName(owner)}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(4, (count / maxOwner) * 100)}%` }}>
                  <span className="text-white text-[10px] font-black">{count}</span>
                </div>
              </div>
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
  const [items, setItems]         = useState<MediaItem[]>([]);
  const [loading, setLoading]     = useState(true);

  const [viewMode, setViewMode]   = useState<"gallery" | "mine" | "dashboard">("gallery");
  const [search, setSearch]       = useState("");
  const [filterType, setFilterType]     = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterGrade, setFilterGrade]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOwner, setFilterOwner]   = useState("");

  const [showForm, setShowForm]   = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  const [detailItem, setDetailItem]   = useState<MediaItem | null>(null);

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

      await loadItems(teacherList);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = useCallback(async (usersOverride?: any[]) => {
    const { data } = await (supabase.from("media_items") as any)
      .select("*")
      .order("registered_date", { ascending: false });
    const rows = (data ?? []) as MediaItem[];
    const users = usersOverride ?? teachers;
    const userMap: Record<string, UserProfile> = {};
    (users as any[]).forEach(u => { userMap[u.id] = u; });
    setItems(rows.map(r => ({ ...r, owner: r.owner_id ? userMap[r.owner_id] : undefined })));
  }, [teachers]);

  useEffect(() => { if (!loading) loadItems(); /* eslint-disable-next-line */ }, [teachers.length]);

  // ── Save (insert / update) ───────────────────────────────────────────────
  async function handleSave(data: Partial<MediaItem>) {
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await (supabase.from("media_items") as any).update(rest).eq("id", id);
      if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return; }
    } else {
      const { error } = await (supabase.from("media_items") as any).insert([data]);
      if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return; }
    }
    await loadItems();
    setShowForm(false);
    setEditingItem(undefined);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("media_items").delete().eq("id", id);
    if (error) { alert("❌ ลบไม่สำเร็จ: " + error.message); return; }
    await loadItems();
    setDetailItem(null);
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดคลังสื่อการสอน...</div></div>;
  if (!user)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</p></div>;

  const isAdmin = ADMIN_ROLES.includes(user.role);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const subjectOptions = [...new Set(items.map(i => i.subject).filter(Boolean))] as string[];

  const baseItems = viewMode === "mine" ? items.filter(i => i.owner_id === user.id) : items;
  const filteredItems = baseItems.filter(i => {
    if (search && !`${i.title} ${i.subject ?? ""} ${i.source ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && i.media_type !== filterType) return false;
    if (filterSubject && i.subject !== filterSubject) return false;
    if (filterGrade && i.grade_level !== filterGrade) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterOwner && i.owner_id !== filterOwner) return false;
    return true;
  });

  function canEditItem(i: MediaItem) { return isAdmin || i.owner_id === user!.id; }

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {showForm && (
        <MediaFormModal
          item={editingItem} currentUser={user} isAdmin={isAdmin} teachers={teachers}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingItem(undefined); }}
        />
      )}
      {detailItem && (
        <MediaDetailModal
          item={detailItem} canEdit={canEditItem(detailItem)}
          onEdit={() => { setEditingItem(detailItem); setDetailItem(null); setShowForm(true); }}
          onDelete={() => handleDelete(detailItem.id)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">คลังสื่อการสอน</h1>
            <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต · {items.length} รายการ</p>
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            <button onClick={() => setViewMode("gallery")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "gallery" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
              🖼️ ทั้งหมด
            </button>
            <button onClick={() => setViewMode("mine")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "mine" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
              👤 ของฉัน
            </button>
            {isAdmin && (
              <button onClick={() => setViewMode("dashboard")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "dashboard" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                📊 แดชบอร์ด
              </button>
            )}
          </div>
          <button onClick={() => { setEditingItem(undefined); setShowForm(true); }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">➕ ลงทะเบียนสื่อ</button>
        </div>
      </div>

      <main className="p-4 max-w-7xl mx-auto">
        {viewMode === "dashboard" && isAdmin ? (
          <DashboardSummary items={items} teachers={teachers} />
        ) : (
          <div>
            {/* Filters */}
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
                  <MediaCard key={item.id} item={item} onClick={() => setDetailItem(item)} />
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