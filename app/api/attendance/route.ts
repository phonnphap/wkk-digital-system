// app/api/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { todayISO, lateMinutesFrom8 } from '@/lib/utils'

// ─── GET /api/attendance?userId=xxx ─────────────────────────────────────────
// ดึงสถานะการเข้างานวันนี้ของ user คนนั้น
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = req.nextUrl.searchParams.get('userId') ?? user.id
  const date   = req.nextUrl.searchParams.get('date') ?? todayISO()

  // หา DB user id จาก auth_id
  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', userId)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('teacher_attendance')
    .select('*')
    .eq('user_id', dbUser.id)
    .eq('attendance_date', date)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ attendance: data })
}

// ─── POST /api/attendance ────────────────────────────────────────────────────
// Body: { type: 'check_in' | 'check_out', lat, lng, faceScore, faceDescriptor? }
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
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

  // ดึง DB user id
  const { data: dbUser } = await service
    .from('users')
    .select('id, first_name, last_name')
    .eq('auth_id', user.id)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
  }

  const today     = todayISO()
  const nowISO    = new Date().toISOString()
  const nowDate   = new Date()

  if (type === 'check_in') {
    // ตรวจสอบว่า check-in แล้วหรือยัง
    const { data: existing } = await service
      .from('teacher_attendance')
      .select('id, check_in_time')
      .eq('user_id', dbUser.id)
      .eq('attendance_date', today)
      .maybeSingle()

    if (existing?.check_in_time) {
      return NextResponse.json({
        error: 'Already checked in today',
        checkInTime: existing.check_in_time,
      }, { status: 409 })
    }

    const isLate      = nowDate.getHours() >= 8 && lateMinutesFrom8(nowDate) > 0
    const lateMinutes = lateMinutesFrom8(nowDate)

    const { data, error } = await service
      .from('teacher_attendance')
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
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // อัปเดต face_vector ใน users table ถ้ามีข้อมูลใหม่
    if (faceDescriptor && faceDescriptor.length === 128) {
      await service
        .from('users')
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

  if (type === 'check_out') {
    const { data: existing } = await service
      .from('teacher_attendance')
      .select('id, check_in_time, check_out_time')
      .eq('user_id', dbUser.id)
      .eq('attendance_date', today)
      .maybeSingle()

    if (!existing?.check_in_time) {
      return NextResponse.json({ error: 'No check-in record found for today' }, { status: 404 })
    }

    if (existing.check_out_time) {
      return NextResponse.json({
        error: 'Already checked out today',
        checkOutTime: existing.check_out_time,
      }, { status: 409 })
    }

    const { data, error } = await service
      .from('teacher_attendance')
      .update({
        check_out_time: nowISO,
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_face_score: faceScore,
      })
      .eq('id', existing.id)
      .select()
      .single()

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
