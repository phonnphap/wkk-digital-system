import { createClient } from "@supabase/supabase-js";

// ★ Service-role client — ใช้ได้เฉพาะฝั่ง server (API routes / route handlers) เท่านั้น
// ห้าม import ไฟล์นี้เข้าไฟล์ที่มี "use client" เด็ดขาด เพราะ service_role key จะหลุดไปที่ browser
//
// ต้องตั้งค่า environment variable เพิ่ม (ไม่มีใน client เดิม):
//   SUPABASE_SERVICE_ROLE_KEY = ...  (Supabase Dashboard > Project Settings > API > service_role secret)
//
// ใช้ client ตัวนี้เมื่อต้อง bypass RLS ชั่วคราวเพื่อทำงานที่ปลอดภัยกว่าถ้าทำที่ server เท่านั้น
// เช่น hash รหัสผ่านนักเรียน, อัปโหลดไฟล์ไป Storage แทนผู้ใช้, bulk import
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "ขาด environment variable: NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY " +
      "(ตั้งค่าใน .env.local และใน Vercel/hosting ที่ deploy ด้วย — ห้าม commit ค่าจริงลง git)"
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}