import { NextResponse } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { PulseJobScheduler } from "@/lib/pulse/job";
import { withAPIErrorHandler, callInternalAPI } from "@/lib/util/api-utils";

async function handler(
  request: Request,
  { params }: { params: Promise<{ configId: string }> }
) {
  const { configId } = await params;

  if (!configId) {
    throw new APIError("Config ID is required", 400);
  }

  // Get data source and create pulse job scheduler
  const dataSource = await getUserDataSource();
  const jobScheduler = new PulseJobScheduler({ dataSource });

  // Create a new pulse job
  const jobId = await jobScheduler.create({ pulseConfigId: configId });

  logger.info(`Created pulse job ${jobId} for config ${configId}`);

  // Trigger the job to run
  await callInternalAPI({
    endpoint: `/api/pulse-job/${jobId}/run`,
    request,
    method: "POST",
  });

  return NextResponse.json({ jobId, status: "accepted" });
}

export const POST = withAPIErrorHandler(handler);

