import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @ss/shared exporta TypeScript puro (contrato com a API).
  transpilePackages: ["@ss/shared"],
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
