"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BookOpen, ArrowRight } from "lucide-react";

const supabase = createClient();

type Classroom = { classroom_id: string; room_name: string; room_number?: number };

type SectionWithSubject = {
  id: string;
  classroom_id: string;
  classroom_name: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
};

export default function Por5SubjectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [sections, setSections] = useState<SectionWithSubject[]>([]);

  useEffect(() => {
    (async () => {
      const { data: classroomData } = await supabase.rpc("get_my_classrooms");
      const myClassrooms = (classroomData ?? []) as Classroom[];
      setClassrooms(myClassrooms);

      if (myClassrooms.length === 0) {
        setLoading(false);
        return;
      }

      const classroomIds = myClassrooms.map(c => c.classroom_id);
      const { data } = await supabase
        .from("subject_sections")
        .select("id, classroom_id, subject_id, is_active, subjects(subject_code, name_th)")
        .in("classroom_id", classroomIds)
        .eq("is_active", true);

      const roomNameMap: Record<string, string> = {};
      myClassrooms.forEach(c => { roomNameMap[c.classroom_id] = c.room_name; });

      const rows: SectionWithSubject[] = (data ?? []).map((r: any) => ({
        id: r.id,
        classroom_id: r.classroom_id,
        classroom_name: roomNameMap[r.classroom_id] ?? "",
        subject_id: r.subject_id,
        subject_code: r.subjects?.subject_code ?? "",
        subject_name: r.subjects?.name_th ?? "ไม่ทราบชื่อวิชา",
      }));

      rows.sort((a, b) => {
        const roomCmp = a.classroom_name.localeCompare(b.classroom_name, "th", { numeric: true });
        if (roomCmp !== 0) return roomCmp;
        return a.subject_name.localeCompare(b.subject_name, "th");
      });

      setSections(rows);
      setLoading(false);
    })();
  }, []);

  // ครูประจำชั้นมากกว่า 1 ห้อง -> จัดกลุ่มแสดงแยกตามห้อง
  // ครูประจำชั้นห้องเดียว (กรณีส่วนใหญ่) -> แสดงเป็นลิสต์วิชาเดียวเลย ไม่ต้องมีหัวข้อห้องกวนตา
  const groupedByClassroom = classrooms.length > 1;

  function SubjectCard({ sec }: { sec: SectionWithSubject }) {
    return (
      <button
        onClick={() => router.push(`/homeroom/por5/subjects/${sec.id}`)}
        className="group text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-blue-200 transition"
      >
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white">
          <BookOpen className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-[15px] font-bold text-slate-800">{sec.subject_name}</h3>
        <p className="mt-1 text-[13px] text-slate-400">{sec.subject_code}</p>
        <div className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-blue-600">
          เปิดดู <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </div>
      </button>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 py-6 lg:px-8">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => router.push("/homeroom/por5")}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-slate-800">ปพ.5 — รายวิชา</h1>
      </div>
      <p className="text-sm text-slate-400 ml-12 mb-6">
        เลือกวิชาเพื่อดูเช็คชื่อ / คะแนนรวม / เชิงลึกของวิชานั้น (ดูอย่างเดียว แก้ไขคะแนนไม่ได้)
      </p>

      {loading ? (
        <p className="text-slate-400 text-sm">กำลังโหลดรายวิชา...</p>
      ) : classrooms.length === 0 ? (
        <p className="text-slate-400 text-sm">ยังไม่พบห้องที่คุณเป็นครูประจำชั้น</p>
      ) : sections.length === 0 ? (
        <p className="text-slate-400 text-sm">ยังไม่พบวิชาที่เปิดสอนให้ห้องของคุณ</p>
      ) : groupedByClassroom ? (
        <div className="space-y-8">
          {classrooms.map(c => {
            const roomSections = sections.filter(s => s.classroom_id === c.classroom_id);
            if (roomSections.length === 0) return null;
            return (
              <div key={c.classroom_id}>
                <h2 className="text-sm font-black text-slate-600 mb-3">ห้อง {c.room_name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {roomSections.map(sec => <SubjectCard key={sec.id} sec={sec} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sections.map(sec => <SubjectCard key={sec.id} sec={sec} />)}
        </div>
      )}
    </div>
  );
}