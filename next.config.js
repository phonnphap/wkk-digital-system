/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  // อนุญาตให้เว็บ Wix ของโรงเรียนฝังหน้าแผนที่ได้
  async headers() {
    return [
      {
        source: '/map3d',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://www.khienkhet.ac.th https://khienkhet.ac.th https://*.wix.com https://*.wixsite.com https://*.wixstudio.com https://*.editorx.io",
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig