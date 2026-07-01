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
        navy: { DEFAULT: '#1B2A4A', light: '#2A3D63', dark: '#101A30' },
gold: { DEFAULT: '#C9A227', light: '#E4C765', dark: '#9C7C16' },
parchment: '#FAF6EC', parchment2: '#F1EADA',
laurel: '#2F6B4F', clay: '#B4552E', muted: '#6B7280', ink: '#1B2740',
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