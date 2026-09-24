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

/* ──────────────────────────────────────────────────────────────────────────
   ไอคอนเส้น (สไตล์ SF Symbols) — ใช้แทนอิโมจิส่วนใหญ่เพื่อความสะอาดตา
   ────────────────────────────────────────────────────────────────────────── */
function IconCheck({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function IconCamera({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-1.8A1.5 1.5 0 0 1 10.45 4.5h3.1a1.5 1.5 0 0 1 1.25.7L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconEye({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconShield({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3.5l6.5 2.4v5.3c0 4.4-2.8 7.9-6.5 9.3-3.7-1.4-6.5-4.9-6.5-9.3V5.9L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.2 12.1l2 2 3.6-3.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconX({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function FaceScanPage() {

  const supabase = createClient();

  const SCHOOL_LAT = 14.000541081931873;
  const SCHOOL_LNG = 100.6766971783887;
  const ALLOWED_RADIUS = 75;
  const MATCH_THRESHOLD = 0.4;

  // ── liveness (anti-photo-spoofing) ──────────────────────────────────────
  // กันการเอารูปถ่าย/ภาพในจอมือถือมาสแกนแทนตัวจริง: หลังจากเจอใบหน้าที่ตรงกับ
  // ฐานข้อมูลแล้ว ระบบจะไม่ยืนยันตัวตนทันที แต่จะให้ "กระพริบตา" ตามธรรมชาติ
  // ก่อน โดยวัดจาก Eye Aspect Ratio (EAR) จากจุด landmark รอบดวงตา — ภาพนิ่ง
  // (รูปถ่าย/สกรีนช็อต) จะไม่สามารถกระพริบตาได้ จึงผ่านขั้นตอนนี้ไม่ได้
  const EAR_OPEN_THRESHOLD = 0.25;
  const EAR_CLOSED_THRESHOLD = 0.19;
  const LIVENESS_DURATION_MS = 7000;
  const LIVENESS_INTERVAL_MS = 150;

  const TERM1_START = new Date('2026-05-14T00:00:00+07:00');
  const TERM1_END = new Date('2026-10-09T23:59:59+07:00');

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

  // Eye Aspect Ratio: ค่าจะต่ำลงอย่างชัดเจนเมื่อหลับตา แล้วกลับขึ้นเมื่อลืมตา
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

  const faceApiRef = useRef<any>(null);
  const [faceapi, setFaceapi] = useState<any>(null);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const livenessIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    term: { normal: 0, late: 0, mission: 0 }
  });
  const [faceMatcher, setFaceMatcher] = useState<any>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [pendingMatch, setPendingMatch] = useState<{ id: string; name: string; similarity: string } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const isDetectingRef = useRef(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [officialLeaveOk, setOfficialLeaveOk] = useState<boolean | null>(null);
  const [checkingLeave, setCheckingLeave] = useState(false);

  // ── สถานะขั้นตอนการสแกน: detecting (กำลังหาหน้า) → liveness (ให้กระพริบตา) → confirm (ยืนยัน) ──
  const [scanStage, setScanStage] = useState<'idle' | 'detecting' | 'liveness' | 'confirm'>('idle');
  const [livenessSecondsLeft, setLivenessSecondsLeft] = useState(0);
  const eyeOpenRef = useRef(true);
  const blinkFoundRef = useRef(false);
  const livenessStartRef = useRef(0);
  const candidateRef = useRef<{ id: string; name: string; similarity: string } | null>(null);

  const canOffsiteScan = allowOffsiteScan && officialLeaveOk === true;

  // ── 1. นาฬิกา + GPS ──────────────────────────────────────────────────────
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
          const effectiveDist = Math.max(0, dist - accuracy);
          setIsInsideSchool(effectiveDist <= ALLOWED_RADIUS);
        },
        (err) => console.error(err),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    }
    return () => clearInterval(timer);
  }, []);

  // ── 2. โหลดสถิติจาก session ปัจจุบัน ─────────────────────────────────────
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

  // ── 3. โหลดโมเดล AI + เวกเตอร์ใบหน้าจากตาราง users เดิม (ไม่มีการสร้างผู้ใช้ใหม่) ──
  useEffect(() => {
    const init = async () => {
      try {
        setStatus("1/2 กำลังโหลดโมเดล AI");
        const fa = await import('face-api.js');
        setFaceapi(fa);
        faceApiRef.current = fa;
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri('/models'),
          fa.nets.faceLandmark68Net.loadFromUri('/models'),
          fa.nets.faceRecognitionNet.loadFromUri('/models')
        ]);

        setStatus("2/2 กำลังโหลดฐานข้อมูลใบหน้า");
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, face_features')
          .returns<UserRow[]>();

        if (error) throw error;

        const users = data || [];

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
          setStatus("ระบบพร้อม (ยังไม่พบข้อมูลใบหน้าในระบบ)");
        } else {
          setFaceMatcher(new fa.FaceMatcher(descriptors, 0.55));
          setStatus("ระบบพร้อมสแกนใบหน้า");
        }
        setModelsReady(true);
      } catch (err) {
        console.error(err);
        setStatus("โหลดโมเดลไม่สำเร็จ กรุณารีเฟรชหน้านี้");
      }
    };
    init();
  }, []);

  // ── 4. สถิติ + ประวัติ ────────────────────────────────────────────────────
  const refreshStats = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('teacher_attendance')
        .select('id, check_time, type, status, is_onsite')
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
      const thisYear = now.getFullYear();
      const monthly = { normal: 0, late: 0, mission: 0 };
      const term = { normal: 0, late: 0, mission: 0 };

      data.filter((log: any) => log.type === 'check_in').forEach((log: any) => {
        const d = new Date(log.check_time);
        const isMonth = d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        const bucket = log.status?.includes('สาย') ? 'late'
          : log.is_onsite === false ? 'mission' : 'normal';
        if (isInTerm1(d)) term[bucket as keyof typeof term]++;
        if (isMonth) monthly[bucket as keyof typeof monthly]++;
      });

      setSummary({ monthly, term });
    } catch (err) {
      console.error('refreshStats error:', err);
    }
  };

  // ── 4.5 ตรวจใบลาไปราชการ ─────────────────────────────────────────────────
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
      window.alert("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง");
      return;
    }
    setCheckingLeave(true);
    const ok = await checkOfficialLeaveToday(currentUserId);
    setCheckingLeave(false);
    setOfficialLeaveOk(ok);
    setAllowOffsiteScan(ok);
    if (!ok) {
      window.alert("ไม่พบใบลาไปราชการที่ได้รับอนุมัติสำหรับวันนี้\nกรุณายื่นและรอการอนุมัติใบลาไปราชการก่อนจึงจะสแกนนอกพื้นที่ได้");
    }
  }

  // ── 5. กล้อง ──────────────────────────────────────────────────────────────
  const clearAllTimers = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (livenessIntervalRef.current) { clearInterval(livenessIntervalRef.current); livenessIntervalRef.current = null; }
  };

  const stopVideo = () => {
    clearAllTimers();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    setScanStage('idle');
    eyeOpenRef.current = true;
    blinkFoundRef.current = false;
    candidateRef.current = null;
  };

  const startVideo = async () => {
    if (!isInsideSchool && !canOffsiteScan) {
      setStatus("อยู่นอกพื้นที่โรงเรียน กรุณาเข้าใกล้จุดเช็คอิน หรือยืนยันปฏิบัติราชการนอกสถานที่ด้านล่าง");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setScanStage('detecting');
        setStatus("กำลังสแกน — มองกล้องตรง ๆ");
        detectFaceLoop();
      }
    } catch {
      setStatus("ตรวจไม่พบอุปกรณ์กล้อง");
    }
  };

  // ── 6. Loop ตรวจจับ + จับคู่ใบหน้า ───────────────────────────────────────
  const detectFaceLoop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (isDetectingRef.current) return;
      if (!videoRef.current || !streamRef.current || !faceMatcher || !faceApiRef.current) return;

      isDetectingRef.current = true;
      const fa = faceApiRef.current;

      try {
        const detection = await fa
          .detectSingleFace(videoRef.current, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && detection.descriptor.length === 128) {
          const match = faceMatcher.findBestMatch(detection.descriptor);
          const similarity = ((1 - match.distance) * 100).toFixed(1);

          if (match.label !== 'unknown' && match.distance < MATCH_THRESHOLD) {
            const name = userNames[match.label] || match.label;
            startLivenessCheck({ id: match.label, name, similarity });
          } else if (match.label !== 'unknown') {
            setStatus(`พบใบหน้า แต่ยังไม่ชัด (${similarity}%) ขยับเข้าใกล้กล้องอีกนิด`);
          } else {
            setStatus(`กำลังสแกน... (ไม่พบข้อมูลตรงกัน ${similarity}%)`);
          }
        } else {
          setStatus("กรุณาจัดใบหน้าให้อยู่ในกรอบสแกน");
        }
      } finally {
        isDetectingRef.current = false;
      }
    }, 800);
  };

  // ── 6.5 การยืนยันว่าเป็นคนจริง (liveness) ด้วยการกระพริบตา ──────────────────
  // ป้องกันการนำรูปถ่ายหรือภาพนิ่งบนหน้าจอมาสแกนแทนตัวจริง: ต้องตรวจพบการ
  // กระพริบตาตามธรรมชาติภายในเวลาที่กำหนด และยืนยันตัวตนซ้ำอีกครั้งก่อนบันทึกเวลา
  function startLivenessCheck(candidate: { id: string; name: string; similarity: string }) {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    candidateRef.current = candidate;
    eyeOpenRef.current = true;
    blinkFoundRef.current = false;
    livenessStartRef.current = Date.now();
    setScanStage('liveness');
    setLivenessSecondsLeft(Math.ceil(LIVENESS_DURATION_MS / 1000));
    setStatus(`พบคุณ ${candidate.name} — กรุณากระพริบตาตามปกติเพื่อยืนยันว่าเป็นคนจริง`);

    livenessIntervalRef.current = setInterval(async () => {
      const fa = faceApiRef.current;
      if (!videoRef.current || !fa) return;

      const elapsed = Date.now() - livenessStartRef.current;
      const remainMs = Math.max(0, LIVENESS_DURATION_MS - elapsed);
      setLivenessSecondsLeft(Math.ceil(remainMs / 1000));

      if (elapsed > LIVENESS_DURATION_MS) {
        if (livenessIntervalRef.current) { clearInterval(livenessIntervalRef.current); livenessIntervalRef.current = null; }
        candidateRef.current = null;
        setScanStage('detecting');
        setStatus("ยืนยันไม่สำเร็จ ไม่พบการกระพริบตา กรุณาลองใหม่อีกครั้ง");
        detectFaceLoop();
        return;
      }

      try {
        const det = await fa
          .detectSingleFace(videoRef.current, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks();
        if (!det) return;

        const leftEAR = eyeAspectRatio(det.landmarks.getLeftEye());
        const rightEAR = eyeAspectRatio(det.landmarks.getRightEye());
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (eyeOpenRef.current && avgEAR < EAR_CLOSED_THRESHOLD) {
          eyeOpenRef.current = false;
        } else if (!eyeOpenRef.current && avgEAR > EAR_OPEN_THRESHOLD) {
          eyeOpenRef.current = true;
          blinkFoundRef.current = true;
        }

        if (blinkFoundRef.current) {
          if (livenessIntervalRef.current) { clearInterval(livenessIntervalRef.current); livenessIntervalRef.current = null; }

          // ยืนยันซ้ำอีกครั้งว่ายังเป็นคนเดิมที่ตรวจพบตอนแรก ก่อนเปิด modal ยืนยัน
          const finalDet = await fa
            .detectSingleFace(videoRef.current, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          const candidate = candidateRef.current;
          if (finalDet && faceMatcher && candidate) {
            const reMatch = faceMatcher.findBestMatch(finalDet.descriptor);
            if (reMatch.label === candidate.id && reMatch.distance < MATCH_THRESHOLD) {
              setScanStage('confirm');
              setStatus("ยืนยันตัวตนจริงสำเร็จ");
              setPendingMatch(candidate);
              return;
            }
          }
          // ยืนยันซ้ำไม่ผ่าน — เริ่มสแกนใหม่
          candidateRef.current = null;
          setScanStage('detecting');
          setStatus("ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
          detectFaceLoop();
        }
      } catch {
        // ข้าม error ชั่วคราวระหว่างตรวจ ไม่ต้องหยุด loop
      }
    }, LIVENESS_INTERVAL_MS);
  }

  // ── 7. ยืนยัน / ยกเลิก การจับคู่ใบหน้า ────────────────────────────────────
  const confirmMatch = async () => {
    if (!pendingMatch || isConfirming) return;
    setIsConfirming(true);
    await processAttendance(pendingMatch.id);
    setIsConfirming(false);
    setPendingMatch(null);
  };

  const cancelMatch = () => {
    setPendingMatch(null);
    candidateRef.current = null;
    eyeOpenRef.current = true;
    blinkFoundRef.current = false;
    setStatus("ระบบพร้อมสแกนใบหน้า");
    if (streamRef.current) {
      setScanStage('detecting');
      detectFaceLoop();
    }
  };

  // ── 8. บันทึกเวลา ─────────────────────────────────────────────────────────
  const processAttendance = async (scannedUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert("กรุณาเข้าสู่ระบบก่อน"); return; }

    if (!isInsideSchool && !canOffsiteScan) {
      window.alert("คุณอยู่นอกพื้นที่โรงเรียน\nกรุณายืนยันการปฏิบัติราชการนอกสถานที่ (ต้องมีใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้)");
      stopVideo();
      return;
    }

    const { data: foundUser } = await supabase
      .from('users').select('id').eq('email', user.email ?? '').maybeSingle();

    if (!foundUser) {
      window.alert("ไม่พบข้อมูลผู้ใช้\nemail: " + user.email);
      stopVideo();
      return;
    }

    const finalUserId: string = (foundUser as any).id;
    const today = new Date().toISOString().split('T')[0];
    const nowISO = new Date().toISOString();
    const thaiTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
    const thaiDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' });

    const now = new Date();
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
        window.alert(`บันทึกเวลาเข้างานวันนี้ไปแล้ว\nเวลา: ${existTime} น.`);
        stopVideo();
        return;
      }

      const { error } = await supabase.from('teacher_attendance').insert([{
        user_id: finalUserId, attendance_date: today, check_time: nowISO,
        type: 'check_in', is_onsite: isInsideSchool, status: statusText, distance: distanceFromSchool
      }] as any);

      if (!error) {
        window.alert(`บันทึกเวลาเข้างานสำเร็จ\n${thaiDate}\n${thaiTime} น.\n${statusText}`);
        await refreshStats(finalUserId);
      } else {
        window.alert("ผิดพลาด: " + error.message);
      }

    } else {
      const { data: existingOut } = await supabase
        .from('teacher_attendance').select('id, check_time')
        .eq('user_id', finalUserId).eq('attendance_date', today).eq('type', 'check_out')
        .maybeSingle();

      if (existingOut) {
        const existTime = toThaiTime((existingOut as any).check_time);
        window.alert(`บันทึกเวลาออกงานวันนี้ไปแล้ว\nเวลา: ${existTime} น.`);
        stopVideo();
        return;
      }

      const { error } = await supabase.from('teacher_attendance').insert([{
        user_id: finalUserId, attendance_date: today, check_time: nowISO,
        type: 'check_out', is_onsite: isInsideSchool, status: statusText, distance: distanceFromSchool
      }] as any);

      if (!error) {
        window.alert(`บันทึกเวลาออกงานสำเร็จ\n${thaiDate}\n${thaiTime} น.`);
        await refreshStats(finalUserId);
      } else {
        window.alert("ผิดพลาด: " + error.message);
      }
    }

    stopVideo();
  };

  const isLivenessPhase = scanStage === 'liveness';
  const isDetectingPhase = scanStage === 'detecting';

  // ── UI ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Thai', 'Sarabun', 'Noto Sans Thai', sans-serif" }}
    >
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap');
      `}</style>

      <style jsx>{`
        .ring-detect {
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(10, 132, 255, 0.06) 40deg,
            #0A84FF 100deg,
            #7dc0ff 130deg,
            rgba(10, 132, 255, 0.06) 170deg,
            transparent 220deg,
            transparent 360deg
          );
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
          animation: ringSpin 1.7s linear infinite;
        }
        .ring-liveness {
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(94, 92, 230, 0.08) 40deg,
            #5E5CE6 100deg,
            #b9b8f7 130deg,
            rgba(94, 92, 230, 0.08) 170deg,
            transparent 220deg,
            transparent 360deg
          );
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
          animation: ringSpin 1s linear infinite;
        }
        @keyframes ringSpin { to { transform: rotate(360deg); } }
        @keyframes softPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.9); }
        }
        .blink-pulse { animation: softPulse 1.1s ease-in-out infinite; }
      `}</style>

      {/* ── แถบบนแบบ Apple Nav Bar: โปร่งแสง เบลอพื้นหลัง เส้นขอบบาง ── */}
      <div className="sticky top-0 z-40 bg-white/75 backdrop-blur-xl border-b border-black/5 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => router.push('/')}
          className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.07] flex items-center justify-center transition-colors active:scale-95">
          <IconPin className="w-4.5 h-4.5 text-[#1D1D1F]" />
        </button>
        <div>
          <h1 className="text-[15px] font-semibold text-[#1D1D1F] leading-none">ระบบลงเวลาปฏิบัติงาน</h1>
          <p className="text-[#86868B] text-xs mt-1">โรงเรียนวัดเขียนเขต</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-start p-4 sm:p-6">

        {/* หัวเวลา */}
        <div className="text-center mt-6 mb-8 w-full max-w-xl">
          <div className="text-6xl sm:text-7xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
            {currentDateTime.time || "00:00:00"}
          </div>
          <div className="text-[#86868B] mt-2 font-medium text-base sm:text-lg">
            วัน{currentDateTime.date || "กำลังโหลด..."}
          </div>
        </div>

        {/* แผงสแกน */}
        <div className="bg-white/90 backdrop-blur border border-black/5 rounded-[32px] p-6 sm:p-8 w-full max-w-xl shadow-[0_2px_40px_-12px_rgba(0,0,0,0.15)]">

          {/* GPS badge */}
          <div className="flex justify-center mb-6">
            <div className={`px-5 py-2 rounded-full text-[13px] font-medium flex items-center gap-2 ${isInsideSchool ? 'bg-[#30D158]/10 text-[#1E8E3E]' : 'bg-[#FF9F0A]/12 text-[#B8720A]'}`}>
              <IconPin className="w-3.5 h-3.5" />
              {isInsideSchool ? "อยู่ในพื้นที่โรงเรียน" : `นอกพื้นที่ (${distanceFromSchool} ม.${gpsAccuracy ? ` ±${gpsAccuracy} ม.` : ''})`}
            </div>
          </div>
          {!isInsideSchool && gpsAccuracy !== null && (
            <p className="text-center text-[11px] text-[#86868B] -mt-4 mb-4">
              ค่า GPS มีความคลาดเคลื่อนได้เอง โดยเฉพาะในอาคาร ลองออกไปที่โล่งแจ้งแล้วรอสักครู่ให้ค่านิ่งก่อน
            </p>
          )}

          {/* กล้อง */}
          <div className="relative w-72 h-72 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-[6px] border-[#F5F5F7]" />

            {isCameraActive && isDetectingPhase && (
              <div className="absolute -inset-3 rounded-full pointer-events-none overflow-hidden">
                <div className="ring-detect w-full h-full" />
              </div>
            )}
            {isCameraActive && isLivenessPhase && (
              <div className="absolute -inset-3 rounded-full pointer-events-none overflow-hidden">
                <div className="ring-liveness w-full h-full" />
              </div>
            )}

            <div className={`w-full h-full rounded-full overflow-hidden border-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] bg-[#FAFAFA] transition-colors ${isLivenessPhase ? 'border-[#5E5CE6]' : 'border-[#0A84FF]'}`}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[#86868B] bg-[#FAFAFA]">
                  <IconCamera className="w-10 h-10 mb-3 text-[#C7C7CC]" />
                  <span className="text-[13px] font-medium text-[#AEAEB2]">กล้องปิดการทำงาน</span>
                </div>
              )}
            </div>

            {/* ป้ายบอกขั้นตอน liveness ลอยอยู่ใต้วงกลม */}
            {isCameraActive && isLivenessPhase && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#5E5CE6] text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap">
                <IconEye className="w-3.5 h-3.5 blink-pulse" />
                กระพริบตา · {livenessSecondsLeft} วิ
              </div>
            )}
          </div>

          <div className="space-y-5">
            {/* Toggle check_in / check_out — segmented control สไตล์ Apple */}
            <div className="grid grid-cols-2 gap-1 bg-black/[0.045] p-1 rounded-2xl">
              <button type="button" onClick={() => setAttendanceType('check_in')}
                className={`py-3.5 rounded-xl font-semibold text-[15px] transition-all ${attendanceType === 'check_in' ? 'bg-white text-[#1D1D1F] shadow-[0_1px_4px_rgba(0,0,0,0.12)]' : 'text-[#86868B]'}`}>
                เข้างาน
              </button>
              <button type="button" onClick={() => setAttendanceType('check_out')}
                className={`py-3.5 rounded-xl font-semibold text-[15px] transition-all ${attendanceType === 'check_out' ? 'bg-white text-[#1D1D1F] shadow-[0_1px_4px_rgba(0,0,0,0.12)]' : 'text-[#86868B]'}`}>
                ออกงาน
              </button>
            </div>

            <button type="button" onClick={isCameraActive ? stopVideo : startVideo}
              disabled={!modelsReady || (!isInsideSchool && !canOffsiteScan)}
              className={`w-full py-4 rounded-2xl font-semibold text-[16px] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${isCameraActive ? 'bg-[#FF3B30] text-white' : 'bg-[#0A84FF] text-white'}`}>
              {isCameraActive ? "ยกเลิกและปิดกล้อง" : "เปิดกล้องเพื่อสแกนใบหน้า"}
            </button>

            {!modelsReady && (
              <p className="text-center text-xs text-[#86868B] -mt-2">กำลังเตรียมระบบ กรุณารอสักครู่...</p>
            )}
            {modelsReady && !isInsideSchool && !canOffsiteScan && (
              <p className="text-center text-xs text-[#B8720A] -mt-2">ต้องอยู่ในพื้นที่โรงเรียนจึงจะสแกนได้ หรือยืนยันปฏิบัติราชการนอกสถานที่ด้านล่าง</p>
            )}

            {!isInsideSchool && (
              <div>
                <label className="flex items-center gap-4 bg-[#FF9F0A]/8 p-4 rounded-2xl border border-[#FF9F0A]/20 cursor-pointer hover:bg-[#FF9F0A]/12 transition-all">
                  <input type="checkbox" checked={allowOffsiteScan} disabled={checkingLeave}
                    onChange={e => handleOffsiteToggle(e.target.checked)}
                    className="w-5 h-5 rounded accent-[#FF9F0A]" />
                  <span className="text-[14px] text-[#B8720A] font-medium leading-tight">ยืนยันว่ากำลังปฏิบัติราชการนอกสถานที่ / ไปราชการ</span>
                </label>
                {checkingLeave && (
                  <p className="text-xs text-[#B8720A] mt-1.5 text-center animate-pulse">กำลังตรวจสอบใบลาไปราชการ...</p>
                )}
                {!checkingLeave && officialLeaveOk === true && (
                  <p className="text-xs text-[#1E8E3E] mt-1.5 text-center font-medium">พบใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้ สามารถสแกนได้</p>
                )}
                {!checkingLeave && officialLeaveOk === false && (
                  <p className="text-xs text-[#FF3B30] mt-1.5 text-center font-medium">ไม่พบใบลาไปราชการที่อนุมัติแล้วสำหรับวันนี้</p>
                )}
              </div>
            )}

            {/* Status bar */}
            <p className="text-center text-[13px] text-[#48484A] font-medium bg-black/[0.035] py-2.5 rounded-xl tracking-wide">
              {status}
            </p>
          </div>
        </div>

        {/* สถิติ */}
        <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-xl">
          {[
            { label: 'ประจำเดือนนี้', data: summary.monthly },
            { label: 'ภาคเรียนที่ 1/2569', data: summary.term }
          ].map((item, i) => (
            <div key={i} className="bg-white/90 backdrop-blur border border-black/5 p-5 rounded-3xl shadow-[0_1px_20px_-10px_rgba(0,0,0,0.12)]">
              <p className="text-[#86868B] font-semibold text-[12px] mb-4 border-b border-black/[0.04] pb-2">{item.label}</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-[14px] font-medium"><span className="text-[#86868B]">ปกติ</span><span className="text-[#1E8E3E]">{item.data.normal} ครั้ง</span></div>
                <div className="flex justify-between text-[14px] font-medium"><span className="text-[#86868B]">สาย</span><span className="text-[#FF3B30]">{item.data.late} ครั้ง</span></div>
                <div className="flex justify-between text-[14px] font-medium"><span className="text-[#86868B]">ไปราชการ</span><span className="text-[#B8720A]">{item.data.mission} ครั้ง</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* ประวัติย้อนหลัง */}
        <div className="mt-8 w-full max-w-xl mb-12">
          <div className="bg-white/90 backdrop-blur border border-black/5 rounded-3xl p-6 shadow-[0_1px_20px_-10px_rgba(0,0,0,0.12)]">
            <h3 className="text-[13px] font-semibold text-[#86868B] mb-4">รายการบันทึกย้อนหลัง</h3>
            <div className="space-y-2">
              {historyData.length > 0 ? historyData.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-4 bg-black/[0.025] rounded-2xl hover:bg-black/[0.045] transition-all">
                  <div className="flex flex-col">
                    <span className="text-[15px] font-semibold text-[#1D1D1F]">
                      {toThaiTime(log.check_time)} น.
                    </span>
                    <span className="text-[12px] text-[#86868B]">
                      {toThaiDateTime(log.check_time)}
                    </span>
                  </div>
                  <div className={`px-3 py-1 rounded-xl text-[12px] font-semibold ${
                    log.type === 'check_out'
                      ? 'bg-[#0A84FF]/10 text-[#0A84FF]'
                      : log.status?.includes('สาย')
                        ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                        : 'bg-[#30D158]/10 text-[#1E8E3E]'
                  }`}>
                    {log.type === 'check_out' ? 'ออกงาน' : log.status}
                  </div>
                  <div className="text-[12px] text-[#86868B] font-medium">
                    {log.is_onsite ? "ในโรงเรียน" : "นอกพื้นที่"}
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-[#AEAEB2] text-[14px] font-medium bg-black/[0.02] rounded-2xl">
                  ยังไม่มีข้อมูลรายการบันทึกเวลาล่าสุด
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal ยืนยันตัวตน ── */}
      {pendingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white border border-black/5 rounded-[32px] p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-[#30D158]/10 flex items-center justify-center">
              <IconShield className="w-7 h-7 text-[#1E8E3E]" />
            </div>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <IconCheck className="w-3.5 h-3.5 text-[#1E8E3E]" />
              <p className="text-[12px] text-[#1E8E3E] font-semibold">ยืนยันว่าเป็นคนจริงแล้ว</p>
            </div>
            <p className="text-2xl font-semibold text-[#1D1D1F] mb-4 break-words">{pendingMatch.name}</p>
            <div className="inline-block bg-[#0A84FF]/10 text-[#0A84FF] px-5 py-2 rounded-full font-semibold text-sm mb-2">
              {attendanceType === 'check_in' ? 'พร้อมยืนยันเข้างาน' : 'พร้อมยืนยันออกงาน'}
            </div>
            <p className="text-xs text-[#86868B] mb-6">ความเหมือนใบหน้า {pendingMatch.similarity}%</p>

            <button type="button" onClick={confirmMatch} disabled={isConfirming}
              className="w-full py-4 rounded-2xl font-semibold text-[16px] bg-[#0A84FF] text-white shadow-lg mb-3 disabled:opacity-50 transition-all active:scale-[0.98]">
              {isConfirming ? 'กำลังบันทึก...' : (attendanceType === 'check_in' ? 'ยืนยันเข้างาน' : 'ยืนยันออกงาน')}
            </button>
            <button type="button" onClick={cancelMatch} disabled={isConfirming}
              className="w-full py-3.5 rounded-2xl font-semibold text-[15px] bg-black/[0.04] text-[#FF3B30] hover:bg-black/[0.06] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
              <IconX className="w-4 h-4" />
              ไม่ใช่ฉัน / สแกนใหม่
            </button>
          </div>
        </div>
      )}
    </div>
  );
}