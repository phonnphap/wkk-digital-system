"use client";

import { Html } from "@react-three/drei";
import { GATES, GateDef } from "./DecorData";

/** ประตูรั้ว: เสา 2 ต้น + บานประตูแง้มเปิด (+ ป้ายชื่อประตู) */
function Gate({ g }: { g: GateDef }) {
  const half = g.width / 2;
  const len = half * 0.85;
  const ph = g.main ? 1.5 : 1.1;
  return (
    <group position={[g.x, 0, g.z]} rotation={[0, -g.ang, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * half, 0, 0]}>
          <mesh position={[0, ph / 2, 0]} castShadow><boxGeometry args={[0.26, ph, 0.26]} /><meshStandardMaterial color="#e9ecef" /></mesh>
          <mesh position={[0, ph + 0.04, 0]}><boxGeometry args={[0.34, 0.08, 0.34]} /><meshStandardMaterial color="#be123c" /></mesh>
          <mesh position={[0, ph + 0.16, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#fbbf24" /></mesh>
          <group rotation={[0, -s * 1.35, 0]}>
            <mesh position={[-s * len / 2, 0.45, 0]} castShadow><boxGeometry args={[len, 0.55, 0.04]} /><meshStandardMaterial color="#334155" /></mesh>
            <mesh position={[-s * len / 2, 0.45, 0]}><boxGeometry args={[len, 0.05, 0.06]} /><meshStandardMaterial color="#f8fafc" /></mesh>
          </group>
        </group>
      ))}
      {g.main && (
        <mesh position={[0, ph + 0.05, 0]} castShadow>
          <boxGeometry args={[g.width, 0.36, 0.1]} /><meshStandardMaterial color="#1e3a8a" />
        </mesh>
      )}
      <Html position={[0, g.main ? ph + 0.05 : ph + 0.45, 0.12]} center distanceFactor={14} zIndexRange={[10, 0]}>
        {g.main ? (
          <div className="pointer-events-none px-2 py-0.5 rounded bg-blue-900 text-white text-[10px] font-black whitespace-nowrap">โรงเรียนวัดเขียนเขต</div>
        ) : (
          <div className="pointer-events-none px-1.5 py-0.5 rounded-md bg-white/90 text-[9px] font-black text-slate-700 shadow whitespace-nowrap">🚪 {g.name}</div>
        )}
      </Html>
    </group>
  );
}

/** ป้ายหน้าโรงเรียน — ตั้งข้างประตูหลัก ด้านนอกรั้ว */
function SchoolSign({ g }: { g: GateDef }) {
  const along: [number, number] = [Math.cos(g.ang), Math.sin(g.ang)];
  const off = g.width / 2 + 2.0;
  const x = g.x + along[0] * off + g.out[0] * 1.0;
  const z = g.z + along[1] * off + g.out[1] * 1.0;
  return (
    <group position={[x, 0, z]} rotation={[0, -g.ang, 0]}>
      {[-1.25, 1.25].map((px) => (
        <mesh key={px} position={[px, 0.45, 0]} castShadow><boxGeometry args={[0.08, 0.9, 0.08]} /><meshStandardMaterial color="#475569" /></mesh>
      ))}
      <mesh position={[0, 1.05, 0]} castShadow><boxGeometry args={[3.0, 0.9, 0.1]} /><meshStandardMaterial color="#1d4ed8" /></mesh>
      <mesh position={[0, 1.05, 0.0]}><boxGeometry args={[2.8, 0.74, 0.14]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, 0.62, 0]}><boxGeometry args={[3.0, 0.06, 0.12]} /><meshStandardMaterial color="#e11d48" /></mesh>
      <Html position={[0, 1.05, 0.12]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="pointer-events-none text-center whitespace-nowrap">
          <div className="text-[15px] font-black text-blue-900 leading-tight">โรงเรียนวัดเขียนเขต</div>
          <div className="text-[9px] font-bold text-rose-600">ยินดีต้อนรับ</div>
        </div>
      </Html>
    </group>
  );
}

export function SchoolGates() {
  const main = GATES.find((g) => g.main);
  return (
    <>
      {GATES.map((g) => <Gate key={g.id} g={g} />)}
      {main && <SchoolSign g={main} />}
    </>
  );
}