import { NextRequest, NextResponse, after } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import logger from "@/lib/logger";
import { PulseJobScheduler } from "@/lib/pulse/job";
import { withAPIErrorHandler, callInternalAPI } from "@/lib/util/api-utils";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Run all job logic after response is sent
  after(async () => {
    // Get data source and create pulse job scheduler
    const dataSource = await getUserDataSource();
    const jobScheduler = new PulseJobScheduler({ dataSource });

    // Run the job
    const result = await jobScheduler.run({ id: jobId });

    // Trigger next jobs sequentially if any
    for (const nextJobId of result.nextJobIds || []) {
      logger.info(`Triggering next pulse job: ${nextJobId}`);
      await callInternalAPI({
        endpoint: `/api/pulse-job/${nextJobId}/run`,
        request,
        method: "POST",
      });
    }
  });

  // Return immediately
  return NextResponse.json({ jobId, status: "accepted" });
}

export const POST = withAPIErrorHandler(handler);

