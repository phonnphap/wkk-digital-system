import React from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ถอดแถบ Sidebar ซ้ายสุดอันเก่าออก ให้เหลือเพียงพื้นที่หน้าจอหลักแบบเต็มร้อย
    <div className="min-h-screen bg-slate-50 antialiased">
      {children}
    </div>
  );
}