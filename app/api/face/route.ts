// app/api/face/route.ts
// GET — ดึง face vectors ทั้งหมดของครูที่ลงทะเบียนแล้ว (สำหรับ client matching)
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ดึง face_vector ของครูทุกคนที่ลงทะเบียนแล้ว
  // ส่งเฉพาะ user_id + face_vector เท่านั้น (ไม่ส่งข้อมูลส่วนตัวอื่น)
  const { data, error } = await supabase
    .from('users')
    .select('id, face_vector')
    .eq('is_active', true)
    .not('face_vector', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Map เป็น { user_id, face_vector } เพื่อใช้กับ findBestMatch()
  const vectors = (data ?? []).map(u => ({
    user_id: u.id,
    face_vector: u.face_vector as number[],
  }))

  return NextResponse.json({ vectors })
}
