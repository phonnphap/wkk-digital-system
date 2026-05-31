import "./globals.css";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบสแกนใบหน้า โรงเรียนวัดเขียนเขต",
  description: "ระบบลงเวลาทำงานและจัดการข้อมูลโรงเรียนวัดเขียนเขต",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        {/* บังคับดึง Tailwind CDN ตรงนี้เลย */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      {/* ใช้ฟอนต์มาตรฐานของระบบคอมพิวเตอร์ไปก่อนเพื่อข้ามปัญหาเรื่อง next/font */}
      <body className="antialiased font-sans select-none">
        {children}
      </body>
    </html>
  );
}