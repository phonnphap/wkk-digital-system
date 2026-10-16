"use client";

import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MapEdge, MapLocation, MapNode, px } from "./schoolData";
import {
  FENCE, FLAG_PX, GATE_GAP_CENTER, GATE_GAP_RADIUS, PAVILIONS_PX, POND, TREES_PX,
} from "./DecorData";

/* ───────────── helpers ───────────── */

export type Item = {
  p: [number, number, number];
  s?: number | [number, number, number];
  r?: number;
  c?: string;
};

/** วาดวัตถุซ้ำจำนวนมากด้วย InstancedMesh (เบาเครื่อง) */
export function Inst({ items, children, cast = false }: { items: Item[]; children: React.ReactNode; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      d.position.set(it.p[0], it.p[1], it.p[2]);
      d.rotation.set(0, it.r ?? 0, 0);
      const s = it.s ?? 1;
      if (typeof s === "number") d.scale.setScalar(s);
      else d.scale.set(s[0], s[1], s[2]);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      if (it.c) m.setColorAt(i, col.set(it.c));
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[undefined as any, undefined as any, Math.max(items.length, 1)]}
      castShadow={cast}
      frustumCulled={false}
    >
      {children}
    </instancedMesh>
  );
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function PinLabel({ code, y, onClick }: { code: string; y: number; onClick: () => void }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={18} zIndexRange={[20, 0]}>
      <button onClick={onClick}
        className="w-7 h-7 rounded-full bg-rose-600 text-white text-xs font-black border-2 border-white shadow-lg">
        {code}
      </button>
    </Html>
  );
}

/* ───────────── พื้น / ถนน / รั้ว ───────────── */

export function Ground() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    FENCE.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    return s;
  }, []);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2, -0.06, 0.5]} receiveShadow>
        <planeGeometry args={[120, 90]} />
        <meshStandardMaterial color="#b0bec5" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#8bc34a" />
      </mesh>
    </>
  );
}

export function Roads({ nodes, edges }: { nodes: MapNode[]; edges: MapEdge[] }) {
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  return (
    <>
      {edges.map((e, i) => {
        const a = pos.get(e.a), b = pos.get(e.b);
        if (!a || !b) return null;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ang = -Math.atan2(b.z - a.z, b.x - a.x);
        return (
          <mesh key={i} position={[(a.x + b.x) / 2, 0.01, (a.z + b.z) / 2]} rotation={[0, ang, 0]} receiveShadow>
            <boxGeometry args={[len + 0.6, 0.02, 1.1]} />
            <meshStandardMaterial color="#adb5bd" />
          </mesh>
        );
      })}
    </>
  );
}

export function Fence() {
  const parts = useMemo(() => {
    const bars: Item[] = [], rails: Item[] = [], pillars: Item[] = [];
    const nearGap = (x: number, z: number) =>
      Math.hypot(x - GATE_GAP_CENTER[0], z - GATE_GAP_CENTER[1]) < GATE_GAP_RADIUS;
    for (let i = 0; i < FENCE.length; i++) {
      const a = FENCE[i], b = FENCE[(i + 1) % FENCE.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      const n = Math.max(1, Math.round(len / 1.4));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
        const mx = a[0] + (b[0] - a[0]) * tm, mz = a[1] + (b[1] - a[1]) * tm;
        if (nearGap(mx, mz)) continue;
        const segLen = len / n;
        rails.push({ p: [mx, 0.5, mz], s: [segLen, 1, 1], r: ang });
        rails.push({ p: [mx, 0.2, mz], s: [segLen, 1, 1], r: ang });
        const bn = Math.floor(segLen / 0.16);
        for (let j = 1; j < bn; j++) {
          const t = t0 + ((t1 - t0) * j) / bn;
          bars.push({ p: [a[0] + (b[0] - a[0]) * t, 0.35, a[1] + (b[1] - a[1]) * t] });
        }
      }
      const pn = Math.max(1, Math.round(len / 2.8));
      for (let k = 0; k <= pn; k++) {
        const t = k / pn;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        if (!nearGap(x, z)) pillars.push({ p: [x, 0.36, z] });
      }
    }
    return { bars, rails, pillars };
  }, []);
  return (
    <>
      <Inst items={parts.bars}>
        <cylinderGeometry args={[0.012, 0.012, 0.42, 5]} />
        <meshStandardMaterial color="#343a40" />
      </Inst>
      <Inst items={parts.rails}>
        <boxGeometry args={[1, 0.035, 0.035]} />
        <meshStandardMaterial color="#212529" />
      </Inst>
      <Inst items={parts.pillars} cast>
        <boxGeometry args={[0.1, 0.72, 0.1]} />
        <meshStandardMaterial color="#adb5bd" />
      </Inst>
    </>
  );
}

/* ───────────── ต้นไม้ / ศาลา / สระ / เสาธง ───────────── */

export function Trees() {
  const { trunks, crowns } = useMemo(() => {
    const r = rng(7);
    const trunks: Item[] = [], crowns: Item[] = [];
    const greens = ["#2e7d32", "#388e3c", "#43a047", "#558b2f", "#33691e"];
    TREES_PX.forEach(([x, y, s]) => {
      const [wx, wz] = px(x, y);
      const sc = s * (0.85 + r() * 0.3);
      trunks.push({ p: [wx, 0.2 * sc, wz], s: sc });
      crowns.push({ p: [wx, 0.62 * sc, wz], s: sc * (0.9 + r() * 0.25), c: greens[Math.floor(r() * greens.length)] });
    });
    return { trunks, crowns };
  }, []);
  return (
    <>
      <Inst items={trunks}>
        <cylinderGeometry args={[0.035, 0.05, 0.4, 6]} />
        <meshStandardMaterial color="#6d4c41" />
      </Inst>
      <Inst items={crowns} cast>
        <icosahedronGeometry args={[0.3, 1]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </Inst>
    </>
  );
}

export function Pavilions() {
  return (
    <>
      {PAVILIONS_PX.map(([x, y, roof], i) => {
        const [wx, wz] = px(x, y);
        return (
          <group key={i} position={[wx, 0, wz]}>
            <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[0.72, 0.04, 0.72]} /><meshStandardMaterial color="#dee2e6" /></mesh>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
              <mesh key={k} position={[sx * 0.29, 0.28, sz * 0.29]}><cylinderGeometry args={[0.025, 0.025, 0.52, 6]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
            ))}
            <mesh position={[0, 0.68, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[0.62, 0.3, 4]} /><meshStandardMaterial color={roof} />
            </mesh>
            <mesh position={[0, 0.14, 0]}><boxGeometry args={[0.4, 0.04, 0.14]} /><meshStandardMaterial color="#a1887f" /></mesh>
          </group>
        );
      })}
    </>
  );
}

export function Pond() {
  const [x, z] = px(POND.cx, POND.cy);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.015, 0]}><boxGeometry args={[POND.w / 30 + 0.12, 0.03, POND.h / 30 + 0.12]} /><meshStandardMaterial color="#cfd8dc" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <planeGeometry args={[POND.w / 30, POND.h / 30]} />
        <meshStandardMaterial color="#4fc3f7" roughness={0.15} metalness={0.2} />
      </mesh>
    </group>
  );
}

export function Flagpole() {
  const [x, z] = px(FLAG_PX[0], FLAG_PX[1]);
  const flag = useRef<THREE.Group>(null);
  useFrame((s) => { if (flag.current) flag.current.rotation.y = Math.sin(s.clock.elapsedTime * 2) * 0.25; });
  const stripes: [string, number, number][] = [["#d32f2f", 0, 1], ["#ffffff", 1, 1], ["#1d3a8a", 2, 2], ["#ffffff", 4, 1], ["#d32f2f", 5, 1]];
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.18, 0.2, 0.06, 12]} /><meshStandardMaterial color="#ced4da" /></mesh>
      <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.015, 0.02, 2.4, 6]} /><meshStandardMaterial color="#f1f3f5" /></mesh>
      <mesh position={[0, 2.42, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#fbbf24" /></mesh>
      <group ref={flag} position={[0, 2.2, 0]}>
        {stripes.map(([c, off, h], i) => (
          <mesh key={i} position={[0.26, -0.03 * off - 0.015 * h, 0]}>
            <boxGeometry args={[0.5, 0.03 * h, 0.01]} /><meshStandardMaterial color={c} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ───────────── ลานจอดรถ ───────────── */

export function ParkingLot({ loc, dim, onPick }: { loc: MapLocation; dim: boolean; onPick: (id: string) => void }) {
  const [w, d] = loc.size;
  const data = useMemo(() => {
    const r = rng(42);
    const stallW = 0.5, stallL = 0.78;
    const cols = Math.max(1, Math.floor((w - 0.4) / stallW));
    const x0 = -(cols * stallW) / 2;
    const rowZ = [-1.4, -0.6, 0.6, 1.4].filter((z) => Math.abs(z) + stallL / 2 < d / 2);
    const lines: Item[] = [], bodies: Item[] = [], cabins: Item[] = [];
    const palette = ["#e63946", "#f1faee", "#457b9d", "#1d3557", "#ffb703", "#2a9d8f", "#868e96", "#212529", "#ffffff", "#9d4edd"];
    rowZ.forEach((z) => {
      for (let k = 0; k <= cols; k++) lines.push({ p: [x0 + k * stallW, 0.032, z], s: [0.02, 0.004, stallL] });
      for (let k = 0; k < cols; k++) {
        if (r() > 0.62) continue;
        const x = x0 + (k + 0.5) * stallW;
        const c = palette[Math.floor(r() * palette.length)];
        bodies.push({ p: [x, 0.1, z], s: [0.3, 0.1, 0.58], c });
        cabins.push({ p: [x, 0.19, z], s: [0.26, 0.09, 0.3], c: "#263238" });
      }
    });
    return { lines, bodies, cabins };
  }, [w, d]);
  return (
    <group position={[loc.pos[0], 0, loc.pos[1]]} onClick={(e) => { e.stopPropagation(); onPick(loc.id); }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#495057" transparent={dim} opacity={dim ? 0.3 : 1} />
      </mesh>
      {!dim && (
        <>
          <Inst items={data.lines}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#f8f9fa" /></Inst>
          <Inst items={data.bodies} cast><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
          <Inst items={data.cabins}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
          <PinLabel code={loc.code} y={0.9} onClick={() => onPick(loc.id)} />
        </>
      )}
    </group>
  );
}

/* ───────────── สนามฟุตซอล / สนามบาส ───────────── */

export function Field({ loc, dim, onPick }: { loc: MapLocation; dim: boolean; onPick: (id: string) => void }) {
  const basket = loc.name.includes("บาส");
  const [w, d] = loc.size;
  const L = Math.max(w, d), W = Math.min(w, d);
  const rot = w >= d ? 0 : Math.PI / 2;
  const line = (x: number, z: number, sx: number, sz: number, k: string) => (
    <mesh key={k} position={[x, 0.045, z]}><boxGeometry args={[sx, 0.008, sz]} /><meshStandardMaterial color="#ffffff" /></mesh>
  );
  const stripes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <group position={[loc.pos[0], 0, loc.pos[1]]} onClick={(e) => { e.stopPropagation(); onPick(loc.id); }}>
      <group rotation={[0, rot, 0]}>
        {!basket ? (
          <>
            {stripes.map((i) => (
              <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-L / 2 + (i + 0.5) * (L / 8), 0.03, 0]}>
                <planeGeometry args={[L / 8, W]} />
                <meshStandardMaterial color={i % 2 ? "#43a047" : "#4caf50"} transparent={dim} opacity={dim ? 0.3 : 1} />
              </mesh>
            ))}
            {line(0, -(W / 2 - 0.05), L - 0.1, 0.02, "t")}
            {line(0, W / 2 - 0.05, L - 0.1, 0.02, "b")}
            {line(-(L / 2 - 0.05), 0, 0.02, W - 0.1, "l")}
            {line(L / 2 - 0.05, 0, 0.02, W - 0.1, "r")}
            {line(0, 0, 0.02, W - 0.1, "c")}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.046, 0]}>
              <ringGeometry args={[W * 0.14, W * 0.14 + 0.02, 32]} /><meshStandardMaterial color="#ffffff" />
            </mesh>
            {!dim && [-1, 1].map((s) => (
              <mesh key={s} position={[s * (L / 2 - 0.02), 0.12, 0]}>
                <boxGeometry args={[0.04, 0.24, W * 0.24]} />
                <meshStandardMaterial color="#f8f9fa" wireframe />
              </mesh>
            ))}
          </>
        ) : (
          <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
              <planeGeometry args={[L, W]} /><meshStandardMaterial color="#0b7285" transparent={dim} opacity={dim ? 0.3 : 1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.036, 0]}>
              <planeGeometry args={[L * 0.86, W * 0.86]} /><meshStandardMaterial color="#e8590c" transparent={dim} opacity={dim ? 0.3 : 1} />
            </mesh>
            {line(0, 0, 0.02, W * 0.86, "c")}
            {line(0, -(W * 0.43), L * 0.86, 0.02, "t")}
            {line(0, W * 0.43, L * 0.86, 0.02, "b")}
            {line(-(L * 0.43), 0, 0.02, W * 0.86, "l")}
            {line(L * 0.43, 0, 0.02, W * 0.86, "r")}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.047, 0]}>
              <ringGeometry args={[W * 0.12, W * 0.12 + 0.02, 32]} /><meshStandardMaterial color="#ffffff" />
            </mesh>
            {!dim && [-1, 1].map((s) => (
              <group key={s} position={[s * (L * 0.46), 0, 0]}>
                <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.012, 0.012, 0.4, 6]} /><meshStandardMaterial color="#343a40" /></mesh>
                <mesh position={[-s * 0.03, 0.38, 0]}><boxGeometry args={[0.015, 0.14, 0.2]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
              </group>
            ))}
          </>
        )}
      </group>
      {!dim && <PinLabel code={loc.code} y={0.8} onClick={() => onPick(loc.id)} />}
    </group>
  );
}

/* ───────────── รปภ. + ไม้กั้น ───────────── */

export function Guard({ gate, robotRef }: { gate?: MapLocation; robotRef: React.RefObject<THREE.Group | null> }) {
  const arm = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Group>(null);
  const nearRef = useRef(false);
  const [near, setNear] = useState(false);
  const base = useMemo(
    () => (gate ? new THREE.Vector3(gate.pos[0] + 0.8, 0, gate.pos[1] - 0.15) : new THREE.Vector3()),
    [gate]
  );
  useFrame((s, dt) => {
    const r = robotRef.current;
    const dist = r ? r.position.distanceTo(base) : 99;
    const n = dist < 3.2;
    if (n !== nearRef.current) { nearRef.current = n; setNear(n); }
    const k = 1 - Math.pow(0.002, dt);
    const t = s.clock.elapsedTime;
    if (arm.current) arm.current.rotation.z = THREE.MathUtils.lerp(arm.current.rotation.z, n ? Math.PI * 0.85 + Math.sin(t * 9) * 0.3 : 0.08, k);
    if (body.current) body.current.position.y = Math.sin(t * 1.6) * 0.01;
    if (bar.current) bar.current.rotation.z = THREE.MathUtils.lerp(bar.current.rotation.z, n ? Math.PI / 2.1 : 0, k);
  });
  if (!gate) return null;
  const skin = "#f1c27d";
  return (
    <>
      <group position={[base.x, 0, base.z]} rotation={[0, -0.5, 0]} scale={0.5}>
        <group ref={body}>
          <mesh position={[-0.09, 0.22, 0]} castShadow><boxGeometry args={[0.13, 0.44, 0.15]} /><meshStandardMaterial color="#111827" /></mesh>
          <mesh position={[0.09, 0.22, 0]} castShadow><boxGeometry args={[0.13, 0.44, 0.15]} /><meshStandardMaterial color="#111827" /></mesh>
          <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[0.36, 0.5, 0.2]} /><meshStandardMaterial color="#60a5fa" /></mesh>
          <mesh position={[0, 0.47, 0]}><boxGeometry args={[0.38, 0.05, 0.22]} /><meshStandardMaterial color="#0f172a" /></mesh>
          <mesh position={[-0.23, 0.68, 0]}><boxGeometry args={[0.09, 0.42, 0.12]} /><meshStandardMaterial color="#60a5fa" /></mesh>
          <group ref={arm} position={[0.23, 0.92, 0]}>
            <mesh position={[0, -0.18, 0]}><boxGeometry args={[0.09, 0.42, 0.12]} /><meshStandardMaterial color="#60a5fa" /></mesh>
            <mesh position={[0, -0.42, 0]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
          </group>
          <mesh position={[0, 1.1, 0]} castShadow><sphereGeometry args={[0.15, 14, 14]} /><meshStandardMaterial color={skin} /></mesh>
          <mesh position={[0, 1.22, 0]}><cylinderGeometry args={[0.16, 0.17, 0.09, 14]} /><meshStandardMaterial color="#111827" /></mesh>
          <mesh position={[0, 1.18, 0.15]}><boxGeometry args={[0.24, 0.025, 0.12]} /><meshStandardMaterial color="#111827" /></mesh>
          <mesh position={[-0.05, 1.12, 0.14]}><sphereGeometry args={[0.018, 6, 6]} /><meshBasicMaterial color="#111" /></mesh>
          <mesh position={[0.05, 1.12, 0.14]}><sphereGeometry args={[0.018, 6, 6]} /><meshBasicMaterial color="#111" /></mesh>
        </group>
        <Html position={[0, 1.65, 0]} center distanceFactor={9}>
          <div className="pointer-events-none flex flex-col items-center gap-1">
            {near && <div className="px-2 py-1 rounded-lg bg-white text-[10px] font-bold text-slate-700 shadow whitespace-nowrap">สวัสดีครับ 👋 ยินดีต้อนรับ</div>}
            <div className="px-1.5 py-0.5 rounded bg-slate-800 text-white text-[9px] font-black">รปภ.</div>
          </div>
        </Html>
      </group>
      {/* ไม้กั้นทางเข้า — ยกขึ้นเมื่อหุ่นยนต์เข้าใกล้ */}
      <group ref={bar} position={[gate.pos[0] - 0.85, 0.42, gate.pos[1] - 0.5]}>
        <mesh position={[0, -0.2, 0]}><boxGeometry args={[0.08, 0.4, 0.08]} /><meshStandardMaterial color="#f59f00" /></mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0.2 + i * 0.4, 0, 0]}>
            <boxGeometry args={[0.4, 0.05, 0.05]} />
            <meshStandardMaterial color={i % 2 ? "#ffffff" : "#e03131"} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/* ───────────── รวมฉากตกแต่ง ───────────── */

export function Decor({
  nodes, edges, gate, robotRef, indoor,
}: {
  nodes: MapNode[]; edges: MapEdge[]; gate?: MapLocation;
  robotRef: React.RefObject<THREE.Group | null>; indoor: boolean;
}) {
  return (
    <>
      <Ground />
      <Roads nodes={nodes} edges={edges} />
      <Fence />
      <Pond />
      {!indoor && (
        <>
          <Trees />
          <Pavilions />
          <Flagpole />
        </>
      )}
      <Guard gate={gate} robotRef={robotRef} />
    </>
  );
}