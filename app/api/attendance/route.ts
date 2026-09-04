// app/api/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { todayISO, lateMinutesFrom8 } from '@/lib/utils'

// ─── local types (แทน Database generated types) ──────────────────────────────
type AttendanceRow = {
  id: string
  user_id: string
  attendance_date: string
  check_in_time: string | null
  check_in_lat: number | null
  check_in_lng: number | null
  check_in_face_score: number | null
  check_out_time: string | null
  check_out_lat: number | null
  check_out_lng: number | null
  check_out_face_score: number | null
  is_late: boolean | null
  late_minutes: number | null
}

type DbUser = { id: string; first_name: string; last_name: string }

// select เฉพาะฟิลด์ที่ใช้ตอน check-in (ยังไม่มีค่า check_out_*)
type CheckInResult = Pick<AttendanceRow, 'id' | 'user_id' | 'attendance_date' | 'check_in_time' | 'check_in_lat' | 'check_in_lng' | 'check_in_face_score' | 'is_late' | 'late_minutes'>

// select เฉพาะฟิลด์ที่ใช้ตอน check-out
type CheckOutResult = Pick<AttendanceRow, 'id' | 'user_id' | 'attendance_date' | 'check_in_time' | 'check_out_time' | 'check_out_lat' | 'check_out_lng' | 'check_out_face_score' | 'is_late' | 'late_minutes'>

// ─── GET /api/attendance?userId=xxx ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = req.nextUrl.searchParams.get('userId') ?? user.id
  const date   = req.nextUrl.searchParams.get('date') ?? todayISO()

  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', userId)
    .single<{ id: string }>()

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('teacher_attendance')
    .select(`
      id,
      user_id,
      attendance_date,
      check_in_time,
      check_in_lat,
      check_in_lng,
      check_in_face_score,
      check_out_time,
      check_out_lat,
      check_out_lng,
      check_out_face_score,
      is_late,
      late_minutes
    `)
    .eq('user_id', dbUser.id)
    .eq('attendance_date', date)
    .maybeSingle<AttendanceRow>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ attendance: data })
}

// ─── POST /api/attendance ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const service  = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    type: 'check_in' | 'check_out'
    lat: number
    lng: number
    faceScore: number
    faceDescriptor?: number[]
  }

  const { type, lat, lng, faceScore, faceDescriptor } = body

  if (!type || lat === undefined || lng === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: dbUser } = await service
    .from('users')
    .select('id, first_name, last_name')
    .eq('auth_id', user.id)
    .single<DbUser>()

  if (!dbUser) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
  }

  const today  = todayISO()
  const nowISO = new Date().toISOString()
  const nowDate = new Date()

  // ── check_in ──────────────────────────────────────────────────────────────
  if (type === 'check_in') {
    const { data: existing } = await service
      .from('teacher_attendance')
      .select('id, check_in_time')
      .eq('user_id', dbUser.id)
      .eq('attendance_date', today)
      .maybeSingle<Pick<AttendanceRow, 'id' | 'check_in_time'>>()

    if (existing?.check_in_time) {
      return NextResponse.json({
        error: 'Already checked in today',
        checkInTime: existing.check_in_time,
      }, { status: 409 })
    }

    const isLate      = nowDate.getHours() >= 8 && lateMinutesFrom8(nowDate) > 0
    const lateMinutes = lateMinutesFrom8(nowDate)

    const { data, error } = await (service
      .from('teacher_attendance') as any)
      .upsert({
        user_id: dbUser.id,
        attendance_date: today,
        check_in_time: nowISO,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_face_score: faceScore,
        is_late: isLate,
        late_minutes: lateMinutes,
      }, { onConflict: 'user_id,attendance_date' })
      .select(`
        id,
        user_id,
        attendance_date,
        check_in_time,
        check_in_lat,
        check_in_lng,
        check_in_face_score,
        is_late,
        late_minutes
      `)
      .single() as { data: CheckInResult | null; error: { message: string } | null }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (faceDescriptor && faceDescriptor.length === 128) {
      await (service.from('users') as any)
        .update({
          face_vector: faceDescriptor,
          face_registered_at: nowISO,
        })
        .eq('id', dbUser.id)
    }

    return NextResponse.json({
      success: true,
      type: 'check_in',
      time: nowISO,
      isLate,
      lateMinutes,
      attendance: data,
    })
  }

  // ── check_out ─────────────────────────────────────────────────────────────
  if (type === 'check_out') {
    const { data: existing } = await service
      .from('teacher_attendance')
      .select('id, check_in_time, check_out_time')
      .eq('user_id', dbUser.id)
      .eq('attendance_date', today)
      .maybeSingle<Pick<AttendanceRow, 'id' | 'check_in_time' | 'check_out_time'>>()

    if (!existing?.check_in_time) {
      return NextResponse.json({ error: 'No check-in record found for today' }, { status: 404 })
    }

    if (existing.check_out_time) {
      return NextResponse.json({
        error: 'Already checked out today',
        checkOutTime: existing.check_out_time,
      }, { status: 409 })
    }

    const { data, error } = await (service
      .from('teacher_attendance') as any)
      .update({
        check_out_time: nowISO,
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_face_score: faceScore,
      })
      .eq('id', existing.id)
      .select(`
        id,
        user_id,
        attendance_date,
        check_in_time,
        check_out_time,
        check_out_lat,
        check_out_lng,
        check_out_face_score,
        is_late,
        late_minutes
      `)
      .single() as { data: CheckOutResult | null; error: { message: string } | null }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      type: 'check_out',
      time: nowISO,
      attendance: data,
    })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}