import { NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { getUserDataSource } from "@/lib/data/entities";
import { APIError } from "@/lib/errors";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  if (!connectorId) {
    throw new APIError("Connector ID is required", 400);
  }

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  
  // Get the specific connector
  const connector = await catalog.getConnectorInfo(connectorId);

  if (!connector) {
    throw new APIError(`Data connector not found: ${connectorId}`, 404);
  }

  return NextResponse.json(connector);
}

export const GET = withAPIErrorHandler(handler);
