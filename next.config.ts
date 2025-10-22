import path from "path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias["next-intl"] = path.resolve(__dirname, "lib/next-intl");

    return config;
  },
};

export default nextConfig;
