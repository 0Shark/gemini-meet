import type { NextConfig } from "next";
import dotenv from 'dotenv';
import path from 'path';

// Load env from parent directory (root of gemini-meet)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const nextConfig: NextConfig = {
  serverExternalPackages: ['dockerode', 'ssh2'],
};

export default nextConfig;
