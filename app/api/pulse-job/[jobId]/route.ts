import { NextRequest, NextResponse } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import { PulseJobScheduler } from "@/lib/pulse/job";
import { withAPIErrorHandler, getBaseUrl } from "@/lib/util/api-utils";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    throw new APIError("Job ID is required", 400);
  }

  // Get data source and create pulse job scheduler
  const dataSource = await getUserDataSource();
  const baseUrl = getBaseUrl(request);
  const jobScheduler = new PulseJobScheduler({ dataSource, baseUrl });

  // Get the job by ID
  const job = await jobScheduler.get({ id: jobId });

  if (!job) {
    throw new APIError(`Pulse job not found: ${jobId}`, 404);
  }

  return NextResponse.json(job);
}

export const GET = withAPIErrorHandler(handler);

