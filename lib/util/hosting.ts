import { getConfig } from "@/lib/config"

export function isHostingEnabled(): boolean {
  const config = getConfig()
  return Boolean(config.hosting?.enabled)
}
