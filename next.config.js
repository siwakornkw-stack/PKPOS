/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // for Docker image (.next/standalone)
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // every API response is dynamic/per-request and often tenant-private; never let a shared
      // cache (CDN/proxy/browser) store it. Public API routes are dynamic too, so no-store is safe.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

module.exports = nextConfig;
