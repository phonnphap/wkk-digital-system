// middleware.ts (ที่ root เหมือนเดิม)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(request: NextRequest) {
  return NextResponse.next();
}