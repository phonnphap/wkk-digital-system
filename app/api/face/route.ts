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
  const { data } = await supabase
    .from('users')
    .select('id, face_vector')
    .returns<{ id: string; face_vector: number[] }[]>(); // แนะนำระบุ Type ให้ชัดกว่า any

  const vectors = (data ?? []).map(u => ({
    user_id: u.id,
    face_vector: u.face_vector as number[], // Map กลับมาให้ชื่อตรงกับที่ฟังก์ชัน findBestMatch ต้องการ
  }));

  return NextResponse.json({ vectors });
}
