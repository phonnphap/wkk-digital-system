import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // กล่องเปล่า: ไม่มีการ import Supabase หรือเรียกใช้งาน API ใดๆ
  return NextResponse.next();
}

// ลบ matcher ออกชั่วคราวเพื่อให้แน่ใจว่ามันจะไม่ไปขวางอะไร
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};