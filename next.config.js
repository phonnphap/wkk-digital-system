/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['face-api.js'],

  webpack: (config, { isServer }) => {
    // ไม่ให้ face-api.js เข้า bundle ฝั่ง Edge/Middleware เลย
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      config.externals.push('face-api.js');
    }

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