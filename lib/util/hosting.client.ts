export function isHostingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HOSTING_ENABLED === "true"
}
