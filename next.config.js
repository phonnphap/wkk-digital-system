/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['face-api.js'], // ✅ ถูกต้องสำหรับ Next.js 14

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