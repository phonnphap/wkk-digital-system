/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // ถ้าไม่ได้เป็นการรันฝั่ง Server (เป็นฝั่ง Client หน้าบ้าน)
    if (!isServer) {
      // สั่งให้เปลี่ยนตัวแปรระบบเหล่านี้เป็นค่าว่าง เพื่อไม่ให้ face-api ฟ้องเออเร่อ
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;