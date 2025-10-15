import { NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { getUserDataSource } from "@/lib/data/entities";
import { DataJobScheduler } from "@/lib/data/job";
import { APIError } from "@/lib/errors";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    throw new APIError("Job ID is required", 400);
  }

  // Get data source and create scheduler
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  const scheduler = new DataJobScheduler({
    dataSource,
    getDataConnector: catalog.getConnector.bind(catalog)
  });

  // Get the job by ID
  const job = await scheduler.get({ id: jobId });

  if (!job) {
    throw new APIError(`Job not found: ${jobId}`, 404);
  }

  return NextResponse.json(job);
}

export const GET = withAPIErrorHandler(handler);
