import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/assistant/chat",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:8080"}/api/assistant/chat`,
      },
      {
        source: "/api/assistant/speech",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:8080"}/api/assistant/speech`,
      },
    ];
  },
};

export default nextConfig;
