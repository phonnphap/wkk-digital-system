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
const SCAN_INTERVAL_MS = 100; // เดิม 200ms — ลดลงได้เพราะตอนนี้ loop เบาลงมาก (ไม่คำนวณ descriptor ทุกเฟรมแล้ว)

// ── liveness (กันภาพนิ่ง/รูปถ่ายมาลงทะเบียนแทนตัวจริง) ─────────────────────
// วัดจาก Eye Aspect Ratio (EAR) เทียบกับค่าฐานของแต่ละคน/กล้อง/แสงแบบเรียลไทม์
// เกณฑ์ผ่อนปรนขึ้นจากเดิม เพื่อให้ใช้งานได้จริงบนกล้องมือถือหลากหลายรุ่น
const EAR_CLOSE_RATIO = 0.80; // ลดลงจากค่าฐานแค่ ~20% ก็นับว่ากระพริบตาแล้ว (จับเฟรมเดียวพอ ไม่ต้องรอลืมตาคืน)

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
  const earBaselineRef = useRef<number | null>(null);
  const finalizingRef = useRef(false);

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
  const [blinkHint, setBlinkHint] = useState(false);

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

        // ใช้ TinyFaceDetector แทน SsdMobilenetv1 — เบากว่ามาก โดยเฉพาะบนมือถือ
        // ทำให้ loop ตรวจจับการกระพริบตาทำงานได้ถี่และไวพอที่จะจับจังหวะกระพริบตาจริงทัน
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri('/models'),
          fa.nets.faceLandmark68Net.loadFromUri('/models'),
          fa.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);

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
    finalizingRef.current = false;
    if (scanTimeoutRef.current) { window.clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    stableFrameCountRef.current = 0;
    eyeOpenRef.current = true;
    blinkFoundRef.current = false;
    earBaselineRef.current = null;
    setBlinkHint(false);
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
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
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
        earBaselineRef.current = null;
        finalizingRef.current = false;
        scanActiveRef.current = true;
        window.setTimeout(() => scanLoop(angle), 500);
      }
    } catch (err: any) {
      setStatus("สัญญาณกล้องขัดข้อง: " + err.message);
    }
  };

  // ★ สแกนอัตโนมัติต่อเนื่อง: ต้องนิ่งครบเฟรม "และ" ตรวจพบการกระพริบตาอย่างน้อย 1
  // ครั้งก่อนจึงจะยอมถ่ายให้ — ป้องกันการยกรูปถ่าย/ภาพนิ่งมาลงทะเบียนแทนตัวจริง
  // จุดสำคัญที่ต่างจากเดิม: ระหว่างรอกระพริบตา loop นี้จะตรวจแค่ตำแหน่ง landmark
  // (เบา เร็ว) เท่านั้น ไม่คำนวณ face descriptor (128 มิติ) ทุกเฟรมเหมือนเดิมอีก
  // ต่อไป — เพราะการคำนวณ descriptor ทุกเฟรมคือสาเหตุหลักที่ทำให้ loop ช้าลงมาก
  // บนมือถือ จนพลาดจังหวะกระพริบตาที่เกิดขึ้นเร็วกว่ารอบสแกน
  async function scanLoop(angle: "front" | "left" | "right") {
    if (!scanActiveRef.current || !videoRef.current || !faceapi || finalizingRef.current) return;
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      if (!scanActiveRef.current) return;

      if (detection) {
        stableFrameCountRef.current += 1;

        const leftEAR = eyeAspectRatio(detection.landmarks.getLeftEye());
        const rightEAR = eyeAspectRatio(detection.landmarks.getRightEye());
        const avgEAR = (leftEAR + rightEAR) / 2;

        // ค่าฐาน (baseline) คือค่า EAR ตอนตาเปิดปกติ ปรับตัวไปเรื่อย ๆ จนกว่าจะจับการกระพริบได้
        // แค่จับ "หลับตา" ได้เฟรมเดียวก็ถือว่าเจอการกระพริบแล้ว — ไม่ต้องรอจับจังหวะลืมตา
        // กลับคืนด้วย เพราะจังหวะลืมตาคืนมักเร็วเกินกว่าจะสุ่มเจอบนอุปกรณ์ที่ประมวลผลช้า
        if (earBaselineRef.current === null) earBaselineRef.current = avgEAR;
        if (!blinkFoundRef.current) {
          earBaselineRef.current = earBaselineRef.current * 0.9 + avgEAR * 0.1;
          earBaselineRef.current = Math.min(0.45, Math.max(0.15, earBaselineRef.current));
          const closeThresh = earBaselineRef.current * EAR_CLOSE_RATIO;
          if (avgEAR < closeThresh) {
            blinkFoundRef.current = true;
            setBlinkHint(true);
          }
        }

        const stableReady = stableFrameCountRef.current >= REQUIRED_STABLE_FRAMES;

        if (stableReady && blinkFoundRef.current) {
          // เจอทั้งความนิ่งและการกระพริบตาแล้ว — คำนวณ descriptor ครั้งเดียวตอนนี้เท่านั้น
          finalizingRef.current = true;
          const finalDet = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (finalDet) {
            scanActiveRef.current = false;
            await finalizeCapture(angle, finalDet.descriptor);
            return;
          }
          // เผื่อเฟรมสุดท้ายตรวจไม่เจอ (พลิกหน้าพอดี) — ลองใหม่ต่อ ไม่ถือว่าล้มเหลว
          finalizingRef.current = false;
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

  // บันทึกเฉพาะข้อมูลใบหน้าลงตาราง users เดิม — ไม่แตะต้องคอลัมน์บทบาท/สิทธิ์
  // เพราะบทบาทของบุคลากรถูกกำหนดไว้แล้วในระบบส่วนอื่น
  const handleSaveAllData = async () => {
    if (!selectedTeacher) return;
    if (anglesCaptured === 0) {
      alert("กรุณาสแกนใบหน้าอย่างน้อย 1 มุมก่อนบันทึก");
      return;
    }
    setIsSaving(true);
    setStatus("กำลังบันทึกข้อมูลใบหน้าเข้าฐานข้อมูล...");
    try {
      const faceFeaturesPayload = {
        front: descriptorFront ? Array.from(descriptorFront) : null,
        left: descriptorLeft ? Array.from(descriptorLeft) : null,
        right: descriptorRight ? Array.from(descriptorRight) : null
      };

      // อัปเดตแถวผู้ใช้เดิมในตาราง users โดยตรงด้วย id ที่เลือกไว้ — ไม่มีการสร้างบัญชีใหม่
      const { data: updatedRows, error } = await supabase
        .from('users')
        .update({ face_features: faceFeaturesPayload })
        .eq('id', selectedTeacher.id)
        .select('id');

      if (error) throw error;

      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
          'ไม่มีแถวไหนถูกแก้ไขเลย (0 rows) — มักเกิดจาก RLS Policy ของตาราง users ' +
          'ไม่อนุญาตให้บัญชีแอดมินแก้ไขข้อมูลของผู้ใช้คนอื่น กรุณาตรวจสอบ Policy UPDATE'
        );
      }

      if (anglesCaptured < 3) {
        setStatus(`บันทึกสำเร็จ แต่ถ่ายใบหน้าได้ ${anglesCaptured}/3 มุม (ยังไม่ครบ)`);
        alert(`บันทึกสำเร็จ\nแต่ถ่ายใบหน้าได้เพียง ${anglesCaptured}/3 มุม\nแนะนำให้ถ่ายให้ครบ 3 มุม`);
      } else {
        setStatus("บันทึกข้อมูลใบหน้าครบ 3 มุมสำเร็จ!");
        alert("จัดเก็บพิกัดใบหน้าครบ 3 มุมเรียบร้อย");
      }
      if (anglesCaptured === 3) {
        setDescriptorFront(null);
        setDescriptorLeft(null);
        setDescriptorRight(null);
      }
    } catch (err: any) {
      setStatus("ข้อผิดพลาด: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls = "bg-white border border-black/10 rounded-xl px-3 py-2.5 text-[14px] text-[#1D1D1F] w-full focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/15 focus:outline-none transition-all";

  return (
    <div
      className="min-h-screen relative overflow-hidden text-[#1D1D1F]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Thai', 'Sarabun', 'Noto Sans Thai', sans-serif" }}
    >
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap');
      `}</style>

      {/* ── พื้นหลังไล่สีสดใส + บลอบสีนุ่ม ๆ ให้ดูมีชีวิตชีวาแบบแอป Apple สมัยใหม่ ── */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#EAF3FF] via-[#F6F4FF] to-[#FFF3F8]" />
      <div className="fixed -top-24 -left-20 w-72 h-72 rounded-full bg-[#0A84FF]/25 blur-3xl -z-10" />
      <div className="fixed top-1/3 -right-24 w-80 h-80 rounded-full bg-[#5E5CE6]/20 blur-3xl -z-10" />
      <div className="fixed bottom-0 left-1/4 w-64 h-64 rounded-full bg-[#FF9F0A]/15 blur-3xl -z-10" />

      {/* ── Nav bar โปร่งแสงสไตล์ Apple ── */}
      <div className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow-sm flex items-center justify-center text-[#1D1D1F] shrink-0 transition-colors active:scale-95">
            <IconHome className="w-4.5 h-4.5" />
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-[#1D1D1F] leading-none">ลงทะเบียนใบหน้าบุคลากร</h1>
            <p className="text-[#6E6E73] text-xs mt-1">สแกนอัตโนมัติพร้อมยืนยันตัวจริงด้วยการกระพริบตา</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 md:p-6">
        <div className="bg-white/85 backdrop-blur border border-white/60 rounded-[32px] shadow-[0_10px_50px_-15px_rgba(10,132,255,0.25)] p-6 sm:p-8">

          <p className="text-[13px] text-[#0A84FF] mb-6 font-medium flex items-center gap-1.5 justify-center text-center">
            <IconEye className="w-4 h-4 shrink-0" />
            กล้องจะสแกนและถ่ายให้อัตโนมัติเมื่อใบหน้านิ่งอยู่ในกรอบและกระพริบตาตามปกติ
          </p>

          {/* เลือกบุคลากร */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-[#6E6E73] mb-1">รายชื่อบุคลากรที่ต้องการลงทะเบียนใบหน้า</label>
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

          {/* มุมที่ต้องสแกน */}
          <div className="mb-3 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[#6E6E73] font-medium">เลือกมุมที่ต้องการสแกน</span>
              <span className="text-[#0A84FF] font-semibold">{anglesCaptured}/3 มุม</span>
            </div>
            <div className="flex gap-1.5 mb-1">
              {[descriptorFront, descriptorLeft, descriptorRight].map((d, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${d ? 'bg-gradient-to-r from-[#30D158] to-[#34C759]' : 'bg-black/10'}`} />
              ))}
            </div>
            <div className="flex justify-between gap-1 text-[12px] text-center">
              <button type="button" onClick={() => startVideo("front")} disabled={!selectedTeacher}
                className={`flex-1 p-2.5 rounded-xl border font-semibold transition-all ${descriptorFront ? 'bg-[#30D158]/12 border-[#30D158]/35 text-[#1E8E3E]' : activeScanAngle === 'front' ? 'bg-gradient-to-br from-[#0A84FF]/15 to-[#5E5CE6]/15 border-[#0A84FF]/40 text-[#0A84FF] ring-2 ring-[#0A84FF]/15' : 'bg-white/80 border-black/10 text-[#6E6E73] hover:bg-white'}`}>
                1. หน้าตรง {descriptorFront ? "✓" : ""}
              </button>
              <button type="button" onClick={() => startVideo("left")} disabled={!selectedTeacher}
                className={`flex-1 p-2.5 rounded-xl border font-semibold transition-all ${descriptorLeft ? 'bg-[#30D158]/12 border-[#30D158]/35 text-[#1E8E3E]' : activeScanAngle === 'left' ? 'bg-gradient-to-br from-[#0A84FF]/15 to-[#5E5CE6]/15 border-[#0A84FF]/40 text-[#0A84FF] ring-2 ring-[#0A84FF]/15' : 'bg-white/80 border-black/10 text-[#6E6E73] hover:bg-white'}`}>
                2. เอียงซ้าย {descriptorLeft ? "✓" : ""}
              </button>
              <button type="button" onClick={() => startVideo("right")} disabled={!selectedTeacher}
                className={`flex-1 p-2.5 rounded-xl border font-semibold transition-all ${descriptorRight ? 'bg-[#30D158]/12 border-[#30D158]/35 text-[#1E8E3E]' : activeScanAngle === 'right' ? 'bg-gradient-to-br from-[#0A84FF]/15 to-[#5E5CE6]/15 border-[#0A84FF]/40 text-[#0A84FF] ring-2 ring-[#0A84FF]/15' : 'bg-white/80 border-black/10 text-[#6E6E73] hover:bg-white'}`}>
                3. เอียงขวา {descriptorRight ? "✓" : ""}
              </button>
            </div>
          </div>

          {/* กล้อง */}
          <div className="flex flex-col items-center justify-center bg-gradient-to-b from-white to-[#F5F8FF] rounded-[28px] p-6 border border-black/5 mt-4">
            <div className="relative w-[220px] h-[220px]">
              <div className="absolute inset-0 rounded-full overflow-hidden border-[3px] border-white shadow-[0_8px_35px_-10px_rgba(10,132,255,0.35)] bg-black/[0.03] flex items-center justify-center">
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
                    background: 'conic-gradient(from 0deg, transparent 0%, transparent 50%, #0A84FF 78%, #5E5CE6 92%, #FF2D92 100%)',
                    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))',
                    mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))',
                  }}
                />
              )}
              {justCaptured && (
                <div className="absolute inset-[-4px] rounded-full pointer-events-none ring-4 ring-[#30D158]/70 animate-pulse" />
              )}

              {isCameraActive && !justCaptured && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#5E5CE6] to-[#0A84FF] text-white text-[11px] font-semibold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap">
                  <IconEye className="w-3.5 h-3.5" />
                  {blinkHint ? "ลืมตากลับมาได้เลย" : "กระพริบตาได้ตามปกติ"}
                </div>
              )}
            </div>

            {isCameraActive && (
              <div className="mt-5 w-full max-w-[260px] text-center">
                <p className={`text-xs font-semibold rounded-xl px-3 py-2 flex items-center justify-center gap-1.5 ${justCaptured ? 'bg-[#30D158]/12 text-[#1E8E3E]' : 'bg-[#0A84FF]/10 text-[#0A84FF]'}`}>
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

          <div className="mt-6 text-center">
            <div className="inline-block text-[13px] font-semibold text-[#0A84FF] bg-[#0A84FF]/10 px-5 py-2.5 rounded-xl max-w-full break-words">
              {status}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-black/[0.05]">
            <button
              type="button"
              onClick={handleSaveAllData}
              disabled={!selectedTeacher || isSaving || anglesCaptured === 0}
              className="w-full bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] disabled:bg-none disabled:bg-black/10 disabled:text-[#AEAEB2] text-white font-semibold py-3.5 px-4 rounded-2xl shadow-lg shadow-[#0A84FF]/25 transition-all text-[15px] active:scale-[0.99]"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูลใบหน้าลงฐานข้อมูล"}
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