/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 14 ใช้ชื่อนี้ (ไม่ใช่ serverExternalPackages)
    serverComponentsExternalPackages: ['face-api.js'],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        stream: false,
        buffer: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;