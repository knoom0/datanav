import { NextResponse } from "next/server";

import { getAvailableDataLoaderInfos } from "@/lib/data/loader/index";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function getHandler() {
  logger.info("Getting available data loaders");

  const loaders = getAvailableDataLoaderInfos();

  logger.info(`Found ${loaders.length} available data loaders`);
  return NextResponse.json({ loaders });
}

export const GET = withAPIErrorHandler(getHandler);

