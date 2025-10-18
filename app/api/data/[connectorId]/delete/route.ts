import { NextRequest, NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { getUserDataSource } from "@/lib/data/entities";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function deleteHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;
  
  logger.info(`Deleting data connector: ${connectorId}`);

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });

  // Delete the connector (will throw error if bundled)
  await catalog.delete(connectorId);

  logger.info(`Successfully deleted data connector: ${connectorId}`);
  return NextResponse.json({ success: true });
}

export const DELETE = withAPIErrorHandler(deleteHandler);

