import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['dockerode', 'ssh2'],
};

export default nextConfig;
