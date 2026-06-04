"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from "react";

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TeacherUser {
  id: string;
  teacher_id?: string;
  first_name: string;
  last_name?: string;
  role?: string;
  face_features?: any;
}

interface TeachingAssignment {
  subjectGroup: string;
  subjectName: string;
  level: string;
  rooms: string[];
}

export default function AdminFaceRegisterPage() {
  const [faceapi, setFaceapi] = useState<any>(null);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [teachers, setTeachers] = useState<TeacherUser[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherUser | null>(null);
  const [status, setStatus] = useState("🛡️ กำลังเตรียมระบบแอดมิน...");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activeScanAngle, setActiveScanAngle] = useState<"front" | "left" | "right" | null>(null);
  const [descriptorFront, setDescriptorFront] = useState<Float32Array | null>(null);
  const [descriptorLeft, setDescriptorLeft] = useState<Float32Array | null>(null);
  const [descriptorRight, setDescriptorRight] = useState<Float32Array | null>(null);

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isAdminRole, setIsAdminRole] = useState<boolean>(false);

  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<any[]>([]);
  const [subjectName, setSubjectName] = useState("");
  const [subjectGroup, setSubjectGroup] = useState("");

  const [currentSelectedLevel, setCurrentSelectedLevel] = useState("");
  const [currentSelectedRooms, setCurrentSelectedRooms] = useState<string[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<TeachingAssignment[]>([]);

  const [advisorClass, setAdvisorClass] = useState("");
  const [advisorRoom, setAdvisorRoom] = useState("");
  const [headOfSubject, setHeadOfSubject] = useState("");
  const [headOfDepartment, setHeadOfDepartment] = useState("");
  const [executiveRole, setExecutiveRole] = useState("");

  const classOptions = ["อ.2", "อ.3", "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
  const roomOptions = ["1", "2", "3", "4", "5", "6", "7"];
  const subjectGroups = ["ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์และเทคโนโลยี", "สังคมศึกษา ศาสนา และวัฒนธรรม", "สุขศึกษาและพลศึกษา", "ศิลปะ", "การงานอาชีพ", "กิจกรรมพัฒนาผู้เรียน", "ปฐมวัย", "ภาษาต่างประเทศ"];
  const workDepartments = ["กลุ่มบริหารวิชาการ", "กลุ่มบริหารงบประมาณ", "กลุ่มบริหารงานบุคคล", "กลุ่มบริหารทั่วไป"];
  const executivePositions = ["ผู้อำนวยการโรงเรียน", "รองผู้อำนวยการกลุ่มบริหารวิชาการ", "รองผู้อำนวยการกลุ่มบริหารงบประมาณ", "รองผู้อำนวยการกลุ่มบริหารงานบุคคล", "รองผู้อำนวยการกลุ่มบริหารทั่วไป"];

  useEffect(() => {
    async function initializeSystem() {
      try {
        setStatus("กำลังดึงข้อมูลรายชื่อบุคลากรและรายวิชา...");

        const { data: teacherData, error: teacherError } = await supabase
          .from('users')
          .select('id, teacher_id, first_name, last_name, role, face_features')
          .order('first_name', { ascending: true });

        if (teacherError || !teacherData || teacherData.length === 0) {
          setTeachers([{
            id: "1abc43588",
            teacher_id: "T001",
            first_name: "พรนภา",
            last_name: "เปี่ยมถาวร",
            role: "admin"
          }]);
        } else {
          setTeachers(teacherData);
        }

        try {
          const res = await fetch('/api/subjects');
          if (res.ok) {
            const subjectData = await res.json();
            setAllSubjects(subjectData);
          } else {
            const { data: subjectData, error: subjectError } = await supabase
              .from('subjects')
              .select('id, subject_code, name_th, subject_group');
            if (!subjectError && subjectData) {
              setAllSubjects(subjectData);
            }
          }
        } catch {
          const { data: subjectData, error: subjectError } = await supabase
            .from('subjects')
            .select('id, subject_code, name_th, subject_group');
          if (!subjectError && subjectData) {
            setAllSubjects(subjectData);
          }
        }
        
        const fa = await import('face-api.js');
        setFaceapi(fa);  // เก็บไว้ใช้ในฟังก์ชันอื่น

        if (!fa.nets.ssdMobilenetv1.isLoaded) {  // ✅ ใช้ fa โดยตรง
          await fa.nets.ssdMobilenetv1.loadFromUri('/models');
          await fa.nets.faceLandmark68Net.loadFromUri('/models');
          await fa.nets.faceRecognitionNet.loadFromUri('/models');
        }

        setModelsLoaded(true);
        setStatus("🟢 ระบบ AI และฐานข้อมูลสัมพันธ์พร้อมทำงาน 100%");
      } catch (err: any) {
        setStatus("❌ ข้อผิดพลาด: " + err.message);
      }
    }
    initializeSystem();
    return () => stopVideo();
  }, []);

  // 🔄 ระบบกรองรายวิชาอัจฉริยะตาม กลุ่มสาระ + ระดับชั้น (อ้างอิงหลักการรหัสวิชา)
  useEffect(() => {
    if (!subjectGroup) {
      setFilteredSubjects([]);
      return;
    }

    const filtered = allSubjects.filter(sub => {
      // 1. ตรวจสอบกลุ่มสาระก่อน
      if (!sub.subject_group) return false;
      const dbGroup = String(sub.subject_group).trim().toLowerCase();
      const selectedGroup = String(subjectGroup).trim().toLowerCase();
      if (dbGroup !== selectedGroup) return false;

      // 2. ถ้ายังไม่ได้เลือกชั้นเรียน ให้แสดงรายวิชาทั้งหมดในหมวดนั้นรอก่อน
      if (!currentSelectedLevel) return true;

      // 3. เริ่มวิเคราะห์รหัสวิชาตามเงื่อนไข (เช่น ว11282)
      const code = String(sub.subject_code || "").trim();
      // ค้นหาตำแหน่งที่เป็นตัวเลขตัวแรกในรหัสวิชา
      const numMatch = code.match(/\d/);
      if (!numMatch || numMatch.index === undefined) return true; // ถ้ารหัสไม่มีตัวเลข ให้หลุดไปให้เลือกก่อน

      const startIdx = numMatch.index;
      const digit1 = code.charAt(startIdx);     // เลขหลักที่ 1 หลังตัวอักษร (ช่วงชั้น)
      const digit2 = code.charAt(startIdx + 1); // เลขหลักที่ 2 หลังตัวอักษร (ชั้นเรียนย่อย)

      // ตรวจสอบความสอดคล้องกับชั้นเรียนที่เลือกไว้ด้านบน
      if (currentSelectedLevel.startsWith("ป.")) {
        const targetClassNum = currentSelectedLevel.replace("ป.", ""); // ดึงเลขชั้น เช่น "1"
        return digit1 === "1" && digit2 === targetClassNum;
      } 
      
      if (currentSelectedLevel.startsWith("ม.")) {
        const targetClassNum = currentSelectedLevel.replace("ม.", ""); // ดึงเลขชั้น เช่น "3"
        return digit1 === "2" && digit2 === targetClassNum;
      }

      // ถ้าเป็นระดับชั้นอนุบาล (อ.1 - อ.3) ให้ผ่านไปแสดงได้เลย
      return true;
    });

    setFilteredSubjects(filtered);
  }, [subjectGroup, currentSelectedLevel, allSubjects]);

  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    setActiveScanAngle(null);
  };

  const startVideo = async (angle: "front" | "left" | "right") => {
    if (!selectedTeacher) {
      alert("กรุณาเลือกรายชื่อคุณครูในระบบก่อน");
      return;
    }
    stopVideo();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        setActiveScanAngle(angle);
        if (angle === "front") setStatus("📸 กรุณามองตรงนิ่งๆ แล้วกดปุ่ม 'บันทึกภาพหน้าตรง'");
        if (angle === "left") setStatus("📸 กรุณาเบือนหน้าเอียงซ้ายเล็กน้อย แล้วกดปุ่ม 'บันทึกภาพมุมซ้าย'");
        if (angle === "right") setStatus("📸 กรุณาเบือนหน้าเอียงขวาเล็กน้อย แล้วกดปุ่ม 'บันทึกภาพมุมขวา'");
      }
    } catch (err: any) {
      setStatus("❌ สัญญาณกล้องขัดข้อง: " + err.message);
    }
  };

  const captureAngleData = async () => {
    if (!videoRef.current || !isCameraActive || !activeScanAngle) return;
    setStatus("⏳ AI กำลังสกัดจุดพิกัดใบหน้า...");
    try {
      if (!faceapi) return;  // เพิ่ม guard
      const detection = await faceapi.detectSingleFace(
        videoRef.current,
        new faceapi.SsdMobilenetv1Options()
      ).withFaceLandmarks().withFaceDescriptor();

      if (detection) {
        const descriptorArray = detection.descriptor;
        if (activeScanAngle === "front") { setDescriptorFront(descriptorArray); setStatus("🎯 บันทึกพิกัดใบหน้า 'ตรง' สำเร็จ!"); }
        else if (activeScanAngle === "left") { setDescriptorLeft(descriptorArray); setStatus("🎯 บันทึกพิกัดใบหน้า 'เอียงซ้าย' สำเร็จ!"); }
        else if (activeScanAngle === "right") { setDescriptorRight(descriptorArray); setStatus("🎯 บันทึกพิกัดใบหน้า 'เอียงขวา' สำเร็จ!"); }
        alert("จับจุดใบหน้ามุมนี้เรียบร้อย");
        stopVideo();
      } else {
        setStatus("❌ AI ตรวจไม่พบใบหน้าในมุมนี้ กรุณาจัดหน้าให้อยู่ในกรอบวงกลมแล้วลองอีกครั้ง");
        alert("ตรวจไม่พบใบหน้า กรุณาปรับมุมใบหน้าให้ชัดเจน");
      }
    } catch (e: any) {
      setStatus("❌ เกิดข้อผิดพลาดขณะสแกน: " + e.message);
    }
  };

  const handleRoomToggle = (room: string) => {
    if (currentSelectedRooms.includes(room)) {
      setCurrentSelectedRooms(currentSelectedRooms.filter(r => r !== room));
    } else {
      setCurrentSelectedRooms([...currentSelectedRooms, room]);
    }
  };

  const addTeachingAssignment = () => {
    if (!subjectGroup) { alert("กรุณาเลือกกลุ่มสาระการเรียนรู้ก่อน"); return; }
    if (!currentSelectedLevel) { alert("กรุณาเลือกระดับชั้นเรียนก่อน"); return; }
    if (!subjectName) { alert("กรุณาเลือกรายวิชาที่ทำการสอนก่อน"); return; }
    if (currentSelectedRooms.length === 0) { alert("กรุณาเลือกห้องเรียนอย่างน้อย 1 ห้อง"); return; }

    const existingIndex = teachingAssignments.findIndex(
      a => a.subjectGroup === subjectGroup && a.subjectName === subjectName && a.level === currentSelectedLevel
    );

    if (existingIndex > -1) {
      const updated = [...teachingAssignments];
      const mergedRooms = Array.from(new Set([...updated[existingIndex].rooms, ...currentSelectedRooms]));
      updated[existingIndex].rooms = mergedRooms.sort();
      setTeachingAssignments(updated);
    } else {
      setTeachingAssignments([
        ...teachingAssignments, 
        { 
          subjectGroup,
          subjectName,
          level: currentSelectedLevel, 
          rooms: [...currentSelectedRooms].sort() 
        }
      ]);
    }
    setCurrentSelectedRooms([]);
  };

  const removeAssignment = (index: number) => {
    setTeachingAssignments(teachingAssignments.filter((_, i) => i !== index));
  };

  const handleRoleCheckboxChange = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSaveAllData = async () => {
    if (!selectedTeacher) return;
    setIsSaving(true);
    setStatus("💾 กำลังจัดโครงสร้างข้อมูลและนำส่งสิทธิ์เข้าฐานข้อมูล...");
    try {
      const roleDetailsPayload = {
        roles: selectedRoles,
        is_admin: isAdminRole,
        teaching_assignments: selectedRoles.includes("subject_teacher") ? { matrix: teachingAssignments } : null,
        advisor_details: selectedRoles.includes("advisor_teacher") ? { class: advisorClass, room: advisorRoom } : null,
        head_of_subject: selectedRoles.includes("head_of_subject") ? headOfSubject : null,
        head_of_department: selectedRoles.includes("head_of_department") ? headOfDepartment : null,
        executive_detail: selectedRoles.includes("executive") ? executiveRole : null,
      };

      const faceFeaturesPayload = {
        front: descriptorFront ? Array.from(descriptorFront) : null,
        left: descriptorLeft ? Array.from(descriptorLeft) : null,
        right: descriptorRight ? Array.from(descriptorRight) : null
      };

      const updatePayload: any = { role_metadata: roleDetailsPayload };
      if (descriptorFront || descriptorLeft || descriptorRight) {
        updatePayload.face_features = faceFeaturesPayload;
      }

      const { error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', selectedTeacher.id);

      if (error) throw error;

      setStatus("✅ บันทึกโครงสร้างบทบาทและใบหน้า 3 มุมสำเร็จ!");
      alert("จัดเก็บพิกัดโครงสร้างใบหน้าครบ 3 มิติ และสิทธิ์งานสอนเรียบร้อย");
      setDescriptorFront(null);
      setDescriptorLeft(null);
      setDescriptorRight(null);
      setTeachingAssignments([]);
      setIsAdminRole(false);
    } catch (err: any) {
      setStatus("❌ ข้อผิดพลาด RLS/Write: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <div className="w-full max-w-5xl bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-2xl mt-2">
        <h1 className="text-base font-bold text-cyan-400 mb-1 flex items-center gap-2">
          ⚙️ ระบบจัดการสิทธิ์บุคลากรและลงทะเบียนใบหน้าแบบความแม่นยำสูง
        </h1>
        <p className="text-xs text-slate-400 mb-6 border-b border-slate-800 pb-3">
          สแกนจัดเก็บอัตลักษณ์ใบหน้าด้วยตนเองทีละมุมมอง พร้อมระบบจัดการภาระงานสอนรายชั้นเรียนสัมพันธ์รายวิชาในระบบ
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* ส่วนซ้าย: กล้อง */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center bg-slate-950 rounded-xl p-4 border border-slate-800 sticky top-4">
            <div className="mb-3 w-full flex flex-col gap-1.5 text-xs">
              <span className="text-[10px] text-slate-400 font-bold block mb-0.5">เลือกมุมที่ต้องการเปิดกล้องสแกน:</span>
              <div className="flex justify-between gap-1 text-[10px] text-center">
                <button type="button" onClick={() => startVideo("front")} disabled={!selectedTeacher} className={`flex-1 p-2 rounded border transition-all ${descriptorFront ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold' : activeScanAngle === 'front' ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold ring-1 ring-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'}`}>
                  1. มุมหน้าตรง {descriptorFront ? "✓" : ""}
                </button>
                <button type="button" onClick={() => startVideo("left")} disabled={!selectedTeacher} className={`flex-1 p-2 rounded border transition-all ${descriptorLeft ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold' : activeScanAngle === 'left' ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold ring-1 ring-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'}`}>
                  2. มุมเอียงซ้าย {descriptorLeft ? "✓" : ""}
                </button>
                <button type="button" onClick={() => startVideo("right")} disabled={!selectedTeacher} className={`flex-1 p-2 rounded border transition-all ${descriptorRight ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold' : activeScanAngle === 'right' ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold ring-1 ring-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'}`}>
                  3. มุมเอียงขวา {descriptorRight ? "✓" : ""}
                </button>
              </div>
            </div>

            <div className="relative w-[220px] h-[220px] rounded-full overflow-hidden border-4 border-slate-700 bg-slate-900 flex items-center justify-center shadow-2xl">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              {!isCameraActive && (
                <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center text-slate-400 text-xs text-center p-4">
                  เลือกปุ่มมุมใบหน้าด้านบน<br />เพื่อเปิดกล้องบันทึกข้อมูลทีละด้าน
                </div>
              )}
            </div>

            <div className="mt-4 w-full max-w-[220px] flex flex-col gap-2">
              {isCameraActive && (
                <>
                  <button type="button" onClick={captureAngleData} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold py-2.5 px-4 rounded-full text-xs shadow-md transition-all">
                    📸 บันทึกภาพมุม {activeScanAngle === 'front' ? 'หน้าตรง' : activeScanAngle === 'left' ? 'เอียงซ้าย' : 'เอียงขวา'}
                  </button>
                  <button type="button" onClick={stopVideo} className="w-full bg-slate-900 hover:bg-slate-850 text-slate-400 font-medium py-1.5 px-4 rounded-full text-[11px] border border-slate-800">
                    ⏹️ ปิดกล้องหน้าต่างนี้
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ส่วนขวา: ฟอร์ม */}
          <div className="lg:col-span-8 space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">รายชื่อบุคลากรที่ต้องการตั้งค่า:</label>
              <select
                onChange={(e) => {
                  setSelectedTeacher(teachers.find(t => t.id === e.target.value) || null);
                  stopVideo();
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
              >
                <option value="">-- เลือกครูผู้ลงทะเบียน --</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.last_name || ""} {t.face_features ? "🟢" : "🔴"}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-cyan-400">บทบาทหน้าที่และสิทธิ์ภาระงานสอน:</label>

              {/* 1. ครูผู้สอนประจำวิชา */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={selectedRoles.includes("subject_teacher")} onChange={() => handleRoleCheckboxChange("subject_teacher")} disabled={!selectedTeacher} className="rounded bg-slate-950 border-slate-800 text-cyan-500" />
                  <span>ครูผู้สอนประจำวิชา</span>
                </label>

                {selectedRoles.includes("subject_teacher") && (
                  <div className="mt-3 pl-6 space-y-3 border-l-2 border-slate-800 animate-fadeIn">
                    
                    {/* 1. เลือกหมวด & 2. เลือกชั้นเรียน */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1">1. เลือกหมวด (กลุ่มสาระการเรียนรู้):</span>
                        <select value={subjectGroup} onChange={(e) => { setSubjectGroup(e.target.value); setSubjectName(""); }}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full"
                        >
                          <option value="">-- เลือกกลุ่มสาระ --</option>
                          {subjectGroups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>

                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1">2. เลือกระดับชั้นเรียน:</span>
                        <select value={currentSelectedLevel} onChange={(e) => { setCurrentSelectedLevel(e.target.value); setSubjectName(""); }} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full">
                          <option value="">-- เลือกชั้น --</option>
                          {classOptions.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* 3. เลือกวิชา (ที่ผ่านการคัดกรองตามหมวดและระดับชั้นแล้ว) */}
                    <div>
                      <span className="block text-[11px] text-slate-400 mb-1">
                        3. เลือกรายวิชา (สัมพันธ์ตามชั้นเรียนที่เลือก):
                      </span>
                      <select
                        value={subjectName}
                        onChange={(e) => setSubjectName(e.target.value)}
                        disabled={!subjectGroup || !currentSelectedLevel || filteredSubjects.length === 0}
                        className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full disabled:bg-slate-900 disabled:text-slate-600"
                      >
                        <option value="">
                          {!subjectGroup
                            ? "-- เลือกกลุ่มสาระก่อน --"
                            : !currentSelectedLevel
                              ? "-- เลือกระดับชั้นเรียนก่อน --"
                              : filteredSubjects.length === 0
                                ? "-- ไม่มีรายวิชาที่ตรงกับรหัสชั้นเรียนนี้ --"
                                : "-- เลือกรายวิชาในระบบ --"}
                        </option>
                        {filteredSubjects.map((sub) => (
                          <option key={sub.id} value={sub.name_th}>
                            {sub.name_th} {sub.subject_code ? `[${sub.subject_code}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 4. เลือกห้องเรียน & ปุ่มบันทึกรายการสอน */}
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 space-y-3">
                      <div>
                        <span className="block text-[11px] font-semibold text-cyan-400 mb-1.5">4. เลือกห้องเรียนที่ทำการสอน:</span>
                        <div className="flex flex-wrap gap-1 items-center bg-slate-900 p-2 rounded border border-slate-800">
                          {roomOptions.map(rm => (
                            <button type="button" key={rm} onClick={() => handleRoomToggle(rm)} className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all ${currentSelectedRooms.includes(rm) ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                              ห้อง {rm}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <button type="button" onClick={addTeachingAssignment} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs py-2 rounded-lg font-bold shadow-md transition-all">
                        import_contacts_with_check ✔️ บันทึก (เพิ่มรายการภาระงานสอนนี้)
                      </button>
                    </div>

                    {/* รายการแสดงผลผลลัพธ์ */}
                    <div>
                      <span className="block text-[11px] text-slate-400 mb-1 font-semibold">📋 รายการภาระงานสอนที่บันทึกเรียบร้อยแล้ว:</span>
                      {teachingAssignments.length === 0 ? (
                        <p className="text-[10px] text-slate-600 italic bg-slate-950 p-2 rounded text-center border border-dashed border-slate-800">ยังไม่มีรายชื่อห้องเรียนที่ผูกกับรายวิชาในแผงนี้</p>
                      ) : (
                        <div className="space-y-1">
                          {teachingAssignments.map((assign, idx) => (
                            <div key={idx} className="flex justify-between items-start bg-slate-950 px-3 py-2 rounded border border-slate-800 text-xs gap-4">
                              <span className="leading-relaxed">
                                📚 หมวด: <strong className="text-cyan-400">{assign.subjectGroup}</strong> | 
                                ชั้น: <strong className="text-purple-400">{assign.level}</strong> | 
                                วิชา: <strong className="text-amber-400">{assign.subjectName}</strong> <br />
                                <span className="text-slate-400 text-[11px]">🚪 ห้องเรียน: {assign.rooms.map(r => `ห้อง ${r}`).join(", ")}</span>
                              </span>
                              <button type="button" onClick={() => removeAssignment(idx)} className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold pt-0.5 shrink-0">ลบออก</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. ครูที่ปรึกษาประจำชั้น */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={selectedRoles.includes("advisor_teacher")} onChange={() => handleRoleCheckboxChange("advisor_teacher")} disabled={!selectedTeacher} className="rounded bg-slate-950 border-slate-800 text-cyan-500" />
                  <span>ครูที่ปรึกษาประจำชั้น</span>
                </label>
                {selectedRoles.includes("advisor_teacher") && (
                  <div className="mt-3 pl-6 grid grid-cols-2 gap-3 border-l-2 border-slate-800 animate-fadeIn">
                    <div>
                      <span className="block text-[11px] text-slate-400 mb-1">ระดับชั้นเรียน:</span>
                      <select value={advisorClass} onChange={(e) => setAdvisorClass(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full">
                        <option value="">-- เลือกชั้น --</option>
                        {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 mb-1">ห้องเรียนประจำการ:</span>
                      <select value={advisorRoom} onChange={(e) => setAdvisorRoom(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full">
                        <option value="">-- เลือกห้อง --</option>
                        {roomOptions.map(r => <option key={r} value={r}>/{r}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. หัวหน้ากลุ่มสาระ */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={selectedRoles.includes("head_of_subject")} onChange={() => handleRoleCheckboxChange("head_of_subject")} disabled={!selectedTeacher} className="rounded bg-slate-950 border-slate-800 text-cyan-500" />
                  <span>หัวหน้ากลุ่มสาระการเรียนรู้</span>
                </label>
                {selectedRoles.includes("head_of_subject") && (
                  <div className="mt-3 pl-6 border-l-2 border-slate-800 animate-fadeIn">
                    <select value={headOfSubject} onChange={(e) => setHeadOfSubject(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full">
                      <option value="">-- กลุ่มสาระการเรียนรู้ --</option>
                      {subjectGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 4. หัวหน้ากลุ่มงาน */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={selectedRoles.includes("head_of_department")} onChange={() => handleRoleCheckboxChange("head_of_department")} disabled={!selectedTeacher} className="rounded bg-slate-950 border-slate-800 text-cyan-500" />
                  <span>หัวหน้ากลุ่มงาน</span>
                </label>
                {selectedRoles.includes("head_of_department") && (
                  <div className="mt-3 pl-6 border-l-2 border-slate-800 animate-fadeIn">
                    <select value={headOfDepartment} onChange={(e) => setHeadOfDepartment(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full">
                      <option value="">-- เลือกกลุ่มงานบริหาร --</option>
                      {workDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 5. ฝ่ายบริหาร */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={selectedRoles.includes("executive")} onChange={() => handleRoleCheckboxChange("executive")} disabled={!selectedTeacher} className="rounded bg-slate-950 border-slate-800 text-cyan-500" />
                  <span>ฝ่ายบริหาร (ผู้บริหารสถานศึกษา)</span>
                </label>
                {selectedRoles.includes("executive") && (
                  <div className="mt-3 pl-6 border-l-2 border-slate-800 animate-fadeIn">
                    <select value={executiveRole} onChange={(e) => setExecutiveRole(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white w-full">
                      <option value="">-- เลือกตำแหน่งผู้บริหาร --</option>
                      {executivePositions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 6. Admin */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40 mt-4">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-amber-400">
                  <input type="checkbox" checked={isAdminRole} onChange={(e) => setIsAdminRole(e.target.checked)} disabled={!selectedTeacher} className="rounded bg-slate-950 border-slate-800 text-amber-500" />
                  <span>เปิดสิทธิ์ผู้ดูแลระบบดิจิทัลประจำโรงเรียน (Admin Account)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-block text-xs font-medium text-amber-300 bg-slate-950 px-5 py-2.5 rounded-xl border border-slate-800 max-w-full break-words">
            คำแนะนำระบบ: {status}
          </div>
        </div>

        {/* ปุ่มบันทึกหลักลงฐานข้อมูล */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full sm:w-1/4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-4 rounded-xl shadow-md transition-all text-xs border border-slate-700"
          >
            🏠 กลับสู่หน้าหลัก
          </button>
          
          <button
            type="button"
            onClick={handleSaveAllData}
            disabled={!selectedTeacher || isSaving}
            className="w-full sm:w-3/4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all text-xs"
          >
            {isSaving ? "⏳ กำลังบันทึกภาระสิทธิ์งานสอนและสแกนเนอร์..." : "💾 บันทึกสิทธิ์และชุดพิกัดโครงสร้างใบหน้า 3 มุมมองลงฐานข้อมูล"}
          </button>
        </div>
      </div>
    </div>
  );
}