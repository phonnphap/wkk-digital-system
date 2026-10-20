"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShieldAlert } from "lucide-react";

type Props = {
  children: ReactNode;
  /** role ที่อนุญาต — ค่าเริ่มต้นคือเฉพาะ "admin" เท่านั้น */
  allowedRoles?: string[];
  /** อีเมลที่อนุญาตเพิ่มเติม (ถ้าไม่ต้องการก็ไม่ต้องใส่) */
  allowedEmails?: string[];
};

export default function AdminGuard({
  children,
  allowedRoles = ["admin"],
  allowedEmails = [],
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        const email = (user.email || user.user_metadata?.email || "").trim().toLowerCase();

        // หาโปรไฟล์จาก auth_id ก่อน ถ้าไม่เจอค่อยลองด้วยอีเมล (เหมือนหน้า dashboard)
        let role: string | null = null;
        const { data: byAuth } = await supabase
          .from("users").select("role").eq("auth_id", user.id).maybeSingle();
        role = byAuth?.role ?? null;
        if (!role && email) {
          const { data: byEmail } = await supabase
            .from("users").select("role").eq("email", email).maybeSingle();
          role = byEmail?.role ?? null;
        }

        const ok =
          (role !== null && allowedRoles.includes(role)) ||
          (email !== "" && allowedEmails.map((e) => e.toLowerCase()).includes(email));

        if (!cancelled) setState(ok ? "allowed" : "denied");
      } catch {
        // ตรวจสิทธิ์ไม่สำเร็จ = ไม่ให้เข้า (fail closed)
        if (!cancelled) setState("denied");
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "checking") {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-slate-400">
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="grid min-h-[60vh] place-items-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-rose-100 text-rose-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-base font-bold text-slate-800">ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p className="mt-1 text-sm text-slate-500">หน้านี้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            กลับหน้าแดชบอร์ด
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}