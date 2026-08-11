import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up and finds an
  // unrelated package-lock.json in the home directory.
  turbopack: { root: __dirname },
};

export default nextConfig;
