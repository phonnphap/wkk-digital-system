/** @type {import('next').NextConfig} */
const nextConfig = {
  // บอก Next.js ไม่ต้อง bundle face-api.js ฝั่ง server
  serverExternalPackages: ['face-api.js'],

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

      // ป้องกัน face-api.js ถูก bundle ในฝั่ง client ตรงๆ
      config.resolve.alias = {
        ...config.resolve.alias,
        'face-api.js': require.resolve('face-api.js'),
      };
    }
    return config;
  },
};

module.exports = nextConfig;