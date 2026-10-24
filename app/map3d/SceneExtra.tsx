"use client";

// ส่วนเสริมของฉาก: ถนนในโรงเรียน (เทา ขอบขาว), ถนนนอกโรงเรียน (ดำ ขอบเหลือง 2 เลน),
// โรงจอดรถยนต์, ช่องจอดรถตู้/รถรับส่ง, ซุ้มขายน้ำ
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { XZ, px } from "./schoolData";
import { DecorItem, RoadItem, sampleRoad } from "./DecorData";

export type Item = { p: [number, number, number]; s?: number | [number, number, number]; r?: number; c?: string };

export function InstX({ items, children, onClick }: { items: Item[]; children: React.ReactNode; onClick?: (e: any) => void }) {
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
    <instancedMesh key={items.length} ref={ref} args={[undefined as any, undefined as any, Math.max(items.length, 1)]} frustumCulled={false} onClick={onClick}>
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

export const Tag = ({ y, children }: { y: number; children: React.ReactNode }) => (
  <Html position={[0, y, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
    <div className="pointer-events-none px-1.5 py-0.5 rounded bg-white/90 text-[9px] font-black text-slate-700 shadow whitespace-nowrap">{children}</div>
  </Html>
);

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

/* ───────────── ช่องจอดรถตู้ / รถรับส่งนักเรียน (รถตู้ทั้งหมด) ─────────────
   ปรับได้แบบลานจอดรถ: n = จำนวนช่องต่อแถว, rows = จำนวนแถว, kind = perp(จอดตรง) | slant(จอดเฉียง) | parallel(จอดขนาน),
   ang = มุมเฉียง (องศา), dir = ทิศเฉียง (1/-1), fill = สัดส่วนช่องที่มีรถ (0–1), w = ความกว้างทั้งแถว, d = ความลึกช่องจอด, rot = หมุน */
const VAN_COLORS = ["#f8f9fa", "#fbbf24", "#f8f9fa", "#e5e7eb", "#2563eb", "#f8f9fa", "#16a34a", "#fbbf24"];
export function BusBay({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const n = Math.max(1, Math.min(40, Math.round(it.n ?? 3)));
  const R = Math.max(1, Math.min(6, Math.round(it.rows ?? 1)));
  const W = Math.max(0.3, (it.w ?? 78) / 30), D = Math.max(0.2, (it.d ?? 18) / 30);
  const kind = it.kind === "slant" || it.kind === "parallel" ? it.kind : "perp";
  const fill = Math.min(1, Math.max(0, it.fill ?? 0.85));
  const th = kind === "slant" ? (((it.ang ?? 45) * Math.PI) / 180) * (it.dir === -1 ? -1 : 1) : 0;
  const sw = W / n;
  const items = useMemo(() => {
    const out: { l: Item[]; b: Item[]; w: Item[]; r: Item[] } = { l: [], b: [], w: [], r: [] };
    const rg = rng(Math.round(it.x * 3 + it.y * 5 + n * 11 + R * 17));
    for (let ri = 0; ri < R; ri++) {
      const zc = (ri - (R - 1) / 2) * D;
      for (let k = 0; k <= n; k++) out.l.push({ p: [-W / 2 + k * sw, 0.034, zc], s: [0.02, 0.004, D], r: th, c: "#f8f9fa" });
      for (let k = 0; k < n; k++) {
        if (rg() > fill) continue;
        const cx = -W / 2 + (k + 0.5) * sw;
        const c = VAN_COLORS[Math.floor(rg() * VAN_COLORS.length)];
        const par = kind === "parallel";
        const vl = par ? Math.min(sw * 0.9, 0.78) : Math.min(D * 0.9, 0.78);
        const vw = par ? Math.min(D * 0.72, 0.3) : Math.min(sw * 0.72, 0.3);
        const rr = par ? Math.PI / 2 : th;
        // ตัวรถตู้: ตัวถังสูง หลังคาสูง กระจกรอบคัน (หัวรถหันไปทาง +z ของรถ)
        out.b.push({ p: [cx, 0.13, zc], s: [vw, 0.17, vl], r: rr, c });
        out.r.push({ p: [cx, 0.225, zc], s: [vw * 0.96, 0.02, vl * 0.92], r: rr, c: "#f1f5f9" });
        out.w.push({ p: [cx, 0.17, zc], s: [vw * 1.02, 0.05, vl * 0.62], r: rr, c: "#263238" });
        out.w.push({ p: [cx + Math.sin(rr) * vl * 0.5, 0.14, zc + Math.cos(rr) * vl * 0.5], s: [Math.abs(Math.cos(rr)) * vw * 0.8 + Math.abs(Math.sin(rr)) * 0.01, 0.07, Math.abs(Math.sin(rr)) * vw * 0.8 + Math.abs(Math.cos(rr)) * 0.01], r: 0, c: "#263238" });
      }
    }
    return out;
  }, [n, R, W, D, kind, th, fill, sw, it.x, it.y]);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[W, 0.03, D * R]} /><meshStandardMaterial color="#495057" /></mesh>
      <InstX items={items.l}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={items.b}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={items.r}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={items.w}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <Tag y={0.6}>🚐 {it.name || "รถตู้/รถรับส่ง นร."}</Tag>
    </group>
  );
}

/* ───────────── ซุ้มขายน้ำ ───────────── */
export function Kiosk({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const col = it.color ?? "#0ea5e9";
  // ขนาดมาตรฐาน 24 × 16.5 px (= 0.8 × 0.55 หน่วยโลก) · ค่าไม่ถูกต้อง/ติดลบ → ใช้ค่ามาตรฐาน
  const okv = (v: number | undefined, d: number) => (typeof v === "number" && isFinite(v) && v > 2 ? v : d);
  const sx = okv(it.w, 24) / 24, sz = okv(it.d, 16.5) / 16.5;
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <group scale={[sx, 1, sz]}>
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
      </group>
      <Tag y={0.85}>🧃 {it.name || "ซุ้มขายน้ำ"}</Tag>
    </group>
  );
}


/* ───────────── รถวิ่งตามเส้นทาง (ถนนน้ำเงิน → ประตู 3 → ลานจอดรถ → ประตู 4) ───────────── */
/** ตำแหน่งรถที่วิ่งอยู่ (world x,z) — ให้ประตูกั้นอ่านเพื่อเปิดอัตโนมัติ */
export const trafficPos: [number, number][] = [];
const CAR_COLORS = ["#e63946", "#f1faee", "#457b9d", "#ffb703", "#2a9d8f", "#9d4edd", "#212529", "#fb923c"];
export function Traffic({ roads, traffic }: { roads: RoadItem[]; traffic?: { cars: number; speed: number } }) {
  const routes = useMemo(() => roads.filter((r) => r.kind === "route" && r.pts.length >= 2).map((r) => {
    const pts = sampleRoad(r.pts, r.curve ?? 0);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, total: cum[cum.length - 1] };
  }).filter((r) => r.total > 1), [roads]);
  const N = routes.length ? Math.max(0, Math.min(24, Math.round(traffic?.cars ?? 4))) : 0;
  const speed = traffic?.speed ?? 2.4;
  const refs = useRef<(THREE.Group | null)[]>([]);
  const dist = useRef<number[]>([]);
  useLayoutEffect(() => { dist.current = []; trafficPos.length = 0; return () => { trafficPos.length = 0; }; }, [routes, N]);
  useFrame((_, dt) => {
    for (let i = 0; i < N; i++) {
      const r = routes[i % routes.length], g = refs.current[i];
      if (!r || !g) continue;
      const per = Math.ceil(N / routes.length), k = Math.floor(i / routes.length);
      if (dist.current[i] === undefined) dist.current[i] = (k / per) * r.total;
      dist.current[i] = (dist.current[i] + speed * Math.min(dt, 0.05)) % r.total;
      const s = dist.current[i];
      let lo = 0;
      while (lo < r.cum.length - 2 && r.cum[lo + 1] < s) lo++;
      const a = r.pts[lo], b = r.pts[lo + 1];
      const seg = r.cum[lo + 1] - r.cum[lo] || 1, t = (s - r.cum[lo]) / seg;
      g.visible = true;
      trafficPos[i] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      g.position.set(a[0] + (b[0] - a[0]) * t, 0.02, a[1] + (b[1] - a[1]) * t);
      g.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    }
  });
  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
          <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[0.3, 0.1, 0.62]} /><meshStandardMaterial color={CAR_COLORS[i % CAR_COLORS.length]} /></mesh>
          <mesh position={[0, 0.19, -0.04]}><boxGeometry args={[0.26, 0.09, 0.3]} /><meshStandardMaterial color="#263238" /></mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 0.1, 0.11, 0.31]}><boxGeometry args={[0.07, 0.04, 0.02]} /><meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={0.6} /></mesh>
          ))}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
            <mesh key={k} position={[sx * 0.16, 0.04, sz * 0.2]}><boxGeometry args={[0.04, 0.08, 0.12]} /><meshStandardMaterial color="#111827" /></mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/* ───────────── วัด (โมเดล): อุโบสถหลังคาซ้อน / วิหารทรงปราสาทยอดทอง ───────────── */
function Gable({ span, length, rise, color }: { span: number; length: number; rise: number; color: string }) {
  const geo = useMemo(() => {
    const hw = span / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, rise); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: length, bevelEnabled: false });
    g.translate(0, 0, -length / 2);
    return g;
  }, [span, length, rise]);
  return <mesh geometry={geo} castShadow><meshStandardMaterial color={color} roughness={0.7} /></mesh>;
}

export function Temple({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const sc = it.s ?? 1;
  const gold = <meshStandardMaterial color="#fbbf24" metalness={0.4} roughness={0.35} />;
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]} scale={sc}>
      {it.kind === "prasat" ? (
        <>
          <mesh position={[0, 0.04, 0]} receiveShadow><boxGeometry args={[1.7, 0.08, 1.7]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
          <mesh position={[0, 0.12, 0]}><boxGeometry args={[1.4, 0.08, 1.4]} /><meshStandardMaterial color="#f3f4f6" /></mesh>
          <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.95, 0.58, 0.95]} /><meshStandardMaterial color="#f5deb3" /></mesh>
          <mesh position={[0, 0.34, 0.48]}><boxGeometry args={[0.28, 0.36, 0.02]} /><meshStandardMaterial color="#7c4a1e" /></mesh>
          {[[0.9, 0.35, "#e8590c"], [0.62, 0.3, "#f59f00"], [0.4, 0.3, "#e8590c"]].map(([r, h, c], k) => (
            <mesh key={k} position={[0, 0.78 + k * 0.28, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[r as number, h as number, 4]} /><meshStandardMaterial color={c as string} />
            </mesh>
          ))}
          <mesh position={[0, 1.95, 0]}><coneGeometry args={[0.07, 0.9, 8]} />{gold}</mesh>
          <mesh position={[0, 2.42, 0]}><sphereGeometry args={[0.05, 8, 8]} />{gold}</mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[3.6, 0.1, 2.2]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
          <mesh position={[0, 0.04, 1.2]}><boxGeometry args={[1.2, 0.07, 0.25]} /><meshStandardMaterial color="#d1d5db" /></mesh>
          <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[2.6, 0.6, 1.3]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
          <mesh position={[0, 0.31, 0.66]}><boxGeometry args={[0.34, 0.42, 0.02]} /><meshStandardMaterial color="#7c4a1e" /></mesh>
          {[-0.85, 0.85].map((wx) => (
            <mesh key={wx} position={[wx, 0.42, 0.66]}><boxGeometry args={[0.22, 0.28, 0.02]} /><meshStandardMaterial color="#74c0fc" /></mesh>
          ))}
          <group position={[0, 0.7, 0]} rotation={[0, Math.PI / 2, 0]}><Gable span={1.9} length={3.1} rise={0.45} color="#e8590c" /></group>
          <group position={[0, 0.98, 0]} rotation={[0, Math.PI / 2, 0]}><Gable span={1.25} length={2.2} rise={0.4} color="#c92a2a" /></group>
          <group position={[0, 0.62, 0.95]}><Gable span={1.3} length={0.9} rise={0.35} color="#f59f00" /></group>
          {[-0.5, -0.17, 0.17, 0.5].map((px_) => (
            <mesh key={px_} position={[px_, 0.38, 1.05]}><cylinderGeometry args={[0.035, 0.035, 0.55, 8]} /><meshStandardMaterial color="#ffffff" /></mesh>
          ))}
          {[-1.55, 1.55].map((fx) => (
            <mesh key={fx} position={[fx, 1.22, 0]}><coneGeometry args={[0.04, 0.2, 6]} />{gold}</mesh>
          ))}
        </>
      )}
      <Tag y={it.kind === "prasat" ? 2.7 : 1.7}>🛕 {it.name || "วัดเขียนเขต"}</Tag>
    </group>
  );
}

/* ───────────── ป้ายจราจร/บอกทาง (ขึ้นบรรทัดใหม่ด้วย |) ───────────── */
export function RoadSign({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 70) / 30;
  const lines = (it.name || "").split("|");
  const H = 0.22 + lines.length * 0.15;
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      {[-1, 1].map((sg) => (
        <mesh key={sg} position={[sg * (W / 2 - 0.08), 0.5, 0]}><cylinderGeometry args={[0.022, 0.022, 1.0, 6]} /><meshStandardMaterial color="#6b7280" /></mesh>
      ))}
      <mesh position={[0, 1.0 + H / 2 - 0.1, -0.005]}><boxGeometry args={[W + 0.05, H + 0.05, 0.035]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[0, 1.0 + H / 2 - 0.1, 0]} castShadow><boxGeometry args={[W, H, 0.045]} /><meshStandardMaterial color={it.color ?? "#15803d"} /></mesh>
      <Html position={[0, 1.0 + H / 2 - 0.1, 0.04]} center distanceFactor={11} zIndexRange={[10, 0]}>
        <div className="pointer-events-none text-center text-white font-black leading-tight whitespace-nowrap text-[10px]">
          {lines.map((l, i) => <div key={i} className={i === 0 ? "text-[12px]" : ""}>{l}</div>)}
        </div>
      </Html>
    </group>
  );
}

/* ───────────── ทางม้าลาย: w = ความยาวข้ามถนน, d = ความลึกริ้ว (ขนานทิศถนน), rot = ทิศถนน ───────────── */
export function Zebra({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 52) / 30, D = (it.d ?? 12) / 30;
  const items = useMemo(() => {
    const n = Math.max(2, Math.floor(W / 0.14));
    return Array.from({ length: n }, (_, i): Item => ({ p: [0, 0.05, -W / 2 + (i + 0.5) * (W / n)], s: [D, 0.008, 0.07], c: "#ffffff" }));
  }, [W, D]);
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <InstX items={items}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
    </group>
  );
}

/* ───────────── รั้วสนามกีฬา (ตาข่าย) ───────────── */
export function FieldFence({ it }: { it: DecorItem }) {
  const [x, z] = px(it.x, it.y);
  const W = (it.w ?? 69) / 30, D = (it.d ?? 104) / 30, H = 0.7 * (it.h ?? 1);
  const posts = useMemo(() => {
    const out: Item[] = [];
    const side = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.1));
      for (let i = 0; i < n; i++) out.push({ p: [x0 + ((x1 - x0) * i) / n, H / 2, z0 + ((z1 - z0) * i) / n], s: [1, H, 1] });
    };
    side(-W / 2, -D / 2, W / 2, -D / 2); side(W / 2, -D / 2, W / 2, D / 2);
    side(W / 2, D / 2, -W / 2, D / 2); side(-W / 2, D / 2, -W / 2, -D / 2);
    return out;
  }, [W, D, H]);
  const net = <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />;
  return (
    <group position={[x, 0, z]} rotation={[0, rad(it), 0]}>
      <InstX items={posts}><cylinderGeometry args={[0.02, 0.02, 1, 6]} /><meshStandardMaterial color="#475569" /></InstX>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, H * 0.48, s * D / 2]}><boxGeometry args={[W, H * 0.92, 0.01]} />{net}</mesh>
          <mesh position={[s * W / 2, H * 0.48, 0]}><boxGeometry args={[0.01, H * 0.92, D]} />{net}</mesh>
          <mesh position={[0, H, s * D / 2]}><boxGeometry args={[W, 0.025, 0.025]} /><meshStandardMaterial color="#475569" /></mesh>
          <mesh position={[s * W / 2, H, 0]}><boxGeometry args={[0.025, 0.025, D]} /><meshStandardMaterial color="#475569" /></mesh>
        </group>
      ))}
      {it.name && <Tag y={H + 0.25}>{it.name}</Tag>}
    </group>
  );
}

/* ───────────── กลุ่มนักเรียน/ครู ทำกิจกรรม: walk | assemble | sit | play | exercise | follow (เดินตามถนน/ฟุตบาท) ───────────── */
export function People({ it, roads }: { it: DecorItem; roads?: RoadItem[] }) {
  const [cx, cz] = px(it.x, it.y);
  const W = (it.w ?? 60) / 30, D = (it.d ?? 40) / 30;
  const n = Math.max(0, Math.min(120, Math.round(it.n ?? 10)));
  const m = Math.max(0, Math.min(20, Math.round(it.m ?? 1)));
  const kind = it.kind ?? "walk";
  const total = n + m;
  const legs = useRef<THREE.InstancedMesh>(null);
  const body = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // เส้นทางสำหรับ kind = follow
  const path = useMemo(() => {
    if (kind !== "follow") return null;
    const r = roads?.find((x) => x.id === it.road);
    if (!r || r.pts.length < 2) return null;
    const pts = sampleRoad(r.pts, r.curve ?? 0);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, total: cum[cum.length - 1] };
  }, [kind, roads, it.road]);

  const ppl = useMemo(() => {
    const r = rng(Math.round(it.x * 7 + it.y * 13 + total * 31));
    const cols = Math.max(1, Math.ceil(Math.sqrt((Math.max(n, 1) * W) / D))), rows = Math.max(1, Math.ceil(Math.max(n, 1) / cols));
    const R = Math.min(W, D) * 0.42;
    const tcols = ["#2563eb", "#db2777", "#059669", "#7c3aed"];
    return Array.from({ length: total }, (_, i) => {
      const teacher = i >= n;
      const ti = i - n;
      let gx = 0, gz = 0;
      if (kind === "assemble" || kind === "exercise") {
        if (!teacher) { gx = -W / 2 + ((i % cols) + 0.5) * (W / cols); gz = -D / 2 + (Math.floor(i / cols) + 0.5) * (D / rows); }
        else { gx = -W / 2 + ((ti + 0.5) * W) / Math.max(m, 1); gz = -D / 2 - 0.25; }
      } else if (kind === "sit") {
        if (!teacher) { const a = (i / Math.max(n, 1)) * Math.PI * 2; gx = Math.cos(a) * R; gz = Math.sin(a) * R; }
        else { gx = (ti - (m - 1) / 2) * 0.2; gz = 0; }
      }
      return {
        teacher, gx, gz, ph: r() * 6.28, dx: r() - 0.5, dz: r() - 0.5, sp: 0.6 + r() * 0.8,
        bx: (r() - 0.5) * W, bz: (r() - 0.5) * D, tc: tcols[i % tcols.length],
        s0: (i / Math.max(total, 1)) * 1, lat: (r() - 0.5) * 0.35,
      };
    });
  }, [it.x, it.y, n, m, total, kind, W, D]);

  useLayoutEffect(() => {
    const c = new THREE.Color();
    ppl.forEach((p, i) => {
      body.current?.setColorAt(i, c.set(p.teacher ? p.tc : "#ffffff"));
      legs.current?.setColorAt(i, c.set(p.teacher ? "#374151" : "#1e2a4a"));
      head.current?.setColorAt(i, c.set("#f1c27d"));
    });
    [legs, body, head].forEach((r) => { if (r.current?.instanceColor) r.current.instanceColor.needsUpdate = true; });
  }, [ppl]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!legs.current || !body.current || !head.current) return;
    ppl.forEach((p, i) => {
      let x = p.gx, z = p.gz, y = 0, h = 0;
      const sit = kind === "sit" && !p.teacher;
      if (kind === "follow") {
        if (path) {
          const s = ((t * 0.45 * p.sp * (p.teacher ? 0.8 : 1) + p.s0 * path.total) % path.total + path.total) % path.total;
          let lo = 0;
          while (lo < path.cum.length - 2 && path.cum[lo + 1] < s) lo++;
          const a = path.pts[lo], b = path.pts[lo + 1];
          const seg = path.cum[lo + 1] - path.cum[lo] || 1, f = (s - path.cum[lo]) / seg;
          const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
          x = a[0] + dx * f - (dz / L) * p.lat; z = a[1] + dz * f + (dx / L) * p.lat;
          h = Math.atan2(dx, dz); y = 0.07 + Math.abs(Math.sin(t * 6 + p.ph)) * 0.02;
        }
      } else if (kind === "walk") {
        const a = t * p.sp * 0.5 + p.ph, c = Math.cos(a);
        x = p.bx + p.dx * Math.sin(a) * W * 0.6; z = p.bz + p.dz * Math.sin(a) * D * 0.6;
        h = Math.atan2(p.dx * c, p.dz * c); y = Math.abs(Math.sin(t * 6 + p.ph)) * 0.02;
      } else if (kind === "play") {
        const a = t * p.sp * 1.5 + p.ph;
        x = p.bx * 0.4 + Math.cos(a) * W * 0.4; z = p.bz * 0.4 + Math.sin(a) * D * 0.4;
        h = Math.atan2(-Math.sin(a) * W, Math.cos(a) * D); y = Math.abs(Math.sin(t * 9 + p.ph)) * 0.04;
      } else if (kind === "exercise") {
        y = p.teacher ? 0 : Math.abs(Math.sin(t * 4)) * 0.07;
      } else if (kind === "sit") {
        h = Math.atan2(-x, -z);
      }
      const lh = sit ? 0.08 : 0.2, bh = 0.26;
      dummy.position.set(x, y + lh / 2, z); dummy.rotation.set(0, h, 0); dummy.scale.set(0.16, lh, 0.12); dummy.updateMatrix(); legs.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, y + lh + bh / 2, z); dummy.scale.set(0.22, bh, 0.13); dummy.updateMatrix(); body.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, y + lh + bh + 0.07, z); dummy.scale.set(0.16, 0.16, 0.16); dummy.updateMatrix(); head.current!.setMatrixAt(i, dummy.matrix);
    });
    [legs, body, head].forEach((r) => { r.current!.instanceMatrix.needsUpdate = true; });
  });

  const cnt = Math.max(total, 1);
  const absolute = kind === "follow";   // เดินตามถนน: พิกัดเป็นโลกจริง ไม่ผูกกับตำแหน่งกลุ่ม
  return (
    <group position={absolute ? [0, 0, 0] : [cx, 0, cz]} rotation={absolute ? [0, 0, 0] : [0, rad(it), 0]}>
      <instancedMesh key={`l${total}`} ref={legs} args={[undefined as any, undefined as any, cnt]} count={total} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh key={`b${total}`} ref={body} args={[undefined as any, undefined as any, cnt]} count={total} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh key={`h${total}`} ref={head} args={[undefined as any, undefined as any, cnt]} count={total} frustumCulled={false}>
        <sphereGeometry args={[0.5, 10, 10]} /><meshStandardMaterial color="#ffffff" />
      </instancedMesh>
      {it.name && !absolute && <Tag y={0.9}>{it.name} · นร. {n} · ครู {m}</Tag>}
    </group>
  );
}