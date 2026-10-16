"use client";

import * as THREE from "three";
import { Edges, Html } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { FH, MapLocation, MapRoom, isLongX, rotRad, corridorV, stairsList, CORRIDOR_W } from "./schoolData";
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
        {!dim && [-1, 1].map((s) => (
          <group key={s} position={[s * (cw / 2 - 0.08), 0, 0]}>
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.012, 0.012, 0.36, 6]} /><meshStandardMaterial color="#343a40" /></mesh>
            <mesh position={[-s * 0.03, 0.36, 0]}><boxGeometry args={[0.012, 0.12, 0.18]} /><meshStandardMaterial color="#f8f9fa" /></mesh>
          </group>
        ))}

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
  classroom: "#dbe4ff", office: "#fff3bf", library: "#d3f9d8", lab: "#e5dbff",
  toilet: "#c5f6fa", hall: "#ffe8cc", other: "#e9ecef",
};
export const TYPE_LABEL: Record<string, string> = {
  classroom: "ห้องเรียน", office: "ห้องสำนักงาน", library: "ห้องสมุด", lab: "ห้องปฏิบัติการ",
  toilet: "ห้องน้ำ", hall: "หอประชุม", other: "ห้องอื่น ๆ",
};

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
    const [tx, tz] = to(0, -sgn * (D / 2 - boardZone * 0.45));
    const [bx, bz] = to(0, -sgn * (D / 2));
    return {
      desks,
      teacher: { p: [tx, 0.16, tz] as [number, number, number], s: size(Math.min(A * 0.25, 0.22), 0.06, 0.05) },
      board: { p: [bx, 0.3, bz] as [number, number, number], s: alongX ? ([0.012, 0.16, A * 0.6] as [number, number, number]) : ([A * 0.6, 0.16, 0.012] as [number, number, number]) },
    };
  }, [deskCount, room.door, w, d, cx, cz, rw, rd]);

  const floorColor = active ? "#ffd43b" : selected ? "#ffa94d" : hover ? "#74c0fc" : TYPE_COLOR[type] ?? TYPE_COLOR.other;
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
          <mesh position={layout.teacher.p}><boxGeometry args={layout.teacher.s} /><meshStandardMaterial color="#7f5539" /></mesh>
          <mesh position={layout.board.p}><boxGeometry args={layout.board.s} /><meshStandardMaterial color="#f8f9fa" /></mesh>
        </>
      )}
      <Html position={[0, 0.62, 0]} center distanceFactor={9} zIndexRange={[15, 0]}>
        <div className="px-1.5 py-0.5 rounded bg-white/90 text-[10px] font-bold text-slate-700 whitespace-nowrap shadow pointer-events-none">
          {room.name}{deskCount ? ` · ${deskCount} โต๊ะ` : ""}
        </div>
      </Html>
    </group>
  );
}

export function IndoorBuilding({
  loc, rooms, floor, activeRoomId, selectedRoomId, onRoom,
}: {
  loc: MapLocation; rooms: MapRoom[]; floor: number;
  activeRoomId?: string; selectedRoomId?: string | null; onRoom: (r: MapRoom) => void;
}) {
  const [w, d] = loc.size;
  const stairs = stairsList(loc);
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
      {/* ทางเดิน */}
      <mesh position={longX ? [0, y + 0.085, (cv - 0.5) * d] : [(cv - 0.5) * w, y + 0.085, 0]} raycast={() => null}>
        <boxGeometry args={longX ? [w * 0.98, 0.01, d * CORRIDOR_W] : [w * CORRIDOR_W, 0.01, d * 0.98]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {rooms.filter((r) => r.level === floor).map((r) => (
        <RoomMesh key={r.id} loc={loc} room={r} active={r.id === activeRoomId} selected={r.id === selectedRoomId} onPick={onRoom} />
      ))}
      {stairs.map((st, i) => (
        <group key={i}>
          <mesh position={[(st[0] - 0.5) * w, y + 0.25, (st[1] - 0.5) * d]}>
            <boxGeometry args={[0.45, 0.35, 0.45]} />
            <meshStandardMaterial color="#fd7e14" />
          </mesh>
          <Html position={[(st[0] - 0.5) * w, y + 0.7, (st[1] - 0.5) * d]} center distanceFactor={9}>
            <div className="px-1 py-0.5 rounded bg-orange-500 text-white text-[9px] font-black pointer-events-none">บันได</div>
          </Html>
        </group>
      ))}
    </group>
  );
}