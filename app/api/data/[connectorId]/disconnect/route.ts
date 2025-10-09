import { NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { getUserDataSource } from "@/lib/data/entities";
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

  logger.info(`Disconnecting data connector: ${connectorId}`);

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  
  // Get the specific connector to verify it exists
  const connector = await catalog.getConnector(connectorId);

  if (!connector) {
    throw new APIError(`Data connector not found: ${connectorId}`, 404);
  }

  // Disconnect the connector (this will clear all data and reset connection)
  await catalog.disconnect(connectorId);

  logger.info(`Successfully disconnected connector: ${connector.name}`);

  return NextResponse.json({ 
    success: true, 
    message: "Connector disconnected and all data cleared" 
  });
}

export const POST = withAPIErrorHandler(handler);
