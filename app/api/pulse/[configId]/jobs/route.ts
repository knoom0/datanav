import { NextResponse } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import { PulseJobScheduler } from "@/lib/pulse/job";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

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

  // Get all jobs for this pulse config
  const jobs = await jobScheduler.getByConfig({ pulseConfigId: configId });

  return NextResponse.json(jobs);
}

export const GET = withAPIErrorHandler(handler);

