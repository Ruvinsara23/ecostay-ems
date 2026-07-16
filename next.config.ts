import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin must be loaded from node_modules at runtime, not bundled into the
  // serverless function. Bundling drops its lazy internal require()s from the Vercel
  // file trace, so every API route that uses the Admin SDK throws at cold start (a 500
  // before any handler code runs) — while local `next start` works because node_modules
  // is fully on disk. Externalizing it keeps the whole package in the function.
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
