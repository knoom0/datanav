import { NextRequest, NextResponse } from "next/server";

import { createDataLoader } from "@/lib/data/loader/index";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; resourceName: string }> }
) {
  const { name, resourceName } = await params;
  
  logger.info(`Getting resource details for ${resourceName} from ${name} loader`);

  // Parse loader config from query parameters
  const searchParams = request.nextUrl.searchParams;
  const loaderConfigStr = searchParams.get("loaderConfig");
  
  if (!loaderConfigStr) {
    throw new APIError("Missing required query parameter: loaderConfig", 400);
  }

  let loaderConfig: Record<string, any>;
  try {
    loaderConfig = JSON.parse(loaderConfigStr);
  } catch {
    throw new APIError("Invalid loaderConfig JSON", 400);
  }

  let loader;
  try {
    loader = createDataLoader({
      loaderClassName: name,
      loaderConfig
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create data loader";
    throw new APIError(errorMessage, 400);
  }

  // Get detailed resource information
  let resourceInfo;
  try {
    if (!loader.getResourceInfo) {
      throw new APIError("This loader does not support resource information retrieval", 400);
    }
    resourceInfo = await loader.getResourceInfo(resourceName);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to get resource information";
    throw new APIError(errorMessage, 400);
  }

  logger.info(
    `Found ${resourceInfo.columns.length} columns for ${resourceName}, ` +
    `${resourceInfo.timestampColumns.length} timestamp columns` +
    (resourceInfo.recordCount !== undefined ? `, ${resourceInfo.recordCount} records` : "")
  );
  
  return NextResponse.json(resourceInfo);
}

export const GET = withAPIErrorHandler(getHandler);

