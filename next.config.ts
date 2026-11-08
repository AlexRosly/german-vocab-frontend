import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/", headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }] }];
  },
  async rewrites() {
    const configuredOrigin = process.env.API_PROXY_ORIGIN;
    if (!configuredOrigin) return [];
    if (process.env.NEXT_PUBLIC_API_URL !== "/api/v1") {
      throw new Error("API_PROXY_ORIGIN requires NEXT_PUBLIC_API_URL=/api/v1");
    }
    const origin = new URL(configuredOrigin);
    const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if ((origin.protocol !== "https:" && !localHttp) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("API_PROXY_ORIGIN must be an HTTPS origin without credentials, path, query or fragment");
    }
    return [{ source: "/api/v1/:path*", destination: `${origin.origin}/api/v1/:path*` }];
  }
};

export default nextConfig;
