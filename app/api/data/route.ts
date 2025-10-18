import { NextRequest, NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { DataConnectorConfig, validateDataConnectorConfig } from "@/lib/data/connector";
import { getUserDataSource } from "@/lib/data/entities";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function getHandler() {
  logger.info("Getting all data connectors");

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  
  // Get all connectors
  const connectors = await catalog.getAll();

  logger.info(`Found ${connectors.length} data connectors`);
  return NextResponse.json({ connectors });
}

async function putHandler(req: NextRequest) {
  logger.info("Adding new data connector");

  // Parse the request body
  const body = await req.json();
  const config = body as DataConnectorConfig;

  // Validate required fields
  const validationError = validateDataConnectorConfig(config);
  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 400 }
    );
  }

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  
  // Add the new connector (ID will be auto-generated in catalog.addNew)
  await catalog.addNew(config);

  logger.info(`Added new data connector: ${config.id}`);
  return NextResponse.json({ success: true, connectorId: config.id });
}

export const GET = withAPIErrorHandler(getHandler);
export const PUT = withAPIErrorHandler(putHandler);
