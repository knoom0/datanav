import { NextResponse } from "next/server";

import { DataCatalog } from "@/lib/data/catalog";
import { DataJobScheduler } from "@/lib/data/job";
import { getUserDataSource } from "@/lib/entities";
import logger from "@/lib/logger";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler() {
  logger.info("Job cleanup requested");

  // Get data source and create scheduler
  const dataSource = await getUserDataSource();
  const catalog = new DataCatalog({ dataSource });
  const scheduler = new DataJobScheduler({
    dataSource,
    getDataConnector: catalog.getConnector.bind(catalog)
  });

  // Run cleanup
  const result = await scheduler.cleanup();

  logger.info(`Job cleanup completed: checked ${result.checkedCount}, canceled ${result.canceledCount}`);

  return NextResponse.json({
    success: true,
    checkedCount: result.checkedCount,
    canceledCount: result.canceledCount,
    message: `Checked ${result.checkedCount} job(s), canceled ${result.canceledCount} stale job(s)`
  });
}

export const POST = withAPIErrorHandler(handler);

