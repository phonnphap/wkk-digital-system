/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ บอก Next.js ให้ใช้ webpack แทน Turbopack ชัดเจน
  experimental: {
    turbo: {},
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig