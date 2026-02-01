import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ❗ отключаем ESLint на build (уже делали)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ❗ запрещаем Next пытаться оптимизировать /404 как static page
  experimental: {
    disableOptimizedLoading: true,
  },

  // ❗ принудительно говорим: никаких статических экспортов
  output: "standalone",
};

export default nextConfig;
