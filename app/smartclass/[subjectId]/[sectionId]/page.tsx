"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Subject = { id: string; subject_code: string; name_th: string };
type Classroom = { id: string; room_name?: string; grade_group?: string };
type SectionRow = { id: string; join_code: string; classroom_id: string };
type Student = { id: string; title?: string; first_name: string; last_name: string; student_number: number; avatar_url?: string };

function QrCodeModal({ inviteUrl, onClose }: { inviteUrl: string; onClose: () => void }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(inviteUrl)}`;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 text-lg mb-3">📷 QR เข้าร่วมวิชา</h3>
        <img src={qrSrc} alt="QR Code" className="mx-auto rounded-xl border-2 border-slate-100" width={260} height={260} />
        <p className="text-slate-400 text-xs mt-3">สแกนเพื่อเข้าร่วมวิชานี้</p>
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ปิด</button>
      </div>
    </div>
  );
}

export default function SmartClassRosterPage() {
  const router = useRouter();
  const params = useParams();
  const subjectId = params?.subjectId as string;
  const sectionId = params?.sectionId as string;

  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [section, setSection] = useState<SectionRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      if (!sectionId) return;

      const { data: sec } = await supabase
        .from("subject_sections").select("id, join_code, classroom_id").eq("id", sectionId).maybeSingle();
      setSection(sec as SectionRow);

      const [{ data: subj }, { data: room }] = await Promise.all([
        supabase.from("subjects").select("id, subject_code, name_th").eq("id", subjectId).maybeSingle(),
        sec?.classroom_id
          ? supabase.from("classrooms").select("id, room_name, grade_group").eq("id", sec.classroom_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setSubject(subj as Subject);
      setClassroom(room as Classroom);

      const { data: enrollments } = await supabase
        .from("subject_enrollments").select("student_id").eq("subject_section_id", sectionId);
      const ids = (enrollments ?? []).map((e: any) => e.student_id);
      if (ids.length > 0) {
        const { data: studentsData } = await supabase
          .from("students").select("id, title, first_name, last_name, student_number, avatar_url")
          .in("id", ids).order("student_number");
        setStudents((studentsData ?? []) as Student[]);
      }

      setLoading(false);
    })();
  }, [subjectId, sectionId]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !section) return "";
    return `${window.location.origin}/join/${section.join_code}`;
  }, [section]);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-black text-lg animate-pulse">กำลังโหลดรายชื่อ...</div>
      </div>
    );
  }
  if (!section || !subject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500 font-black">❌ ไม่พบข้อมูลห้องนี้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {showQr && <QrCodeModal inviteUrl={inviteUrl} onClose={() => setShowQr(false)} />}

      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-4 pt-4 pb-6">
        <button onClick={() => router.push(`/smartclass/${subjectId}`)}
          className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-lg mb-3">←</button>
        <h1 className="text-xl font-black text-white leading-tight">{subject.name_th}</h1>
        <p className="text-white/70 text-sm font-bold">
          {subject.subject_code} · {classroom?.grade_group} {classroom?.room_name} · 👥 {students.length} คน
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-4">
          <div className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-white/70 text-xs font-bold">รหัสเข้าวิชา</span>
            <span className="font-black text-white font-mono tracking-widest">{section.join_code}</span>
          </div>
          <button onClick={copyInvite} className="px-3 py-2 rounded-xl bg-white text-emerald-700 font-black text-xs hover:bg-emerald-50">
            {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกลิงก์เชิญ"}
          </button>
          <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-black text-xs">
            📷 QR
          </button>
        </div>
      </div>

      <main className="p-4 max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-black text-slate-700 text-sm mb-4">👥 รายชื่อนักเรียน</h2>
          {students.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="font-bold text-sm">ยังไม่มีนักเรียนเข้าร่วม — แชร์รหัส/QR ด้านบนให้นักเรียนเข้าวิชานี้</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {students.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-400 text-white text-xs font-black flex items-center justify-center">
                      {s.first_name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate">{s.first_name} {s.last_name}</p>
                    <p className="text-[10px] text-slate-400">เลขที่ {s.student_number}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}