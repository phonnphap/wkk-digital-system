"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SchoolMap3D = dynamic(() => import("./SchoolMap3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">⏳ กำลังโหลดแผนที่ 3 มิติ...</div>
  ),
});

const ADMIN_ROLES = ["admin", "superadmin", "super_admin"];
const isAdminRole = (r: unknown) =>
  typeof r === "string" && ADMIN_ROLES.includes(r.trim().toLowerCase());

function useIsAdmin() {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    const sb = createClient();
    let alive = true;

    const check = async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { if (alive) setAdmin(false); return; }

        // 1) ตาราง users (ตามที่ใช้จริง) — ลองผูกด้วย id ก่อน
        let { data, error } = await sb.from("users").select("role").eq("id", user.id).maybeSingle();

        // 2) ถ้าไม่เจอ ลองผูกด้วย email (เผื่อตาราง users ไม่ได้ใช้ id เดียวกับ auth)
        if (!data && user.email) {
          const r = await sb.from("users").select("role").eq("email", user.email).maybeSingle();
          data = r.data; error = r.error ?? error;
        }

        console.log("[admin-check]", { uid: user.id, email: user.email, data, error });

        if (alive) setAdmin(isAdminRole(data?.role));
      } catch (e) {
        console.error("[admin-check] error", e);
        if (alive) setAdmin(false);
      }
    };

    check();
    const { data: sub } = sb.auth.onAuthStateChange(() => { check(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return admin;
}

export default function Map3DPage() {
  const isAdmin = useIsAdmin();
  const [inFrame, setInFrame] = useState(false);

  useEffect(() => {
    setInFrame(window.self !== window.top);
  }, []);

  return (
    <div className="relative w-screen h-screen">
      <SchoolMap3D isAdmin={isAdmin} />

      {inFrame && (
        <a
          href="/map3d"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-3 right-3 z-50 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-slate-800 shadow hover:bg-white"
        >
          ⤢ เปิดเต็มจอ
        </a>
      )}
    </div>
  );
}