import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { getConfig } from "@/lib/config";
import { APIError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Pseudo user ID used when hosting is disabled
 * Zero GUID format: 00000000-0000-0000-0000-000000000000
 */
export const PSEUDO_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Get the current authenticated user from Supabase
 * Checks for JWT in Authorization header first, then falls back to cookies
 * @returns The authenticated User object
 * @throws APIError if user is not authenticated
 */
async function getCurrentUser(): Promise<User> {
  const supabase = await createClient();
  
  // Check for JWT in Authorization header
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  let jwt: string | undefined;
  
  if (authHeader?.startsWith("Bearer ")) {
    jwt = authHeader.substring(7);
  }
  
  // Get user, passing JWT if present
  const { data: { user }, error } = jwt 
    ? await supabase.auth.getUser(jwt)
    : await supabase.auth.getUser();
  
  if (error) {
    throw new APIError(`Authentication error: ${error.message}`, 401);
  }
  
  if (!user) {
    throw new APIError("User not authenticated", 401);
  }
  
  return user;
}

/**
 * Get the current user ID from Supabase authentication
 * When hosting is disabled, returns a pseudo user ID instead
 * Checks for JWT in Authorization header first, then falls back to cookies
 * @returns The user ID string
 * @throws APIError if user is not authenticated (only when hosting is enabled)
 */
export async function getCurrentUserId(): Promise<string> {
  const config = getConfig();
  
  // If hosting is disabled, return pseudo user ID
  if (!config.hosting.enabled) {
    return PSEUDO_USER_ID;
  }
  
  const user = await getCurrentUser();
  return user.id;
}

/**
 * Get the current user's email from Supabase authentication
 * When hosting is disabled, returns null (no email available)
 * Checks for JWT in Authorization header first, then falls back to cookies
 * @returns The user's email string or null
 * @throws APIError if user is not authenticated (only when hosting is enabled)
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const config = getConfig();
  
  // If hosting is disabled, no email available
  if (!config.hosting.enabled) {
    return null;
  }
  
  const user = await getCurrentUser();
  return user.email || null;
}
