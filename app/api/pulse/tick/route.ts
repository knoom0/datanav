import { NextResponse } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import logger from "@/lib/logger";
import { PulseManager } from "@/lib/pulse/manager";
import { withAPIErrorHandler, callInternalAPI } from "@/lib/util/api-utils";

/**
 * Checks if a pulse should be triggered based on its nextRunAt time
 */
function shouldTriggerPulse(params: {
  nextRunAt: Date | null;
  currentTime?: Date;
}): boolean {
  const { nextRunAt, currentTime = new Date() } = params;

  // If nextRunAt is null, it should be triggered (first run)
  if (!nextRunAt) {
    return true;
  }

  // If nextRunAt is in the past or now, it should be triggered
  return nextRunAt <= currentTime;
}

async function handler(request: Request) {
  const dataSource = await getUserDataSource();
  const pulseManager = new PulseManager({ dataSource });

  // Get all enabled pulse configs
  const allConfigs = await pulseManager.listConfigs();
  const enabledConfigs = allConfigs.filter(c => c.enabled);

  logger.info(`Checking ${enabledConfigs.length} enabled pulse configs for triggering`);

  const triggeredConfigs: string[] = [];
  const skippedConfigs: string[] = [];

  // Check each config and trigger if needed
  for (const config of enabledConfigs) {
    const shouldTrigger = shouldTriggerPulse({ nextRunAt: config.nextRunAt });

    if (shouldTrigger) {
      try {
        // Call the publish endpoint for this specific pulse config
        await callInternalAPI({
          endpoint: `/api/pulse/${config.id}/publish`,
          request,
          method: "POST",
        });

        // Update nextRunAt based on cron expression
        const updatedConfig = await pulseManager.updateNextRunTime({
          id: config.id
        });

        logger.info(`Triggered pulse ${config.id} (${config.name}), next run at ${updatedConfig.nextRunAt?.toISOString()}`);
        triggeredConfigs.push(config.id);
      } catch (error) {
        logger.error(`Failed to trigger pulse ${config.id}: ${error}`);
      }
    } else {
      skippedConfigs.push(config.id);
      logger.debug(`Skipped pulse ${config.id} (${config.name}), next run at ${config.nextRunAt?.toISOString()}`);
    }
  }

  return NextResponse.json({
    checked: enabledConfigs.length,
    triggered: triggeredConfigs.length,
    skipped: skippedConfigs.length,
    triggeredConfigs,
  });
}

export const POST = withAPIErrorHandler(handler);
