/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/proposals/**/*": [
      "./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ],
    "/api/integrations/google-workspace/send": [
      "./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "microphone=(), payment=(), usb=()",
          },
        ],
      },
      {
        source: "/proposal/sign/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
      {
        source: "/api/proposals/signing/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
