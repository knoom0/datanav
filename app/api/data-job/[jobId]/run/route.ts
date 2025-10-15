import { NextRequest, NextResponse, after } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { getUserDataSource } from "@/lib/data/entities";
import { DataJobScheduler } from "@/lib/data/job";
import logger from "@/lib/logger";
import { withAPIErrorHandler, callInternalAPI } from "@/lib/util/api-utils";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Run all job logic after response is sent
  after(async () => {
    // Get data source and create scheduler
    const dataSource = await getUserDataSource();
    const catalog = new DataCatalog({ dataSource });
    const scheduler = new DataJobScheduler({
      dataSource,
      getDataConnector: catalog.getConnector.bind(catalog)
    });

    // Run the job (let scheduler handle job ID validation)
    const result = await scheduler.run({ id: jobId });

    // Trigger next jobs sequentially
    for (const nextJobId of result.nextJobIds || []) {
      logger.info(`Triggering next job: ${nextJobId}`);
      await callInternalAPI({
        endpoint: `/api/data-job/${nextJobId}/run`,
        request,
        method: "POST",
      });
    }
  });

  // Return immediately
  return NextResponse.json({ jobId, status: "accepted" });
}

export const POST = withAPIErrorHandler(handler);
