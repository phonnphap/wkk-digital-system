/** @type {import('next').NextConfig} */
const nextConfig = {
  // ไม่ต้องตั้งค่า webpack ในส่วน fallback ถ้าไม่จำเป็นจริงๆ 
  // เพราะ Next.js 14/15 จัดการเรื่องนี้ให้ดีขึ้นมากแล้ว
};

module.exports = nextConfig;