"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Three.js ใช้ได้เฉพาะฝั่ง browser
const SchoolMap3D = dynamic(() => import("./SchoolMap3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">⏳ กำลังโหลดแผนที่ 3 มิติ...</div>
  ),
});

// ปรับให้ตรงกับระบบสิทธิ์ของโรงเรียน: ค่า role ที่ถือว่าเป็นแอดมิน
const ADMIN_ROLES = ["admin", "superadmin", "super_admin"];

/** ตรวจ role จาก metadata ของผู้ใช้ ถ้าไม่มีให้ดูตาราง profiles.role
 *  (เป็นแค่การซ่อน/แสดงปุ่มตั้งค่า — ความปลอดภัยจริงต้องตั้ง RLS ที่ตาราง map_*) */
function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const meta = (user.app_metadata?.role ?? user.user_metadata?.role) as string | undefined;
        if (meta && ADMIN_ROLES.includes(meta.toLowerCase())) { setAdmin(true); return; }
        const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (data?.role && ADMIN_ROLES.includes(String(data.role).toLowerCase())) setAdmin(true);
      } catch { /* ไม่ใช่แอดมิน */ }
    })();
  }, []);
  return admin;
}

export default function Map3DPage() {
  const isAdmin = useIsAdmin();
  return (
    <div className="w-screen h-screen">
      <SchoolMap3D isAdmin={isAdmin} />
    </div>
  );
}