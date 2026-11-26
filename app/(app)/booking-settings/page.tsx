"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { isAdminRole } from "@/lib/booking-config";

const supabase = createClient() as any;

type Col = { key: string; label: string; type: "text" | "number" | "checkbox" | "date" | "select"; options?: string[]; w?: string; showIf?: (row: any) => boolean };

const ROOM_COLS: Col[] = [
  { key: "name", label: "ชื่อห้อง", type: "text", w: "min-w-[160px]" },
  { key: "capacity", label: "จุได้ (คน)", type: "number", w: "w-24" },
  { key: "sort_order", label: "ลำดับ", type: "number", w: "w-20" },
  { key: "is_active", label: "เปิดใช้", type: "checkbox" },
];
const VEHICLE_COLS: Col[] = [
  { key: "vehicle_type", label: "ประเภทรถ", type: "select", options: ["รถตู้", "รถกระบะ", "รถเก๋ง", "รถมินิบัส", "รถบัส", "รถอื่นๆ"], w: "w-32" },
  { key: "plate", label: "เลขทะเบียน", type: "text", w: "w-32" },
  { key: "seats", label: "ที่นั่ง (รวมคนขับ)", type: "number", w: "w-24" },
  { key: "is_hired", label: "รถจ้างชั่วคราว", type: "checkbox" },
  { key: "hire_note", label: "รายละเอียดการจ้าง", type: "text", w: "min-w-[160px]", showIf: (r) => !!r.is_hired },
  { key: "available_from", label: "ใช้ได้ตั้งแต่", type: "date", showIf: (r) => !!r.is_hired },
  { key: "available_to", label: "ถึงวันที่", type: "date", showIf: (r) => !!r.is_hired },
  { key: "sort_order", label: "ลำดับ", type: "number", w: "w-20" },
  { key: "is_active", label: "เปิดใช้", type: "checkbox" },
];
const DRIVER_COLS: Col[] = [
  { key: "name", label: "ชื่อคนขับ", type: "text", w: "min-w-[180px]" },
  { key: "phone", label: "โทรศัพท์", type: "text", w: "w-36" },
  { key: "sort_order", label: "ลำดับ", type: "number", w: "w-20" },
  { key: "is_active", label: "เปิดใช้", type: "checkbox" },
];

const clean = (row: any, cols: Col[]) => {
  const out: any = {};
  for (const c of cols) {
    const v = row[c.key];
    if (c.type === "number") out[c.key] = v === "" || v == null ? null : Number(v);
    else if (c.type === "date") out[c.key] = v || null;
    else if (c.type === "checkbox") out[c.key] = !!v;
    else out[c.key] = typeof v === "string" ? v.trim() : v;
  }
  if (!("is_hired" in out && out.is_hired)) { if ("hire_note" in out) { out.hire_note = null; out.available_from = null; out.available_to = null; } }
  return out;
};

function Cell({ c, value, onChange }: { c: Col; value: any; onChange: (v: any) => void }) {
  const base = `rounded-lg border-2 border-slate-200 px-2 py-1.5 text-sm ${c.w ?? ""}`;
  if (c.type === "checkbox") return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-indigo-600" />;
  if (c.type === "select") return <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={base}>{c.options!.map((o) => <option key={o}>{o}</option>)}</select>;
  return <input type={c.type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={base} />;
}

function CrudTable({ table, cols, rows, blank, reload, requiredKeys }: { table: string; cols: Col[]; rows: any[]; blank: any; reload: () => void; requiredKeys: string[] }) {
  const [draft, setDraft] = useState<any>(blank);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");
  const val = (r: any, k: string) => (edits[r.id] && k in edits[r.id] ? edits[r.id][k] : r[k]);
  const rowOf = (r: any) => ({ ...r, ...(edits[r.id] ?? {}) });

  async function add() {
    if (requiredKeys.some((k) => !String(draft[k] ?? "").trim())) { setMsg("กรุณากรอกข้อมูลที่จำเป็นให้ครบ"); return; }
    const { error } = await supabase.from(table).insert(clean(draft, cols));
    if (error) { setMsg("เพิ่มไม่สำเร็จ: " + error.message); return; }
    setDraft(blank); setMsg("✅ เพิ่มแล้ว (ใช้งานได้ทันที)"); reload();
  }
  async function save(r: any) {
    const { error } = await supabase.from(table).update(clean(rowOf(r), cols)).eq("id", r.id);
    if (error) { setMsg("บันทึกไม่สำเร็จ: " + error.message); return; }
    setEdits((p) => { const n = { ...p }; delete n[r.id]; return n; }); setMsg("✅ บันทึกแล้ว"); reload();
  }
  async function del(r: any) {
    if (!confirm("ลบรายการนี้?")) return;
    const { error } = await supabase.from(table).delete().eq("id", r.id);
    if (error) { setMsg("ลบไม่ได้ (มีการจองอ้างอิงอยู่) — ให้ปิด “เปิดใช้” แทน"); return; }
    reload();
  }

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{msg}</p>}
      <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-3">
        <p className="mb-2 text-xs font-bold text-indigo-600">เพิ่มรายการใหม่</p>
        <div className="flex flex-wrap items-end gap-3">
          {cols.filter((c) => !c.showIf || c.showIf(draft)).map((c) => (
            <label key={c.key} className="text-[11px] font-bold text-slate-500">{c.label}<div className="mt-0.5"><Cell c={c} value={draft[c.key]} onChange={(v) => setDraft({ ...draft, [c.key]: v })} /></div></label>
          ))}
          <button onClick={add} className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> เพิ่ม</button>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`flex flex-wrap items-end gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ${r.is_active === false ? "opacity-60 ring-slate-200" : "ring-slate-100"}`}>
          {cols.filter((c) => !c.showIf || c.showIf(rowOf(r))).map((c) => (
            <label key={c.key} className="text-[11px] font-bold text-slate-500">{c.label}<div className="mt-0.5"><Cell c={c} value={val(r, c.key)} onChange={(v) => setEdits((p) => ({ ...p, [r.id]: { ...p[r.id], [c.key]: v } }))} /></div></label>
          ))}
          <div className="ml-auto flex gap-2">
            {edits[r.id] && <button onClick={() => save(r)} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><Save className="h-3.5 w-3.5" /> บันทึก</button>}
            <button onClick={() => del(r)} className="rounded-xl border-2 border-rose-200 p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีรายการ</p>}
    </div>
  );
}

export default function BookingSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"rooms" | "vehicles" | "drivers">("vehicles");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }: any) => {
      if (!data.user) { window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
      const { data: p } = await supabase.from("users").select("role,email").eq("auth_id", data.user.id).maybeSingle();
      setAllowed(isAdminRole(p?.role, p?.email));
    });
  }, []);
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("meeting_rooms").select("*").order("sort_order"),
      supabase.from("vehicles").select("*").order("sort_order"),
      supabase.from("drivers").select("*").order("sort_order"),
    ]);
    setRooms(a.data ?? []); setVehicles(b.data ?? []); setDrivers(c.data ?? []);
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (allowed === null) return <p className="p-10 text-center text-sm text-slate-400">กำลังตรวจสอบสิทธิ์...</p>;
  if (!allowed) return <p className="p-10 text-center text-sm font-semibold text-rose-500">หน้านี้สำหรับผู้ดูแลระบบ (admin) เท่านั้น</p>;

  const TABS = [["vehicles", "🚐 รถ"], ["drivers", "👤 คนขับ"], ["rooms", "🏢 ห้องประชุม"]] as const;
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/duty-report")} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"><Home className="h-4 w-4" /></button>
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4" /></button>
        </div>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">ตั้งค่าห้องประชุม / รถราชการ</h1>
        <p className="mt-1 text-xs text-slate-400">แอดมินเพิ่ม/แก้ไข/ปิดใช้ได้ทันที ไม่ต้องรออนุมัติ — รถจ้างชั่วคราวระบุช่วงวันที่ใช้ได้</p>
        <div className="mt-4 flex gap-2">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-2xl px-4 py-2 text-sm font-bold ${tab === k ? "bg-indigo-600 text-white shadow-md" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{l}</button>)}
        </div>
        <div className="mt-4">
          {tab === "vehicles" && <CrudTable table="vehicles" cols={VEHICLE_COLS} rows={vehicles} reload={load} requiredKeys={["vehicle_type", "plate", "seats"]} blank={{ vehicle_type: "รถตู้", plate: "", seats: 12, is_hired: false, hire_note: "", available_from: "", available_to: "", sort_order: vehicles.length + 1, is_active: true }} />}
          {tab === "drivers" && <CrudTable table="drivers" cols={DRIVER_COLS} rows={drivers} reload={load} requiredKeys={["name"]} blank={{ name: "", phone: "", sort_order: drivers.length + 1, is_active: true }} />}
          {tab === "rooms" && <CrudTable table="meeting_rooms" cols={ROOM_COLS} rows={rooms} reload={load} requiredKeys={["name"]} blank={{ name: "", capacity: "", sort_order: rooms.length + 1, is_active: true }} />}
        </div>
      </div>
    </div>
  );
}
