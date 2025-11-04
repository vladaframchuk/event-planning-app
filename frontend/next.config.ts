import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/media/**" },
      { protocol: "https", hostname: "event-planning-app.ru", port: "", pathname: "/media/**" },
      { protocol: "https", hostname: "www.event-planning-app.ru", port: "", pathname: "/media/**" },
    ],
  },
};

export default nextConfig;
