"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LocKind, MapLocation, MapRoom, CorridorSide, StairsMode, ToiletMode, StageMode, DoorDef, StairDef, FurnItem } from "./schoolData";
import { TOILET_OPTIONS, CORRIDOR_W, hasInterior, hasSpecialLayout, stairSpans } from "./schoolData";
import { FURN, FURN_KINDS } from "./furniture";
import { TYPE_LABEL, AC_LABEL } from "./BuildingModel";
import type { MapApi, SaveResult } from "./useSchoolMapData";
import { DECOR_LABEL, ROAD_KIND_LABEL } from "./DecorData";
import type { DecorConfig, DecorItem, DecorType, GateItem, RoadItem, RoadKind } from "./DecorData";

export type AdminFocus = { kind: "item" | "gate" | "road" | "loc" | "room" | "gray"; id: string; n: number } | null;

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
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

type Run = (p: Promise<SaveResult>) => Promise<SaveResult>;
type Place = { placingId: string | null; onPlace: (id: string | null) => void };

function Num({ label, value, onChange, step = 0.1, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="block">
      <span className={lbl}>{label}</span>
      <input type="number" className={inp} value={Number.isFinite(value) ? value : 0} step={step} min={min}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </label>
  );
}

function PlaceBtn({ id, placingId, onPlace }: { id: string } & Place) {
  const on = placingId === id;
  return (
    <button onClick={() => onPlace(on ? null : id)}
      className={`${btn} py-1 ${on ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
      title="คลิกบนพื้นแผนที่เพื่อวางตำแหน่ง">{on ? "📍 คลิกพื้นแผนที่…" : "📍 วาง"}</button>
  );
}

/* ───────────── แท็บ อาคาร/ชั้น ───────────── */

function LocForm({ loc, api, run, placingId, onPlace }: { loc: MapLocation; api: MapApi; run: Run } & Place) {
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
  const [fr, setFr] = useState<Record<string, number>>({ ...(loc.floorRooms ?? {}) });
  const [sl, setSl] = useState<StairDef[] | null>(loc.stairList?.length ? loc.stairList.map((x) => ({ ...x })) : null);
  const [height, setHeight] = useState(loc.height ?? 1);
  const [autoRegen, setAutoRegen] = useState(true);
  const longX = w >= d;

  // ── ดูตัวอย่างทันที: แก้แล้วเห็นบนแผนที่เลย (ยังไม่บันทึกจนกว่าจะกด "บันทึกอาคาร") ──
  const orig = useRef(loc);
  const dirty = useRef(false);
  const first = useRef(true);
  useEffect(() => {   // sync เมื่อมีการย้ายจากภายนอก (📍 วาง)
    const o = orig.current;
    if (Math.abs(loc.pos[0] - x) > 0.004 && Math.abs(loc.pos[0] - o.pos[0]) > 0.004) { orig.current = { ...o, pos: [loc.pos[0], loc.pos[1]], entrance: loc.entrance }; setX(r2(loc.pos[0])); setZ(r2(loc.pos[1])); }
  }, [loc.pos[0], loc.pos[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const o = orig.current;
    dirty.current = name !== o.name || color !== o.color || rot !== (o.rot ?? 0) || Math.abs(x - o.pos[0]) > 0.004 || Math.abs(z - o.pos[1]) > 0.004
      || Math.abs(w - o.size[0]) > 0.004 || Math.abs(d - o.size[1]) > 0.004 || stage !== (o.stage ?? "none") || height !== (o.height ?? 1);
    api.previewLocation(loc.id, { name, color, rot, pos: [x, z], size: [w, d], stage: kind === "dome" ? stage : undefined, height });
  }, [name, color, rot, x, z, w, d, stage, height]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {   // ปิดฟอร์มโดยไม่บันทึก → คืนค่าเดิม
    if (!dirty.current) return;
    const o = orig.current;
    api.previewLocation(o.id, { name: o.name, color: o.color, rot: o.rot, pos: o.pos, size: o.size, stage: o.stage, height: o.height });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const interior = kind === "building" || kind === "facility";
  const special = hasSpecialLayout({ ...loc, kind });

  const cleanFr = () => {
    const o: Record<string, number> = {};
    for (let lv = 1; lv <= floors; lv++) if ((fr[lv] ?? 0) > 0) o[String(lv)] = Math.round(fr[lv]);
    return o;
  };

  const save = async () => {
    const o = orig.current;
    const newFr = cleanFr();
    const frChanged = JSON.stringify(newFr) !== JSON.stringify(loc.floorRooms ?? {});
    const posChanged = Math.abs(x - o.pos[0]) > 0.005 || Math.abs(z - o.pos[1]) > 0.005;
    const slChanged = JSON.stringify(sl ?? []) !== JSON.stringify(loc.stairList ?? []);
    const layoutChanged = interior && (
      corridor !== (loc.corridor === "b" ? "b" : "a") || stairs !== (loc.stairs ?? "start") ||
      toilet !== (loc.toilet ?? "none") || (perFloor > 0 ? perFloor : 0) !== (loc.perFloor ?? 0) ||
      floors !== loc.floors || Math.abs(w - o.size[0]) > 0.005 || Math.abs(d - o.size[1]) > 0.005 || frChanged || slChanged
    );
    const r = await run(api.updateLocation(loc.id, {
      name, kind, color, rot, pos: [x, z], size: [w, d],
      corridor, stairs, toilet, perFloor: perFloor > 0 ? perFloor : undefined,
      stage: kind === "dome" ? stage : undefined, height,
      floorRooms: interior && frChanged ? newFr : undefined,
      stairList: interior && slChanged ? (sl ?? []) : undefined,
      // ย้ายตำแหน่ง → ย้ายจุดทางเข้าตามไปด้วย
      entrance: posChanged ? [o.entrance[0] + (x - o.pos[0]), o.entrance[1] + (z - o.pos[1])] : undefined,
    }));
    if (r.ok) {
      orig.current = { ...o, name, kind, color, rot, pos: [x, z], size: [w, d], stage, height,
        entrance: posChanged ? [o.entrance[0] + (x - o.pos[0]), o.entrance[1] + (z - o.pos[1])] : o.entrance };
      dirty.current = false;
    }
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

      {(kind === "building" || kind === "facility" || kind === "dome" || kind === "gate") && (
        <Num label="ความสูง (ตัวคูณ — ตึก: ความสูงต่อชั้น, โดม: ความสูงหลังคา, 1 = ปกติ)" value={height} step={0.1} min={0.3}
          onChange={(v) => setHeight(clamp(v, 0.3, 4))} />
      )}
      {interior && <Num label="จำนวนชั้น (1–8)" value={floors} step={1} min={1} onChange={(v) => setFloors(Math.max(1, Math.min(8, Math.round(v))))} />}
      {interior && (
        <>
          {special && (
            <p className="rounded-lg bg-sky-50 border border-sky-200 p-2 text-[11px] text-sky-800">
              อาคารนี้มีผังพิเศษบางชั้น (บันไดหลายจุด/ห้องเฉพาะ) ชั้นที่ใช้ผังพิเศษจะไม่รับค่าบันได ห้องน้ำ และจำนวนห้องด้านล่าง
              แต่แก้ห้องรายห้องในแท็บ “ห้อง/โต๊ะ” ได้เสมอ (ผังพิเศษแก้ที่ SPECIAL ใน schoolData.ts)
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
          <Num label={kind === "facility" ? "ห้องต่อแถว ทุกชั้น (0 = ไม่มีห้องภายใน)" : "ห้องต่อแถว ทุกชั้น (0 = อัตโนมัติ)"}
            value={perFloor} step={1} min={0}
            onChange={(v) => setPerFloor(Math.max(0, Math.min(20, Math.round(v))))} />
          <div className="rounded-xl border border-slate-200 p-2 space-y-1.5">
            <p className="text-[11px] font-black text-slate-600">จำนวนห้องแยกรายชั้น (0 = ใช้ค่าด้านบน)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: Math.max(floors, 1) }, (_, i) => i + 1).map((lv) => (
                <Num key={lv} label={`ชั้น ${lv}`} value={fr[lv] ?? 0} step={1} min={0}
                  onChange={(v) => setFr((p) => ({ ...p, [lv]: clamp(Math.round(v), 0, 20) }))} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-2 space-y-1.5">
            <p className="text-[11px] font-black text-slate-600">บันได {sl ? "(กำหนดเอง)" : "(อัตโนมัติตามตัวเลือกด้านบน)"}</p>
            {!sl ? (
              <button onClick={() => {
                const Lg = Math.max(loc.size[0], loc.size[1]);
                setSl(stairSpans(loc).map((s) => ({ a: r2(s.c + Lg / 2 - s.len / 2), len: r2(s.len), w: 1, dir: s.dir, from: s.from ?? 1, to: s.to ?? Math.max(floors, 1) })));
              }} className={`${btn} py-1 w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>✎ กำหนดบันไดเอง (คัดลอกจากค่าปัจจุบัน)</button>
            ) : (
              <>
                {sl.map((st, i) => {
                  const up = (p: Partial<StairDef>) => setSl((l) => (l ?? []).map((x, k) => (k === i ? { ...x, ...p } : x)));
                  return (
                    <div key={i} className="rounded-lg bg-slate-50 p-1.5 space-y-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        <Num label="เริ่มที่ (ม.)" value={st.a} step={0.05} min={0} onChange={(v) => up({ a: Math.max(0, v) })} />
                        <Num label="ยาว (ม.)" value={st.len} step={0.05} min={0.1} onChange={(v) => up({ len: Math.max(0.1, v) })} />
                        <Num label="กว้าง (0–1)" value={st.w ?? 1} step={0.05} min={0.1} onChange={(v) => up({ w: clamp(v, 0.1, 1) })} />
                      </div>
                      <div className="grid grid-cols-[1fr_3.5rem_3.5rem] gap-1.5 items-end">
                        <label className="block"><span className={lbl}>ทิศที่ขั้นสูงขึ้น</span>
                          <select className={inp} value={st.dir} onChange={(e) => up({ dir: parseInt(e.target.value) as 1 | -1 })}>
                            <option value={-1}>ไปทาง{longX ? "ซ้าย" : "บน"}</option>
                            <option value={1}>ไปทาง{longX ? "ขวา" : "ล่าง"}</option>
                          </select></label>
                        <Num label="จากชั้น" value={st.from} step={1} min={1} onChange={(v) => up({ from: clamp(Math.round(v), 1, 8) })} />
                        <Num label="ถึงชั้น" value={st.to} step={1} min={1} onChange={(v) => up({ to: clamp(Math.round(v), 1, 8) })} />
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => up({ w: CORRIDOR_W })} className={`${btn} py-1 flex-1 bg-sky-50 text-sky-700 border border-sky-200`}>ขนาดเท่าทางเดิน</button>
                        <button onClick={() => up({ w: 1 })} className={`${btn} py-1 flex-1 bg-slate-100 text-slate-600`}>เต็มความลึก</button>
                        <button onClick={() => setSl((l) => (l ?? []).filter((_, k) => k !== i))} className={`${btn} py-1 bg-rose-50 text-rose-600`}>ลบ</button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-1.5">
                  <button onClick={() => setSl((l) => [...(l ?? []), { a: 0, len: 0.4, w: 1, dir: -1, from: 1, to: Math.max(floors, 1) }])}
                    className={`${btn} py-1 flex-1 bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มบันได</button>
                  <button onClick={() => setSl(null)} className={`${btn} py-1 bg-slate-100 text-slate-600`}>กลับเป็นอัตโนมัติ</button>
                </div>
                <p className="text-[10px] text-slate-400">ถ้าบันไดกว้างไม่เกินทางเดิน ห้องริมบันไดจะกินพื้นที่ต่อเนื่องผ่านบันไดไปเลย · เชื่อมชั้นตั้งแต่ “จากชั้น” ถึง “ถึงชั้น” (ตั้ง 1→1 = ทางขึ้นชั้น 1 เท่านั้น) ห้องเรียนจะแบ่งในช่องว่างระหว่างบันได</p>
              </>
            )}
          </div>
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
      <div className="flex gap-1.5">
        <PlaceBtn id={`loc:${loc.id}`} placingId={placingId} onPlace={onPlace} />
        <button onClick={() => { if (confirm(`ลบ ${loc.name} ออกจากแผนที่?`)) run(api.deleteLocation(loc.id)); }}
          className={`${btn} py-1 bg-rose-50 text-rose-600 border border-rose-200`}>ลบสถานที่</button>
      </div>
      <button onClick={save} className={`${btn} w-full bg-blue-600 text-white`}>บันทึกอาคาร</button>
    </div>
  );
}

/* ───────────── แท็บ ห้อง/โต๊ะ ───────────── */

function RoomRow({ room, loc, api, run, placingId, onPlace, autoOpen }: { room: MapRoom; loc: MapLocation; api: MapApi; run: Run; autoOpen?: boolean } & Place) {
  const longX = loc.size[0] >= loc.size[1];
  const AT = longX ? loc.size[0] : loc.size[1];   // ความยาวอาคารตามแนวทางเดิน (เมตร)
  const CT = longX ? loc.size[1] : loc.size[0];   // ความลึกอาคาร
  const [name, setName] = useState(room.name);
  const [code, setCode] = useState(room.code);
  const [type, setType] = useState(room.type ?? "classroom");
  const [desks, setDesks] = useState(room.desks ?? 30);
  const [teachers, setTeachers] = useState(room.teacherDesks ?? 1);
  const [students, setStudents] = useState(room.students ?? 0);
  const [ac, setAc] = useState(room.ac ?? "none");
  const [aStart, setAStart] = useState(r2((longX ? room.x : room.z) * AT));
  const [aLen, setALen] = useState(r2((longX ? room.w : room.d) * AT));
  const [cStart, setCStart] = useState(r2((longX ? room.z : room.x) * CT));
  const [cDep, setCDep] = useState(r2((longX ? room.d : room.w) * CT));
  const [rotDeg, setRotDeg] = useState(room.rot ?? 0);
  const [doors, setDoors] = useState<DoorDef[]>(room.doors?.length ? room.doors : [{ p: 0.5, w: 0.1 }]);
  const [furn, setFurn] = useState<FurnItem[]>(room.furniture ?? []);
  const [newKind, setNewKind] = useState(FURN_KINDS[0]);
  const [open, setOpen] = useState(!!autoOpen);

  const room0 = useRef(room);
  const dirty = useRef(false);
  const first = useRef(true);
  const geo = () => {
    const fa0 = aStart / AT, fal = aLen / AT, fc0 = cStart / CT, fcl = cDep / CT;
    const [x, w, zz, dd] = longX ? [fa0, fal, fc0, fcl] : [fc0, fcl, fa0, fal];
    const crossOld = longX ? room0.current.door[1] : room0.current.door[0];
    const dCross = clamp(crossOld, Math.min(fc0, fc0 + fcl), Math.max(fc0, fc0 + fcl));
    const dAlong = fa0 + fal / 2;
    return { x, z: zz, w, d: dd, door: (longX ? [dAlong, dCross] : [dCross, dAlong]) as [number, number], rot: rotDeg };
  };

  useEffect(() => {   // ดูตัวอย่างทันที
    if (first.current) { first.current = false; return; }
    dirty.current = true;
    api.previewRoom(room.id, { ...geo(), furniture: furn, doors });
  }, [aStart, aLen, cStart, cDep, rotDeg, furn, doors]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // วางของด้วยการคลิกบนแผนที่ → ซิงก์กลับมาที่ฟอร์ม
    if (JSON.stringify(room.furniture ?? []) !== JSON.stringify(furn)) setFurn(room.furniture ?? []);
  }, [room.furniture]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {   // ปิดโดยไม่บันทึก → คืนค่าเดิม
    if (!dirty.current) return;
    const o = room0.current;
    api.previewRoom(o.id, { x: o.x, z: o.z, w: o.w, d: o.d, door: o.door, rot: o.rot, furniture: o.furniture, doors: o.doors });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const g = geo();
    const patch: Partial<MapRoom> = {
      name, code, type, desks: type === "classroom" ? desks : 0, ac,
      teacherDesks: type === "classroom" ? teachers : 0, students: students > 0 ? students : undefined,
      ...g, doors, furniture: furn,
    };
    const r = await run(api.updateRoom(room.id, patch));
    if (r.ok) { room0.current = { ...room0.current, ...patch } as MapRoom; dirty.current = false; }
  };
  const setDoor = (i: number, p: Partial<DoorDef>) => setDoors((l) => l.map((d, k) => (k === i ? { ...d, ...p } : d)));
  const upF = (i: number, p: Partial<FurnItem>) => setFurn((l) => l.map((f, k) => (k === i ? { ...f, ...p } : f)));

  return (
    <div className={`rounded-xl border bg-white p-2 space-y-1.5 ${autoOpen ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"}`}>
      <div className="grid grid-cols-[1fr_5rem] gap-1.5">
        <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อห้อง" />
        <input className={inp} value={code} onChange={(e) => setCode(e.target.value)} placeholder="รหัส" />
      </div>
      <select className={inp} value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {type === "classroom" && (
        <div className="grid grid-cols-3 gap-1.5">
          <Num label="โต๊ะ นร." value={desks} step={1} min={0} onChange={(v) => setDesks(clamp(Math.round(v), 0, 60))} />
          <Num label="โต๊ะครู" value={teachers} step={1} min={0} onChange={(v) => setTeachers(clamp(Math.round(v), 0, 6))} />
          <Num label="จำนวน นร." value={students} step={1} min={0} onChange={(v) => setStudents(clamp(Math.round(v), 0, 99))} />
        </div>
      )}
      <select className={inp} value={ac} onChange={(e) => setAc(e.target.value)}>
        {Object.entries(AC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      <button onClick={() => setOpen((v) => !v)} className={`${btn} py-1 w-full bg-slate-100 text-slate-600`}>
        {open ? "▲ ซ่อน" : "▼ ขนาด/หมุนห้อง · ประตู · ของตกแต่ง"}
      </button>
      {open && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-400">เห็นผลบนแผนที่ทันที (กด “บันทึกห้อง” เพื่อเก็บถาวร) · หน่วยเมตร · ค่าติดลบ/เกินขอบ = ต่อออกนอกอาคารได้</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Num label="เริ่มที่ (ตามแนวอาคาร)" value={aStart} step={0.05} onChange={setAStart} />
            <Num label="ยาว (ตามแนวอาคาร)" value={aLen} step={0.05} min={0.1} onChange={(v) => setALen(Math.max(0.1, v))} />
            <Num label="เริ่มที่ (ลึก)" value={cStart} step={0.05} onChange={setCStart} />
            <Num label="ลึก" value={cDep} step={0.05} min={0.1} onChange={(v) => setCDep(Math.max(0.1, v))} />
          </div>
          <Num label="หมุนห้อง (องศา)" value={rotDeg} step={5} onChange={setRotDeg} />

          <p className="text-[11px] font-black text-slate-600">ประตู ({doors.length} บาน)</p>
          {doors.map((dd, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-1.5 items-end">
              <Num label="ตำแหน่ง (0–1)" value={dd.p} step={0.05} min={0} onChange={(v) => setDoor(i, { p: clamp(v, 0, 1) })} />
              <Num label="กว้าง" value={dd.w} step={0.02} min={0.04} onChange={(v) => setDoor(i, { w: Math.max(0.04, v) })} />
              <button onClick={() => setDoors((l) => l.filter((_, k) => k !== i))} className={`${btn} px-0 py-1.5 bg-rose-50 text-rose-600`}>✕</button>
            </div>
          ))}
          <button onClick={() => setDoors((l) => [...l, { p: 0.5, w: 0.1 }])} className={`${btn} py-1 w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มประตู</button>

          <div className="rounded-lg border border-slate-200 p-1.5 space-y-1.5">
            <p className="text-[11px] font-black text-slate-600">ของตกแต่งในห้อง ({furn.length}) — โหมดสร้างห้อง</p>
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <select className={inp} value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                {FURN_KINDS.map((k) => <option key={k} value={k}>{FURN[k].label}</option>)}
              </select>
              <button onClick={() => {
                const f: FurnItem = { id: `f${Date.now()}`, kind: newKind, x: 0, z: 0, rot: 0, s: 1 };
                setFurn((l) => [...l, f]);
                onPlace(`fur:${room.id}:${furn.length}`);
              }} className={`${btn} py-1 bg-emerald-600 text-white`}>+ วาง (คลิกพื้นห้อง)</button>
            </div>
            {furn.map((f, i) => (
              <div key={f.id} className="rounded-lg bg-slate-50 p-1.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black text-slate-600">{FURN[f.kind]?.label ?? f.kind}</span>
                  <div className="flex gap-1">
                    <PlaceBtn id={`fur:${room.id}:${i}`} placingId={placingId} onPlace={onPlace} />
                    <button onClick={() => setFurn((l) => l.filter((_, k) => k !== i))} className={`${btn} py-1 bg-rose-50 text-rose-600`}>✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <Num label="X" value={r2(f.x)} step={0.05} onChange={(v) => upF(i, { x: v })} />
                  <Num label="Z" value={r2(f.z)} step={0.05} onChange={(v) => upF(i, { z: v })} />
                  <Num label="หมุน°" value={f.rot ?? 0} step={15} onChange={(v) => upF(i, { rot: v })} />
                  <Num label="ขนาด" value={f.s ?? 1} step={0.1} min={0.3} onChange={(v) => upF(i, { s: Math.max(0.3, v) })} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        <button onClick={save} className={`${btn} flex-1 py-1.5 bg-blue-600 text-white`}>บันทึกห้อง</button>
        <button onClick={() => { if (confirm(`ลบ ${room.name}?`)) run(api.deleteRoom(room.id)); }}
          className={`${btn} py-1.5 bg-rose-50 text-rose-600 border border-rose-200`}>ลบ</button>
      </div>
    </div>
  );
}

/* ───────────── แท็บ ฉาก/ประตู ───────────── */

type Field = "rot" | "s" | "h" | "hs" | "w" | "d" | "n" | "m" | "kind" | "road" | "color" | "name" | "levels";
const FIELDS: Record<DecorType, Field[]> = {
  tree: ["kind", "s", "h"], pavilion: ["color", "rot", "hs"], shrine: ["name", "rot", "hs"],
  toilet: ["name", "kind", "w", "d", "rot", "color", "hs"], shed: ["name", "w", "d", "rot", "color", "hs"],
  barrier: ["name", "w", "rot", "hs"], flag: [], bridge: ["name", "w", "d", "rot", "levels"], sign: ["name", "w", "s"],
  carport: ["name", "w", "d", "rot", "color", "hs"], busbay: ["name", "w", "d", "rot", "n", "hs"], kiosk: ["name", "rot", "color", "hs"],
  temple: ["name", "kind", "s", "rot"], roadsign: ["name", "w", "rot", "color"], zebra: ["w", "d", "rot"],
  fieldfence: ["name", "w", "d", "rot", "h"], people: ["name", "kind", "road", "w", "d", "rot", "n", "m"],
};
const KIND_OPTIONS: Partial<Record<DecorType, [string, string][]>> = {
  tree: [["round", "ทรงกลม"], ["pine", "สน (ทรงกรวย)"], ["palm", "มะพร้าว/ปาล์ม"], ["bush", "พุ่มไม้เตี้ย"], ["flower", "ไม้ดอก (ราชพฤกษ์)"]],
  people: [["walk", "เดินในโรงเรียน"], ["assemble", "เข้าแถว"], ["sit", "นั่งทำกิจกรรม (วงกลม)"], ["play", "วิ่งเล่น"], ["exercise", "ออกกำลังกาย"], ["follow", "เดินตามถนน/ฟุตบาท"]],
  temple: [["ubosot", "อุโบสถ (หลังคาซ้อน)"], ["prasat", "วิหารทรงปราสาท"]],
  toilet: [["front", "ประตูหันด้านหน้า"], ["back", "ประตูหันด้านหลัง"], ["left", "ประตูหันด้านซ้าย"], ["right", "ประตูหันด้านขวา"]],
};
const NEW_DEFAULTS: Record<DecorType, Partial<DecorItem>> = {
  tree: { s: 1, h: 1, kind: "round" }, pavilion: { color: "#e5484d" }, shrine: { name: "ซุ้มพระ" },
  toilet: { name: "ห้องน้ำ", w: 36, d: 24, kind: "front" }, shed: { name: "ที่จอดมอเตอร์ไซค์", w: 60, d: 28, color: "#f59f00" },
  barrier: { name: "ประตูกั้น", w: 26, rot: 90 }, flag: {}, bridge: { name: "ทางเชื่อม", w: 30, d: 24, levels: "2,3" },
  sign: { name: "โรงเรียนวัดเขียนเขต", w: 42, s: 1 },
  carport: { name: "โรงจอดรถ", w: 90, d: 26, color: "#2563eb" }, busbay: { name: "ที่จอดรถตู้/รถรับส่ง", w: 78, d: 18, n: 3 },
  kiosk: { name: "ซุ้มขายน้ำ", color: "#0ea5e9" },
  temple: { name: "วัด", kind: "ubosot", s: 1 }, roadsign: { name: "ป้าย|บรรทัดที่ 2", w: 70, color: "#15803d" },
  zebra: { w: 52, d: 12 }, fieldfence: { name: "รั้วสนาม", w: 60, d: 90, h: 1 },
  people: { name: "นักเรียน", w: 60, d: 40, n: 10, m: 1, kind: "walk" },
};

function ItemRow({ it, patch, del, placingId, onPlace, roads, highlight }: {
  it: DecorItem; patch: (p: Partial<DecorItem>) => void; del: () => void; roads?: RoadItem[]; highlight?: boolean;
} & Place) {
  const f = FIELDS[it.type];
  const n = (k: "rot" | "s" | "h" | "hs" | "w" | "d" | "n" | "m", label: string, step = 1) =>
    f.includes(k) && <Num key={k} label={label} value={it[k] ?? (k === "s" || k === "h" || k === "hs" || k === "m" ? 1 : k === "n" ? 3 : 0)} step={step} onChange={(v) => patch({ [k]: v })} />;
  const kinds = KIND_OPTIONS[it.type];
  return (
    <div className={`rounded-xl border bg-white p-2 space-y-1.5 ${highlight ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"}`}>
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
        {n("s", it.type === "sign" ? "ขนาดตัวอักษร" : "ขนาด", 0.05)}{n("h", "ความสูง (ตัวคูณ)", 0.1)}{n("hs", "ความสูง (ตัวคูณ)", 0.1)}
        {n("w", "กว้าง (px)")}{n("d", "ลึก (px)")}
        {n("n", it.type === "people" ? "จำนวน นร." : "จำนวนช่อง")}{n("m", "จำนวนครู")}{n("rot", "หมุน (องศา)", 0.5)}
      </div>
      {f.includes("kind") && kinds && (
        <select className={inp} value={it.kind ?? kinds[0][0]} onChange={(e) => patch({ kind: e.target.value })}>
          {kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      {f.includes("road") && it.kind === "follow" && (
        <select className={inp} value={it.road ?? ""} onChange={(e) => patch({ road: e.target.value })}>
          <option value="">— เลือกถนน/ฟุตบาทที่เดินตาม —</option>
          {(roads ?? []).filter((r) => r.kind !== "route").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      {f.includes("name") && (
        <input className={inp} value={it.name ?? ""} onChange={(e) => patch({ name: e.target.value })}
          placeholder={it.type === "roadsign" ? "ข้อความ (ขึ้นบรรทัดใหม่ด้วย |)" : "ชื่อ"} />
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
  g: GateItem; patch: (p: Partial<GateItem>) => void; del: () => void;
} & Place) {
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
      <div className="grid grid-cols-2 gap-1.5 items-end">
        <label className="block"><span className={lbl}>แบบประตู</span>
          <select className={inp} value={g.mode ?? "double"} onChange={(e) => patch({ mode: e.target.value as GateItem["mode"] })}>
            <option value="double">เปิด 2 บาน</option>
            <option value="single">เปิด 1 บาน</option>
            <option value="slide">ประตูเลื่อน</option>
          </select></label>
        <Num label="ความสูงเสา (0 = อัตโนมัติ)" value={g.h ?? 0} step={0.1} min={0} onChange={(v) => patch({ h: v > 0 ? v : undefined })} />
      </div>
      <div className="flex gap-3 text-[11px] font-bold text-slate-600">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!g.closed} onChange={(e) => patch({ closed: e.target.checked })} className="w-4 h-4 accent-blue-600" />ปิดประตู</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!g.ped} onChange={(e) => patch({ ped: e.target.checked })} className="w-4 h-4 accent-blue-600" />ประตูคนเดิน (ไม่มีถนนต่อ)</label>
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

function RoadRow({ r, patch, del, placingId, onPlace }: {
  r: RoadItem; patch: (p: Partial<RoadItem>) => void; del: () => void;
} & Place) {
  const setPt = (i: number, k: 0 | 1, v: number) => patch({ pts: r.pts.map((p, j) => (j === i ? (k === 0 ? [v, p[1]] : [p[0], v]) : p) as [number, number]) });
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <input className={`${inp} font-bold`} value={r.name} onChange={(e) => patch({ name: e.target.value })} />
        <button onClick={del} className={`${btn} py-1 bg-rose-50 text-rose-600 border border-rose-200`}>ลบ</button>
      </div>
      <select className={inp} value={r.kind} onChange={(e) => patch({ kind: e.target.value as RoadKind })}>
        {(Object.keys(ROAD_KIND_LABEL) as RoadKind[]).map((k) => <option key={k} value={k}>{ROAD_KIND_LABEL[k]}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-1.5">
        {r.kind !== "route" && <Num label="ความกว้าง (world)" value={r.w ?? (r.kind === "main" ? 4 : r.kind === "soi" ? 1.6 : 1)} step={0.1} min={0.3} onChange={(v) => patch({ w: Math.max(0.3, v) })} />}
        <label className="block"><span className={lbl}>ความโค้ง ({(r.curve ?? 0).toFixed(2)})</span>
          <input type="range" min={0} max={1.5} step={0.05} value={r.curve ?? 0} onChange={(e) => patch({ curve: parseFloat(e.target.value) })} className="w-full" /></label>
      </div>
      {r.kind === "walk" && (
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <input type="checkbox" checked={!!r.roof} onChange={(e) => patch({ roof: e.target.checked })} className="w-4 h-4 accent-blue-600" />มีหลังคากันฝน</label>
      )}
      {(r.kind === "main" || r.kind === "soi") && (
        <input className={inp} value={r.label ?? ""} onChange={(e) => patch({ label: e.target.value || undefined })} placeholder="ป้ายชื่อถนน (ไม่บังคับ)" />
      )}
      <p className="text-[11px] font-black text-slate-600">จุดบนเส้น ({r.pts.length} จุด) — ลากโค้งผ่านทุกจุดตามค่าความโค้ง</p>
      {r.pts.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1 items-end">
          <Num label={`จุด ${i + 1} X`} value={p[0]} step={1} onChange={(v) => setPt(i, 0, v)} />
          <Num label="Y" value={p[1]} step={1} onChange={(v) => setPt(i, 1, v)} />
          <PlaceBtn id={`pt:${r.id}:${i}`} placingId={placingId} onPlace={onPlace} />
          <button onClick={() => patch({ pts: r.pts.filter((_, j) => j !== i) })} disabled={r.pts.length <= 2}
            className={`${btn} px-2 py-1.5 bg-rose-50 text-rose-600 disabled:opacity-30`}>✕</button>
        </div>
      ))}
      <button onClick={() => {
        const last = r.pts[r.pts.length - 1];
        patch({ pts: [...r.pts, [last[0] + 40, last[1]]] });
        onPlace(`pt:${r.id}:${r.pts.length}`);
      }} className={`${btn} py-1 w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มจุดท้ายเส้น (แล้วคลิกวางบนแผนที่)</button>
    </div>
  );
}

function DecorEditor({ decor, api, run, placingId, onPlace, focus }: { decor: DecorConfig; api: MapApi; run: Run; focus: AdminFocus } & Place) {
  const [cat, setCat] = useState<DecorType | "gate" | "road">("gate");
  const [fid, setFid] = useState<string | null>(null);
  useEffect(() => {   // กดวัตถุบนแผนที่ → เปิดหมวดนั้นและแสดงเฉพาะชิ้นนั้น
    if (!focus) return;
    if (focus.kind === "gate") { setCat("gate"); setFid(focus.id); }
    else if (focus.kind === "road") { setCat("road"); setFid(focus.id); }
    else if (focus.kind === "gray") { setCat("road"); setFid("__gray"); }
    else if (focus.kind === "item") {
      const it = decor.items.find((i) => i.id === focus.id);
      if (it) { setCat(it.type); setFid(it.id); }
    }
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = decor.items.filter((i) => i.type === cat && (!fid || i.id === fid));
  const patchItem = (id: string, p: Partial<DecorItem>) =>
    api.setDecor((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const patchGate = (id: string, p: Partial<GateItem>) =>
    api.setDecor((d) => ({ ...d, gates: d.gates.map((g) => (g.id === id ? { ...g, ...p } : g)) }));
  const add = () => {
    const id = `${cat}-${Date.now()}`;
    if (cat === "road") {
      api.setDecor((d) => ({ ...d, roads: [...(d.roads ?? []), { id, name: "ถนนใหม่", kind: "soi", pts: [[480, 400], [560, 400]], w: 1.6, curve: 0 }] }));
      return;
    }
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
      {fid && (
        <button onClick={() => setFid(null)} className={`${btn} py-1 w-full bg-sky-50 text-sky-700 border border-sky-200`}>กำลังแสดงเฉพาะชิ้นที่เลือก — แสดงทั้งหมด</button>
      )}
      <select className={inp} value={cat} onChange={(e) => { setCat(e.target.value as any); setFid(null); onPlace(null); }}>
        <option value="gate">ประตูรั้ว ({decor.gates.length})</option>
        <option value="road">ถนน / ฟุตบาท / เส้นทางรถ ({(decor.roads ?? []).length})</option>
        {(Object.keys(DECOR_LABEL) as DecorType[]).map((k) => (
          <option key={k} value={k}>{DECOR_LABEL[k]} ({decor.items.filter((i) => i.type === k).length})</option>
        ))}
      </select>
      {cat === "road" && (
        <div className={`rounded-xl border bg-white p-2 space-y-1.5 ${fid === "__gray" ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"}`}>
          <p className="text-[11px] font-black text-slate-600">ถนนเทาในโรงเรียน (ที่มีอยู่เดิมทุกเส้น)</p>
          <div className="grid grid-cols-3 gap-1.5 items-end">
            <Num label="ความกว้าง" value={decor.grayRoad?.w ?? 1.02} step={0.05} min={0.3}
              onChange={(v) => api.setDecor((d) => ({ ...d, grayRoad: { w: Math.max(0.3, v), color: d.grayRoad?.color ?? "#9ca3af", edge: d.grayRoad?.edge ?? "#ffffff" } }))} />
            <label className="block"><span className={lbl}>สีถนน</span>
              <input type="color" className="w-full h-[30px] rounded-lg border border-slate-200" value={decor.grayRoad?.color ?? "#9ca3af"}
                onChange={(e) => api.setDecor((d) => ({ ...d, grayRoad: { w: d.grayRoad?.w ?? 1.02, color: e.target.value, edge: d.grayRoad?.edge ?? "#ffffff" } }))} /></label>
            <label className="block"><span className={lbl}>สีขอบ</span>
              <input type="color" className="w-full h-[30px] rounded-lg border border-slate-200" value={decor.grayRoad?.edge ?? "#ffffff"}
                onChange={(e) => api.setDecor((d) => ({ ...d, grayRoad: { w: d.grayRoad?.w ?? 1.02, color: d.grayRoad?.color ?? "#9ca3af", edge: e.target.value } }))} /></label>
          </div>
        </div>
      )}
      {cat === "road" && (
        <div className="rounded-xl border border-slate-200 bg-white p-2 grid grid-cols-2 gap-1.5">
          <Num label="จำนวนรถที่วิ่ง" value={decor.traffic?.cars ?? 4} step={1} min={0}
            onChange={(v) => api.setDecor((d) => ({ ...d, traffic: { cars: clamp(Math.round(v), 0, 24), speed: d.traffic?.speed ?? 2.4 } }))} />
          <Num label="ความเร็วรถ" value={decor.traffic?.speed ?? 2.4} step={0.2} min={0.2}
            onChange={(v) => api.setDecor((d) => ({ ...d, traffic: { cars: d.traffic?.cars ?? 4, speed: clamp(v, 0.2, 10) } }))} />
        </div>
      )}
      {cat === "road"
        ? (decor.roads ?? []).filter((r) => !fid || fid === "__gray" || r.id === fid).map((r) => (
          <RoadRow key={r.id} r={r} patch={(p) => api.setDecor((d) => ({ ...d, roads: (d.roads ?? []).map((x) => (x.id === r.id ? { ...x, ...p } : x)) }))}
            placingId={placingId} onPlace={onPlace}
            del={() => { if (confirm(`ลบ ${r.name}?`)) api.setDecor((d) => ({ ...d, roads: (d.roads ?? []).filter((x) => x.id !== r.id) })); }} />
        ))
        : cat === "gate"
        ? decor.gates.filter((g) => !fid || g.id === fid).map((g) => (
          <GateRow key={g.id} g={g} patch={(p) => patchGate(g.id, p)} placingId={placingId} onPlace={onPlace}
            del={() => { if (confirm(`ลบ ${g.name}?`)) api.setDecor((d) => ({ ...d, gates: d.gates.filter((x) => x.id !== g.id) })); }} />
        ))
        : items.map((it) => (
          <ItemRow key={it.id} it={it} patch={(p) => patchItem(it.id, p)} placingId={placingId} onPlace={onPlace} roads={decor.roads} highlight={fid === it.id}
            del={() => api.setDecor((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))} />
        ))}
      {cat !== "gate" && cat !== "road" && items.length === 0 && <p className="text-xs text-slate-400">ยังไม่มีรายการ</p>}
      <button onClick={add} className={`${btn} w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>
        + เพิ่ม{cat === "gate" ? "ประตูรั้ว" : cat === "road" ? "ถนน/ฟุตบาท/เส้นทางรถ" : DECOR_LABEL[cat]}
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
  locs, rooms, source, warnings, settings, onSettings, api, onClose, decor, placingId, onPlace, focus,
}: {
  locs: MapLocation[]; rooms: MapRoom[]; source: "fallback" | "supabase"; warnings: string[];
  settings: MapSettings; onSettings: (s: MapSettings) => void; api: MapApi; onClose: () => void;
  decor: DecorConfig; placingId: string | null; onPlace: (id: string | null) => void; focus?: AdminFocus;
}) {
  const [tab, setTab] = useState<"loc" | "room" | "dec" | "set">("loc");
  const [toast, setToast] = useState<SaveResult | null>(null);
  const run: Run = async (p) => {
    const r = await p; setToast(r); setTimeout(() => setToast(null), 5000); return r;
  };

  const [locId, setLocId] = useState(locs[0]?.id ?? "");
  const loc = locs.find((l) => l.id === locId) ?? locs[0];
  const [newKind, setNewKind] = useState<LocKind>("facility");

  const buildings = useMemo(() => locs.filter(hasInterior), [locs]);
  const [bId, setBId] = useState(buildings[0]?.id ?? "");
  const b = buildings.find((l) => l.id === bId) ?? buildings[0];
  const [level, setLevel] = useState(1);
  const [roomFocus, setRoomFocus] = useState<string | null>(null);
  useEffect(() => {   // กดวัตถุบนแผนที่ → ไปหน้าตั้งค่าของสิ่งนั้นทันที
    if (!focus) return;
    if (focus.kind === "loc") { setTab("loc"); setLocId(focus.id); }
    else if (focus.kind === "room") {
      const r = rooms.find((x) => x.id === focus.id);
      if (r) { setTab("room"); setBId(r.location_id); setLevel(r.level); setRoomFocus(r.id); }
    } else setTab("dec");
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
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
        {tab === "loc" && (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <select className={inp} value={newKind} onChange={(e) => setNewKind(e.target.value as LocKind)}>
                {(Object.keys(KIND_LABEL) as LocKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <button onClick={async () => { const r = await run(api.addLocation(newKind)); if (r.ok) onPlace(null); }}
                className={`${btn} py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มสถานที่</button>
            </div>
            {loc && (
              <>
                <select className={inp} value={loc.id} onChange={(e) => setLocId(e.target.value)}>
                  {locs.map((l) => <option key={l.id} value={l.id}>{l.code}. {l.name}</option>)}
                </select>
                <LocForm
                  key={`${loc.id}|${loc.floors}|${loc.kind}|${loc.corridor}|${loc.stairs}|${loc.perFloor}|${loc.toilet}|${JSON.stringify(loc.floorRooms)}|${JSON.stringify(loc.stairList)}`}
                  loc={loc} api={api} run={run} placingId={placingId} onPlace={onPlace} />
              </>
            )}
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
            {list.map((r) => (
              <RoomRow key={`${r.id}|${roomFocus === r.id ? "f" : ""}`}
                room={r} loc={b} api={api} run={run} placingId={placingId} onPlace={onPlace} autoOpen={roomFocus === r.id} />
            ))}
            <button onClick={() => run(api.addRoom(b.id, lv))} className={`${btn} w-full bg-indigo-50 text-indigo-700 border border-indigo-200`}>+ เพิ่มห้องในชั้น {lv}</button>
          </>
        ) : <p className="text-xs text-slate-400">ไม่มีอาคารเรียน</p>)}

        {tab === "dec" && <DecorEditor decor={decor} api={api} run={run} placingId={placingId} onPlace={onPlace} focus={focus ?? null} />}

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
              <button onClick={() => { if (confirm("ปรับตำแหน่ง/การหมุน/ชนิดอาคารทุกหลังให้ตรงผังตั้งต้นใหม่ และเพิ่มสถานที่ตั้งต้นที่ยังไม่มี?")) run(api.syncDefaultLayout()); }}
                className={`${btn} py-1.5 w-full bg-slate-800 text-white`}>ปรับผังตามค่าตั้งต้นใหม่ (+เพิ่มที่ยังไม่มี)</button>
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
