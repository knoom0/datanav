import { NextResponse } from "next/server";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataCatalog } from "@/lib/data/catalog";
import { DataConnector } from "@/lib/data/connector";
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

  logger.info(`Connecting to data connector: ${connectorId}`);

  // Get the data source and create catalog
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  const connectorConfig = catalog.getConfig(connectorId);

  if (!connectorConfig) {
    throw new APIError(`Data connector not found: ${connectorId}`, 404);
  }

  // Create DataConnector instance from the config
  const connector = await DataConnector.create(connectorConfig, dataSource);

  // Construct the redirect URI for OAuth flow
  const url = new URL(request.url);
  const redirectTo = `${url.origin}${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`;

  // Check if this is a continuation of an auth flow
  const body = await request.json().catch(() => ({}));
  const { authCode } = body;

  let result;
  if (authCode) {
    // Continue the authentication process with the provided auth code
    logger.info(`Continuing authentication for connector: ${connectorId}`);
    result = await connector.continueToConnect({ authCode, redirectTo });
  } else {
    // Start the initial connection process
    logger.info(`Starting connection for connector: ${connectorId}`);
    result = await connector.connect({ redirectTo });
  }
  if (result.success) {
    // load tables
    await connector.load();
  }

  logger.info(`Connection result for ${connectorId}: ${JSON.stringify(result)}`);

  return NextResponse.json(result);
}

export const POST = withAPIErrorHandler(handler);
