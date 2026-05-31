import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        // เพิ่มวงเล็บปิดของ extend และ theme ให้ถูกต้อง
        sans: ['"TH Saraban New"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;