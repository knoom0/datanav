import { NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { DataConnector } from "@/lib/data/connector";
import { getUserDataSource, DataConnectorStatusEntity } from "@/lib/data/entities";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";
import { safeErrorString } from "@/lib/util/log-util";

async function handler(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  if (!connectorId) {
    throw new APIError("Connector ID is required", 400);
  }

  logger.info(`Manual load requested for data connector: ${connectorId}`);

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  const connectorConfig = catalog.getConfig(connectorId);

  if (!connectorConfig) {
    throw new APIError(`Data connector not found: ${connectorId}`, 404);
  }

  // Check if connector is connected
  const statusRepo = dataSource.getRepository(DataConnectorStatusEntity);
  const status = await statusRepo.findOne({
    where: { connectorId }
  });

  if (!status?.isConnected) {
    throw new APIError(`Data connector is not connected: ${connectorId}`, 400);
  }

  // Check if already loading
  if (status.isLoading) {
    throw new APIError(`Data connector is already loading: ${connectorId}`, 409);
  }

  try {
    // Set loading state
    await statusRepo.update(
      { connectorId },
      { isLoading: true }
    );

    // Create DataConnector instance and load data
    const connector = await DataConnector.create(connectorConfig, dataSource);
    logger.info(`Starting manual data load for connector: ${connectorId}`);
    
    const loadResult = await connector.load();
    
    logger.info(`Manual load completed for ${connectorId}: ${loadResult.updatedRecordCount} records updated`);

    return NextResponse.json({
      success: true,
      updatedRecordCount: loadResult.updatedRecordCount,
      message: `Successfully loaded ${loadResult.updatedRecordCount} records`
    });

  } catch (error) {
    logger.error(`Manual load failed for ${connectorId}: ${safeErrorString(error)}`);
    
    // Make sure to clear loading state on error
    await statusRepo.update(
      { connectorId },
      { 
        isLoading: false,
        lastError: error instanceof Error ? error.message : "Unknown error"
      }
    );

    throw new APIError(
      `Failed to load data: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  } finally {
    // Always clear loading state
    await statusRepo.update(
      { connectorId },
      { isLoading: false }
    );
  }
}

export const POST = withAPIErrorHandler(handler);
