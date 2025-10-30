import { NextResponse, after } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { DataJobScheduler } from "@/lib/data/job";
import { getUserDataSource } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  if (!connectorId) {
    throw new APIError("Connector ID is required", 400);
  }

  logger.info(`Manual load requested for data connector: ${connectorId}`);

  // Get the data source and check connector status
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  const connector = await catalog.getConnector(connectorId);
  
  // Check connector status
  if (!(await connector.isConnected())) {
    throw new APIError(`Data connector is not connected: ${connectorId}`, 400);
  }

  // Check if already loading
  if (await connector.isLoading()) {
    throw new APIError(`Data connector is already loading: ${connectorId}`, 409);
  }

  // Create job scheduler and create a new job
  const scheduler = new DataJobScheduler({
    dataSource,
    getDataConnector: catalog.getConnector.bind(catalog)
  });

  const jobId = await scheduler.createJob({
    dataConnectorId: connectorId,
    type: "load"
  });

  logger.info(`Created job ${jobId} for connector ${connectorId}`);

  // Prepare response
  const response = NextResponse.json({
    success: true,
    jobId,
    message: `Job created successfully. Job ID: ${jobId}`
  });

  // Use after() to trigger the job after response is sent
  after(async () => {
    try {
      await scheduler.triggerJob({ id: jobId });
      logger.info(`Job ${jobId} triggered successfully`);
    } catch (error) {
      logger.error(`Failed to trigger job ${jobId}: ${error}`);
    }
  });

  return response;
}

export const POST = withAPIErrorHandler(handler);
