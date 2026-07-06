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

export default function AdminFaceRegisterPage() {
  const [faceapi, setFaceapi] = useState<any>(null);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanActiveRef = useRef(false);
  const scanTimeoutRef = useRef<number | null>(null);
  const stableFrameCountRef = useRef(0);

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

  // ── ฟีดแบ็กระหว่างสแกน (แทนที่การกดปุ่มถ่ายเอง) ──
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
        setStatus("🟢 ระบบ AI พร้อมใช้งาน 100%");
      } catch (err: any) {
        setStatus("❌ ข้อผิดพลาด: " + err.message);
      }
    }
    initializeSystem();
    return () => stopVideo();
  }, []);

  const stopVideo = () => {
    scanActiveRef.current = false;
    if (scanTimeoutRef.current) { window.clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    stableFrameCountRef.current = 0;
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
        setStatus(`📸 กำลังสแกนมุม${angleLabel(angle)}อัตโนมัติ — กรุณาอยู่นิ่งๆ ในกรอบวงกลม`);
        setScanFeedback("กำลังเตรียมกล้อง...");
        stableFrameCountRef.current = 0;
        scanActiveRef.current = true;
        // หน่วงเล็กน้อยให้กล้องเสถียรก่อนเริ่มสแกน
        window.setTimeout(() => scanLoop(angle), 500);
      }
    } catch (err: any) {
      setStatus("❌ สัญญาณกล้องขัดข้อง: " + err.message);
    }
  };

  // ★ ระบบสแกนอัตโนมัติต่อเนื่อง (เหมือน Face ID) — ตรวจจับหน้าทุก ~250ms
  // พอเจอหน้านิ่งครบ REQUIRED_STABLE_FRAMES เฟรมติดกัน จะถ่ายให้เองโดยไม่ต้องกดปุ่ม
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
        setScanFeedback(`✅ ตรวจพบใบหน้า กำลังยืนยัน (${stableFrameCountRef.current}/${REQUIRED_STABLE_FRAMES})`);
        if (stableFrameCountRef.current >= REQUIRED_STABLE_FRAMES) {
          scanActiveRef.current = false;
          await finalizeCapture(angle, detection.descriptor);
          return;
        }
      } else {
        stableFrameCountRef.current = 0;
        setScanFeedback("🔍 กรุณาจัดใบหน้าให้อยู่กึ่งกลางวงกลม");
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
    setScanFeedback("🎯 บันทึกใบหน้าสำเร็จ!");
    setStatus(`🎯 บันทึกพิกัดใบหน้ามุม${angleLabel(angle)}สำเร็จ!`);
    // ค้างภาพ success สั้นๆ ก่อนปิดกล้อง ให้ผู้ใช้เห็นว่าสำเร็จแล้ว
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
    setStatus("💾 กำลังบันทึกสิทธิ์เข้าฐานข้อมูล...");
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
        setStatus("⚠️ บันทึกสิทธิ์สำเร็จ แต่ยังไม่มีข้อมูลใบหน้าถูกบันทึกเลย (0/3 มุม)");
        alert("⚠️ บันทึกสิทธิ์/บทบาทสำเร็จ\nแต่ยังไม่ได้ถ่ายภาพใบหน้าแม้แต่มุมเดียว");
      } else if (anglesCaptured < 3) {
        setStatus(`⚠️ บันทึกสำเร็จ แต่ถ่ายใบหน้าได้ ${anglesCaptured}/3 มุม (ยังไม่ครบ)`);
        alert(`⚠️ บันทึกสำเร็จ\nแต่ถ่ายใบหน้าได้เพียง ${anglesCaptured}/3 มุม\nแนะนำให้ถ่ายให้ครบ 3 มุม`);
      } else {
        setStatus("✅ บันทึกโครงสร้างบทบาทและใบหน้าครบ 3 มุมสำเร็จ!");
        alert("✅ จัดเก็บพิกัดใบหน้าครบ 3 มุม และสิทธิ์เรียบร้อย");
      }
      if (anglesCaptured === 3) {
        setDescriptorFront(null);
        setDescriptorLeft(null);
        setDescriptorRight(null);
      }
      setIsAdminRole(false);
    } catch (err: any) {
      setStatus("❌ ข้อผิดพลาด: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls = "bg-white border-2 border-blue-100 rounded-xl px-3 py-2.5 text-sm text-slate-800 w-full focus:border-blue-400 focus:outline-none transition-colors";
  const boxCls = "border border-slate-200 rounded-2xl p-4 bg-slate-50/60";

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'TH Sarabun New','Sarabun',sans-serif" }}>

      {/* ── Top bar (เหมือนระบบอื่น) ── */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">
            🏠
          </button>
          <div>
            <h1 className="text-base font-black text-slate-800 leading-none">⚙️ จัดการสิทธิ์บุคลากร & ลงทะเบียนใบหน้า</h1>
            <p className="text-slate-400 text-xs mt-0.5">สแกนใบหน้าอัตโนมัติ + กำหนดบทบาทหน้าที่</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          <p className="text-xs text-slate-400 mb-1 border-b border-slate-100 pb-3">
            สแกนจัดเก็บอัตลักษณ์ใบหน้าอัตโนมัติทีละมุม พร้อมกำหนดบทบาทหน้าที่ในระบบ
          </p>
          <p className="text-[13px] text-blue-500 mb-6 font-bold">
            💡 กล้องจะสแกนและถ่ายภาพให้อัตโนมัติเมื่อจัดใบหน้าตรงกรอบนิ่งๆ ไม่ต้องกดปุ่มถ่ายเอง
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ส่วนซ้าย: กล้อง */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-200 sticky top-20">
              <div className="mb-3 w-full flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-slate-500 font-bold">เลือกมุมที่ต้องการสแกน:</span>
                  <span className="text-blue-500 font-black">{anglesCaptured}/3 มุม</span>
                </div>
                <div className="flex gap-1.5 mb-1">
                  {[descriptorFront, descriptorLeft, descriptorRight].map((d, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${d ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  ))}
                </div>
                <div className="flex justify-between gap-1 text-[11px] text-center">
                  <button type="button" onClick={() => startVideo("front")} disabled={!selectedTeacher}
                    className={`flex-1 p-2 rounded-xl border-2 font-bold transition-all ${descriptorFront ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : activeScanAngle === 'front' ? 'bg-blue-50 border-blue-400 text-blue-600 ring-2 ring-blue-200' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    1. หน้าตรง {descriptorFront ? "✓" : ""}
                  </button>
                  <button type="button" onClick={() => startVideo("left")} disabled={!selectedTeacher}
                    className={`flex-1 p-2 rounded-xl border-2 font-bold transition-all ${descriptorLeft ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : activeScanAngle === 'left' ? 'bg-blue-50 border-blue-400 text-blue-600 ring-2 ring-blue-200' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    2. เอียงซ้าย {descriptorLeft ? "✓" : ""}
                  </button>
                  <button type="button" onClick={() => startVideo("right")} disabled={!selectedTeacher}
                    className={`flex-1 p-2 rounded-xl border-2 font-bold transition-all ${descriptorRight ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : activeScanAngle === 'right' ? 'bg-blue-50 border-blue-400 text-blue-600 ring-2 ring-blue-200' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    3. เอียงขวา {descriptorRight ? "✓" : ""}
                  </button>
                </div>
              </div>

              {/* วงกลมกล้อง + วงแหวนสแกนหมุน (สไตล์ Face ID) */}
              <div className="relative w-[220px] h-[220px]">
                <div className="absolute inset-0 rounded-full overflow-hidden border-4 border-white shadow-xl bg-slate-100 flex items-center justify-center">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                  {!isCameraActive && (
                    <div className="absolute inset-0 bg-white/95 flex items-center justify-center text-slate-400 text-xs text-center p-4">
                      {!modelsLoaded ? (
                        <span className="flex flex-col items-center gap-2">
                          <span className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                          กำลังโหลดโมเดล AI...
                        </span>
                      ) : (
                        <>เลือกปุ่มมุมใบหน้าด้านบน<br />กล้องจะสแกนอัตโนมัติ</>
                      )}
                    </div>
                  )}
                </div>

                {/* วงแหวนหมุนขณะสแกน */}
                {isCameraActive && !justCaptured && (
                  <div
                    className="absolute inset-[-4px] rounded-full pointer-events-none scan-ring"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent 0%, transparent 55%, #3b82f6 85%, #60a5fa 100%)',
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))',
                    }}
                  />
                )}
                {/* วงแหวนเขียวตอนถ่ายสำเร็จ */}
                {justCaptured && (
                  <div className="absolute inset-[-4px] rounded-full pointer-events-none ring-4 ring-emerald-400 animate-pulse" />
                )}
              </div>

              {/* ฟีดแบ็กสถานะสแกนสด */}
              {isCameraActive && (
                <div className="mt-3 w-full max-w-[240px] text-center">
                  <p className={`text-xs font-bold rounded-xl px-3 py-2 ${justCaptured ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                    {scanFeedback}
                  </p>
                  <button type="button" onClick={stopVideo}
                    className="mt-2 w-full bg-white hover:bg-slate-50 text-slate-500 font-bold py-1.5 px-4 rounded-full text-[11px] border border-slate-200">
                    ✕ ยกเลิกการสแกน
                  </button>
                </div>
              )}
            </div>

            {/* ส่วนขวา: ฟอร์ม */}
            <div className="lg:col-span-8 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">รายชื่อบุคลากรที่ต้องการตั้งค่า:</label>
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
                      {t.first_name} {t.last_name || ""} {t.face_features ? "🟢" : "🔴"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-sm font-black text-blue-600">บทบาทหน้าที่และสิทธิ์:</label>

                {/* ครูที่ปรึกษาประจำชั้น */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-700">
                    <input type="checkbox" checked={selectedRoles.includes("advisor_teacher")} onChange={() => handleRoleCheckboxChange("advisor_teacher")} disabled={!selectedTeacher} className="rounded border-slate-300 text-blue-500 w-4 h-4" />
                    <span>ครูที่ปรึกษาประจำชั้น</span>
                  </label>
                  {selectedRoles.includes("advisor_teacher") && (
                    <div className="mt-3 pl-6 grid grid-cols-2 gap-3 border-l-2 border-blue-100">
                      <div>
                        <span className="block text-xs text-slate-500 mb-1">ระดับชั้นเรียน:</span>
                        <select value={advisorClass} onChange={(e) => setAdvisorClass(e.target.value)} className={inputCls}>
                          <option value="">-- เลือกชั้น --</option>
                          {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-500 mb-1">ห้องเรียนประจำการ:</span>
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
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-700">
                    <input type="checkbox" checked={selectedRoles.includes("head_of_subject")} onChange={() => handleRoleCheckboxChange("head_of_subject")} disabled={!selectedTeacher} className="rounded border-slate-300 text-blue-500 w-4 h-4" />
                    <span>หัวหน้ากลุ่มสาระการเรียนรู้</span>
                  </label>
                  {selectedRoles.includes("head_of_subject") && (
                    <div className="mt-3 pl-6 border-l-2 border-blue-100">
                      <select value={headOfSubject} onChange={(e) => setHeadOfSubject(e.target.value)} className={inputCls}>
                        <option value="">-- กลุ่มสาระการเรียนรู้ --</option>
                        {subjectGroups.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* หัวหน้ากลุ่มงาน */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-700">
                    <input type="checkbox" checked={selectedRoles.includes("head_of_department")} onChange={() => handleRoleCheckboxChange("head_of_department")} disabled={!selectedTeacher} className="rounded border-slate-300 text-blue-500 w-4 h-4" />
                    <span>หัวหน้ากลุ่มงาน</span>
                  </label>
                  {selectedRoles.includes("head_of_department") && (
                    <div className="mt-3 pl-6 border-l-2 border-blue-100">
                      <select value={headOfDepartment} onChange={(e) => setHeadOfDepartment(e.target.value)} className={inputCls}>
                        <option value="">-- เลือกกลุ่มงานบริหาร --</option>
                        {workDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* ฝ่ายบริหาร */}
                <div className={boxCls}>
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-700">
                    <input type="checkbox" checked={selectedRoles.includes("executive")} onChange={() => handleRoleCheckboxChange("executive")} disabled={!selectedTeacher} className="rounded border-slate-300 text-blue-500 w-4 h-4" />
                    <span>ฝ่ายบริหาร (ผู้บริหารสถานศึกษา)</span>
                  </label>
                  {selectedRoles.includes("executive") && (
                    <div className="mt-3 pl-6 border-l-2 border-blue-100">
                      <select value={executiveRole} onChange={(e) => setExecutiveRole(e.target.value)} className={inputCls}>
                        <option value="">-- เลือกตำแหน่งผู้บริหาร --</option>
                        {executivePositions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Admin */}
                <div className="border-2 border-amber-200 rounded-2xl p-4 bg-amber-50/60 mt-4">
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-amber-700">
                    <input type="checkbox" checked={isAdminRole} onChange={(e) => setIsAdminRole(e.target.checked)} disabled={!selectedTeacher} className="rounded border-amber-300 text-amber-500 w-4 h-4" />
                    <span>เปิดสิทธิ์ผู้ดูแลระบบดิจิทัลประจำโรงเรียน (Admin)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-block text-sm font-bold text-blue-600 bg-blue-50 px-5 py-2.5 rounded-xl border border-blue-100 max-w-full break-words">
              {status}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleSaveAllData}
              disabled={!selectedTeacher || isSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-3.5 px-4 rounded-2xl shadow-lg transition-all text-sm"
            >
              {isSaving ? "⏳ กำลังบันทึก..." : "💾 บันทึกสิทธิ์และข้อมูลใบหน้าลงฐานข้อมูล"}
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