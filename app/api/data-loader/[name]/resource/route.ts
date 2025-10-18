import { NextRequest, NextResponse } from "next/server";

import { createDataLoader } from "@/lib/data/loader/index";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  
  logger.info(`Getting resource names for data loader: ${name}`);

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

  let resourceNames: string[] = [];
  try {
    const loader = createDataLoader({
      loaderClassName: name,
      loaderConfig
    });
    resourceNames = await loader.getAvailableResourceNames();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create data loader";
    throw new APIError(errorMessage, 400);
  }

  logger.info(`Found ${resourceNames.length} resources for ${name} loader`);
  return NextResponse.json({ resourceNames });
}

export const GET = withAPIErrorHandler(getHandler);

