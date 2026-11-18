import type { NextConfig } from "next";

const envOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['localhost', '127.0.0.1'];

const nextConfig: NextConfig = {
  // Allow LAN access for dev server (override via ALLOWED_DEV_ORIGINS in .env)
  allowedDevOrigins: envOrigins,
} as NextConfig;

export default nextConfig;
