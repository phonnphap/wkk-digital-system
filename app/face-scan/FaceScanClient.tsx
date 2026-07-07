"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from "react";

import { useRouter } from 'next/navigation';
import { createClient } from "@/lib/supabase/client";

interface UserRow {
  id: string;
  first_name?: string;
  last_name?: string;
  face_features: any;
}

export default function FaceScanPage() {

const supabase = createClient();

const SCHOOL_LAT = 14.000541081931873;
const SCHOOL_LNG = 100.6766971783887;
const ALLOWED_RADIUS = 75;
// ยกค่า threshold ออกมาเป็นค่ากลาง (เดิม hardcode อยู่ใน loop) — ปรับตามตัวอย่าง scan.html
const MATCH_THRESHOLD = 0.4;

// ── ภาคเรียนที่ 1/2569: 14 พ.ค. 2569 – 9 ต.ค. 2569 ──────────────────────────
const TERM1_START = new Date('2026-05-14T00:00:00+07:00');
const TERM1_END   = new Date('2026-10-09T23:59:59+07:00');

function isInTerm1(date: Date): boolean {
  return date >= TERM1_START && date <= TERM1_END;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toThaiTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
  });
}

function toThaiDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
  });
}
  const faceApiRef = useRef<any>(null);
  const [faceapi, setFaceapi] = useState<any>(null);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [currentDateTime, setCurrentDateTime] = useState({ time: '', date: '' });
  const [status, setStatus] = useState("กำลังเตรียมระบบสแกน...");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [attendanceType, setAttendanceType] = useState<'check_in' | 'check_out'>('check_in');
  const [isInsideSchool, setIsInsideSchool] = useState<boolean | null>(null);
  const [distanceFromSchool, setDistanceFromSchool] = useState<number>(0);
  const [allowOffsiteScan, setAllowOffsiteScan] = useState<boolean>(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    monthly: { normal: 0, late: 0, mission: 0 },
    term:    { normal: 0, late: 0, mission: 0 }
  });
  const [faceMatcher, setFaceMatcher] = useState<any>(null);

  // ── เพิ่มใหม่ จากตัวอย่าง scan.html ──────────────────────────────────────────
  const [modelsReady, setModelsReady] = useState(false);           // โมเดล + ฐานข้อมูลใบหน้าพร้อมหรือยัง
  const [userNames, setUserNames] = useState<Record<string, string>>({}); // map id -> ชื่อ-สกุล สำหรับแสดงใน modal
  const [pendingMatch, setPendingMatch] = useState<{ id: string; name: string; similarity: string } | null>(null); // รอยืนยันก่อนบันทึกจริง
  const [isConfirming, setIsConfirming] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); // ค่าความคลาดเคลื่อนของ GPS ที่เครื่องรายงานมา (เมตร)
  const isDetectingRef = useRef(false); // กันไม่ให้ยิง detectSingleFace ซ้อนกันตอนเครื่องช้า

  // ── เพิ่มใหม่: ตรวจใบลาไปราชการก่อนอนุญาตสแกนนอกพื้นที่ ─────────────────────
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [officialLeaveOk, setOfficialLeaveOk] = useState<boolean | null>(null); // null=ยังไม่ตรวจ, true/false=ผลตรวจ
  const [checkingLeave, setCheckingLeave] = useState(false);

  const canOffsiteScan = allowOffsiteScan && officialLeaveOk === true;

  // ── 1. นาฬิกา + GPS ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentDateTime({
        time: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      });
    }, 1000);

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const dist = calculateDistance(latitude, longitude, SCHOOL_LAT, SCHOOL_LNG);
          setDistanceFromSchool(dist);
          setGpsAccuracy(Math.round(accuracy));

          // ── ผ่อนปรนตามค่าความแม่นยำของ GPS เอง (accuracy) ──────────────────
          // GPS มือถือ (โดยเฉพาะในอาคาร) มีค่าคลาดเคลื่อนได้หลักสิบถึงหลักร้อยเมตร
          // ถ้าหักลบ accuracy ออกแล้วยังอยู่ในรัศมีที่กำหนด ให้ถือว่า "อยู่ในพื้นที่"
          const effectiveDist = Math.max(0, dist - accuracy);
          setIsInsideSchool(effectiveDist <= ALLOWED_RADIUS);
        },
        (err) => console.error(err),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    }
    return () => clearInterval(timer);
  }, []);

  // ── 2. โหลดสถิติทันทีจาก session ที่ล็อคอินอยู่แล้ว ──────────────────────────
  useEffect(() => {
    const loadInitialStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        const { data: foundUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .maybeSingle();

        if (foundUser) {
          setCurrentUserId((foundUser as any).id);
          await refreshStats((foundUser as any).id);
        }
      } catch (err) {
        console.error('loadInitialStats error:', err);
      }
    };

    loadInitialStats();
  }, []);

  // ── 3. โหลด AI Model + face vectors (แบ่งเป็นขั้นตอน 1/2, 2/2 ตามตัวอย่าง scan.html) ─
  useEffect(() => {
    const init = async () => {
      try {
        setStatus("1/2 กำลังโหลดโมเดล AI...");
        const fa = await import('face-api.js');
        setFaceapi(fa);
        faceApiRef.current = fa;
        // ใช้ TinyFaceDetector แทน SsdMobilenetv1 สำหรับหน้าสแกน — เบากว่ามาก
        // เหมาะกับ loop ตรวจจับต่อเนื่องทุกวินาที ลดอาการหน่วง/ช้าบนมือถือ
        // (ต้องมีไฟล์ tiny_face_detector_model-weights_manifest.json + shard อยู่ใน /public/models ด้วย)
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri('/models'),
          fa.nets.faceLandmark68Net.loadFromUri('/models'),
          fa.nets.faceRecognitionNet.loadFromUri('/models')
        ]);

        setStatus("2/2 กำลังโหลดฐานข้อมูลใบหน้า...");
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, face_features')
          .returns<UserRow[]>();

        if (error) throw error;

        const users = data || [];

        // เก็บชื่อไว้ใช้แสดงผลใน modal ยืนยันตัวตน (ไม่ต้อง query ซ้ำตอนเจอใบหน้า)
        const nameMap: Record<string, string> = {};
        users.forEach(u => {
          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
          nameMap[u.id] = fullName || 'ไม่ทราบชื่อ';
        });
        setUserNames(nameMap);

        const descriptors = users
          .filter(u => u.face_features)
          .map(u => {
            try {
              let parsed = typeof u.face_features === 'string'
                ? JSON.parse(u.face_features)
                : u.face_features;

              let arr: number[] | null = null;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const keys = Object.keys(parsed);
                if (keys.length > 0 && Array.isArray(parsed[keys[0]])) arr = parsed[keys[0]];
              } else if (Array.isArray(parsed)) {
                arr = parsed;
              }
              if (arr && arr.length === 128) {
                return new fa.LabeledFaceDescriptors(u.id, [new Float32Array(arr)]);
              }
              return null;
            } catch { return null; }
          })
          .filter((d): d is any => d !== null);

        if (descriptors.length === 0) {
          setFaceMatcher(null);
          setStatus("⚠️ ระบบพร้อม (ไม่พบข้อมูลใบหน้าในระบบ)");
        } else {
          setFaceMatcher(new fa.FaceMatcher(descriptors, 0.55));
          setStatus("🟢 ระบบพร้อมสแกนใบหน้า");
        }
        setModelsReady(true);
      } catch (err) {
        console.error(err);
        setStatus("❌ โหลดโมเดลล้มเหลว กรุณา refresh");
      }
    };
    init();
  }, []);

  // ── 4. ดึงสถิติและประวัติ ─────────────────────────────────────────────────────
  const refreshStats = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('teacher_attendance')
        .select('*')
        .eq('user_id', userId)
        .order('check_time', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        setHistoryData([]);
        setSummary({ monthly: { normal: 0, late: 0, mission: 0 }, term: { normal: 0, late: 0, mission: 0 } });
        return;
      }

      setHistoryData(data.slice(0, 5));

      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear  = now.getFullYear();
      const monthly   = { normal: 0, late: 0, mission: 0 };
      const term      = { normal: 0, late: 0, mission: 0 };

      data.filter((log: any) => log.type === 'check_in').forEach((log: any) => {
        const d = new Date(log.check_time);
        const isMonth = d.getMonth() === thisMonth && d.getFullYear() === thisYear;

        // priority: สาย > ไปราชการ > ปกติ
        const bucket = log.status?.includes('สาย') ? 'late'
          : log.is_onsite === false ? 'mission' : 'normal';

        // นับเฉพาะที่อยู่ในช่วงภาคเรียนที่ 1
        if (isInTerm1(d)) {
          term[bucket as keyof typeof term]++;
        }
        if (isMonth) monthly[bucket as keyof typeof monthly]++;
      });

      setSummary({ monthly, term });
    } catch (err) {
      console.error('refreshStats error:', err);
    }
  };

  // ── 4.5 ตรวจสอบใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้ ───────────────────────
  async function checkOfficialLeaveToday(userId: string): Promise<boolean> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, start_date, end_date, status, leave_type')
        .eq('user_id', userId)
        .eq('leave_type', 'official')
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle();
      if (error) { console.error('checkOfficialLeaveToday error:', error); return false; }
      return !!data;
    } catch (err) {
      console.error('checkOfficialLeaveToday error:', err);
      return false;
    }
  }

  async function handleOffsiteToggle(checked: boolean) {
    if (!checked) {
      setAllowOffsiteScan(false);
      setOfficialLeaveOk(null);
      return;
    }
    if (!currentUserId) {
      window.alert("⚠️ ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง");
      return;
    }
    setCheckingLeave(true);
    const ok = await checkOfficialLeaveToday(currentUserId);
    setCheckingLeave(false);
    setOfficialLeaveOk(ok);
    setAllowOffsiteScan(ok);
    if (!ok) {
      window.alert("⚠️ ไม่พบใบลาไปราชการที่ได้รับอนุมัติสำหรับวันนี้\nกรุณายื่นและรอการอนุมัติใบลาไปราชการก่อนจึงจะสแกนนอกพื้นที่ได้");
    }
  }

  // ── 5. กล้อง ──────────────────────────────────────────────────────────────────
  const stopVideo = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  };

  const startVideo = async () => {
    // ── gate ตำแหน่ง GPS ก่อนเปิดกล้อง (แนวทางจาก scan.html ที่เช็ค GPS ก่อนเริ่มสแกนเสมอ) ──
    if (!isInsideSchool && !canOffsiteScan) {
      setStatus("⛔ อยู่นอกพื้นที่โรงเรียน กรุณาเข้าใกล้จุดเช็คอิน หรือติ๊กยืนยันปฏิบัติราชการนอกสถานที่ (ต้องมีใบลาไปราชการที่อนุมัติแล้ว)");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setStatus("✅ กำลังสแกน... มองกล้องตรงๆ");
        if (intervalRef.current) clearInterval(intervalRef.current);
        detectFaceLoop();
      }
    } catch {
      setStatus("❌ ตรวจไม่พบอุปกรณ์กล้อง");
    }
  };

  // ── 6. Loop ตรวจจับใบหน้า ─────────────────────────────────────────────────────
  const detectFaceLoop = () => {
    intervalRef.current = setInterval(async () => {
      // กันยิงซ้อน: ถ้ารอบก่อนหน้ายังประมวลผลไม่เสร็จ (เครื่องช้า/สัญญาณกล้องหน่วง) ให้ข้ามรอบนี้ไปก่อน
      if (isDetectingRef.current) return;
      if (!videoRef.current || !streamRef.current || !faceMatcher || !faceApiRef.current) return;

      isDetectingRef.current = true;
      const fa = faceApiRef.current;

      try {
        // TinyFaceDetector เร็วกว่า SsdMobilenetv1 มาก เหมาะกับ loop ต่อเนื่องแบบนี้
        const detection = await fa
          .detectSingleFace(videoRef.current, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && detection.descriptor.length === 128) {
          const match = faceMatcher.findBestMatch(detection.descriptor);
          const similarity = ((1 - match.distance) * 100).toFixed(1);

          if (match.label !== 'unknown' && match.distance < MATCH_THRESHOLD) {
            // เจอใบหน้าตรงกันชัดเจน — หยุดสแกนแล้วให้ผู้ใช้ "ยืนยัน" เองก่อนค่อยเขียนลงฐานข้อมูล
            // (เดิมระบบจะบันทึกทันที ปรับตามตัวอย่าง scan.html ที่มี modal ยืนยันก่อนเสมอ)
            if (intervalRef.current) clearInterval(intervalRef.current);
            const name = userNames[match.label] || match.label;
            setStatus(`✅ พบใบหน้า (${similarity}% ตรงกัน) กรุณายืนยันตัวตน`);
            setPendingMatch({ id: match.label, name, similarity });
          } else if (match.label !== 'unknown') {
            setStatus(`🔍 พบใบหน้า แต่ยังไม่ชัด (${similarity}%) ขยับเข้าใกล้กล้องอีกนิด`);
          } else {
            setStatus(`📷 กำลังสแกน... (ไม่พบข้อมูล ${similarity}%)`);
          }
        } else {
          setStatus("📷 กรุณาขยับหน้าให้อยู่ในกรอบสแกน");
        }
      } finally {
        isDetectingRef.current = false;
      }
    }, 800);
  };

  // ── 7. ยืนยัน / ยกเลิก การจับคู่ใบหน้า ────────────────────────────────────────
  const confirmMatch = async () => {
    if (!pendingMatch || isConfirming) return;
    setIsConfirming(true);
    await processAttendance(pendingMatch.id);
    setIsConfirming(false);
    setPendingMatch(null);
  };

  const cancelMatch = () => {
    setPendingMatch(null);
    setStatus("🟢 ระบบพร้อมสแกนใบหน้า");
    // เปิดกล้องสแกนต่อให้ทันที ไม่ต้องกดเปิดกล้องใหม่
    if (streamRef.current) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      detectFaceLoop();
    }
  };

  // ── 8. บันทึกเวลา ─────────────────────────────────────────────────────────────
  const processAttendance = async (scannedUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert("❌ กรุณาเข้าสู่ระบบก่อน"); return; }

    if (!isInsideSchool && !canOffsiteScan) {
      window.alert("❌ คุณอยู่นอกพื้นที่โรงเรียน\nกรุณาติ๊กยืนยันการปฏิบัติราชการนอกสถานที่ (ต้องมีใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้)");
      stopVideo();
      return;
    }

    const { data: foundUser } = await supabase
      .from('users').select('id').eq('email', user.email ?? '').maybeSingle();

    if (!foundUser) {
      window.alert("❌ ไม่พบข้อมูลผู้ใช้\nemail: " + user.email);
      stopVideo();
      return;
    }

    const finalUserId: string = (foundUser as any).id;
    const today  = new Date().toISOString().split('T')[0];
    const nowISO = new Date().toISOString();
    const thaiTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
    const thaiDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' });

    const now    = new Date();
    const isLate = attendanceType === 'check_in' &&
      (now.getHours() * 60 + now.getMinutes() > 7 * 60 + 45);
    const statusText = attendanceType === 'check_in'
      ? (isLate ? 'เข้างานสาย' : 'เข้างานปกติ')
      : 'ออกงานตามเวลา';

    if (attendanceType === 'check_in') {
      const { data: existing } = await supabase
        .from('teacher_attendance').select('id, check_time')
        .eq('user_id', finalUserId).eq('attendance_date', today).eq('type', 'check_in')
        .maybeSingle();

      if (existing) {
        const existTime = toThaiTime((existing as any).check_time);
        window.alert(`⚠️ บันทึกเวลาเข้างานวันนี้ไปแล้ว\n🕐 เวลา: ${existTime} น.`);
        stopVideo();
        return;
      }

      const { error } = await supabase.from('teacher_attendance').insert([{
        user_id: finalUserId, attendance_date: today, check_time: nowISO,
        type: 'check_in', is_onsite: isInsideSchool, status: statusText, distance: distanceFromSchool
      }] as any);

      if (!error) {
        window.alert(`✅ บันทึกเวลาเข้างานสำเร็จ\n📅 ${thaiDate}\n🕐 ${thaiTime} น.\n📊 ${statusText}`);
        await refreshStats(finalUserId);
      } else {
        window.alert("❌ ผิดพลาด: " + error.message);
      }

    } else {
      // ✅ กันซ้ำเช่นเดียวกับ check_in — เช็คว่าเช็คเอาท์วันนี้ไปแล้วหรือยัง
      const { data: existingOut } = await supabase
        .from('teacher_attendance').select('id, check_time')
        .eq('user_id', finalUserId).eq('attendance_date', today).eq('type', 'check_out')
        .maybeSingle();

      if (existingOut) {
        const existTime = toThaiTime((existingOut as any).check_time);
        window.alert(`⚠️ บันทึกเวลาออกงานวันนี้ไปแล้ว\n🕐 เวลา: ${existTime} น.`);
        stopVideo();
        return;
      }

      const { error } = await supabase.from('teacher_attendance').insert([{
        user_id: finalUserId, attendance_date: today, check_time: nowISO,
        type: 'check_out', is_onsite: isInsideSchool, status: statusText, distance: distanceFromSchool
      }] as any);

      if (!error) {
        window.alert(`✅ บันทึกเวลาออกงานสำเร็จ\n📅 ${thaiDate}\n🕐 ${thaiTime} น.`);
        await refreshStats(finalUserId);
      } else {
        window.alert("❌ ผิดพลาด: " + error.message);
      }
    }

    stopVideo();
  };

  // ── UI ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-blue-50 text-slate-800" style={{ fontFamily: "'Sarabun','TH Sarabun New',sans-serif" }}>
      
      {/* ย้ายมารวมกันตรงนี้ทั้งหมดเพื่อป้องกัน Nested Tags */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap');
      `}</style>

      <style jsx>{`
        /* วงแหวนไล่สีหมุนรอบวงกลม (mask ให้เหลือแต่ขอบ) คล้ายแอนิเมชัน Face ID ของ Apple */
        .face-scan-ring {
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34, 211, 238, 0.05) 40deg,
            #22d3ee 90deg,
            #a5f3fc 110deg,
            rgba(34, 211, 238, 0.05) 150deg,
            transparent 200deg,
            transparent 360deg
          );
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px));
          animation: faceScanSpin 1.6s linear infinite;
        }
        @keyframes faceScanSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Header บนสุด — ปุ่มกลับหน้าหลัก ย้ายมาไว้ด้านบนเหมือนระบบอื่น ───────── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-blue-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => router.push('/')}
          className="w-10 h-10 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center justify-center text-lg transition-colors">
          🏠
        </button>
        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-800 leading-none">ระบบลงเวลาปฏิบัติงาน</h1>
          <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-start p-4 sm:p-6">

        {/* หัวเวลา */}
        <div className="text-center mt-4 mb-8 w-full max-w-xl">
          <div className="text-6xl sm:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600 tracking-tight font-mono">
            {currentDateTime.time || "00:00:00"}
          </div>
          <div className="text-slate-500 mt-2 font-semibold text-lg sm:text-xl">วัน{currentDateTime.date || "กำลังโหลด..."}</div>
        </div>

        {/* แผงสแกน */}
        <div className="bg-white border border-blue-100 rounded-[2.5rem] p-6 sm:p-8 w-full max-w-xl shadow-[0_15px_40px_-15px_rgba(59,130,246,0.25)]">

          {/* GPS Badge */}
          <div className="flex justify-center mb-6">
            <div className={`px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-3 border-2 ${isInsideSchool ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-amber-50 text-amber-600 border-amber-300'}`}>
              <div className={`w-3 h-3 rounded-full animate-pulse ${isInsideSchool ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isInsideSchool ? "📍 คุณอยู่ในพื้นที่โรงเรียน" : `⚠️ อยู่นอกพื้นที่ (${distanceFromSchool} ม.${gpsAccuracy ? ` ±${gpsAccuracy} ม.` : ''})`}
            </div>
          </div>
          {/* คำอธิบายเมื่อ GPS ฟันธงว่านอกพื้นที่ทั้งที่ยืนอยู่ในโรงเรียนจริง */}
          {!isInsideSchool && gpsAccuracy !== null && (
            <p className="text-center text-[11px] text-slate-400 -mt-4 mb-4">
              ค่า GPS มีความคลาดเคลื่อนได้เอง โดยเฉพาะในอาคาร ลองออกไปที่โล่งแจ้งแล้วรอ 10-15 วินาทีให้ค่านิ่งก่อน
            </p>
          )}

          {/* กล้อง */}
          <div className="relative w-72 h-72 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-[8px] border-blue-50 shadow-inner" />

            {/* วงแหวนสแกนหมุนรอบวงกลม แบบ Apple Face ID — เพิ่มใหม่ตามที่ขอ */}
            {isCameraActive && !pendingMatch && (
              <div className="absolute -inset-3 rounded-full pointer-events-none overflow-hidden">
                <div className="face-scan-ring" />
              </div>
            )}
            {isCameraActive && !pendingMatch && (
              <div className="absolute -inset-1 rounded-full border-2 border-cyan-300/50 animate-ping pointer-events-none" />
            )}

            <div className="w-full h-full rounded-full overflow-hidden border-4 border-cyan-400 shadow-[0_0_50px_-8px_rgba(6,182,212,0.5)] bg-slate-50">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                  <span className="text-5xl mb-3">📷</span>
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-400">กล้องปิดการทำงาน</span>
                </div>
              )}
            </div>
          </div>

          {/* (ลบแท็ก style jsx เดิมที่อยู่ตรงนี้ออกแล้ว) */}

          <div className="space-y-5">
            {/* Toggle check_in / check_out */}
            <div className="grid grid-cols-2 gap-3 bg-blue-50/60 p-2 rounded-2xl border border-blue-100">
              <button type="button" onClick={() => setAttendanceType('check_in')}
                className={`py-4 rounded-xl font-bold text-base transition-all ${attendanceType === 'check_in' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                เข้างาน (Check In)
              </button>
              <button type="button" onClick={() => setAttendanceType('check_out')}
                className={`py-4 rounded-xl font-bold text-base transition-all ${attendanceType === 'check_out' ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                ออกงาน (Check Out)
              </button>
            </div>

            {/* ปุ่มเปิด/ปิดกล้อง — ล็อกไว้จนกว่าโมเดลจะพร้อม และต้องอยู่ในพื้นที่ (หรือมีใบลาไปราชการที่อนุมัติแล้ว) ก่อน */}
            <button type="button" onClick={isCameraActive ? stopVideo : startVideo}
              disabled={!modelsReady || (!isInsideSchool && !canOffsiteScan)}
              className={`w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all active:scale-[0.98] shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${isCameraActive ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white' : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'}`}>
              {isCameraActive ? "❌ ยกเลิกและปิดกล้องสแกน" : "📷 เปิดกล้องเพื่อสแกนใบหน้า"}
            </button>

            {!modelsReady && (
              <p className="text-center text-xs text-slate-400 -mt-2">⏳ กำลังเตรียมระบบ กรุณารอสักครู่...</p>
            )}
            {modelsReady && !isInsideSchool && !canOffsiteScan && (
              <p className="text-center text-xs text-amber-500 -mt-2">⛔ ต้องอยู่ในพื้นที่โรงเรียนจึงจะสแกนได้ หรือติ๊กยืนยันปฏิบัติราชการนอกสถานที่ด้านล่าง (ต้องมีใบลาไปราชการที่อนุมัติแล้ว)</p>
            )}

            {/* Offsite checkbox — ตรวจใบลาไปราชการก่อนอนุญาต */}
            {!isInsideSchool && (
              <div>
                <label className="flex items-center gap-4 bg-amber-50 p-4 rounded-2xl border-2 border-amber-200 cursor-pointer hover:bg-amber-100 transition-all">
                  <input type="checkbox" checked={allowOffsiteScan} disabled={checkingLeave}
                    onChange={e => handleOffsiteToggle(e.target.checked)}
                    className="w-6 h-6 rounded accent-amber-500" />
                  <span className="text-sm text-amber-700 font-bold leading-tight">ยืนยันว่ากำลังปฏิบัติราชการนอกสถานที่ / ไปราชการ</span>
                </label>
                {checkingLeave && (
                  <p className="text-xs text-amber-500 mt-1.5 text-center animate-pulse">⏳ กำลังตรวจสอบใบลาไปราชการ...</p>
                )}
                {!checkingLeave && officialLeaveOk === true && (
                  <p className="text-xs text-emerald-600 mt-1.5 text-center font-bold">✅ พบใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้ สามารถสแกนได้</p>
                )}
                {!checkingLeave && officialLeaveOk === false && (
                  <p className="text-xs text-red-500 mt-1.5 text-center font-bold">❌ ไม่พบใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้</p>
                )}
              </div>
            )}

            {/* Status bar */}
            <p className="text-center text-sm text-blue-600 font-bold bg-blue-50/60 py-2 rounded-xl border border-blue-100 tracking-wide">
              {status}
            </p>
          </div>
        </div>

        {/* สถิติ */}
        <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-xl">
          {[
            { label: 'สถิติประจำเดือนนี้', data: summary.monthly },
            { label: 'สถิติภาคเรียนที่ 1/2569', data: summary.term }
          ].map((item, i) => (
            <div key={i} className="bg-white border border-blue-100 p-5 rounded-3xl shadow-sm">
              <p className="text-blue-500 font-bold text-xs uppercase mb-4 tracking-wider border-b border-blue-50 pb-1">📊 {item.label}</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">ปกติ:</span><span className="text-emerald-500">{item.data.normal} ครั้ง</span></div>
                <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">สาย:</span><span className="text-rose-500">{item.data.late} ครั้ง</span></div>
                <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">ไปราชการ:</span><span className="text-amber-500">{item.data.mission} ครั้ง</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* ประวัติย้อนหลัง */}
        <div className="mt-8 w-full max-w-xl mb-12">
          <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-600 uppercase tracking-wider mb-4">🕒 รายการบันทึกย้อนหลัง</h3>
            <div className="space-y-3">
              {historyData.length > 0 ? historyData.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-4 bg-blue-50/40 rounded-2xl border border-blue-50 hover:bg-blue-50 transition-all">
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-slate-800">
                      {toThaiTime(log.check_time)} น.
                    </span>
                    <span className="text-xs text-slate-400">
                      {toThaiDateTime(log.check_time)}
                    </span>
                  </div>
                  <div className={`px-3 py-1 rounded-xl text-xs font-bold ${
                    log.type === 'check_out'
                      ? 'bg-blue-100 text-blue-600 border border-blue-200'
                      : log.status?.includes('สาย')
                        ? 'bg-rose-100 text-rose-600 border border-rose-200'
                        : 'bg-emerald-100 text-emerald-600 border border-emerald-200'
                  }`}>
                    {log.type === 'check_out' ? '🔒 ออกงาน' : `🔓 ${log.status}`}
                  </div>
                  <div className="text-xs text-slate-500 font-bold">
                    {log.is_onsite ? "🏫 ใน รร." : "💼 นอกพื้นที่"}
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400 text-sm font-bold italic bg-blue-50/30 rounded-2xl border border-blue-50">
                  ยังไม่มีข้อมูลรายการบันทึกเวลาล่าสุด
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal ยืนยันตัวตน — เพิ่มใหม่ตามแนวคิดจาก confirmModal ใน scan.html ──── */}
      {pendingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white border border-blue-100 rounded-3xl p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-cyan-50 border-2 border-cyan-200 flex items-center justify-center text-4xl">
              🙋
            </div>
            <p className="text-xs text-slate-400 mb-1">ตรวจพบใบหน้า</p>
            <p className="text-2xl font-bold text-blue-600 mb-4 break-words">{pendingMatch.name}</p>
            <div className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-600 px-5 py-2 rounded-full font-bold text-sm mb-2">
              {attendanceType === 'check_in' ? 'พร้อมยืนยันเข้างาน' : 'พร้อมยืนยันออกงาน'}
            </div>
            <p className="text-xs text-slate-400 mb-6">ความเหมือน: {pendingMatch.similarity}%</p>

            <button type="button" onClick={confirmMatch} disabled={isConfirming}
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg mb-3 disabled:opacity-50 transition-all">
              {isConfirming ? '⏳ กำลังบันทึก...' : (attendanceType === 'check_in' ? '✅ ยืนยันเข้างาน' : '✅ ยืนยันออกงาน')}
            </button>
            <button type="button" onClick={cancelMatch} disabled={isConfirming}
              className="w-full py-3 rounded-2xl font-bold text-sm bg-rose-50 border border-rose-200 text-rose-500 hover:bg-rose-100 transition-all disabled:opacity-50">
              ❌ ไม่ใช่ฉัน / สแกนใหม่
            </button>
          </div>
        </div>
      )}
    </div>
  );
  }