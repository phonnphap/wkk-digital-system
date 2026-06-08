/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Next.js 14: ต้องอยู่ใน experimental
  experimental: {
    serverComponentsExternalPackages: ['face-api.js', '@tensorflow/tfjs-node'],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;