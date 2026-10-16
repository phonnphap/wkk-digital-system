"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSchoolMapData } from "./useSchoolMapData";
import { findPath, indoorRoute } from "./pathfinding";
import { FH, MapLocation, MapRoom, roomCenter } from "./schoolData";
import { BuildingModel, IndoorBuilding, TYPE_LABEL } from "./BuildingModel.ts";
import { Decor, Field, ParkingLot } from "./SceneDecor";

type Dest = { type: "loc" | "room"; id: string } | null;
type Goal = { pos: THREE.Vector3; target: THREE.Vector3 } | null;

const OVERVIEW: Goal = { pos: new THREE.Vector3(-2, 22, 18), target: new THREE.Vector3(-2, 0, 0.5) };

function focusGoal(loc: MapLocation, level: number): Goal {
  const y = (level - 1) * FH;
  const s = Math.max(loc.size[0], loc.size[1]);
  const t = new THREE.Vector3(loc.pos[0], y, loc.pos[1]);
  return { target: t, pos: new THREE.Vector3(loc.pos[0], y + s * 0.9 + 4, loc.pos[1] + s * 0.55 + 3) };
}

/* ───────────────────────── Robot / Camera ───────────────────────── */

function Robot({
  route, running, groupRef, home, onDone, speed = 3.2,
}: {
  route: THREE.Vector3[]; running: boolean; groupRef: React.RefObject<THREE.Group>;
  home: THREE.Vector3; onDone: () => void; speed?: number;
}) {
  const idx = useRef(0);
  const finished = useRef(false);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    idx.current = 0;
    finished.current = false;
    const g = groupRef.current;
    if (g) g.position.copy(route.length ? route[0] : home);
  }, [route, home, groupRef]);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    let moving = false;
    if (running && route.length > 1 && !finished.current) {
      const target = route[Math.min(idx.current + 1, route.length - 1)];
      const dir = target.clone().sub(g.position);
      const dist = dir.length();
      const step = speed * Math.min(dt, 0.05);
      if (dist <= step) {
        g.position.copy(target);
        idx.current++;
        if (idx.current >= route.length - 1) {
          finished.current = true;
          doneRef.current();
        }
      } else {
        dir.normalize();
        g.position.addScaledVector(dir, step);
        const targetAngle = Math.atan2(dir.x, dir.z);
        let diff = targetAngle - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += diff * Math.min(1, dt * 10);
        moving = true;
      }
    }
    const t = state.clock.elapsedTime;
    if (body.current) body.current.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 2) * 0.015;
    const swing = moving ? Math.sin(t * 9) * 0.6 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
  });

  return (
    <group ref={groupRef} scale={0.55}>
      <group ref={body}>
        <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[0.6, 0.7, 0.4]} /><meshStandardMaterial color="#f43f5e" /></mesh>
        <mesh position={[0, 1.55, 0]} castShadow><sphereGeometry args={[0.32, 20, 20]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        <mesh position={[-0.12, 1.6, 0.27]}><sphereGeometry args={[0.06, 10, 10]} /><meshBasicMaterial color="#0f172a" /></mesh>
        <mesh position={[0.12, 1.6, 0.27]}><sphereGeometry args={[0.06, 10, 10]} /><meshBasicMaterial color="#0f172a" /></mesh>
        <mesh position={[0, 1.95, 0]}><cylinderGeometry args={[0.02, 0.02, 0.2]} /><meshStandardMaterial color="#334155" /></mesh>
        <mesh position={[0, 2.08, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.6} /></mesh>
        <mesh ref={legL} position={[-0.16, 0.35, 0]}><boxGeometry args={[0.18, 0.5, 0.2]} /><meshStandardMaterial color="#334155" /></mesh>
        <mesh ref={legR} position={[0.16, 0.35, 0]}><boxGeometry args={[0.18, 0.5, 0.2]} /><meshStandardMaterial color="#334155" /></mesh>
      </group>
    </group>
  );
}

function CameraRig({
  goal, follow, robotRef, controlsRef,
}: { goal: Goal; follow: boolean; robotRef: React.RefObject<THREE.Group>; controlsRef: React.RefObject<any> }) {
  const active = useRef(false);
  useEffect(() => { active.current = !!goal; }, [goal]);
  useFrame(({ camera }, dt) => {
    const c = controlsRef.current;
    if (!c) return;
    let pos: THREE.Vector3 | null = null, tgt: THREE.Vector3 | null = null;
    if (follow && robotRef.current) {
      tgt = robotRef.current.position.clone();
      pos = tgt.clone().add(new THREE.Vector3(0, 8, 9));
    } else if (goal && active.current) {
      pos = goal.pos; tgt = goal.target;
    }
    if (!pos || !tgt) return;
    const k = 1 - Math.pow(0.0005, dt);
    camera.position.lerp(pos, k);
    c.target.lerp(tgt, k);
    c.update();
    if (!follow && camera.position.distanceTo(pos) < 0.05 && c.target.distanceTo(tgt) < 0.05) active.current = false;
  });
  return null;
}

/* ───────────────────────── Main component ───────────────────────── */

export default function SchoolMap3D() {
  const { locs, rooms, nodes, edges, source } = useSchoolMapData();
  const locById = useMemo(() => new Map(locs.map((l) => [l.id, l])), [locs]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const gate = useMemo(() => locs.find((l) => l.kind === "gate") ?? locs[0], [locs]);

  const [fromId, setFromId] = useState("");
  const fromLoc = locById.get(fromId) ?? gate;
  const [mode, setMode] = useState<"outdoor" | "indoor">("outdoor");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [floor, setFloor] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dest, setDest] = useState<Dest>(null);
  const [query, setQuery] = useState("");
  const [route, setRoute] = useState<THREE.Vector3[]>([]);
  const [running, setRunning] = useState(false);
  const [follow, setFollow] = useState(false);
  const [goal, setGoal] = useState<Goal>(OVERVIEW);
  const [msg, setMsg] = useState("เลือกสถานที่ปลายทางเพื่อเริ่มนำทาง");

  const robotRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const stageRef = useRef<"outdoor" | "indoor" | null>(null);
  const pendingRef = useRef<Dest>(null);

  const home = useMemo(() => new THREE.Vector3(gate?.entrance[0] ?? 0, 0.12, gate?.entrance[1] ?? 0), [gate]);
  const activeLoc = activeId ? locById.get(activeId) : undefined;
  const selectedRoom = selectedRoomId ? roomById.get(selectedRoomId) : undefined;

  const notifyParent = (event: string, payload: any = {}) => {
    try { window.parent?.postMessage({ type: "wkk-map", event, ...payload }, "*"); } catch { /* ignore */ }
  };

  const enterIndoor = useCallback((loc: MapLocation, level: number) => {
    setMode("indoor"); setActiveId(loc.id); setFloor(level);
    setGoal(focusGoal(loc, level)); setFollow(false); setSelectedId(null); setSelectedRoomId(null);
  }, []);

  const exitIndoor = () => {
    if (activeLoc) setRoute([new THREE.Vector3(activeLoc.entrance[0], 0.12, activeLoc.entrance[1])]);
    setRunning(false); stageRef.current = null;
    setMode("outdoor"); setActiveId(null); setSelectedRoomId(null); setGoal(OVERVIEW); setFollow(false);
    setMsg("ออกจากอาคารแล้ว");
  };

  const finishOutdoor = useCallback((d: Dest) => {
    setRunning(false);
    if (!d) return;
    const room = d.type === "room" ? roomById.get(d.id) : undefined;
    const loc = d.type === "room" ? (room ? locById.get(room.location_id) : undefined) : locById.get(d.id);
    if (!loc) return;
    if (room) {
      enterIndoor(loc, room.level);
      setRoute(indoorRoute(loc, room));
      stageRef.current = "indoor";
      setRunning(true);
      setMsg(`เข้าอาคารแล้ว กำลังพาไป ${room.name} (ชั้น ${room.level})`);
    } else if (loc.kind === "building" && loc.floors > 0) {
      enterIndoor(loc, 1);
      stageRef.current = null;
      setMsg(`ถึง ${loc.name} แล้ว — แตะห้องเพื่อดูรายละเอียดหรือให้พาไป`);
      notifyParent("arrived", { to: loc.code });
    } else {
      stageRef.current = null;
      setGoal(focusGoal(loc, 1)); setFollow(false);
      setMsg(`ถึง ${loc.name} แล้ว`);
      notifyParent("arrived", { to: loc.code });
    }
  }, [roomById, locById, enterIndoor]);

  const startOutdoorNav = useCallback((d: Dest) => {
    if (!d) return;
    const room = d.type === "room" ? roomById.get(d.id) : undefined;
    const loc = d.type === "room" ? (room ? locById.get(room.location_id) : undefined) : locById.get(d.id);
    if (!loc || !fromLoc) return;
    pendingRef.current = d;
    setSelectedId(null); setSelectedRoomId(null); setMode("outdoor"); setActiveId(null);
    if (fromLoc.id === loc.id) {
      stageRef.current = "outdoor";
      setRoute([new THREE.Vector3(loc.entrance[0], 0.12, loc.entrance[1])]);
      setTimeout(() => finishOutdoor(d), 0);
      return;
    }
    const xz = findPath(nodes, edges, fromLoc.entrance, loc.entrance);
    const pts: THREE.Vector3[] = [];
    xz.forEach(([x, z]) => {
      const v = new THREE.Vector3(x, 0.12, z);
      if (!pts.length || pts[pts.length - 1].distanceTo(v) > 0.01) pts.push(v);
    });
    stageRef.current = "outdoor";
    setRoute(pts); setRunning(true); setFollow(true); setGoal(null);
    setMsg(`กำลังนำทางไป ${room ? room.name + " · " : ""}${loc.name}`);
    notifyParent("navigate-start", { to: loc.code, room: room?.code });
  }, [fromLoc, locById, roomById, nodes, edges, finishOutdoor]);

  const onRobotDone = useCallback(() => {
    if (stageRef.current === "outdoor") finishOutdoor(pendingRef.current);
    else if (stageRef.current === "indoor") {
      stageRef.current = null; setRunning(false);
      const r = pendingRef.current?.type === "room" ? roomById.get(pendingRef.current.id) : undefined;
      setMsg(`ถึง ${r?.name ?? "ห้อง"} แล้ว 🎉`);
      notifyParent("arrived", { room: r?.code });
    } else setRunning(false);
  }, [finishOutdoor, roomById]);

  const goTo = useCallback((d: Dest) => {
    if (!d) return;
    setDest(d);
    if (d.type === "room") {
      const room = roomById.get(d.id);
      const loc = room ? locById.get(room.location_id) : undefined;
      if (room && loc && mode === "indoor" && activeId === loc.id) {
        pendingRef.current = d; stageRef.current = "indoor";
        setFloor(room.level); setGoal(focusGoal(loc, room.level)); setFollow(false);
        setRoute(indoorRoute(loc, room)); setRunning(true);
        setMsg(`กำลังพาไป ${room.name} (ชั้น ${room.level})`);
        return;
      }
    }
    startOutdoorNav(d);
  }, [roomById, locById, mode, activeId, startOutdoorNav]);

  const zoomRoom = (loc: MapLocation, room: MapRoom) => {
    const c = roomCenter(loc, room);
    const t = new THREE.Vector3(c[0], c[1], c[2]);
    setGoal({ target: t, pos: t.clone().add(new THREE.Vector3(0, 2.2, 1.8)) });
    setFollow(false);
  };

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type !== "wkk-map:navigate") return;
      const l = locs.find((x) => x.code === String(e.data.code));
      if (l) goTo({ type: "loc", id: l.id });
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [locs, goTo]);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("to");
    if (code) { const l = locs.find((x) => x.code === code); if (l) setDest({ type: "loc", id: l.id }); }
  }, [locs]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: { d: NonNullable<Dest>; label: string; sub: string }[] = [];
    locs.forEach((l) => {
      if (!q || l.name.toLowerCase().includes(q) || l.code === q)
        items.push({ d: { type: "loc", id: l.id }, label: `${l.code}. ${l.name}`, sub: "สถานที่" });
    });
    if (q) rooms.forEach((r) => {
      if (r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) {
        const l = locById.get(r.location_id);
        items.push({ d: { type: "room", id: r.id }, label: r.name, sub: `${l?.name ?? ""} · ชั้น ${r.level}` });
      }
    });
    return items.slice(0, 8);
  }, [query, locs, rooms, locById]);

  const destLabel = dest
    ? dest.type === "loc" ? locById.get(dest.id)?.name : roomById.get(dest.id)?.name
    : null;
  const selectedLoc = selectedId ? locById.get(selectedId) : undefined;
  const pickOutdoor = (id: string) => {
    if (mode !== "outdoor") return;
    setSelectedId(id); setGoal(focusGoal(locById.get(id)!, 1)); setFollow(false);
  };

  return (
    <div className="relative w-full h-full min-h-[480px] bg-sky-100 overflow-hidden font-sans">
      <Canvas shadows camera={{ position: [-2, 22, 18], fov: 45 }} dpr={[1, 2]}
        onPointerMissed={() => { setSelectedId(null); setSelectedRoomId(null); }}>
        <color attach="background" args={["#cfe8ff"]} />
        <fog attach="fog" args={["#cfe8ff", 45, 100]} />
        <hemisphereLight args={["#ffffff", "#7a9a5a", 0.7]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[12, 26, 14]} intensity={1.15} castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-26} shadow-camera-right={26}
          shadow-camera-top={26} shadow-camera-bottom={-26}
          shadow-camera-near={1} shadow-camera-far={90}
        />

        <Decor nodes={nodes} edges={edges} gate={gate} robotRef={robotRef as any} indoor={mode === "indoor"} />

        {locs.map((l) => {
          if (mode === "indoor" && l.id === activeId) return null;
          const dim = mode === "indoor";
          if (l.kind === "field") return <Field key={l.id} loc={l} dim={dim} onPick={pickOutdoor} />;
          if (l.kind === "parking") return <ParkingLot key={l.id} loc={l} dim={dim} onPick={pickOutdoor} />;
          return <BuildingModel key={l.id} loc={l} dim={dim} selected={selectedId === l.id} onPick={pickOutdoor} />;
        })}

        {mode === "indoor" && activeLoc && (
          <IndoorBuilding
            loc={activeLoc} rooms={rooms.filter((r) => r.location_id === activeLoc.id)} floor={floor}
            activeRoomId={dest?.type === "room" ? dest.id : undefined}
            selectedRoomId={selectedRoomId}
            onRoom={(r) => { setSelectedRoomId(r.id); }}
          />
        )}

        {route.length > 1 && (
          <Line points={route.map((p) => [p.x, p.y + 0.06, p.z] as [number, number, number])}
            color="#f43f5e" lineWidth={4} dashed dashSize={0.3} gapSize={0.2} />
        )}
        <Robot route={route} running={running} groupRef={robotRef as any} home={home} onDone={onRobotDone} />
        <OrbitControls ref={controlsRef} makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={1.5} maxDistance={45}
          onStart={() => { setFollow(false); setGoal(null); }} />
        <CameraRig goal={goal} follow={follow} robotRef={robotRef as any} controlsRef={controlsRef} />
      </Canvas>

      {/* ── แผงค้นหา / นำทาง ── */}
      <div className="absolute top-3 left-3 w-[19rem] max-w-[calc(100%-1.5rem)] bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2">
        <p className="text-sm font-black text-slate-800">🗺️ แผนผังโรงเรียนวัดเขียนเขต 3D</p>
        <label className="block text-[11px] font-bold text-slate-400">จุดเริ่มต้น</label>
        <select value={fromLoc?.id ?? ""} onChange={(e) => setFromId(e.target.value)}
          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5">
          {locs.map((l) => <option key={l.id} value={l.id}>{l.code}. {l.name}</option>)}
        </select>
        <label className="block text-[11px] font-bold text-slate-400">ปลายทาง (ค้นหาอาคาร / ห้อง)</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="เช่น อาคาร 3, ห้อง 3-101, สนาม…"
          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-blue-400" />
        <div className="max-h-44 overflow-y-auto divide-y divide-slate-50 rounded-lg border border-slate-100">
          {results.length === 0 && <p className="text-xs text-slate-400 p-2">ไม่พบสถานที่</p>}
          {results.map((r, i) => (
            <button key={i} onClick={() => { setDest(r.d); setQuery(""); }}
              className="w-full text-left px-2 py-1.5 hover:bg-blue-50">
              <span className="block text-xs font-bold text-slate-700 truncate">{r.label}</span>
              <span className="block text-[10px] text-slate-400 truncate">{r.sub}</span>
            </button>
          ))}
        </div>
        {destLabel && <p className="text-xs text-slate-600">🎯 ปลายทาง: <b>{destLabel}</b></p>}
        <div className="flex gap-2">
          <button disabled={!dest || running} onClick={() => goTo(dest)}
            className="flex-1 text-xs font-extrabold rounded-xl bg-blue-600 text-white py-2 disabled:opacity-40">
            🚶 เริ่มนำทาง
          </button>
          <button onClick={() => { setFollow((v) => !v); setGoal(null); }}
            className={`text-xs font-bold rounded-xl px-3 border ${follow ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
            ตามหุ่นยนต์
          </button>
        </div>
      </div>

      {/* ── การ์ดอาคารที่เลือก (ภายนอก) ── */}
      {selectedLoc && mode === "outdoor" && (
        <div className="absolute bottom-16 left-3 w-[19rem] max-w-[calc(100%-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-black text-slate-800">{selectedLoc.code}. {selectedLoc.name}</p>
          {selectedLoc.kind === "building" && (
            <p className="text-[11px] text-slate-500">{selectedLoc.floors} ชั้น · {rooms.filter((r) => r.location_id === selectedLoc.id).length} ห้อง</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => goTo({ type: "loc", id: selectedLoc.id })}
              className="flex-1 text-xs font-extrabold rounded-xl bg-blue-600 text-white py-2">🚶 นำทางไปที่นี่</button>
            {selectedLoc.kind === "building" && (
              <button onClick={() => enterIndoor(selectedLoc, 1)}
                className="flex-1 text-xs font-extrabold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 py-2">🏢 ดูภายในอาคาร</button>
            )}
          </div>
        </div>
      )}

      {/* ── การ์ดห้องที่เลือก (ภายใน) ── */}
      {mode === "indoor" && activeLoc && selectedRoom && (
        <div className="absolute bottom-16 left-3 w-[19rem] max-w-[calc(100%-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-black text-slate-800">{selectedRoom.name} <span className="text-xs font-bold text-slate-400">ชั้น {selectedRoom.level}</span></p>
          <p className="text-[11px] text-slate-500">
            {TYPE_LABEL[selectedRoom.type ?? "classroom"] ?? "ห้อง"}
            {(selectedRoom.type ?? "classroom") === "classroom" ? ` · โต๊ะนักเรียน ${selectedRoom.desks ?? 30} ตัว` : ""}
          </p>
          <div className="flex gap-2">
            <button onClick={() => goTo({ type: "room", id: selectedRoom.id })}
              className="flex-1 text-xs font-extrabold rounded-xl bg-blue-600 text-white py-2">🚶 พาไปห้องนี้</button>
            <button onClick={() => zoomRoom(activeLoc, selectedRoom)}
              className="flex-1 text-xs font-extrabold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 py-2">🔍 ซูมดูห้อง</button>
          </div>
        </div>
      )}

      {/* ── Indoor UI ── */}
      {mode === "indoor" && activeLoc && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/95 rounded-2xl shadow-xl border border-slate-200 px-3 py-2">
            <button onClick={exitIndoor} className="text-xs font-extrabold text-rose-600">← ออกจากอาคาร</button>
            <span className="text-xs font-black text-slate-700 hidden sm:inline">{activeLoc.name}</span>
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 bg-white/95 rounded-2xl shadow-xl border border-slate-200 p-2">
            {Array.from({ length: Math.max(activeLoc.floors, 1) }, (_, i) => Math.max(activeLoc.floors, 1) - i).map((lv) => (
              <button key={lv} onClick={() => { setFloor(lv); setSelectedRoomId(null); setGoal(focusGoal(activeLoc, lv)); setFollow(false); }}
                className={`w-12 h-10 rounded-xl text-xs font-black border ${floor === lv ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                ชั้น {lv}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Status ── */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto text-xs font-bold bg-slate-900/80 text-white rounded-xl px-3 py-2">{msg}</div>
        <div className="pointer-events-auto flex gap-2">
          <button onClick={() => { if (mode === "indoor") exitIndoor(); setGoal(OVERVIEW); setFollow(false); }}
            className="text-xs font-bold bg-white rounded-xl border border-slate-200 px-3 py-2 shadow">มุมมองรวม</button>
          <span className="text-[10px] text-slate-400 self-end">{source === "supabase" ? "● Supabase" : "● ข้อมูลตั้งต้น"}</span>
        </div>
      </div>
    </div>
  );
}