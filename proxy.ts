import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // ยกเว้น face-scan ออกจาก middleware เพื่อไม่ให้ Edge Runtime แตะ
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|face-scan|face-register).*)',
  ],
};