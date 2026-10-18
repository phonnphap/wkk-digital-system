"use client";

import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FH, MapEdge, MapLocation, MapNode, px } from "./schoolData";
import { DecorConfig, DecorItem, FENCE, GateDef } from "./DecorData";
import { SchoolGates } from "./SchoolGates";
import { Roads, RoadsLayer, Traffic, Temple, RoadSign, Zebra, FieldFence, People, Carport, BusBay, Kiosk } from "./SceneExtra";

/* ───────────── helpers ───────────── */

export type Item = {
  p: [number, number, number];
  s?: number | [number, number, number];
  r?: number;
  c?: string;
};

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

const rad = (it: { rot?: number }) => -((it.rot ?? 0) * Math.PI) / 180;

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

const Tag = ({ y, children }: { y: number; children: React.ReactNode }) => (
  <Html position={[0, y, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
    <div className="pointer-events-none px-1.5 py-0.5 rounded bg-white/90 text-[9px] font-black text-slate-700 shadow whitespace-nowrap">{children}</div>
  </Html>
);

/* ───────────── พื้น / ถนน / รั้ว ───────────── */

export function Ground({ onGround }: { onGround?: (x: number, z: number) => void }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    FENCE.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    return s;
  }, []);
  const click = onGround ? (e: any) => { e.stopPropagation(); onGround(e.point.x, e.point.z); } : undefined;
  return (
    <>
      {/* นอกโรงเรียน = สีขาว (ถนนนอกรั้วเป็นสีดำ วาดใน OutsideRoads) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2, -0.06, 0.5]} receiveShadow onClick={click}>
        <planeGeometry args={[120, 90]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow onClick={click}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#8bc34a" />
      </mesh>
    </>
  );
}

export function Fence({ gates }: { gates: GateDef[] }) {
  const parts = useMemo(() => {
    const bars: Item[] = [], rails: Item[] = [], pillars: Item[] = [];
    for (let i = 0; i < FENCE.length; i++) {
      const a = FENCE[i], b = FENCE[(i + 1) % FENCE.length];
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const len = Math.hypot(vx, vz);
      const ang = -Math.atan2(vz, vx);
      // ช่องประตูบนรั้วช่วงนี้ — ตัดรั้วพอดีขอบเสาประตู ไม่เว้นช่องว่าง
      const cuts: [number, number][] = [];
      gates.forEach((g) => {
        const t = ((g.x - a[0]) * vx + (g.z - a[1]) * vz) / (len * len);
        const qx = a[0] + vx * t, qz = a[1] + vz * t;
        if (t < -0.2 || t > 1.2 || Math.hypot(g.x - qx, g.z - qz) > 0.1) return;
        const h = g.width / 2 / len;
        cuts.push([t - h, t + h]);
      });
      cuts.sort((p, q) => p[0] - q[0]);
      const keep: [number, number][] = [];
      let cur = 0;
      cuts.forEach(([c0, c1]) => {
        if (c0 > cur) keep.push([cur, Math.min(c0, 1)]);
        cur = Math.max(cur, c1);
      });
      if (cur < 1) keep.push([cur, 1]);
      keep.forEach(([k0, k1]) => {
        const L1 = len * (k1 - k0);
        if (L1 < 0.02) return;
        const n = Math.max(1, Math.round(L1 / 1.4));
        for (let k = 0; k < n; k++) {
          const t0 = k0 + ((k1 - k0) * k) / n, t1 = k0 + ((k1 - k0) * (k + 1)) / n, tm = (t0 + t1) / 2;
          const mx = a[0] + vx * tm, mz = a[1] + vz * tm;
          const segLen = L1 / n;
          rails.push({ p: [mx, 0.5, mz], s: [segLen, 1, 1], r: ang });
          rails.push({ p: [mx, 0.2, mz], s: [segLen, 1, 1], r: ang });
          const bn = Math.floor(segLen / 0.16);
          for (let j = 1; j < bn; j++) {
            const t = t0 + ((t1 - t0) * j) / bn;
            bars.push({ p: [a[0] + vx * t, 0.35, a[1] + vz * t] });
          }
        }
        const pn = Math.max(1, Math.round(L1 / 2.8));
        for (let k = 0; k <= pn; k++) {
          const t = k0 + ((k1 - k0) * k) / pn;
          pillars.push({ p: [a[0] + vx * t, 0.36, a[1] + vz * t] });
        }
      });
    }
    return { bars, rails, pillars };
  }, [gates]);
  return (
    <>
      <Inst items={parts.bars}><cylinderGeometry args={[0.012, 0.012, 0.42, 5]} /><meshStandardMaterial color="#343a40" /></Inst>
      <Inst items={parts.rails}><boxGeometry args={[1, 0.035, 0.035]} /><meshStandardMaterial color="#212529" /></Inst>
      <Inst items={parts.pillars} cast><boxGeometry args={[0.1, 0.72, 0.1]} /><meshStandardMaterial color="#adb5bd" /></Inst>
    </>
  );
}

/* ───────────── ต้นไม้ / ศาลา / เสาธง ───────────── */

export function Trees({ items }: { items: DecorItem[] }) {
  const d = useMemo(() => {
    const r = rng(7);
    const trunks: Item[] = [], crowns: Item[] = [], cones: Item[] = [], fronds: Item[] = [];
    const greens = ["#2e7d32", "#388e3c", "#43a047", "#558b2f", "#33691e"];
    const flowers = ["#f59f00", "#f06595", "#fcc419", "#e64980"];
    items.filter((t) => t.type === "tree").forEach((t) => {
      const [wx, wz] = px(t.x, t.y);
      const kind = t.kind ?? "round";
      const sc = (t.s ?? 1) * (0.85 + r() * 0.3);
      const h = t.h ?? 1;
      const k = 0.9 + r() * 0.25;
      const green = greens[Math.floor(r() * greens.length)];
      if (kind === "pine") {
        trunks.push({ p: [wx, 0.15 * sc * h, wz], s: [sc * 0.8, sc * h * 0.75, sc * 0.8] });
        cones.push({ p: [wx, 0.32 * sc * h, wz], s: [sc * 1.15, sc * h * 0.9, sc * 1.15], c: "#2f6b3a" });
        cones.push({ p: [wx, 0.58 * sc * h, wz], s: [sc * 0.85, sc * h * 0.85, sc * 0.85], c: "#3a7d44" });
        cones.push({ p: [wx, 0.8 * sc * h, wz], s: [sc * 0.55, sc * h * 0.7, sc * 0.55], c: "#47914f" });
      } else if (kind === "palm") {
        const th = 2.4 * sc * h;                       // ลำต้น (เดิมสูง 0.4)
        trunks.push({ p: [wx, th * 0.2, wz], s: [sc * 0.8, sc * h * 2.4, sc * 0.8] });
        for (let f = 0; f < 7; f++)
          fronds.push({ p: [wx, th * 0.4 + 0.03, wz], s: [sc, sc, sc], r: (f * Math.PI * 2) / 7 + r() * 0.3, c: green });
      } else if (kind === "bush") {
        crowns.push({ p: [wx, 0.09 * sc, wz], s: sc * 0.55 * k, c: green });
      } else {
        trunks.push({ p: [wx, 0.2 * sc * h, wz], s: [sc, sc * h, sc] });
        crowns.push({ p: [wx, 0.4 * sc * h + 0.22 * sc, wz], s: sc * k, c: kind === "flower" ? flowers[Math.floor(r() * flowers.length)] : green });
      }
    });
    return { trunks, crowns, cones, fronds };
  }, [items]);
  return (
    <>
      <Inst items={d.trunks}><cylinderGeometry args={[0.035, 0.05, 0.4, 6]} /><meshStandardMaterial color="#6d4c41" /></Inst>
      <Inst items={d.crowns} cast><icosahedronGeometry args={[0.3, 1]} /><meshStandardMaterial color="#ffffff" flatShading /></Inst>
      <Inst items={d.cones} cast><coneGeometry args={[0.26, 0.5, 8]} /><meshStandardMaterial color="#ffffff" flatShading /></Inst>
      <Inst items={d.fronds}><boxGeometry args={[0.55, 0.015, 0.1]} /><meshStandardMaterial color="#ffffff" /></Inst>
    </>
  );
}

export function Pavilions({ items }: { items: DecorItem[] }) {
  return (
    <>
      {items.filter((p) => p.type === "pavilion").map((p) => {
        const [wx, wz] = px(p.x, p.y);
        return (
          <group key={p.id} position={[wx, 0, wz]} rotation={[0, rad(p), 0]}>
            <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[0.72, 0.04, 0.72]} /><meshStandardMaterial color="#dee2e6" /></mesh>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
              <mesh key={k} position={[sx * 0.29, 0.28, sz * 0.29]}><cylinderGeometry args={[0.025, 0.025, 0.52, 6]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
            ))}
            <mesh position={[0, 0.68, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[0.62, 0.3, 4]} /><meshStandardMaterial color={p.color ?? "#e5484d"} />
            </mesh>
            <mesh position={[0, 0.14, 0]}><boxGeometry args={[0.4, 0.04, 0.14]} /><meshStandardMaterial color="#a1887f" /></mesh>
          </group>
        );
      })}
    </>
  );
}

/** ซุ้มพระ: ศาลาเล็ก หลังคาทอง + พระพุทธรูป */
function Shrine({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, 0.04, 0]} receiveShadow><boxGeometry args={[0.9, 0.08, 0.9]} /><meshStandardMaterial color="#e9ecef" /></mesh>
      <mesh position={[0, 0.03, 0.52]}><boxGeometry args={[0.5, 0.05, 0.14]} /><meshStandardMaterial color="#dee2e6" /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
        <mesh key={k} position={[sx * 0.34, 0.45, sz * 0.34]} castShadow><cylinderGeometry args={[0.03, 0.03, 0.74, 8]} /><meshStandardMaterial color="#f2b705" /></mesh>
      ))}
      <mesh position={[0, 0.98, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[0.78, 0.4, 4]} /><meshStandardMaterial color="#e8590c" /></mesh>
      <mesh position={[0, 1.22, 0]}><coneGeometry args={[0.05, 0.16, 8]} /><meshStandardMaterial color="#fbbf24" /></mesh>
      <mesh position={[0, 0.16, 0]}><boxGeometry args={[0.34, 0.16, 0.28]} /><meshStandardMaterial color="#8d6e63" /></mesh>
      <mesh position={[0, 0.34, 0]}><sphereGeometry args={[0.11, 12, 12]} /><meshStandardMaterial color="#fbbf24" metalness={0.4} roughness={0.35} /></mesh>
      <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.065, 12, 12]} /><meshStandardMaterial color="#fbbf24" metalness={0.4} roughness={0.35} /></mesh>
      <Tag y={1.45}>🙏 {it.name || "ซุ้มพระ"}</Tag>
    </group>
  );
}

/** ตึกห้องน้ำนอกอาคาร */
function ToiletBlock({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 36) / 30, D = (it.d ?? 24) / 30, H = 0.7;
  const name = it.name || "ห้องน้ำ";
  const wall = it.color ?? (name.includes("หญิง") ? "#fcc2d7" : name.includes("ชาย") ? "#a5d8ff" : "#dee2e6");
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow><boxGeometry args={[W, H, D]} /><meshStandardMaterial color={wall} /></mesh>
      <mesh position={[0, H + 0.03, 0]} castShadow><boxGeometry args={[W + 0.08, 0.06, D + 0.08]} /><meshStandardMaterial color="#6c757d" /></mesh>
      <mesh position={[0, 0.2, D / 2 + 0.005]}><boxGeometry args={[Math.min(0.18, W * 0.3), 0.4, 0.02]} /><meshStandardMaterial color="#343a40" /></mesh>
      <mesh position={[W * 0.28, 0.45, D / 2 + 0.005]}><boxGeometry args={[0.14, 0.1, 0.02]} /><meshStandardMaterial color="#74c0fc" /></mesh>
      <mesh position={[-W * 0.28, 0.45, D / 2 + 0.005]}><boxGeometry args={[0.14, 0.1, 0.02]} /><meshStandardMaterial color="#74c0fc" /></mesh>
      <Tag y={H + 0.3}>🚻 {name}</Tag>
    </group>
  );
}

/** โรงจอดมอเตอร์ไซค์: หลังคา + เสา + มอเตอร์ไซค์เรียงแถว */
function Shed({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 60) / 30, D = (it.d ?? 28) / 30;
  const bikes = useMemo(() => {
    const r = rng(11);
    const out: Item[] = [];
    const cols = Math.max(1, Math.floor((W - 0.1) / 0.14)), rows = Math.max(1, Math.floor((D - 0.1) / 0.3));
    const cw = (W - 0.1) / cols, rd = (D - 0.1) / rows;
    const pal = ["#e63946", "#1d3557", "#2a9d8f", "#212529", "#f1faee", "#ffb703", "#9d4edd", "#868e96"];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (r() > 0.88) continue;
      const bx = -W / 2 + 0.05 + (i + 0.5) * cw, bz = -D / 2 + 0.05 + (j + 0.5) * rd;
      out.push({ p: [bx, 0.07, bz], s: [0.06, 0.07, 0.2], c: pal[Math.floor(r() * pal.length)] });
      out.push({ p: [bx, 0.125, bz + 0.02], s: [0.055, 0.03, 0.08], c: "#212529" });
      out.push({ p: [bx, 0.03, bz - 0.08], s: [0.03, 0.06, 0.05], c: "#111111" });
      out.push({ p: [bx, 0.03, bz + 0.08], s: [0.03, 0.06, 0.05], c: "#111111" });
      out.push({ p: [bx, 0.13, bz - 0.07], s: [0.07, 0.015, 0.015], c: "#868e96" });
    }
    return out;
  }, [W, D]);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, 0.015, 0]} receiveShadow><boxGeometry args={[W, 0.03, D]} /><meshStandardMaterial color="#868e96" /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
        <mesh key={k} position={[sx * (W / 2 - 0.04), 0.23, sz * (D / 2 - 0.04)]}><cylinderGeometry args={[0.02, 0.02, 0.46, 6]} /><meshStandardMaterial color="#495057" /></mesh>
      ))}
      <mesh position={[0, 0.48, 0]} castShadow><boxGeometry args={[W + 0.1, 0.04, D + 0.1]} /><meshStandardMaterial color={it.color ?? "#f59f00"} /></mesh>
      <Inst items={bikes}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
      <Tag y={0.8}>🏍 {it.name || "ที่จอดมอเตอร์ไซค์"}</Tag>
    </group>
  );
}

/** ประตูกั้น (บานเลื่อนปิดทางเดินรถ) */
function Barrier({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 26) / 30;
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * W / 2, 0.27, 0]} castShadow><boxGeometry args={[0.1, 0.54, 0.1]} /><meshStandardMaterial color="#f59f00" /></mesh>
      ))}
      <mesh position={[0, 0.28, 0]} castShadow><boxGeometry args={[W - 0.1, 0.32, 0.025]} /><meshStandardMaterial color="#343a40" /></mesh>
      {[0.12, 0.44].map((y, k) => (
        <mesh key={k} position={[0, y, 0]}><boxGeometry args={[W - 0.1, 0.04, 0.04]} /><meshStandardMaterial color={k ? "#e03131" : "#f8f9fa"} /></mesh>
      ))}
      <Tag y={0.75}>⛔ {it.name || "ประตูกั้น"}</Tag>
    </group>
  );
}

/** ทางเชื่อมระหว่างอาคาร (ชั้นที่ระบุ เช่น "2,3") */
function Bridge({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 30) / 30, D = (it.d ?? 20) / 30;
  const levels = (it.levels ?? "2,3").split(",").map((s) => parseInt(s.trim())).filter((n) => n >= 1);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      {levels.map((lv) => {
        const y0 = (lv - 1) * FH;
        return (
          <group key={lv}>
            <mesh position={[0, y0 + 0.04, 0]} castShadow receiveShadow><boxGeometry args={[W, 0.08, D]} /><meshStandardMaterial color="#ced4da" /></mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (W / 2 - 0.02), y0 + 0.45, 0]}>
                <boxGeometry args={[0.04, 0.74, D]} /><meshStandardMaterial color="#74c0fc" transparent opacity={0.55} />
              </mesh>
            ))}
            <mesh position={[0, y0 + FH - 0.04, 0]} castShadow><boxGeometry args={[W + 0.06, 0.06, D]} /><meshStandardMaterial color="#c92a2a" /></mesh>
          </group>
        );
      })}
    </group>
  );
}

function Flag({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
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
  decor, gates, nodes, edges, gate, robotRef, indoor, onGround,
}: {
  decor: DecorConfig; gates: GateDef[]; nodes: MapNode[]; edges: MapEdge[]; gate?: MapLocation;
  robotRef: React.RefObject<THREE.Group | null>; indoor: boolean;
  onGround?: (x: number, z: number) => void;
}) {
  const of = (t: DecorItem["type"]) => decor.items.filter((i) => i.type === t);
  return (
    <>
      <Ground onGround={onGround} />
      <Roads nodes={nodes} edges={edges} />
      <RoadsLayer roads={decor.roads ?? []} gates={gates} />
      <Fence gates={gates} />
      <SchoolGates gates={gates} signs={of("sign")} />
      {!indoor && (
        <>
          <Trees items={decor.items} />
          <Pavilions items={decor.items} />
          {of("flag").map((i) => <Flag key={i.id} it={i} />)}
          {of("shrine").map((i) => <Shrine key={i.id} it={i} />)}
          {of("toilet").map((i) => <ToiletBlock key={i.id} it={i} />)}
          {of("shed").map((i) => <Shed key={i.id} it={i} />)}
          {of("barrier").map((i) => <Barrier key={i.id} it={i} />)}
          {of("bridge").map((i) => <Bridge key={i.id} it={i} />)}
          {of("carport").map((i) => <Carport key={i.id} it={i} />)}
          {of("busbay").map((i) => <BusBay key={i.id} it={i} />)}
          {of("kiosk").map((i) => <Kiosk key={i.id} it={i} />)}
          {of("temple").map((i) => <Temple key={i.id} it={i} />)}
          {of("roadsign").map((i) => <RoadSign key={i.id} it={i} />)}
          {of("zebra").map((i) => <Zebra key={i.id} it={i} />)}
          {of("fieldfence").map((i) => <FieldFence key={i.id} it={i} />)}
          {of("people").map((i) => <People key={i.id} it={i} />)}
          <Traffic roads={decor.roads ?? []} traffic={decor.traffic} />
        </>
      )}
      <Guard gate={gate} robotRef={robotRef} />
    </>
  );
}