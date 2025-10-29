import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { getHostingDataSource, UserDatabaseConfig } from "@/lib/hosting/entities";
import logger from "@/lib/logger";
import { mintUserToken } from "@/lib/supabase/jwt";
import { withAPIErrorHandler, callInternalAPI } from "@/lib/util/api-utils";
import { PSEUDO_USER_ID } from "@/lib/util/auth-util";

const TICK_API_PATH = "/api/pulse/tick";

interface TickResult {
  success: boolean;
  userId?: string;
}

/**
 * Dispatch tick, optionally for a specific user
 */
async function tick(params: {
  userId?: string;
  request: Request;
}): Promise<TickResult> {
  const { userId, request } = params;

  try {
    const headers: Record<string, string> = {};
    
    // Mint JWT token if userId is provided
    if (userId) {
      const token = mintUserToken(userId);
      headers.Authorization = `Bearer ${token}`;
    }

    // Call tick endpoint
    await callInternalAPI({
      endpoint: TICK_API_PATH,
      request,
      method: "POST",
      headers
    });

    const logMessage = userId 
      ? `Successfully dispatched tick for user ${userId}`
      : "Successfully dispatched tick";
    logger.info(logMessage);
    
    return { success: true, userId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const logMessage = userId
      ? `Failed to dispatch tick for user ${userId}: ${errorMessage}`
      : `Failed to dispatch tick: ${errorMessage}`;
    logger.error(logMessage);
    
    return { success: false, userId };
  }
}

/**
 * Dispatch ticks to all users in parallel (multi-tenant mode)
 */
async function tickAll(request: Request): Promise<TickResult[]> {
  logger.info("Hosting is enabled, dispatching ticks for all users");

  // Get all users from hosting database
  const hostingDataSource = await getHostingDataSource();
  const userConfigs = await hostingDataSource
    .getRepository(UserDatabaseConfig)
    .find();

  // Filter out PSEUDO_USER_ID
  const realUserConfigs = userConfigs.filter(
    userConfig => userConfig.userId !== PSEUDO_USER_ID
  );

  logger.info(`Found ${realUserConfigs.length} users to dispatch ticks for (filtered out ${userConfigs.length - realUserConfigs.length} pseudo users)`);

  // Dispatch ticks in parallel
  const results = await Promise.all(
    realUserConfigs.map(userConfig =>
      tick({ userId: userConfig.userId, request })
    )
  );

  return results;
}

async function handler(request: Request) {
  const config = getConfig();

  // Dispatch ticks based on hosting mode
  const results = config.hosting.enabled
    ? await tickAll(request)
    : [await tick({ request })];

  // Calculate summary statistics
  const summary = {
    total: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    hostingEnabled: config.hosting.enabled
  };

  return NextResponse.json(summary);
}

export const GET = withAPIErrorHandler(handler);
export const POST = withAPIErrorHandler(handler);

