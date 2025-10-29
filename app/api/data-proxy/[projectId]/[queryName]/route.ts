import { NextResponse } from "next/server";

import { DataProxyServer } from "@/lib/data/data-proxy";
import { getUserDataSource } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler(
  request: Request,
  { params }: { params: Promise<{ projectId: string; queryName: string }> }
) {
  const { projectId, queryName } = await params;

  if (!projectId || !queryName) {
    throw new APIError("Project ID and query name are required", 400);
  }

  const dataSource = await getUserDataSource();
  const dataProxyServer = new DataProxyServer(dataSource);
  const result = await dataProxyServer.fetchData({ projectId, queryName });

  return NextResponse.json({
    rows: result
  });
}

export const POST = withAPIErrorHandler(handler); 