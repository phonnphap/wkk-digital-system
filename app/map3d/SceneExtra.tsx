"use client";

// ส่วนเสริมของฉาก: ถนนในโรงเรียน (เทา ขอบขาว), ถนนนอกโรงเรียน (ดำ ขอบเหลือง 2 เลน),
// โรงจอดรถยนต์, ช่องจอดรถตู้/รถรับส่ง, ซุ้มขายน้ำ
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { MapEdge, MapNode, px } from "./schoolData";
import { DecorItem, GateDef, MAIN_ROAD, PARK_ROADS_PX, ROAD_LABELS_PX, ROAD_W, outsideRoadSegs } from "./DecorData";

type Item = { p: [number, number, number]; s?: number | [number, number, number]; r?: number; c?: string };

function InstX({ items, children }: { items: Item[]; children: React.ReactNode }) {
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
      if (typeof s === "number") d.scale.setScalar(s); else d.scale.set(s[0], s[1], s[2]);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      if (it.c) m.setColorAt(i, col.set(it.c));
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined as any, undefined as any, Math.max(items.length, 1)]} frustumCulled={false}>
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
const rad = (it: { rot?: number }) => -((it.rot ?? 0) * Math.PI) / 180;

const Tag = ({ y, children }: { y: number; children: React.ReactNode }) => (
  <Html position={[0, y, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
    <div className="pointer-events-none px-1.5 py-0.5 rounded bg-white/90 text-[9px] font-black text-slate-700 shadow whitespace-nowrap">{children}</div>
  </Html>
);

/* ───────────── ถนนในโรงเรียน: เทา + เส้นขอบขาว ───────────── */
export function Roads({ nodes, edges }: { nodes: MapNode[]; edges: MapEdge[] }) {
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  return (
    <>
      {edges.map((e, i) => {
        const a = pos.get(e.a), b = pos.get(e.b);
        if (!a || !b) return null;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ang = -Math.atan2(b.z - a.z, b.x - a.x);
        const mid: [number, number, number] = [(a.x + b.x) / 2, 0.01, (a.z + b.z) / 2];
        return (
          <group key={i} position={mid} rotation={[0, ang, 0]}>
            <mesh position={[0, -0.002, 0]} receiveShadow><boxGeometry args={[len + 0.62, 0.016, 1.2]} /><meshStandardMaterial color="#ffffff" /></mesh>
            <mesh position={[0, 0.004, 0]} receiveShadow><boxGeometry args={[len + 0.5, 0.02, 1.02]} /><meshStandardMaterial color="#9ca3af" /></mesh>
          </group>
        );
      })}
    </>
  );
}

/* ───────────── ถนนนอกโรงเรียน: ดำ + ขอบเหลือง + เส้นกลางประ (2 เลน) ───────────── */
export function OutsideRoads({ gates }: { gates: GateDef[] }) {
  const { base, edge, dash } = useMemo(() => {
    const base: Item[] = [], edge: Item[] = [], dash: Item[] = [];
    outsideRoadSegs(gates).forEach(({ a, b }) => {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) return;
      const ang = -Math.atan2(dz, dx);
      const nx = -dz / len, nz = dx / len;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      base.push({ p: [mx, 0.004, mz], s: [len + ROAD_W * 0.5, 0.012, ROAD_W], r: ang, c: "#14171b" });
      [-1, 1].forEach((s) => {
        const o = s * (ROAD_W / 2 - 0.07);
        edge.push({ p: [mx + nx * o, 0.012, mz + nz * o], s: [len + ROAD_W * 0.4, 0.008, 0.05], r: ang, c: "#fbbf24" });
      });
      const n = Math.floor(len / 0.6);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        dash.push({ p: [a[0] + dx * t, 0.012, a[1] + dz * t], s: [0.3, 0.008, 0.04], r: ang, c: "#fbbf24" });
      }
    });
    return { base, edge, dash };
  }, [gates]);
  return (
    <>
      <InstX items={base}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={edge}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={dash}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
    </>
  );
}

/* ───────────── ถนนหลักรังสิต–นครนายก (สีน้ำเงิน 4 เลน ฝั่งละ 2) + ป้ายชื่อ ───────────── */
export function MainRoad() {
  const [x] = px(MAIN_ROAD.x, 0);
  const z0 = px(0, MAIN_ROAD.y0)[1], z1 = px(0, MAIN_ROAD.y1)[1];
  const L = z1 - z0, zc = (z0 + z1) / 2, W = MAIN_ROAD.w;
  const dashes = useMemo(() => {
    const out: Item[] = [];
    const n = Math.floor(L / 0.7);
    for (let k = 0; k < n; k++) {
      const z = z0 + (k + 0.5) * (L / n);
      [-W / 4, W / 4].forEach((o) => out.push({ p: [x + o, 0.016, z], s: [0.05, 0.006, 0.35], c: "#ffffff" }));
    }
    out.push({ p: [x - 0.04, 0.016, zc], s: [0.04, 0.006, L], c: "#fbbf24" });
    out.push({ p: [x + 0.04, 0.016, zc], s: [0.04, 0.006, L], c: "#fbbf24" });
    [-1, 1].forEach((s) => out.push({ p: [x + s * (W / 2 - 0.06), 0.016, zc], s: [0.05, 0.006, L], c: "#ffffff" }));
    return out;
  }, [x, z0, L, zc, W]);
  return (
    <>
      <mesh position={[x, 0.008, zc]} receiveShadow><boxGeometry args={[W, 0.014, L]} /><meshStandardMaterial color="#1e40af" /></mesh>
      <InstX items={dashes}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      {[-12, 2, 14].map((z) => (
        <group key={z} position={[x, 0, z]}><Tag y={0.5}>🛣 ถนนรังสิต–นครนายก (4 เลน)</Tag></group>
      ))}
      {ROAD_LABELS_PX.map((l) => {
        const [lx, lz] = px(l.x, l.y);
        return <group key={l.text} position={[lx, 0, lz]}><Tag y={0.4}>{l.text}</Tag></group>;
      })}
    </>
  );
}

/* ───────────── ถนนเข้า-ออกลานจอดรถ (สีเหลือง) ───────────── */
export function ParkRoads() {
  const { base, top } = useMemo(() => {
    const base: Item[] = [], top: Item[] = [];
    PARK_ROADS_PX.forEach((pl) => {
      for (let i = 0; i < pl.length - 1; i++) {
        const [ax, az] = px(pl[i][0], pl[i][1]), [bx, bz] = px(pl[i + 1][0], pl[i + 1][1]);
        const len = Math.hypot(bx - ax, bz - az);
        const ang = -Math.atan2(bz - az, bx - ax);
        const mid: [number, number] = [(ax + bx) / 2, (az + bz) / 2];
        base.push({ p: [mid[0], 0.018, mid[1]], s: [len + 0.9, 0.012, 1.0], r: ang, c: "#f59f00" });
        top.push({ p: [mid[0], 0.026, mid[1]], s: [len + 0.8, 0.012, 0.82], r: ang, c: "#fde047" });
      }
    });
    return { base, top };
  }, []);
  return (
    <>
      <InstX items={base}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={top}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
    </>
  );
}

/* ───────────── โรงจอดรถยนต์ (ผู้บริหาร / ครู) ───────────── */
export function Carport({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 90) / 30, D = (it.d ?? 26) / 30;
  const cars = useMemo(() => {
    const r = rng(5);
    const out: Item[] = [];
    const cols = Math.max(1, Math.floor((W - 0.1) / 0.38));
    const cw = (W - 0.1) / cols;
    const pal = ["#e63946", "#f1faee", "#457b9d", "#1d3557", "#ffb703", "#2a9d8f", "#868e96", "#212529", "#ffffff"];
    for (let i = 0; i < cols; i++) {
      if (r() > 0.85) continue;
      const cx = -W / 2 + 0.05 + (i + 0.5) * cw;
      const c = pal[Math.floor(r() * pal.length)];
      out.push({ p: [cx, 0.1, 0], s: [0.28, 0.1, Math.min(0.58, D - 0.1)], c });
      out.push({ p: [cx, 0.19, 0], s: [0.24, 0.09, Math.min(0.3, D * 0.5)], c: "#263238" });
    }
    return out;
  }, [W, D]);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[W, 0.03, D]} /><meshStandardMaterial color="#6c757d" /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
        <mesh key={k} position={[sx * (W / 2 - 0.04), 0.3, sz * (D / 2 - 0.04)]}><cylinderGeometry args={[0.025, 0.025, 0.6, 6]} /><meshStandardMaterial color="#495057" /></mesh>
      ))}
      <mesh position={[0, 0.62, 0]} castShadow><boxGeometry args={[W + 0.1, 0.05, D + 0.1]} /><meshStandardMaterial color={it.color ?? "#2563eb"} /></mesh>
      <InstX items={cars}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <Tag y={0.95}>🚗 {it.name || "โรงจอดรถ"}</Tag>
    </group>
  );
}

/* ───────────── ช่องจอดรถตู้ / รถรับส่งนักเรียน (แถวยาว n ช่อง) ───────────── */
export function BusBay({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const n = Math.max(1, Math.round(it.n ?? 3));
  const W = (it.w ?? 78) / 30, D = (it.d ?? 18) / 30;
  const slot = W / n;
  const items = useMemo(() => {
    const out: Item[] = [];
    for (let k = 0; k <= n; k++) out.push({ p: [-W / 2 + k * slot, 0.03, 0], s: [0.02, 0.008, D], c: "#f8f9fa" });
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + (i + 0.5) * slot;
      const bus = i % 2 === 0;
      out.push({ p: [cx, bus ? 0.16 : 0.13, 0], s: [slot * (bus ? 0.72 : 0.64), bus ? 0.2 : 0.16, D * 0.82], c: bus ? "#fbbf24" : "#f8f9fa" });
      out.push({ p: [cx, bus ? 0.2 : 0.17, 0], s: [slot * (bus ? 0.74 : 0.66), 0.06, D * 0.6], c: "#263238" });
    }
    return out;
  }, [n, W, D, slot]);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[W, 0.03, D]} /><meshStandardMaterial color="#495057" /></mesh>
      <InstX items={items}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <Tag y={0.5}>🚌 {it.name || "รถตู้/รถรับส่ง นร."}</Tag>
    </group>
  );
}

/* ───────────── ซุ้มขายน้ำ ───────────── */
export function Kiosk({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const col = it.color ?? "#0ea5e9";
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[0.8, 0.04, 0.55]} /><meshStandardMaterial color="#dee2e6" /></mesh>
      <mesh position={[0, 0.18, 0.1]} castShadow><boxGeometry args={[0.6, 0.28, 0.22]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
      <mesh position={[0, 0.34, 0.1]}><boxGeometry args={[0.64, 0.03, 0.26]} /><meshStandardMaterial color={col} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.3, 0.3, -0.12]}><cylinderGeometry args={[0.015, 0.015, 0.56, 6]} /><meshStandardMaterial color="#adb5bd" /></mesh>
      ))}
      <mesh position={[0, 0.6, -0.02]} rotation={[0.18, 0, 0]} castShadow><boxGeometry args={[0.78, 0.03, 0.5]} /><meshStandardMaterial color={col} /></mesh>
      {[-0.2, -0.07, 0.07, 0.2].map((cx, k) => (
        <mesh key={k} position={[cx, 0.4, 0.1]}><cylinderGeometry args={[0.025, 0.02, 0.07, 8]} /><meshStandardMaterial color={k % 2 ? "#ff922b" : "#51cf66"} /></mesh>
      ))}
      <Tag y={0.85}>🧃 {it.name || "ซุ้มขายน้ำ"}</Tag>
    </group>
  );
}