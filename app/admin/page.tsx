"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from "react";
import { useRouter } from 'next/navigation';
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

interface TeacherUser {
  id: string;
  teacher_id?: string;
  first_name: string;
  last_name?: string;
  role?: string;
  face_features?: any;
}

const REQUIRED_STABLE_FRAMES = 6; // ต้องตรวจพบหน้านิ่งต่อเนื่องกี่เฟรมถึงจะถ่ายอัตโนมัติ
const SCAN_INTERVAL_MS = 250;

// ── liveness (กันภาพนิ่ง/รูปถ่ายมาลงทะเบียนแทนตัวจริง) ─────────────────────
// นอกจากต้องนิ่งครบเฟรมแล้ว ยังต้องตรวจพบ "การกระพริบตา" อย่างน้อย 1 ครั้ง
// ระหว่างสแกนก่อนจะยอมบันทึกพิกัดใบหน้า วัดจาก Eye Aspect Ratio (EAR)
const EAR_OPEN_THRESHOLD = 0.25;
const EAR_CLOSED_THRESHOLD = 0.19;

function eyeAspectRatio(eye: { x: number; y: number }[]): number {
  if (!eye || eye.length < 6) return 1;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const A = dist(eye[1], eye[5]);
  const B = dist(eye[2], eye[4]);
  const C = dist(eye[0], eye[3]);
  if (C === 0) return 1;
  return (A + B) / (2 * C);
}

/* ── ไอคอนเส้นสไตล์ SF Symbols ── */
function IconHome({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v8.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function IconCamera({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-1.8A1.5 1.5 0 0 1 10.45 4.5h3.1a1.5 1.5 0 0 1 1.25.7L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconEye({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconCheck({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdminFaceRegisterPage() {
  const [faceapi, setFaceapi] = useState<any>(null);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanActiveRef = useRef(false);
  const scanTimeoutRef = useRef<number | null>(null);
  const stableFrameCountRef = useRef(0);
  const eyeOpenRef = useRef(true);
  const blinkFoundRef = useRef(false);

  const [teachers, setTeachers] = useState<TeacherUser[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherUser | null>(null);
  const [status, setStatus] = useState("กำลังเตรียมระบบแอดมิน...");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activeScanAngle, setActiveScanAngle] = useState<"front" | "left" | "right" | null>(null);
  const [descriptorFront, setDescriptorFront] = useState<Float32Array | null>(null);
  const [descriptorLeft, setDescriptorLeft] = useState<Float32Array | null>(null);
  const [descriptorRight, setDescriptorRight] = useState<Float32Array | null>(null);

  const [scanFeedback, setScanFeedback] = useState("");
  const [justCaptured, setJustCaptured] = useState(false);

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isAdminRole, setIsAdminRole] = useState<boolean>(false);

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

  const anglesCaptured = [descriptorFront, descriptorLeft, descriptorRight].filter(Boolean).length;

  useEffect(() => {
    async function initializeSystem() {
      try {
        setStatus("กำลังดึงข้อมูลรายชื่อบุคลากร...");

        // ผูกกับตาราง users เดิมโดยตรง — ไม่มีการสร้างผู้ใช้ใหม่หรือสคีมาใหม่ใด ๆ
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

        setStatus("กำลังโหลดโมเดล AI สำหรับจดจำใบหน้า...");
        const fa = await import('face-api.js');
        setFaceapi(fa);

        if (!fa.nets.ssdMobilenetv1.isLoaded) {
          await fa.nets.ssdMobilenetv1.loadFromUri('/models');
          await fa.nets.faceLandmark68Net.loadFromUri('/models');
          await fa.nets.faceRecognitionNet.loadFromUri('/models');
        }

        setModelsLoaded(true);
        setStatus("ระบบ AI พร้อมใช้งาน");
      } catch (err: any) {
        setStatus("ข้อผิดพลาด: " + err.message);
      }
    }
    initializeSystem();
    return () => stopVideo();
  }, []);

  const stopVideo = () => {
    scanActiveRef.current = false;
    if (scanTimeoutRef.current) { window.clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    stableFrameCountRef.current = 0;
    eyeOpenRef.current = true;
    blinkFoundRef.current = false;
    setScanFeedback("");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    setActiveScanAngle(null);
  };

  function angleLabel(angle: "front" | "left" | "right") {
    return angle === "front" ? "หน้าตรง" : angle === "left" ? "เอียงซ้าย" : "เอียงขวา";
  }

  const startVideo = async (angle: "front" | "left" | "right") => {
    if (!selectedTeacher) { alert("กรุณาเลือกรายชื่อคุณครูในระบบก่อน"); return; }
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
        setStatus(`กำลังสแกนมุม${angleLabel(angle)}อัตโนมัติ — อยู่นิ่ง ๆ ในกรอบวงกลม`);
        setScanFeedback("กำลังเตรียมกล้อง...");
        stableFrameCountRef.current = 0;
        eyeOpenRef.current = true;
        blinkFoundRef.current = false;
        scanActiveRef.current = true;
        window.setTimeout(() => scanLoop(angle), 500);
      }
    } catch (err: any) {
      setStatus("สัญญาณกล้องขัดข้อง: " + err.message);
    }
  };

  // ★ สแกนอัตโนมัติต่อเนื่อง: ต้องนิ่งครบเฟรม "และ" ตรวจพบการกระพริบตาอย่างน้อย 1
  // ครั้งก่อนจึงจะยอมถ่ายให้ — ป้องกันการยกรูปถ่าย/ภาพนิ่งมาลงทะเบียนแทนตัวจริง
  async function scanLoop(angle: "front" | "left" | "right") {
    if (!scanActiveRef.current || !videoRef.current || !faceapi) return;
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!scanActiveRef.current) return;

      if (detection) {
        stableFrameCountRef.current += 1;

        // ติดตามการกระพริบตาไปพร้อมกันตลอดช่วงสแกนของมุมนี้
        const leftEAR = eyeAspectRatio(detection.landmarks.getLeftEye());
        const rightEAR = eyeAspectRatio(detection.landmarks.getRightEye());
        const avgEAR = (leftEAR + rightEAR) / 2;
        if (eyeOpenRef.current && avgEAR < EAR_CLOSED_THRESHOLD) {
          eyeOpenRef.current = false;
        } else if (!eyeOpenRef.current && avgEAR > EAR_OPEN_THRESHOLD) {
          eyeOpenRef.current = true;
          blinkFoundRef.current = true;
        }

        const stableReady = stableFrameCountRef.current >= REQUIRED_STABLE_FRAMES;

        if (stableReady && blinkFoundRef.current) {
          scanActiveRef.current = false;
          await finalizeCapture(angle, detection.descriptor);
          return;
        } else if (stableReady && !blinkFoundRef.current) {
          setScanFeedback("เกือบเสร็จแล้ว — กระพริบตาเบา ๆ อีกครั้งเพื่อยืนยันว่าเป็นคนจริง");
        } else {
          setScanFeedback(`ตรวจพบใบหน้า กำลังยืนยัน (${stableFrameCountRef.current}/${REQUIRED_STABLE_FRAMES})`);
        }
      } else {
        stableFrameCountRef.current = 0;
        setScanFeedback("จัดใบหน้าให้อยู่กึ่งกลางวงกลม");
      }
    } catch {
      // ข้าม error ชั่วคราวระหว่างสแกน ไม่ต้องหยุด loop
    }
    scanTimeoutRef.current = window.setTimeout(() => scanLoop(angle), SCAN_INTERVAL_MS);
  }

  async function finalizeCapture(angle: "front" | "left" | "right", descriptor: Float32Array) {
    if (angle === "front") setDescriptorFront(descriptor);
    else if (angle === "left") setDescriptorLeft(descriptor);
    else setDescriptorRight(descriptor);

    setJustCaptured(true);
    setScanFeedback("ยืนยันตัวจริงและบันทึกใบหน้าสำเร็จ");
    setStatus(`บันทึกพิกัดใบหน้ามุม${angleLabel(angle)}สำเร็จ!`);
    window.setTimeout(() => { setJustCaptured(false); stopVideo(); }, 700);
  }

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
    setStatus("กำลังบันทึกสิทธิ์เข้าฐานข้อมูล...");
    try {
      const roleDetailsPayload = {
        roles: selectedRoles,
        is_admin: isAdminRole,
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

      // อัปเดตแถวผู้ใช้เดิมในตาราง users โดยตรงด้วย id ที่เลือกไว้ — ไม่มีการสร้างบัญชีใหม่
      const { data: updatedRows, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', selectedTeacher.id)
        .select('id');

      if (error) throw error;

      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
          'ไม่มีแถวไหนถูกแก้ไขเลย (0 rows) — มักเกิดจาก RLS Policy ของตาราง users ' +
          'ไม่อนุญาตให้บัญชีแอดมินแก้ไขข้อมูลของผู้ใช้คนอื่น กรุณาตรวจสอบ Policy UPDATE'
        );
      }

      if (anglesCaptured === 0) {
        setStatus("บันทึกสิทธิ์สำเร็จ แต่ยังไม่มีข้อมูลใบหน้าถูกบันทึกเลย (0/3 มุม)");
        alert("บันทึกสิทธิ์/บทบาทสำเร็จ\nแต่ยังไม่ได้ถ่ายภาพใบหน้าแม้แต่มุมเดียว");
      } else if (anglesCaptured < 3) {
        setStatus(`บันทึกสำเร็จ แต่ถ่ายใบหน้าได้ ${anglesCaptured}/3 มุม (ยังไม่ครบ)`);
        alert(`บันทึกสำเร็จ\nแต่ถ่ายใบหน้าได้เพียง ${anglesCaptured}/3 มุม\nแนะนำให้ถ่ายให้ครบ 3 มุม`);
      } else {
        setStatus("บันทึกโครงสร้างบทบาทและใบหน้าครบ 3 มุมสำเร็จ!");
        alert("จัดเก็บพิกัดใบหน้าครบ 3 มุม และสิทธิ์เรียบร้อย");
      }
      if (anglesCaptured === 3) {
        setDescriptorFront(null);
        setDescriptorLeft(null);
        setDescriptorRight(null);
      }
      setIsAdminRole(false);
    } catch (err: any) {
      setStatus("ข้อผิดพลาด: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls = "bg-white border border-black/10 rounded-xl px-3 py-2.5 text-[14px] text-[#1D1D1F] w-full focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/15 focus:outline-none transition-all";
  const boxCls = "border border-black/[0.06] rounded-2xl p-4 bg-black/[0.015]";

  return (
    <div
      className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Thai', 'Sarabun', 'Noto Sans Thai', sans-serif" }}
    >
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap');
      `}</style>

      {/* ── Nav bar โปร่งแสงสไตล์ Apple ── */}
      <div className="sticky top-0 z-40 bg-white/75 backdrop-blur-xl border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.07] flex items-center justify-center text-[#1D1D1F] shrink-0 transition-colors active:scale-95">
            <IconHome className="w-4.5 h-4.5" />
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-[#1D1D1F] leading-none">จัดการสิทธิ์บุคลากร &amp; ลงทะเบียนใบหน้า</h1>
            <p className="text-[#86868B] text-xs mt-1">สแกนใบหน้าอัตโนมัติพร้อมยืนยันตัวจริง + กำหนดบทบาทหน้าที่</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <div className="bg-white/90 backdrop-blur border border-black/5 rounded-[32px] shadow-[0_2px_40px_-12px_rgba(0,0,0,0.15)] p-6">

          <p className="text-[13px] text-[#86868B] mb-1 border-b border-black/[0.05] pb-3">
            สแกนจัดเก็บอัตลักษณ์ใบหน้าอัตโนมัติทีละมุม พร้อมกำหนดบทบาทหน้าที่ในระบบ
          </p>
          <p className="text-[13px] text-[#0A84FF] mb-6 font-medium flex items-center gap-1.5">
            <IconEye className="w-4 h-4" />
            กล้องจะสแกนและถ่ายให้อัตโนมัติเมื่อใบหน้านิ่งอยู่ในกรอบและกระพริบตาตามปกติ — เพื่อยืนยันว่าเป็นคนจริง ไม่ใช่รูปถ่าย
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ส่วนซ้าย: กล้อง */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center bg-[#FAFAFA] rounded-[28px] p-4 border border-black/5 sticky top-20">
              <div className="mb-3 w-full flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[#86868B] font-medium">เลือกมุมที่ต้องการสแกน</span>
                  <span className="text-[#0A84FF] font-semibold">{anglesCaptured}/3 มุม</span>
                </div>
                <div className="flex gap-1.5 mb-1">
                  {[descriptorFront, descriptorLeft, descriptorRight].map((d, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${d ? 'bg-[#30D158]' : 'bg-black/10'}`} />
                  ))}
                </div>
                <div className="flex justify-between gap-1 text-[11px] text-center">
                  <button type="button" onClick={() => startVideo("front")} disabled={!selectedTeacher}
                    className={`flex-1 p-2 rounded-xl border font-semibold transition-all ${descriptorFront ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#1E8E3E]' : activeScanAngle === 'front' ? 'bg-[#0A84FF]/10 border-[#0A84FF]/40 text-[#0A84FF] ring-2 ring-[#0A84FF]/15' : 'bg-white border-black/10 text-[#6E6E73] hover:bg-black/[0.02]'}`}>
                    1. หน้าตรง {descriptorFront ? "✓" : ""}
                  </button>
                  <button type="button" onClick={() => startVideo("left")} disabled={!selectedTeacher}
                    className={`flex-1 p-2 rounded-xl border font-semibold transition-all ${descriptorLeft ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#1E8E3E]' : activeScanAngle === 'left' ? 'bg-[#0A84FF]/10 border-[#0A84FF]/40 text-[#0A84FF] ring-2 ring-[#0A84FF]/15' : 'bg-white border-black/10 text-[#6E6E73] hover:bg-black/[0.02]'}`}>
                    2. เอียงซ้าย {descriptorLeft ? "✓" : ""}
                  </button>
                  <button type="button" onClick={() => startVideo("right")} disabled={!selectedTeacher}
                    className={`flex-1 p-2 rounded-xl border font-semibold transition-all ${descriptorRight ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#1E8E3E]' : activeScanAngle === 'right' ? 'bg-[#0A84FF]/10 border-[#0A84FF]/40 text-[#0A84FF] ring-2 ring-[#0A84FF]/15' : 'bg-white border-black/10 text-[#6E6E73] hover:bg-black/[0.02]'}`}>
                    3. เอียงขวา {descriptorRight ? "✓" : ""}
                  </button>
                </div>
              </div>

              {/* วงกลมกล้อง + วงแหวนสแกน */}
              <div className="relative w-[220px] h-[220px]">
                <div className="absolute inset-0 rounded-full overflow-hidden border-[3px] border-white shadow-[0_4px_30px_-8px_rgba(0,0,0,0.2)] bg-black/[0.03] flex items-center justify-center">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                  {!isCameraActive && (
                    <div className="absolute inset-0 bg-white/95 flex items-center justify-center text-[#86868B] text-xs text-center p-4">
                      {!modelsLoaded ? (
                        <span className="flex flex-col items-center gap-2">
                          <span className="w-6 h-6 border-2 border-[#0A84FF]/20 border-t-[#0A84FF] rounded-full animate-spin" />
                          กำลังโหลดโมเดล AI...
                        </span>
                      ) : (
                        <span className="flex flex-col items-center gap-2 text-[#AEAEB2]">
                          <IconCamera className="w-7 h-7" />
                          เลือกปุ่มมุมใบหน้าด้านบน<br />กล้องจะสแกนอัตโนมัติ
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isCameraActive && !justCaptured && (
                  <div
                    className="absolute inset-[-4px] rounded-full pointer-events-none scan-ring"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent 0%, transparent 55%, #0A84FF 85%, #7dc0ff 100%)',
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))',
                    }}
                  />
                )}
                {justCaptured && (
                  <div className="absolute inset-[-4px] rounded-full pointer-events-none ring-4 ring-[#30D158]/70 animate-pulse" />
                )}
              </div>

              {isCameraActive && (
                <div className="mt-3 w-full max-w-[240px] text-center">
                  <p className={`text-xs font-semibold rounded-xl px-3 py-2 flex items-center justify-center gap-1.5 ${justCaptured ? 'bg-[#30D158]/10 text-[#1E8E3E]' : 'bg-[#0A84FF]/8 text-[#0A84FF]'}`}>
                    {justCaptured && <IconCheck className="w-3.5 h-3.5" />}
                    {scanFeedback}
                  </p>
                  <button type="button" onClick={stopVideo}
                    className="mt-2 w-full bg-white hover:bg-black/[0.02] text-[#86868B] font-semibold py-1.5 px-4 rounded-full text-[11px] border border-black/10 transition-colors">
                    ยกเลิกการสแกน
                  </button>
                </div>
              )}
            </div>

            {/* ส่วนขวา: ฟอร์ม */}
            <div className="lg:col-span-8 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#86868B] mb-1">รายชื่อบุคลากรที่ต้องการตั้งค่า</label>
                <select
                  onChange={(e) => {
                    setSelectedTeacher(teachers.find(t => t.id === e.target.value) || null);
                    stopVideo();
                  }}
                  className={inputCls}
                >
                  <option value="">-- เลือกครูผู้ลงทะเบียน --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name || ""} {t.face_features ? "● มีข้อมูลใบหน้า" : "○ ยังไม่มีข้อมูลใบหน้า"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-[15px] font-semibold text-[#0A84FF]">บทบาทหน้าที่และสิทธิ์</label>

                {/* ครูที่ปรึกษาประจำชั้น */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer text-[#1D1D1F]">
                    <input type="checkbox" checked={selectedRoles.includes("advisor_teacher")} onChange={() => handleRoleCheckboxChange("advisor_teacher")} disabled={!selectedTeacher} className="rounded border-black/20 text-[#0A84FF] w-4 h-4 accent-[#0A84FF]" />
                    <span>ครูที่ปรึกษาประจำชั้น</span>
                  </label>
                  {selectedRoles.includes("advisor_teacher") && (
                    <div className="mt-3 pl-6 grid grid-cols-2 gap-3 border-l-2 border-[#0A84FF]/15">
                      <div>
                        <span className="block text-xs text-[#86868B] mb-1">ระดับชั้นเรียน</span>
                        <select value={advisorClass} onChange={(e) => setAdvisorClass(e.target.value)} className={inputCls}>
                          <option value="">-- เลือกชั้น --</option>
                          {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <span className="block text-xs text-[#86868B] mb-1">ห้องเรียนประจำการ</span>
                        <select value={advisorRoom} onChange={(e) => setAdvisorRoom(e.target.value)} className={inputCls}>
                          <option value="">-- เลือกห้อง --</option>
                          {roomOptions.map(r => <option key={r} value={r}>/{r}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* หัวหน้ากลุ่มสาระ */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer text-[#1D1D1F]">
                    <input type="checkbox" checked={selectedRoles.includes("head_of_subject")} onChange={() => handleRoleCheckboxChange("head_of_subject")} disabled={!selectedTeacher} className="rounded border-black/20 text-[#0A84FF] w-4 h-4 accent-[#0A84FF]" />
                    <span>หัวหน้ากลุ่มสาระการเรียนรู้</span>
                  </label>
                  {selectedRoles.includes("head_of_subject") && (
                    <div className="mt-3 pl-6 border-l-2 border-[#0A84FF]/15">
                      <select value={headOfSubject} onChange={(e) => setHeadOfSubject(e.target.value)} className={inputCls}>
                        <option value="">-- กลุ่มสาระการเรียนรู้ --</option>
                        {subjectGroups.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* หัวหน้ากลุ่มงาน */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer text-[#1D1D1F]">
                    <input type="checkbox" checked={selectedRoles.includes("head_of_department")} onChange={() => handleRoleCheckboxChange("head_of_department")} disabled={!selectedTeacher} className="rounded border-black/20 text-[#0A84FF] w-4 h-4 accent-[#0A84FF]" />
                    <span>หัวหน้ากลุ่มงาน</span>
                  </label>
                  {selectedRoles.includes("head_of_department") && (
                    <div className="mt-3 pl-6 border-l-2 border-[#0A84FF]/15">
                      <select value={headOfDepartment} onChange={(e) => setHeadOfDepartment(e.target.value)} className={inputCls}>
                        <option value="">-- เลือกกลุ่มงานบริหาร --</option>
                        {workDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* ฝ่ายบริหาร */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer text-[#1D1D1F]">
                    <input type="checkbox" checked={selectedRoles.includes("executive")} onChange={() => handleRoleCheckboxChange("executive")} disabled={!selectedTeacher} className="rounded border-black/20 text-[#0A84FF] w-4 h-4 accent-[#0A84FF]" />
                    <span>ฝ่ายบริหาร (ผู้บริหารสถานศึกษา)</span>
                  </label>
                  {selectedRoles.includes("executive") && (
                    <div className="mt-3 pl-6 border-l-2 border-[#0A84FF]/15">
                      <select value={executiveRole} onChange={(e) => setExecutiveRole(e.target.value)} className={inputCls}>
                        <option value="">-- เลือกตำแหน่งผู้บริหาร --</option>
                        {executivePositions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Admin */}
                <div className="border border-[#FF9F0A]/25 rounded-2xl p-4 bg-[#FF9F0A]/6 mt-4">
                  <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer text-[#B8720A]">
                    <input type="checkbox" checked={isAdminRole} onChange={(e) => setIsAdminRole(e.target.checked)} disabled={!selectedTeacher} className="rounded border-[#FF9F0A]/40 w-4 h-4 accent-[#FF9F0A]" />
                    <span>เปิดสิทธิ์ผู้ดูแลระบบดิจิทัลประจำโรงเรียน (Admin)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-block text-[14px] font-semibold text-[#0A84FF] bg-[#0A84FF]/8 px-5 py-2.5 rounded-xl max-w-full break-words">
              {status}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-black/[0.05] flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleSaveAllData}
              disabled={!selectedTeacher || isSaving}
              className="w-full bg-[#0A84FF] hover:bg-[#0574e6] disabled:bg-black/10 disabled:text-[#AEAEB2] text-white font-semibold py-3.5 px-4 rounded-2xl shadow-lg transition-all text-[15px] active:scale-[0.99]"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกสิทธิ์และข้อมูลใบหน้าลงฐานข้อมูล"}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .scan-ring {
          animation: scan-spin 1.4s linear infinite;
        }
        @keyframes scan-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}