'use client'
// app/login/page.tsx
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

export default function LoginPage() {
  // ปรับการโหลดเหลือแค่ระบบทั่วไป (email) หรือ microsoft และเอา google ออก
  const [loading, setLoading] = useState<'email' | 'microsoft' | null>(null)
  const [mounted, setMounted] = useState(false)
  
  // สร้าง State สำหรับเก็บค่าที่ครูพิมพ์ในช่องอีเมลและรหัสผ่าน
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  const router    = useRouter()
  const params    = useSearchParams()
  const supabase  = createClient()

  useEffect(() => {
    setMounted(true)
    const errorParam = params.get('error')
    if (errorParam) toast.error('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง')
  }, [params])

  // ฟังก์ชันสแตนด์บายสำหรับการล็อกอินด้วยอีเมลและรหัสผ่าน (ที่เพิ่มขึ้นมาใหม่)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading('email')
    
    // บังคับเช็กตรวจสอบชื่อโดเมนหลังบ้านเพื่อความปลอดภัย
    if (!email.endsWith('@khienkhet.ac.th')) {
      toast.error('กรุณาใช้อีเมลของโรงเรียน (@khienkhet.ac.th) เท่านั้น')
      setLoading(null)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      toast.error(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`)
      setLoading(null)
    } else {
      toast.success('เข้าสู่ระบบสำเร็จ กำลังนำเข้าสู่ระบบ...')
      router.push('/dashboard') // หรือหน้าแรกที่คุณครูตั้งค่าไว้
    }
  }

  // ฟังก์ชันล็อกอินด้วย Microsoft SSO (คงไว้และเปลี่ยนโดเมนปลายทาง)
  const handleSSO = async (provider: 'azure') => {
    setLoading('microsoft')
    const redirectTo = `${window.location.origin}/api/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {},
      },
    })

    if (error) {
      toast.error(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`)
      setLoading(null)
    }
  }

  return (
    // เปลี่ยนสีพื้นหลังหลัก (Background) จากโทนน้ำเงินเดิม เป็นไล่เฉดโทนม่วงเข้มสง่างาม
    <main className="min-h-screen flex items-center justify-center p-5"
      style={{ background: 'linear-gradient(135deg, #0f051a 0%, #250f44 50%, #3b1660 100%)' }}>

      {/* Decorative rings */}
      <div className="absolute top-[10%] right-[8%] w-72 h-72 rounded-full border border-purple-400/10 pointer-events-none" />
      <div className="absolute top-[8%] right-[6%] w-96 h-96 rounded-full border border-purple-400/05 pointer-events-none" />
      <div className="absolute bottom-[12%] left-[5%] w-52 h-52 rounded-full border border-purple-300/10 pointer-events-none" />
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(#a855f7 1px,transparent 1px),linear-gradient(90deg,#a855f7 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Card */}
      <div className={`relative z-10 w-full max-w-[420px] rounded-2xl overflow-hidden shadow-lg
                       transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}>

        {/* Top band - ย้อมสีแผ่นบนสุดเป็นโทนม่วงเข้มประจำโรงเรียน */}
        <div className="relative px-10 py-8 text-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#1c0a28 0%,#3b1660 100%)' }}>
          
          <div className="absolute inset-0 pointer-events-none animate-shimmer"
            style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.05) 50%,transparent 100%)' }} />

          {/* Emblem (เปลี่ยนมาเรียกรูปภาพโลโก้โรงเรียนจากโฟลเดอร์ public) */}
          <div className="flex items-center justify-center gap-3.5 mb-4">
            <div className="relative w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
              style={{ boxShadow: '0 4px 16px rgba(168,85,247,0.4)' }}>
              <img 
                src="/school-logo.png" 
                alt="โลโก้โรงเรียนวัดเขียนเขต" 
                className="w-10 h-10 object-contain"
              />
              <div className="absolute inset-[-4px] rounded-full border-2 border-purple-300/50 animate-pulse-ring" />
            </div>
            <div className="text-left">
              <p className="text-[11px] text-purple-200/60 font-medium tracking-widest uppercase">ระบบปฏิบัติงาน</p>
              <h1 className="text-lg font-bold text-white leading-tight">โรงเรียนวัดเขียนเขต</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full"
            style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" style={{ boxShadow: '0 0 6px #a855f7' }} />
            <span className="text-xs text-purple-200 font-medium">Digital School Management System</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-10 py-7">
          <h2 className="text-xl font-bold text-slate-800 text-center mb-1.5">ยินดีต้อนรับ</h2>
          <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
            เข้าสู่ระบบด้วยบัญชีอีเมลโรงเรียน<br/>
            <strong className="text-purple-700">@khienkhet.ac.th</strong> เท่านั้น
          </p>

          {/* 1. ช่องกรอกสำหรับ เข้าสู่ระบบด้วย e-mail และรหัส (เพิ่มด้านบนปุ่ม Microsoft) */}
          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">อีเมลบุคลากร</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ชื่อผู้ใช้@khienkhet.ac.th" 
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={loading !== null}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">รหัสผ่าน</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={loading !== null}
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={loading !== null}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading === 'email' ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "เข้าสู่ระบบด้วยระบบทั่วไป"
              )}
            </button>
          </form>

          {/* เส้นคั่นกลางสไตล์เดิมเพื่อความสวยงามแยกส่วน */}
          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-xs text-slate-400">หรือ</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* 2. ปุ่มล็อกอินด้วย Microsoft (ปุ่มเดิม คงเหลือไว้ตัวเดียว ไม่เอา Google) */}
          <div className="flex flex-col gap-3">
            <SSOButton
              provider="microsoft"
              label="เข้าสู่ระบบด้วย Microsoft 365"
              loading={loading === 'microsoft'}
              disabled={loading !== null}
              onClick={() => handleSSO('azure')}
            />
          </div>

          {/* Info note */}
          <div className="mt-6 p-3.5 rounded-[10px] bg-purple-50/50 border border-purple-100 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[12.5px] text-slate-500 leading-relaxed">
              ระบบนี้ใช้ได้เฉพาะบุคลากรโรงเรียนวัดเขียนเขตเท่านั้น
              หากมีปัญหากรุณาติดต่อผู้ดูแลระบบ
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-10 py-4 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[11.5px] text-slate-400 text-center">
            © 2569 โรงเรียนวัดเขียนเขต · สพป.ปทุมธานี เขต 2
          </p>
        </div>
      </div>
    </main>
  )
}

function SSOButton({
  provider, label, loading, disabled, onClick
}: {
  provider: 'microsoft'
  label: string; loading: boolean; disabled: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3.5 w-full px-5 py-3.5 rounded-[12px]
                 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-purple-300
                 transition-all duration-150 hover:-translate-y-px hover:shadow-soft
                 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
      <span className="w-6 h-6 flex-shrink-0">
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <rect x="1" y="1" width="10.5" height="10.5" fill="#f25022"/>
          <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7fba00"/>
          <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00a4ef"/>
          <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#ffb900"/>
        </svg>
      </span>
      <span className="text-[14.5px] font-semibold text-slate-700 flex-1 text-left">{label}</span>
      {loading ? (
        <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
      ) : (
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </button>
  )
}