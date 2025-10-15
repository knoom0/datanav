import { NextResponse } from "next/server";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataCatalog } from "@/lib/data/catalog";
import { DataConnector } from "@/lib/data/connector";
import { getUserDataSource } from "@/lib/data/entities";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { withAPIErrorHandler, callInternalAPI } from "@/lib/util/api-utils";

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
  logger.info(`Connection result for ${connectorId}: ${JSON.stringify(result)}`);

  // If connection was successful, trigger a data load job
  if (result.success) {
    logger.info(`Triggering data load for connected connector: ${connectorId}`);
    
    // Call the data load API to trigger the load process synchronously
    const baseUrl = new URL(request.url).origin;
    const loadResult = await callInternalAPI(baseUrl, `/api/data/${connectorId}/load`, {
      method: "POST",
    });
    
    if (loadResult.success) {
      logger.info(`Data load triggered successfully for ${connectorId}`);
      return NextResponse.json({
        ...result,
        loadingStarted: true,
        jobId: loadResult.data?.jobId
      });
    } else {
      logger.error(`Failed to trigger data load for ${connectorId}: ${loadResult.error}`);
      return NextResponse.json({
        ...result,
        loadingStarted: false,
        loadingError: loadResult.error
      });
    }
  }

  return NextResponse.json(result);
}

export const POST = withAPIErrorHandler(handler);
