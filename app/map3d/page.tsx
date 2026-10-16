"use client";

import dynamic from "next/dynamic";

// Three.js ใช้ได้เฉพาะฝั่ง browser
const SchoolMap3D = dynamic(() => import("./SchoolMap3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">⏳ กำลังโหลดแผนที่ 3 มิติ...</div>
  ),
});

export default function Map3DPage() {
  return (
    <div className="w-screen h-screen">
      <SchoolMap3D />
    </div>
  );
}