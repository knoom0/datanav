import { getConfig } from "@/lib/config";
import { HOSTING_ENABLED_COOKIE } from "@/lib/consts";

export function isHostingEnabled(): boolean {
  // Check if running on client-side
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    // Client-side: read from cookie set by middleware
    const cookies = document.cookie;
    const hostingCookie = cookies
      .split("; ")
      .find(row => row.startsWith(`${HOSTING_ENABLED_COOKIE}=`));
    const hostingEnabled = hostingCookie?.split("=")[1] === "true";
    return hostingEnabled;
  }
  
  // Server-side: read from config
  const config = getConfig();
  return Boolean(config.hosting?.enabled);
}
