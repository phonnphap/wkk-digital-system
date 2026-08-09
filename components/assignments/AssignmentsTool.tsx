"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* =========================================================================
   Types
   ========================================================================= */

type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number; avatar_url?: string };

type AssignmentType = "assignment" | "quiz" | "material" | "activity" | "exam";
type AssignmentStatus = "draft" | "published";
type SubmissionStatus = "not_submitted" | "pending_review" | "reviewed" | "needs_revision" | "failed";

type Assignment = {
  id: string;
  subject_section_id: string;
  title: string;
  description: string | null;
  type: AssignmentType;
  assigned_at: string;
  due_date: string | null;
  max_score: number;
  allow_weight: boolean;
  weight_percent: number | null;
  grading_criteria_note: string | null;
  status: AssignmentStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
};

type AssignmentAttachment = { id: string; assignment_id: string; kind: "file" | "link"; url: string; file_name?: string | null };
type AssignmentStudentLink = { id: string; assignment_id: string; student_id: string };
type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: SubmissionStatus;
  content: string | null;
  submitted_at: string | null;
  score: number | null;
  teacher_comment: string | null;
};

type TeacherSection = { id: string; label: string };

const TYPE_LABELS: Record<AssignmentType, string> = {
  assignment: "งาน/การบ้าน",
  quiz: "แบบทดสอบ",
  material: "เอกสารประกอบการเรียน",
  activity: "กิจกรรม",
  exam: "ข้อสอบ",
};

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  not_submitted: "ไม่มีงาน",
  pending_review: "รอตรวจ",
  reviewed: "ตรวจแล้ว",
  needs_revision: "ต้องแก้ไข",
  failed: "ไม่ผ่าน",
};

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  not_submitted: "bg-slate-100 text-slate-500",
  pending_review: "bg-amber-100 text-amber-700",
  reviewed: "bg-emerald-100 text-emerald-700",
  needs_revision: "bg-orange-100 text-orange-700",
  failed: "bg-rose-100 text-rose-700",
};

function DateTimeText({ iso }: { iso: string | null }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!iso) { setText("-"); return; }
    const d = new Date(iso);
    setText(d.toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  }, [iso]);
  return <span suppressHydrationWarning>{text || "-"}</span>;
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* =========================================================================
   Main component
   ========================================================================= */

type ViewMode = "list" | "create" | "detail";

export default function AssignmentsTool({
  sectionId,
  subjectId,
  students,
  currentUserId,
}: {
  sectionId: string;
  subjectId: string;
  students: Student[];
  currentUserId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [studentLinks, setStudentLinks] = useState<AssignmentStudentLink[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [view, setView] = useState<ViewMode>("list");
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: aRows } = await supabase
        .from("assignments")
        .select("*")
        .eq("subject_section_id", sectionId)
        .order("assigned_at", { ascending: false });
      setAssignments((aRows ?? []) as Assignment[]);

      const ids = (aRows ?? []).map((a: any) => a.id);
      if (ids.length > 0) {
        const [{ data: links }, { data: subs }] = await Promise.all([
          supabase.from("assignment_students").select("id, assignment_id, student_id").in("assignment_id", ids),
          supabase.from("assignment_submissions").select("id, assignment_id, student_id, status, content, submitted_at, score, teacher_comment").in("assignment_id", ids),
        ]);
        setStudentLinks((links ?? []) as AssignmentStudentLink[]);
        setSubmissions((subs ?? []) as Submission[]);
      } else {
        setStudentLinks([]);
        setSubmissions([]);
      }
    } catch {
      setAssignments([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const activeAssignment = useMemo(
    () => assignments.find(a => a.id === activeAssignmentId) ?? null,
    [assignments, activeAssignmentId]
  );

  function openDetail(id: string) {
    setActiveAssignmentId(id);
    setView("detail");
  }
  function openCreate() {
    setActiveAssignmentId(null);
    setView("create");
  }
  function backToList() {
    setActiveAssignmentId(null);
    setView("list");
    loadAll();
  }

  if (loading) {
    return <div className="text-center py-16 text-indigo-400 font-black animate-pulse">กำลังโหลดชิ้นงาน...</div>;
  }

  if (view === "create") {
    return (
      <AssignmentForm
        sectionId={sectionId}
        currentUserId={currentUserId}
        onCancel={backToList}
        onPublished={id => {
          openDetail(id);
          loadAll();
        }}
        onSavedDraft={() => backToList()}
      />
    );
  }

  if (view === "detail" && activeAssignment) {
    return (
      <AssignmentDetail
        assignment={activeAssignment}
        subjectId={subjectId}
        sectionId={sectionId}
        students={students}
        currentUserId={currentUserId}
        studentLinks={studentLinks.filter(l => l.assignment_id === activeAssignment.id)}
        submissions={submissions.filter(s => s.assignment_id === activeAssignment.id)}
        onBack={backToList}
        onRefresh={loadAll}
      />
    );
  }

  return (
    <AssignmentList
      assignments={assignments}
      students={students}
      studentLinks={studentLinks}
      submissions={submissions}
      onCreate={openCreate}
      onOpen={openDetail}
    />
  );
}

/* =========================================================================
   List view — การ์ดชิ้นงานเรียงตามวันที่มอบหมาย
   ========================================================================= */

function AssignmentList({
  assignments,
  students,
  studentLinks,
  submissions,
  onCreate,
  onOpen,
}: {
  assignments: Assignment[];
  students: Student[];
  studentLinks: AssignmentStudentLink[];
  submissions: Submission[];
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-black text-slate-800 text-lg">📌 มอบหมายงานในรายวิชา</h2>
          <p className="text-slate-400 text-xs font-bold">มอบหมายงานให้นักเรียน และดูความคืบหน้าของชิ้นงานได้ที่นี่</p>
        </div>
        <button
          onClick={onCreate}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow"
        >
          + สร้างชิ้นงาน
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="font-bold text-sm">ยังไม่มีชิ้นงานในวิชานี้ กด "สร้างชิ้นงาน" เพื่อเริ่มมอบหมายงาน</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {assignments.map(a => {
            const assignedIds = studentLinks.filter(l => l.assignment_id === a.id).map(l => l.student_id);
            const subsForA = submissions.filter(s => s.assignment_id === a.id);
            const submittedIds = new Set(subsForA.filter(s => s.status !== "not_submitted").map(s => s.student_id));
            const notSubmitted = assignedIds.filter(id => !submittedIds.has(id)).length;
            const pending = subsForA.filter(s => s.status === "pending_review").length;
            const done = subsForA.filter(s => s.status === "reviewed").length;

            return (
              <button
                key={a.id}
                onClick={() => onOpen(a.id)}
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black text-white shrink-0 ${
                      a.status === "draft" ? "bg-slate-300" : "bg-gradient-to-br from-indigo-500 to-blue-500"
                    }`}>
                      📄
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-800">{a.title}</p>
                        {a.status === "draft" && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black">แบบร่าง</span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black">{TYPE_LABELS[a.type]}</span>
                      </div>
                      <p className="text-slate-400 text-xs font-bold mt-0.5">
  มอบหมายเมื่อ <DateTimeText iso={a.assigned_at} />
  {a.due_date && <> · กำหนดส่ง <DateTimeText iso={a.due_date} /></>}
</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-center px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-sm font-black text-slate-700">{a.max_score}</p>
                      <p className="text-[9px] text-slate-400 font-bold">คะแนน</p>
                    </div>
                    <div className="text-center px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-100">
                      <p className="text-sm font-black text-rose-600">{notSubmitted}</p>
                      <p className="text-[9px] text-rose-400 font-bold">ไม่ได้ส่ง</p>
                    </div>
                    <div className="text-center px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100">
                      <p className="text-sm font-black text-amber-600">{pending}</p>
                      <p className="text-[9px] text-amber-400 font-bold">รอตรวจ</p>
                    </div>
                    <div className="text-center px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100">
                      <p className="text-sm font-black text-emerald-600">{done}</p>
                      <p className="text-[9px] text-emerald-400 font-bold">ตรวจแล้ว</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Create form — สร้างชิ้นงานใหม่
   ========================================================================= */

function AssignmentForm({
  sectionId,
  currentUserId,
  existing,
  onCancel,
  onPublished,
  onSavedDraft,
}: {
  sectionId: string;
  currentUserId: string;
  existing?: Assignment;
  onCancel: () => void;
  onPublished: (id: string) => void;
  onSavedDraft: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [type, setType] = useState<AssignmentType>(existing?.type ?? "assignment");
  const [assignedAt, setAssignedAt] = useState(toLocalInput(existing?.assigned_at ?? new Date().toISOString()));
  const [dueDate, setDueDate] = useState(toLocalInput(existing?.due_date ?? null));
  const [maxScore, setMaxScore] = useState(existing?.max_score ?? 10);
  const [allowWeight, setAllowWeight] = useState(existing?.allow_weight ?? false);
  const [weightPercent, setWeightPercent] = useState<number | "">(existing?.weight_percent ?? "");
  const [gradingNote, setGradingNote] = useState(existing?.grading_criteria_note ?? "");
  const [linkUrl, setLinkUrl] = useState("");
  const [links, setLinks] = useState<{ id?: string; url: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
const [previews, setPreviews] = useState<{ file: File; url: string; isImage: boolean }[]>([]);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<AssignmentAttachment[]>([]);

useEffect(() => {
  if (!existing) return;
  supabase
    .from("assignment_attachments")
    .select("*")
    .eq("assignment_id", existing.id)
    .then(({ data }) => {
      const rows = (data ?? []) as AssignmentAttachment[];
      setExistingAttachments(rows.filter(a => a.kind === "file"));
      setLinks(rows.filter(a => a.kind === "link").map(a => ({ id: a.id, url: a.url })));
    });
}, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

function addLink() {
  if (!linkUrl.trim()) return;
  setLinks(prev => [...prev, { url: linkUrl.trim() }]);
  setLinkUrl("");
}

async function removeLink(index: number) {
  const item = links[index];
  if (item.id) {
    if (!confirm("ลบลิงก์นี้ออกจากชิ้นงาน?")) return;
    try { await supabase.from("assignment_attachments").delete().eq("id", item.id); } catch {}
  }
  setLinks(prev => prev.filter((_, i) => i !== index));
}

function isImageFile(name?: string | null) {
  return !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

async function removeExistingAttachment(att: AssignmentAttachment) {
  if (!confirm(`ลบไฟล์ "${att.file_name || "ไฟล์นี้"}" ออกจากชิ้นงาน?`)) return;
  try {
    await supabase.from("assignment_attachments").delete().eq("id", att.id);
    setExistingAttachments(prev => prev.filter(a => a.id !== att.id));
  } catch (e: any) {
    alert("ลบไฟล์ไม่สำเร็จ: " + (e?.message ?? "unknown error"));
  }
}

  useEffect(() => {
  const next = files.map(f => ({
    file: f,
    url: URL.createObjectURL(f),
    isImage: f.type.startsWith("image/"),
  }));
  setPreviews(next);
  return () => next.forEach(p => URL.revokeObjectURL(p.url));
}, [files]);

function addFiles(list: FileList | null) {
  if (!list) return;
  setFiles(prev => [...prev, ...Array.from(list)]);
}
function removeFile(index: number) {
  setFiles(prev => prev.filter((_, i) => i !== index));
}

  useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    setTeacherEmail(data.user?.email ?? null);
  });
}, []);

  async function save(status: AssignmentStatus) {
    if (!title.trim()) {
      alert("กรุณาใส่ชื่องาน");
      return;
    }
    setSaving(status === "draft" ? "draft" : "publish");

    const payload = {
      subject_section_id: sectionId,
      title: title.trim(),
      description: description || null,
      type,
      assigned_at: assignedAt ? new Date(assignedAt).toISOString() : new Date().toISOString(),
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      max_score: Number(maxScore) || 0,
      allow_weight: allowWeight,
      weight_percent: allowWeight && weightPercent !== "" ? Number(weightPercent) : null,
      grading_criteria_note: allowWeight && gradingNote.trim() ? gradingNote.trim() : null,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      created_by: currentUserId || null,
    };

    try {
      let assignmentId = existing?.id ?? "";
      if (existing) {
        await supabase.from("assignments").update(payload).eq("id", existing.id);
        assignmentId = existing.id;
      } else {
        const { data, error } = await supabase.from("assignments").insert(payload).select().maybeSingle();
        if (error) throw error;
        assignmentId = data.id;
      }

      // แนบไฟล์ → อัปโหลดขึ้น OneDrive ของ "ครูที่สร้างชิ้นงาน" ผ่าน /api/upload-onedrive
      if (files.length > 0) {
        if (!teacherEmail) {
          alert("ไม่พบอีเมลของครูผู้สอน จึงไม่สามารถแนบไฟล์ขึ้น OneDrive ได้");
        } else {
          for (const f of files) {
            try {
              const fd = new FormData();
              fd.append("file", f);
              fd.append("account", teacherEmail);
              fd.append("path", `Assignments/${assignmentId}/${Date.now()}-${f.name}`);

              const res = await fetch("/api/upload-onedrive", { method: "POST", body: fd });
              const result = await res.json();

              if (result.ok && result.url) {
                await supabase.from("assignment_attachments").insert({
                  assignment_id: assignmentId,
                  kind: "file",
                  url: result.url,
                  file_name: result.fileName || f.name,
                });
              } else {
                alert(`แนบไฟล์ "${f.name}" ไม่สำเร็จ: ` + JSON.stringify(result.error ?? "unknown error"));
              }
            } catch (e: any) {
              alert(`แนบไฟล์ "${f.name}" ไม่สำเร็จ: ` + (e?.message ?? "unknown error"));
            }
          }
        }
      }
      // แนบลิงก์ — insert เฉพาะลิงก์ใหม่ที่ยังไม่มีในฐานข้อมูล
      const newLinks = links.filter(l => !l.id);
      if (newLinks.length > 0) {
        try {
          await supabase.from("assignment_attachments").insert(
            newLinks.map(l => ({ assignment_id: assignmentId, kind: "link" as const, url: l.url }))
          );
        } catch {}
      }

      if (status === "published") {
        onPublished(assignmentId);
      } else {
        onSavedDraft();
      }
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
      {/* Header แบบ sticky */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 sm:px-8 py-4 flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-lg sm:text-xl">
          {existing ? "แก้ไขชิ้นงาน" : "สร้างชิ้นงานใหม่"}
        </h2>
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-base font-black transition-colors"
        >
          ✕
        </button>
      </div>

      {/* เนื้อหาฟอร์ม — จำกัดความกว้างและจัดกึ่งกลาง ไม่ให้ชิดขอบจอ */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-6 pb-28">
        <div>
          <label className="text-xs font-black text-slate-500">ชื่องาน</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="เช่น ใบงานที่ 1: การบวกลบเลข"
            className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-black text-slate-500">คำอธิบาย</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="รายละเอียด/คำสั่งของชิ้นงาน"
            className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* แนบไฟล์ — ทำเป็นกล่อง dropzone แทน input ดิบๆ */}
          <div>
            <label className="text-xs font-black text-slate-500">แนบไฟล์ / รูปภาพ (แนบได้หลายไฟล์)</label>
            <label
              htmlFor="assignment-file-input"
              className="mt-1.5 flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-3.5 text-xs font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/40 cursor-pointer transition-colors"
            >
              <span className="text-base">📎</span>
              <span>คลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)</span>
            </label>
            <input
              id="assignment-file-input"
              type="file"
              multiple
              onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
              className="hidden"
            />

            {(existingAttachments.length > 0 || previews.length > 0) && (
  <div className="mt-2 grid grid-cols-3 gap-2">
    {existingAttachments.map(att => (
      <div key={att.id} className="relative rounded-xl border border-slate-200 overflow-hidden bg-white aspect-square">
        {isImageFile(att.file_name) ? (
          <img src={att.url} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
            <span className="text-xl">📄</span>
            <span className="text-[9px] font-bold text-slate-500 truncate w-full mt-1">{att.file_name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => removeExistingAttachment(att)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] flex items-center justify-center hover:bg-black/70"
        >
          ✕
        </button>
      </div>
    ))}
    {previews.map((p, i) => (
      <div key={i} className="relative rounded-xl border border-slate-200 overflow-hidden bg-white aspect-square">
        {p.isImage ? (
          <img src={p.url} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
            <span className="text-xl">📄</span>
            <span className="text-[9px] font-bold text-slate-500 truncate w-full mt-1">{p.file.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => removeFile(i)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] flex items-center justify-center hover:bg-black/70"
        >
          ✕
        </button>
      </div>
    ))}
  </div>
)}
          </div>

          {/* แนบลิงก์ */}
          <div>
            <label className="text-xs font-black text-slate-500">แนบลิงก์</label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none"
              />
              <button
                onClick={addLink}
                type="button"
                className="px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs shrink-0"
              >
                เพิ่ม
              </button>
            </div>
            {links.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {links.map((l, i) => (
  <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 rounded-full pl-3 pr-1.5 py-1 max-w-full">
    <span className="truncate max-w-[160px]">🔗 {l.url}</span>
    <button onClick={() => removeLink(i)} className="w-4 h-4 rounded-full bg-indigo-100 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center shrink-0">✕</button>
  </span>
))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-black text-slate-500">เลือกประเภทชิ้นงาน</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as AssignmentType)}
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none bg-white"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-slate-500">คะแนนเต็ม</label>
            <input
              type="number"
              value={maxScore}
              onChange={e => setMaxScore(Number(e.target.value))}
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-black text-slate-500">มอบหมายเมื่อ</label>
            <input
              type="datetime-local"
              value={assignedAt}
              onChange={e => setAssignedAt(e.target.value)}
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-black text-slate-500">กำหนดส่ง</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-2xl border-2 border-slate-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-slate-600">อนุญาตให้มีน้ำหนักชิ้นงาน</p>
            <button
              type="button"
              onClick={() => setAllowWeight(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${allowWeight ? "bg-indigo-500" : "bg-slate-200"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${allowWeight ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          {allowWeight && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-black text-slate-400">เปอร์เซ็นต์น้ำหนักของชิ้นงาน (ไม่บังคับ)</label>
                <input
                  type="number"
                  value={weightPercent}
                  onChange={e => setWeightPercent(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="เช่น 10"
                  className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-slate-400">เกณฑ์การให้คะแนน (ไม่บังคับ)</label>
                <input
                  value={gradingNote}
                  onChange={e => setGradingNote(e.target.value)}
                  placeholder="พิมพ์เกณฑ์ หรือเลือกจากที่ตั้งไว้"
                  className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer แบบ sticky — ปุ่มบันทึก */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-4 sm:px-8 py-3 z-10">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button
            onClick={() => save("draft")}
            disabled={saving !== null}
            className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm disabled:opacity-50"
          >
            {saving === "draft" ? "กำลังบันทึก..." : "บันทึกแบบร่าง"}
          </button>
          <button
            onClick={() => save("published")}
            disabled={saving !== null}
            className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow disabled:opacity-50"
          >
            {saving === "publish" ? "กำลังเผยแพร่..." : "เผยแพร่"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Detail view — แท็บ ชิ้นงาน / งานผู้เรียน / การมอบหมาย / มอบหมายให้รายวิชาอื่น
   ========================================================================= */

type DetailTab = "info" | "submissions" | "assign" | "cross";

function AssignmentDetail({
  assignment,
  subjectId,
  sectionId,
  students,
  currentUserId,
  studentLinks,
  submissions,
  onBack,
  onRefresh,
}: {
  assignment: Assignment;
  subjectId: string;
  sectionId: string;
  students: Student[];
  currentUserId: string;
  studentLinks: AssignmentStudentLink[];
  submissions: Submission[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  // ถ้าเพิ่งกดเผยแพร่มาใหม่ ๆ ให้เปิดแท็บ "การมอบหมาย" ไว้ก่อนเลย
  const [tab, setTab] = useState<DetailTab>(studentLinks.length === 0 ? "assign" : "submissions");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
  if (!confirm(`ต้องการลบชิ้นงาน "${assignment.title}" ใช่หรือไม่?\nการลบนี้ไม่สามารถย้อนกลับได้ และจะลบข้อมูลการส่งงาน/คะแนนของนักเรียนทั้งหมดที่ผูกกับชิ้นงานนี้ด้วย`)) return;
  setDeleting(true);
  try {
    // ลบข้อมูลที่เกี่ยวข้องก่อน เผื่อ DB ยังไม่ได้ตั้ง ON DELETE CASCADE
    await supabase.from("assignment_submissions").delete().eq("assignment_id", assignment.id);
    await supabase.from("assignment_students").delete().eq("assignment_id", assignment.id);
    await supabase.from("assignment_attachments").delete().eq("assignment_id", assignment.id);
    await supabase.from("assignment_cross_sections").delete().eq("source_assignment_id", assignment.id);
    await supabase.from("assignments").delete().eq("id", assignment.id);
    onBack();
  } catch (e: any) {
    alert("ลบชิ้นงานไม่สำเร็จ: " + (e?.message ?? "unknown error"));
  }
  setDeleting(false);
}

  const DETAIL_TABS: { key: DetailTab; label: string }[] = [
    { key: "info", label: "ชิ้นงาน" },
    { key: "submissions", label: "งานผู้เรียน" },
    { key: "assign", label: "การมอบหมาย" },
    { key: "cross", label: "มอบหมายให้รายวิชาอื่น" },
  ];

  if (editing) {
    return (
      <AssignmentForm
        sectionId={sectionId}
        currentUserId={currentUserId}
        existing={assignment}
        onCancel={() => setEditing(false)}
        onPublished={() => { setEditing(false); onRefresh(); }}
        onSavedDraft={() => { setEditing(false); onRefresh(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 truncate">{assignment.title}</p>
          <p className="text-slate-400 text-xs font-bold">
  {assignment.status === "draft" ? "แบบร่าง" : <>เผยแพร่แล้ว · <DateTimeText iso={assignment.published_at} /></>}
</p>
        </div>
        <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-xs">✏️ แก้ไขชิ้นงาน</button>
      </div>

      <div className="flex items-center gap-2">
  <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-xs">✏️ แก้ไขชิ้นงาน</button>
  <button onClick={handleDelete} disabled={deleting} className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-xs disabled:opacity-50">
    {deleting ? "กำลังลบ..." : "🗑️ ลบชิ้นงาน"}
  </button>
</div>

      <div className="flex gap-1 bg-white rounded-xl border border-slate-100 p-1 overflow-x-auto">
        {DETAIL_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-indigo-500 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && <AssignmentInfoTab assignment={assignment} />}
      {tab === "submissions" && (
        <SubmissionsTab
          assignment={assignment}
          students={students.filter(s => studentLinks.some(l => l.student_id === s.id))}
          submissions={submissions}
          currentUserId={currentUserId}
          onChanged={onRefresh}
        />
      )}
      {tab === "assign" && (
        <AssignTab
          assignmentId={assignment.id}
          students={students}
          studentLinks={studentLinks}
          currentUserId={currentUserId}
          onChanged={onRefresh}
        />
      )}
      {tab === "cross" && (
        <CrossSectionTab assignment={assignment} subjectId={subjectId} sectionId={sectionId} currentUserId={currentUserId} />
      )}
    </div>
  );
}

function AssignmentInfoTab({ assignment }: { assignment: Assignment }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <InfoBox label="ประเภท" value={TYPE_LABELS[assignment.type]} />
  <InfoBox label="คะแนนเต็ม" value={String(assignment.max_score)} />
  <InfoBox label="มอบหมายเมื่อ" value={<DateTimeText iso={assignment.assigned_at} />} />
  <InfoBox label="กำหนดส่ง" value={<DateTimeText iso={assignment.due_date} />} />
</div>
      {assignment.allow_weight && (
        <div className="grid grid-cols-2 gap-3">
          <InfoBox label="น้ำหนักชิ้นงาน" value={assignment.weight_percent ? `${assignment.weight_percent}%` : "-"} />
          <InfoBox label="เกณฑ์การให้คะแนน" value={assignment.grading_criteria_note || "-"} />
        </div>
      )}
      <div>
        <p className="text-xs font-black text-slate-400 mb-1">คำอธิบาย</p>
        <p className="text-sm font-bold text-slate-600 whitespace-pre-wrap">{assignment.description || "ไม่มีคำอธิบายเพิ่มเติม"}</p>
      </div>
    </div>
  );
}
function InfoBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-700 mt-0.5">{value}</p>
    </div>
  );
}

/* --------- แท็บ งานผู้เรียน (ตรวจงาน/ให้คะแนน) --------- */

function SubmissionsTab({
  assignment,
  students,
  submissions,
  currentUserId,
  onChanged,
}: {
  assignment: Assignment;
  students: Student[];
  submissions: Submission[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(students[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [scoreDraft, setScoreDraft] = useState<number | "">("");
  const [commentDraft, setCommentDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<SubmissionStatus>("pending_review");
  const [saving, setSaving] = useState(false);

  const filtered = students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));
  const selectedStudent = students.find(s => s.id === selectedId) ?? null;
  const selectedSub = submissions.find(s => s.student_id === selectedId) ?? null;

  useEffect(() => {
    setScoreDraft(selectedSub?.score ?? "");
    setCommentDraft(selectedSub?.teacher_comment ?? "");
    setStatusDraft(selectedSub?.status ?? "pending_review");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveGrade() {
    if (!selectedStudent) return;
    setSaving(true);
    const payload = {
      assignment_id: assignment.id,
      student_id: selectedStudent.id,
      status: statusDraft,
      score: scoreDraft === "" ? null : Number(scoreDraft),
      teacher_comment: commentDraft || null,
      graded_by: currentUserId || null,
      graded_at: new Date().toISOString(),
    };
    try {
      await supabase.from("assignment_submissions").upsert(payload, { onConflict: "assignment_id,student_id" });
    } catch {}
    setSaving(false);
    onChanged();
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหารายชื่อนักเรียน"
          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold mb-2 focus:border-indigo-400 focus:outline-none"
        />
        <div className="space-y-1 max-h-[480px] overflow-y-auto">
          {filtered.map(s => {
            const sub = submissions.find(x => x.student_id === s.id);
            const status = sub?.status ?? "not_submitted";
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full flex items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
                  selectedId === s.id ? "bg-indigo-50 border-2 border-indigo-300" : "border-2 border-transparent hover:bg-slate-50"
                }`}
              >
                {s.avatar_url ? (
                  <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-200 text-indigo-700 text-xs font-black flex items-center justify-center">{s.first_name[0]}</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-700 truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-[10px] text-slate-400 font-bold">เลขที่ {s.seat_number}</p>
                </div>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-slate-300 text-xs font-bold py-6">ไม่พบนักเรียน</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        {!selectedStudent ? (
          <p className="text-slate-300 font-bold text-sm text-center py-10">เลือกนักเรียนทางซ้ายเพื่อตรวจงาน</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {selectedStudent.avatar_url ? (
                <img src={selectedStudent.avatar_url} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-200 text-indigo-700 font-black flex items-center justify-center">{selectedStudent.first_name[0]}</div>
              )}
              <div>
                <p className="font-black text-slate-800">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                <p className="text-slate-400 text-xs font-bold">เลขที่ {selectedStudent.seat_number}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 min-h-[100px]">
              <p className="text-xs font-black text-slate-400 mb-1">งานที่ส่ง</p>
              {selectedSub?.content ? (
                <p className="text-sm font-bold text-slate-600 whitespace-pre-wrap">{selectedSub.content}</p>
              ) : (
                <p className="text-sm font-bold text-slate-300">นักเรียนไม่ได้อัปโหลดไฟล์ / ยังไม่ได้ส่งงาน</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-slate-500">คะแนน (เต็ม {assignment.max_score})</label>
                <input
                  type="number"
                  value={scoreDraft}
                  onChange={e => setScoreDraft(e.target.value === "" ? "" : Number(e.target.value))}
                  max={assignment.max_score}
                  className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500">สถานะ</label>
                <select
                  value={statusDraft}
                  onChange={e => setStatusDraft(e.target.value as SubmissionStatus)}
                  className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold bg-white focus:border-indigo-400 focus:outline-none"
                >
                  <option value="pending_review">รอตรวจ</option>
                  <option value="reviewed">ตรวจแล้ว</option>
                  <option value="needs_revision">ต้องแก้ไข</option>
                  <option value="failed">ไม่ผ่าน</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-black text-slate-500">คอมเมนต์ให้นักเรียน</label>
              <textarea
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                rows={3}
                className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold resize-none focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <button
              onClick={saveGrade}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกคะแนน"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------- แท็บ การมอบหมาย (checklist Assign All / รายคน / ช่วงเลขที่) --------- */

function AssignTab({
  assignmentId,
  students,
  studentLinks,
  currentUserId,
  onChanged,
}: {
  assignmentId: string;
  students: Student[];
  studentLinks: AssignmentStudentLink[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set(studentLinks.map(l => l.student_id)));
  const [rangeFrom, setRangeFrom] = useState<number | "">("");
  const [rangeTo, setRangeTo] = useState<number | "">("");
  const allAssigned = students.length > 0 && assignedIds.size === students.length;

  useEffect(() => {
    setAssignedIds(new Set(studentLinks.map(l => l.student_id)));
  }, [studentLinks]);

  async function toggleOne(studentId: string) {
    const isAssigned = assignedIds.has(studentId);
    try {
      if (isAssigned) {
        await supabase.from("assignment_students").delete().eq("assignment_id", assignmentId).eq("student_id", studentId);
      } else {
        await supabase.from("assignment_students").insert({ assignment_id: assignmentId, student_id: studentId, assigned_by: currentUserId || null });
      }
    } catch {}
    setAssignedIds(prev => {
      const next = new Set(prev);
      isAssigned ? next.delete(studentId) : next.add(studentId);
      return next;
    });
    onChanged();
  }

  async function toggleAll() {
    try {
      if (allAssigned) {
        await supabase.from("assignment_students").delete().eq("assignment_id", assignmentId);
        setAssignedIds(new Set());
      } else {
        const rows = students.map(s => ({ assignment_id: assignmentId, student_id: s.id, assigned_by: currentUserId || null }));
        await supabase.from("assignment_students").upsert(rows, { onConflict: "assignment_id,student_id" });
        setAssignedIds(new Set(students.map(s => s.id)));
      }
    } catch {}
    onChanged();
  }

  // มอบหมายทีละกลุ่ม: เลือกตามช่วงเลขที่ (seat_number) แล้วมอบหมายทั้งหมดในช่วงนั้น
  async function assignRange() {
    if (rangeFrom === "" || rangeTo === "") return;
    const targets = students.filter(s => s.seat_number >= Number(rangeFrom) && s.seat_number <= Number(rangeTo));
    if (targets.length === 0) return;
    try {
      const rows = targets.map(s => ({ assignment_id: assignmentId, student_id: s.id, assigned_by: currentUserId || null }));
      await supabase.from("assignment_students").upsert(rows, { onConflict: "assignment_id,student_id" });
      setAssignedIds(prev => {
        const next = new Set(prev);
        targets.forEach(s => next.add(s.id));
        return next;
      });
    } catch {}
    onChanged();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm font-black text-slate-700 cursor-pointer">
          <input type="checkbox" checked={allAssigned} onChange={toggleAll} className="w-4 h-4" />
          มอบหมายทั้งหมด ({assignedIds.size}/{students.length} คน)
        </label>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">มอบหมายทีละกลุ่ม (เลขที่)</span>
          <input type="number" placeholder="จาก" value={rangeFrom} onChange={e => setRangeFrom(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-16 border-2 border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center" />
          <span className="text-slate-300">-</span>
          <input type="number" placeholder="ถึง" value={rangeTo} onChange={e => setRangeTo(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-16 border-2 border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center" />
          <button onClick={assignRange} className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-xs">มอบหมาย</button>
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {students.map(s => {
          const isAssigned = assignedIds.has(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              {s.avatar_url ? (
                <img src={s.avatar_url} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-200 text-indigo-700 text-xs font-black flex items-center justify-center">{s.first_name[0]}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-700 truncate">{s.first_name} {s.last_name}</p>
                <p className="text-[11px] text-slate-400 font-bold">Number {s.seat_number} {!isAssigned && "(ยังไม่ได้มอบหมาย)"}</p>
              </div>
              <input type="checkbox" checked={isAssigned} onChange={() => toggleOne(s.id)} className="w-5 h-5" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------- แท็บ มอบหมายให้รายวิชาอื่น --------- */

function CrossSectionTab({
  assignment,
  subjectId,
  sectionId,
  currentUserId,
}: {
  assignment: Assignment;
  subjectId: string;
  sectionId: string;
  currentUserId: string;
}) {
  const [sections, setSections] = useState<TeacherSection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
  (async () => {
    try {
      // หาว่าครูคนนี้สอนวิชาไหนบ้าง จากตารางสอน (เช็คทั้ง teacher_id และ teacher_id_2 เพราะบางคาบมีครูคู่)
      const { data: entries } = await supabase
        .from("timetable_entries")
        .select("subject_id")
        .or(`teacher_id.eq.${currentUserId},teacher_id_2.eq.${currentUserId}`);

      const subjectIds = Array.from(new Set((entries ?? []).map((e: any) => e.subject_id).filter(Boolean)));
      if (subjectIds.length === 0) {
        setSections([]);
        setLoading(false);
        return;
      }

      const { data: mySubjects } = await supabase
        .from("subjects")
        .select("id, subject_code, name_th")
        .in("id", subjectIds);

      const { data: allSections } = await supabase
        .from("subject_sections")
        .select("id, subject_id, join_code")
        .in("subject_id", subjectIds);

      const list: TeacherSection[] = (allSections ?? [])
        .filter((sec: any) => sec.id !== sectionId)
        .map((sec: any) => {
          const subj = (mySubjects ?? []).find((s: any) => s.id === sec.subject_id);
          return { id: sec.id, label: subj ? `${subj.subject_code} · ${subj.name_th}` : sec.join_code };
        });
      setSections(list);
    } catch {
      setSections([]);
    }
    setLoading(false);
  })();
}, [currentUserId, sectionId]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirmAssign() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      for (const targetSectionId of selected) {
        const { data: cloned } = await supabase
          .from("assignments")
          .insert({
            subject_section_id: targetSectionId,
            title: assignment.title,
            description: assignment.description,
            type: assignment.type,
            assigned_at: assignment.assigned_at,
            due_date: assignment.due_date,
            max_score: assignment.max_score,
            allow_weight: assignment.allow_weight,
            weight_percent: assignment.weight_percent,
            grading_criteria_note: assignment.grading_criteria_note,
            status: "published",
            published_at: new Date().toISOString(),
            created_by: currentUserId || null,
          })
          .select()
          .maybeSingle();

        await supabase.from("assignment_cross_sections").insert({
          source_assignment_id: assignment.id,
          target_subject_section_id: targetSectionId,
          created_assignment_id: cloned?.id ?? null,
          created_by: currentUserId || null,
        });
      }
      setDone(true);
    } catch (e: any) {
      alert("มอบหมายไปวิชาอื่นไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setSaving(false);
  }

  if (loading) return <div className="text-center py-10 text-slate-300 font-bold text-sm">กำลังโหลดรายวิชา...</div>;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
      <p className="text-xs font-bold text-slate-400">เลือกวิชา/ห้องที่คุณสอน เพื่อคัดลอกชิ้นงานนี้ไปมอบหมายด้วย</p>
      {sections.length === 0 ? (
        <p className="text-center text-slate-300 font-bold text-sm py-8">ไม่พบวิชาอื่นที่คุณสอน</p>
      ) : (
        <div className="space-y-1">
          {sections.map(sec => (
            <label key={sec.id} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(sec.id)} onChange={() => toggle(sec.id)} className="w-4 h-4" />
              <span className="text-sm font-bold text-slate-700">{sec.label}</span>
            </label>
          ))}
        </div>
      )}
      <button
        onClick={confirmAssign}
        disabled={saving || selected.size === 0}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow disabled:opacity-50"
      >
        {saving ? "กำลังมอบหมาย..." : `มอบหมายให้ ${selected.size || ""} วิชาที่เลือก`}
      </button>
      {done && <p className="text-center text-emerald-500 font-black text-xs">✅ มอบหมายให้วิชาอื่นเรียบร้อยแล้ว</p>}
    </div>
  );
}