import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // รับได้ทั้ง ?next= (จากหน้า login/ปุ่ม Teams) และ ?redirect= (ของเดิม)
  const raw = searchParams.get('next') ?? searchParams.get('redirect')
  // กัน open redirect: ยอมเฉพาะ path ภายในเว็บเรา
  const dest =
    raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')
      ? raw
      : '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${dest}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}