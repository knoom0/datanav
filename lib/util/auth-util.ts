import { getConfig } from "@/lib/config";
import { APIError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Pseudo user ID used when hosting is disabled
 * Zero GUID format: 00000000-0000-0000-0000-000000000000
 */
export const PSEUDO_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Get the current user ID from Supabase authentication
 * When hosting is disabled, returns a pseudo user ID instead
 * @returns The user ID string
 * @throws APIError if user is not authenticated (only when hosting is enabled)
 */
export async function getCurrentUserId(): Promise<string> {
  const config = getConfig();
  
  // If hosting is disabled, return pseudo user ID
  if (!config.hosting.enabled) {
    return PSEUDO_USER_ID;
  }
  
  // Hosting is enabled, perform normal authentication
  const supabase = await createClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    throw new APIError(`Authentication error: ${error.message}`, 401);
  }
  
  if (!user) {
    throw new APIError("User not authenticated", 401);
  }
  
  return user.id;
}
