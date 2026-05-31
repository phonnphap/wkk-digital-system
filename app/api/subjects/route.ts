import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ตรวจสอบให้แน่ใจว่าเรียกใช้ Environment Variables ได้ถูกต้อง
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase environment variables are missing' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  try {
    // ดึงข้อมูลจากตาราง subjects
    const { data, error } = await supabase
      .from('subjects')
      .select('*')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}