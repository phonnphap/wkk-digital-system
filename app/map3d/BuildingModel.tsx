"use client";

import * as THREE from "three";
import { Edges, Html } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { FH, MapLocation, MapRoom, StairSpan, isLongX, rotRad, corridorV, stairSpans, stairsVisible, longLen, CORRIDOR_W } from "./schoolData";
import { Inst, Item, PinLabel } from "./SceneDecor";

export const buildingHeight = (l: MapLocation) =>
  l.kind === "gate" ? 1 : l.kind === "dome" ? 1.5 : Math.max(l.floors, 1) * FH;

const roofHeight = (l: MapLocation) => Math.min(1, Math.max(0.3, Math.min(l.size[0], l.size[1]) * 0.28));

/* ── พื้นผิวผนังพร้อมหน้าต่าง (วาดด้วย canvas ไม่ต้องใช้ไฟล์รูป) ── */
let wallTex: THREE.CanvasTexture | null = null;
function getWallTexture() {
  if (wallTex) return wallTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f3ead8"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#cdbf9f"; g.fillRect(0, 118, 128, 10);
  g.fillStyle = "#ffffff"; g.fillRect(20, 24, 88, 72);
  g.fillStyle = "#7fb8e6"; g.fillRect(25, 29, 36, 62); g.fillRect(67, 29, 36, 62);
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(25, 29, 12, 62); g.fillRect(67, 29, 12, 62);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  wallTex = t;
  return t;
}

function GableRoof({ w, d, color, rh }: { w: number; d: number; color: string; rh: number }) {
  const longX = w >= d;
  const S = Math.min(w, d), L = Math.max(w, d);
  const geo = useMemo(() => {
    const hw = S / 2 + 0.12;
    const sh = new THREE.Shape();
    sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, rh); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: L + 0.24, bevelEnabled: false });
    g.translate(0, 0, -(L + 0.24) / 2);
    return g;
  }, [S, L, rh]);
  return (
    <mesh geometry={geo} rotation={[0, longX ? Math.PI / 2 : 0, 0]} castShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

type ModelProps = { loc: MapLocation; dim: boolean; selected: boolean; onPick: (id: string) => void };

/* ───────────── อาคารมุมมองภายนอก ───────────── */
function BoxBuilding({ loc, dim, selected, onPick }: ModelProps) {
  const [hover, setHover] = useState(false);
  const [w, d] = loc.size;
  const floors = Math.max(loc.floors, 1);
  const h = buildingHeight(loc);
  const rh = roofHeight(loc);
  const plain = loc.kind === "facility";

  const mats = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({ color: "#cbbf9f" });
    if (plain) {
      const a = new THREE.MeshStandardMaterial({ color: new THREE.Color(loc.color).lerp(new THREE.Color("#ffffff"), 0.4) });
      return [a, a, top, top, a, a];
    }
    const mk = (len: number) => {
      const t = getWallTexture().clone();
      t.needsUpdate = true;
      t.repeat.set(Math.max(1, Math.round(len / 0.95)), loc.kind === "gate" ? 1 : floors);
      return new THREE.MeshStandardMaterial({ map: t });
    };
    const mx = mk(d), mz = mk(w);
    return [mx, mx, top, top, mz, mz];
  }, [w, d, floors, plain, loc.color, loc.kind]);

  useEffect(() => {
    const hl = hover || selected;
    mats.forEach((m) => {
      m.transparent = dim;
      m.opacity = dim ? 0.12 : 1;
      m.depthWrite = !dim;
      m.emissive.set(hl ? "#ffffff" : "#000000");
      m.emissiveIntensity = hl ? 0.2 : 0;
      m.needsUpdate = true;
    });
  }, [mats, dim, hover, selected]);

  return (
    <group position={[loc.pos[0], 0, loc.pos[1]]} rotation={[0, -rotRad(loc), 0]}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[w + 0.1, 0.06, d + 0.1]} />
        <meshStandardMaterial color="#9ca3af" transparent={dim} opacity={dim ? 0.15 : 1} />
      </mesh>
      <mesh
        position={[0, h / 2, 0]} material={mats} castShadow receiveShadow
        onClick={(e) => { e.stopPropagation(); onPick(loc.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {!dim && (
        <group position={[0, h, 0]}>
          <GableRoof w={w} d={d} rh={rh} color={plain ? new THREE.Color(loc.color).multiplyScalar(0.75).getStyle() : loc.color} />
        </group>
      )}
      {!dim && <PinLabel code={loc.code} y={h + rh + 0.5} onClick={() => onPick(loc.id)} />}
    </group>
  );
}

/* ───────────── โดมกีฬา: หลังคาโค้ง เสาเปิดข้าง พื้นเป็นสนาม ───────────── */
function DomeModel({ loc, dim, selected, onPick }: ModelProps) {
  const [hover, setHover] = useState(false);
  const [w, d] = loc.size;
  const long = w >= d;
  const L = Math.max(w, d), W = Math.min(w, d);
  const r = W / 2;
  const colH = 0.5;                                  // ความสูงเสา
  const rise = Math.max(0.5, Math.min(1.0, r * 0.9)); // ความสูงของส่วนโค้ง
  const k = rise / r;
  const hl = hover || selected;
  const op = dim ? 0.18 : 1;
  const accent = useMemo(() => new THREE.Color(loc.color), [loc.color]);
  const court = useMemo(() => accent.clone().lerp(new THREE.Color("#ffffff"), 0.1).getStyle(), [accent]);
  const roof = useMemo(() => accent.clone().lerp(new THREE.Color("#ffffff"), 0.55).getStyle(), [accent]);
  const nCol = Math.max(3, Math.round(L / 1.1) + 1);
  const xs = useMemo(() => Array.from({ length: nCol }, (_, i) => -L / 2 + (L * i) / (nCol - 1)), [nCol, L]);
  const cw = L - 0.16, cd = W - 0.16; // ขนาดสนาม
  const stageSide = loc.stage ?? "none";
const ss = stageSide === "none" ? 0 : (stageSide === "start") === long ? -1 : 1;
const sl = Math.min(Math.max(L * 0.22, 0.5), 1.6);
  const line = (x: number, z: number, sx: number, sz: number, key: string) => (
    <mesh key={key} position={[x, 0.088, z]}>
      <boxGeometry args={[sx, 0.006, sz]} /><meshStandardMaterial color="#ffffff" transparent={dim} opacity={op} />
    </mesh>
  );
  return (
    <group
      position={[loc.pos[0], 0, loc.pos[1]]} rotation={[0, -rotRad(loc), 0]}
      onClick={(e) => { e.stopPropagation(); onPick(loc.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
    >
      <group rotation={[0, long ? 0 : Math.PI / 2, 0]}>
        {/* ฐานคอนกรีต + พื้นสนาม */}
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <boxGeometry args={[L + 0.1, 0.06, W + 0.1]} />
          <meshStandardMaterial color="#adb5bd" transparent={dim} opacity={op} />
        </mesh>
        <mesh position={[0, 0.07, 0]} receiveShadow>
          <boxGeometry args={[cw, 0.02, cd]} />
          <meshStandardMaterial color={court} transparent={dim} opacity={op} emissive={hl ? "#ffffff" : "#000000"} emissiveIntensity={hl ? 0.18 : 0} />
        </mesh>
        {/* เส้นสนาม */}
        {line(0, -(cd / 2 - 0.05), cw - 0.1, 0.02, "t")}
        {line(0, cd / 2 - 0.05, cw - 0.1, 0.02, "b")}
        {line(-(cw / 2 - 0.05), 0, 0.02, cd - 0.1, "l")}
        {line(cw / 2 - 0.05, 0, 0.02, cd - 0.1, "r")}
        {line(0, 0, 0.02, cd - 0.1, "c")}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.089, 0]}>
          <ringGeometry args={[cd * 0.16, cd * 0.16 + 0.02, 32]} />
          <meshStandardMaterial color="#ffffff" transparent={dim} opacity={op} />
        </mesh>
        {/* ห่วงบาส/ประตูที่หัวท้ายสนาม */}
        {!dim && [-1, 1].filter((s) => s !== ss).map((s) => (
          <group key={s} position={[s * (cw / 2 - 0.08), 0, 0]}>
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.012, 0.012, 0.36, 6]} /><meshStandardMaterial color="#343a40" /></mesh>
            <mesh position={[-s * 0.03, 0.36, 0]}><boxGeometry args={[0.012, 0.12, 0.18]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
          </group>
        ))}
        {!dim && ss !== 0 && (
  <group position={[ss * (cw / 2 - sl / 2), 0, 0]}>
    <mesh position={[0, 0.14, 0]} castShadow receiveShadow><boxGeometry args={[sl, 0.12, cd]} /><meshStandardMaterial color="#8d6e63" /></mesh>
    <mesh position={[ss * (sl / 2 - 0.02), 0.42, 0]}><boxGeometry args={[0.04, 0.44, cd * 0.96]} /><meshStandardMaterial color={accent.clone().multiplyScalar(0.6).getStyle()} /></mesh>
    {[-1, 1].map((z) => (
      <mesh key={z} position={[ss * (sl / 2 - 0.08), 0.42, z * (cd / 2 - 0.1)]}><boxGeometry args={[0.05, 0.44, 0.16]} /><meshStandardMaterial color="#c92a2a" /></mesh>
    ))}
    <mesh position={[-ss * (sl / 2 + 0.05), 0.09, 0]}><boxGeometry args={[0.1, 0.06, Math.min(0.5, cd * 0.4)]} /><meshStandardMaterial color="#a1887f" /></mesh>
  </group>
)}

        {!dim && (
          <>
            {/* เสาสองฝั่ง */}
            {xs.flatMap((x) => [-1, 1].map((s) => (
              <mesh key={`c${x}${s}`} position={[x, colH / 2, s * (r - 0.03)]} castShadow>
                <cylinderGeometry args={[0.035, 0.035, colH, 8]} /><meshStandardMaterial color="#dee2e6" />
              </mesh>
            )))}
            {/* หลังคาโค้งครึ่งทรงกระบอก + ซี่โครง */}
            <group position={[0, colH, 0]} scale={[1, k, 1]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[r, r, L, 28, 1, true, 0, Math.PI]} />
                <meshStandardMaterial color={roof} side={THREE.DoubleSide} roughness={0.5} metalness={0.15}
                  emissive={hl ? "#ffffff" : "#000000"} emissiveIntensity={hl ? 0.15 : 0} />
              </mesh>
              {xs.map((x) => (
                <mesh key={`r${x}`} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                  <torusGeometry args={[r, 0.022 / Math.max(k, 0.5), 6, 28, Math.PI]} />
                  <meshStandardMaterial color="#f1f3f5" />
                </mesh>
              ))}
              {[-1, 1].map((s) => (
                <mesh key={`e${s}`} position={[s * L / 2, 0, 0]} rotation={[0, s * Math.PI / 2, 0]}>
                  <circleGeometry args={[r, 28, 0, Math.PI]} />
                  <meshStandardMaterial color="#e7f5ff" transparent opacity={0.4} side={THREE.DoubleSide} />
                </mesh>
              ))}
            </group>
          </>
        )}
      </group>
      {!dim && <PinLabel code={loc.code} y={colH + rise + 0.55} onClick={() => onPick(loc.id)} />}
    </group>
  );
}

export function BuildingModel(props: ModelProps) {
  return props.loc.kind === "dome" ? <DomeModel {...props} /> : <BoxBuilding {...props} />;
}

/* ───────────── ห้องภายในอาคาร (มีโต๊ะ/กระดาน) ───────────── */

const TYPE_COLOR: Record<string, string> = {
  classroom: "#dbe4ff", office: "#fff3bf", library: "#d3f9d8", lab: "#e5dbff", computer: "#d0ebff",
  nurse: "#ffe3e3", music_thai: "#ffe8cc", music_western: "#f3d9fa", canteen: "#fff9db",
  toilet: "#c5f6fa", hall: "#ffe8cc", other: "#e9ecef",
};
export const TYPE_LABEL: Record<string, string> = {
  classroom: "ห้องเรียน", office: "ห้องสำนักงาน", library: "ห้องสมุด", lab: "ห้อง Lab วิทยาศาสตร์",
  computer: "ห้องคอมพิวเตอร์", nurse: "ห้องพยาบาล", music_thai: "ห้องดนตรีไทย", music_western: "ห้องดนตรีสากล",
  canteen: "โรงอาหาร", toilet: "ห้องน้ำ", hall: "หอประชุม", other: "ห้องอื่น ๆ",
};
export const AC_LABEL: Record<string, string> = {
  none: "ไม่มีแอร์/พัดลม", ac: "ห้องแอร์", fan: "ห้องพัดลม", both: "แอร์ + พัดลม",
};
type Fr = { A: number; D: number; alongX: boolean; sgn: number };

function frameOf(room: MapRoom, w: number, d: number, cx: number, cz: number, rw: number, rd: number): Fr {
  const dx = (room.door[0] - 0.5) * w - cx, dz = (room.door[1] - 0.5) * d - cz;
  const alongX = Math.abs(dx) > Math.abs(dz);
  const sgn = (alongX ? dx : dz) >= 0 ? 1 : -1;
  const iw = Math.max(rw - 0.1, 0.1), id = Math.max(rd - 0.1, 0.1);
  return { A: alongX ? id : iw, D: alongX ? iw : id, alongX, sgn };
}

const Y0 = 0.11;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** a = ตำแหน่งตามความกว้างห้อง, t = ระยะจากผนังด้านในสุด (ฝั่งตรงข้ามประตู) */
function buildFurniture(type: string, name: string, ac: string, fr: Fr): Item[] {
  const { A, D, alongX, sgn } = fr;
  const out: Item[] = [];
  const box = (a: number, t: number, sa: number, st: number, h: number, c: string, y = Y0) => {
    const dep = -sgn * (D / 2) + sgn * t;
    const [x, z] = alongX ? [dep, a] : [a, dep];
    out.push({ p: [x, y + h / 2, z], s: alongX ? [st, h, sa] : [sa, h, st], c });
  };
  const cols = (n: number) => Array.from({ length: n }, (_, i) => -A / 2 + ((i + 0.5) * A) / n);

  switch (type) {
    case "office": {
      const n = clamp(Math.floor(A / 0.3), 1, 5), rows = D > 0.8 ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        const t = rows === 1 ? D * 0.55 : D * (0.4 + r * 0.3);
        cols(n).forEach((a) => {
          box(a, t, 0.22, 0.12, 0.09, "#b08968");
          box(a, t - 0.02, 0.1, 0.012, 0.07, "#212529", Y0 + 0.09);
          box(a, t + 0.12, 0.08, 0.08, 0.07, "#495057");
        });
      }
      box(0, 0.05, A * 0.6, 0.07, 0.26, "#adb5bd");
      break;
    }
    case "library": {
      const bc = ["#f03e3e", "#339af0", "#51cf66", "#fcc419", "#845ef7"];
      box(0, 0.04, A * 0.92, 0.06, 0.3, "#8d6e63");
      cols(6).forEach((a, k) => box(a, 0.075, A * 0.12, 0.012, 0.2, bc[k % 5], Y0 + 0.02));
      [D * 0.4, D * 0.6].forEach((t) => {
        box(0, t, A * 0.7, 0.05, 0.2, "#a1887f");
        box(0, t, A * 0.66, 0.056, 0.05, "#e8590c", Y0 + 0.2);
      });
      [-1, 1].forEach((s) => {
        box(s * A * 0.22, D * 0.85, 0.22, 0.1, 0.08, "#c08457");
        box(s * A * 0.22, D * 0.85 + 0.1, 0.07, 0.07, 0.06, "#495057");
      });
      break;
    }
    case "lab": {
      const nb = D > 0.9 ? 2 : 1;
      const cc = ["#51cf66", "#ff922b", "#339af0", "#f06595"];
      for (let r = 0; r < nb; r++) {
        const t = nb === 1 ? D * 0.55 : D * (0.42 + r * 0.28);
        box(0, t, A * 0.8, 0.1, 0.1, "#37474f");
        box(-A * 0.3, t, 0.08, 0.06, 0.02, "#cfd8dc", Y0 + 0.1);
        cc.forEach((c, k) => box(-A * 0.12 + k * A * 0.1, t, 0.025, 0.025, 0.05, c, Y0 + 0.1));
        cols(4).forEach((a) => box(a, t + 0.11, 0.05, 0.05, 0.06, "#868e96"));
      }
      box(0, 0.06, A * 0.4, 0.08, 0.1, "#e9ecef");
      box(A * 0.33, 0.04, 0.12, 0.07, 0.3, "#adb5bd");
      break;
    }
    case "computer": {
      const n = clamp(Math.floor(A / 0.24), 2, 8);
      const rowsT = D > 1.3 ? [0.3, 0.5, 0.7] : D > 0.8 ? [0.38, 0.65] : [0.5];
      rowsT.forEach((f) => cols(n).forEach((a) => {
        const t = D * f;
        box(a, t, 0.21, 0.1, 0.08, "#e9ecef");
        box(a, t - 0.02, 0.1, 0.012, 0.08, "#212529", Y0 + 0.08);
        box(a, t - 0.012, 0.085, 0.004, 0.065, "#4dabf7", Y0 + 0.085);
        box(a, t + 0.035, 0.07, 0.025, 0.006, "#adb5bd", Y0 + 0.08);
        box(a, t + 0.11, 0.07, 0.07, 0.06, "#364fc7");
      }));
      box(0, 0.07, 0.3, 0.08, 0.09, "#7f5539");
      box(0, 0.012, A * 0.6, 0.012, 0.18, "#f8f9fa", Y0 + 0.1);
      break;
    }
    case "nurse": {
      const beds = A > 0.8 ? [-A * 0.25, A * 0.25] : [0];
      const bl = Math.min(0.34, D * 0.5);
      beds.forEach((a) => {
        box(a, D * 0.35, 0.22, bl, 0.06, "#e9ecef");
        box(a, D * 0.35, 0.2, bl * 0.95, 0.03, "#bac8ff", Y0 + 0.06);
        box(a, D * 0.35 - bl * 0.38, 0.12, 0.06, 0.025, "#ffffff", Y0 + 0.09);
      });
      box(A * 0.33, 0.05, 0.16, 0.07, 0.3, "#f1f3f5");
      box(A * 0.33, 0.088, 0.06, 0.004, 0.018, "#e03131", Y0 + 0.2);
      box(A * 0.33, 0.088, 0.018, 0.004, 0.06, "#e03131", Y0 + 0.18);
      box(-A * 0.3, D * 0.85, 0.2, 0.1, 0.09, "#c08457");
      box(-A * 0.3, D * 0.85 + 0.1, 0.07, 0.07, 0.06, "#495057");
      box(A * 0.3, D * 0.8, 0.06, 0.06, 0.03, "#495057");
      break;
    }
    case "music_thai": {
      box(0, D * 0.5, A * 0.92, D * 0.86, 0.008, "#c1121f");
      [-1, 1].forEach((s) => {
        box(s * A * 0.22, D * 0.3, 0.34, 0.09, 0.05, "#6d4c41", Y0 + 0.008);
        box(s * A * 0.22, D * 0.3, 0.3, 0.075, 0.012, "#f2b705", Y0 + 0.058);
      });
      const ct = D * 0.58;
      box(0, ct, 0.24, 0.24, 0.03, "#7f5539", Y0 + 0.008);
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        box(Math.cos(ang) * 0.09, ct + Math.sin(ang) * 0.09, 0.035, 0.035, 0.035, "#f2b705", Y0 + 0.04);
      }
      [-0.3, 0, 0.3].forEach((f) => {
        box(f * A, 0.09, 0.06, 0.06, 0.07, "#9c6644", Y0 + 0.008);
        box(f * A, 0.09, 0.05, 0.05, 0.01, "#f1d9b5", Y0 + 0.078);
      });
      cols(4).forEach((a) => box(a, D * 0.88, 0.07, 0.07, 0.025, "#e8590c", Y0 + 0.008));
      break;
    }
    case "music_western": {
      box(-A * 0.25, 0.08, 0.34, 0.14, 0.14, "#212529");
      box(-A * 0.25, 0.16, 0.3, 0.04, 0.012, "#f8f9fa", Y0 + 0.14);
      box(-A * 0.25, 0.27, 0.16, 0.07, 0.06, "#343a40");
      const dx = A * 0.28, dt = D * 0.45;
      box(dx, dt, 0.09, 0.09, 0.09, "#c92a2a");
      box(dx - 0.1, dt + 0.05, 0.06, 0.06, 0.04, "#dee2e6", Y0 + 0.06);
      [[0.1, -0.04], [-0.1, -0.06]].forEach(([ox, ot]) => {
        box(dx + ox, dt + ot, 0.006, 0.006, 0.2, "#868e96");
        box(dx + ox, dt + ot, 0.09, 0.09, 0.004, "#fcc419", Y0 + 0.2);
      });
      [-1, 1].forEach((s) => {
        box(s * A * 0.2, D * 0.78, 0.22, 0.07, 0.04, "#212529", Y0 + 0.06);
        box(s * A * 0.2, D * 0.78, 0.2, 0.05, 0.06, "#868e96");
        box(s * A * 0.2, D * 0.78 + 0.01, 0.2, 0.03, 0.006, "#f8f9fa", Y0 + 0.1);
        box(s * A * 0.2, D * 0.78 + 0.1, 0.07, 0.07, 0.06, "#495057");
      });
      [-0.35, 0, 0.35].forEach((f) => {
        box(f * A, D * 0.62, 0.004, 0.004, 0.18, "#6c757d");
        box(f * A, D * 0.62, 0.07, 0.01, 0.05, "#212529", Y0 + 0.18);
      });
      break;
    }
    case "canteen": {
      const nc = clamp(Math.floor(A / 0.45), 1, 4), nr = clamp(Math.floor((D - 0.3) / 0.28), 1, 5);
      for (let r = 0; r < nr; r++) {
        const t = 0.3 + ((r + 0.5) * (D - 0.3)) / nr;
        cols(nc).forEach((a) => {
          box(a, t, 0.34, 0.1, 0.07, "#ffd8a8");
          box(a, t - 0.085, 0.34, 0.035, 0.04, "#868e96");
          box(a, t + 0.085, 0.34, 0.035, 0.04, "#868e96");
        });
      }
      box(0, 0.06, A * 0.85, 0.09, 0.12, "#e67700");
      box(0, 0.06, A * 0.85, 0.095, 0.02, "#fff3bf", Y0 + 0.12);
      break;
    }
    case "hall": {
      box(0, D * 0.1, A * 0.9, D * 0.2, 0.07, "#7f5539");
      box(0, 0.012, A * 0.9, 0.012, 0.3, "#c92a2a", Y0 + 0.07);
      const nr = clamp(Math.floor((D * 0.65) / 0.1), 2, 10), nc = clamp(Math.floor(A / 0.1), 3, 14);
      for (let r = 0; r < nr; r++) cols(nc).forEach((a) => box(a, D * 0.3 + r * 0.1, 0.05, 0.05, 0.05, "#4263eb"));
      break;
    }
    case "toilet": {
      const male = name.includes("ชาย") && !name.includes("หญิง");
      const n = clamp(Math.floor(A / 0.2), 2, 7), half = Math.ceil(n / 2);
      const wall = name.includes("หญิง") ? "#faa2c1" : name.includes("ชาย") ? "#74c0fc" : "#adb5bd";
      cols(n).forEach((a, i) => {
        if (male && i >= half) box(a, 0.03, 0.05, 0.03, 0.12, "#ffffff", Y0 + 0.08); // โถปัสสาวะ
        else { box(a, 0.06, 0.07, 0.1, 0.06, "#ffffff"); box(a, 0.02, 0.07, 0.03, 0.1, "#ffffff"); }
      });
      const cub = male ? half : n;
      for (let k = 0; k <= cub; k++) box(-A / 2 + (k * A) / n, 0.2, 0.012, 0.36, 0.22, wall);
      box(0, D * 0.85, A * 0.7, 0.07, 0.07, "#e9ecef");
      [-1, 0, 1].forEach((s) => box(s * A * 0.22, D * 0.85, 0.06, 0.05, 0.01, "#4fc3f7", Y0 + 0.07));
      break;
    }
  }

  // แอร์ (ติดผนังด้านใน) / พัดลมเพดาน
  if (ac === "ac" || ac === "both") {
    const k = A > 0.9 ? 2 : 1;
    for (let i = 0; i < k; i++) {
      const a = k === 1 ? 0 : (i ? 1 : -1) * A * 0.25;
      box(a, 0.03, 0.22, 0.05, 0.06, "#f8f9fa", Y0 + 0.3);
      box(a, 0.056, 0.2, 0.004, 0.012, "#74c0fc", Y0 + 0.32);
    }
  }
  if (ac === "fan" || ac === "both") {
    const ts = D > 0.9 ? [0.35, 0.7] : [0.5];
    const as = A > 0.9 ? [-A * 0.25, A * 0.25] : [0];
    ts.forEach((f) => as.forEach((a) => {
      box(a, D * f, 0.035, 0.035, 0.035, "#495057", Y0 + 0.33);
      box(a, D * f, 0.3, 0.03, 0.006, "#ced4da", Y0 + 0.345);
      box(a, D * f, 0.03, 0.3, 0.006, "#ced4da", Y0 + 0.345);
    }));
  }
  return out;
}
function RoomMesh({
  loc, room, active, selected, onPick,
}: { loc: MapLocation; room: MapRoom; active: boolean; selected: boolean; onPick: (r: MapRoom) => void }) {
  const [hover, setHover] = useState(false);
  const [w, d] = loc.size;
  const rw = room.w * w, rd = room.d * d;
  const cx = (room.x + room.w / 2 - 0.5) * w;
  const cz = (room.z + room.d / 2 - 0.5) * d;
  const y = (room.level - 1) * FH;
  const type = room.type ?? "classroom";
  const deskCount = type === "classroom" ? room.desks ?? 30 : 0;
  const teachers = type === "classroom" ? Math.max(0, room.teacherDesks ?? 1) : 0;
  const ac = room.ac ?? "none";
  const fr = useMemo(() => frameOf(room, w, d, cx, cz, rw, rd), [room, w, d, cx, cz, rw, rd]);
  const extra = useMemo(() => buildFurniture(type, room.name, ac, fr), [type, room.name, ac, fr]);

  // ประตู: p = ตำแหน่ง 0..1 ตามความยาวผนังด้านทางเดิน, w = ความกว้าง
  const doorItems = useMemo<Item[]>(() => {
    const list = room.doors && room.doors.length ? room.doors : [{ p: 0.5, w: 0.1 }];
    const { A, D, alongX, sgn } = fr;
    return list.map((dd) => {
      const a = -A / 2 + clamp(dd.p, 0, 1) * A;
      const dep = sgn * (D / 2 + 0.05);
      const dw = Math.max(0.04, Math.min(dd.w, A));
      const p: [number, number, number] = alongX ? [dep, Y0 + 0.13, a] : [a, Y0 + 0.13, dep];
      const s: [number, number, number] = alongX ? [0.035, 0.26, dw] : [dw, 0.26, 0.035];
      return { p, s, c: "#5c3b1e" };
    });
  }, [room.doors, fr]);

  const layout = useMemo(() => {
    if (!deskCount) return null;
    const dx = (room.door[0] - 0.5) * w - cx, dz = (room.door[1] - 0.5) * d - cz;
    const alongX = Math.abs(dx) > Math.abs(dz);
    const sgn = (alongX ? dx : dz) >= 0 ? 1 : -1;
    const iw = Math.max(rw - 0.1, 0.1), id = Math.max(rd - 0.1, 0.1);
    const A = alongX ? id : iw;
    const D = alongX ? iw : id;
    const boardZone = Math.min(0.14, D * 0.18);
    const usable = Math.max(D - boardZone - 0.04, 0.05);
    const cols = Math.max(1, Math.min(deskCount, Math.round(Math.sqrt((deskCount * A) / usable))));
    const rows = Math.ceil(deskCount / cols);
    const cellA = A / cols, cellD = usable / rows;
    const dA = Math.min(cellA * 0.72, 0.16), dD = Math.min(cellD * 0.6, 0.09);
    const to = (a: number, dep: number): [number, number] => (alongX ? [dep, a] : [a, dep]);
    const size = (sa: number, sd: number, sh: number): [number, number, number] => (alongX ? [sd, sh, sa] : [sa, sh, sd]);
    const desks: Item[] = [];
    for (let i = 0; i < deskCount; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const a = -A / 2 + (col + 0.5) * cellA;
      const dep = -sgn * (D / 2) + sgn * (boardZone + 0.02 + (row + 0.5) * cellD);
      const [lx, lz] = to(a, dep);
      desks.push({ p: [lx, 0.15, lz], s: size(dA, dD, 0.04) });
    }
    const tw = Math.min(A * 0.25, 0.22, ((A * 0.6) / Math.max(teachers, 1)) * 0.8);
    const teacherItems: Item[] = [];
    for (let i = 0; i < teachers; i++) {
      const a = teachers === 1 ? 0 : -A * 0.3 + (i * A * 0.6) / (teachers - 1);
      const [tx, tz] = to(a, -sgn * (D / 2 - boardZone * 0.45));
      teacherItems.push({ p: [tx, 0.16, tz], s: size(tw, 0.06, 0.05), c: "#7f5539" });
    }
    const [bx, bz] = to(0, -sgn * (D / 2));
    return {
      desks, teacherItems,
      board: { p: [bx, 0.3, bz] as [number, number, number], s: alongX ? ([0.012, 0.16, A * 0.6] as [number, number, number]) : ([A * 0.6, 0.16, 0.012] as [number, number, number]) },
    };
  }, [deskCount, teachers, room.door, w, d, cx, cz, rw, rd]);

  const base = type === "toilet" && room.name.includes("หญิง") ? "#fcc2d7"
    : type === "toilet" && room.name.includes("ชาย") ? "#a5d8ff"
    : TYPE_COLOR[type] ?? TYPE_COLOR.other;
  const floorColor = active ? "#ffd43b" : selected ? "#ffa94d" : hover ? "#74c0fc" : base;
  return (
    <group position={[cx, y, cz]}>
      <mesh
        position={[0, 0.09, 0]}
        onClick={(e) => { e.stopPropagation(); onPick(room); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={[Math.max(rw - 0.04, 0.05), 0.04, Math.max(rd - 0.04, 0.05)]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <mesh position={[0, 0.28, 0]} raycast={() => null}>
        <boxGeometry args={[rw, 0.4, rd]} />
        <meshBasicMaterial transparent opacity={0.05} depthWrite={false} />
        <Edges color={selected || active ? "#f08c00" : loc.color} />
      </mesh>
      {layout && (
        <>
          <Inst items={layout.desks}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#c08457" /></Inst>
          <Inst items={layout.teacherItems}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
          <mesh position={layout.board.p}><boxGeometry args={layout.board.s} /><meshStandardMaterial color="#f8f9fa" /></mesh>
        </>
      )}
      {extra.length > 0 && (
        <Inst items={extra}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
      )}
      <Inst items={doorItems}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
      <Html position={[0, 0.62, 0]} center distanceFactor={9} zIndexRange={[15, 0]}>
        <div className="px-1.5 py-0.5 rounded bg-white/90 text-[10px] font-bold text-slate-700 whitespace-nowrap shadow pointer-events-none">
          {room.name}{deskCount ? ` · ${deskCount} โต๊ะ` : ""}{room.students ? ` · ${room.students} คน` : ""}{ac !== "none" ? ` · ${AC_LABEL[ac]}` : ""}
        </div>
      </Html>
    </group>
  );
}

function Stairs({ loc, span, y }: { loc: MapLocation; span: StairSpan; y: number }) {
  const [w, d] = loc.size;
  const longX = isLongX(loc);
  const len = span.len;
  const cross = (longX ? d : w) - 0.04;
  const n = 7, run = len / n;
  const outer = span.dir;
  const inner = span.c - (outer * len) / 2;
  const items = useMemo(() => {
    const out: Item[] = [];
    for (let i = 0; i < n; i++) {
      const a = inner + outer * (i + 0.5) * run;
      const h = 0.08 + ((i + 1) / n) * 0.5;
      const P = (cp: number, hh: number): [number, number, number] => (longX ? [a, y + hh / 2, cp] : [cp, y + hh / 2, a]);
      const S = (sc: number, hh: number): [number, number, number] => (longX ? [run * 0.98, hh, sc] : [sc, hh, run * 0.98]);
      out.push({ p: P(0, h), s: S(cross - 0.12, h), c: i % 2 ? "#dee2e6" : "#f8f9fa" });
      [-1, 1].forEach((s) => out.push({ p: P(s * (cross / 2 - 0.03), h + 0.06), s: S(0.06, h + 0.06), c: "#fd7e14" }));
    }
    return out;
  }, [inner, outer, run, y, cross, longX]);
  return (
    <>
      <Inst items={items}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></Inst>
      <Html position={longX ? [span.c, y + 0.95, 0] : [0, y + 0.95, span.c]} center distanceFactor={9}>
        <div className="px-1.5 py-0.5 rounded bg-orange-500 text-white text-[10px] font-black pointer-events-none whitespace-nowrap">🪜 บันได ⬆</div>
      </Html>
    </>
  );
}

export function IndoorBuilding({
  loc, rooms, floor, activeRoomId, selectedRoomId, onRoom,
}: {
  loc: MapLocation; rooms: MapRoom[]; floor: number;
  activeRoomId?: string; selectedRoomId?: string | null; onRoom: (r: MapRoom) => void;
}) {
  const [w, d] = loc.size;
  const cv = corridorV(loc);
  const longX = isLongX(loc);
  const y = (floor - 1) * FH;
  return (
    <group position={[loc.pos[0], 0, loc.pos[1]]} rotation={[0, -rotRad(loc), 0]}>
      {Array.from({ length: floor }, (_, i) => i + 1).map((l) => (
        <mesh key={l} position={[0, (l - 1) * FH + 0.04, 0]} receiveShadow>
          <boxGeometry args={[w, 0.08, d]} />
          <meshStandardMaterial color={l === floor ? "#f1f3f5" : "#868e96"} transparent opacity={l === floor ? 1 : 0.35} />
        </mesh>
      ))}
      <mesh position={[0, y + FH / 2, 0]} raycast={() => null}>
        <boxGeometry args={[w, FH, d]} />
        <meshBasicMaterial transparent opacity={0.04} depthWrite={false} />
        <Edges color={loc.color} />
      </mesh>
      <mesh position={longX ? [0, y + 0.085, (cv - 0.5) * d] : [(cv - 0.5) * w, y + 0.085, 0]} raycast={() => null}>
        <boxGeometry args={longX ? [w * 0.98, 0.01, d * CORRIDOR_W] : [w * CORRIDOR_W, 0.01, d * 0.98]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {rooms.filter((r) => r.level === floor).map((r) => (
        <RoomMesh key={r.id} loc={loc} room={r} active={r.id === activeRoomId} selected={r.id === selectedRoomId} onPick={onRoom} />
      ))}
      {stairsVisible(loc, floor) && stairSpans(loc).map((s, i) => <Stairs key={i} loc={loc} span={s} y={y + 0.085} />)}
    </group>
  );
}