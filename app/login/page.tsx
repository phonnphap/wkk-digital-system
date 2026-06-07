// app/login/page.tsx
import { Suspense } from 'react'
import LoginContent from './LoginContent'

// ── Suspense boundary ที่ Next.js ต้องการ ──────────────────────────────────
export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f051a 0%, #250f44 50%, #3b1660 100%)' }}>
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <LoginContent />
    </Suspense>
  )
}