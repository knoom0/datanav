import { NextResponse } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import logger from "@/lib/logger";
import { PulseJobScheduler } from "@/lib/pulse/job";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler() {
  logger.info("Pulse job cleanup requested");

  // Get data source and create pulse job scheduler
  const dataSource = await getUserDataSource();
  const jobScheduler = new PulseJobScheduler({ dataSource });

  // Run cleanup
  const result = await jobScheduler.cleanup();

  logger.info(`Pulse job cleanup completed: checked ${result.checkedCount}, canceled ${result.canceledCount}`);

  return NextResponse.json({
    success: true,
    checkedCount: result.checkedCount,
    canceledCount: result.canceledCount,
    message: `Checked ${result.checkedCount} pulse job(s), canceled ${result.canceledCount} stale job(s)`
  });
}

export const POST = withAPIErrorHandler(handler);

