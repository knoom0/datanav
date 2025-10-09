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

  logger.info(`Getting data connector info: ${connectorId}`);

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  
  // Get the specific connector
  const connector = await catalog.getConnector(connectorId);

  if (!connector) {
    throw new APIError(`Data connector not found: ${connectorId}`, 404);
  }

  logger.info(`Found connector: ${connector.name}`);
  return NextResponse.json(connector);
}

export const GET = withAPIErrorHandler(handler);
