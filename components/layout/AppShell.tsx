"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PanelLeftClose, PanelLeftOpen, Menu, X, LogOut } from "lucide-react";
import { MENU_GROUPS, DASHBOARD_ITEM, type MenuItem } from "@/lib/menu-config";

const COLLAPSE_KEY = "khienkhet_sidebar_collapsed";

// ใช้ค่าเดียวกับหน้าแดชบอร์ดเดิม (แนะนำให้ย้ายไป lib/permissions.ts แล้ว import ร่วมกัน)
const ADMIN_ROLES = ["admin", "director", "deputy_director"];
const ADMIN_EMAILS = ["sumalin@khienkhet.ac.th", "phonnapha@khienkhet.ac.th"];
const IMPORT_EMAILS = ["sumalin@khienkhet.ac.th"];

const STATUS_DOT: Record<string, string> = {
  live: "bg-emerald-500",
  beta: "bg-amber-400",
  wip: "bg-slate-400",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  // จำสถานะย่อ/ขยายไว้ข้ามหน้าและข้ามการเปิดเบราว์เซอร์
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      try { window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  // ปิด drawer มือถือเมื่อเปลี่ยนหน้า
  useEffect(() => setMobileOpen(false), [pathname]);

  // ดึงสิทธิ์ผู้ใช้เพื่อแสดงกลุ่มเมนูผู้ดูแลระบบ
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const mail = (user.email || "").toLowerCase();
      setEmail(mail);
      const { data } = await supabase
        .from("users")
        .select("role, first_name, last_name")
        .eq("auth_id", user.id)
        .maybeSingle();
      setIsAdmin(ADMIN_ROLES.includes(data?.role ?? "") || ADMIN_EMAILS.includes(mail));
      const prefix =
        { director: "ผอ.", deputy_director: "รอง", admin: "Admin", staff: "คุณ" }[data?.role as string] ?? "คุณครู";
      const name = `${data?.first_name ?? user.user_metadata?.first_name ?? ""} ${data?.last_name ?? user.user_metadata?.last_name ?? ""}`.trim();
      setDisplayName(name ? `${prefix} ${name}` : mail);
    })();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  const isActive = (path: string) =>
    pathname === path || (path !== "/dashboard" && pathname.startsWith(path + "/"));

  function canSee(item: MenuItem) {
    if (!item.adminOnly) return true;
    if (item.path === "/admin/attendance-import") return isAdmin || IMPORT_EMAILS.includes(email);
    return isAdmin;
  }

  function NavLink({ item, showLabel }: { item: MenuItem; showLabel: boolean }) {
    const active = isActive(item.path);
    return (
      <Link
        href={item.path}
        title={showLabel ? undefined : item.name}
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
          active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        } ${showLabel ? "" : "justify-center"}`}
      >
        {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-blue-600" />}
        {item.icon}
        {showLabel && <span className="flex-1 truncate">{item.name}</span>}
        {item.status && (
          <span
            className={`shrink-0 rounded-full ${STATUS_DOT[item.status]} ${
              showLabel ? "w-2 h-2" : "absolute top-1.5 right-1.5 w-1.5 h-1.5"
            }`}
          />
        )}
      </Link>
    );
  }

  function SidebarBody({ showLabel }: { showLabel: boolean }) {
    return (
      <>
        <div className={`flex items-center gap-3 px-4 h-16 border-b border-slate-200 shrink-0 ${showLabel ? "" : "justify-center px-0"}`}>
          <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm">พ</div>
          {showLabel && (
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 leading-tight truncate">โรงเรียนวัดเขียนเขต</p>
              <p className="text-xs text-slate-400">WKK Smart School</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <NavLink item={DASHBOARD_ITEM} showLabel={showLabel} />
          {MENU_GROUPS.map((group) => {
            const items = group.items.filter(canSee);
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="space-y-1">
                {showLabel ? (
                  <p className="px-3 pb-1 text-xs font-extrabold text-slate-400">{group.title}</p>
                ) : (
                  <div className="mx-3 border-t border-slate-200" />
                )}
                {items.map((item) => (
                  <NavLink key={item.path} item={item} showLabel={showLabel} />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-2 shrink-0">
          <button
            onClick={handleLogout}
            title={showLabel ? undefined : "ออกจากระบบ"}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors ${showLabel ? "" : "justify-center"}`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {showLabel && <span>ออกจากระบบ</span>}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-slate-200 shrink-0 transition-[width] duration-200 ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <SidebarBody showLabel={!collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-72 max-w-[85%] bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="ปิดเมนู"
              className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarBody showLabel />
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-2 px-3 bg-white border-b border-slate-200">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดเมนู"
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            className="hidden lg:block p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          {/* ผู้ใช้ที่ล็อกอินอยู่ — แสดงทุกหน้า เพื่อให้ตรวจว่าเป็นบัญชีตัวเองหรือไม่ */}
          <div className="ml-auto flex items-center gap-2.5 min-w-0">
            <div className="text-right min-w-0 hidden sm:block">
              <p className="text-sm font-extrabold text-slate-800 leading-tight truncate">{displayName || "…"}</p>
              <p className="text-xs text-slate-400 truncate">{email}</p>
            </div>
            <div
              title={displayName}
              className="w-9 h-9 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-black"
            >
              {(displayName.replace(/^(ผอ\.|รอง|Admin|คุณครู|คุณ)\s*/, "")[0] || "?").toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}