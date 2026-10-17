"use client";

import { useMemo, useState } from "react";
import type { LocKind, MapLocation, MapRoom, CorridorSide, StairsMode, ToiletMode, StageMode } from "./schoolData";
import { TOILET_OPTIONS, hasInterior, hasSpecialLayout } from "./schoolData";
import { TYPE_LABEL, AC_LABEL } from "./BuildingModel";
import type { MapApi, SaveResult } from "./useSchoolMapData";
import { DECOR_LABEL } from "./DecorData";
import type { DecorConfig, DecorItem, DecorType, GateItem } from "./DecorData";

export interface MapSettings {
  robotSpeed: number;
  shadows: boolean;
  hiQuality: boolean;
  autoFollow: boolean;
}
export const DEFAULT_SETTINGS: MapSettings = { robotSpeed: 3.2, shadows: true, hiQuality: true, autoFollow: true };

const KIND_LABEL: Record<LocKind, string> = {
  building: "อาคารเรียน", facility: "อาคารทั่วไป", dome: "โดมกีฬา", field: "สนาม", parking: "ลานจอดรถ", gate: "ป้อมยาม",
};
const inp = "w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-blue-400";
const btn = "text-xs font-extrabold rounded-xl px-3 py-2";
const lbl = "block text-[10px] font-bold text-slate-400 mb-0.5";

type Run = (p: Promise<SaveResult>) => Promise<SaveResult>;

function Num({ label, value, onChange, step = 0.1, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="block">
      <span className={lbl}>{label}</span>
      <input type="number" className={inp} value={Number.isFinite(value) ? value : 0} step={step} min={min}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </label>
  );
}

function LocForm({ loc, api, run }: { loc: MapLocation; api: MapApi; run: Run }) {
  const [name, setName] = useState(loc.name);
  const [kind, setKind] = useState<LocKind>(loc.kind);
  const [color, setColor] = useState(loc.color);
  const [floors, setFloors] = useState(loc.floors);
  const [rot, setRot] = useState(loc.rot ?? 0);
  const [x, setX] = useState(+loc.pos[0].toFixed(2));
  const [z, setZ] = useState(+loc.pos[1].toFixed(2));
  const [w, setW] = useState(+loc.size[0].toFixed(2));
  const [d, setD] = useState(+loc.size[1].toFixed(2));
  const [corridor, setCorridor] = useState<CorridorSide>(loc.corridor === "b" ? "b" : "a");
  const [toilet, setToilet] = useState<ToiletMode>(loc.toilet ?? "none");
  const [stairs, setStairs] = useState<StairsMode>(loc.stairs ?? "start");
  const [perFloor, setPerFloor] = useState(loc.perFloor ?? 0);
  const [stage, setStage] = useState<StageMode>(loc.stage ?? "none");
  const [autoRegen, setAutoRegen] = useState(true);
  const longX = w >= d;
  const interior = kind === "building" || kind === "facility";
  const special = hasSpecialLayout({ ...loc, kind });

  const save = async () => {
    const layoutChanged = interior && (
      corridor !== (loc.corridor === "b" ? "b" : "a") || stairs !== (loc.stairs ?? "start") ||
      toilet !== (loc.toilet ?? "none") || (perFloor > 0 ? perFloor : 0) !== (loc.perFloor ?? 0) ||
      floors !== loc.floors || Math.abs(w - loc.size[0]) > 0.005 || Math.abs(d - loc.size[1]) > 0.005
    );
    const r = await run(api.updateLocation(loc.id, {
      name, kind, color, rot, pos: [x, z], size: [w, d],
      corridor, stairs, toilet, perFloor: perFloor > 0 ? perFloor : undefined,
      stage: kind === "dome" ? stage : undefined,
    }));
    if (r.ok && interior && floors !== loc.floors) await run(api.setFloors(loc.id, floors));
    if (r.ok && autoRegen && layoutChanged) await run(api.regenerateRooms(loc.id));
  };
  return (
    <div className="space-y-2">
      <label className="block"><span className={lbl}>ชื่อ</span>
        <input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={lbl}>ประเภท</span>
          <select className={inp} value={kind} onChange={(e) => setKind(e.target.value as LocKind)}>
            {(Object.keys(KIND_LABEL) as LocKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select></label>
        <label className="block"><span className={lbl}>สี</span>
          <input type="color" className="w-full h-[30px] rounded-lg border border-slate-200" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>

      {kind === "dome" && (
        <label className="block"><span className={lbl}>เวทีในโดม</span>
          <select className={inp} value={stage} onChange={(e) => setStage(e.target.value as StageMode)}>
            <option value="none">ไม่มีเวที</option>
            <option value="start">เวทีอยู่ปลาย{longX ? "ซ้าย" : "บน"}</option>
            <option value="end">เวทีอยู่ปลาย{longX ? "ขวา" : "ล่าง"}</option>
          </select></label>
      )}

      {interior && <Num label="จำนวนชั้น (1–8)" value={floors} step={1} min={1} onChange={(v) => setFloors(Math.max(1, Math.min(8, Math.round(v))))} />}
      {interior && (
        <>
          {special && (
            <p className="rounded-lg bg-sky-50 border border-sky-200 p-2 text-[11px] text-sky-800">
              อาคารนี้ใช้ผังชั้นล่างพิเศษ (บันไดหลายจุด/ห้องเฉพาะ) — ตั้งค่าบันได ห้องน้ำ ห้องต่อแถว ไม่มีผล (แก้ผังได้ที่ SPECIAL_LAYOUTS ใน schoolData.ts)
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={lbl}>ทางเดิน</span>
              <select className={inp} value={corridor} onChange={(e) => setCorridor(e.target.value as CorridorSide)}>
                <option value="a">ซ้าย{longX ? " (ด้านเหนือ)" : ""}</option>
                <option value="b">ขวา{longX ? " (ด้านใต้)" : ""}</option>
              </select></label>
            <label className="block"><span className={lbl}>บันได</span>
              <select className={inp} value={stairs} onChange={(e) => setStairs(e.target.value as StairsMode)}>
                <option value="start">1 อัน ปลาย{longX ? "ซ้าย" : "บน"}</option>
                <option value="end">1 อัน ปลาย{longX ? "ขวา" : "ล่าง"}</option>
                <option value="both">2 อัน ทั้งสองปลาย</option>
              </select></label>
          </div>
          <Num label={kind === "facility" ? "ห้องต่อแถว (0 = ไม่มีห้องภายใน)" : "ห้องต่อแถว (0 = อัตโนมัติ — ถ้าตั้งเลข จะได้เท่านั้นเสมอ)"}
            value={perFloor} step={1} min={0}
            onChange={(v) => setPerFloor(Math.max(0, Math.min(20, Math.round(v))))} />
          <label className="block"><span className={lbl}>ห้องน้ำ (พื้นที่คงที่ติดบันได แบ่งตามจำนวนห้อง)</span>
            <select className={inp} value={toilet} onChange={(e) => setToilet(e.target.value as ToiletMode)}>
              {(Object.keys(TOILET_OPTIONS) as ToiletMode[]).map((k) => <option key={k} value={k}>{TOILET_OPTIONS[k].label}</option>)}
            </select></label>
          <label className="flex items-center justify-between text-[11px] font-bold text-slate-600">
            สร้างห้องใหม่อัตโนมัติเมื่อเปลี่ยนผัง
            <input type="checkbox" checked={autoRegen} onChange={(e) => setAutoRegen(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          </label>
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

function RoomRow({ room, api, run }: { room: MapRoom; api: MapApi; run: Run }) {
  const [name, setName] = useState(room.name);
  const [code, setCode] = useState(room.code);
  const [type, setType] = useState(room.type ?? "classroom");
  const [desks, setDesks] = useState(room.desks ?? 30);
  const [ac, setAc] = useState(room.ac ?? "none");
  const dirty = name !== room.name || code !== room.code || type !== (room.type ?? "classroom")
    || desks !== (room.desks ?? 30) || ac !== (room.ac ?? "none");
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
      <select className={inp} value={ac} onChange={(e) => setAc(e.target.value)}>
        {Object.entries(AC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="flex gap-1.5">
        <button disabled={!dirty} onClick={() => run(api.updateRoom(room.id, { name, code, type, desks: type === "classroom" ? desks : 0, ac }))}
          className={`${btn} flex-1 py-1.5 bg-blue-600 text-white disabled:opacity-30`}>บันทึกห้อง</button>
        <button onClick={() => { if (confirm(`ลบ ${room.name}?`)) run(api.deleteRoom(room.id)); }}
          className={`${btn} py-1.5 bg-rose-50 text-rose-600 border border-rose-200`}>ลบ</button>
      </div>
    </div>
  );
}

/* ───────────── แท็บ "ฉาก/ประตู" ───────────── */

type Field = "rot" | "s" | "h" | "w" | "d" | "color" | "name" | "levels";
const FIELDS: Record<DecorType, Field[]> = {
  tree: ["s", "h"], pavilion: ["color", "rot"], shrine: ["name", "rot"],
  toilet: ["name", "w", "d", "rot", "color"], shed: ["name", "w", "d", "rot", "color"],
  barrier: ["name", "w", "rot"], flag: [], bridge: ["name", "w", "d", "rot", "levels"], sign: ["name", "w"],
};
const NEW_DEFAULTS: Record<DecorType, Partial<DecorItem>> = {
  tree: { s: 1, h: 1 }, pavilion: { color: "#e5484d" }, shrine: { name: "ซุ้มพระ" },
  toilet: { name: "ห้องน้ำ", w: 36, d: 24 }, shed: { name: "ที่จอดมอเตอร์ไซค์", w: 60, d: 28, color: "#f59f00" },
  barrier: { name: "ประตูกั้น", w: 26, rot: 90 }, flag: {}, bridge: { name: "ทางเชื่อม", w: 30, d: 24, levels: "2,3" },
  sign: { name: "โรงเรียนวัดเขียนเขต", w: 66 },
};

function PlaceBtn({ id, placingId, onPlace }: { id: string; placingId: string | null; onPlace: (id: string | null) => void }) {
  const on = placingId === id;
  return (
    <button onClick={() => onPlace(on ? null : id)}
      className={`${btn} py-1 ${on ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
      title="คลิกบนพื้นแผนที่เพื่อวางตำแหน่ง">{on ? "📍 คลิกพื้นแผนที่…" : "📍 วาง"}</button>
  );
}

function ItemRow({ it, patch, del, placingId, onPlace }: {
  it: DecorItem; patch: (p: Partial<DecorItem>) => void; del: () => void; placingId: string | null; onPlace: (id: string | null) => void;
}) {
  const f = FIELDS[it.type];
  const n = (k: "rot" | "s" | "h" | "w" | "d", label: string, step = 1) =>
    f.includes(k) && <Num key={k} label={label} value={it[k] ?? (k === "s" || k === "h" ? 1 : 0)} step={step} onChange={(v) => patch({ [k]: v })} />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-black text-slate-600 truncate">{it.name || DECOR_LABEL[it.type]}</span>
        <div className="flex gap-1 shrink-0">
          <PlaceBtn id={it.id} placingId={placingId} onPlace={onPlace} />
          <button onClick={del} className={`${btn} py-1 bg-rose-50 text-rose-600 border border-rose-200`}>ลบ</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Num label="X (px)" value={it.x} onChange={(v) => patch({ x: v })} />
        <Num label="Y (px)" value={it.y} onChange={(v) => patch({ y: v })} />
        {n("s", "ขนาด", 0.05)}{n("h", "ความสูง (ตัวคูณ)", 0.1)}
        {n("w", "กว้าง (px)")}{n("d", "ลึก (px)")}{n("rot", "หมุน (องศา)", 0.5)}
      </div>
      {f.includes("name") && (
        <input className={inp} value={it.name ?? ""} onChange={(e) => patch({ name: e.target.value })} placeholder="ชื่อ" />
      )}
      {f.includes("levels") && (
        <input className={inp} value={it.levels ?? ""} onChange={(e) => patch({ levels: e.target.value })} placeholder="ชั้นที่มีทางเชื่อม เช่น 2,3" />
      )}
      {f.includes("color") && (
        <label className="flex items-center justify-between text-[10px] font-bold text-slate-400">สี
          <input type="color" className="w-16 h-6 rounded border border-slate-200" value={it.color ?? "#e5484d"} onChange={(e) => patch({ color: e.target.value })} />
        </label>
      )}
    </div>
  );
}

function GateRow({ g, patch, del, placingId, onPlace }: {
  g: GateItem; patch: (p: Partial<GateItem>) => void; del: () => void; placingId: string | null; onPlace: (id: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <input className={`${inp} font-bold`} value={g.name} onChange={(e) => patch({ name: e.target.value })} />
        <div className="flex gap-1 shrink-0">
          <PlaceBtn id={g.id} placingId={placingId} onPlace={onPlace} />
          <button onClick={del} className={`${btn} py-1 bg-rose-50 text-rose-600 border border-rose-200`}>ลบ</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Num label="X (px)" value={g.x} onChange={(v) => patch({ x: v })} />
        <Num label="Y (px)" value={g.y} onChange={(v) => patch({ y: v })} />
        <Num label="กว้าง" value={g.width} step={0.1} min={0.8} onChange={(v) => patch({ width: v })} />
      </div>
      <div className="grid grid-cols-[1fr_1fr_3rem] gap-1.5 items-end">
        <label className="block"><span className={lbl}>โหนดประตู</span>
          <input className={inp} value={g.node} onChange={(e) => patch({ node: e.target.value })} /></label>
        <label className="block"><span className={lbl}>ต่อถนนที่โหนด</span>
          <input className={inp} value={g.link ?? ""} onChange={(e) => patch({ link: e.target.value })} /></label>
        <input type="color" className="w-full h-[30px] rounded-lg border border-slate-200" value={g.color} onChange={(e) => patch({ color: e.target.value })} />
      </div>
    </div>
  );
}

function DecorEditor({ decor, api, run, placingId, onPlace }: {
  decor: DecorConfig; api: MapApi; run: Run; placingId: string | null; onPlace: (id: string | null) => void;
}) {
  const [cat, setCat] = useState<DecorType | "gate">("gate");
  const items = decor.items.filter((i) => i.type === cat);
  const patchItem = (id: string, p: Partial<DecorItem>) =>
    api.setDecor((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const patchGate = (id: string, p: Partial<GateItem>) =>
    api.setDecor((d) => ({ ...d, gates: d.gates.map((g) => (g.id === id ? { ...g, ...p } : g)) }));
  const add = () => {
    const id = `${cat}-${Date.now()}`;
    if (cat === "gate") {
      api.setDecor((d) => ({ ...d, gates: [...d.gates, { id, name: "ประตูใหม่", x: 480, y: 400, width: 1.8, color: "#be123c", node: `n-${id}` }] }));
    } else {
      api.setDecor((d) => ({ ...d, items: [...d.items, { id, type: cat, x: 480, y: 400, ...NEW_DEFAULTS[cat] }] }));
    }
    onPlace(id);
  };
  return (
    <>
      <p className="text-[11px] text-slate-500">แก้ค่าแล้วเห็นผลทันที กด “📍 วาง” แล้วคลิกบนพื้นแผนที่เพื่อย้าย จากนั้นกด “บันทึกฉาก”</p>
      <select className={inp} value={cat} onChange={(e) => { setCat(e.target.value as any); onPlace(null); }}>
        <option value="gate">ประตูรั้ว ({decor.gates.length})</option>
        {(Object.keys(DECOR_LABEL) as DecorType[]).map((k) => (
          <option key={k} value={k}>{DECOR_LABEL[k]} ({decor.items.filter((i) => i.type === k).length})</option>
        ))}
      </select>
      {cat === "gate"
        ? decor.gates.map((g) => (
          <GateRow key={g.id} g={g} patch={(p) => patchGate(g.id, p)} placingId={placingId} onPlace={onPlace}
            del={() => { if (confirm(`ลบ ${g.name}?`)) api.setDecor((d) => ({ ...d, gates: d.gates.filter((x) => x.id !== g.id) })); }} />
        ))
        : items.map((it) => (
          <ItemRow key={it.id} it={it} patch={(p) => patchItem(it.id, p)} placingId={placingId} onPlace={onPlace}
            del={() => api.setDecor((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))} />
        ))}
      {cat !== "gate" && items.length === 0 && <p className="text-xs text-slate-400">ยังไม่มีรายการ</p>}
      <button onClick={add} className={`${btn} w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>
        + เพิ่ม{cat === "gate" ? "ประตูรั้ว" : DECOR_LABEL[cat]}
      </button>
      <div className="flex gap-1.5">
        <button onClick={() => run(api.saveDecor())} className={`${btn} flex-1 bg-blue-600 text-white`}>💾 บันทึกฉาก</button>
        <button onClick={() => { if (confirm("คืนค่าฉากทั้งหมดเป็นค่าตั้งต้น? (ต้องกดบันทึกอีกครั้งจึงจะลงฐานข้อมูล)")) api.resetDecor(); }}
          className={`${btn} bg-slate-100 text-slate-600`}>↺ ค่าตั้งต้น</button>
      </div>
    </>
  );
}

/* ───────────── แผงหลัก ───────────── */

export default function AdminPanel({
  locs, rooms, source, warnings, settings, onSettings, api, onClose, decor, placingId, onPlace,
}: {
  locs: MapLocation[]; rooms: MapRoom[]; source: "fallback" | "supabase"; warnings: string[];
  settings: MapSettings; onSettings: (s: MapSettings) => void; api: MapApi; onClose: () => void;
  decor: DecorConfig; placingId: string | null; onPlace: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<"loc" | "room" | "dec" | "set">("loc");
  const [toast, setToast] = useState<SaveResult | null>(null);
  const run: Run = async (p) => {
    const r = await p; setToast(r); setTimeout(() => setToast(null), 4500); return r;
  };

  const [locId, setLocId] = useState(locs[0]?.id ?? "");
  const loc = locs.find((l) => l.id === locId) ?? locs[0];

  const buildings = useMemo(() => locs.filter(hasInterior), [locs]);
  const [bId, setBId] = useState(buildings[0]?.id ?? "");
  const b = buildings.find((l) => l.id === bId) ?? buildings[0];
  const [level, setLevel] = useState(1);
  const lv = b ? Math.min(level, Math.max(b.floors, 1)) : 1;
  const bRooms = b ? rooms.filter((r) => r.location_id === b.id) : [];
  const list = bRooms.filter((r) => r.level === lv);
  const virtual = bRooms.some((r) => r.placeholder);

  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)}
      className={`flex-1 text-[11px] font-extrabold rounded-lg py-1.5 ${tab === k ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>{label}</button>
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
        {tabBtn("loc", "อาคาร/ชั้น")}{tabBtn("room", "ห้อง/โต๊ะ")}{tabBtn("dec", "ฉาก/ประตู")}{tabBtn("set", "ทั่วไป")}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "loc" && loc && (
          <>
            <select className={inp} value={loc.id} onChange={(e) => setLocId(e.target.value)}>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.code}. {l.name}</option>)}
            </select>
            <LocForm key={`${loc.id}|${loc.pos}|${loc.size}|${loc.rot}|${loc.floors}|${loc.kind}|${loc.corridor}|${loc.stairs}|${loc.perFloor}|${loc.toilet}|${loc.stage}`} loc={loc} api={api} run={run} />
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
            {list.map((r) => <RoomRow key={`${r.id}|${r.name}|${r.code}|${r.type}|${r.desks}|${r.ac}`} room={r} api={api} run={run} />)}
            <button onClick={() => run(api.addRoom(b.id, lv))} className={`${btn} w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มห้องในชั้น {lv}</button>
          </>
        ) : <p className="text-xs text-slate-400">ไม่มีอาคารเรียน</p>)}

        {tab === "dec" && <DecorEditor decor={decor} api={api} run={run} placingId={placingId} onPlace={onPlace} />}

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
            <button
              onClick={() => { if (confirm("ลบห้องของทุกอาคารแล้วสร้างใหม่ตามผังปัจจุบัน? (ชื่อ/ชนิดห้องที่แก้ไว้จะหาย)")) run(api.regenerateAll()); }}
              className={`${btn} w-full bg-amber-50 text-amber-700 border border-amber-200`}>สร้างห้องทุกอาคารใหม่ตามผัง</button>
            <button onClick={() => run(api.reload().then(() => ok2("โหลดข้อมูลใหม่แล้ว")))} className={`${btn} w-full bg-slate-100 text-slate-600`}>โหลดข้อมูลใหม่</button>
          </>
        )}
      </div>

      {placingId && (
        <div className="mx-4 mb-2 rounded-xl px-3 py-2 text-[11px] font-bold bg-emerald-50 text-emerald-700">
          📍 คลิกบนพื้นแผนที่ (ไม่ใช่บนอาคาร) เพื่อวางตำแหน่ง
        </div>
      )}
      {toast && (
        <div className={`mx-4 mb-3 rounded-xl px-3 py-2 text-[11px] font-bold ${toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{toast.message}</div>
      )}
    </div>
  );
}
const ok2 = (message: string): SaveResult => ({ ok: true, message });