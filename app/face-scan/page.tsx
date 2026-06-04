"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from "react";

import { useRouter } from 'next/navigation';
import { createClient } from "@/lib/supabase/client";

interface UserRow {
  id: string;
  face_features: any;
}

export default function FaceScanPage() {

const supabase = createClient();

const SCHOOL_LAT = 14.000541081931873;
const SCHOOL_LNG = 100.6766971783887;
const ALLOWED_RADIUS = 75;

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
          const { latitude, longitude } = pos.coords;
          const dist = calculateDistance(latitude, longitude, SCHOOL_LAT, SCHOOL_LNG);
          setDistanceFromSchool(dist);
          setIsInsideSchool(dist <= ALLOWED_RADIUS);
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
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
          await refreshStats((foundUser as any).id);
        }
      } catch (err) {
        console.error('loadInitialStats error:', err);
      }
    };

    loadInitialStats();
  }, []);

  // ── 3. โหลด AI Model + face vectors ─────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        setStatus("กำลังโหลดโมเดล AI...");
        const fa = await import('face-api.js');
        setFaceapi(fa);
        faceApiRef.current = fa;
        await Promise.all([
          fa.nets.ssdMobilenetv1.loadFromUri('/models'),
          fa.nets.faceLandmark68Net.loadFromUri('/models'),
          fa.nets.faceRecognitionNet.loadFromUri('/models')
        ]);

        const { data, error } = await supabase
          .from('users')
          .select('id, face_features')
          .returns<UserRow[]>();

        if (error) throw error;

        const users = data || [];
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
          setStatus("🔘 ระบบพร้อมสแกนใบหน้า");
        }
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

  // ── 5. กล้อง ──────────────────────────────────────────────────────────────────
  const stopVideo = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
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
      if (!videoRef.current || !streamRef.current || !faceMatcher || !faceApiRef.current) return;
      const fa = faceApiRef.current;

      const detection = await fa
        .detectSingleFace(videoRef.current, new fa.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection && detection.descriptor.length === 128) {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        const similarity = ((1 - match.distance) * 100).toFixed(1);

        if (match.label !== 'unknown') {
          if (match.distance < 0.4) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setStatus(`✅ พบใบหน้า (${similarity}% ตรงกัน) กำลังบันทึก...`);
            processAttendance(match.label);
          } else {
            setStatus(`🔍 พบใบหน้า แต่ยังไม่ชัด (${similarity}%) ขยับเข้าใกล้กล้องอีกนิด`);
          }
        } else {
          setStatus(`📷 กำลังสแกน... (ไม่พบข้อมูล ${similarity}%)`);
        }
      } else {
        setStatus("📷 กรุณาขยับหน้าให้อยู่ในกรอบสแกน");
      }
    }, 1000);
  };

  // ── 7. บันทึกเวลา ─────────────────────────────────────────────────────────────
  const processAttendance = async (scannedUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert("❌ กรุณาเข้าสู่ระบบก่อน"); return; }

    if (!isInsideSchool && !allowOffsiteScan) {
      window.alert("❌ คุณอยู่นอกพื้นที่โรงเรียน\nกรุณาติ๊กยืนยันการปฏิบัติราชการนอกสถานที่");
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
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0b1329] text-slate-100 p-6 font-sans">

      {/* หัวเวลา */}
      <div className="text-center mt-6 mb-8 w-full max-w-xl">
        <div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tight drop-shadow-lg font-mono">
          {currentDateTime.time || "00:00:00"}
        </div>
        <div className="text-slate-400 mt-2 font-bold text-xl">วัน{currentDateTime.date || "กำลังโหลด..."}</div>
        <h1 className="text-2xl font-black mt-4 text-white tracking-widest border-b-2 border-cyan-500/30 pb-3">
          ระบบลงเวลาปฏิบัติงาน โรงเรียนวัดเขียนเขต
        </h1>
      </div>

      {/* แผงสแกน */}
      <div className="bg-slate-900/80 backdrop-blur-2xl border-2 border-white/10 rounded-[2.5rem] p-8 w-full max-w-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)]">

        {/* GPS Badge */}
        <div className="flex justify-center mb-6">
          <div className={`px-6 py-2.5 rounded-full text-sm font-extrabold flex items-center gap-3 border-2 ${isInsideSchool ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
            <div className={`w-3 h-3 rounded-full animate-pulse ${isInsideSchool ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {isInsideSchool ? "📍 คุณอยู่ในพื้นที่โรงเรียน" : `⚠️ อยู่นอกพื้นที่ (${distanceFromSchool} เมตร)`}
          </div>
        </div>

        {/* กล้อง */}
        <div className="relative w-72 h-72 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-[8px] border-slate-800 shadow-inner" />
          <div className="w-full h-full rounded-full overflow-hidden border-4 border-cyan-400 shadow-[0_0_60px_-10px_rgba(6,182,212,0.6)] bg-slate-950">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/95">
                <span className="text-5xl mb-3">📷</span>
                <span className="text-xs uppercase tracking-widest font-black text-slate-400">กล้องปิดการทำงาน</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Toggle check_in / check_out */}
          <div className="grid grid-cols-2 gap-4 bg-black/40 p-2 rounded-2xl border border-white/10">
            <button type="button" onClick={() => setAttendanceType('check_in')}
              className={`py-4 rounded-xl font-black text-base transition-all ${attendanceType === 'check_in' ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
              เข้างาน (Check In)
            </button>
            <button type="button" onClick={() => setAttendanceType('check_out')}
              className={`py-4 rounded-xl font-black text-base transition-all ${attendanceType === 'check_out' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
              ออกงาน (Check Out)
            </button>
          </div>

          {/* ปุ่มเปิด/ปิดกล้อง */}
          <button type="button" onClick={isCameraActive ? stopVideo : startVideo}
            className={`w-full py-4 rounded-2xl font-black text-base tracking-wider transition-all active:scale-[0.98] shadow-2xl ${isCameraActive ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white' : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'}`}>
            {isCameraActive ? "❌ ยกเลิกและปิดกล้องสแกน" : "📷 เปิดกล้องเพื่อสแกนใบหน้า"}
          </button>

          {/* Offsite checkbox */}
          {!isInsideSchool && (
            <label className="flex items-center gap-4 bg-amber-500/10 p-4 rounded-2xl border-2 border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-all">
              <input type="checkbox" checked={allowOffsiteScan} onChange={e => setAllowOffsiteScan(e.target.checked)}
                className="w-6 h-6 rounded accent-amber-500" />
              <span className="text-sm text-amber-300 font-bold leading-tight">ยืนยันว่ากำลังปฏิบัติราชการนอกสถานที่ / ไปราชการ</span>
            </label>
          )}

          {/* Status bar */}
          <p className="text-center text-sm text-cyan-400 font-bold bg-slate-950/40 py-2 rounded-xl border border-white/5 tracking-wide">
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
          <div key={i} className="bg-slate-900/60 border-2 border-white/5 p-5 rounded-3xl shadow-xl">
            <p className="text-cyan-400 font-black text-xs uppercase mb-4 tracking-wider border-b border-white/5 pb-1">📊 {item.label}</p>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">ปกติ:</span><span className="text-emerald-400">{item.data.normal} ครั้ง</span></div>
              <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">สาย:</span><span className="text-rose-400">{item.data.late} ครั้ง</span></div>
              <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">ไปราชการ:</span><span className="text-amber-400">{item.data.mission} ครั้ง</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* ประวัติย้อนหลัง */}
      <div className="mt-8 w-full max-w-xl mb-12">
        <div className="bg-slate-900/60 border-2 border-white/5 rounded-3xl p-6 shadow-xl">
          <h3 className="text-base font-black text-slate-300 uppercase tracking-wider mb-4">🕒 รายการบันทึกย้อนหลัง</h3>
          <div className="space-y-3">
            {historyData.length > 0 ? historyData.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex flex-col">
                  <span className="text-base font-black text-white">
                    {toThaiTime(log.check_time)} น.
                  </span>
                  <span className="text-xs text-slate-400">
                    {toThaiDateTime(log.check_time)}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded-xl text-xs font-black ${
                  log.type === 'check_out'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : log.status?.includes('สาย')
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {log.type === 'check_out' ? '🔒 ออกงาน' : `🔓 ${log.status}`}
                </div>
                <div className="text-xs text-slate-300 font-bold">
                  {log.is_onsite ? "🏫 ใน รร." : "💼 นอกพื้นที่"}
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-slate-500 text-sm font-bold italic bg-black/20 rounded-2xl border border-white/5">
                ยังไม่มีข้อมูลรายการบันทึกเวลาล่าสุด
              </div>
            )}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => router.push('/')}
        className="mb-8 text-slate-500 hover:text-cyan-400 transition-colors text-xs font-black tracking-widest uppercase flex items-center gap-2">
        🏠 กลับสู่หน้าหลัก
      </button>
    </div>
  );
}