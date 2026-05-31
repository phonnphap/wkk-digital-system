import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export default async function RootPage() {
  const cookieStore = cookies();

  // สร้าง Supabase Client ฝั่ง Server เพื่อเช็กประวัติคุกกี้การล็อกอิน
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // ส่วนนี้ใส่ดักไว้เผื่อกรณีเรียกจาก Server Component ที่กำลังทำการ Redirect
          }
        },
      },
    }
  );

  // ตรวจสอบข้อมูล Session ปัจจุบัน
  const { data: { session } } = await supabase.auth.getSession();

  // 1. ถ้ายังไม่ได้ล็อกอิน หรือ Session ไม่มีอยู่ ให้เด้งไปที่หน้าล็อกอินโดยอัตโนมัติ
  if (!session) {
    redirect("/login");
  }

  // 2. ถ้ามีบัญชีล็อกอินค้างไว้เรียบร้อยแล้ว ให้วิ่งเข้าสู่หน้าแดชบอร์ดระบบงานของโรงเรียน
  redirect("/dashboard");
}