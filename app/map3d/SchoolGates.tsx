"use client";

import { Html } from "@react-three/drei";
import { DecorItem, GateDef, fenceFrame } from "./DecorData";

/** ประตูรั้ว: เสา 2 ต้น + บานประตูแง้มเปิด (สีตามที่ตั้งค่า) */
function Gate({ g }: { g: GateDef }) {
  const half = g.width / 2;
  const len = half * 0.85;
  const ph = g.main ? 1.5 : 1.1;
  return (
    <group position={[g.x, 0, g.z]} rotation={[0, -g.ang, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * half, 0, 0]}>
          <mesh position={[0, ph / 2, 0]} castShadow><boxGeometry args={[0.26, ph, 0.26]} /><meshStandardMaterial color="#e9ecef" /></mesh>
          <mesh position={[0, ph + 0.04, 0]}><boxGeometry args={[0.34, 0.08, 0.34]} /><meshStandardMaterial color={g.color} /></mesh>
          <mesh position={[0, ph + 0.16, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#fbbf24" /></mesh>
          <group rotation={[0, -s * 1.35, 0]}>
            <mesh position={[-s * len / 2, 0.45, 0]} castShadow><boxGeometry args={[len, 0.55, 0.04]} /><meshStandardMaterial color="#334155" /></mesh>
            <mesh position={[-s * len / 2, 0.45, 0]}><boxGeometry args={[len, 0.05, 0.06]} /><meshStandardMaterial color={g.color} /></mesh>
          </group>
        </group>
      ))}
      <Html position={[0, ph + 0.45, 0.12]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div className="pointer-events-none px-1.5 py-0.5 rounded-md text-white text-[9px] font-black shadow whitespace-nowrap" style={{ background: g.color }}>
          🚪 {g.name}
        </div>
      </Html>
    </group>
  );
}

/** ป้ายโรงเรียน — ตั้งนอกรั้ว ณ จุดที่ใกล้พิกัดที่กำหนด */
function SchoolSign({ it }: { it: DecorItem }) {
  const f = fenceFrame(it.x, it.y);
  const W = (it.w ?? 66) / 30;
  const x = f.x + f.out[0] * 1.0, z = f.z + f.out[1] * 1.0;
  return (
    <group position={[x, 0, z]} rotation={[0, -f.ang, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 - 0.1), 0.45, 0]} castShadow><boxGeometry args={[0.08, 0.9, 0.08]} /><meshStandardMaterial color="#475569" /></mesh>
      ))}
      <mesh position={[0, 1.05, 0]} castShadow><boxGeometry args={[W, 0.9, 0.1]} /><meshStandardMaterial color="#1d4ed8" /></mesh>
      <mesh><boxGeometry args={[0.01, 0.01, 0.01]} /><meshBasicMaterial visible={false} /></mesh>
      <mesh position={[0, 1.05, 0]}><boxGeometry args={[W - 0.2, 0.74, 0.14]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, 0.62, 0]}><boxGeometry args={[W, 0.06, 0.12]} /><meshStandardMaterial color="#e11d48" /></mesh>
      <Html position={[0, 1.05, 0.12]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="pointer-events-none text-center whitespace-nowrap">
          <div className="text-[13px] font-black text-blue-900 leading-tight">{it.name || "โรงเรียนวัดเขียนเขต"}</div>
          <div className="text-[9px] font-bold text-rose-600">ยินดีต้อนรับ</div>
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