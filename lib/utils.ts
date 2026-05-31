// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ── Tailwind class merger ────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── GPS Utilities ────────────────────────────────────────────────────────────

/** Haversine distance in metres between two GPS coords */
export function getDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000 // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation ไม่รองรับในเบราว์เซอร์นี้'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
  })
}

export function isWithinSchoolRadius(lat: number, lng: number): boolean {
  const schoolLat = parseFloat(process.env.NEXT_PUBLIC_SCHOOL_LAT ?? '13.9235')
  const schoolLng = parseFloat(process.env.NEXT_PUBLIC_SCHOOL_LNG ?? '100.6234')
  const radius = parseInt(process.env.NEXT_PUBLIC_SCHOOL_RADIUS_METERS ?? '300')
  return getDistanceMeters(lat, lng, schoolLat, schoolLng) <= radius
}

// ── Date / Time ──────────────────────────────────────────────────────────────

/** วันนี้ในรูปแบบ YYYY-MM-DD (local time) */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** แปลง ISO timestamp → เวลาไทย HH:MM */
export function toThaiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
  })
}

/** เวลาตอนนี้เป็น string HH:MM */
export function nowTimeStr(): string {
  return new Date().toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
  })
}

/** วันที่ภาษาไทยพร้อมชื่อวัน */
export function toThaiDate(date?: string | Date): string {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleDateString('th-TH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Bangkok'
  })
}

/** คำนวณนาทีสายจาก 08:00 น. */
export function lateMinutesFrom8(checkIn: Date): number {
  const cutoff = new Date(checkIn)
  cutoff.setHours(8, 0, 0, 0)
  const diff = checkIn.getTime() - cutoff.getTime()
  return diff > 0 ? Math.floor(diff / 60000) : 0
}

// ── Face Vector ──────────────────────────────────────────────────────────────

/** แปลง Float32Array → number[] เพื่อเก็บใน JSON */
export function descriptorToArray(d: Float32Array): number[] {
  return Array.from(d)
}

/** Cosine distance (0 = identical, 1 = opposite) */
export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ── Attendance ───────────────────────────────────────────────────────────────

/** ป้ายสถานะการมาเรียน */
export const ATTENDANCE_LABELS: Record<string, { label: string; color: string }> = {
  present: { label: 'มาเรียน',  color: '#10b981' },
  absent:  { label: 'ขาดเรียน', color: '#ef4444' },
  late:    { label: 'มาสาย',    color: '#f59e0b' },
  leave:   { label: 'ลา',       color: '#8b5cf6' },
  excused: { label: 'มีเหตุ',   color: '#6b7280' },
}

/** ป้ายสถานะใบลา */
export const LEAVE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:           { label: 'รออนุมัติ',          color: '#f59e0b' },
  approved_head:     { label: 'หน.อนุมัติแล้ว',     color: '#0ea5e9' },
  approved_deputy:   { label: 'รอง ผอ.อนุมัติแล้ว', color: '#8b5cf6' },
  approved_director: { label: 'อนุมัติแล้ว ✓',       color: '#10b981' },
  rejected:          { label: 'ไม่อนุมัติ',          color: '#ef4444' },
}
