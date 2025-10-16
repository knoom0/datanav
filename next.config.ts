import type { NextConfig } from "next"

import { config as datanavConfig } from "./datanav.config"

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HOSTING_ENABLED: String(datanavConfig.hosting?.enabled ?? false),
  },
}

export default nextConfig
