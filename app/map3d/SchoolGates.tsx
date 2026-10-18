"use client";

import { Html } from "@react-three/drei";
import { DecorItem, GateDef, fenceFrame } from "./DecorData";

/** ประตูรั้ว: เสา 2 ต้น + บาน (เปิด 2 บาน / 1 บาน / เลื่อน, ปิดหรือเปิด, ความสูงตั้งค่าได้) */
function Gate({ g }: { g: GateDef }) {
  const half = g.width / 2;
  const ph = g.h ?? (g.main ? 1.5 : 1.1);
  const leafH = Math.max(0.25, ph * 0.5);
  const leafY = leafH / 2 + 0.15;
  const clear = half - 0.13;                    // ช่องเปิดระหว่างเสา (ครึ่งหนึ่ง)
  const dark = "#334155";
  const Leaf = ({ len, x }: { len: number; x: number }) => (
    <>
      <mesh position={[x, leafY, 0]} castShadow><boxGeometry args={[len, leafH, 0.04]} /><meshStandardMaterial color={dark} /></mesh>
      <mesh position={[x, leafY, 0]}><boxGeometry args={[len, 0.05, 0.06]} /><meshStandardMaterial color={g.color} /></mesh>
    </>
  );
  return (
    <group position={[g.x, 0, g.z]} rotation={[0, -g.ang, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * half, 0, 0]}>
          <mesh position={[0, ph / 2, 0]} castShadow><boxGeometry args={[0.26, ph, 0.26]} /><meshStandardMaterial color="#e9ecef" /></mesh>
          <mesh position={[0, ph + 0.04, 0]}><boxGeometry args={[0.34, 0.08, 0.34]} /><meshStandardMaterial color={g.color} /></mesh>
          <mesh position={[0, ph + 0.16, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#fbbf24" /></mesh>
        </group>
      ))}
      {g.mode === "double" && [-1, 1].map((s) => (
        <group key={s} position={[s * (half - 0.13), 0, 0]} rotation={[0, g.closed ? 0 : -s * 1.35, 0]}>
          <Leaf len={clear} x={-s * clear / 2} />
        </group>
      ))}
      {g.mode === "single" && (
        <group position={[-(half - 0.13), 0, 0]} rotation={[0, g.closed ? 0 : -1.35, 0]}>
          <Leaf len={clear * 2} x={clear} />
        </group>
      )}
      {g.mode === "slide" && (
        <>
          <mesh position={[0, 0.02, 0.1]}><boxGeometry args={[g.width * 2.2, 0.03, 0.05]} /><meshStandardMaterial color="#6b7280" /></mesh>
          <group position={[g.closed ? 0 : half + clear + 0.05, 0, 0.1]}>
            <Leaf len={clear * 2} x={0} />
          </group>
        </>
      )}
      <Html position={[0, ph + 0.45, 0.12]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div className="pointer-events-none px-1.5 py-0.5 rounded-md text-white text-[9px] font-black shadow whitespace-nowrap" style={{ background: g.color }}>
          {g.ped ? "🚶" : "🚪"} {g.name}
        </div>
      </Html>
    </group>
  );
}

/** ป้ายโรงเรียน — ป้ายสั้นไม่มีเสา ติดแนบรั้วด้านนอก */
function SchoolSign({ it }: { it: DecorItem }) {
  const f = fenceFrame(it.x, it.y);
  const W = (it.w ?? 42) / 30, H = 0.4;
  const x = f.x + f.out[0] * 0.07, z = f.z + f.out[1] * 0.07;
  return (
    <group position={[x, 0, z]} rotation={[0, -f.ang, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[W, H, 0.05]} /><meshStandardMaterial color="#1d4ed8" /></mesh>
      <mesh position={[0, 0.42, 0]}><boxGeometry args={[W - 0.08, H - 0.08, 0.07]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[W, 0.03, 0.08]} /><meshStandardMaterial color="#e11d48" /></mesh>
      <Html position={[0, 0.43, 0.06]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="pointer-events-none text-center whitespace-nowrap">
          <div className="font-black text-blue-900 leading-tight" style={{ fontSize: `${11 * (it.s ?? 1)}px` }}>{it.name || "โรงเรียนวัดเขียนเขต"}</div>
          <div className="font-bold text-rose-600" style={{ fontSize: `${8 * (it.s ?? 1)}px` }}>ยินดีต้อนรับ</div>
        </div>
      </Html>
    </group>
  );
}

export function SchoolGates({ gates, signs }: { gates: GateDef[]; signs: DecorItem[] }) {
  return (
    <>
      {gates.map((g) => <Gate key={g.id} g={g} />)}
      {signs.map((s) => <SchoolSign key={s.id} it={s} />)}
    </>
  );
}