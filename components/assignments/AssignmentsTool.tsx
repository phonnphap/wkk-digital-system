"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  /* NOTE: new column — see migration SQL (assignments.rubric_id) */
  rubric_id?: string | null;
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
  is_late: boolean | null; 
};

type TeacherSection = { id: string; label: string };
type AnnouncementAttachment = {
  id: string;
  announcement_id: string;
  kind: "file" | "link";
  url: string;
  file_name?: string | null;
};

type Announcement = {
  id: string;
  subject_section_id: string;
  title: string;
  content: string | null;
  created_by: string | null;
  created_at: string;
  attachments?: AnnouncementAttachment[];
  creator?: { full_name: string | null; email: string } | null;
};

/* ---- NEW: rubric / announcement / import types ----
   These map to the tables added in the migration SQL. Adjust field
   names if your real schema differs. */

type SavedRubric = {
  id: string;
  subject_id: string;
  name: string;
  description: string | null;
  max_score: number;
};
type RubricLevel = { id: string; rubric_id: string; name: string; score: number; order_index: number };
type RubricCriterion = { id: string; rubric_id: string; name: string; weight: number; order_index: number };
type RubricCellNote = { id: string; criterion_id: string; level_id: string; description: string | null };
type SchoolTeacher = { id: string; email: string; full_name: string | null };
function teacherDisplayName(t: SchoolTeacher | undefined | null): string {
  if (!t) return "-";
  return (t.full_name && t.full_name.trim()) || t.email;
}
type ImportableSubjectCard = {
  subject_id: string;
  subject_section_id: string;
  subject_code: string;
  name_th: string;
  academic_year: number;
  semester: number;
  teacher_name: string;
  teacher_id: string;
  classroom_label: string;
};

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

// ตัดอักขระที่ OneDrive ห้ามใช้ในชื่อโฟลเดอร์/ไฟล์ออก (\ / : * ? " < > | และช่องว่างหัวท้าย)
function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "ไม่มีชื่อ";
}

// เช็คว่าไฟล์แนบเป็นไฟล์รูปภาพหรือไม่ จากนามสกุลไฟล์
function isImageFilename(name?: string | null): boolean {
  return !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

/* =========================================================================
   Main component
   ========================================================================= */

type ViewMode = "list" | "create" | "detail";
type ModalMode = null | "rubric" | "import" | "announcement";

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

  // NEW: which top-level modal (rubric manager / import / announcement) is open
  const [modal, setModal] = useState<ModalMode>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

async function loadAnnouncements() {
  try {
    const res = await fetch(`/api/subject-announcements?subject_section_id=${sectionId}`);
    const result = await res.json();
    setAnnouncements(result.announcements ?? []);
  } catch {
    setAnnouncements([]);
  }
}

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
    loadAnnouncements();
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

  let content: React.ReactNode;

  if (view === "create") {
    content = (
      <AssignmentForm
        sectionId={sectionId}
        subjectId={subjectId}
        currentUserId={currentUserId}
        onCancel={backToList}
        // CHANGED: publishing now returns to the "มอบหมายงาน" list tab
        // instead of jumping into the assignment detail view.
        onPublished={() => backToList()}
        onSavedDraft={() => backToList()}
      />
    );
  } else if (view === "detail" && activeAssignment) {
    content = (
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
  } else {
    content = (
  <AssignmentList
    assignments={assignments}
    students={students}
    studentLinks={studentLinks}
    submissions={submissions}
    announcements={announcements}                 // ★
    onAnnouncementsChanged={loadAnnouncements}      // ★
    currentUserId={currentUserId}                   // ★ ใช้เช็คว่าประกาศเป็นของครูคนนี้ไหม (โชว์ปุ่มแก้/ลบ)
    onCreate={openCreate}
    onOpen={openDetail}
    onManageRubrics={() => setModal("rubric")}
    onImport={() => setModal("import")}
    onAnnouncement={() => setModal("announcement")}
  />
);
  }

  return (
    <>
      {content}

      {modal === "rubric" && (
        <RubricManagerModal
          subjectId={subjectId}
          currentUserId={currentUserId}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "import" && (
        <ImportAssignmentModal
          subjectId={subjectId}
          sectionId={sectionId}
          currentUserId={currentUserId}
          onClose={() => setModal(null)}
          onImported={() => {
            setModal(null);
            loadAll();
          }}
        />
      )}

      {modal === "announcement" && (
  <AnnouncementModal
    sectionId={sectionId}
    currentUserId={currentUserId}
    onClose={() => setModal(null)}
    onPosted={() => {
      setModal(null);
      loadAnnouncements(); // ★ เพิ่มบรรทัดนี้
    }}
  />
)}
    </>
  );
}

/* =========================================================================
   List view — การ์ดชิ้นงานเรียงตามวันที่มอบหมาย
   ========================================================================= */
function AnnouncementsFeed({
  announcements,
  currentUserId,
  onChanged,
}: {
  announcements: Announcement[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("ต้องการลบประกาศนี้ใช่หรือไม่?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/subject-announcements?id=${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "ลบไม่สำเร็จ");
      onChanged();
    } catch (e: any) {
      alert("ลบประกาศไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setDeletingId(null);
  }

  if (announcements.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-black text-slate-400">ประกาศ</p>

      {announcements.map(a => {
        const files = (a.attachments ?? []).filter(x => x.kind === "file");
        const links = (a.attachments ?? []).filter(x => x.kind === "link");
        const isOwner = a.created_by === currentUserId;
        const authorName = a.creator?.full_name?.trim() || a.creator?.email || "ครูผู้สอน";

        return (
          <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-200 text-indigo-700 font-black flex items-center justify-center text-sm shrink-0">
                  {authorName[0]}
                </div>
                <div>
                  <p className="font-black text-slate-800 text-sm">{authorName}</p>
                  <p className="text-slate-400 text-xs font-bold"><DateTimeText iso={a.created_at} /></p>
                </div>
              </div>
              {isOwner && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditing(a)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center"
                    title="แก้ไขประกาศ"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center disabled:opacity-50"
                    title="ลบประกาศ"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>

            <p className="font-black text-slate-800 mt-3">{a.title}</p>
            {a.content && (
              <div
                className="text-sm font-bold text-slate-600 mt-1 prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: a.content }}
              />
            )}

            {/* ★ แสดงตัวอย่างรูปภาพ / ไฟล์แนบ */}
            {files.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {files.map(f => {
                  const img = isImageFilename(f.file_name);
                  return (
                    <div key={f.id} className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 aspect-square">
                      {img ? (
                        <button type="button" onClick={() => setLightbox({ url: f.url, name: f.file_name || "รูปภาพ" })} className="w-full h-full">
                          <img src={f.url} alt={f.file_name ?? ""} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                          <span className="text-2xl">📄</span>
                          <span className="text-[9px] font-bold text-slate-500 truncate w-full mt-1">{f.file_name}</span>
                        </a>
                      )}
                      <a
                        href={f.url}
                        download={f.file_name || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="ดาวน์โหลดไฟล์"
                        className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
                      >
                        ⬇️
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            {links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {links.map(l => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1.5 hover:bg-indigo-100 max-w-full"
                  >
                    <span className="truncate max-w-[220px]">🔗 {l.url}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* lightbox ดูรูปเต็ม */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.name} className="w-full h-full max-h-[85vh] object-contain rounded-xl" />
            <div className="absolute top-2 right-2 flex gap-2">
              <a href={lightbox.url} download={lightbox.name} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center text-sm shadow">⬇️</a>
              <button onClick={() => setLightbox(null)} className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center text-sm shadow">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* modal แก้ไขประกาศ — reuse AnnouncementModal เดิม โดยส่ง existing เข้าไป */}
      {editing && (
        <AnnouncementModal
          sectionId={editing.subject_section_id}
          currentUserId={currentUserId}
          existing={editing}
          onClose={() => setEditing(null)}
          onPosted={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AssignmentList({
  assignments, students, studentLinks, submissions,
  announcements, onAnnouncementsChanged, currentUserId,   // ★ props ใหม่
  onCreate, onOpen, onManageRubrics, onImport, onAnnouncement,
}: {
  assignments: Assignment[];
  students: Student[];
  studentLinks: AssignmentStudentLink[];
  submissions: Submission[];
  onCreate: () => void;
  onOpen: (id: string) => void;
  onManageRubrics: () => void;
  onImport: () => void;
  onAnnouncement: () => void;
  announcements: Announcement[];
  onAnnouncementsChanged: () => void;
  currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-black text-slate-800 text-lg">📌 มอบหมายงานในรายวิชา</h2>
        <p className="text-slate-400 text-xs font-bold">คุณสามารถมอบหมายงานนักเรียน และดูความคืบหน้าของชิ้นงานได้ที่นี่</p>
      </div>

      {/* แถบปุ่มเมนู: จัดการเกณฑ์รูบิก / นำเข้าชิ้นงาน / สร้างประกาศใหม่ / สร้างชิ้นงาน */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onManageRubrics}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
        >
          <span>☑️</span> จัดการเกณฑ์รูบิก
        </button>
        <button
          onClick={onImport}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
        >
          <span>📘</span> นำเข้าชิ้นงาน
        </button>
        <button
          onClick={onAnnouncement}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-1.5"
        >
          <span>📣</span> สร้างประกาศใหม่
        </button>
        <button
          onClick={onCreate}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow flex items-center gap-1.5"
        >
          <span>+</span> สร้างชิ้นงาน
        </button>
      </div>
      <AnnouncementsFeed
        announcements={announcements}
        currentUserId={currentUserId}
        onChanged={onAnnouncementsChanged}
      />

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
  subjectId,
  currentUserId,
  existing,
  onCancel,
  onPublished,
  onSavedDraft,
}: {
  sectionId: string;
  subjectId: string;
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
  // NEW: link to a saved rubric (assignments.rubric_id)
  const [rubricId, setRubricId] = useState<string | null>(existing?.rubric_id ?? null);
  const [savedRubrics, setSavedRubrics] = useState<SavedRubric[]>([]);
  const [showRubricPicker, setShowRubricPicker] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [links, setLinks] = useState<{ id?: string; url: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
const [previews, setPreviews] = useState<{ file: File; url: string; isImage: boolean }[]>([]);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<AssignmentAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subjectName, setSubjectName] = useState<string>("");

  useEffect(() => {
    if (!subjectId) return;
    supabase
      .from("subjects")
      .select("name_th, subject_code")
      .eq("id", subjectId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSubjectName(`${data.name_th ?? ""}`.trim() || data.subject_code || subjectId);
      });
  }, [subjectId]);

  // NEW: load the saved rubrics ("เลือกจากที่ตั้งไว้") for this subject
  useEffect(() => {
    if (!subjectId) return;
    supabase
      .from("grading_rubrics")
      .select("id, subject_id, name, description, max_score")
      .eq("subject_id", subjectId)
      .order("name", { ascending: true })
      .then(({ data }) => setSavedRubrics((data ?? []) as SavedRubric[]));
  }, [subjectId]);

  function pickRubric(r: SavedRubric) {
    setRubricId(r.id);
    setGradingNote(r.name);
    setShowRubricPicker(false);
  }

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
  if (!list || list.length === 0) return;
  const newFiles = Array.from(list); // ★ แปลงเป็น array ทันที ก่อนที่ input.value = "" จะเคลียร์ live FileList ตัวนี้
  setFiles(prev => [...prev, ...newFiles]);
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
      rubric_id: allowWeight ? rubricId : null,
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
          const subjectFolder = sanitizeFolderName(subjectName || subjectId);
          const assignmentFolder = sanitizeFolderName(title.trim());
          for (const f of files) {
            try {
              const fd = new FormData();
              fd.append("file", f);
              fd.append("account", teacherEmail);
              fd.append("path", `มอบหมายงาน/${subjectFolder}/${assignmentFolder}/${Date.now()}-${f.name}`);

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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-3.5 text-xs font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/40 cursor-pointer transition-colors"
            >
              <span className="text-base">📎</span>
              <span>คลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={e => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
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
              {/* NEW: grading-criteria field now lets you pick a saved rubric */}
              <div className="relative">
                <label className="text-[11px] font-black text-slate-400">เกณฑ์การให้คะแนน (ไม่บังคับ)</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={gradingNote}
                    onChange={e => {
                      setGradingNote(e.target.value);
                      setRubricId(null); // free-typed text detaches from a saved rubric
                    }}
                    placeholder="พิมพ์เกณฑ์ หรือเลือกจากที่ตั้งไว้"
                    className="flex-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRubricPicker(v => !v)}
                    className="px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[11px] shrink-0"
                  >
                    เลือกจากที่ตั้งไว้
                  </button>
                </div>
                {showRubricPicker && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {savedRubrics.length === 0 ? (
                      <p className="text-xs font-bold text-slate-300 text-center py-4">ยังไม่มีเกณฑ์การให้คะแนนที่บันทึกไว้</p>
                    ) : (
                      savedRubrics.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => pickRubric(r)}
                          className={`w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-xs font-bold text-slate-600 border-b border-slate-50 last:border-0 ${rubricId === r.id ? "bg-indigo-50 text-indigo-600" : ""}`}
                        >
                          {r.name} <span className="text-slate-300 font-normal">· คะแนนดิบสูงสุด {r.max_score}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
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
        subjectId={subjectId}
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
    <div className="space-y-4">
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

      <AssignmentAttachmentsPanel assignmentId={assignment.id} />
    </div>
  );
}

/* --------- ไฟล์แนบ / รูปภาพของชิ้นงาน (แสดงตัวอย่างรูป + ปุ่มดาวน์โหลด) --------- */

function AssignmentAttachmentsPanel({ assignmentId }: { assignmentId: string }) {
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(true);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingAtt(true);
    supabase
      .from("assignment_attachments")
      .select("*")
      .eq("assignment_id", assignmentId)
      .then(({ data }) => {
        if (!active) return;
        setAttachments((data ?? []) as AssignmentAttachment[]);
        setLoadingAtt(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  const files = attachments.filter(a => a.kind === "file");
  const links = attachments.filter(a => a.kind === "link");

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
      <p className="text-xs font-black text-slate-400">📎 ไฟล์แนบ / รูปภาพ</p>

      {loadingAtt ? (
        <p className="text-xs font-bold text-slate-300 py-4">กำลังโหลดไฟล์แนบ...</p>
      ) : files.length === 0 && links.length === 0 ? (
        <p className="text-xs font-bold text-slate-300 py-4">ไม่มีไฟล์แนบสำหรับชิ้นงานนี้</p>
      ) : (
        <>
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {files.map(att => {
                const img = isImageFilename(att.file_name);
                return (
                  <div
                    key={att.id}
                    className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 aspect-square"
                  >
                    {img ? (
                      <button
                        type="button"
                        onClick={() => setLightbox({ url: att.url, name: att.file_name || "รูปภาพ" })}
                        className="w-full h-full"
                      >
                        <img src={att.url} alt={att.file_name ?? ""} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-full flex flex-col items-center justify-center p-2 text-center"
                      >
                        <span className="text-2xl">📄</span>
                        <span className="text-[9px] font-bold text-slate-500 truncate w-full mt-1">{att.file_name}</span>
                      </a>
                    )}
                    <a
                      href={att.url}
                      download={att.file_name || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="ดาวน์โหลดไฟล์"
                      className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
                    >
                      ⬇️
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {links.map(l => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1.5 hover:bg-indigo-100 transition-colors max-w-full"
                >
                  <span className="truncate max-w-[220px]">🔗 {l.url}</span>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.name} className="w-full h-full max-h-[85vh] object-contain rounded-xl" />
            <div className="absolute top-2 right-2 flex gap-2">
              <a
                href={lightbox.url}
                download={lightbox.name}
                target="_blank"
                rel="noopener noreferrer"
                title="ดาวน์โหลด"
                className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center text-sm shadow"
              >
                ⬇️
              </a>
              <button
                onClick={() => setLightbox(null)}
                className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center text-sm shadow"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [lateDraft, setLateDraft] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const scoreInputRef = useRef<HTMLInputElement>(null);

  // ★ โหมดเลือกหลายคน (bulk grading)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkScore, setBulkScore] = useState<number | "">("");
  const [bulkStatus, setBulkStatus] = useState<SubmissionStatus>("reviewed");
  const [bulkComment, setBulkComment] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const filtered = students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));
  const selectedStudent = students.find(s => s.id === selectedId) ?? null;
  const selectedSub = submissions.find(s => s.student_id === selectedId) ?? null;

  useEffect(() => {
    setScoreDraft(selectedSub?.score ?? "");
    setCommentDraft(selectedSub?.teacher_comment ?? "");
    setStatusDraft(selectedSub?.status ?? "pending_review");
    setLateDraft(selectedSub?.is_late ?? null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectNextStudent() {
    const idx = filtered.findIndex(s => s.id === selectedId);
    if (idx >= 0 && idx < filtered.length - 1) {
      setSelectedId(filtered[idx + 1].id);
      // เลื่อนโฟกัสกลับไปที่ช่องคะแนนของนักเรียนคนถัดไป
      setTimeout(() => scoreInputRef.current?.focus(), 50);
    }
  }

  async function saveGrade(advanceToNext = false) {
    if (!selectedStudent) return;
    setSaving(true);
    const payload = {
      assignment_id: assignment.id,
      student_id: selectedStudent.id,
      status: statusDraft,
      score: scoreDraft === "" ? null : Number(scoreDraft),
      teacher_comment: commentDraft || null,
      is_late: lateDraft,  
      graded_by: currentUserId || null,
      graded_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from("assignment_submissions").upsert(payload, { onConflict: "assignment_id,student_id" });
      if (error) throw error;
      onChanged();
      if (advanceToNext) selectNextStudent();
    } catch (e: any) {
      alert("บันทึกคะแนนไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setSaving(false);
  }

  // ★ กรอกคะแนนแล้วเปลี่ยนสถานะเป็น "ตรวจแล้ว" อัตโนมัติ (ถ้ายังไม่เคยถูกตั้งสถานะเองเป็นอย่างอื่น)
  function onScoreChange(value: number | "") {
    setScoreDraft(value);
    if (value !== "" && (statusDraft === "pending_review" || statusDraft === "not_submitted" as any)) {
      setStatusDraft("reviewed");
    }
  }

  // ★ กด Enter ในช่องคะแนน = บันทึกทันที แล้วไปนักเรียนคนถัดไป
  function onScoreKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveGrade(true);
    }
  }

  // ★ ลบงานของนักเรียน (แทนสถานะ "ไม่ผ่าน" เดิม) — ทำให้กลับไปเป็น "ไม่มีงาน"
  async function deleteSubmission() {
    if (!selectedStudent) return;
    if (!confirm(`ต้องการลบงานของ "${selectedStudent.first_name} ${selectedStudent.last_name}" ใช่หรือไม่?\nสถานะจะกลับไปเป็น "ไม่มีงาน"`)) return;
    setSaving(true);
    try {
      await supabase.from("assignment_submissions").delete().eq("assignment_id", assignment.id).eq("student_id", selectedStudent.id);
      setScoreDraft("");
      setCommentDraft("");
      setStatusDraft("pending_review");
      setLateDraft(null);
      onChanged();
    } catch (e: any) {
      alert("ลบงานไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setSaving(false);
  }

  function toggleChecked(studentId: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }
  function toggleCheckAll() {
    if (checkedIds.size === filtered.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map(s => s.id)));
    }
  }

  // ★ ให้คะแนนหลายคนพร้อมกัน
  async function saveBulkGrade() {
    if (checkedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const rows = Array.from(checkedIds).map(studentId => ({
        assignment_id: assignment.id,
        student_id: studentId,
        status: bulkStatus,
        score: bulkScore === "" ? null : Number(bulkScore),
        teacher_comment: bulkComment || null,
        graded_by: currentUserId || null,
        graded_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("assignment_submissions").upsert(rows, { onConflict: "assignment_id,student_id" });
      if (error) throw error;
      onChanged();
      setCheckedIds(new Set());
      setBulkMode(false);
      setBulkScore("");
      setBulkComment("");
    } catch (e: any) {
      alert("บันทึกคะแนนหลายคนไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setBulkSaving(false);
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

        <div className="flex items-center justify-between mb-2 px-1">
          <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 cursor-pointer">
            <input type="checkbox" checked={filtered.length > 0 && checkedIds.size === filtered.length} onChange={toggleCheckAll} className="w-3.5 h-3.5" />
            เลือกทั้งหมด ({checkedIds.size})
          </label>
          {checkedIds.size > 1 && (
            <button
              onClick={() => setBulkMode(true)}
              className="text-[11px] font-black text-indigo-600 hover:underline"
            >
              ให้คะแนนพร้อมกัน
            </button>
          )}
        </div>

        <div className="space-y-1 max-h-[480px] overflow-y-auto">
          {filtered.map(s => {
            const sub = submissions.find(x => x.student_id === s.id);
            const status = sub?.status ?? "not_submitted";
            return (
              <div
                key={s.id}
                className={`w-full flex items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
                  selectedId === s.id && !bulkMode ? "bg-indigo-50 border-2 border-indigo-300" : "border-2 border-transparent hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedIds.has(s.id)}
                  onChange={() => toggleChecked(s.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => { setSelectedId(s.id); setBulkMode(false); }}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
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
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-slate-300 text-xs font-bold py-6">ไม่พบนักเรียน</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        {bulkMode ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-black text-slate-800">ให้คะแนนพร้อมกัน ({checkedIds.size} คน)</p>
              <button onClick={() => setBulkMode(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xs">✕ ยกเลิก</button>
            </div>
            <p className="text-xs font-bold text-slate-400">
              {students.filter(s => checkedIds.has(s.id)).map(s => `${s.first_name} ${s.last_name}`).join(", ")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-slate-500">คะแนน (เต็ม {assignment.max_score})</label>
                <input
                  type="number"
                  value={bulkScore}
                  onChange={e => setBulkScore(e.target.value === "" ? "" : Number(e.target.value))}
                  max={assignment.max_score}
                  className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500">สถานะ</label>
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value as SubmissionStatus)}
                  className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold bg-white focus:border-indigo-400 focus:outline-none"
                >
                  <option value="pending_review">รอตรวจ</option>
                  <option value="reviewed">ตรวจแล้ว</option>
                  <option value="needs_revision">ต้องแก้ไข</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-black text-slate-500">คอมเมนต์ให้นักเรียน (ใช้ข้อความเดียวกันทุกคน)</label>
              <textarea
                value={bulkComment}
                onChange={e => setBulkComment(e.target.value)}
                rows={3}
                className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold resize-none focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <button
              onClick={saveBulkGrade}
              disabled={bulkSaving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow disabled:opacity-50"
            >
              {bulkSaving ? "กำลังบันทึก..." : `บันทึกคะแนนให้ ${checkedIds.size} คน`}
            </button>
          </div>
        ) : !selectedStudent ? (
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
      ref={scoreInputRef}
      type="number"
      value={scoreDraft}
      onChange={e => onScoreChange(e.target.value === "" ? "" : Number(e.target.value))}
      onKeyDown={onScoreKeyDown}
      max={assignment.max_score}
      className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-indigo-400 focus:outline-none"
    />
    <p className="text-[10px] text-slate-300 font-bold mt-1">กด Enter เพื่อบันทึกและไปนักเรียนคนถัดไป</p>
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
    </select>
  </div>
</div>

{/* ★ เพิ่มส่วนนี้ */}
<div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between">
  <div>
    <p className="text-xs font-black text-slate-600">ส่งช้าหรือไม่</p>
    <p className="text-[10px] text-slate-400 font-bold mt-0.5">ใช้สำหรับคำนวณสถิติ "ส่งงานตรงเวลา" ในข้อมูลเชิงลึก</p>
  </div>
  <div className="flex gap-2 shrink-0">
    <button
      type="button"
      onClick={() => setLateDraft(false)}
      className={`px-3 py-1.5 rounded-lg font-black text-xs ${lateDraft === false ? "bg-emerald-500 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
    >
      ✅ ตรงเวลา
    </button>
    <button
      type="button"
      onClick={() => setLateDraft(true)}
      className={`px-3 py-1.5 rounded-lg font-black text-xs ${lateDraft === true ? "bg-rose-500 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
    >
      ⏰ ส่งช้า
    </button>
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

            <div className="flex gap-2">
              <button
                onClick={() => saveGrade(true)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกคะแนน · ไปคนถัดไป"}
              </button>
              <button
                onClick={deleteSubmission}
                disabled={saving}
                title="ลบงานนักเรียน"
                className="px-4 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-xs disabled:opacity-50 shrink-0"
              >
                🗑️ ลบงานนักเรียน
              </button>
            </div>
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
        .select("id, subject_id, join_code, classroom_id")
        .in("subject_id", subjectIds);

      // ★ ดึงข้อมูลห้องเรียน เพื่อโชว์ชื่อห้องเรียนประกอบชื่อวิชา
      const classroomIds = Array.from(
        new Set((allSections ?? []).map((sec: any) => sec.classroom_id).filter(Boolean))
      );
      const { data: classroomRows } = classroomIds.length
        ? await supabase.from("classrooms").select("id, room_name, room_number").in("id", classroomIds)
        : { data: [] as any[] };

      const list: TeacherSection[] = (allSections ?? [])
        .filter((sec: any) => sec.id !== sectionId)
        .map((sec: any) => {
          const subj = (mySubjects ?? []).find((s: any) => s.id === sec.subject_id);
          const classroom = (classroomRows ?? []).find((c: any) => c.id === sec.classroom_id);
          const classroomLabel =
            classroom?.room_name || (classroom?.room_number ? `ห้อง ${classroom.room_number}` : sec.join_code || "-");
          return {
            id: sec.id,
            label: subj ? `${subj.subject_code} · ${subj.name_th} · ${classroomLabel}` : `${sec.join_code} · ${classroomLabel}`,
          };
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

/* =========================================================================
   NEW — จัดการเกณฑ์รูบิก (Rubric manager)
   Tables used: grading_rubrics, rubric_levels, rubric_criteria,
   rubric_criteria_level_notes (see migration SQL).
   ========================================================================= */

function RubricManagerModal({
  subjectId,
  currentUserId,
  onClose,
}: {
  subjectId: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"list" | "create" | "copy">("list");
  const [rubrics, setRubrics] = useState<SavedRubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRubric, setEditingRubric] = useState<SavedRubric | null>(null);

  async function loadRubrics() {
    setLoading(true);
    const { data } = await supabase
      .from("grading_rubrics")
      .select("id, subject_id, name, description, max_score")
      .eq("subject_id", subjectId)
      .order("name", { ascending: true });
    setRubrics((data ?? []) as SavedRubric[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRubrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function deleteRubric(id: string) {
    if (!confirm("ลบเกณฑ์การให้คะแนนนี้ใช่หรือไม่?")) return;
    try {
      await supabase.from("grading_rubrics").delete().eq("id", id);
      loadRubrics();
    } catch (e: any) {
      alert("ลบไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
  }

  if (step === "create" || editingRubric) {
    return (
      <RubricEditor
        subjectId={subjectId}
        currentUserId={currentUserId}
        existing={editingRubric}
        onCancel={() => {
          setStep("list");
          setEditingRubric(null);
        }}
        onSaved={() => {
          setStep("list");
          setEditingRubric(null);
          loadRubrics();
        }}
      />
    );
  }

  if (step === "copy") {
    return (
      <RubricCopyFromOtherSubject
        subjectId={subjectId}
        currentUserId={currentUserId}
        onCancel={() => setStep("list")}
        onCopied={() => {
          setStep("list");
          loadRubrics();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="font-black text-slate-800 text-lg">เกณฑ์การให้คะแนน</p>
            <p className="text-slate-400 text-xs font-bold mt-0.5">สร้างและจัดการเกณฑ์การให้คะแนนสำหรับงานของวิชานี้</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm">ปิด</button>
        </div>

        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-slate-700">เกณฑ์การให้คะแนน</p>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("copy")}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-xs flex items-center gap-1.5"
              >
                📋 คัดลอกจากวิชาอื่น
              </button>
              <button
                onClick={() => setStep("create")}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-xs flex items-center gap-1.5"
              >
                + สร้างเกณฑ์การให้คะแนนแบบรูบิก
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-slate-300 font-bold text-sm py-16">กำลังโหลด...</p>
          ) : rubrics.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-black text-slate-500 text-sm">ยังไม่มีเกณฑ์การให้คะแนน</p>
              <p className="text-slate-300 text-xs font-bold mt-1">สร้างเกณฑ์การให้คะแนนเพื่อให้คะแนนงานตามเกณฑ์ต่าง ๆ</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rubrics.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50">
                  <button className="text-left flex-1 min-w-0" onClick={() => setEditingRubric(r)}>
                    <p className="font-black text-slate-700 text-sm truncate">{r.name}</p>
                    <p className="text-slate-400 text-xs font-bold">คะแนนดิบสูงสุด {r.max_score}</p>
                  </button>
                  <button
                    onClick={() => deleteRubric(r.id)}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 font-black text-xs shrink-0"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------- สร้าง/แก้ไข เกณฑ์การให้คะแนนแบบรูบิก (matrix: เกณฑ์ × ระดับ) ------- */

type EditorLevel = { id: string; name: string; score: number };
type EditorCriterion = { id: string; name: string; weight: number; notes: Record<string, string> }; // notes keyed by level id

function RubricEditor({
  subjectId,
  currentUserId,
  existing,
  onCancel,
  onSaved,
}: {
  subjectId: string;
  currentUserId: string;
  existing: SavedRubric | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [levels, setLevels] = useState<EditorLevel[]>([
    { id: "lvl-1", name: "", score: 4 },
    { id: "lvl-2", name: "", score: 3 },
    { id: "lvl-3", name: "", score: 2 },
    { id: "lvl-4", name: "", score: 1 },
  ]);
  const [criteria, setCriteria] = useState<EditorCriterion[]>([
    { id: "crit-1", name: "", weight: 1, notes: {} },
  ]);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!existing);

  useEffect(() => {
    if (!existing) return;
    (async () => {
      const [{ data: lvlRows }, { data: critRows }] = await Promise.all([
        supabase.from("rubric_levels").select("*").eq("rubric_id", existing.id).order("order_index"),
        supabase.from("rubric_criteria").select("*").eq("rubric_id", existing.id).order("order_index"),
      ]);
      const lvls = ((lvlRows ?? []) as RubricLevel[]).map(l => ({ id: l.id, name: l.name ?? "", score: l.score }));
      if (lvls.length > 0) setLevels(lvls);

      const critIds = (critRows ?? []).map((c: any) => c.id);
      const { data: noteRows } = critIds.length
        ? await supabase.from("rubric_criteria_level_notes").select("*").in("criterion_id", critIds)
        : { data: [] as any[] };

      const critList: EditorCriterion[] = ((critRows ?? []) as RubricCriterion[]).map(c => {
        const notes: Record<string, string> = {};
        ((noteRows ?? []) as RubricCellNote[])
          .filter(n => n.criterion_id === c.id)
          .forEach(n => { notes[n.level_id] = n.description ?? ""; });
        return { id: c.id, name: c.name, weight: c.weight, notes };
      });
      if (critList.length > 0) setCriteria(critList);
      setLoadingExisting(false);
    })();
  }, [existing]);

  const topScore = Math.max(0, ...levels.map(l => l.score));
  const maxScore = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0) * topScore, 0);

  function updateLevel(id: string, patch: Partial<EditorLevel>) {
    setLevels(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLevel() {
    setLevels(prev => [...prev, { id: `lvl-${Date.now()}`, name: "", score: 0 }]);
  }
  function removeLevel(id: string) {
    setLevels(prev => prev.filter(l => l.id !== id));
    setCriteria(prev => prev.map(c => {
      const { [id]: _, ...rest } = c.notes;
      return { ...c, notes: rest };
    }));
  }

  function updateCriterion(id: string, patch: Partial<EditorCriterion>) {
    setCriteria(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }
  function addCriterion() {
    setCriteria(prev => [...prev, { id: `crit-${Date.now()}`, name: "", weight: 1, notes: {} }]);
  }
  function removeCriterion(id: string) {
    setCriteria(prev => prev.filter(c => c.id !== id));
  }
  function updateNote(criterionId: string, levelId: string, text: string) {
    setCriteria(prev => prev.map(c => (c.id === criterionId ? { ...c, notes: { ...c.notes, [levelId]: text } } : c)));
  }

  async function save() {
    if (!name.trim()) {
      alert("ต้องระบุชื่อเกณฑ์การให้คะแนน");
      return;
    }
    setSaving(true);
    try {
      // ดึง uid จาก session ตรงๆ เพื่อให้ตรงกับ auth.uid() ที่ RLS ใช้เช็คเสมอ
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.id) {
        alert("ไม่พบผู้ใช้ที่ล็อกอินอยู่ กรุณาล็อกอินใหม่แล้วลองอีกครั้ง");
        setSaving(false);
        return;
      }
      const uid = userData.user.id;

      let rubricId = existing?.id ?? "";
      const rubricPayload = {
        subject_id: subjectId,
        name: name.trim(),
        description: description || null,
        max_score: maxScore,
        created_by: uid,
      };
      if (existing) {
        await supabase.from("grading_rubrics").update(rubricPayload).eq("id", existing.id);
        rubricId = existing.id;
        // เคลียร์ของเก่าแล้วเขียนใหม่ทั้งหมด (ง่ายกว่าการ diff ทีละแถว)
        const { data: oldCrit } = await supabase.from("rubric_criteria").select("id").eq("rubric_id", rubricId);
        const oldCritIds = (oldCrit ?? []).map((c: any) => c.id);
        if (oldCritIds.length) await supabase.from("rubric_criteria_level_notes").delete().in("criterion_id", oldCritIds);
        await supabase.from("rubric_criteria").delete().eq("rubric_id", rubricId);
        await supabase.from("rubric_levels").delete().eq("rubric_id", rubricId);
      } else {
        const { data, error } = await supabase.from("grading_rubrics").insert(rubricPayload).select().maybeSingle();
        if (error) throw error;
        rubricId = data.id;
      }

      // levels — insert and remember the real (new) ids, mapping from temp ids
      const levelIdMap: Record<string, string> = {};
      for (let i = 0; i < levels.length; i++) {
        const l = levels[i];
        const { data, error } = await supabase
          .from("rubric_levels")
          .insert({ rubric_id: rubricId, name: l.name || null, score: l.score, order_index: i })
          .select()
          .maybeSingle();
        if (error) throw error;
        levelIdMap[l.id] = data.id;
      }

      // criteria + per-cell notes
      for (let i = 0; i < criteria.length; i++) {
        const c = criteria[i];
        const { data: critData, error: critErr } = await supabase
          .from("rubric_criteria")
          .insert({ rubric_id: rubricId, name: c.name || "ไม่มีชื่อเกณฑ์", weight: c.weight, order_index: i })
          .select()
          .maybeSingle();
        if (critErr) throw critErr;

        const noteRows = Object.entries(c.notes)
          .filter(([, text]) => text && text.trim())
          .map(([tempLevelId, text]) => ({
            criterion_id: critData.id,
            level_id: levelIdMap[tempLevelId] ?? tempLevelId,
            description: text,
          }));
        if (noteRows.length) await supabase.from("rubric_criteria_level_notes").insert(noteRows);
      }

      onSaved();
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <p className="font-black text-slate-800 text-lg">{existing ? "แก้ไขเกณฑ์การให้คะแนน" : "สร้างเกณฑ์การให้คะแนน"}</p>
        </div>

        {loadingExisting ? (
          <p className="text-center text-slate-300 font-bold text-sm py-16">กำลังโหลด...</p>
        ) : (
          <div className="p-6 space-y-4">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ชื่อเกณฑ์การให้คะแนน"
              className="w-full rounded-xl px-4 py-3 text-sm font-black bg-gradient-to-r from-indigo-500 to-blue-500 text-white placeholder:text-white/70 focus:outline-none"
            />
            <textarea
              value={description ?? ""}
              onChange={e => setDescription(e.target.value)}
              placeholder="คำอธิบาย (ไม่บังคับ)"
              rows={2}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none resize-none"
            />

            <div className="overflow-x-auto">
  <div
    className="grid gap-2"
    style={{ gridTemplateColumns: `200px repeat(${levels.length}, minmax(180px, 1fr)) 140px` }}
  >
    {/* หัวตาราง */}
    <div className="text-left text-xs font-black text-slate-500 px-1 self-end pb-2">เกณฑ์การประเมิน</div>
    {levels.map(l => (
      <div key={l.id} className="border-2 border-slate-100 rounded-xl p-2">
        <div className="flex items-center gap-1">
          <input
            value={l.name}
            onChange={e => updateLevel(l.id, { name: e.target.value })}
            placeholder="ชื่อระดับ"
            className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-indigo-400 focus:outline-none"
          />
          <button onClick={() => removeLevel(l.id)} className="w-5 h-5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-500 text-[10px] font-black shrink-0">✕</button>
        </div>
        <input
          type="number"
          value={l.score}
          onChange={e => updateLevel(l.id, { score: Number(e.target.value) })}
          className="mt-1.5 w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-center"
        />
        <span className="text-[10px] text-slate-400 font-bold ml-1">คะแนน</span>
      </div>
    ))}
    <div className="self-end pb-1">
      <button onClick={addLevel} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-xs whitespace-nowrap w-full">+ เพิ่มระดับ</button>
    </div>

    {/* แถวของแต่ละเกณฑ์ */}
    {criteria.map(c => (
      <div key={c.id} className="contents">
        <div className="border-2 border-slate-100 rounded-xl p-2">
          <input
            value={c.name}
            onChange={e => updateCriterion(c.id, { name: e.target.value })}
            placeholder="ชื่อเกณฑ์"
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-indigo-400 focus:outline-none"
          />
          <p className="text-[10px] text-slate-400 font-bold mt-1.5">น้ำหนัก</p>
          <input
            type="number"
            value={c.weight}
            onChange={e => updateCriterion(c.id, { weight: Number(e.target.value) })}
            className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-center"
          />
          <button onClick={() => removeCriterion(c.id)} className="mt-2 text-rose-500 font-black text-[11px] block">✕ ลบเกณฑ์</button>
        </div>
        {levels.map(l => (
          <textarea
            key={l.id}
            value={c.notes[l.id] ?? ""}
            onChange={e => updateNote(c.id, l.id, e.target.value)}
            placeholder="คำอธิบายระดับ (ไม่บังคับ)"
            rows={3}
            className="w-full border-2 border-slate-100 rounded-xl px-2 py-2 text-xs font-bold focus:border-indigo-400 focus:outline-none resize-none"
          />
        ))}
        <div />
      </div>
    ))}
  </div>
</div>

            <button onClick={addCriterion} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs">+ เพิ่มเกณฑ์</button>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-bold">
                <span className="text-slate-500">คะแนนดิบสูงสุด: </span>
                <span className="text-slate-800 font-black">{maxScore}</span>
                {!name.trim() && <span className="text-rose-400 ml-3">ต้องระบุชื่อเกณฑ์การให้คะแนน</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={onCancel} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm">ยกเลิก</button>
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm disabled:opacity-50"
                >
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------- คัดลอกเกณฑ์การให้คะแนนจากวิชาอื่นที่ครูคนนี้สอน ------- */

function RubricCopyFromOtherSubject({
  subjectId,
  currentUserId,
  onCancel,
  onCopied,
}: {
  subjectId: string;
  currentUserId: string;
  onCancel: () => void;
  onCopied: () => void;
}) {
  const [otherSubjects, setOtherSubjects] = useState<{ id: string; label: string }[]>([]);
  const [pickedSubjectId, setPickedSubjectId] = useState<string | null>(null);
  const [rubricsOfPicked, setRubricsOfPicked] = useState<SavedRubric[]>([]);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    supabase
      .from("subjects")
      .select("id, subject_code, name_th")
      .eq("created_by", currentUserId) // NOTE: adjust to your actual ownership column
      .neq("id", subjectId)
      .then(({ data }) => {
        setOtherSubjects(((data ?? []) as any[]).map(s => ({ id: s.id, label: `${s.subject_code ?? ""} · ${s.name_th ?? ""}` })));
      });
  }, [subjectId, currentUserId]);

  useEffect(() => {
    if (!pickedSubjectId) { setRubricsOfPicked([]); return; }
    supabase
      .from("grading_rubrics")
      .select("id, subject_id, name, description, max_score")
      .eq("subject_id", pickedSubjectId)
      .then(({ data }) => setRubricsOfPicked((data ?? []) as SavedRubric[]));
  }, [pickedSubjectId]);

  async function copyRubric(r: SavedRubric) {
    setCopying(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.id) {
        alert("ไม่พบผู้ใช้ที่ล็อกอินอยู่ กรุณาล็อกอินใหม่แล้วลองอีกครั้ง");
        setCopying(false);
        return;
      }
      const uid = userData.user.id;

      const [{ data: levelRows }, { data: critRows }] = await Promise.all([
        supabase.from("rubric_levels").select("*").eq("rubric_id", r.id).order("order_index"),
        supabase.from("rubric_criteria").select("*").eq("rubric_id", r.id).order("order_index"),
      ]);

      const { data: newRubric, error } = await supabase
        .from("grading_rubrics")
        .insert({ subject_id: subjectId, name: r.name, description: r.description, max_score: r.max_score, created_by: uid })
        .select()
        .maybeSingle();
      if (error) throw error;

      const levelIdMap: Record<string, string> = {};
      for (const l of (levelRows ?? []) as RubricLevel[]) {
        const { data } = await supabase
          .from("rubric_levels")
          .insert({ rubric_id: newRubric.id, name: l.name, score: l.score, order_index: l.order_index })
          .select()
          .maybeSingle();
        levelIdMap[l.id] = data.id;
      }

      for (const c of (critRows ?? []) as RubricCriterion[]) {
        const { data: newCrit } = await supabase
          .from("rubric_criteria")
          .insert({ rubric_id: newRubric.id, name: c.name, weight: c.weight, order_index: c.order_index })
          .select()
          .maybeSingle();

        const { data: noteRows } = await supabase.from("rubric_criteria_level_notes").select("*").eq("criterion_id", c.id);
        const newNotes = ((noteRows ?? []) as RubricCellNote[]).map(n => ({
          criterion_id: newCrit.id,
          level_id: levelIdMap[n.level_id] ?? n.level_id,
          description: n.description,
        }));
        if (newNotes.length) await supabase.from("rubric_criteria_level_notes").insert(newNotes);
      }

      onCopied();
    } catch (e: any) {
      alert("คัดลอกไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setCopying(false);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <p className="font-black text-slate-800 text-lg">คัดลอกเกณฑ์การให้คะแนนจากวิชาอื่น</p>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 font-bold text-sm">ปิด</button>
        </div>
        <div className="p-6 space-y-4">
          <select
            value={pickedSubjectId ?? ""}
            onChange={e => setPickedSubjectId(e.target.value || null)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold bg-white focus:border-indigo-400 focus:outline-none"
          >
            <option value="">เลือกวิชาที่คุณสอน</option>
            {otherSubjects.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          {pickedSubjectId && (
            rubricsOfPicked.length === 0 ? (
              <p className="text-center text-slate-300 font-bold text-sm py-8">วิชานี้ยังไม่มีเกณฑ์การให้คะแนน</p>
            ) : (
              <div className="space-y-2">
                {rubricsOfPicked.map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <div>
                      <p className="font-black text-slate-700 text-sm">{r.name}</p>
                      <p className="text-slate-400 text-xs font-bold">คะแนนดิบสูงสุด {r.max_score}</p>
                    </div>
                    <button
                      onClick={() => copyRubric(r)}
                      disabled={copying}
                      className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-xs disabled:opacity-50"
                    >
                      {copying ? "กำลังคัดลอก..." : "+ คัดลอก"}
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   NEW — นำเข้าชิ้นงาน (Import assignment from the same subject, across
   sections/teachers). Table used for lookups: subjects, subject_sections,
   assignments. Adjust the "same subject" match rule (currently subject_code)
   and the teacher lookup (uses your `users` table: id, email, title, first_name, last_name).
   ========================================================================= */

type AcademicYear = { id: string; year_name: string; semester: number; is_current: boolean };

type ImportableSectionCard = {
  subject_id: string;
  subject_section_id: string;
  subject_code: string;
  name_th: string;
  year_label: string;
  teacher_name: string;
  teacher_id: string;
  classroom_label: string;
};

function ImportAssignmentModal({
  subjectId,
  sectionId,
  currentUserId,
  onClose,
  onImported,
}: {
  subjectId: string;
  sectionId: string;
  currentUserId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"search" | "pick">("search");
  const [searchText, setSearchText] = useState("");
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [teacherFilter, setTeacherFilter] = useState<string>("");
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [cards, setCards] = useState<ImportableSectionCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  const [pickedCard, setPickedCard] = useState<ImportableSectionCard | null>(null);
  const [sourceAssignments, setSourceAssignments] = useState<Assignment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);

  // โหลดรายชื่อครู (สำหรับ dropdown filter)
  useEffect(() => {
    supabase.from("profiles").select("id, email, full_name").then(({ data }) => {
      setTeachers((data ?? []) as SchoolTeacher[]);
    });
  }, []);

  // โหลดปีการศึกษา/ภาคเรียนทั้งหมด และตั้งค่าเริ่มต้นเป็นปีปัจจุบัน (is_current)
  useEffect(() => {
    supabase
      .from("academic_years")
      .select("id, year_name, semester, is_current")
      .order("year_name", { ascending: false })
      .order("semester", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as AcademicYear[];
        setAcademicYears(rows);
        const current = rows.find(y => y.is_current);
        if (current) setAcademicYearId(current.id);
      });
  }, []);

  async function runSearch() {
    setLoadingCards(true);
    try {
      // 1) หาว่าวิชาปัจจุบันมีรหัสวิชาอะไร แล้วรวบรวม subject id ที่ "ถือว่าเป็นวิชาเดียวกัน"
      //    (รวม id ปัจจุบัน + id อื่นที่ subject_code ตรงกัน เผื่อมีข้อมูลซ้ำคนละแถว)
      const { data: currentSubject } = await supabase
        .from("subjects")
        .select("id, subject_code, name_th")
        .eq("id", subjectId)
        .maybeSingle();

      let subjectIds: string[] = [subjectId];
      if (currentSubject?.subject_code) {
        const { data: sameCode } = await supabase
          .from("subjects")
          .select("id")
          .eq("subject_code", currentSubject.subject_code);
        subjectIds = (sameCode ?? []).map((s: any) => s.id);
      }

      if (searchText.trim()) {
        const { data: matched } = await supabase
          .from("subjects")
          .select("id")
          .in("id", subjectIds)
          .or(`subject_code.ilike.%${searchText.trim()}%,name_th.ilike.%${searchText.trim()}%`);
        subjectIds = (matched ?? []).map((s: any) => s.id);
      }

      if (subjectIds.length === 0) {
        setCards([]);
        setLoadingCards(false);
        return;
      }

      // 2) หา section ของวิชาเหล่านี้ ยกเว้นห้องปัจจุบัน กรองตามปี/ครูถ้าเลือกไว้
      let secQuery = supabase
        .from("subject_sections")
        .select("id, subject_id, classroom_id, academic_year_id, teacher_id, co_teacher_id, join_code")
        .in("subject_id", subjectIds)
        .neq("id", sectionId);

      if (academicYearId) secQuery = secQuery.eq("academic_year_id", academicYearId);
      if (teacherFilter) secQuery = secQuery.or(`teacher_id.eq.${teacherFilter},co_teacher_id.eq.${teacherFilter}`);

      const { data: sectionRows } = await secQuery;
      if (!sectionRows || sectionRows.length === 0) {
        setCards([]);
        setLoadingCards(false);
        return;
      }

      // 3) โหลดข้อมูลประกอบ: วิชา / ห้องเรียน / ปีการศึกษา / ครู
      const secSubjectIds = Array.from(new Set(sectionRows.map((s: any) => s.subject_id)));
      const classroomIds = Array.from(new Set(sectionRows.map((s: any) => s.classroom_id).filter(Boolean)));
      const yearIds = Array.from(new Set(sectionRows.map((s: any) => s.academic_year_id).filter(Boolean)));
      const teacherIds = Array.from(
        new Set(sectionRows.flatMap((s: any) => [s.teacher_id, s.co_teacher_id]).filter(Boolean))
      );

      const [{ data: subjRows }, { data: classroomRows }, { data: yearRows }, { data: teacherRows }] = await Promise.all([
        supabase.from("subjects").select("id, subject_code, name_th").in("id", secSubjectIds),
        classroomIds.length
          ? supabase.from("classrooms").select("id, room_name, room_number").in("id", classroomIds)
          : Promise.resolve({ data: [] as any[] }),
        yearIds.length
          ? supabase.from("academic_years").select("id, year_name, semester").in("id", yearIds)
          : Promise.resolve({ data: [] as any[] }),
        teacherIds.length
          ? supabase.from("profiles").select("id, email, full_name").in("id", teacherIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const list: ImportableSectionCard[] = sectionRows.map((sec: any) => {
        const subj = (subjRows ?? []).find((s: any) => s.id === sec.subject_id);
        const classroom = (classroomRows ?? []).find((c: any) => c.id === sec.classroom_id);
        const year = (yearRows ?? []).find((y: any) => y.id === sec.academic_year_id);
        const teacher = (teacherRows ?? []).find((t: any) => t.id === sec.teacher_id) as SchoolTeacher | undefined;

        return {
          subject_id: subj?.id ?? sec.subject_id,
          subject_section_id: sec.id,
          subject_code: subj?.subject_code ?? "",
          name_th: subj?.name_th ?? "",
          year_label: year ? `เทอม ${year.semester} / ${year.year_name}` : "-",
          teacher_name: teacherDisplayName(teacher),
          teacher_id: sec.teacher_id ?? "",
          classroom_label:
            classroom?.room_name || (classroom?.room_number ? `ห้อง ${classroom.room_number}` : sec.join_code || "-"),
        };
      });
      setCards(list);
    } catch (e: any) {
      alert("ค้นหาไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setLoadingCards(false);
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId]);

  async function openCard(card: ImportableSectionCard) {
    setPickedCard(card);
    setSelectedIds(new Set());
    const { data } = await supabase
      .from("assignments")
      .select("*")
      .eq("subject_section_id", card.subject_section_id)
      .order("assigned_at", { ascending: false });
    setSourceAssignments((data ?? []) as Assignment[]);
    setStep("pick");
  }

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirmCopy() {
    if (selectedIds.size === 0) return;
    setCopying(true);
    try {
      for (const id of selectedIds) {
        const a = sourceAssignments.find(x => x.id === id);
        if (!a) continue;

        const { data: cloned, error } = await supabase
          .from("assignments")
          .insert({
            subject_section_id: sectionId,
            title: a.title,
            description: a.description,
            type: a.type,
            assigned_at: new Date().toISOString(),
            due_date: a.due_date,
            max_score: a.max_score,
            allow_weight: a.allow_weight,
            weight_percent: a.weight_percent,
            grading_criteria_note: a.grading_criteria_note,
            rubric_id: a.rubric_id ?? null,
            status: "draft",
            published_at: null,
            created_by: currentUserId || null,
          })
          .select()
          .maybeSingle();
        if (error) throw error;

        const { data: atts } = await supabase.from("assignment_attachments").select("*").eq("assignment_id", a.id);
        if (atts && atts.length > 0) {
          await supabase.from("assignment_attachments").insert(
            atts.map((att: any) => ({ assignment_id: cloned.id, kind: att.kind, url: att.url, file_name: att.file_name }))
          );
        }

        await supabase.from("assignment_imports").insert({
          source_assignment_id: a.id,
          target_subject_section_id: sectionId,
          created_assignment_id: cloned.id,
          imported_by: currentUserId || null,
        });
      }
      onImported();
    } catch (e: any) {
      alert("นำเข้าชิ้นงานไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setCopying(false);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="font-black text-slate-800 text-lg flex items-center gap-2">📘 นำเข้าชิ้นงาน</p>
            <p className="text-slate-400 text-xs font-bold mt-0.5">คุณสามารถนำเข้าชิ้นงานจากรายวิชาเดียวกัน แม้อยู่คนละห้องหรือคนละครูผู้สอน</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        {step === "search" && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="ค้นหารายวิชา เช่น รหัสวิชา หรือชื่อวิชา"
                className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-indigo-400 focus:outline-none"
              />
              <select
                value={academicYearId}
                onChange={e => setAcademicYearId(e.target.value)}
                className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold bg-white focus:border-indigo-400 focus:outline-none"
              >
                <option value="">ทุกปีการศึกษา/ภาคเรียน</option>
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>เทอม {y.semester} / {y.year_name}{y.is_current ? " (ปัจจุบัน)" : ""}</option>
                ))}
              </select>
              <select
                value={teacherFilter}
                onChange={e => setTeacherFilter(e.target.value)}
                className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold bg-white focus:border-indigo-400 focus:outline-none"
              >
                <option value="">ค้นหาตามรายชื่อคุณครูในโรงเรียน</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{teacherDisplayName(t)}</option>
                ))}
              </select>
            </div>
            <button onClick={runSearch} className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-sm">ค้นหา</button>

            {loadingCards ? (
              <p className="text-center text-slate-300 font-bold text-sm py-10">กำลังค้นหา...</p>
            ) : cards.length === 0 ? (
              <p className="text-center text-slate-300 font-bold text-sm py-10">ไม่พบรายวิชาที่ตรงกับเงื่อนไข</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cards.map(c => (
                  <button
                    key={c.subject_section_id}
                    onClick={() => openCard(c)}
                    className="text-left rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 flex items-center justify-between">
                      <span className="text-white text-[10px] font-black bg-white/20 rounded px-2 py-0.5">SUBJECT</span>
                      <span className="text-white font-black text-lg">+</span>
                    </div>
                    <div className="p-4 space-y-1">
                      <p className="font-black text-slate-800">{c.name_th || c.subject_code}</p>
                      <p className="text-slate-400 text-xs font-bold">{c.year_label}</p>
                      <p className="text-slate-300 text-xs font-bold">{c.subject_code}</p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <div className="w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-black flex items-center justify-center">
                          {c.teacher_name?.[0] ?? "?"}
                        </div>
                        <span className="text-[11px] text-slate-400 font-bold">{c.teacher_name} · ห้อง: {c.classroom_label}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "pick" && pickedCard && (
          <div className="p-6 space-y-4">
            <button onClick={() => setStep("search")} className="text-indigo-500 font-black text-xs">← กลับไปค้นหา</button>
            <p className="font-black text-slate-700 text-sm">{pickedCard.name_th} · {pickedCard.classroom_label} · {pickedCard.teacher_name}</p>

            {sourceAssignments.length === 0 ? (
              <p className="text-center text-slate-300 font-bold text-sm py-10">วิชานี้ยังไม่มีชิ้นงาน</p>
            ) : (
              <div className="grid gap-3">
                {sourceAssignments.map(a => {
                  const selected = selectedIds.has(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className={`text-left bg-white rounded-2xl border-2 p-4 transition-colors ${selected ? "border-indigo-400" : "border-slate-100 hover:border-slate-200"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black text-white shrink-0 ${a.status === "draft" ? "bg-slate-300" : "bg-gradient-to-br from-indigo-500 to-blue-500"}`}>📄</div>
                        <div>
                          <p className="font-black text-slate-800">{a.title}</p>
                          <p className="text-slate-400 text-xs font-bold mt-0.5"><DateTimeText iso={a.assigned_at} /> · {a.max_score} คะแนน</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm">Cancel</button>
              <button
                onClick={confirmCopy}
                disabled={copying || selectedIds.size === 0}
                className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-sm disabled:opacity-50"
              >
                {copying ? "กำลังนำเข้า..." : "+ Copy"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   NEW — สร้างประกาศใหม่ (Announcement)
   Tables: subject_announcements, subject_announcement_attachments.
   ========================================================================= */

function AnnouncementModal({
  sectionId,
  currentUserId,
  existing,
  onClose,
  onPosted,
}: {
  sectionId: string;
  currentUserId: string;
  existing?: Announcement;      // ★
  onClose: () => void;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const editorRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing?.content && editorRef.current) {
      editorRef.current.innerHTML = existing.content;
      updateWordCount();
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setTeacherEmail(data.user?.email ?? null);
    });
  }, []);

  function exec(cmd: string) {
    document.execCommand(cmd);
    editorRef.current?.focus();
  }

  // helper for createLink (needs 3rd arg)
  function exec2(cmd: string, value: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }

  function updateWordCount() {
    const text = editorRef.current?.innerText ?? "";
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
  }

  async function post() {
    const content = editorRef.current?.innerHTML ?? "";
    if (!title.trim()) { alert("กรุณาใส่หัวข้อประกาศ"); return; }
    setPosting(true);
    try {
      const attachments: { kind: "file"; url: string; file_name?: string }[] = [];
      if (files.length > 0 && teacherEmail) {
        for (const f of files) {
          try {
            const fd = new FormData();
            fd.append("file", f);
            fd.append("account", teacherEmail);
            fd.append("path", `ประกาศ/${sanitizeFolderName(title.trim())}/${Date.now()}-${f.name}`);
            const res = await fetch("/api/upload-onedrive", { method: "POST", body: fd });
            const result = await res.json();
            if (result.ok && result.url) {
              attachments.push({ kind: "file", url: result.url, file_name: result.fileName || f.name });
            }
          } catch {}
        }
      }

      // 2) ยิงไป API route ของเราแทนการเรียก Supabase ตรง ๆ
      const res = await fetch("/api/subject-announcements", {
        method: existing ? "PATCH" : "POST",           // ★
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id,                              // ★ ใช้ตอนแก้ไข
          subject_section_id: sectionId,
          title: title.trim(),
          content,
          created_by: currentUserId || null,
          attachments,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "บันทึกประกาศไม่สำเร็จ");
      onPosted();
    } catch (e: any) {
      alert("บันทึกประกาศไม่สำเร็จ: " + (e?.message ?? "unknown error"));
    }
    setPosting(false);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <p className="font-black text-slate-800 text-lg">{existing ? "แก้ไขประกาศ" : "สร้างประกาศใหม่"}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        <div className="p-6 space-y-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="หัวข้อ"
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-indigo-400 focus:outline-none"
          />

          <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50">
              <button type="button" onClick={() => exec("undo")} className="w-7 h-7 rounded hover:bg-slate-200 text-slate-500">↺</button>
              <button type="button" onClick={() => exec("redo")} className="w-7 h-7 rounded hover:bg-slate-200 text-slate-500">↻</button>
              <span className="w-px h-4 bg-slate-200 mx-1" />
              <button type="button" onClick={() => exec("bold")} className="w-7 h-7 rounded hover:bg-slate-200 text-slate-600 font-black">B</button>
              <button type="button" onClick={() => exec("italic")} className="w-7 h-7 rounded hover:bg-slate-200 text-slate-600 italic">I</button>
              <span className="w-px h-4 bg-slate-200 mx-1" />
              <button type="button" onClick={() => exec("insertUnorderedList")} className="w-7 h-7 rounded hover:bg-slate-200 text-slate-500">•≡</button>
              <button type="button" onClick={() => exec("insertOrderedList")} className="w-7 h-7 rounded hover:bg-slate-200 text-slate-500">1≡</button>
              <span className="w-px h-4 bg-slate-200 mx-1" />
              <button
                type="button"
                onClick={() => {
                  const url = prompt("ใส่ลิงก์ (URL)");
                  if (url) exec2("createLink", url);
                }}
                className="w-7 h-7 rounded hover:bg-slate-200 text-slate-500"
              >
                🔗
              </button>
            </div>
            <div
              ref={editorRef}
              contentEditable
              onInput={updateWordCount}
              className="min-h-[140px] px-4 py-3 text-sm font-bold focus:outline-none"
              suppressContentEditableWarning
            />
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 font-bold">
              <span>p</span>
              <span>{wordCount} words</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-indigo-500 font-black text-xs"
          >
            📎 แนบไฟล์
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
              e.target.value = "";
            }}
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 font-bold bg-slate-100 rounded-full pl-3 pr-1.5 py-1">
                  📄 {f.name}
                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="w-4 h-4 rounded-full bg-slate-200 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center">✕</button>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={post}
            disabled={posting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-black text-sm shadow disabled:opacity-50"
          >
            {posting ? "กำลังโพสต์..." : existing ? "บันทึกการแก้ไข" : "โพสต์ประกาศ"}
          </button>
        </div>
      </div>
    </div>
  );
}