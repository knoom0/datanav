import { NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { getUserDataSource } from "@/lib/data/entities";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler() {
  logger.info("Getting all data connectors");

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  
  // Get all connectors
  const connectors = await catalog.getAll();

  logger.info(`Found ${connectors.length} data connectors`);
  return NextResponse.json({ connectors });
}

export const GET = withAPIErrorHandler(handler);
