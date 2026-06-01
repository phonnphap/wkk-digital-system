import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // ไม่ต้องสร้าง Supabase Client ในนี้ 
  // การเช็ค user/auth ให้ไปทำที่ Server Components หรือ Page แทน
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|models|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}