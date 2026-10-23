"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSchoolMapData } from "./useSchoolMapData";
import { findPath, indoorRoute } from "./pathfinding";
import { MapLocation, MapRoom, XZ, floorH, hasInterior, roomCenter } from "./schoolData";
import { BuildingModel, IndoorBuilding, TYPE_LABEL } from "./BuildingModel";
import { Decor, Field, ParkingLot } from "./SceneDecor";
import { PickFn, buildGates, layoutWarnings, navFromRoads, pickState, withGateNodes, withRoadNodes } from "./DecorData";
import AdminPanel, { AdminFocus, DEFAULT_SETTINGS, MapSettings } from "./AdminPanel";

type Dest = { type: "loc" | "room" | "gate"; id: string } | null;
type Goal = { pos: THREE.Vector3; target: THREE.Vector3 } | null;
type StartPt = { id: string; label: string; entrance: XZ };

const OVERVIEW: Goal = { pos: new THREE.Vector3(-2, 22, 18), target: new THREE.Vector3(-2, 0, 0.5) };

function focusGoal(loc: MapLocation, level: number): Goal {
  const y = (level - 1) * floorH(loc);
  const s = Math.max(loc.size[0], loc.size[1]);
  const t = new THREE.Vector3(loc.pos[0], y, loc.pos[1]);
  return { target: t, pos: new THREE.Vector3(loc.pos[0], y + s * 0.9 + 4, loc.pos[1] + s * 0.55 + 3) };
}

/* ───────────────────────── Robot (นักเรียน) / Camera ───────────────────────── */

const SHIRT = "#ffffff", PANTS = "#1e2a4a", SKIN = "#f1c27d", TIE = "#dc2626";

function Robot({
  route, running, groupRef, home, onDone, speed = 3.2,
}: {
  route: THREE.Vector3[]; running: boolean; groupRef: React.RefObject<THREE.Group>;
  home: THREE.Vector3; onDone: () => void; speed?: number;
}) {
  const idx = useRef(0);
  const finished = useRef(false);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
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
    if (armL.current) armL.current.rotation.x = -swing * 0.8;
    if (armR.current) armR.current.rotation.x = swing * 0.8;
  });

  const Leg = ({ x, r }: { x: number; r: React.RefObject<THREE.Group | null> }) => (
    <group ref={r} position={[x, 0.6, 0]}>
      <mesh position={[0, -0.17, 0]} castShadow><boxGeometry args={[0.2, 0.34, 0.22]} /><meshStandardMaterial color={PANTS} /></mesh>
      <mesh position={[0, -0.41, 0]}><boxGeometry args={[0.16, 0.14, 0.18]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, -0.52, 0.04]}><boxGeometry args={[0.19, 0.08, 0.3]} /><meshStandardMaterial color="#111827" /></mesh>
    </group>
  );
  const Arm = ({ x, r }: { x: number; r: React.RefObject<THREE.Group | null> }) => (
    <group ref={r} position={[x, 1.2, 0]}>
      <mesh position={[0, -0.12, 0]}><boxGeometry args={[0.16, 0.26, 0.2]} /><meshStandardMaterial color={SHIRT} /></mesh>
      <mesh position={[0, -0.34, 0]}><boxGeometry args={[0.11, 0.2, 0.13]} /><meshStandardMaterial color={SKIN} /></mesh>
    </group>
  );

  return (
    <group ref={groupRef} scale={0.55}>
      <group ref={body}>
        <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[0.6, 0.7, 0.4]} /><meshStandardMaterial color={SHIRT} /></mesh>
        <mesh position={[-0.1, 1.24, 0.19]} rotation={[0, 0, 0.6]}><boxGeometry args={[0.16, 0.05, 0.06]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
        <mesh position={[0.1, 1.24, 0.19]} rotation={[0, 0, -0.6]}><boxGeometry args={[0.16, 0.05, 0.06]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
        <mesh position={[0, 1.0, 0.205]}><boxGeometry args={[0.09, 0.34, 0.02]} /><meshStandardMaterial color={TIE} /></mesh>
        <mesh position={[0.18, 1.0, 0.205]}><boxGeometry args={[0.14, 0.08, 0.01]} /><meshStandardMaterial color="#2563eb" /></mesh>
        <mesh position={[0, 0.58, 0]}><boxGeometry args={[0.62, 0.12, 0.42]} /><meshStandardMaterial color={PANTS} /></mesh>
        <mesh position={[0, 0.98, -0.3]} castShadow><boxGeometry args={[0.46, 0.56, 0.2]} /><meshStandardMaterial color="#1d4ed8" /></mesh>
        <mesh position={[0, 1.2, -0.3]}><boxGeometry args={[0.48, 0.1, 0.22]} /><meshStandardMaterial color="#1e40af" /></mesh>
        <mesh position={[0, 1.55, 0]} castShadow><sphereGeometry args={[0.32, 20, 20]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        <mesh position={[-0.12, 1.6, 0.27]}><sphereGeometry args={[0.06, 10, 10]} /><meshBasicMaterial color="#0f172a" /></mesh>
        <mesh position={[0.12, 1.6, 0.27]}><sphereGeometry args={[0.06, 10, 10]} /><meshBasicMaterial color="#0f172a" /></mesh>
        <mesh position={[0, 1.95, 0]}><cylinderGeometry args={[0.02, 0.02, 0.2]} /><meshStandardMaterial color="#334155" /></mesh>
        <mesh position={[0, 2.08, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.6} /></mesh>
        <Arm x={-0.38} r={armL} /><Arm x={0.38} r={armR} />
        <Leg x={-0.16} r={legL} /><Leg x={0.16} r={legR} />
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

/** จุดปลายทางกะพริบ — ให้เห็นง่ายว่าจะไปที่ไหน */
function Beacon({ at }: { at: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.scale.setScalar(1 + Math.sin(t * 4) * 0.25);
    ref.current.position.y = at.y + 0.9 + Math.sin(t * 3) * 0.12;
  });
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, at.y + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.5, 32]} /><meshBasicMaterial color="#f43f5e" transparent opacity={0.9} depthTest={false} />
      </mesh>
      <group ref={ref}>
        <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.2, 0.45, 12]} /><meshBasicMaterial color="#f43f5e" depthTest={false} /></mesh>
      </group>
    </group>
  );
}

/* ───────────────────────── UI helpers ───────────────────────── */

const glass = "bg-white/80 backdrop-blur-xl border border-white/70 shadow-[0_8px_30px_rgba(15,23,42,0.14)]";

function Stat({ label, value, unit, tone }: { label: string; value: number | string; unit: string; tone: string }) {
  return (
    <div className={`${glass} rounded-2xl px-3.5 py-2 min-w-[7.2rem]`}>
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className={`text-xl font-black leading-tight ${tone}`}>{value}<span className="text-[10px] font-bold text-slate-400 ml-1">{unit}</span></p>
    </div>
  );
}

/* ───────────────────────── Main component ───────────────────────── */

export default function SchoolMap3D({ isAdmin = false }: { isAdmin?: boolean }) {
  const { locs, rooms, nodes, edges, source, decor, api } = useSchoolMapData();
  const locById = useMemo(() => new Map(locs.map((l) => [l.id, l])), [locs]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const guardHouse = useMemo(() => locs.find((l) => l.kind === "gate") ?? locs[0], [locs]);
  const gates = useMemo(() => buildGates(decor.gates), [decor.gates]);
  // เส้นทางเดิน: ถนนเทา/ฟุตบาทที่ตั้งค่า + ประตูทุกบาน
  // decor.noLegacy = ลบถนนเทาเดิมถาวร → ไม่ใช้ nodes/edges เดิมเลย ใช้เฉพาะถนนที่แอดมินสร้างเอง
  const nav = useMemo(() => {
    if (decor.noLegacy) {
      const g = navFromRoads(decor.roads ?? [], gates);
      return withGateNodes(g.nodes, g.edges, gates);
    }
    const r = withRoadNodes(nodes, edges, decor.roads ?? []);
    return withGateNodes(r.nodes, r.edges, gates);
  }, [nodes, edges, decor.roads, decor.noLegacy, gates]);
  // กราฟที่ใช้ "วาด": โหมดลบถนนเดิม = วาดเฉพาะเส้นของถนนที่สร้างเอง (ไม่วาดเส้นต่อประตู/เส้นต่อเชื่อมที่ระบบสร้าง)
  const drawGraph = useMemo(
    () => (decor.noLegacy ? withRoadNodes([], [], decor.roads ?? []) : nav),
    [decor.noLegacy, decor.roads, nav],
  );

  // จุดเริ่มต้น: ประตูทุกบาน + สถานที่ทุกแห่ง (เริ่มต้นที่ประตู 2)
  const startPoints = useMemo<StartPt[]>(() => [
    ...gates.map((g) => ({ id: `gate:${g.id}`, label: `🚪 ${g.name}`, entrance: [g.x, g.z] as XZ })),
    ...locs.map((l) => ({ id: l.id, label: `${l.code}. ${l.name}`, entrance: l.entrance })),
  ], [locs, gates]);
  const [fromId, setFromId] = useState("gate:g2");
  const fromPt = startPoints.find((p) => p.id === fromId) ?? startPoints[0];

  const [mode, setMode] = useState<"outdoor" | "indoor">("outdoor");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [floor, setFloor] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dest, setDest] = useState<Dest>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [route, setRoute] = useState<THREE.Vector3[]>([]);
  const [running, setRunning] = useState(false);
  const [follow, setFollow] = useState(false);
  const [goal, setGoal] = useState<Goal>(OVERVIEW);
  const [msg, setMsg] = useState("เลือกสถานที่ปลายทางเพื่อเริ่มนำทาง");
  const [showAdmin, setShowAdmin] = useState(false);
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [adminFocus, setAdminFocus] = useState<AdminFocus>(null);
  pickState.placing = !!placingId;

  useEffect(() => {
    try { const s = localStorage.getItem("wkk-map-settings"); if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) }); } catch { /* ignore */ }
  }, []);
  const changeSettings = (s: MapSettings) => {
    setSettings(s);
    try { localStorage.setItem("wkk-map-settings", JSON.stringify(s)); } catch { /* ignore */ }
  };

  const warnings = useMemo(() => layoutWarnings(locs), [locs]);
  useEffect(() => { if (warnings.length) console.warn("[map3d] ตรวจผัง:", warnings); }, [warnings]);

  const robotRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const stageRef = useRef<"outdoor" | "indoor" | null>(null);
  const pendingRef = useRef<Dest>(null);

  const home = useMemo(() => new THREE.Vector3(fromPt?.entrance?.[0] ?? 0, 0.12, fromPt?.entrance?.[1] ?? 0), [fromPt]);
  const activeLoc = activeId ? locById.get(activeId) : undefined;
  const selectedRoom = selectedRoomId ? roomById.get(selectedRoomId) : undefined;

  const notifyParent = (event: string, payload: any = {}) => {
    try { window.parent?.postMessage({ type: "wkk-map", event, ...payload }, "*"); } catch { /* ignore */ }
  };

  /** แอดมินกดวัตถุ → เปิดแผงตั้งค่าไปที่ชิ้นนั้นทันที */
  const openAdmin = useCallback((ref: { kind: NonNullable<AdminFocus>["kind"]; id: string }) => {
    if (!isAdmin) return;
    setShowAdmin(true);
    setAdminFocus({ ...ref, n: Date.now() });
  }, [isAdmin]);

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
    if (d.type === "gate") {
      const g = gates.find((x) => x.id === d.id);
      stageRef.current = null; setFollow(false);
      setMsg(`ถึง${g?.name ?? "ประตู"}แล้ว`);
      notifyParent("arrived", { gate: d.id });
      return;
    }
    const room = d.type === "room" ? roomById.get(d.id) : undefined;
    const loc = d.type === "room" ? (room ? locById.get(room.location_id) : undefined) : locById.get(d.id);
    if (!loc) return;
    if (room) {
      enterIndoor(loc, room.level);
      setRoute(indoorRoute(loc, room));
      stageRef.current = "indoor";
      setRunning(true);
      setMsg(`เข้าอาคารแล้ว กำลังพาไป ${room.name} (ชั้น ${room.level})`);
    } else if (hasInterior(loc) && loc.floors > 0) {
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
  }, [roomById, locById, enterIndoor, gates]);

  const startOutdoorNav = useCallback((d: Dest) => {
    if (!d || !fromPt) return;
    let target: { id: string; entrance: XZ; name: string; code?: string } | null = null;
    let room: MapRoom | undefined;
    if (d.type === "gate") {
      const g = gates.find((x) => x.id === d.id);
      if (g) target = { id: `gate:${g.id}`, entrance: [g.x, g.z], name: g.name };
    } else {
      room = d.type === "room" ? roomById.get(d.id) : undefined;
      const loc = d.type === "room" ? (room ? locById.get(room.location_id) : undefined) : locById.get(d.id);
      if (loc) target = { id: loc.id, entrance: loc.entrance, name: loc.name, code: loc.code };
    }
    if (!target) return;
    pendingRef.current = d;
    setSelectedId(null); setSelectedRoomId(null); setMode("outdoor"); setActiveId(null);
    if (fromPt.id === target.id) {
      stageRef.current = "outdoor";
      setRoute([new THREE.Vector3(target.entrance[0], 0.12, target.entrance[1])]);
      setTimeout(() => finishOutdoor(d), 0);
      return;
    }
    const xz = findPath(nav.nodes, nav.edges, fromPt.entrance, target.entrance);
    const pts: THREE.Vector3[] = [];
    xz.forEach(([x, z]) => {
      const v = new THREE.Vector3(x, 0.12, z);
      if (!pts.length || pts[pts.length - 1].distanceTo(v) > 0.01) pts.push(v);
    });
    stageRef.current = "outdoor";
    setRoute(pts); setRunning(true); setFollow(settings.autoFollow); setGoal(null);
    setMsg(`กำลังนำทางไป ${room ? room.name + " · " : ""}${target.name}`);
    notifyParent("navigate-start", { to: target.code, room: room?.code });
  }, [fromPt, locById, roomById, nav, finishOutdoor, settings.autoFollow, gates]);

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
    gates.forEach((g) => {
      if (!q || g.name.includes(q) || "ประตู".includes(q))
        items.push({ d: { type: "gate", id: g.id }, label: `🚪 ${g.name}`, sub: "ประตูโรงเรียน (ทางเข้า/ออก)" });
    });
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
  }, [query, locs, rooms, locById, gates]);

  const destLabel = dest
    ? dest.type === "loc" ? locById.get(dest.id)?.name
      : dest.type === "gate" ? gates.find((g) => g.id === dest.id)?.name
      : roomById.get(dest.id)?.name
    : null;
  const selectedLoc = selectedId ? locById.get(selectedId) : undefined;

  const pickOutdoor = (id: string) => {
    if (mode !== "outdoor") return;
    setSelectedId(id); setGoal(focusGoal(locById.get(id)!, 1)); setFollow(false);
    openAdmin({ kind: "loc", id });
  };

  /** กดวัตถุ/ซุ้ม/ถนน/ประตู → เลื่อนกล้องไปดู + (แอดมิน) เปิดตั้งค่าของชิ้นนั้น */
  const onDecorPick: PickFn = useCallback((x, z, label, ref) => {
    const t = new THREE.Vector3(x, 0, z);
    setGoal({ target: t, pos: new THREE.Vector3(x, 5.5, z + 6.5) });
    setFollow(false);
    setSelectedId(null);
    setMsg(`📍 ${label}`);
    if (ref) openAdmin(ref);
  }, [openAdmin]);

  /** กดพื้นตรงไหนก็ได้ → เลื่อนกล้องไปดูจุดนั้น / ถ้ากำลังวางตำแหน่ง → วางวัตถุตรงนั้น */
  const onGround = useCallback((wx: number, wz: number) => {
    if (!placingId) {
      setGoal({ target: new THREE.Vector3(wx, 0, wz), pos: new THREE.Vector3(wx, 6, wz + 7) });
      setFollow(false);
      return;
    }
    const rx = Math.round(wx * 100) / 100, rz = Math.round(wz * 100) / 100;
    const px_ = Math.round((wx * 30 + 480) * 10) / 10, py_ = Math.round((wz * 30 + 400) * 10) / 10;
    if (placingId.startsWith("fur:")) return;   // วางของในห้องทำที่พื้นห้อง
    if (placingId.startsWith("loc:")) {
      const id = placingId.slice(4);
      const l = locs.find((x) => x.id === id);
      if (l) api.updateLocation(id, { pos: [rx, rz], entrance: [l.entrance[0] + (rx - l.pos[0]), l.entrance[1] + (rz - l.pos[1])] });
      setPlacingId(null);
      return;
    }
    if (placingId.startsWith("pt:")) {
      const [, rid, idx] = placingId.split(":");
      api.setDecor((d) => ({
        ...d,
        roads: (d.roads ?? []).map((r) => (r.id === rid ? { ...r, pts: r.pts.map((p, i) => (i === Number(idx) ? [px_, py_] as [number, number] : p)) } : r)),
      }));
      setPlacingId(null);
      return;
    }
    api.setDecor((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === placingId ? { ...i, x: px_, y: py_ } : i)),
      gates: d.gates.map((g) => (g.id === placingId ? { ...g, x: px_, y: py_ } : g)),
    }));
    setPlacingId(null);
  }, [placingId, api, locs]);

  /** โหมดสร้างห้อง: คลิกพื้นห้องเพื่อวางของตกแต่ง (พิกัดภายในห้อง) */
  const onPlaceLocal = useCallback((roomId: string, lx: number, lz: number) => {
    if (!placingId?.startsWith(`fur:${roomId}:`)) return;
    const idx = Number(placingId.split(":")[2]);
    const room = roomById.get(roomId);
    if (!room) return;
    const arr = [...(room.furniture ?? [])];
    if (!arr[idx]) return;
    arr[idx] = { ...arr[idx], x: Math.round(lx * 100) / 100, z: Math.round(lz * 100) / 100 };
    api.previewRoom(roomId, { furniture: arr });
    setPlacingId(null);
  }, [placingId, roomById, api]);

  const stats = useMemo(() => {
    const cls = rooms.filter((r) => (r.type ?? "classroom") === "classroom");
    return {
      buildings: locs.filter((l) => l.kind === "building").length,
      rooms: rooms.length,
      desks: cls.reduce((s, r) => s + (r.desks ?? 30), 0),
    };
  }, [locs, rooms]);

  const routePts = useMemo(() => route.map((p) => [p.x, p.y + 0.1, p.z] as [number, number, number]), [route]);

  return (
    <div className="relative w-full h-full min-h-[480px] bg-sky-100 overflow-hidden font-sans">
      <Canvas shadows={settings.shadows} camera={{ position: [-2, 22, 18], fov: 45 }} dpr={settings.hiQuality ? [1, 2] : [1, 1]}
        onPointerMissed={() => { if (!placingId) { setSelectedId(null); setSelectedRoomId(null); } }}>
        <color attach="background" args={["#cfe8ff"]} />
        <fog attach="fog" args={["#cfe8ff", 45, 130]} />
        <hemisphereLight args={["#ffffff", "#7a9a5a", 0.7]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[12, 26, 14]} intensity={1.15} castShadow={settings.shadows}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-26} shadow-camera-right={26}
          shadow-camera-top={26} shadow-camera-bottom={-26}
          shadow-camera-near={1} shadow-camera-far={90}
        />

        <Decor decor={decor} gates={gates} nodes={drawGraph.nodes} edges={drawGraph.edges} gate={guardHouse}
          robotRef={robotRef as any} indoor={mode === "indoor"} onGround={onGround} onPick={onDecorPick} />

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
            placingFurn={!!placingId?.startsWith("fur:")} onPlaceLocal={onPlaceLocal}
            onRoom={(r) => { setSelectedRoomId(r.id); openAdmin({ kind: "room", id: r.id }); }}
          />
        )}

        {/* เส้นนำทาง: ขอบขาวหนา + เส้นแดงทึบ ลอยเหนือทุกอย่างเพื่อให้มองเห็นง่าย */}
        {route.length > 1 && (
          <>
            <Line points={routePts} color="#ffffff" lineWidth={10} depthTest={false} transparent opacity={0.95} renderOrder={998} />
            <Line points={routePts} color="#f43f5e" lineWidth={5.5} depthTest={false} renderOrder={999} />
            {dest && <Beacon at={route[route.length - 1]} />}
          </>
        )}
        <Robot route={route} running={running} groupRef={robotRef as any} home={home} onDone={onRobotDone} speed={settings.robotSpeed} />
        <OrbitControls ref={controlsRef} makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={1.5} maxDistance={60}
          onStart={() => { setFollow(false); setGoal(null); }} />
        <CameraRig goal={goal} follow={follow} robotRef={robotRef as any} controlsRef={controlsRef} />
      </Canvas>

      {/* ── หัวแผนที่ ── */}
      <div className={`${glass} absolute top-3 left-3 rounded-2xl pl-2.5 pr-4 py-2 flex items-center gap-2.5`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 grid place-items-center text-lg">🏫</div>
        <div>
          <p className="text-sm font-black text-slate-800 leading-tight">โรงเรียนวัดเขียนเขต</p>
          <p className="text-[10px] font-bold text-slate-400">แผนผัง 3 มิติ · {source === "supabase" ? "ข้อมูลจริง" : "ข้อมูลตั้งต้น"}</p>
        </div>
      </div>

      {mode === "outdoor" ? (
        <div className="hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 gap-2">
          <Stat label="อาคารเรียน" value={stats.buildings} unit="หลัง" tone="text-blue-700" />
          <Stat label="ห้องทั้งหมด" value={stats.rooms} unit="ห้อง" tone="text-indigo-700" />
          <Stat label="โต๊ะนักเรียน" value={stats.desks} unit="ตัว" tone="text-emerald-600" />
          <Stat label="ประตูเข้า-ออก" value={gates.length} unit="บาน" tone="text-rose-600" />
        </div>
      ) : activeLoc && (
        <div className={`${glass} absolute top-3 left-1/2 -translate-x-1/2 rounded-2xl flex items-center gap-3 px-3 py-2`}>
          <button onClick={exitIndoor} className="text-xs font-extrabold text-rose-600">← ออกจากอาคาร</button>
          <span className="text-xs font-black text-slate-700 hidden sm:inline">{activeLoc.name}</span>
        </div>
      )}

      <div className="absolute top-3 right-3 flex gap-2">
        <button onClick={() => { if (mode === "indoor") exitIndoor(); setGoal(OVERVIEW); setFollow(false); }}
          className={`${glass} text-xs font-bold text-slate-700 rounded-xl px-3 py-2`}>มุมมองรวม</button>
        <button onClick={() => { setFollow((v) => !v); setGoal(null); }}
          className={`${glass} text-xs font-bold rounded-xl px-3 py-2 ${follow ? "text-emerald-700 !bg-emerald-50" : "text-slate-700"}`}>ตามนักเรียน</button>
        {isAdmin && (
          <button onClick={() => setShowAdmin((v) => !v)}
            className={`text-xs font-extrabold rounded-xl px-3 py-2 shadow ${showAdmin ? "bg-slate-800 text-white" : "bg-blue-600 text-white"}`}>⚙ ตั้งค่า</button>
        )}
      </div>

      {mode === "indoor" && activeLoc && (
        <div className={`${glass} absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 rounded-2xl p-1.5`}>
          {Array.from({ length: Math.max(activeLoc.floors, 1) }, (_, i) => Math.max(activeLoc.floors, 1) - i).map((lv) => (
            <button key={lv} onClick={() => { setFloor(lv); setSelectedRoomId(null); setGoal(focusGoal(activeLoc, lv)); setFollow(false); }}
              className={`w-12 h-10 rounded-xl text-xs font-black ${floor === lv ? "bg-blue-600 text-white shadow" : "text-slate-600 hover:bg-white"}`}>
              ชั้น {lv}
            </button>
          ))}
        </div>
      )}

      {selectedLoc && mode === "outdoor" && (
        <div className={`${glass} absolute bottom-28 right-3 w-[19rem] max-w-[calc(100%-1.5rem)] rounded-2xl p-3 space-y-2`}>
          <p className="text-sm font-black text-slate-800">{selectedLoc.code}. {selectedLoc.name}</p>
          {hasInterior(selectedLoc) && (
            <p className="text-[11px] text-slate-500">{selectedLoc.floors} ชั้น · {rooms.filter((r) => r.location_id === selectedLoc.id).length} ห้อง</p>
          )}
          {selectedLoc.kind === "dome" && <p className="text-[11px] text-slate-500">โดมกีฬา · พื้นสนามอเนกประสงค์</p>}
          <div className="flex gap-2">
            <button onClick={() => goTo({ type: "loc", id: selectedLoc.id })}
              className="flex-1 text-xs font-extrabold rounded-xl bg-blue-600 text-white py-2">🚶 นำทางไปที่นี่</button>
            {hasInterior(selectedLoc) && (
              <button onClick={() => enterIndoor(selectedLoc, 1)}
                className="flex-1 text-xs font-extrabold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 py-2">🏢 ดูภายในอาคาร</button>
            )}
          </div>
        </div>
      )}

      {mode === "indoor" && activeLoc && selectedRoom && (
        <div className={`${glass} absolute bottom-28 right-3 w-[19rem] max-w-[calc(100%-1.5rem)] rounded-2xl p-3 space-y-2`}>
          <p className="text-sm font-black text-slate-800">{selectedRoom.name} <span className="text-xs font-bold text-slate-400">ชั้น {selectedRoom.level}</span></p>
          <p className="text-[11px] text-slate-500">
            {TYPE_LABEL[selectedRoom.type ?? "classroom"] ?? "ห้อง"}
            {(selectedRoom.type ?? "classroom") === "classroom" ? ` · โต๊ะนักเรียน ${selectedRoom.desks ?? 30} ตัว` : ""}
            {selectedRoom.students ? ` · นักเรียน ${selectedRoom.students} คน` : ""}
          </p>
          <div className="flex gap-2">
            <button onClick={() => goTo({ type: "room", id: selectedRoom.id })}
              className="flex-1 text-xs font-extrabold rounded-xl bg-blue-600 text-white py-2">🚶 พาไปห้องนี้</button>
            <button onClick={() => zoomRoom(activeLoc, selectedRoom)}
              className="flex-1 text-xs font-extrabold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 py-2">🔍 ซูมดูห้อง</button>
          </div>
        </div>
      )}

      {isAdmin && showAdmin && (
        <AdminPanel locs={locs} rooms={rooms} source={source} warnings={warnings}
          settings={settings} onSettings={changeSettings} api={api} onClose={() => { setShowAdmin(false); setPlacingId(null); }}
          decor={decor} placingId={placingId} onPlace={setPlacingId} focus={adminFocus} />
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(46rem,calc(100%-1.5rem))] space-y-2">
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[11px] font-bold bg-slate-900/80 text-white rounded-xl px-3 py-1.5 truncate">{msg}</span>
          {destLabel && (
            <span className="text-[11px] font-bold bg-white/90 text-slate-700 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shrink-0">
              🎯 {destLabel}
              <button onClick={() => setDest(null)} className="text-slate-400" aria-label="ล้างปลายทาง">✕</button>
            </span>
          )}
        </div>
        <div className={`${glass} relative rounded-2xl p-2 flex flex-wrap sm:flex-nowrap items-center gap-2`}>
          <select value={fromPt?.id ?? ""} onChange={(e) => { setFromId(e.target.value); setRoute([]); setRunning(false); }}
            className="w-full sm:w-44 text-xs font-bold rounded-xl border border-slate-200 bg-white px-2 py-2" aria-label="จุดเริ่มต้น">
            {startPoints.map((p) => <option key={p.id} value={p.id}>จาก: {p.label}</option>)}
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="ไปที่… เช่น ประตู 3, อาคาร 3, ห้อง 3-101"
            className="flex-1 min-w-[10rem] text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-400" />
          <button disabled={!dest || running} onClick={() => goTo(dest)}
            className="text-xs font-extrabold rounded-xl bg-blue-600 text-white px-4 py-2 disabled:opacity-40">🚶 นำทาง</button>
          {(focused || query) && (
            <div className={`${glass} absolute bottom-full mb-2 left-2 right-2 max-h-60 overflow-y-auto rounded-2xl divide-y divide-slate-100`}>
              {results.length === 0 && <p className="text-xs text-slate-400 p-3">ไม่พบสถานที่</p>}
              {results.map((r, i) => (
                <button key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => { setDest(r.d); setQuery(""); }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50/70">
                  <span className="block text-xs font-bold text-slate-700 truncate">{r.label}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}