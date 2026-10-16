"use client";

import { useMemo, useState } from "react";
import type { LocKind, MapLocation, MapRoom, CorridorSide, StairsMode } from "./schoolData";
import type { MapApi, SaveResult } from "./useSchoolMapData";
import { TYPE_LABEL } from "./BuildingModel";

export interface MapSettings {
  robotSpeed: number;   // ความเร็วหุ่นยนต์
  shadows: boolean;     // เงา
  hiQuality: boolean;   // ความคมชัดสูง (dpr 2)
  autoFollow: boolean;  // กล้องตามหุ่นยนต์ตอนนำทาง
}
export const DEFAULT_SETTINGS: MapSettings = { robotSpeed: 3.2, shadows: true, hiQuality: true, autoFollow: true };

const KIND_LABEL: Record<LocKind, string> = {
  building: "อาคารเรียน", facility: "อาคารทั่วไป", dome: "โดมกีฬา", field: "สนาม", parking: "ลานจอดรถ", gate: "ป้อมยาม",
};
const inp = "w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-blue-400";
const btn = "text-xs font-extrabold rounded-xl px-3 py-2";

function Num({ label, value, onChange, step = 0.1, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-slate-400 mb-0.5">{label}</span>
      <input type="number" className={inp} value={Number.isFinite(value) ? value : 0} step={step} min={min}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </label>
  );
}

function LocForm({ loc, api, run }: { loc: MapLocation; api: MapApi; run: (p: Promise<SaveResult>) => Promise<SaveResult> }) {
  const [name, setName] = useState(loc.name);
  const [kind, setKind] = useState<LocKind>(loc.kind);
  const [color, setColor] = useState(loc.color);
  const [floors, setFloors] = useState(loc.floors);
  const [rot, setRot] = useState(loc.rot ?? 0);
  const [x, setX] = useState(+loc.pos[0].toFixed(2));
  const [z, setZ] = useState(+loc.pos[1].toFixed(2));
  const [w, setW] = useState(+loc.size[0].toFixed(2));
  const [d, setD] = useState(+loc.size[1].toFixed(2));
  const [corridor, setCorridor] = useState<CorridorSide>(loc.corridor ?? "center");
  const [stairs, setStairs] = useState<StairsMode>(loc.stairs ?? "start");
  const [perFloor, setPerFloor] = useState(loc.perFloor ?? 0);
  const longX = w >= d;
  const save = async () => {
        const r = await run(api.updateLocation(loc.id, {
      name, kind, color, rot, pos: [x, z], size: [w, d],
      corridor, stairs, perFloor: perFloor > 0 ? perFloor : undefined,
    }));
    if (r.ok && kind === "building" && floors !== loc.floors) await run(api.setFloors(loc.id, floors));
  };
  return (
    <div className="space-y-2">
      <label className="block"><span className="block text-[10px] font-bold text-slate-400 mb-0.5">ชื่อ</span>
        <input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="block text-[10px] font-bold text-slate-400 mb-0.5">ประเภท</span>
          <select className={inp} value={kind} onChange={(e) => setKind(e.target.value as LocKind)}>
            {(Object.keys(KIND_LABEL) as LocKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select></label>
        <label className="block"><span className="block text-[10px] font-bold text-slate-400 mb-0.5">สี</span>
          <input type="color" className="w-full h-[30px] rounded-lg border border-slate-200" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      {kind === "building" && <Num label="จำนวนชั้น (1–8)" value={floors} step={1} min={1} onChange={(v) => setFloors(Math.max(1, Math.min(8, Math.round(v))))} />}
              {kind === "building" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="block text-[10px] font-bold text-slate-400 mb-0.5">ทางเดิน</span>
              <select className={inp} value={corridor} onChange={(e) => setCorridor(e.target.value as CorridorSide)}>
                <option value="center">กลางอาคาร (2 แถว)</option>
                <option value="a">{longX ? "ริมด้านเหนือ" : "ริมด้านซ้าย"} (แถวเดียว)</option>
                <option value="b">{longX ? "ริมด้านใต้" : "ริมด้านขวา"} (แถวเดียว)</option>
              </select></label>
            <label className="block"><span className="block text-[10px] font-bold text-slate-400 mb-0.5">บันได</span>
              <select className={inp} value={stairs} onChange={(e) => setStairs(e.target.value as StairsMode)}>
                <option value="start">1 อัน ปลาย{longX ? "ซ้าย" : "บน"}</option>
                <option value="end">1 อัน ปลาย{longX ? "ขวา" : "ล่าง"}</option>
                <option value="both">2 อัน ทั้งสองปลาย</option>
              </select></label>
          </div>
          <Num label="ห้องต่อแถว (0 = อัตโนมัติ)" value={perFloor} step={1} min={0}
            onChange={(v) => setPerFloor(Math.max(0, Math.min(20, Math.round(v))))} />
          <button
            onClick={() => { if (confirm("ลบห้องทุกชั้นของอาคารนี้แล้วสร้างใหม่ตามผัง? (ชื่อ/ชนิดห้องที่แก้ไว้จะหาย)")) run(api.regenerateRooms(loc.id)); }}
            className={`${btn} w-full bg-amber-50 text-amber-700 border border-amber-200`}>สร้างห้องใหม่ตามผังนี้</button>
        </>
      )}
      <Num label="หมุนอาคาร (องศา — ค่าลบ = ยกด้านขวาขึ้น)" value={rot} step={0.5} onChange={setRot} />
      <div className="grid grid-cols-2 gap-2">
        <Num label="ตำแหน่ง X" value={x} onChange={setX} />
        <Num label="ตำแหน่ง Z" value={z} onChange={setZ} />
        <Num label="กว้าง" value={w} min={0.2} onChange={setW} />
        <Num label="ลึก" value={d} min={0.2} onChange={setD} />
      </div>
      <button onClick={save} className={`${btn} w-full bg-blue-600 text-white`}>บันทึกอาคาร</button>
    </div>
  );
}

function RoomRow({ room, api, run }: { room: MapRoom; api: MapApi; run: (p: Promise<SaveResult>) => Promise<SaveResult> }) {
  const [name, setName] = useState(room.name);
  const [code, setCode] = useState(room.code);
  const [type, setType] = useState(room.type ?? "classroom");
  const [desks, setDesks] = useState(room.desks ?? 30);
  const dirty = name !== room.name || code !== room.code || type !== (room.type ?? "classroom") || desks !== (room.desks ?? 30);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5">
      <div className="grid grid-cols-[1fr_5rem] gap-1.5">
        <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อห้อง" />
        <input className={inp} value={code} onChange={(e) => setCode(e.target.value)} placeholder="รหัส" />
      </div>
      <div className="grid grid-cols-[1fr_5rem] gap-1.5">
        <select className={inp} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" min={0} max={60} className={inp} value={desks} disabled={type !== "classroom"}
          onChange={(e) => setDesks(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} title="จำนวนโต๊ะ" />
      </div>
      <div className="flex gap-1.5">
        <button disabled={!dirty} onClick={() => run(api.updateRoom(room.id, { name, code, type, desks: type === "classroom" ? desks : 0 }))}
          className={`${btn} flex-1 py-1.5 bg-blue-600 text-white disabled:opacity-30`}>บันทึกห้อง</button>
        <button onClick={() => { if (confirm(`ลบ ${room.name}?`)) run(api.deleteRoom(room.id)); }}
          className={`${btn} py-1.5 bg-rose-50 text-rose-600 border border-rose-200`}>ลบ</button>
      </div>
    </div>
  );
}

export default function AdminPanel({
  locs, rooms, source, warnings, settings, onSettings, api, onClose,
}: {
  locs: MapLocation[]; rooms: MapRoom[]; source: "fallback" | "supabase"; warnings: string[];
  settings: MapSettings; onSettings: (s: MapSettings) => void; api: MapApi; onClose: () => void;
}) {
  const [tab, setTab] = useState<"loc" | "room" | "set">("loc");
  const [toast, setToast] = useState<SaveResult | null>(null);
  const run = async (p: Promise<SaveResult>) => {
    const r = await p; setToast(r); setTimeout(() => setToast(null), 4500); return r;
  };

  const [locId, setLocId] = useState(locs[0]?.id ?? "");
  const loc = locs.find((l) => l.id === locId) ?? locs[0];

  const buildings = useMemo(() => locs.filter((l) => l.kind === "building"), [locs]);
  const [bId, setBId] = useState(buildings[0]?.id ?? "");
  const b = buildings.find((l) => l.id === bId) ?? buildings[0];
  const [level, setLevel] = useState(1);
  const lv = b ? Math.min(level, Math.max(b.floors, 1)) : 1;
  const bRooms = b ? rooms.filter((r) => r.location_id === b.id) : [];
  const list = bRooms.filter((r) => r.level === lv);
  const virtual = bRooms.some((r) => r.placeholder);

  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)}
      className={`flex-1 text-xs font-extrabold rounded-lg py-1.5 ${tab === k ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>{label}</button>
  );

  return (
    <div className="absolute top-16 right-3 bottom-24 w-[21rem] max-w-[calc(100%-1.5rem)] z-20 flex flex-col rounded-3xl bg-white/90 backdrop-blur-xl border border-white/70 shadow-[0_8px_30px_rgba(15,23,42,0.18)] overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <p className="text-sm font-black text-slate-800">ตั้งค่าแผนที่ (แอดมิน)</p>
          <p className="text-[10px] font-bold text-slate-400">{source === "supabase" ? "บันทึกลง Supabase" : "โหมดข้อมูลตั้งต้น — บันทึกไม่ถาวร"}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-sm font-black" aria-label="ปิด">✕</button>
      </div>
      <div className="flex gap-1 mx-4 mt-3 p-1 rounded-xl bg-slate-100">
        {tabBtn("loc", "อาคาร/ชั้น")}{tabBtn("room", "ห้อง/โต๊ะ")}{tabBtn("set", "ทั่วไป")}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "loc" && loc && (
          <>
            <select className={inp} value={loc.id} onChange={(e) => setLocId(e.target.value)}>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.code}. {l.name}</option>)}
            </select>
            <LocForm key={`${loc.id}|${loc.pos}|${loc.size}|${loc.rot}|${loc.floors}|${loc.kind}|${loc.corridor}|${loc.stairs}|${loc.perFloor}`} loc={loc} api={api} run={run} />
          </>
        )}

        {tab === "room" && (b ? (
          <>
            <select className={inp} value={b.id} onChange={(e) => { setBId(e.target.value); setLevel(1); }}>
              {buildings.map((l) => <option key={l.id} value={l.id}>{l.code}. {l.name}</option>)}
            </select>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: Math.max(b.floors, 1) }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setLevel(n)}
                  className={`${btn} py-1.5 border ${lv === n ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"}`}>ชั้น {n}</button>
              ))}
            </div>
            {virtual && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 space-y-1.5">
                <p>ห้องชุดนี้เป็นห้องตัวอย่าง ยังไม่อยู่ในฐานข้อมูล</p>
                {source === "supabase" && (
                  <button onClick={() => run(api.saveGenerated(b.id))} className={`${btn} py-1.5 w-full bg-amber-500 text-white`}>บันทึกทั้งอาคารลงฐานข้อมูล</button>
                )}
              </div>
            )}
            {list.length === 0 && <p className="text-xs text-slate-400">ชั้นนี้ยังไม่มีห้อง</p>}
            {list.map((r) => <RoomRow key={`${r.id}|${r.name}|${r.code}|${r.type}|${r.desks}`} room={r} api={api} run={run} />)}
            <button onClick={() => run(api.addRoom(b.id, lv))} className={`${btn} w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มห้องในชั้น {lv}</button>
          </>
        ) : <p className="text-xs text-slate-400">ไม่มีอาคารเรียน</p>)}

        {tab === "set" && (
          <>
            <div className="space-y-2">
              <Num label="ความเร็วหุ่นยนต์" value={settings.robotSpeed} step={0.2} min={0.5} onChange={(v) => onSettings({ ...settings, robotSpeed: Math.max(0.5, Math.min(10, v)) })} />
              {([["shadows", "แสดงเงา"], ["hiQuality", "ภาพคมชัดสูง"], ["autoFollow", "กล้องตามหุ่นยนต์ตอนนำทาง"]] as const).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between text-xs font-bold text-slate-600">
                  {label}
                  <input type="checkbox" checked={settings[k]} onChange={(e) => onSettings({ ...settings, [k]: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                </label>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 p-2 space-y-1.5">
              <p className="text-xs font-black text-slate-700">ตรวจผังอาคาร</p>
              {warnings.length === 0
                ? <p className="text-[11px] font-bold text-emerald-600">✓ ไม่พบอาคารทับกันหรือเลยรั้ว</p>
                : warnings.map((w, i) => <p key={i} className="text-[11px] font-bold text-rose-600">⚠ {w}</p>)}
              <button onClick={() => { if (confirm("ปรับตำแหน่ง/การหมุน/ชนิดอาคารทุกหลังให้ตรงผังตั้งต้นใหม่?")) run(api.syncDefaultLayout()); }}
                className={`${btn} py-1.5 w-full bg-slate-800 text-white`}>ปรับผังตามค่าตั้งต้นใหม่</button>
            </div>
            <button onClick={() => run(api.reload().then(() => ok2("โหลดข้อมูลใหม่แล้ว")))} className={`${btn} w-full bg-slate-100 text-slate-600`}>โหลดข้อมูลใหม่</button>
          </>
        )}
      </div>

      {toast && (
        <div className={`mx-4 mb-3 rounded-xl px-3 py-2 text-[11px] font-bold ${toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{toast.message}</div>
      )}
    </div>
  );
}
const ok2 = (message: string): SaveResult => ({ ok: true, message });