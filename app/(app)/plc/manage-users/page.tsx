"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const ADMIN_ROLES_SET = new Set(["admin", "director", "deputy_director"]);

function fullName(u: any) {
  if (!u) return "—";
  if (u.full_name) return u.full_name;
  return `${u.title ?? ""}${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "—";
}

type Teacher = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string; is_plc_coordinator?: boolean;
};

export default function ManagePLCUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      const email = authUser.email || authUser.user_metadata?.email || "";

      let profileData: any = null;
      const { data: byAuthId } = await supabase.from("users")
        .select("id, role").eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;
      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id, role").eq("email", email).maybeSingle();
        profileData = byEmail;
      }

      // ── เข้าได้เฉพาะ admin ตัวจริงเท่านั้น (ไม่ใช่ผู้ดูแลโครงการ) ──
      if (!profileData || !ADMIN_ROLES_SET.has(profileData.role ?? "")) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      const { data: allUsersData } = await supabase
        .from("users")
        .select("id, title, first_name, last_name, full_name, email, role, position, is_plc_coordinator")
        .order("first_name");

      const list: Teacher[] = (allUsersData || [])
        .filter((t: any) => !ADMIN_ROLES_SET.has(t.role ?? ""))
        .map((t: any) => ({
          ...t,
          full_name: t.full_name || `${t.title ?? ""}${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
        }));
      setTeachers(list);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return teachers.filter(t => fullName(t).toLowerCase().includes(q) || (t.email ?? "").toLowerCase().includes(q));
  }, [teachers, search]);

  const coordinatorCount = teachers.filter(t => t.is_plc_coordinator).length;

  async function toggleCoordinator(t: Teacher) {
    setSavingId(t.id);
    const next = !t.is_plc_coordinator;
    const { error } = await (supabase.from("users") as any)
      .update({ is_plc_coordinator: next })
      .eq("id", t.id);
    if (error) {
      alert("❌ " + error.message);
    } else {
      setTeachers(prev => prev.map(x => x.id === t.id ? { ...x, is_plc_coordinator: next } : x));
    }
    setSavingId(null);
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลด...</div></div>;
  if (!authorized) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-red-500 font-black text-lg">❌ ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
        <p className="text-slate-400 text-sm mt-2">เฉพาะผู้บริหารเท่านั้นที่จัดการสิทธิ์ผู้ดูแลโครงการได้</p>
        <button onClick={() => router.push("/plc")} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-sm">กลับหน้าหลัก</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/plc")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">🛡️ จัดการสิทธิ์ผู้ดูแลโครงการ</h1>
            <p className="text-blue-600 text-xs font-bold truncate">มอบสิทธิ์ให้ครูดูข้อมูล PLC แบบผู้บริหารได้ (ดูอย่างเดียว)</p>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 py-6 space-y-4 max-w-3xl mx-auto">
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">ℹ️</span>
          <p className="text-indigo-700 text-sm font-bold">
            ผู้ดูแลโครงการจะเห็นข้อมูล PLC ทุกกลุ่มสาระ/ทุกสายชั้นเหมือนผู้บริหาร แต่ <u>แก้ไข ลบ หรือมอบสิทธิ์ให้คนอื่นไม่ได้</u> — ตอนนี้มี {coordinatorCount} คน
          </p>
        </div>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ค้นหาชื่อครู หรืออีเมล..."
          className="w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 focus:outline-none" />

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">ไม่พบรายชื่อ</div>
          ) : filtered.map(t => (
            <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">{fullName(t)}</p>
                <p className="text-slate-400 text-xs">{t.email}{t.position ? ` · ${t.position}` : ""}</p>
              </div>
              <button
                onClick={() => toggleCoordinator(t)}
                disabled={savingId === t.id}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black border-2 transition-all disabled:opacity-50 ${
                  t.is_plc_coordinator
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}>
                {savingId === t.id ? "⏳" : t.is_plc_coordinator ? "✅ ผู้ดูแลโครงการ" : "🎓 ตั้งเป็นผู้ดูแลโครงการ"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}