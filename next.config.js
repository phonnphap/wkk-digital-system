/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['face-api.js', '@tensorflow/tfjs-node'],
  turbopack: {},
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