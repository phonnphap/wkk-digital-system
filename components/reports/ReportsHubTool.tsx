"use client";

import { useState } from "react";
import ScoreSheetAssessmentTool from "./ScoreSheetAssessmentTool";
import Vp71Tool from "./Vp71Tool";
import Vp15Report from "./Vp15Report";

type Student = { id: string; prefix?: string; first_name: string; last_name: string; seat_number: number };

const READ_THINK_WRITE_ITEMS = [
  { key: "read", label: "การอ่าน" }, { key: "think", label: "การคิดวิเคราะห์" }, { key: "write", label: "การเขียน" },
];
const CHARACTERISTICS_ITEMS = [
  { key: "1", label: "รักชาติ ศาสน์ กษัตริย์" }, { key: "2", label: "ซื่อสัตย์สุจริต" }, { key: "3", label: "มีวินัย" },
  { key: "4", label: "ใฝ่เรียนรู้" }, { key: "5", label: "อยู่อย่างพอเพียง" }, { key: "6", label: "มุ่งมั่นในการทำงาน" },
  { key: "7", label: "รักความเป็นไทย" }, { key: "8", label: "มีจิตสาธารณะ" },
];

type ReportKey = "vp15" | "vp71" | "readThinkWrite" | "characteristics";

const REPORT_CARDS: { key: ReportKey; label: string; icon: string; desc: string }[] = [
  { key: "readThinkWrite", label: "ประเมินอ่าน-คิด-เขียน", icon: "📖", desc: "ให้คะแนน 3 หัวข้อ ข้อละ 0-3 คะแนน พร้อมสรุปผ่าน/ไม่ผ่านอัตโนมัติ" },
  { key: "characteristics", label: "ประเมินคุณลักษณะอันพึงประสงค์", icon: "🌟", desc: "ให้คะแนน 8 ข้อคุณลักษณะ ข้อละ 0-3 คะแนน" },
  { key: "vp15", label: "วผ.15 (สรุปผลสัมฤทธิ์รายวิชา)", icon: "📊", desc: "สรุปจำนวนนักเรียนตามระดับผลการเรียนของวิชาเดียวกันทุกห้อง — ดู/พิมพ์ได้ทุกคน" },
  { key: "vp71", label: "วผ.7.1 (แผนวัดและประเมินผล)", icon: "📋", desc: "กรอกหน่วยการเรียนรู้+ตัวชี้วัด ใช้ร่วมกันทุกครูที่สอนวิชานี้" },
];

export default function ReportsHubTool({
  sectionId, subjectId, academicYearId, subjectTitle, subjectCode, classroomLabel, students, currentUserId, readOnly,formativeMaxScore,
  midtermMaxScore,
  finalMaxScore,
}: {
  sectionId: string;
  subjectId: string;
  academicYearId?: string | null;
  subjectTitle: string;
  subjectCode: string;
  classroomLabel?: string;
  students: Student[];
  currentUserId?: string;
  readOnly?: boolean;
  formativeMaxScore?: number;   // ★ เพิ่ม
  midtermMaxScore?: number;     // ★ เพิ่ม
  finalMaxScore?: number; 
}) {
  const [active, setActive] = useState<ReportKey | null>(null);

  if (active === "readThinkWrite") {
    return (
      <ScoreSheetAssessmentTool
        sectionId={sectionId} assessmentType="read_think_write"
        title="บันทึกการประเมินอ่าน คิดวิเคราะห์ และเขียน"
        classroomLabel={classroomLabel} subjectTitle={subjectTitle}
        items={READ_THINK_WRITE_ITEMS} maxPerItem={3}
        students={students} currentUserId={currentUserId} readOnly={readOnly}
        onBack={() => setActive(null)}
      />
    );
  }
  if (active === "characteristics") {
    return (
      <ScoreSheetAssessmentTool
        sectionId={sectionId} assessmentType="characteristics"
        title="บันทึกการประเมินคุณลักษณะอันพึงประสงค์"
        classroomLabel={classroomLabel} subjectTitle={subjectTitle}
        items={CHARACTERISTICS_ITEMS} maxPerItem={3}
        students={students} currentUserId={currentUserId} readOnly={readOnly}
        onBack={() => setActive(null)}
      />
    );
  }
  if (active === "vp15") {
    // ★ วผ.15 ให้ทุกคนดู/พิมพ์ได้เสมอ (ไม่มีโหมดแก้ไข)
    return (
      <Vp15Report
        subjectId={subjectId} academicYearId={academicYearId}
        subjectTitle={subjectTitle} subjectCode={subjectCode}
        onBack={() => setActive(null)}
      />
    );
  }
  if (active === "vp71") {
    return (
      <Vp71Tool
        subjectId={subjectId} academicYearId={academicYearId}
        subjectTitle={subjectTitle} subjectCode={subjectCode}
        currentUserId={currentUserId} readOnly={readOnly}
        onBack={() => setActive(null)}
        sectionId={sectionId}
        students={students}
        formativeMaxScore={formativeMaxScore}   
  midtermMaxScore={midtermMaxScore}       
  finalMaxScore={finalMaxScore} 
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-black text-slate-800 text-lg flex items-center gap-2">📁 เอกสาร/รายงาน</h2>
      <p className="text-slate-400 text-xs font-bold -mt-2">เลือกเอกสารที่ต้องการกรอก/พิมพ์/ส่งออก</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_CARDS.map(c => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className="text-left rounded-2xl border-2 border-slate-100 bg-white p-5 hover:border-fuchsia-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{c.icon}</span>
              <span className="font-black text-slate-700 text-sm">{c.label}</span>
            </div>
            <p className="text-slate-400 text-xs font-bold leading-relaxed">{c.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}